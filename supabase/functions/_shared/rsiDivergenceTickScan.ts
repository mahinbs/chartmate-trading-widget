/**
 * Shared: RSI divergence on a single symbol — used by stream-conditional-tick (every LTP tick,
 * throttled) and optionally by rsi-divergence-scanner batch jobs.
 */
import { detectRsiDivergenceHits } from "./algoGuideDetectors.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

/** Normalize like stream-conditional-tick */
export function normalizeBaseSymbol(s: string): string {
  let x = String(s ?? "").trim().toUpperCase();
  for (const suf of [".NS", ".BO", "-EQ", "-BE", "-BL"]) {
    if (x.endsWith(suf)) x = x.slice(0, -suf.length);
  }
  return x;
}

export async function fetchYahoo1hBars(
  symbol: string,
  lookbackHours = 200,
): Promise<{ c: number[]; h: number[]; l: number[]; t: number[] } | null> {
  try {
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - lookbackHours * 3600;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1h`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp as number[] | undefined;
    const quotes = result?.indicators?.quote?.[0];
    if (!timestamps || !quotes) return null;
    const c: number[] = [];
    const h: number[] = [];
    const l: number[] = [];
    const t: number[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const cl = Number(quotes.close?.[i]);
      const hi = Number(quotes.high?.[i]);
      const lo = Number(quotes.low?.[i]);
      const ts = Number(timestamps[i]);
      if (!Number.isFinite(cl) || !Number.isFinite(hi) || !Number.isFinite(lo)) continue;
      c.push(cl);
      h.push(hi);
      l.push(lo);
      t.push(ts);
    }
    if (c.length < 30) return null;
    return { c, h, l, t };
  } catch {
    return null;
  }
}

/** In-memory throttle per warm isolate (tick path); max ~1 Yahoo pull per second per symbol */
const lastTickYahooAt = new Map<string, number>();
const TICK_MIN_MS = 1000;

function inferExchangeProduct(yahooSym: string): { exchange: string; product: string } {
  const u = yahooSym.toUpperCase();
  if (u.includes("-USD") || u.includes("-USDT")) return { exchange: "CRYPTO", product: "SPOT" };
  if (u.endsWith("=X")) return { exchange: "FX", product: "MIS" };
  if (u.endsWith(".NS")) return { exchange: "NSE", product: "MIS" };
  if (u.endsWith(".BO")) return { exchange: "BSE", product: "MIS" };
  return { exchange: "US", product: "MIS" };
}

/**
 * On each LTP tick for `baseSymbol` (e.g. RELIANCE, BTC-USD base), run RSI divergence on 1H
 * for every rsi_divergence strategy whose universe lists a matching Yahoo symbol.
 * Ignores execution_days and weekends — crypto and FX run 24/7.
 */
export async function runRsiDivergenceTickScan(
  supabase: SupabaseLike,
  baseSymbol: string,
): Promise<{ created: number; skipped?: string }> {
  const base = normalizeBaseSymbol(baseSymbol);
  if (!base) return { created: 0, skipped: "empty_symbol" };

  const now = Date.now();
  const last = lastTickYahooAt.get(base) ?? 0;
  if (now - last < TICK_MIN_MS) {
    return { created: 0, skipped: "throttle_1s" };
  }

  const { data: strategies, error } = await supabase
    .from("user_strategies")
    .select(
      "id, user_id, name, position_config, stop_loss_pct, take_profit_pct, risk_per_trade_pct, market_type",
    )
    .filter("entry_conditions->>algoGuidePreset", "eq", "rsi_divergence");

  if (error || !strategies?.length) return { created: 0, skipped: "no_strategies" };

  let created = 0;
  let anyFetch = false;

  for (const strategy of strategies) {
    const posCfg = strategy.position_config && typeof strategy.position_config === "object"
      ? strategy.position_config as Record<string, unknown>
      : {};
    const universe: string[] = Array.isArray(posCfg.stockUniverse) && posCfg.stockUniverse.length > 0
      ? (posCfg.stockUniverse as string[])
      : [];

    const yahooSym = universe.find((u) => normalizeBaseSymbol(u) === base);
    if (!yahooSym) continue;

    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { data: existingPending } = await supabase
      .from("pending_conditional_orders")
      .select("symbol")
      .eq("strategy_id", strategy.id)
      .eq("user_id", strategy.user_id)
      .in("status", ["pending", "monitoring"])
      .gte("created_at", `${todayStr}T00:00:00Z`);

    const pendingSet = new Set(
      (existingPending ?? []).map((r: { symbol: string }) => String(r.symbol ?? "").toUpperCase()),
    );
    let symUpper = yahooSym.toUpperCase();
    if (symUpper.endsWith(".NS")) symUpper = symUpper.slice(0, -3);
    else if (symUpper.endsWith(".BO")) symUpper = symUpper.slice(0, -3);
    if (pendingSet.has(symUpper) || pendingSet.has(yahooSym.toUpperCase())) continue;

    anyFetch = true;
    const ohlcv = await fetchYahoo1hBars(yahooSym, 200);
    if (!ohlcv) continue;

    const hits = detectRsiDivergenceHits(ohlcv.c, ohlcv.h, ohlcv.l, undefined);
    if (hits.length === 0) continue;

    const latestHit = hits[hits.length - 1];
    const hitTimeSec = ohlcv.t[latestHit.i] ?? 0;
    const ageHours = (Date.now() / 1000 - hitTimeSec) / 3600;
    if (ageHours > 3) continue;

    const entryPrice = ohlcv.c[latestHit.i];
    const swingPoint = Number(latestHit.meta?.rsiSwingPoint ?? 0);
    const priorSwing = Number(latestHit.meta?.rsiPriorSwing ?? 0);
    const slPct = Number(strategy.stop_loss_pct ?? 1) / 100;
    const isBuy = latestHit.side === "BUY";
    const slPrice = Number.isFinite(swingPoint) && swingPoint > 0
      ? swingPoint
      : isBuy ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct);
    const slDist = Math.abs(entryPrice - slPrice);
    const tpPrice = Number.isFinite(priorSwing) && priorSwing > 0
      ? priorSwing
      : isBuy ? entryPrice + 3 * slDist : entryPrice - 3 * slDist;
    const riskPct = Number(strategy.risk_per_trade_pct ?? 1) / 100;
    const capitalGuess = 100000;
    const riskAmount = capitalGuess * riskPct;
    const quantity = slDist > 0 ? Math.max(1, Math.round(riskAmount / slDist)) : 1;

    const { exchange, product } = inferExchangeProduct(yahooSym);

    const { error: insErr } = await supabase.from("pending_conditional_orders").insert({
      user_id: strategy.user_id,
      strategy_id: strategy.id,
      symbol: symUpper,
      exchange,
      action: latestHit.side,
      quantity,
      product,
      status: "pending",
      paper_strategy_type: "mean_reversion",
      is_paper_trade: true,
      notes: JSON.stringify({
        source: "rsi_divergence_tick",
        yahooSymbol: yahooSym,
        scannedAt: new Date().toISOString(),
        hitBar: latestHit.i,
        entryPrice,
        stopLossPrice: Math.round(slPrice * 100) / 100,
        takeProfitPrice: Math.round(tpPrice * 100) / 100,
        ageHours: Math.round(ageHours * 10) / 10,
        rsiSwingPoint: swingPoint,
        rsiPriorSwing: priorSwing,
      }),
    });

    if (!insErr) created++;
  }

  if (anyFetch) lastTickYahooAt.set(base, now);
  return { created };
}
