/**
 * backtest-options-strategy — Supabase Edge Function
 *
 * Simulates an ORB-based options strategy against historical 5-minute OHLCV data
 * of the underlying (fetched from OpenAlgo history API).
 *
 * The simulation replicates the exact logic from chartmate-monitor/monitor.py:
 *   • 09:15–09:30  build ORB range from 5m bars
 *   • 09:30        lock ORB; validate min/max range %
 *   • 09:30–15:14  watch for breakout + momentum (N consecutive bars in direction)
 *   • Entry        record entry_premium ≈ 3% of underlying price (ATM proxy)
 *   • Exit         SL %, TP %, trailing SL, hard time exit (15:15 default)
 *   • Expiry guard skip entries on the expiry day (weekday of the chosen expiry)
 *
 * Request body:
 *   {
 *     strategy_id?: string       // if provided, loads config from DB
 *     // OR inline config:
 *     underlying: string          // "NIFTY" | "BANKNIFTY" | ...
 *     exchange: string            // "NFO"
 *     expiry_type: string         // "weekly" | "monthly"
 *     trade_direction: string     // "bullish" | "bearish" | "neutral"
 *     orb_config: { orb_duration_mins, min_range_pct, max_range_pct, momentum_bars }
 *     entry_conditions: { orb_breakout, expiry_day_guard, vix_filter: { enabled, max_vix } }
 *     exit_rules: { sl_pct, tp_pct, trailing_enabled, trail_after_pct, trail_pct, time_exit_hhmm, max_reentry_count }
 *     risk_config: { lot_size, max_premium_per_lot }
 *     days?: number               // lookback in trading days (default 90)
 *   }
 *
 * Response:
 *   {
 *     totalTrades, wins, losses, winRate, avgWinPct, avgLossPct,
 *     expectancy, maxDrawdownPct, profitFactor, totalPnlPct,
 *     trades: TradeResult[]
 *     summary: string
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────

interface Bar {
  timestamp: string; // ISO or epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface TradeResult {
  date: string;
  direction: "CE" | "PE";
  entry_time: string;
  exit_time: string;
  entry_premium_pct: number; // ATM premium as % of underlying (proxy)
  entry_price: number;        // underlying price at entry
  exit_reason: "SL" | "TP" | "TRAIL" | "TIME" | "EXPIRY";
  pnl_pct: number;            // % gain/loss on premium
  orb_high: number;
  orb_low: number;
  range_pct: number;
}

interface BacktestConfig {
  underlying: string;
  exchange: string;
  expiry_type: string;
  trade_direction: string;
  orb_duration_mins: number;
  min_range_pct: number;
  max_range_pct: number;
  momentum_bars: number;
  orb_breakout: boolean;
  expiry_day_guard: boolean;
  sl_pct: number;
  tp_pct: number;
  trailing_enabled: boolean;
  trail_after_pct: number;
  trail_pct: number;
  time_exit_hhmm: string;
  max_reentry_count: number;
  lot_size: number;
  max_premium_per_lot: number;
  days: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toIST(ts: string | number): Date {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Weekly expiry for NIFTY = Thursday; BANKNIFTY = Wednesday; others = Thursday */
function weeklyExpiryDayOfWeek(underlying: string): number {
  const u = underlying.toUpperCase();
  if (u === "BANKNIFTY") return 3; // Wednesday
  if (u === "FINNIFTY") return 2;  // Tuesday
  return 4; // Thursday (NIFTY, MIDCPNIFTY, SENSEX, etc.)
}

/** True if `d` is a weekly expiry day for the underlying */
function isWeeklyExpiryDay(d: Date, underlying: string): boolean {
  return d.getDay() === weeklyExpiryDayOfWeek(underlying);
}

/** ATM premium proxy — ≈ 2.5% of underlying for ATM options (rough market estimate) */
function atmPremiumProxy(underlyingPrice: number): number {
  return underlyingPrice * 0.025;
}

// ── Fetch historical 5-min bars from OpenAlgo ─────────────────────────────

async function fetchHistory(
  symbol: string,
  exchange: string,
  startDate: string,
  endDate: string,
  apiKey: string,
): Promise<Bar[]> {
  const url = `${OPENALGO_URL}/api/v1/history`;
  const body = {
    apikey: apiKey,
    symbol,
    exchange,
    interval: "5m",
    start_date: startDate,
    end_date: endDate,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`History fetch failed: HTTP ${res.status}`);
  const data = await res.json();

  // OpenAlgo history returns: { status, data: [{timestamp, open, high, low, close, volume}] }
  // or flat array
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(data)) rows = data;
  else if (Array.isArray(data?.data)) rows = data.data;
  else if (data?.status === "error") throw new Error(String(data.message ?? "History error"));

  return rows.map((r) => ({
    timestamp: String(r.timestamp ?? r.time ?? r.date ?? ""),
    open: Number(r.open ?? 0),
    high: Number(r.high ?? 0),
    low: Number(r.low ?? 0),
    close: Number(r.close ?? 0),
    volume: Number(r.volume ?? 0),
  })).filter((b) => b.close > 0);
}

// ── Core simulation ──────────────────────────────────────────────────────

function simulateDay(
  dayBars: Bar[],
  cfg: BacktestConfig,
  dateStr: string,
  isExpiryDay: boolean,
): TradeResult[] {
  const results: TradeResult[] = [];

  if (!cfg.orb_breakout) return results; // only ORB strategy supported in backtest
  if (cfg.expiry_day_guard && isExpiryDay) return results;

  // Split into ORB window (first N minutes) and trade window
  const orbWindowEnd = `09:${String(15 + cfg.orb_duration_mins).padStart(2, "0")}`;
  const tradeEnd = cfg.time_exit_hhmm || "15:15";

  const orbBars = dayBars.filter((b) => {
    const t = hhmm(toIST(b.timestamp));
    return t >= "09:15" && t < orbWindowEnd;
  });

  const tradeBars = dayBars.filter((b) => {
    const t = hhmm(toIST(b.timestamp));
    return t >= orbWindowEnd && t <= tradeEnd;
  });

  if (orbBars.length === 0 || tradeBars.length === 0) return results;

  // Build ORB range
  const orbHigh = Math.max(...orbBars.map((b) => b.high));
  const orbLow = Math.min(...orbBars.map((b) => b.low));
  const midPrice = (orbHigh + orbLow) / 2;
  const rangePct = ((orbHigh - orbLow) / midPrice) * 100;

  if (rangePct < cfg.min_range_pct || rangePct > cfg.max_range_pct) return results;

  // Breakout detection with momentum
  let reentryCount = 0;
  let inTrade = false;
  let entryPremium = 0;
  let peakPremium = 0;
  let entryPrice = 0;
  let entryTime = "";
  let direction: "CE" | "PE" = "CE";
  let trailActivated = false;

  const canTrade = (dir: "CE" | "PE") => {
    if (cfg.trade_direction === "bullish" && dir !== "CE") return false;
    if (cfg.trade_direction === "bearish" && dir !== "PE") return false;
    return true;
  };

  for (let i = 0; i < tradeBars.length; i++) {
    const bar = tradeBars[i];
    const t = hhmm(toIST(bar.timestamp));

    if (inTrade) {
      // Current premium proxy — scale from entry using close vs entry_price ratio
      const currentPremium = entryPremium * (bar.close / entryPrice);
      if (currentPremium > peakPremium) peakPremium = currentPremium;

      const pnlPct = ((currentPremium - entryPremium) / entryPremium) * 100;
      const peakPnlPct = ((peakPremium - entryPremium) / entryPremium) * 100;

      // Time exit
      if (t >= tradeEnd) {
        results.push({
          date: dateStr,
          direction,
          entry_time: entryTime,
          exit_time: t,
          entry_premium_pct: (entryPremium / entryPrice) * 100,
          entry_price: entryPrice,
          exit_reason: "TIME",
          pnl_pct: pnlPct,
          orb_high: orbHigh,
          orb_low: orbLow,
          range_pct: rangePct,
        });
        inTrade = false;
        reentryCount++;
        continue;
      }

      // Stop loss
      if (pnlPct <= -cfg.sl_pct) {
        results.push({
          date: dateStr, direction, entry_time: entryTime, exit_time: t,
          entry_premium_pct: (entryPremium / entryPrice) * 100, entry_price: entryPrice,
          exit_reason: "SL", pnl_pct: -cfg.sl_pct,
          orb_high: orbHigh, orb_low: orbLow, range_pct: rangePct,
        });
        inTrade = false;
        reentryCount++;
        continue;
      }

      // Take profit
      if (pnlPct >= cfg.tp_pct) {
        results.push({
          date: dateStr, direction, entry_time: entryTime, exit_time: t,
          entry_premium_pct: (entryPremium / entryPrice) * 100, entry_price: entryPrice,
          exit_reason: "TP", pnl_pct: cfg.tp_pct,
          orb_high: orbHigh, orb_low: orbLow, range_pct: rangePct,
        });
        inTrade = false;
        reentryCount++;
        continue;
      }

      // Trailing SL
      if (cfg.trailing_enabled && peakPnlPct >= cfg.trail_after_pct) {
        trailActivated = true;
      }
      if (trailActivated) {
        const trailSl = peakPnlPct - cfg.trail_pct;
        if (pnlPct <= trailSl) {
          results.push({
            date: dateStr, direction, entry_time: entryTime, exit_time: t,
            entry_premium_pct: (entryPremium / entryPrice) * 100, entry_price: entryPrice,
            exit_reason: "TRAIL", pnl_pct: pnlPct,
            orb_high: orbHigh, orb_low: orbLow, range_pct: rangePct,
          });
          inTrade = false;
          reentryCount++;
          continue;
        }
      }

      continue; // still in trade
    }

    // Not in trade — look for breakout
    if (reentryCount > cfg.max_reentry_count) break;

    const breakoutCE = bar.close > orbHigh;
    const breakoutPE = bar.close < orbLow;
    if (!breakoutCE && !breakoutPE) continue;

    const dir: "CE" | "PE" = breakoutCE ? "CE" : "PE";
    if (!canTrade(dir)) continue;

    // Momentum check: N consecutive bars closing in the breakout direction
    const momentumBars = tradeBars.slice(Math.max(0, i - cfg.momentum_bars + 1), i + 1);
    if (momentumBars.length < cfg.momentum_bars) continue;

    const momentumOk = dir === "CE"
      ? momentumBars.every((b, j) => j === 0 || b.close > momentumBars[j - 1].close)
      : momentumBars.every((b, j) => j === 0 || b.close < momentumBars[j - 1].close);

    if (!momentumOk) continue;

    // Entry
    direction = dir;
    entryPrice = bar.close;
    entryPremium = atmPremiumProxy(entryPrice);
    peakPremium = entryPremium;
    entryTime = t;
    trailActivated = false;
    inTrade = true;
  }

  // Close any still-open trade at end of day
  if (inTrade && tradeBars.length > 0) {
    const lastBar = tradeBars[tradeBars.length - 1];
    const currentPremium = entryPremium * (lastBar.close / entryPrice);
    const pnlPct = ((currentPremium - entryPremium) / entryPremium) * 100;
    results.push({
      date: dateStr, direction, entry_time: entryTime,
      exit_time: hhmm(toIST(lastBar.timestamp)),
      entry_premium_pct: (entryPremium / entryPrice) * 100, entry_price: entryPrice,
      exit_reason: "TIME", pnl_pct: pnlPct,
      orb_high: orbHigh, orb_low: orbLow, range_pct: rangePct,
    });
  }

  return results;
}

// ── Aggregate results ──────────────────────────────────────────────────────

function aggregate(trades: TradeResult[], cfg: BacktestConfig) {
  if (!trades.length) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      avgWinPct: 0, avgLossPct: 0, expectancy: 0,
      maxDrawdownPct: 0, profitFactor: 0, totalPnlPct: 0,
      trades: [],
      summary: "No trades generated — the strategy conditions were not met in the backtest period.",
    };
  }

  const wins = trades.filter((t) => t.pnl_pct > 0);
  const losses = trades.filter((t) => t.pnl_pct <= 0);
  const winRate = Math.round((wins.length / trades.length) * 100);
  const avgWinPct = wins.length ? wins.reduce((s, t) => s + t.pnl_pct, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((s, t) => s + t.pnl_pct, 0) / losses.length : 0;
  const totalPnlPct = trades.reduce((s, t) => s + t.pnl_pct, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl_pct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_pct, 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null;
  const expectancy = Math.round((winRate / 100 * avgWinPct + (1 - winRate / 100) * avgLossPct) * 100) / 100;

  // Max drawdown — peak-to-trough on cumulative PnL
  let peak = 0, cumPnl = 0, maxDrawdown = 0;
  for (const t of trades) {
    cumPnl += t.pnl_pct;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const exitBreakdown = trades.reduce((acc, t) => {
    acc[t.exit_reason] = (acc[t.exit_reason] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const exitStr = Object.entries(exitBreakdown)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const summary = [
    `${trades.length} trades over ${cfg.days} days.`,
    `Win rate ${winRate}%, avg win +${avgWinPct.toFixed(1)}%, avg loss ${avgLossPct.toFixed(1)}%.`,
    `Total PnL on premium: ${totalPnlPct.toFixed(1)}%.`,
    `Profit factor: ${profitFactor ?? "N/A"}. Max drawdown: ${maxDrawdown.toFixed(1)}%.`,
    `Exits — ${exitStr}.`,
  ].join(" ");

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgWinPct: Math.round(avgWinPct * 100) / 100,
    avgLossPct: Math.round(avgLossPct * 100) / 100,
    expectancy,
    maxDrawdownPct: Math.round(maxDrawdown * 100) / 100,
    profitFactor,
    totalPnlPct: Math.round(totalPnlPct * 100) / 100,
    trades,
    summary,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    // Load strategy from DB if strategy_id provided
    let strategyRow: Record<string, unknown> | null = null;
    if (body.strategy_id) {
      const { data } = await supabase
        .from("options_strategies")
        .select("*")
        .eq("id", body.strategy_id)
        .eq("user_id", user.id)
        .single();
      strategyRow = data ?? null;
    }

    // Build config — DB row overrides inline body
    const ec = (strategyRow?.entry_conditions ?? body.entry_conditions ?? {}) as Record<string, unknown>;
    const orb = (strategyRow?.orb_config ?? body.orb_config ?? {}) as Record<string, unknown>;
    const er = (strategyRow?.exit_rules ?? body.exit_rules ?? {}) as Record<string, unknown>;
    const rc = (strategyRow?.risk_config ?? body.risk_config ?? {}) as Record<string, unknown>;
    const vixCfg = (ec.vix_filter ?? {}) as Record<string, unknown>;

    const cfg: BacktestConfig = {
      underlying: String(strategyRow?.underlying ?? body.underlying ?? "NIFTY").toUpperCase(),
      exchange: String(strategyRow?.exchange ?? body.exchange ?? "NFO").toUpperCase(),
      expiry_type: String(strategyRow?.expiry_type ?? body.expiry_type ?? "weekly"),
      trade_direction: String(strategyRow?.trade_direction ?? body.trade_direction ?? "neutral"),
      orb_duration_mins: Number(orb.orb_duration_mins ?? 15),
      min_range_pct: Number(orb.min_range_pct ?? 0.2),
      max_range_pct: Number(orb.max_range_pct ?? 1.0),
      momentum_bars: Number(orb.momentum_bars ?? 3),
      orb_breakout: Boolean(ec.orb_breakout ?? true),
      expiry_day_guard: Boolean(ec.expiry_day_guard ?? true),
      sl_pct: Number(er.sl_pct ?? 30),
      tp_pct: Number(er.tp_pct ?? 50),
      trailing_enabled: Boolean(er.trailing_enabled ?? true),
      trail_after_pct: Number(er.trail_after_pct ?? 30),
      trail_pct: Number(er.trail_pct ?? 15),
      time_exit_hhmm: String(er.time_exit_hhmm ?? "15:15"),
      max_reentry_count: Number(er.max_reentry_count ?? 1),
      lot_size: Number(rc.lot_size ?? 1),
      max_premium_per_lot: Number(rc.max_premium_per_lot ?? 500),
      days: Math.min(Number(body.days ?? 90), 365),
    };

    // Get user's OpenAlgo API key
    const { data: integRow } = await supabase
      .from("user_trading_integration")
      .select("openalgo_api_key")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single();

    const apiKey = String(integRow?.openalgo_api_key ?? Deno.env.get("OPENALGO_API_KEY") ?? "");
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "OpenAlgo API key not configured. Go to Broker Sync and paste your key.",
      }), { status: 400, headers });
    }

    if (!OPENALGO_URL) {
      return new Response(JSON.stringify({ error: "OPENALGO_URL not configured" }), { status: 500, headers });
    }

    // Date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - cfg.days);

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // Fetch historical bars
    const bars = await fetchHistory(
      cfg.underlying,
      cfg.exchange,
      fmt(startDate),
      fmt(endDate),
      apiKey,
    );

    if (!bars.length) {
      return new Response(JSON.stringify({
        error: `No historical data returned for ${cfg.underlying} over the last ${cfg.days} days. Check OpenAlgo history API.`,
      }), { status: 400, headers });
    }

    // Group bars by trading day
    const dayMap = new Map<string, Bar[]>();
    for (const bar of bars) {
      const d = dateKey(toIST(bar.timestamp));
      if (!dayMap.has(d)) dayMap.set(d, []);
      dayMap.get(d)!.push(bar);
    }

    // Sort days and simulate
    const allTrades: TradeResult[] = [];
    const sortedDays = [...dayMap.keys()].sort();

    for (const day of sortedDays) {
      const dayBars = (dayMap.get(day) ?? []).sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const dayDate = new Date(day + "T00:00:00+05:30");
      const isExpiryDay = cfg.expiry_type === "weekly"
        ? isWeeklyExpiryDay(dayDate, cfg.underlying)
        : dayDate.getDate() >= 25 && dayDate.getDay() === 4; // monthly: last Thursday near end of month

      const dayTrades = simulateDay(dayBars, cfg, day, isExpiryDay);
      allTrades.push(...dayTrades);
    }

    const result = aggregate(allTrades, cfg);

    return new Response(JSON.stringify({
      ...result,
      config: {
        underlying: cfg.underlying,
        exchange: cfg.exchange,
        days: cfg.days,
        orb_duration_mins: cfg.orb_duration_mins,
        min_range_pct: cfg.min_range_pct,
        max_range_pct: cfg.max_range_pct,
        momentum_bars: cfg.momentum_bars,
        sl_pct: cfg.sl_pct,
        tp_pct: cfg.tp_pct,
        trailing_enabled: cfg.trailing_enabled,
        time_exit_hhmm: cfg.time_exit_hhmm,
        expiry_day_guard: cfg.expiry_day_guard,
        trade_direction: cfg.trade_direction,
      },
      daysSimulated: sortedDays.length,
      engine: "options-orb-backtest:v1",
    }), { headers });

  } catch (err) {
    console.error("backtest-options-strategy error:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Internal error",
    }), { status: 500, headers });
  }
});
