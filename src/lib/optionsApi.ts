/**
 * ChartMate Options API client (E2E path).
 *
 * End-to-end flow when `VITE_OPTIONS_API_URL` is set:
 *   Browser → FastAPI (JWT) → OpenAlgo → your connected broker
 *
 * Chain, expiry, orders, positions, and strategy signals go through this base URL.
 * Strategy CRUD (`options_strategies`) stays on Supabase (same account as always).
 *
 * No fallback is used for options execution paths.
 * If `VITE_OPTIONS_API_URL` is missing, calls throw explicitly.
 */
import { supabase } from "@/integrations/supabase/client";

const API_BASE = (import.meta.env.VITE_OPTIONS_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** True when the app should call the hosted FastAPI service for options (full E2E). */
export function isOptionsApiConfigured(): boolean {
  return API_BASE.length > 0;
}

export function getOptionsApiBaseUrl(): string {
  return API_BASE;
}

/** Get the current Supabase session JWT for authenticating FastAPI requests. */
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** Low-level fetch wrapper for the FastAPI service. */
async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_BASE) throw new Error("Options API URL not configured (VITE_OPTIONS_API_URL)");
  const token = await getToken();
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Option chain shape (matches Supabase edge + OptionChainViewer) ───────────

type ChainLeg = {
  ltp: number;
  oi: number;
  oi_change: number;
  iv: number;
  delta: number;
  theta: number;
  symbol: string;
};

function mapChainLeg(o: Record<string, unknown> | null | undefined): ChainLeg | null {
  if (!o || typeof o !== "object") return null;
  return {
    ltp: Number(o.ltp ?? o.lastPrice ?? 0),
    oi: Number(o.oi ?? o.openInterest ?? 0),
    oi_change: Number(o.oi_change ?? o.changeinOpenInterest ?? 0),
    iv: Number(o.iv ?? o.impliedVolatility ?? 0),
    delta: Number(o.delta ?? 0),
    theta: Number(o.theta ?? 0),
    symbol: String(o.symbol ?? o.tradingSymbol ?? ""),
  };
}

/** Normalize OpenAlgo /optionchain JSON into the shape OptionChainViewer expects. */
export function normalizeOptionChainPayload(
  data: unknown,
  symbol: string,
  exchange: string,
  expiryFallback: string
): {
  atm_strike: number;
  underlying_ltp: number;
  expiry_date: string;
  symbol: string;
  exchange: string;
  strikes: { strike: number; ce: ChainLeg | null; pe: ChainLeg | null }[];
} {
  const root = (data as Record<string, unknown>)?.data ?? data;
  const r = root as Record<string, unknown>;

  if (Array.isArray(r.strikes)) {
    return {
      atm_strike: Number(r.atm_strike ?? 0),
      underlying_ltp: Number(r.underlying_ltp ?? r.ltp ?? 0),
      expiry_date: String(r.expiry_date ?? r.expiry ?? expiryFallback),
      symbol,
      exchange,
      strikes: r.strikes.map((row: unknown) => {
        const x = row as Record<string, unknown>;
        return {
          strike: Number(x.strike ?? 0),
          ce: mapChainLeg(x.ce as Record<string, unknown>),
          pe: mapChainLeg(x.pe as Record<string, unknown>),
        };
      }),
    };
  }

  const strikeMap = new Map<number, { ce: ChainLeg | null; pe: ChainLeg | null }>();
  const calls: unknown[] = Array.isArray(r.calls) ? r.calls : Array.isArray(r.CE) ? (r.CE as unknown[]) : [];
  const puts: unknown[] = Array.isArray(r.puts) ? r.puts : Array.isArray(r.PE) ? (r.PE as unknown[]) : [];

  for (const c of calls) {
    const item = c as Record<string, unknown>;
    const strike = Number(item.strike ?? item.strikePrice ?? 0);
    if (!strike) continue;
    const existing = strikeMap.get(strike) ?? { ce: null, pe: null };
    existing.ce = mapChainLeg(item);
    strikeMap.set(strike, existing);
  }
  for (const p of puts) {
    const item = p as Record<string, unknown>;
    const strike = Number(item.strike ?? item.strikePrice ?? 0);
    if (!strike) continue;
    const existing = strikeMap.get(strike) ?? { ce: null, pe: null };
    existing.pe = mapChainLeg(item);
    strikeMap.set(strike, existing);
  }

  const chainArr = Array.isArray(r.chain) ? r.chain : [];
  for (const row of chainArr) {
    const x = row as Record<string, unknown>;
    const strike = Number(x.strike ?? 0);
    if (!strike) continue;
    strikeMap.set(strike, {
      ce: mapChainLeg(x.ce as Record<string, unknown>),
      pe: mapChainLeg(x.pe as Record<string, unknown>),
    });
  }

  const strikes = Array.from(strikeMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([strike, legs]) => ({ strike, ce: legs.ce, pe: legs.pe }));

  return {
    atm_strike: Number(r.atm_strike ?? r.atmstrike ?? 0),
    underlying_ltp: Number(r.underlying_ltp ?? r.ltp ?? 0),
    expiry_date: String(r.expiry_date ?? r.expiry ?? expiryFallback),
    symbol,
    exchange,
    strikes,
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export interface NormalizedExpiryItem {
  date: string;
  display: string;
  tag: "weekly" | "monthly" | "next_weekly" | "far";
  days_to_expiry: number;
}

/** Match fetch-expiry-dates edge function output for OptionChainViewer. */
export function normalizeExpiryPayload(
  data: unknown,
  symbol: string,
  exchange: string
): { symbol: string; exchange: string; expiries: NormalizedExpiryItem[] } {
  const raw = data as Record<string, unknown>;
  const rawDates: string[] = Array.isArray(raw?.data)
    ? (raw.data as string[])
    : Array.isArray(data)
      ? (data as string[])
      : [];
  const now = new Date();
  const parsed = rawDates
    .map((ds) => {
      let d: Date | null = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) d = new Date(`${ds}T00:00:00+05:30`);
      else if (/^\d{2}-[A-Za-z]+-\d{4}$/.test(ds)) d = new Date(ds.replace(/-/g, " ") + " 00:00:00 GMT+0530");
      else d = new Date(ds);
      if (isNaN(d.getTime())) return null;
      return d;
    })
    .filter((d): d is Date => d !== null && d > now)
    .sort((a, b) => a.getTime() - b.getTime());

  const expiries: NormalizedExpiryItem[] = parsed.map((d, idx) => {
    const dayN = daysBetween(now, d);
    let tag: NormalizedExpiryItem["tag"];
    if (idx === 0) tag = "weekly";
    else if (idx === 1) tag = dayN <= 14 ? "next_weekly" : "monthly";
    else if (dayN <= 35) tag = "monthly";
    else tag = "far";
    return {
      date: toISODate(d),
      display: formatDisplay(d),
      tag,
      days_to_expiry: dayN,
    };
  });

  return { symbol, exchange, expiries };
}

// ── Option Chain ──────────────────────────────────────────────────────────────

export async function fetchOptionChain(params: {
  underlying: string;
  exchange?: string;
  expiry_date: string;
  strike_count?: number;
}) {
  const ex = params.exchange ?? "NSE_INDEX";
  const sym = params.underlying;
  const raw = await apiFetch<unknown>("/api/options/chain", {
    method: "POST",
    body: JSON.stringify({
      underlying: sym,
      exchange: ex,
      expiry_date: params.expiry_date,
      strike_count: params.strike_count,
    }),
  });
  return normalizeOptionChainPayload(raw, sym, ex, params.expiry_date);
}

export async function fetchExpiryDates(params: {
  symbol: string;
  exchange?: string;
  instrument?: string;
}) {
  const ex = params.exchange ?? "NFO";
  const sym = params.symbol;
  const raw = await apiFetch<unknown>("/api/options/expiry", {
    method: "POST",
    body: JSON.stringify({
      symbol: sym,
      exchange: ex,
      instrument: params.instrument ?? "OPTIDX",
    }),
  });
  return normalizeExpiryPayload(raw, sym, ex);
}

export async function fetchVix(): Promise<number> {
  const res = await apiFetch<{ vix: number }>("/api/options/vix");
  return res.vix;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function placeOptionsOrder(params: {
  underlying: string;
  exchange?: string;
  expiry_date: string;
  offset?: string;
  option_type: "CE" | "PE";
  action: "BUY" | "SELL";
  quantity: number;
  is_paper?: boolean;
  strategy_id?: string;
}) {
  return apiFetch("/api/options/orders/place", {
    method: "POST",
    body: JSON.stringify({
      underlying:  params.underlying,
      exchange:    params.exchange ?? "NSE_INDEX",
      expiry_date: params.expiry_date,
      offset:      params.offset ?? "ATM",
      option_type: params.option_type,
      action:      params.action,
      quantity:    params.quantity,
      is_paper:    params.is_paper ?? true,
      strategy_id: params.strategy_id,
    }),
  });
}

export async function closeOptionsPosition(tradeId: string, reason = "manual") {
  return apiFetch("/api/options/orders/close", {
    method: "POST",
    body: JSON.stringify({ trade_id: tradeId, reason }),
  });
}

// ── Strategy Signals ──────────────────────────────────────────────────────────

export type StrategyType =
  | "iron_condor"
  | "strangle"
  | "bull_put_spread"
  | "jade_lizard"
  | "orb_buying";

export async function generateStrategySignal(
  strategy_type: StrategyType,
  params: Record<string, unknown>
) {
  if (!API_BASE) throw new Error("Options API URL not configured (VITE_OPTIONS_API_URL)");
  return apiFetch("/api/options/strategies/signal", {
    method: "POST",
    body: JSON.stringify({ strategy_type, params }),
  });
}

export async function executeStrategy(
  strategy_type: StrategyType,
  params: Record<string, unknown>,
  is_paper = true,
  strategy_id?: string
) {
  if (!API_BASE) throw new Error("Options API URL not configured");
  const qs = new URLSearchParams({
    is_paper: String(is_paper),
    ...(strategy_id ? { strategy_id } : {}),
  });
  return apiFetch(`/api/options/strategies/execute?${qs}`, {
    method: "POST",
    body: JSON.stringify({ strategy_type, params }),
  });
}

// ── Live Positions ────────────────────────────────────────────────────────────

/** Shape returned by GET /api/options/positions/ (normalized for React). */
export interface OptionsPositionRow {
  id: string;
  symbol: string;
  action: string;
  status: string;
  is_paper_trade: boolean;
  options_strategy_id: string | null;
  underlying: string | null;
  option_type: string | null;
  expiry_date: string | null;
  strike_offset: string | null;
  entry_premium: number | null;
  peak_premium: number | null;
  current_price: number | null;
  shares: number;
  entry_time: string;
  options_symbol: string | null;
  strategy_name?: string;
}

function mapApiPositionToRow(p: Record<string, unknown>): OptionsPositionRow {
  const entry = Number(p.entry_price ?? 0);
  const current = Number(p.current_ltp ?? entry);
  return {
    id: String(p.trade_id ?? ""),
    symbol: String(p.symbol ?? ""),
    action: String(p.action ?? "BUY"),
    status: String(p.status ?? "active"),
    is_paper_trade: Boolean(p.is_paper_trade ?? true),
    options_strategy_id: p.options_strategy_id != null ? String(p.options_strategy_id) : null,
    underlying: p.underlying != null ? String(p.underlying) : null,
    option_type: p.option_type != null ? String(p.option_type) : null,
    expiry_date: p.expiry_date != null ? String(p.expiry_date) : null,
    strike_offset: p.strike_offset != null ? String(p.strike_offset) : null,
    entry_premium: entry,
    peak_premium: p.peak_premium != null ? Number(p.peak_premium) : entry,
    current_price: current,
    shares: Math.max(1, Number(p.shares ?? 1)),
    entry_time: "",
    options_symbol: p.options_symbol != null ? String(p.options_symbol) : String(p.symbol ?? ""),
    strategy_name: p.strategy_name != null ? String(p.strategy_name) : undefined,
  };
}

export async function fetchLivePositions(): Promise<{
  positions: OptionsPositionRow[];
  total_pnl: number;
}> {
  const raw = await apiFetch<{ positions: Record<string, unknown>[]; total_pnl: number }>(
    "/api/options/positions/"
  );
  return {
    positions: (raw.positions ?? []).map(mapApiPositionToRow),
    total_pnl: raw.total_pnl ?? 0,
  };
}

// ── WebSocket for real-time P&L ───────────────────────────────────────────────

export function createPositionsWebSocket(
  userId: string,
  token: string,
  onMessage: (positions: unknown[]) => void,
  onError?: (e: Event) => void
): WebSocket | null {
  if (!API_BASE) return null;

  const wsBase = API_BASE.replace(/^http/, "ws");
  const ws     = new WebSocket(`${wsBase}/ws/options/positions/${userId}?token=${token}`);

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "positions") onMessage(msg.data);
    } catch { /* ignore parse errors */ }
  };
  ws.onerror = onError ?? null;
  return ws;
}

export function createOptionChainWebSocket(
  token: string,
  params: { underlying: string; exchange: string; expiry_date: string },
  onMessage: (data: unknown) => void,
  onError?: (e: Event) => void
): WebSocket {
  if (!API_BASE) throw new Error("Options API URL not configured (VITE_OPTIONS_API_URL)");
  const wsBase = API_BASE.replace(/^http/, "ws");
  const q = new URLSearchParams({
    token,
    underlying: params.underlying,
    exchange: params.exchange,
    expiry_date: params.expiry_date,
  });
  const ws = new WebSocket(`${wsBase}/ws/options/chain?${q.toString()}`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "chain") onMessage(msg.data);
    } catch {
      // ignore parse errors
    }
  };
  ws.onerror = onError ?? null;
  return ws;
}
