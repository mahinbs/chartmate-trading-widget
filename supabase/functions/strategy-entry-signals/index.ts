/**
 * strategy-entry-signals — Multi-strategy library entry scan + AI scoring
 *
 * Real data used here (dynamically fetched each run):
 * - OHLCV: Twelve Data (TWELVE_DATA_API_KEY) → Yahoo Finance chart (no key) → Alpha Vantage (ALPHA_VANTAGE_API_KEY)
 * - Indicators snapshot: Twelve Data → Alpha Vantage → computed from OHLCV
 * - Scoring: Gemini (GEMINI_API_KEY) blended with rule-based read
 *
 * Body: {
 *   symbol: string,
 *   strategies: string[],  // e.g. ["trend_following","mean_reversion"]
 *   action?: "BUY" | "SELL",
 *   days?: number,         // lookback days (default 365, max 730)
 *   postAnalysis?: {       // optional context from post-prediction
 *     result?: string;
 *     actualChangePercent?: number;
 *     predictedDirection?: string;
 *   }
 * }
 *
 * Returns: { signals: [...], yahooSymbol?: string, lookbackDaysUsed?: number, predictedCount: 0 (no projected entries) }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
const ALPHA_VANTAGE_API_KEY = Deno.env.get("ALPHA_VANTAGE_API_KEY") ?? "";

/** Same model as `predict-movement` (main analysis pipeline) — avoids 404 when 2.0-flash isn’t enabled for the key */
const GEMINI_MODEL = "gemini-3.1-pro-preview";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OhlcvPack = { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; interval: string };

function toTwelveDataSymbol(yahooSymbol: string, assetType: string): string {
  if (assetType === "crypto") return yahooSymbol.replace(/-/g, "/").replace(/=X$/, "").replace("USDT", "USD");
  if (assetType === "forex") {
    const s = yahooSymbol.replace("=X", "");
    if (s.length === 6) return `${s.slice(0, 3)}/${s.slice(3)}`;
    return s.replace(/-/g, "/");
  }
  return yahooSymbol.replace(/\.(NS|BO|L|AX|TO|DE|F)$/, "");
}

function mapToTwelveInterval(interval: string): string {
  const i = interval.toLowerCase();
  if (i === "5m") return "5min";
  if (i === "15m") return "15min";
  if (i === "60m" || i === "1h") return "1h";
  return "5min";
}

async function fetchTwelveDataCandles(
  yahooSymbol: string,
  assetType: string,
  interval: string,
  outputsize: number,
): Promise<OhlcvPack | null> {
  if (!TWELVE_DATA_API_KEY) return null;
  const tdSymbol = toTwelveDataSymbol(yahooSymbol, assetType);
  const tdInterval = mapToTwelveInterval(interval);
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${tdInterval}&outputsize=${outputsize}&order=ASC&apikey=${TWELVE_DATA_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(18000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === "error" || !Array.isArray(data?.values)) return null;
    const t: number[] = [];
    const o: number[] = [];
    const h: number[] = [];
    const l: number[] = [];
    const c: number[] = [];
    for (const row of data.values) {
      if (row?.open == null || row?.close == null || row?.high == null || row?.low == null || !row?.datetime) continue;
      const ts = Math.floor(new Date(String(row.datetime)).getTime() / 1000);
      if (!Number.isFinite(ts)) continue;
      t.push(ts);
      o.push(Number(row.open));
      h.push(Number(row.high));
      l.push(Number(row.low));
      c.push(Number(row.close));
    }
    if (c.length < 10) return null;
    return { t, o, h, l, c, interval };
  } catch {
    return null;
  }
}

async function fetchAlphaVantageDailyCandles(yahooSymbol: string): Promise<OhlcvPack | null> {
  if (!ALPHA_VANTAGE_API_KEY) return null;
  const avSymbol = yahooSymbol.replace(/\.(NS|BO)$/, "");
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(avSymbol)}&outputsize=compact&apikey=${ALPHA_VANTAGE_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const data = await res.json();
    const ts = data?.["Time Series (Daily)"];
    if (!ts || typeof ts !== "object") return null;
    const rows = Object.entries(ts).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const t: number[] = [];
    const o: number[] = [];
    const h: number[] = [];
    const l: number[] = [];
    const c: number[] = [];
    for (const [d, vAny] of rows) {
      const v = vAny as Record<string, string>;
      const tsSec = Math.floor(new Date(String(d)).getTime() / 1000);
      t.push(tsSec);
      o.push(Number(v["1. open"]));
      h.push(Number(v["2. high"]));
      l.push(Number(v["3. low"]));
      c.push(Number(v["4. close"]));
    }
    if (c.length < 10) return null;
    return { t, o, h, l, c, interval: "1d" };
  } catch {
    return null;
  }
}

function normalizeToYahooSymbol(raw: string): string {
  const clean = raw.replace(/^(NASDAQ|NYSE|BINANCE|OANDA|SP|DJ|COMEX|NYMEX|NSE|BSE):/i, "").trim();
  if (clean.endsWith(".NS") || clean.endsWith(".BO")) return clean.toUpperCase();
  if (/^[A-Z]{1,5}$/.test(clean) && raw.toUpperCase().includes("NSE:")) return `${clean}.NS`;
  if (/^[A-Z]{1,5}$/.test(clean) && raw.toUpperCase().includes("BSE:")) return `${clean}.BO`;
  if (clean.includes("-") || clean.includes("=") || clean.includes("^") || clean.includes("/")) {
    return clean.toUpperCase();
  }
  const forexPairs = ["EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
  let b = "", q = "";
  if (clean.includes("_")) [b, q] = clean.split("_");
  else if (clean.includes("/")) [b, q] = clean.split("/");
  else if (clean.length === 6 && /^[A-Z]{6}$/i.test(clean)) {
    b = clean.slice(0, 3).toUpperCase();
    q = clean.slice(3).toUpperCase();
  }
  if (forexPairs.includes(b) && forexPairs.includes(q)) return `${b}${q}=X`;
  return clean.toUpperCase();
}

async function fetchYahooDaily(yahooSymbol: string, days: number): Promise<{ t: number[]; c: number[]; h: number[]; l: number[]; o: number[] }> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - days * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  if (!r?.timestamp?.length) throw new Error("No Yahoo daily data");
  const q = r.indicators?.quote?.[0];
  const tRaw = r.timestamp as number[];
  const t: number[] = [];
  const c: number[] = [];
  const h: number[] = [];
  const l: number[] = [];
  const o: number[] = [];
  // IMPORTANT: keep timestamps aligned with filtered OHLC values
  for (let i = 0; i < tRaw.length; i++) {
    if (q.close?.[i] != null && q.open?.[i] != null) {
      t.push(Number(tRaw[i]));
      c.push(Number(q.close[i]));
      h.push(Number(q.high[i] ?? q.close[i]));
      l.push(Number(q.low[i] ?? q.close[i]));
      o.push(Number(q.open[i]));
    }
  }
  return { t, c, h, l, o };
}

async function fetchYahooChart(params: {
  yahooSymbol: string;
  period1: number;
  period2: number;
  interval: string;
}): Promise<{ t: number[]; c: number[]; h: number[]; l: number[]; o: number[]; interval: string }> {
  const { yahooSymbol, period1, period2, interval } = params;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=${encodeURIComponent(interval)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  if (!r?.timestamp?.length) throw new Error("No Yahoo chart data");
  const q = r.indicators?.quote?.[0];
  const tRaw = r.timestamp as number[];
  const t: number[] = [];
  const c: number[] = [];
  const h: number[] = [];
  const l: number[] = [];
  const o: number[] = [];
  // keep arrays aligned (skip nulls)
  for (let i = 0; i < tRaw.length; i++) {
    if (q.close?.[i] != null && q.open?.[i] != null) {
      t.push(Number(tRaw[i]));
      c.push(Number(q.close[i]));
      h.push(Number(q.high?.[i] ?? q.close[i]));
      l.push(Number(q.low?.[i] ?? q.close[i]));
      o.push(Number(q.open[i]));
    }
  }
  return { t, c, h, l, o, interval };
}

function sma(arr: number[], p: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  for (let i = p - 1; i < arr.length; i++) {
    let s = 0;
    for (let j = 0; j < p; j++) s += arr[i - j];
    out[i] = s / p;
  }
  return out;
}

function ema(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  if (!Array.isArray(arr) || arr.length === 0 || period <= 0) return out;
  const k = 2 / (period + 1);
  let prev = arr[0];
  out[0] = prev;
  for (let i = 1; i < arr.length; i++) {
    prev = arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsi(arr: number[], period = 14): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  if (n < period + 1) return out;
  const gains = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const d = arr[i] - arr[i - 1];
    gains[i] = Math.max(d, 0);
    losses[i] = Math.max(-d, 0);
  }
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    avgG += gains[i];
    avgL += losses[i];
  }
  avgG /= period;
  avgL /= period;
  const rs = avgL === 0 ? 100 : avgG / avgL;
  out[period] = 100 - 100 / (1 + rs);
  for (let i = period + 1; i < n; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period;
    avgL = (avgL * (period - 1) + losses[i]) / period;
    const rs2 = avgL === 0 ? 100 : avgG / avgL;
    out[i] = 100 - 100 / (1 + rs2);
  }
  return out;
}

type ConditionAuditLine = { ok: boolean; label: string };

type StrategyConditionAudit = {
  kind: "custom_time" | "custom_raw" | "custom_visual" | "custom_hybrid" | "clock_exit";
  overallMatch: boolean;
  lines: ConditionAuditLine[];
  snapshot?: Record<string, unknown>;
};

type RawSignal = {
  strategyId: string;
  strategyLabel: string;
  entryIndex: number;
  entryDate: string;
  entryTime?: string;
  entryTimestamp?: number;
  side: "BUY" | "SELL";
  priceAtEntry: number;
  isLive?: boolean;
  isPredicted?: boolean;
  /** Custom / clock rules: per-condition evaluation on the signal bar */
  conditionAudit?: StrategyConditionAudit;
  marketData?: {
    rsi14: number | null;
    sma20: number | null;
    high20: number | null;
    low20: number | null;
    dataSource?: string;
    indicatorSource?: string;
  };
};

type AssetType = "crypto" | "forex" | "stock";

function detectAssetType(yahooSymbol: string): AssetType {
  const s = yahooSymbol.toUpperCase();
  if (s.includes("-USD") || s.includes("-EUR") || s.includes("-GBP") || s.includes("-BTC") || s.includes("-ETH")) return "crypto";
  if (s.endsWith("=X") || s.endsWith("=F")) return "forex";
  return "stock";
}

/** Real-time indicator snapshot from external APIs, used to enrich Gemini context. */
type RealIndicators = {
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  currentPrice: number | null;
  changePct: number | null;
  source: string;
};

async function fetchTwelveDataIndicators(yahooSymbol: string, assetType: string): Promise<RealIndicators | null> {
  if (!TWELVE_DATA_API_KEY) return null;
  const tdSymbol = toTwelveDataSymbol(yahooSymbol, assetType);
  const enc = encodeURIComponent(tdSymbol);
  const base = "https://api.twelvedata.com";
  try {
    const [rsiRes, bbandsRes, macdRes, quoteRes] = await Promise.all([
      fetch(`${base}/rsi?symbol=${enc}&interval=1day&outputsize=1&apikey=${TWELVE_DATA_API_KEY}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${base}/bbands?symbol=${enc}&interval=1day&outputsize=1&apikey=${TWELVE_DATA_API_KEY}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${base}/macd?symbol=${enc}&interval=1day&outputsize=1&apikey=${TWELVE_DATA_API_KEY}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${base}/quote?symbol=${enc}&apikey=${TWELVE_DATA_API_KEY}`, { signal: AbortSignal.timeout(10000) }),
    ]);
    const [rJ, bJ, mJ, qJ] = await Promise.all([rsiRes.json(), bbandsRes.json(), macdRes.json(), quoteRes.json()]);
    const rsiVal = rJ?.values?.[0]?.rsi;
    const bbRow = bJ?.values?.[0];
    const macdRow = mJ?.values?.[0];
    return {
      rsi14: rsiVal != null ? parseFloat(rsiVal) : null,
      macdLine: macdRow?.macd != null ? parseFloat(macdRow.macd) : null,
      macdSignal: macdRow?.macd_signal != null ? parseFloat(macdRow.macd_signal) : null,
      bbUpper: bbRow?.upper_band != null ? parseFloat(bbRow.upper_band) : null,
      bbMiddle: bbRow?.middle_band != null ? parseFloat(bbRow.middle_band) : null,
      bbLower: bbRow?.lower_band != null ? parseFloat(bbRow.lower_band) : null,
      currentPrice: qJ?.close != null ? parseFloat(qJ.close) : null,
      changePct: qJ?.percent_change != null ? parseFloat(qJ.percent_change) : null,
      source: "twelvedata",
    };
  } catch (e) {
    console.warn("TwelveData indicators failed:", e);
    return null;
  }
}

async function fetchAlphaVantageIndicators(yahooSymbol: string): Promise<RealIndicators | null> {
  if (!ALPHA_VANTAGE_API_KEY) return null;
  const avSymbol = yahooSymbol.replace(/\.(NS|BO)$/, "");
  const base = "https://www.alphavantage.co/query";
  const enc = encodeURIComponent(avSymbol);
  try {
    const [quoteRes, rsiRes, bbandsRes] = await Promise.all([
      fetch(`${base}?function=GLOBAL_QUOTE&symbol=${enc}&apikey=${ALPHA_VANTAGE_API_KEY}`, { signal: AbortSignal.timeout(12000) }),
      fetch(`${base}?function=RSI&symbol=${enc}&interval=daily&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`, { signal: AbortSignal.timeout(12000) }),
      fetch(`${base}?function=BBANDS&symbol=${enc}&interval=daily&time_period=20&series_type=close&nbdevup=2&nbdevdn=2&apikey=${ALPHA_VANTAGE_API_KEY}`, { signal: AbortSignal.timeout(12000) }),
    ]);
    const [qJ, rJ, bJ] = await Promise.all([quoteRes.json(), rsiRes.json(), bbandsRes.json()]);
    const gq = qJ?.["Global Quote"];
    const rsiSeries = rJ?.["Technical Analysis: RSI"];
    const bbSeries = bJ?.["Technical Analysis: BBANDS"];
    const rk = rsiSeries ? Object.keys(rsiSeries)[0] : null;
    const bk = bbSeries ? Object.keys(bbSeries)[0] : null;
    return {
      rsi14: rk ? parseFloat(rsiSeries[rk].RSI) : null,
      macdLine: null,
      macdSignal: null,
      bbUpper: bk ? parseFloat(bbSeries[bk]["Real Upper Band"]) : null,
      bbMiddle: bk ? parseFloat(bbSeries[bk]["Real Middle Band"]) : null,
      bbLower: bk ? parseFloat(bbSeries[bk]["Real Lower Band"]) : null,
      currentPrice: gq?.["05. price"] != null ? parseFloat(gq["05. price"]) : null,
      changePct: gq?.["10. change percent"] ? parseFloat(gq["10. change percent"]) : null,
      source: "alphavantage",
    };
  } catch (e) {
    console.warn("Alpha Vantage indicators failed:", e);
    return null;
  }
}

/**
 * Get real indicators: TwelveData (primary for US/crypto/forex) → Alpha Vantage → compute from OHLCV.
 */
async function fetchRealIndicators(
  yahooSymbol: string,
  assetType: string,
  c: number[],
): Promise<RealIndicators> {
  const isIndian = yahooSymbol.endsWith(".NS") || yahooSymbol.endsWith(".BO");
  if (!isIndian) {
    const td = await fetchTwelveDataIndicators(yahooSymbol, assetType);
    if (td && td.rsi14 != null) { console.log(`Indicators: TwelveData for ${yahooSymbol}`); return td; }
    if (assetType === "stock") {
      const av = await fetchAlphaVantageIndicators(yahooSymbol);
      if (av && av.rsi14 != null) { console.log(`Indicators: Alpha Vantage for ${yahooSymbol}`); return av; }
    }
  }
  // Compute from OHLCV
  const r = rsi(c, 14);
  const s = sma(c, 20);
  const n = c.length;
  const lastRsi = n > 14 ? r[n - 1] : null;
  const lastSma = n > 20 ? s[n - 1] : null;
  let bbU: number | null = null, bbL: number | null = null;
  if (n > 20 && lastSma != null) {
    let sq = 0;
    for (let i = n - 20; i < n; i++) sq += (c[i] - lastSma) ** 2;
    const sd = Math.sqrt(sq / 20);
    bbU = lastSma + 2 * sd;
    bbL = lastSma - 2 * sd;
  }
  console.log(`Indicators: computed from OHLCV for ${yahooSymbol}`);
  return {
    rsi14: lastRsi != null && Number.isFinite(lastRsi) ? lastRsi : null,
    macdLine: null, macdSignal: null,
    bbUpper: bbU, bbMiddle: lastSma, bbLower: bbL,
    currentPrice: n > 0 ? c[n - 1] : null,
    changePct: n > 1 ? ((c[n - 1] - c[n - 2]) / c[n - 2]) * 100 : null,
    source: "computed",
  };
}

const STRATEGY_LABELS: Record<string, string> = {
  time_scheduled: "Time Scheduled",
  trend_following: "Trend Following",
  breakout_breakdown: "Breakout & Breakdown",
  mean_reversion: "Mean Reversion",
  momentum: "Momentum",
  scalping: "Scalping",
  swing_trading: "Swing Trading",
  range_trading: "Range Trading",
  news_based: "News / Event Based",
  options_buying: "Options Buying",
  options_selling: "Options Selling",
  pairs_trading: "Pairs Trading",
};

/** Check whether a strategy fires at candle index `i`. Relaxed thresholds for intraday. */
function checkSignal(
  strategy: string,
  action: "BUY" | "SELL",
  i: number,
  c: number[],
  h: number[],
  l: number[],
  r: number[],
  sma20: number[],
  relaxed: boolean,
): boolean {
  const rsiV = Number.isFinite(r[i]) ? r[i] : 50;
  const s = sma20[i];
  const high20 = Math.max(...h.slice(Math.max(0, i - 20), i));
  const low20 = Math.min(...l.slice(Math.max(0, i - 20), i));

  // Relaxed thresholds for intraday — standard conditions rarely fire on 5m candles
  const MR_BUY = relaxed ? 40 : 30;
  const MR_SELL = relaxed ? 60 : 70;
  const MOM_BUY = relaxed ? 52 : 58;
  const MOM_SELL = relaxed ? 48 : 42;
  const OB_BUY = relaxed ? 55 : 60;
  const OB_SELL = relaxed ? 45 : 40;

  if (strategy === "time_scheduled") {
    return false;
  }
  if (strategy === "trend_following") {
    return action === "BUY"
      ? Number.isFinite(s) && c[i] > s && rsiV > 50
      : Number.isFinite(s) && c[i] < s && rsiV < 50;
  }
  if (strategy === "breakout_breakdown") {
    return (action === "BUY" && c[i] >= high20 * 0.99) ||
      (action === "SELL" && c[i] <= low20 * 1.01);
  }
  if (strategy === "mean_reversion") {
    return (action === "BUY" && rsiV < MR_BUY) || (action === "SELL" && rsiV > MR_SELL);
  }
  if (strategy === "momentum") {
    return action === "BUY"
      ? rsiV > MOM_BUY && Number.isFinite(s) && c[i] > s
      : rsiV < MOM_SELL && Number.isFinite(s) && c[i] < s;
  }
  if (strategy === "scalping") {
    return action === "BUY"
      ? c[i] < l[i - 1] * 1.002 && c[i] > c[i - 1] * 0.99
      : c[i] > h[i - 1] * 0.998 && c[i] < c[i - 1] * 1.01;
  }
  if (strategy === "swing_trading") {
    return action === "BUY"
      ? Number.isFinite(s) && c[i] > s && c[i] < c[i - 1] && c[i - 1] < c[i - 2] && 40 < rsiV && rsiV < 65
      : Number.isFinite(s) && c[i] < s && c[i] > c[i - 1] && c[i - 1] > c[i - 2] && 35 < rsiV && rsiV < 60;
  }
  if (strategy === "range_trading") {
    const mid = (high20 + low20) / 2;
    const rw = mid ? ((high20 - low20) / mid) * 100 : 100;
    return rw < 15 && 35 < rsiV && rsiV < 65;
  }
  if (strategy === "news_based") {
    return (action === "BUY" && rsiV > 55) || (action === "SELL" && rsiV < 45);
  }
  if (strategy === "options_buying") {
    return action === "BUY"
      ? rsiV > OB_BUY && Number.isFinite(s) && c[i] > s
      : rsiV < OB_SELL && Number.isFinite(s) && c[i] < s;
  }
  if (strategy === "options_selling") {
    return action === "BUY" && rsiV < (relaxed ? 45 : 40) && Math.abs(c[i] - (s || c[i])) / c[i] < 0.03;
  }
  return action === "BUY" && rsiV > 50;
}

type ConditionRhs =
  | { kind?: "number"; value?: number }
  | { kind?: "indicator"; id?: string; period?: number };

type AlgoCondition = {
  indicator?: string;
  period?: number;
  op?: string;
  rhs?: ConditionRhs;
};

type ConditionGroup = {
  logic?: "AND" | "OR";
  conditions?: AlgoCondition[];
};

type EntryConditionsConfig = {
  mode?: "visual" | "raw";
  groupLogic?: "AND" | "OR";
  groups?: ConditionGroup[];
  rawExpression?: string;
  strategySubtype?: "indicator_based" | "time_based" | "hybrid";
  clockEntryTime?: string;
};

type ConditionEvalCtx = {
  c: number[];
  h: number[];
  l: number[];
  realIndicators: RealIndicators;
  rsiCache: Map<number, number[]>;
  smaCache: Map<number, number[]>;
  emaCache: Map<number, number[]>;
  /** Unix seconds per candle — required for TIME_IS(...) */
  timestamps?: number[];
  /** IANA zone for wall-clock rules (IST for Indian symbols, UTC otherwise) */
  timeZone?: string;
};

function parseHHMM(hhmm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, m: mi };
}

function parseTimeFromRawExpression(raw: string): string | null {
  const m = /TIME_IS\s*\(\s*(\d{1,2}):(\d{2})\s*\)/i.exec(String(raw ?? ""));
  if (!m) return null;
  return `${Number(m[1])}:${m[2].padStart(2, "0")}`;
}

function wallClockHM(tsSec: number, timeZone: string): { h: number; m: number } | null {
  if (!Number.isFinite(tsSec)) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(tsSec * 1000));
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return { h: hh, m: mm };
}

function evaluateClockMatch(tsSec: number | undefined, hhmm: string, timeZone: string): boolean {
  if (tsSec == null) return false;
  const target = parseHHMM(hhmm);
  if (!target) return false;
  const wc = wallClockHM(tsSec, timeZone);
  if (!wc) return false;
  return wc.h === target.h && wc.m === target.m;
}

function stripTimeIsCalls(raw: string): string {
  return String(raw ?? "")
    .replace(/TIME_IS\s*\([^)]*\)/gi, " ")
    .replace(/\bAND\b/gi, "AND")
    .replace(/\bOR\b/gi, "OR")
    .replace(/^\s*(AND|OR)\s+/i, "")
    .replace(/\s+(AND|OR)\s*$/i, "")
    .trim();
}

function getSeriesValue(series: number[], idx: number): number | null {
  if (idx < 0 || idx >= series.length) return null;
  const v = series[idx];
  return Number.isFinite(v) ? v : null;
}

function resolveIndicatorValue(
  idRaw: string,
  period: number | undefined,
  idx: number,
  ctx: ConditionEvalCtx,
): number | null {
  const id = String(idRaw ?? "").toUpperCase().trim();
  const p = Math.max(1, Math.floor(Number(period) || 14));
  if (id === "PRICE") return getSeriesValue(ctx.c, idx);
  if (id === "CHANGE_PCT") return ctx.realIndicators.changePct;
  if (id === "RSI") {
    if (!ctx.rsiCache.has(p)) ctx.rsiCache.set(p, rsi(ctx.c, p));
    return getSeriesValue(ctx.rsiCache.get(p) ?? [], idx);
  }
  if (id === "SMA") {
    if (!ctx.smaCache.has(p)) ctx.smaCache.set(p, sma(ctx.c, p));
    return getSeriesValue(ctx.smaCache.get(p) ?? [], idx);
  }
  if (id === "EMA") {
    if (!ctx.emaCache.has(p)) ctx.emaCache.set(p, ema(ctx.c, p));
    return getSeriesValue(ctx.emaCache.get(p) ?? [], idx);
  }
  if (id === "MACD") return ctx.realIndicators.macdLine;
  if (id === "MACD_SIGNAL") return ctx.realIndicators.macdSignal;
  if (id === "MACD_HIST") {
    if (ctx.realIndicators.macdLine == null || ctx.realIndicators.macdSignal == null) return null;
    return ctx.realIndicators.macdLine - ctx.realIndicators.macdSignal;
  }
  if (id === "BB_UPPER") return ctx.realIndicators.bbUpper;
  if (id === "BB_MIDDLE") return ctx.realIndicators.bbMiddle;
  if (id === "BB_LOWER") return ctx.realIndicators.bbLower;
  return null;
}

function compareByOp(left: number, right: number, opRaw: string): boolean {
  const op = String(opRaw ?? "").toLowerCase().trim();
  if (op === "less_than") return left < right;
  if (op === "greater_than") return left > right;
  if (op === "equals") return Math.abs(left - right) <= 1e-6;
  if (op === "less_than_or_equal") return left <= right;
  if (op === "greater_than_or_equal") return left >= right;
  return false;
}

function evaluateCondition(cond: AlgoCondition, idx: number, ctx: ConditionEvalCtx): boolean {
  const lhsId = String(cond.indicator ?? "");
  const op = String(cond.op ?? "equals");
  const lhs = resolveIndicatorValue(lhsId, cond.period, idx, ctx);
  if (lhs == null) return false;

  let rhsValNow: number | null = null;
  let rhsValPrev: number | null = null;
  if (cond.rhs?.kind === "indicator") {
    rhsValNow = resolveIndicatorValue(String(cond.rhs.id ?? ""), cond.rhs.period, idx, ctx);
    rhsValPrev = resolveIndicatorValue(String(cond.rhs.id ?? ""), cond.rhs.period, idx - 1, ctx);
  } else {
    rhsValNow = Number((cond.rhs && "value" in cond.rhs ? cond.rhs.value : 0) ?? 0);
    rhsValPrev = rhsValNow;
  }
  if (rhsValNow == null) return false;

  if (op === "crosses_above" || op === "crosses_below") {
    const lhsPrev = resolveIndicatorValue(lhsId, cond.period, idx - 1, ctx);
    if (lhsPrev == null || rhsValPrev == null) return false;
    return op === "crosses_above"
      ? lhsPrev <= rhsValPrev && lhs > rhsValNow
      : lhsPrev >= rhsValPrev && lhs < rhsValNow;
  }
  return compareByOp(lhs, rhsValNow, op);
}

function fmtCondNum(n: number): string {
  if (!Number.isFinite(n)) return "NaN";
  const a = Math.abs(n);
  if (a >= 1000) return n.toFixed(2);
  if (a >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

/** One visual condition → human-readable pass/fail with values at bar `idx`. */
function formatConditionResult(cond: AlgoCondition, idx: number, ctx: ConditionEvalCtx): ConditionAuditLine {
  const lhsId = String(cond.indicator ?? "").trim() || "?";
  const op = String(cond.op ?? "equals");
  const opReadable = op.replace(/_/g, " ");
  const lhs = resolveIndicatorValue(lhsId, cond.period, idx, ctx);
  if (lhs == null) {
    return {
      ok: false,
      label: `${lhsId}${cond.period != null ? `(${cond.period})` : ""} — value unavailable at this bar`,
    };
  }

  let rhsValNow: number | null = null;
  let rhsValPrev: number | null = null;
  let rhsLabel = "";
  if (cond.rhs?.kind === "indicator") {
    const rid = String(cond.rhs.id ?? "");
    rhsValNow = resolveIndicatorValue(rid, cond.rhs.period, idx, ctx);
    rhsValPrev = resolveIndicatorValue(rid, cond.rhs.period, idx - 1, ctx);
    rhsLabel = `${rid}${cond.rhs.period != null ? `(${cond.rhs.period})` : ""}`;
  } else {
    rhsValNow = Number((cond.rhs && "value" in cond.rhs ? cond.rhs.value : 0) ?? 0);
    rhsValPrev = rhsValNow;
    rhsLabel = String(rhsValNow);
  }
  if (rhsValNow == null) {
    return { ok: false, label: `${lhsId} ${opReadable} ${rhsLabel} — right-hand value unavailable` };
  }

  const ok = evaluateCondition(cond, idx, ctx);

  if (op === "crosses_above" || op === "crosses_below") {
    const lhsPrev = resolveIndicatorValue(lhsId, cond.period, idx - 1, ctx);
    if (lhsPrev == null || rhsValPrev == null) {
      return { ok: false, label: `${lhsId} ${opReadable} ${rhsLabel} — need prior bar; unavailable` };
    }
    return {
      ok,
      label: `${opReadable}: ${lhsId} ${fmtCondNum(lhsPrev)}→${fmtCondNum(lhs)} vs ${rhsLabel} ${fmtCondNum(rhsValPrev)}→${fmtCondNum(rhsValNow)} → ${ok ? "PASS" : "FAIL"}`,
    };
  }
  return {
    ok,
    label: `${lhsId}${cond.period != null ? `(${cond.period})` : ""}=${fmtCondNum(lhs)} ${opReadable} ${rhsLabel}=${fmtCondNum(rhsValNow)} → ${ok ? "PASS" : "FAIL"}`,
  };
}

function indicatorSnapshotAtBar(idx: number, ctx: ConditionEvalCtx): Record<string, unknown> {
  return {
    PRICE: resolveIndicatorValue("PRICE", undefined, idx, ctx),
    RSI_14: resolveIndicatorValue("RSI", 14, idx, ctx),
    SMA_20: resolveIndicatorValue("SMA", 20, idx, ctx),
    EMA_12: resolveIndicatorValue("EMA", 12, idx, ctx),
    MACD: resolveIndicatorValue("MACD", undefined, idx, ctx),
    MACD_SIGNAL: resolveIndicatorValue("MACD_SIGNAL", undefined, idx, ctx),
    BB_UPPER: resolveIndicatorValue("BB_UPPER", undefined, idx, ctx),
    BB_LOWER: resolveIndicatorValue("BB_LOWER", undefined, idx, ctx),
    CHANGE_PCT_SNAPSHOT: ctx.realIndicators.changePct,
  };
}

function auditVisualGroupsToLines(
  groups: ConditionGroup[],
  groupLogic: "AND" | "OR",
  idx: number,
  ctx: ConditionEvalCtx,
): { ok: boolean; lines: ConditionAuditLine[] } {
  const lines: ConditionAuditLine[] = [];
  if (!groups.length) {
    return { ok: false, lines: [{ ok: false, label: "No condition groups configured" }] };
  }
  lines.push({ ok: true, label: `Top-level group combiner: ${groupLogic}` });
  groups.forEach((g, gi) => {
    const local = String(g.logic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND";
    const conds = Array.isArray(g.conditions) ? g.conditions : [];
    lines.push({ ok: true, label: `Group ${gi + 1} — inner logic ${local}, ${conds.length} condition(s)` });
    for (const c of conds) {
      const row = formatConditionResult(c, idx, ctx);
      lines.push({ ok: row.ok, label: `  • ${row.label}` });
    }
    const vals = conds.map((c) => evaluateCondition(c, idx, ctx));
    const gPass = !conds.length ? false : local === "OR" ? vals.some(Boolean) : vals.every(Boolean);
    lines.push({ ok: gPass, label: `  → Group ${gi + 1} aggregate: ${gPass ? "PASS" : "FAIL"}` });
  });
  const overall = evaluateConditionGroups(groups, groupLogic, idx, ctx);
  lines.push({ ok: overall, label: `══ All groups (${groupLogic}): ${overall ? "PASS" : "FAIL"}` });
  return { ok: overall, lines };
}

function evaluateConditionGroups(
  groups: ConditionGroup[],
  groupLogic: "AND" | "OR",
  idx: number,
  ctx: ConditionEvalCtx,
): boolean {
  if (!groups.length) return false;
  const groupResults = groups.map((g) => {
    const conditions = Array.isArray(g.conditions) ? g.conditions : [];
    if (!conditions.length) return false;
    const local = String(g.logic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND";
    const vals = conditions.map((c) => evaluateCondition(c, idx, ctx));
    return local === "OR" ? vals.some(Boolean) : vals.every(Boolean);
  });
  return groupLogic === "OR" ? groupResults.some(Boolean) : groupResults.every(Boolean);
}

function evaluateRawExpression(expression: string, idx: number, ctx: ConditionEvalCtx): boolean {
  const raw = String(expression ?? "").trim();
  if (!raw) return false;
  const tz = ctx.timeZone ?? "UTC";
  const onlyTime = /^\s*TIME_IS\s*\(\s*(\d{1,2}):(\d{2})\s*\)\s*$/i.exec(raw);
  if (onlyTime && ctx.timestamps && idx >= 0) {
    const ts = ctx.timestamps[idx];
    const hhmm = `${Number(onlyTime[1])}:${onlyTime[2].padStart(2, "0")}`;
    return evaluateClockMatch(ts, hhmm, tz);
  }
  let expr = raw.toUpperCase();
  const replaceIndicator = (rx: RegExp, resolver: (m: RegExpExecArray) => number | null) => {
    expr = expr.replace(rx, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const v = resolver(m);
      return Number.isFinite(v as number) ? String(v) : "NaN";
    });
  };

  replaceIndicator(/RSI\((\d+)\)/g, (m) => resolveIndicatorValue("RSI", Number(m[1]), idx, ctx));
  replaceIndicator(/EMA\((\d+)\)/g, (m) => resolveIndicatorValue("EMA", Number(m[1]), idx, ctx));
  replaceIndicator(/SMA\((\d+)\)/g, (m) => resolveIndicatorValue("SMA", Number(m[1]), idx, ctx));
  replaceIndicator(/\bMACD_SIGNAL\b/g, () => resolveIndicatorValue("MACD_SIGNAL", undefined, idx, ctx));
  replaceIndicator(/\bMACD_HIST\b/g, () => resolveIndicatorValue("MACD_HIST", undefined, idx, ctx));
  replaceIndicator(/\bMACD\b/g, () => resolveIndicatorValue("MACD", undefined, idx, ctx));
  replaceIndicator(/\bBB_UPPER\b/g, () => resolveIndicatorValue("BB_UPPER", undefined, idx, ctx));
  replaceIndicator(/\bBB_MIDDLE\b/g, () => resolveIndicatorValue("BB_MIDDLE", undefined, idx, ctx));
  replaceIndicator(/\bBB_LOWER\b/g, () => resolveIndicatorValue("BB_LOWER", undefined, idx, ctx));
  replaceIndicator(/\bCHANGE_PCT\b/g, () => resolveIndicatorValue("CHANGE_PCT", undefined, idx, ctx));
  replaceIndicator(/\bPRICE\b/g, () => resolveIndicatorValue("PRICE", undefined, idx, ctx));

  expr = expr.replace(/\bAND\b/g, "&&").replace(/\bOR\b/g, "||");
  expr = expr.replace(/(?<![<>!=])=(?!=)/g, "==");

  if (!/^[\d\s()+\-/*.<>=!&|NAN]+$/.test(expr)) return false;
  try {
    const out = Function(`"use strict"; return (${expr});`)();
    return Boolean(out);
  } catch {
    return false;
  }
}

function inferEntrySubtype(cfg: EntryConditionsConfig): "indicator_based" | "time_based" | "hybrid" {
  const s = String(cfg.strategySubtype ?? "").toLowerCase().trim();
  if (s === "time_based" || s === "hybrid" || s === "indicator_based") {
    return s;
  }
  const hasVisual = Array.isArray(cfg.groups) && cfg.groups.length > 0;
  const raw = String(cfg.rawExpression ?? "").trim();
  if (/^\s*TIME_IS\s*\(\s*\d{1,2}:\d{2}\s*\)\s*$/i.test(raw) && !hasVisual) {
    return "time_based";
  }
  return "indicator_based";
}

function buildCustomStrategyConditionAudit(
  subtype: "indicator_based" | "time_based" | "hybrid",
  entryCfg: EntryConditionsConfig,
  idx: number,
  ctx: ConditionEvalCtx,
  timestamps: number[],
  scanTimeZone: string,
): StrategyConditionAudit {
  const baseSnap: Record<string, unknown> = {
    barIndex: idx,
    barTimeIso: new Date(timestamps[idx] * 1000).toISOString(),
    evaluationTimeZone: scanTimeZone,
    ...indicatorSnapshotAtBar(idx, ctx),
  };

  if (subtype === "time_based") {
    const hhmm =
      String(entryCfg.clockEntryTime ?? "").trim() ||
      parseTimeFromRawExpression(String(entryCfg.rawExpression ?? "")) ||
      "";
    const ok = hhmm ? evaluateClockMatch(timestamps[idx], hhmm, scanTimeZone) : false;
    const wc = wallClockHM(timestamps[idx], scanTimeZone);
    const lines: ConditionAuditLine[] = [
      {
        ok,
        label: `Time entry target ${hhmm || "(missing)"} (${scanTimeZone}); bar wall-clock ${wc ? `${wc.h}:${String(wc.m).padStart(2, "0")}` : "?"} → ${ok ? "PASS" : "FAIL"}`,
      },
    ];
    return { kind: "custom_time", overallMatch: ok, lines, snapshot: baseSnap };
  }

  if (subtype === "hybrid") {
    const hhmm = String(entryCfg.clockEntryTime ?? "").trim();
    const timeOk = hhmm ? evaluateClockMatch(timestamps[idx], hhmm, scanTimeZone) : false;
    const wc = wallClockHM(timestamps[idx], scanTimeZone);
    const lines: ConditionAuditLine[] = [
      {
        ok: timeOk,
        label: `Clock gate ${hhmm || "(missing)"} (${scanTimeZone}); now ${wc ? `${wc.h}:${String(wc.m).padStart(2, "0")}` : "?"} → ${timeOk ? "PASS" : "FAIL"}`,
      },
      { ok: true, label: "── Indicator leg" },
    ];
    let indOk = false;
    if (entryCfg.mode === "raw") {
      const indExpr = stripTimeIsCalls(String(entryCfg.rawExpression ?? ""));
      indOk = indExpr.length > 0 ? evaluateRawExpression(indExpr, idx, ctx) : false;
      const rawFull = String(entryCfg.rawExpression ?? "").trim();
      lines.push({ ok: indOk, label: `Raw (stored): ${rawFull.slice(0, 280)}${rawFull.length > 280 ? "…" : ""}` });
      lines.push({ ok: indOk, label: `Indicator expression after TIME_IS stripped: ${indExpr || "(empty)"}` });
      lines.push({ ok: indOk, label: `Boolean eval at bar: ${indOk ? "TRUE" : "FALSE"}` });
    } else {
      const gl = String(entryCfg.groupLogic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND";
      const { ok, lines: inner } = auditVisualGroupsToLines(
        Array.isArray(entryCfg.groups) ? entryCfg.groups : [],
        gl,
        idx,
        ctx,
      );
      indOk = ok;
      lines.push(...inner);
    }
    const overall = timeOk && indOk;
    lines.push({
      ok: overall,
      label: `══ Hybrid combined (clock AND indicator leg): ${overall ? "PASS" : "FAIL"}`,
    });
    return { kind: "custom_hybrid", overallMatch: overall, lines, snapshot: baseSnap };
  }

  if (entryCfg.mode === "raw") {
    const raw = String(entryCfg.rawExpression ?? "").trim();
    const ok = evaluateRawExpression(raw, idx, ctx);
    const lines: ConditionAuditLine[] = [
      { ok: ok, label: `Raw expression: ${raw.slice(0, 320)}${raw.length > 320 ? "…" : ""}` },
      { ok: ok, label: `Evaluated at bar ${idx}: ${ok ? "TRUE" : "FALSE"}` },
    ];
    return { kind: "custom_raw", overallMatch: ok, lines, snapshot: baseSnap };
  }

  const gl = String(entryCfg.groupLogic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND";
  const { ok, lines: inner } = auditVisualGroupsToLines(
    Array.isArray(entryCfg.groups) ? entryCfg.groups : [],
    gl,
    idx,
    ctx,
  );
  return { kind: "custom_visual", overallMatch: ok, lines: inner, snapshot: baseSnap };
}

function customEntrySignalIfMatched(
  cs: {
    id: string;
    name: string;
    tradingMode: string;
    entryConditions?: EntryConditionsConfig | null;
  },
  timestamps: number[],
  c: number[],
  h: number[],
  l: number[],
  dataSource: string,
  indicatorSource: string,
  realIndicators: RealIndicators,
  requestedActions: Array<"BUY" | "SELL">,
  scanTimeZone: string,
): RawSignal[] {
  const entryCfg = cs.entryConditions;
  if (!entryCfg || typeof entryCfg !== "object") return [];
  const idx = c.length - 1;
  if (idx < 20) return [];

  const subtype = inferEntrySubtype(entryCfg);

  const ctx: ConditionEvalCtx = {
    c,
    h,
    l,
    realIndicators,
    rsiCache: new Map<number, number[]>(),
    smaCache: new Map<number, number[]>(),
    emaCache: new Map<number, number[]>(),
    timestamps,
    timeZone: scanTimeZone,
  };

  let match = false;

  if (subtype === "time_based") {
    const hhmm =
      String(entryCfg.clockEntryTime ?? "").trim() ||
      parseTimeFromRawExpression(String(entryCfg.rawExpression ?? "")) ||
      "";
    if (!hhmm) return [];
    match = evaluateClockMatch(timestamps[idx], hhmm, scanTimeZone);
  } else if (subtype === "hybrid") {
    const hhmm = String(entryCfg.clockEntryTime ?? "").trim();
    const timeOk = hhmm ? evaluateClockMatch(timestamps[idx], hhmm, scanTimeZone) : false;
    let indOk = false;
    if (entryCfg.mode === "raw") {
      const indExpr = stripTimeIsCalls(String(entryCfg.rawExpression ?? ""));
      indOk = indExpr.length > 0 ? evaluateRawExpression(indExpr, idx, ctx) : false;
    } else {
      indOk = evaluateConditionGroups(
        Array.isArray(entryCfg.groups) ? entryCfg.groups : [],
        String(entryCfg.groupLogic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND",
        idx,
        ctx,
      );
    }
    match = timeOk && indOk;
  } else {
    const hasVisual = Array.isArray(entryCfg.groups) && entryCfg.groups.length > 0;
    const hasRaw = typeof entryCfg.rawExpression === "string" && entryCfg.rawExpression.trim().length > 0;
    if (!hasVisual && !hasRaw) return [];
    match = entryCfg.mode === "raw"
      ? evaluateRawExpression(String(entryCfg.rawExpression ?? ""), idx, ctx)
      : evaluateConditionGroups(
        Array.isArray(entryCfg.groups) ? entryCfg.groups : [],
        String(entryCfg.groupLogic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND",
        idx,
        ctx,
      );
  }
  if (!match) return [];

  const conditionAudit = buildCustomStrategyConditionAudit(subtype, entryCfg, idx, ctx, timestamps, scanTimeZone);

  const lastTs = timestamps[idx];
  const d = new Date(lastTs * 1000);
  const allowed: Array<"BUY" | "SELL"> = cs.tradingMode === "LONG"
    ? ["BUY"]
    : cs.tradingMode === "SHORT"
    ? ["SELL"]
    : ["BUY", "SELL"];
  const actions = requestedActions.filter((a) => allowed.includes(a));
  if (!actions.length) return [];

  const sma20 = sma(c, 20);
  const r = rsi(c, 14);
  return actions.map((side) => ({
    strategyId: cs.id,
    strategyLabel: cs.name,
    entryIndex: idx,
    entryDate: d.toISOString().slice(0, 10),
    entryTime: d.toISOString(),
    entryTimestamp: lastTs * 1000,
    side,
    priceAtEntry: c[idx],
    isLive: true,
    conditionAudit,
    marketData: mkMarketData(idx, c, h, l, r, sma20, dataSource, indicatorSource),
  }));
}

/** Scheduled wall-clock exit (e.g. exit at 13:01) — opposite side to open position intent */
function clockExitSignalsIfMatched(
  cs: {
    id: string;
    name: string;
    tradingMode: string;
    exitConditions?: Record<string, unknown> | null;
  },
  timestamps: number[],
  c: number[],
  h: number[],
  l: number[],
  dataSource: string,
  indicatorSource: string,
  requestedActions: Array<"BUY" | "SELL">,
  scanTimeZone: string,
): RawSignal[] {
  const ex = cs.exitConditions && typeof cs.exitConditions === "object"
    ? (cs.exitConditions as { clockExitTime?: string }).clockExitTime
    : undefined;
  if (!ex || !String(ex).trim()) return [];
  const idx = c.length - 1;
  if (idx < 20) return [];
  if (!evaluateClockMatch(timestamps[idx], String(ex).trim(), scanTimeZone)) return [];

  const tm = String(cs.tradingMode ?? "LONG").toUpperCase();
  const exitSide: "BUY" | "SELL" | null = tm === "LONG"
    ? "SELL"
    : tm === "SHORT"
    ? "BUY"
    : null;
  if (!exitSide || !requestedActions.includes(exitSide)) return [];

  const sma20 = sma(c, 20);
  const r = rsi(c, 14);
  const lastTs = timestamps[idx];
  const d = new Date(lastTs * 1000);
  const exStr = String(ex).trim();
  const wc = wallClockHM(lastTs, scanTimeZone);
  const clockOk = true;
  const conditionAudit: StrategyConditionAudit = {
    kind: "clock_exit",
    overallMatch: clockOk,
    lines: [
      {
        ok: clockOk,
        label: `Scheduled exit time ${exStr} (${scanTimeZone}) matched bar at ${d.toISOString()} — wall ${wc ? `${wc.h}:${String(wc.m).padStart(2, "0")}` : "?"}`,
      },
      {
        ok: true,
        label: `Exit side ${exitSide} for trading mode ${tm} (flatten / cover per your rule)`,
      },
    ],
    snapshot: {
      barIndex: idx,
      barTimeIso: d.toISOString(),
      evaluationTimeZone: scanTimeZone,
      clockExitTime: exStr,
    },
  };
  return [{
    strategyId: cs.id,
    strategyLabel: `${cs.name} (time exit)`,
    entryIndex: idx,
    entryDate: d.toISOString().slice(0, 10),
    entryTime: d.toISOString(),
    entryTimestamp: lastTs * 1000,
    side: exitSide,
    priceAtEntry: c[idx],
    isLive: true,
    conditionAudit,
    marketData: mkMarketData(idx, c, h, l, r, sma20, dataSource, indicatorSource),
  }];
}

function mkMarketData(
  i: number,
  c: number[],
  h: number[],
  l: number[],
  r: number[],
  sma20: number[],
  dataSource?: string,
  indicatorSource?: string,
): RawSignal["marketData"] {
  const from = Math.max(0, i - 20);
  const high20 = i > from ? Math.max(...h.slice(from, i)) : null;
  const low20 = i > from ? Math.min(...l.slice(from, i)) : null;
  const rsi14 = Number.isFinite(r[i]) ? Number(r[i].toFixed(2)) : null;
  const s20 = Number.isFinite(sma20[i]) ? Number(sma20[i].toFixed(2)) : null;
  return {
    rsi14,
    sma20: s20,
    high20: Number.isFinite(high20 as number) ? Number((high20 as number).toFixed(2)) : null,
    low20: Number.isFinite(low20 as number) ? Number((low20 as number).toFixed(2)) : null,
    dataSource,
    indicatorSource,
  };
}

function detectEntries(
  strategy: string,
  c: number[],
  h: number[],
  l: number[],
  timestamps: number[],
  action: "BUY" | "SELL",
  maxSignals: number,
  useRealtimeEntry = false,
  dataSource = "unknown",
  indicatorSource = "computed",
): RawSignal[] {
  const n = c.length;
  if (n < 25) return [];
  const sma20 = sma(c, 20);
  const r = rsi(c, 14);
  const entries: RawSignal[] = [];
  let inTrade = false;
  const slPct = 2;
  const tpPct = 4;
  // Shorter lockout for intraday — 3 candles (15 min) vs 10 for daily
  const maxHold = useRealtimeEntry ? 3 : 10;
  const slM = action === "BUY" ? 1 - slPct / 100 : 1 + slPct / 100;
  const tpM = action === "BUY" ? 1 + tpPct / 100 : 1 - tpPct / 100;
  let entryPrice = 0;
  let hold = 0;

  const label = STRATEGY_LABELS[strategy] ?? strategy;
  const relaxed = useRealtimeEntry;

  for (let i = 20; i < n; i++) {
    if (inTrade) {
      hold++;
      const ratio = c[i] / entryPrice;
      const hitSl = action === "BUY" ? ratio <= slM : ratio >= slM;
      const hitTp = action === "BUY" ? ratio >= tpM : ratio <= tpM;
      if (hitSl || hitTp || hold >= maxHold) inTrade = false;
      continue;
    }

    const signal = checkSignal(strategy, action, i, c, h, l, r, sma20, relaxed);

    if (signal && entries.length < maxSignals) {
      const ei = useRealtimeEntry ? i : i + 1;
      if (ei >= n) continue;
      const d = new Date(timestamps[ei] * 1000);
      entries.push({
        strategyId: strategy,
        strategyLabel: label,
        entryIndex: ei,
        entryDate: d.toISOString().slice(0, 10),
        entryTime: d.toISOString(),
        entryTimestamp: timestamps[ei] * 1000,
        side: action,
        priceAtEntry: c[ei],
        marketData: mkMarketData(ei, c, h, l, r, sma20, dataSource, indicatorSource),
      });
      inTrade = true;
      entryPrice = c[ei];
      hold = 0;
    }
  }

  return entries.slice(-maxSignals);
}

/**
 * Evaluate the LAST few candles for every strategy to produce "LIVE / NOW" signals.
 * Checks the last 6 candles (30 min at 5m) to catch signals even if the very last candle is quiet.
 */
function evaluateRecentCandles(
  strategies: string[],
  c: number[],
  h: number[],
  l: number[],
  timestamps: number[],
  actions: Array<"BUY" | "SELL">,
  dataSource = "unknown",
  indicatorSource = "computed",
): RawSignal[] {
  const n = c.length;
  if (n < 25) return [];
  const sma20 = sma(c, 20);
  const r = rsi(c, 14);
  const out: RawSignal[] = [];
  const seen = new Set<string>();
  // Check last 6 candles, newest first, so we get the freshest signal per strategy+side
  const startIdx = Math.max(20, n - 6);

  for (let i = n - 1; i >= startIdx; i--) {
    const d = new Date(timestamps[i] * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toISOString();

    for (const strategy of strategies) {
      const label = STRATEGY_LABELS[strategy] ?? strategy;
      for (const action of actions) {
        const key = `${strategy}|${action}`;
        if (seen.has(key)) continue;
        const fires = checkSignal(strategy, action, i, c, h, l, r, sma20, true);
        if (fires) {
          seen.add(key);
          out.push({
            strategyId: strategy,
            strategyLabel: label,
            entryIndex: i,
            entryDate: dateStr,
            entryTime: timeStr,
            entryTimestamp: timestamps[i] * 1000,
            side: action,
            priceAtEntry: c[i],
            isLive: true,
            marketData: mkMarketData(i, c, h, l, r, sma20, dataSource, indicatorSource),
          });
        }
      }
    }
  }
  return out;
}

/** Join all text parts (Gemini 3.x may split across multiple parts). */
type GeminiLikeResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

function geminiAllText(data: GeminiLikeResponse): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
}

function stripMarkdownFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

/** Extract a top-level JSON array by bracket matching (handles nested objects / brackets in strings). */
function extractBalancedJsonArray(s: string): string | null {
  const start = s.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonArrayFromModelText(text: string): unknown[] | null {
  const cleaned = stripMarkdownFence(text);
  const tryValue = (j: unknown): unknown[] | null => {
    if (Array.isArray(j)) return j;
    if (j && typeof j === "object" && !Array.isArray(j)) {
      for (const v of Object.values(j as Record<string, unknown>)) {
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return v;
      }
    }
    return null;
  };
  try {
    const j = JSON.parse(cleaned);
    const arr = tryValue(j);
    if (arr) return arr;
  } catch { /* try extract */ }
  const slice = extractBalancedJsonArray(cleaned) ?? extractBalancedJsonArray(text);
  if (!slice) return null;
  try {
    const j = JSON.parse(slice);
    return tryValue(j);
  } catch {
    return null;
  }
}

type MergedAiRow = {
  probabilityScore: number;
  verdict: string;
  rationale: string;
  entryExitRuleSummary: string;
  liveViability: string;
  rejectionDetail: string;
  /** Populated when verdict is confirm — why the model + rules accepted the setup */
  confirmationDetail: string;
  whyThisScore: string;
  scoreSource: string;
};

function strField(v: unknown): string {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : "";
}

/**
 * Model text often cites its pre-blend score; we show heuristic+Gemini blend in the UI.
 * Strip those stale claims so the headline number never fights the paragraph.
 */
function stripStaleScoreClaims(text: string, finalScore: number): string {
  let t = (text || "").trim();
  if (!t) return t;
  t = t.replace(/\b(?:scored at|scored)\s*:?\s*\d{1,3}(?:\s*\/\s*100)?\b/gi, "");
  t = t.replace(/\b(?:a\s+)?score\s+of\s+\d{1,3}(?:\s*\/\s*100)?\b/gi, "");
  t = t.replace(/\bgiven\s+(?:a\s+)?score\s+of\s+\d{1,3}\b/gi, "");
  t = t.replace(/\bassigned\s+(?:a\s+)?(?:score|rating)\s+of\s+\d{1,3}\b/gi, "");
  t = t.replace(/\bcomposite\s*(?:→|->)\s*\d{1,3}\s*\/\s*100\b/gi, `Composite → ${finalScore}/100`);
  t = t.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").replace(/^[,;.:\s]+/, "").trim();
  return t;
}

/** Single source of truth line + cleaned reasoning (no other 0–100 headline in prose). */
function whyThisScoreAligned(body: string, finalScore: number): string {
  const cleaned = stripStaleScoreClaims(body, finalScore);
  if (!cleaned) return `Blended score ${finalScore}/100 (rules + model).`;
  return `Blended score ${finalScore}/100 — ${cleaned}`;
}

/** Rule-based quality read so we never silently default to 50 with no basis. */
function heuristicMergeRow(raw: RawSignal, ind: RealIndicators | null): MergedAiRow {
  const rsiBar = raw.marketData?.rsi14;
  const rsiSnap = ind?.rsi14;
  const rsi = rsiBar != null && Number.isFinite(rsiBar) ? rsiBar : rsiSnap;
  const price = raw.priceAtEntry;
  let score = 54;
  const reasons: string[] = [];

  if (rsi != null && Number.isFinite(rsi)) {
    if (raw.side === "BUY") {
      if (rsi < 32) {
        score += 20;
        reasons.push(`RSI ${rsi.toFixed(1)} is deeply oversold — historically better for dip-style longs.`);
      } else if (rsi < 42) {
        score += 11;
        reasons.push(`RSI ${rsi.toFixed(1)} leans oversold for a BUY.`);
      } else if (rsi > 64) {
        score -= 17;
        reasons.push(`RSI ${rsi.toFixed(1)} is stretched up — chasing risk on fresh BUY.`);
      } else if (rsi > 52) {
        score -= 7;
        reasons.push(`RSI ${rsi.toFixed(1)} is neutral-high for a BUY context.`);
      } else {
        reasons.push(`RSI ${rsi.toFixed(1)} is mid-range for BUY.`);
      }
    } else {
      if (rsi > 68) {
        score += 20;
        reasons.push(`RSI ${rsi.toFixed(1)} is overbought — aligns with exit/short-style SELL.`);
      } else if (rsi > 58) {
        score += 11;
        reasons.push(`RSI ${rsi.toFixed(1)} leans overbought for SELL.`);
      } else if (rsi < 36) {
        score -= 17;
        reasons.push(`RSI ${rsi.toFixed(1)} is washed out — weak timing for exit/short.`);
      } else if (rsi < 48) {
        score -= 7;
        reasons.push(`RSI ${rsi.toFixed(1)} is low for a SELL/exit read.`);
      } else {
        reasons.push(`RSI ${rsi.toFixed(1)} is mid-range for SELL.`);
      }
    }
  } else {
    reasons.push("RSI missing at this bar — score leans on pattern + freshness only.");
  }

  if (ind?.bbLower != null && ind?.bbUpper != null && price > 0) {
    if (raw.side === "BUY" && price <= ind.bbLower * 1.012) {
      score += 7;
      reasons.push("Price near/below lower Bollinger — mean-reversion long context.");
    }
    if (raw.side === "SELL" && price >= ind.bbUpper * 0.988) {
      score += 7;
      reasons.push("Price near/above upper Bollinger — take-profit / fade context.");
    }
  }

  if (ind?.macdLine != null && ind?.macdSignal != null) {
    const d = ind.macdLine - ind.macdSignal;
    if (raw.side === "BUY") {
      if (d > 0) {
        score += 4;
        reasons.push("MACD line above signal — momentum not fighting the long.");
      } else {
        score -= 5;
        reasons.push("MACD line below signal — momentum weak vs the BUY cue.");
      }
    } else {
      if (d < 0) {
        score += 4;
        reasons.push("MACD line below signal — momentum supports exit/short.");
      } else {
        score -= 5;
        reasons.push("MACD still positive — exit/short fights short-term trend.");
      }
    }
  }

  const ts = raw.entryTimestamp ?? (raw.entryTime ? new Date(raw.entryTime).getTime() : NaN);
  if (Number.isFinite(ts)) {
    const ageDays = (Date.now() - ts) / 86400000;
    if (!raw.isLive && ageDays > 10) {
      const pen = Math.min(14, Math.floor(ageDays / 7));
      score -= pen;
      reasons.push(`Signal is ~${Math.round(ageDays)}d old — discretionary weight decays.`);
    }
  }

  if (raw.isLive) {
    score += 5;
    reasons.push("Matches latest bar — actionable now if liquidity and risk limits allow.");
  }

  score = Math.max(14, Math.min(93, Math.round(score)));
  const verdict = score >= 69 ? "confirm" : score <= 37 ? "reject" : "review";
  const whyThisScore = reasons.join(" ");
  const entryExitRuleSummary = raw.side === "BUY"
    ? `Strategy rule produced a long (BUY) candidate for “${raw.strategyLabel}”.`
    : `Strategy rule produced an exit/short (SELL) candidate for “${raw.strategyLabel}”.`;
  const liveViability = raw.isLive
    ? "Live: conditions match the current candle; invalid if a gap, headline, or volatility regime breaks the setup."
    : "";
  const rejectionDetail = verdict === "reject"
    ? `Rejected on rule-based read: ${whyThisScore}`
    : verdict === "review"
    ? `Review bucket — mixed evidence: ${whyThisScore}`
    : "";
  const rationale = `${whyThisScore} Composite → ${score}/100 (${verdict}).`;
  const confirmationDetail = verdict === "confirm"
    ? stripStaleScoreClaims(`Rule-based confirm: ${whyThisScore}`, score)
    : "";

  return {
    probabilityScore: score,
    verdict,
    rationale,
    entryExitRuleSummary,
    liveViability,
    rejectionDetail,
    confirmationDetail,
    whyThisScore,
    scoreSource: "heuristic",
  };
}

/** Map AI rows by strategyId+entryDate+side, blend with heuristic (no blind 50s). */
function mergeAiScoresIntoRaw(
  raw: RawSignal[],
  parsed: unknown[] | null,
  ind: RealIndicators | null,
): MergedAiRow[] {
  const map = new Map<string, Record<string, unknown>>();
  if (parsed) {
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const sid = String(r.strategyId ?? "");
      const ed = String(r.entryDate ?? "");
      const side = String(r.side ?? "BUY");
      if (sid && ed) {
        map.set(`${sid}|${ed}|${side}`, r);
        map.set(`${sid}|${ed}`, r);
      }
    }
  }

  return raw.map((s) => {
    const h = heuristicMergeRow(s, ind);
    const r = map.get(`${s.strategyId}|${s.entryDate}|${s.side}`) ?? map.get(`${s.strategyId}|${s.entryDate}`);

    if (!r) {
      const extra = parsed === null
        ? " Gemini pass failed or empty — showing rule-based breakdown only."
        : " No matching AI row — showing rule-based breakdown only.";
      return {
        ...h,
        rationale: h.rationale + extra,
        scoreSource: "heuristic",
      };
    }

    const aiScoreRaw = r.probabilityScore;
    const aiScore = typeof aiScoreRaw === "number" && Number.isFinite(aiScoreRaw)
      ? Math.max(0, Math.min(100, aiScoreRaw))
      : null;
    const aiVerdict = typeof r.verdict === "string" ? r.verdict.toLowerCase() : "";
    const aiRationale = strField(r.rationale);
    const aiEntry = strField(r.entryExitRuleSummary);
    const aiLive = strField(r.liveViability);
    const aiReject = strField(r.rejectionDetail);
    const aiConfirm = strField(r.confirmationDetail);
    const aiWhy = strField(r.whyThisScore);

    if (aiScore === null) {
      const fs = h.probabilityScore;
      const confirmText = h.verdict === "confirm"
        ? stripStaleScoreClaims(aiConfirm || h.confirmationDetail, fs)
        : "";
      return {
        ...h,
        whyThisScore: whyThisScoreAligned(aiWhy || h.whyThisScore, fs),
        rationale:
          `${stripStaleScoreClaims((aiRationale || h.rationale) + " (AI omitted numeric score; rule-based score used.)", fs)} Same blended score as the headline: ${fs}/100.`,
        rejectionDetail: stripStaleScoreClaims(h.rejectionDetail, fs),
        confirmationDetail: confirmText,
        scoreSource: "heuristic",
      };
    }

    const aiVague = aiScore === 50 && aiRationale.length < 50;
    const blended = aiVague
      ? Math.round(0.22 * aiScore + 0.78 * h.probabilityScore)
      : Math.round(0.52 * aiScore + 0.48 * h.probabilityScore);
    const probabilityScore = Math.max(14, Math.min(93, blended));

    const verdictOk = aiVerdict === "confirm" || aiVerdict === "reject" || aiVerdict === "review";
    const verdict = aiVague
      ? h.verdict
      : verdictOk
      ? aiVerdict
      : h.verdict;

    const entryExitRuleSummary = aiEntry || h.entryExitRuleSummary;
    const whyThisScore = whyThisScoreAligned(aiWhy || h.whyThisScore, probabilityScore);
    const liveViability = s.isLive ? (aiLive || h.liveViability) : "";
    let rejectionDetail = aiReject || h.rejectionDetail;
    if (verdict === "reject" && !rejectionDetail) {
      rejectionDetail = `Rejected: ${whyThisScore}`;
    }
    if (verdict === "review" && !rejectionDetail) {
      rejectionDetail = `Neither clean accept nor hard reject: ${whyThisScore}`;
    }
    if (verdict === "confirm") {
      rejectionDetail = "";
    }
    rejectionDetail = stripStaleScoreClaims(rejectionDetail, probabilityScore);

    let confirmationDetail = "";
    if (verdict === "confirm") {
      confirmationDetail = stripStaleScoreClaims(
        aiConfirm ||
          `Model: ${stripStaleScoreClaims(aiRationale || "Read supports a confirm at this bar.", probabilityScore)} Rule stack: ${stripStaleScoreClaims(h.whyThisScore, probabilityScore)}`,
        probabilityScore,
      );
    }

    const rationaleCore = aiVague
      ? `${h.whyThisScore} Model returned a neutral score with thin text; prioritizing structured rule read.`
      : `${aiRationale || "Model assessment."} Rule-based cross-check: ${h.whyThisScore}`;
    const rationale = `${stripStaleScoreClaims(rationaleCore, probabilityScore)} Same blended score as the headline: ${probabilityScore}/100.`;

    return {
      probabilityScore,
      verdict,
      rationale,
      entryExitRuleSummary,
      liveViability,
      rejectionDetail,
      confirmationDetail,
      whyThisScore,
      scoreSource: aiVague ? "heuristic+gemini" : "gemini+heuristic",
    };
  });
}

/**
 * After the signal bar, measure max favorable vs adverse excursion on the SAME series used for detection.
 * Not a full trade backtest — informational only.
 */
function simpleForwardRead(
  entryIndex: number,
  side: "BUY" | "SELL",
  priceAtEntry: number,
  h: number[],
  l: number[],
  isLive: boolean,
): {
  simpleOutcomeLabel: string;
  simpleOutcomeNote: string;
  forwardProbeBars: number;
  forwardMaxFavorablePct: number | null;
  forwardMaxAdversePct: number | null;
} {
  const n = h.length;
  if (priceAtEntry <= 0 || entryIndex < 0 || entryIndex >= n || h.length !== l.length) {
    return {
      simpleOutcomeLabel: "unknown",
      simpleOutcomeNote: "Insufficient aligned OHLC data for a forward read.",
      forwardProbeBars: 0,
      forwardMaxFavorablePct: null,
      forwardMaxAdversePct: null,
    };
  }
  if (isLive || entryIndex >= n - 1) {
    return {
      simpleOutcomeLabel: "pending",
      simpleOutcomeNote:
        "Live or last bar in series — no subsequent candles in this snapshot to score follow-through.",
      forwardProbeBars: 0,
      forwardMaxFavorablePct: null,
      forwardMaxAdversePct: null,
    };
  }
  const maxBars = Math.min(20, n - 1 - entryIndex);
  let maxFav = 0;
  let maxAdv = 0;
  for (let i = 1; i <= maxBars; i++) {
    const hi = h[entryIndex + i];
    const lo = l[entryIndex + i];
    if (side === "BUY") {
      maxFav = Math.max(maxFav, (hi - priceAtEntry) / priceAtEntry);
      maxAdv = Math.max(maxAdv, (priceAtEntry - lo) / priceAtEntry);
    } else {
      maxFav = Math.max(maxFav, (priceAtEntry - lo) / priceAtEntry);
      maxAdv = Math.max(maxAdv, (hi - priceAtEntry) / priceAtEntry);
    }
  }
  const favPct = maxFav * 100;
  const advPct = maxAdv * 100;
  let label: string;
  let note: string;
  const thr = 0.12;
  if (side === "BUY") {
    if (favPct >= thr && favPct > advPct * 1.08) {
      label = "follow_through";
      note =
        `Next ${maxBars} bars: favorable excursion ~${favPct.toFixed(2)}% vs adverse ~${advPct.toFixed(2)}% from entry (high/low path).`;
    } else if (advPct >= thr && advPct > favPct * 1.08) {
      label = "adverse_first";
      note =
        `Next ${maxBars} bars: price worked against the long ~${advPct.toFixed(2)}% before favoring ~${favPct.toFixed(2)}%.`;
    } else {
      label = "mixed";
      note =
        `Next ${maxBars} bars: mixed path (favorable ~${favPct.toFixed(2)}%, adverse ~${advPct.toFixed(2)}%).`;
    }
  } else {
    if (favPct >= thr && favPct > advPct * 1.08) {
      label = "follow_through";
      note =
        `Next ${maxBars} bars: move aligned with exit/short read ~${favPct.toFixed(2)}% vs bounce ~${advPct.toFixed(2)}%.`;
    } else if (advPct >= thr && advPct > favPct * 1.08) {
      label = "adverse_first";
      note =
        `Next ${maxBars} bars: rally vs the exit/short read ~${advPct.toFixed(2)}% vs favorable ~${favPct.toFixed(2)}%.`;
    } else {
      label = "mixed";
      note =
        `Next ${maxBars} bars: mixed excursion (favorable ~${favPct.toFixed(2)}%, adverse ~${advPct.toFixed(2)}%).`;
    }
  }
  return {
    simpleOutcomeLabel: label,
    simpleOutcomeNote: note,
    forwardProbeBars: maxBars,
    forwardMaxFavorablePct: Math.round(favPct * 100) / 100,
    forwardMaxAdversePct: Math.round(advPct * 100) / 100,
  };
}

/** Compact pass/fail trace for custom strategies — passed to Gemini for aligned scoring. */
function conditionTraceForPrompt(x: RawSignal): string | null {
  const a = x.conditionAudit;
  if (!a?.lines?.length) return null;
  return a.lines.slice(0, 18).map((l) => `${l.ok ? "PASS" : "FAIL"}: ${l.label}`).join("\n");
}

async function scoreWithGemini(
  symbol: string,
  yahooSymbol: string,
  lastClose: number,
  raw: RawSignal[],
  indicators: RealIndicators | null,
  post?: { result?: string; actualChangePercent?: number; predictedDirection?: string },
): Promise<MergedAiRow[]> {
  const indForMerge = indicators ?? null;
  if (raw.length === 0) return [];

  if (!GEMINI_API_KEY) {
    return mergeAiScoresIntoRaw(raw, null, indForMerge);
  }

  const indBlock = indicators
    ? `\nReal-time Indicators (from ${indicators.source}):
RSI(14): ${indicators.rsi14?.toFixed(1) ?? "N/A"}
MACD Line: ${indicators.macdLine?.toFixed(3) ?? "N/A"}, Signal: ${indicators.macdSignal?.toFixed(3) ?? "N/A"}
Bollinger Bands: Upper ${indicators.bbUpper?.toFixed(2) ?? "N/A"} | Middle ${indicators.bbMiddle?.toFixed(2) ?? "N/A"} | Lower ${indicators.bbLower?.toFixed(2) ?? "N/A"}
Current Price: ${indicators.currentPrice?.toFixed(2) ?? "N/A"}, Change: ${indicators.changePct?.toFixed(2) ?? "N/A"}%`
    : "\nNo external indicator data available — using OHLCV-computed values.";

  const prompt = `You are a trading risk assistant. Score ONLY real historical or live-detected signals (not forecasts). Not financial advice.
BUY = long entry candidate. SELL = exit or short-side candidate.
Do NOT assume future price paths. Score based on indicator snapshot + bar context.

Symbol: ${symbol} (data: ${yahooSymbol})
Last close: ${lastClose}
${indBlock}
${post?.result ? `Post-analysis outcome context: ${post.result}, actual move ~${post.actualChangePercent ?? "?"}%, predicted direction was ${post.predictedDirection ?? "?"}.` : "No post-analysis context."}

Signals (JSON array):
${JSON.stringify(raw.map((x) => ({
    strategyId: x.strategyId,
    strategyLabel: x.strategyLabel,
    entryDate: x.entryDate,
    side: x.side,
    priceAtEntry: x.priceAtEntry,
    isLive: x.isLive ?? false,
    marketData: x.marketData ?? null,
    customConditionKind: x.conditionAudit?.kind ?? null,
    customConditionTrace: conditionTraceForPrompt(x),
  })))}

When customConditionTrace is present, the signal already satisfied that rule stack on this bar — your score and verdict must agree with those PASS lines (do not contradict the documented checks).

Return ONLY a JSON array (no markdown), SAME LENGTH AND SAME ORDER as input. Each object MUST include:
{ "strategyId": string, "entryDate": string, "side": string,
  "probabilityScore": number (0-100; spread scores when setups differ — avoid giving every row 50),
  "verdict": "confirm" | "reject" | "review",
  "rationale": string (2-4 sentences; cite RSI/MACD/BB or say explicitly if missing),
  "entryExitRuleSummary": string (one sentence: what the strategy rule implies for this bar),
  "whyThisScore": string (indicator + context only; do NOT write a different numeric score here — the server blends your probabilityScore with rules; if you mention a score it must equal probabilityScore),
  "liveViability": string (empty "" if not live; if live, why it could work OR what breaks it),
  "rejectionDetail": string (if verdict is reject or review: 2-3 sentences why not a clean confirm, cite indicators; if confirm: ""),
  "confirmationDetail": string (if verdict is confirm: 2-3 sentences why this setup passes — cite RSI/MACD/BB/bar context and rule alignment; if reject or review: "") }

Scoring guide:
- BUY: higher if oversold RSI, price near lower BB, MACD not bearish; lower if overbought or stale without reset.
- SELL: higher if overbought RSI, price near upper BB, MACD not bullish; lower if washed-out RSI.
- Live signals: mention immediacy and gap/news risk.
- If evidence is mixed, use verdict "review" and explain the conflict in rejectionDetail.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        // Many signals × long rationales can exceed 2k tokens and truncate mid-JSON
        maxOutputTokens: 8192,
        temperature: 0.2,
        topP: 0.9,
        // Same as suggest-strategy — steers model to emit JSON only
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`Gemini ${res.status} (${GEMINI_MODEL}):`, errText);
    return mergeAiScoresIntoRaw(raw, null, indForMerge);
  }
  let data: GeminiLikeResponse = {};
  try {
    data = await res.json() as GeminiLikeResponse;
  } catch (e) {
    console.error("Gemini JSON decode failed:", e);
    return mergeAiScoresIntoRaw(raw, null, indForMerge);
  }
  const text = geminiAllText(data);
  const finish = (data as { candidates?: Array<{ finishReason?: string }> })?.candidates?.[0]?.finishReason;
  if (!text.trim()) {
    console.error("Gemini empty output", { finish, snippet: JSON.stringify(data).slice(0, 600) });
    return mergeAiScoresIntoRaw(raw, null, indForMerge);
  }
  const parsed = parseJsonArrayFromModelText(text);
  if (!parsed) {
    console.error("Gemini JSON parse failed; text head:", text.slice(0, 1500));
    return mergeAiScoresIntoRaw(raw, null, indForMerge);
  }
  return mergeAiScoresIntoRaw(raw, parsed, indForMerge);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  }
  const headers = { "Content-Type": "application/json", ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS" };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const digestSecret = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";
    const digestUserId = (req.headers.get("x-digest-user-id") ?? "").trim();

    let user: { id: string; email?: string | null };

    if (digestSecret && req.headers.get("x-digest-secret") === digestSecret && digestUserId) {
      const { data: adminData, error: adminErr } = await supabase.auth.admin.getUserById(digestUserId);
      if (adminErr || !adminData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }
      user = adminData.user;
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }
      const { data: { user: u }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authErr || !u) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }
      user = u;
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const scanStartedAt = new Date().toISOString();
    const symbol = String(body.symbol ?? "").trim();
    const strategies = Array.isArray(body.strategies) ? body.strategies as string[] : [];
    // Always scan BOTH directions so users see all entry (BUY) and exit (SELL) opportunities.
    const actionParam = String(body.action ?? "BOTH").toUpperCase();
    const scanActions: Array<"BUY" | "SELL"> =
      actionParam === "BUY" ? ["BUY"] : actionParam === "SELL" ? ["SELL"] : ["BUY", "SELL"];
    const days = Math.min(730, Math.max(60, Number(body.days) || 365));
    const intradayInterval = String(body.intradayInterval ?? "5m");
    const intradayLookbackMinutes = Math.min(7 * 24 * 60, Math.max(60, Number(body.intradayLookbackMinutes) || (5 * 24 * 60)));
    const postAnalysis = body.postAnalysis as {
      result?: string;
      actualChangePercent?: number;
      predictedDirection?: string;
    } | undefined;

    // Custom user-created strategies: each has { id, name, baseType, tradingMode, stopLossPct, takeProfitPct }
    type CustomStrategyConfig = {
      id: string;
      name: string;
      baseType: string;
      tradingMode: string;
      stopLossPct: number;
      takeProfitPct: number;
      isIntraday?: boolean;
      entryConditions?: EntryConditionsConfig | null;
      exitConditions?: Record<string, unknown> | null;
      positionConfig?: Record<string, unknown> | null;
      riskConfig?: Record<string, unknown> | null;
      chartConfig?: Record<string, unknown> | null;
      executionDays?: number[];
      marketType?: string;
    };
    const customStrategies = Array.isArray(body.customStrategies)
      ? (body.customStrategies as CustomStrategyConfig[])
      : [];

    if (!symbol) {
      return new Response(JSON.stringify({ error: "symbol is required" }), { status: 400, headers });
    }
    if (!strategies.length && !customStrategies.length) {
      return new Response(JSON.stringify({ error: "strategies or customStrategies required" }), { status: 400, headers });
    }

    const yahooSymbol = normalizeToYahooSymbol(symbol);
    const assetType = detectAssetType(yahooSymbol);
    const isIndian = yahooSymbol.endsWith(".NS") || yahooSymbol.endsWith(".BO");
    const nowSec = Math.floor(Date.now() / 1000);
    const period2 = nowSec;
    const period1Intraday = period2 - intradayLookbackMinutes * 60;

    let t: number[] = [];
    let c: number[] = [];
    let h: number[] = [];
    let l: number[] = [];
    let usedInterval = "1d";
    let dataSource = "yahoo";

    // ── Multi-source candle pipeline: TwelveData → Yahoo intraday → Yahoo daily → Alpha Vantage ──
    // 1) TwelveData intraday (primary for US/crypto/forex)
    if (!isIndian) {
      const tdResult = await fetchTwelveDataCandles(yahooSymbol, assetType, intradayInterval, 500);
      if (tdResult && tdResult.c.length >= 10) {
        t = tdResult.t; c = tdResult.c; h = tdResult.h; l = tdResult.l;
        usedInterval = intradayInterval; dataSource = "twelvedata";
        console.log(`Candles: TwelveData ${intradayInterval} (${c.length} bars) for ${yahooSymbol}`);
      }
    }

    // 2) Yahoo Finance intraday (primary for Indian stocks, fallback for others)
    if (!c.length) {
      const seq = [intradayInterval, "15m", "60m"];
      for (const interval of seq) {
        try {
          const r = await fetchYahooChart({ yahooSymbol, period1: period1Intraday, period2, interval });
          if (r.c.length >= 10) {
            t = r.t; c = r.c; h = r.h; l = r.l; usedInterval = r.interval;
            dataSource = "yahoo"; console.log(`Candles: Yahoo ${interval} (${c.length} bars)`);
            break;
          }
        } catch { /* try next */ }
      }
    }

    // 3) Yahoo Finance daily
    if (!c.length) {
      try {
        const d = await fetchYahooDaily(yahooSymbol, days);
        t = d.t; c = d.c; h = d.h; l = d.l; usedInterval = "1d";
        dataSource = "yahoo-daily"; console.log(`Candles: Yahoo daily (${c.length} bars)`);
      } catch { /* try Alpha Vantage */ }
    }

    // 4) Alpha Vantage daily (final fallback for US stocks)
    if (!c.length && !isIndian) {
      const avResult = await fetchAlphaVantageDailyCandles(yahooSymbol);
      if (avResult && avResult.c.length >= 10) {
        t = avResult.t; c = avResult.c; h = avResult.h; l = avResult.l;
        usedInterval = "1d"; dataSource = "alphavantage";
        console.log(`Candles: Alpha Vantage daily (${c.length} bars) for ${yahooSymbol}`);
      }
    }

    if (!c.length) {
      return new Response(JSON.stringify({ error: "Could not fetch price data from any source" }), { status: 502, headers });
    }

    // ── Fetch real indicators from APIs (enriches Gemini scoring context) ──
    const realIndicators = await fetchRealIndicators(yahooSymbol, assetType, c);
    /** Wall-clock evaluation for TIME_IS / clock exit (Indian sessions → IST; else UTC) */
    const scanTimeZone = isIndian ? "Asia/Kolkata" : "UTC";
    const maxPerStrategy = 4;
    const allRaw: RawSignal[] = [];
    const realtimeMode = usedInterval !== "1d";

    // 1) Historical signal detection for built-in strategies
    const validIds = strategies
      .map((s) => String(s).toLowerCase().trim())
      .filter((id) => STRATEGY_LABELS[id] || id === "pairs_trading");
    for (const action of scanActions) {
      for (const id of validIds) {
        const sigs = detectEntries(id, c, h, l, t, action, maxPerStrategy, realtimeMode, dataSource, realIndicators.source);
        allRaw.push(...sigs);
      }
    }

    // 1b) Custom user-created strategies:
    //     - if entry_conditions are configured, evaluate those directly on the latest candle
    //     - otherwise fall back to baseType detection logic.
    const customLabelMap: Record<string, string> = {};
    const hasCustomConditions = (cs: CustomStrategyConfig): boolean => {
      const cfg = cs.entryConditions;
      if (!cfg || typeof cfg !== "object") return false;
      const st = String((cfg as EntryConditionsConfig).strategySubtype ?? "").toLowerCase();
      if (st === "time_based" || st === "hybrid") return true;
      const hasVisual = Array.isArray(cfg.groups) && cfg.groups.length > 0;
      const hasRaw = typeof cfg.rawExpression === "string" && cfg.rawExpression.trim().length > 0;
      return hasVisual || hasRaw;
    };
    for (const cs of customStrategies) {
      const baseType = String(cs.baseType ?? "trend_following").toLowerCase().trim();
      if (!STRATEGY_LABELS[baseType]) continue;
      const csId = String(cs.id);
      customLabelMap[csId] = cs.name;
      // Register label for custom strategy so it shows its name, not the base type
      STRATEGY_LABELS[csId] = cs.name;
      const conditionalSignals = customEntrySignalIfMatched(
        {
          id: csId,
          name: cs.name,
          tradingMode: String(cs.tradingMode ?? "BOTH").toUpperCase(),
          entryConditions: cs.entryConditions ?? null,
        },
        t,
        c,
        h,
        l,
        dataSource,
        realIndicators.source,
        realIndicators,
        scanActions,
        scanTimeZone,
      );
      const scheduledExitSignals = clockExitSignalsIfMatched(
        {
          id: csId,
          name: cs.name,
          tradingMode: String(cs.tradingMode ?? "BOTH"),
          exitConditions: cs.exitConditions ?? null,
        },
        t,
        c,
        h,
        l,
        dataSource,
        realIndicators.source,
        scanActions,
        scanTimeZone,
      );
      if (conditionalSignals.length > 0) {
        allRaw.push(...conditionalSignals);
      }
      allRaw.push(...scheduledExitSignals);
      if (conditionalSignals.length > 0) {
        continue;
      }
      const csActions: Array<"BUY" | "SELL"> =
        cs.tradingMode === "LONG" ? ["BUY"]
          : cs.tradingMode === "SHORT" ? ["SELL"]
          : ["BUY", "SELL"];
      for (const action of csActions) {
        // detectEntries uses the baseType logic but we override the strategyId & label
        const sigs = detectEntries(baseType, c, h, l, t, action, maxPerStrategy, realtimeMode, dataSource, realIndicators.source);
        for (const sig of sigs) {
          sig.strategyId = csId;
          sig.strategyLabel = cs.name;
        }
        allRaw.push(...sigs);
      }
    }

    // 2) LIVE "right now" evaluation — checks the latest candle for every strategy+direction.
    const allScanIds = [...validIds];
    const customBaseMap: Record<string, string> = {};
    for (const cs of customStrategies) {
      if (hasCustomConditions(cs)) continue;
      const csId = String(cs.id);
      const baseType = String(cs.baseType ?? "trend_following").toLowerCase().trim();
      if (!STRATEGY_LABELS[baseType] && baseType !== csId) continue;
      allScanIds.push(baseType); // evaluate the base type, then relabel
      customBaseMap[baseType] = customBaseMap[baseType] || csId;
    }
    const liveSignals = evaluateRecentCandles(allScanIds, c, h, l, t, scanActions, dataSource, realIndicators.source);
    // Relabel live signals from custom strategy base types
    for (const ls of liveSignals) {
      const csId = customBaseMap[ls.strategyId];
      if (csId && customLabelMap[csId]) {
        ls.strategyId = csId;
        ls.strategyLabel = customLabelMap[csId];
      }
    }

    // Dedup: only add live signals that aren't already in allRaw (same strategy+side+candle)
    const existingKeys = new Set(allRaw.map((s) => `${s.strategyId}|${s.side}|${s.entryIndex}`));
    for (const ls of liveSignals) {
      const key = `${ls.strategyId}|${ls.side}|${ls.entryIndex}`;
      if (!existingKeys.has(key)) {
        allRaw.push(ls);
        existingKeys.add(key);
      }
    }

    // No projected/upcoming “entries” — only live + historical detections.

    // Sort: live first, then more recent bars, then by index.
    allRaw.sort((a, b) => {
      const aPri = a.isLive ? 2 : 1;
      const bPri = b.isLive ? 2 : 1;
      if (aPri !== bPri) return bPri - aPri;
      const ta = a.entryTimestamp ?? 0;
      const tb = b.entryTimestamp ?? 0;
      if (ta !== tb) return tb - ta;
      return b.entryIndex - a.entryIndex;
    });
    const capped = allRaw.slice(0, 80);
    const scored = await scoreWithGemini(symbol, yahooSymbol, c[c.length - 1] ?? 0, capped, realIndicators, postAnalysis);
    const scanEvaluatedAt = new Date().toISOString();

    const merged = capped.map((rawSig, i) => {
      const ai = scored[i];
      const fwd = simpleForwardRead(
        rawSig.entryIndex,
        rawSig.side,
        rawSig.priceAtEntry,
        h,
        l,
        rawSig.isLive ?? false,
      );
      return {
        strategyId: rawSig.strategyId,
        strategyLabel: rawSig.strategyLabel,
        entryDate: rawSig.entryDate,
        entryTime: rawSig.entryTime ?? rawSig.entryDate,
        entryTimestamp: rawSig.entryTimestamp ?? null,
        side: rawSig.side,
        priceAtEntry: rawSig.priceAtEntry,
        probabilityScore: ai?.probabilityScore ?? 54,
        verdict: ai?.verdict ?? "review",
        rationale: ai?.rationale ?? "",
        entryExitRuleSummary: ai?.entryExitRuleSummary ?? "",
        whyThisScore: ai?.whyThisScore ?? "",
        liveViability: ai?.liveViability ?? "",
        rejectionDetail: ai?.rejectionDetail ?? "",
        confirmationDetail: ai?.confirmationDetail ?? "",
        scoreSource: ai?.scoreSource ?? "heuristic",
        isLive: rawSig.isLive ?? false,
        isPredicted: false,
        marketData: rawSig.marketData ?? null,
        scanEvaluatedAt,
        ohlcvPipeline: dataSource,
        indicatorPipeline: realIndicators.source,
        simpleOutcomeLabel: fwd.simpleOutcomeLabel,
        simpleOutcomeNote: fwd.simpleOutcomeNote,
        forwardProbeBars: fwd.forwardProbeBars,
        forwardMaxFavorablePct: fwd.forwardMaxFavorablePct,
        forwardMaxAdversePct: fwd.forwardMaxAdversePct,
        conditionAudit: rawSig.conditionAudit ?? null,
      };
    });

    // Final sort: live, today’s date, then higher score.
    const nowIso = new Date().toISOString().slice(0, 10);
    merged.sort((a, b) => {
      const aPri = a.isLive ? 2 : a.entryDate === nowIso ? 1 : 0;
      const bPri = b.isLive ? 2 : b.entryDate === nowIso ? 1 : 0;
      if (bPri !== aPri) return bPri - aPri;
      return (b.probabilityScore as number) - (a.probabilityScore as number);
    });

    // Persist per-user scan snapshot for history cards / popup replay.
    const { data: historyRow, error: historyErr } = await supabase
      .from("strategy_scan_history")
      .insert({
        user_id: user.id,
        symbol,
        scan_started_at: scanStartedAt,
        scan_completed_at: new Date().toISOString(),
        strategies: validIds,
        custom_strategy_ids: customStrategies.map((cs) => String(cs.id)),
        asset_type: assetType,
        data_source: dataSource,
        indicator_source: realIndicators.source,
        interval: usedInterval,
        signal_count: merged.length,
        live_count: liveSignals.length,
        predicted_count: 0,
        signals: merged,
      })
      .select("id")
      .single();
    if (historyErr) {
      console.error("Failed saving strategy scan history:", historyErr.message);
    }

    return new Response(
      JSON.stringify({
        signals: merged,
        historyId: historyRow?.id ?? null,
        yahooSymbol,
        barCount: c.length,
        interval: usedInterval,
        isIntraday: usedInterval !== "1d",
        liveCount: liveSignals.length,
        predictedCount: 0,
        assetType,
        predictionWindowMinutes: 0,
        lookbackDaysUsed: days,
        dataSource,
        indicatorSource: realIndicators.source,
      }),
      { status: 200, headers },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});
