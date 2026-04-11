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
  strategy_type: "orb_buying" | "iron_condor" | "strangle" | "bull_put_spread" | "jade_lizard";
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

function strategyTypeFromRow(
  strategyStyle: string,
  entryConditions: Record<string, unknown>,
): BacktestConfig["strategy_type"] {
  const explicit = String(entryConditions.strategy_type ?? "").toLowerCase();
  if (
    explicit === "orb_buying" ||
    explicit === "iron_condor" ||
    explicit === "strangle" ||
    explicit === "bull_put_spread" ||
    explicit === "jade_lizard"
  ) {
    return explicit;
  }
  if (strategyStyle === "iron_condor") return "iron_condor";
  if (strategyStyle === "strangle") return "strangle";
  return "orb_buying";
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(values[0]);
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function rsiSeries(values: number[], period = 14): number[] {
  const out = new Array(values.length).fill(50);
  if (values.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(0, d);
    loss += Math.max(0, -d);
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function roundToStep(price: number, step: number): number {
  if (!Number.isFinite(price) || step <= 0) return price;
  return Math.round(price / step) * step;
}

async function fetchVixDailySeries(days: number): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  try {
    const range = Math.min(Math.max(days + 30, 30), 729);
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?interval=1d&range=${range}d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return map;
    const d = await res.json();
    const ts: number[] = d?.chart?.result?.[0]?.timestamp ?? [];
    const closes: number[] = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    for (let i = 0; i < Math.min(ts.length, closes.length); i++) {
      const c = Number(closes[i]);
      if (!Number.isFinite(c) || c <= 0) continue;
      map[dateKey(toIST(ts[i]))] = c;
    }
  } catch {
    // VIX is optional; strategy gates fall back conservatively when missing.
  }
  return map;
}

function simulatePositionalStrategies(
  cfg: BacktestConfig,
  dayMap: Map<string, Bar[]>,
  sortedDays: string[],
  vixByDate: Record<string, number>,
  ec: Record<string, unknown>,
  er: Record<string, unknown>,
): TradeResult[] {
  const out: TradeResult[] = [];
  const closes: number[] = [];
  const ema20: number[] = [];
  const ema50: number[] = [];
  const rsi14: number[] = [];
  const expiryDow = weeklyExpiryDayOfWeek(cfg.underlying) % 7;
  const strikeStep = cfg.underlying.toUpperCase().includes("BANKNIFTY") ? 100 : 50;

  const getDayStats = (bars: Bar[]) => {
    const first = bars[0];
    const last = bars[bars.length - 1];
    const hi = Math.max(...bars.map((b) => b.high));
    const lo = Math.min(...bars.map((b) => b.low));
    return {
      open: first.open,
      close: last.close,
      high: hi,
      low: lo,
      rangePct: first.open > 0 ? ((hi - lo) / first.open) * 100 : 0,
      dropPct: first.open > 0 ? ((lo - first.open) / first.open) * 100 : 0,
      movePct: first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0,
    };
  };

  for (let i = 0; i < sortedDays.length; i++) {
    const day = sortedDays[i];
    const bars = (dayMap.get(day) ?? []).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (!bars.length) continue;

    const ds = getDayStats(bars);
    closes.push(ds.close);
    const e20 = emaSeries(closes, 20);
    const e50 = emaSeries(closes, 50);
    const rsi = rsiSeries(closes, 14);
    ema20.push(e20[e20.length - 1]);
    ema50.push(e50[e50.length - 1]);
    rsi14.push(rsi[rsi.length - 1]);

    const dObj = new Date(`${day}T00:00:00+05:30`);
    const dow = dObj.getDay(); // 0 Sun .. 6 Sat
    const vix = Number(vixByDate[day] ?? NaN);
    const holdEndIdx = (() => {
      for (let j = i; j < sortedDays.length; j++) {
        const jd = new Date(`${sortedDays[j]}T00:00:00+05:30`);
        if (jd.getDay() === expiryDow && j >= i) return j;
      }
      return Math.min(sortedDays.length - 1, i + 4);
    })();

    let highUntilExit = -Infinity;
    let lowUntilExit = Infinity;
    for (let j = i; j <= holdEndIdx; j++) {
      const jb = dayMap.get(sortedDays[j]) ?? [];
      if (!jb.length) continue;
      highUntilExit = Math.max(highUntilExit, ...jb.map((b) => b.high));
      lowUntilExit = Math.min(lowUntilExit, ...jb.map((b) => b.low));
    }
    const validRange = Number.isFinite(highUntilExit) && Number.isFinite(lowUntilExit);
    if (!validRange) continue;

    // 1) Weekly Iron Condor
    if (cfg.strategy_type === "iron_condor") {
      const minVix = Number(ec.min_vix ?? 13);
      const wing = Number(ec.wing_width_pts ?? 200);
      const minNet = Number(ec.min_net_premium ?? 35);
      const tpPct = Number(er.profit_target_pct ?? 45);
      const slMult = Number(er.stop_loss_mult ?? 2);
      if (dow !== 1 || !Number.isFinite(vix) || vix < minVix) continue; // Monday + VIX gate
      const spot = ds.close;
      const dte = Math.max(1, holdEndIdx - i + 1);
      const iv = vix / 100;
      const shortCall = roundToStep(spot * 1.015, strikeStep);
      const shortPut = roundToStep(spot * 0.985, strikeStep);
      const net = Math.max(minNet, spot * iv * Math.sqrt(dte / 365) * 0.30);
      const breachUp = Math.max(0, highUntilExit - shortCall);
      const breachDn = Math.max(0, shortPut - lowUntilExit);
      const loss = Math.min(Math.max(breachUp, breachDn), wing);
      const pnlPts = net - loss;
      const pnlPct = (pnlPts / net) * 100;
      out.push({
        date: day,
        direction: "CE",
        entry_time: "10:00",
        exit_time: "14:00",
        entry_premium_pct: (net / spot) * 100,
        entry_price: spot,
        exit_reason: pnlPct >= tpPct ? "TP" : (pnlPct <= -(slMult * 100) ? "SL" : "TIME"),
        pnl_pct: Math.max(-slMult * 100, Math.min(100, pnlPct)),
        orb_high: shortCall,
        orb_low: shortPut,
        range_pct: ds.rangePct,
      });
      continue;
    }

    // 2) Short Strangle (high-IV)
    if (cfg.strategy_type === "strangle") {
      const minVix = Number(ec.min_vix ?? 18);
      const tpPct = Number(er.profit_target_pct ?? 50);
      const slMult = Number(er.stop_loss_mult ?? 2);
      const vix3Key = i >= 3 ? sortedDays[i - 3] : "";
      const vix3 = Number(vixByDate[vix3Key] ?? NaN);
      const vixRise = Number.isFinite(vix3) && vix3 > 0 ? ((vix - vix3) / vix3) * 100 : 0;
      if (!Number.isFinite(vix) || vix < minVix || vixRise < 15) continue;
      const spot = ds.close;
      const dte = Math.max(1, holdEndIdx - i + 1);
      const iv = vix / 100;
      const shortCall = roundToStep(spot * 1.02, strikeStep);
      const shortPut = roundToStep(spot * 0.98, strikeStep);
      const net = Math.max(35, spot * iv * Math.sqrt(dte / 365) * 0.35);
      const breachUp = Math.max(0, highUntilExit - shortCall);
      const breachDn = Math.max(0, shortPut - lowUntilExit);
      const stress = Math.max(breachUp, breachDn);
      const pnlPts = net - stress;
      const pnlPct = (pnlPts / net) * 100;
      out.push({
        date: day,
        direction: "CE",
        entry_time: "11:00",
        exit_time: "15:15",
        entry_premium_pct: (net / spot) * 100,
        entry_price: spot,
        exit_reason: pnlPct >= tpPct ? "TP" : (pnlPct <= -(slMult * 100) ? "SL" : "TIME"),
        pnl_pct: Math.max(-slMult * 100, Math.min(120, pnlPct)),
        orb_high: shortCall,
        orb_low: shortPut,
        range_pct: ds.rangePct,
      });
      continue;
    }

    // 3) Bull Put Spread (bounce)
    if (cfg.strategy_type === "bull_put_spread") {
      const minDrop = Number(ec.min_drop_pct ?? 1.2);
      const maxRsi = Number(ec.max_rsi ?? 38);
      const width = Number(ec.wing_width_pts ?? 100);
      const minCreditPct = Number(ec.min_credit_pct_of_width ?? 0.4);
      const tpPct = Number(er.profit_target_pct ?? 75);
      const slMult = Number(er.stop_loss_mult ?? 2);
      const e20v = ema20[ema20.length - 1] ?? ds.close;
      const e50v = ema50[ema50.length - 1] ?? ds.close;
      const nearSupport = Math.abs(ds.close - e20v) / ds.close < 0.008 || Math.abs(ds.close - e50v) / ds.close < 0.008;
      if (!(Math.abs(ds.dropPct) >= minDrop && ds.dropPct < 0 && rsi14[rsi14.length - 1] < maxRsi && nearSupport)) continue;
      const spot = ds.close;
      const shortPut = roundToStep(spot * 0.995, strikeStep);
      const longPut = shortPut - width;
      const net = Math.max(width * minCreditPct, width * 0.45);
      const holdIdx = Math.min(sortedDays.length - 1, i + 5);
      let minLow = Infinity;
      for (let j = i; j <= holdIdx; j++) {
        const jb = dayMap.get(sortedDays[j]) ?? [];
        if (!jb.length) continue;
        minLow = Math.min(minLow, ...jb.map((b) => b.low));
      }
      let loss = 0;
      if (minLow < longPut) {
        loss = width - net;
      } else if (minLow < shortPut) {
        loss = Math.max(0, shortPut - minLow - net);
      }
      const pnlPts = net - loss;
      const pnlPct = (pnlPts / net) * 100;
      out.push({
        date: day,
        direction: "PE",
        entry_time: "11:30",
        exit_time: "15:15",
        entry_premium_pct: (net / spot) * 100,
        entry_price: spot,
        exit_reason: pnlPct >= tpPct ? "TP" : (pnlPct <= -(slMult * 100) ? "SL" : "TIME"),
        pnl_pct: Math.max(-slMult * 100, Math.min(100, pnlPct)),
        orb_high: shortPut,
        orb_low: longPut,
        range_pct: ds.rangePct,
      });
      continue;
    }

    // 4) Jade Lizard
    if (cfg.strategy_type === "jade_lizard") {
      const minVix = Number(ec.min_vix ?? 15);
      const width = Number(ec.call_spread_width_pts ?? 150);
      const tpPct = Number(er.profit_target_pct ?? 50);
      const slMult = Number(er.stop_loss_mult ?? 2);
      const e20v = ema20[ema20.length - 1] ?? ds.close;
      const bullishBias = ds.close >= e20v;
      if (!bullishBias || !Number.isFinite(vix) || vix < minVix) continue;
      const spot = ds.close;
      const shortPut = roundToStep(spot * 0.988, strikeStep);
      const shortCall = roundToStep(spot * 1.012, strikeStep);
      const longCall = shortCall + width;
      const callCredit = width * 0.55;
      const putPremium = width * 0.60;
      const totalCredit = callCredit + putPremium;
      if (totalCredit < width) continue; // zero-upside rule
      const downBreach = Math.max(0, shortPut - lowUntilExit);
      const pnlPts = totalCredit - downBreach;
      const pnlPct = (pnlPts / totalCredit) * 100;
      out.push({
        date: day,
        direction: "PE",
        entry_time: "12:00",
        exit_time: "14:00",
        entry_premium_pct: (totalCredit / spot) * 100,
        entry_price: spot,
        exit_reason: pnlPct >= tpPct ? "TP" : (pnlPct <= -(slMult * 100) ? "SL" : "TIME"),
        pnl_pct: Math.max(-slMult * 100, Math.min(100, pnlPct)),
        orb_high: longCall,
        orb_low: shortPut,
        range_pct: ds.rangePct,
      });
    }
  }
  return out;
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

    const strategyType = strategyTypeFromRow(
      String(strategyRow?.strategy_style ?? body.strategy_style ?? "buying"),
      ec,
    );
    const cfg: BacktestConfig = {
      strategy_type: strategyType,
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

    // Prefer OpenAlgo-native options backtest path for all supported options strategies.
    // This keeps broker-connected options backtests on one backend engine.
    const openalgoStrategy =
      cfg.strategy_type === "orb_buying" ? "options_orb" : cfg.strategy_type;
    const optionsConfig = {
      strategy_type: cfg.strategy_type,
      ...ec,
      ...orb,
      ...er,
      ...rc,
      expiry_type: cfg.expiry_type,
      trade_direction: cfg.trade_direction,
      orb_duration_mins: cfg.orb_duration_mins,
      min_range_pct: cfg.min_range_pct,
      max_range_pct: cfg.max_range_pct,
      momentum_bars: cfg.momentum_bars,
      expiry_day_guard: cfg.expiry_day_guard,
      sl_pct: cfg.sl_pct,
      tp_pct: cfg.tp_pct,
      trailing_enabled: cfg.trailing_enabled,
      trail_after_pct: cfg.trail_after_pct,
      trail_pct: cfg.trail_pct,
      time_exit_hhmm: cfg.time_exit_hhmm,
      max_reentry_count: cfg.max_reentry_count,
      lot_size: cfg.lot_size,
      max_premium_per_lot: cfg.max_premium_per_lot,
      options_symbol: String((rc as Record<string, unknown>).explicit_options_symbol ?? ""),
      expiry_date: String((rc as Record<string, unknown>).explicit_expiry_iso ?? ""),
    };
    if (OPENALGO_APP_KEY) {
      const oaRes = await fetch(`${OPENALGO_URL}/api/v1/platform/vectorbt-backtest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Platform-Key": OPENALGO_APP_KEY,
        },
        body: JSON.stringify({
          symbol: cfg.underlying,
          exchange: cfg.exchange,
          strategy: openalgoStrategy,
          days: cfg.days,
          openalgo_api_key: apiKey,
          options_config: optionsConfig,
        }),
      });
      const oaRaw = await oaRes.text().catch(() => "");
      const oaJson = oaRaw ? JSON.parse(oaRaw) : {};
      if (oaRes.ok && !oaJson?.error) {
        return new Response(JSON.stringify({
          ...oaJson,
          delegatedTo: "openalgo",
        }), { status: 200, headers });
      }
      console.warn("backtest-options-strategy: OpenAlgo delegation failed, using local fallback", oaJson?.error ?? oaRaw);
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
    const vixByDate = await fetchVixDailySeries(cfg.days);

    if (cfg.strategy_type === "orb_buying") {
      for (let dayIdx = 0; dayIdx < sortedDays.length; dayIdx++) {
        const day = sortedDays[dayIdx];
        const dayBars = (dayMap.get(day) ?? []).sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const dayDate = new Date(day + "T00:00:00+05:30");
        const isExpiryDay = cfg.expiry_type === "weekly"
          ? isWeeklyExpiryDay(dayDate, cfg.underlying)
          : dayDate.getDate() >= 25 && dayDate.getDay() === 4; // monthly: last Thursday near end of month
        allTrades.push(...simulateDay(dayBars, cfg, day, isExpiryDay));
      }
    } else {
      allTrades.push(...simulatePositionalStrategies(cfg, dayMap, sortedDays, vixByDate, ec, er));
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
      engine: cfg.strategy_type === "orb_buying"
        ? "options-orb-backtest:v1"
        : `options-${cfg.strategy_type}-backtest:v1`,
    }), { headers });

  } catch (err) {
    console.error("backtest-options-strategy error:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Internal error",
    }), { status: 500, headers });
  }
});
