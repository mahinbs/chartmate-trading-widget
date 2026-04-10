import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TradeRow = {
  tradeNo?: number;
  entryDate?: string;
  exitDate?: string;
  entryPrice?: number | null;
  exitPrice?: number | null;
  holdingDays?: number | null;
  returnPct?: number;
  profitable?: boolean;
  exitReason?: string;
  candles?: Array<{
    date?: string;
    close?: number;
    sma20?: number | null;
    rsi14?: number | null;
  }>;
};

function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(Number.NaN);
  if (!values.length || period <= 1) return out;
  const k = 2 / (period + 1);
  let acc = 0;
  let seedCount = 0;
  let prev = Number.NaN;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (!Number.isFinite(prev)) {
      acc += v;
      seedCount += 1;
      if (seedCount >= period) {
        prev = acc / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsi(values: number[], period = 14): number[] {
  const out = new Array(values.length).fill(Number.NaN);
  if (values.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss += -d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function std(arr: number[]): number {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/** Match Yahoo daily bar keys — avoid UTC shifting "local" date strings. */
function normalizeEntryDay(s: string | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function buildMetrics(trades: TradeRow[]) {
  const totalTrades = trades.length;
  const returns = trades.map((t) => Number(t.returnPct ?? 0));
  const winsArr = returns.filter((r) => r > 0);
  const lossesArr = returns.filter((r) => r <= 0);
  const wins = winsArr.length;
  const losses = totalTrades - wins;
  const totalReturn = Number(returns.reduce((a, b) => a + b, 0).toFixed(2));
  const winRate = totalTrades ? Number(((wins / totalTrades) * 100).toFixed(2)) : 0;
  const avgReturn = totalTrades ? Number((totalReturn / totalTrades).toFixed(2)) : 0;
  const expectancy = avgReturn;
  const bestTrade = totalTrades ? Math.max(...returns) : 0;
  const worstTrade = totalTrades ? Math.min(...returns) : 0;
  const avgHoldingDays = totalTrades
    ? Number(
        (
          trades.reduce((a, t) => a + Number(t.holdingDays ?? 0), 0) /
          totalTrades
        ).toFixed(2),
      )
    : 0;
  const avgWin = winsArr.length
    ? Number((winsArr.reduce((a, b) => a + b, 0) / winsArr.length).toFixed(2))
    : 0;
  const avgLoss = lossesArr.length
    ? Number((lossesArr.reduce((a, b) => a + b, 0) / lossesArr.length).toFixed(2))
    : 0;
  const grossProfit = winsArr.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(lossesArr.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : winsArr.length ? 99 : 0;

  let eq = 0;
  let peak = 0;
  let maxDd = 0;
  const equityCurve = trades.map((t) => {
    eq += Number(t.returnPct ?? 0);
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
    return { date: String(t.exitDate ?? t.entryDate ?? ""), value: Number(eq.toFixed(2)) };
  });

  const sharpeRaw = std(returns) > 0 ? (avgReturn / std(returns)) * Math.sqrt(252) : 0;
  const sharpeRatio = Number((Number.isFinite(sharpeRaw) ? sharpeRaw : 0).toFixed(2));

  return {
    totalTrades,
    wins,
    losses,
    winRate,
    totalReturn,
    avgReturn,
    expectancy,
    bestTrade: Number(bestTrade.toFixed(2)),
    worstTrade: Number(worstTrade.toFixed(2)),
    avgHoldingDays,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown: Number(maxDd.toFixed(2)),
    sharpeRatio,
    equityCurve,
  };
}

/**
 * REALISTIC entry-only score — NO look-ahead (returnPct is never used).
 * Based purely on what was visible at entry time:
 *   EMA20 vs EMA50  → short-term trend  (+10 / -7)
 *   EMA50 vs EMA200 → market regime     (+8  / -6)
 *   Price vs EMA20  → momentum          (+8  / -6)
 *   RSI 14          → momentum health   (+9  / -9)
 *   Volume          → conviction        (+8  / -6)
 * Max possible: 50 + 10+8+8+9+8 = 93   Min: 50-7-6-6-9-6 = 16
 * Threshold ~55 keeps entries with at least 3 positive signals.
 */
type EntryFactors = {
  trendOk: boolean | null;       // EMA20 > EMA50
  marketOk: boolean | null;      // EMA50 > EMA200
  priceOk: boolean | null;       // Price > EMA20
  rsiValue: number | null;       // raw RSI
  rsiOk: boolean | null;         // 45–75 healthy zone
  rsiExtreme: boolean;           // < 35 or > 82
  volumeRatio: number | null;    // v / v20-avg
  volumeStrong: boolean | null;  // >= 1.5×
  volumeWeak: boolean | null;    // < 0.8×
  momentumUp: boolean | null;    // 3-candle price sequence rising (fallback)
};

function calcEntryFactors(
  barIndex: number | undefined,
  closes: number[], ema20arr: number[], ema50arr: number[], ema200arr: number[],
  rsi14arr: number[], volumes: number[], volSma20arr: number[],
  t: TradeRow,
): EntryFactors {
  const f: EntryFactors = {
    trendOk: null, marketOk: null, priceOk: null,
    rsiValue: null, rsiOk: null, rsiExtreme: false,
    volumeRatio: null, volumeStrong: null, volumeWeak: null,
    momentumUp: null,
  };

  if (typeof barIndex === "number" && closes.length) {
    const c = closes[barIndex];
    const e20 = ema20arr[barIndex];
    const e50 = ema50arr[barIndex];
    const e200 = ema200arr[barIndex];
    const r = rsi14arr[barIndex];
    const v = volumes[barIndex];
    const v20 = volSma20arr[barIndex];

    if (Number.isFinite(e20) && Number.isFinite(e50)) f.trendOk = e20 > e50;
    if (Number.isFinite(e50) && Number.isFinite(e200)) f.marketOk = e50 > e200;
    if (Number.isFinite(c) && Number.isFinite(e20)) f.priceOk = c > e20;
    if (Number.isFinite(r)) {
      f.rsiValue = r;
      f.rsiOk = r >= 45 && r <= 75;
      f.rsiExtreme = r < 35 || r > 82;
    }
    if (Number.isFinite(v) && Number.isFinite(v20) && v20 > 0) {
      const vr = v / v20;
      f.volumeRatio = vr;
      f.volumeStrong = vr >= 1.5;
      f.volumeWeak = vr < 0.8;
    }
  } else {
    // Fallback: use embedded candle data from OpenAlgo backtest
    const candles = Array.isArray(t.candles) ? t.candles : [];
    if (candles.length) {
      const first = candles[0] ?? {};
      const close = Number(first.close);
      const sma20 = Number(first.sma20);
      const rsi = Number(first.rsi14);
      if (Number.isFinite(close) && Number.isFinite(sma20)) f.priceOk = close > sma20;
      if (Number.isFinite(rsi)) {
        f.rsiValue = rsi;
        f.rsiOk = rsi >= 45 && rsi <= 75;
        f.rsiExtreme = rsi < 35 || rsi > 82;
      }
      if (candles.length >= 3) {
        const c0 = Number(candles[0]?.close);
        const c1 = Number(candles[1]?.close);
        const c2 = Number(candles[2]?.close);
        if (Number.isFinite(c0) && Number.isFinite(c1) && Number.isFinite(c2)) {
          f.momentumUp = c2 > c1 && c1 > c0;
        }
      }
    }
  }
  return f;
}

function scoreFromFactors(f: EntryFactors): number {
  let score = 50;
  if (f.trendOk === true)  score += 10;
  if (f.trendOk === false) score -= 7;
  if (f.marketOk === true)  score += 8;
  if (f.marketOk === false) score -= 6;
  if (f.priceOk === true)  score += 8;
  if (f.priceOk === false) score -= 6;
  if (f.rsiOk === true)    score += 9;
  if (f.rsiExtreme)        score -= 9;
  if (f.volumeStrong === true) score += 8;
  if (f.volumeWeak === true)   score -= 6;
  if (f.momentumUp === true)   score += 5;
  if (f.momentumUp === false)  score -= 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Signal tags (the pill badges in the UI) */
function buildSignals(f: EntryFactors): SignalDetail[] {
  const signals: SignalDetail[] = [];
  if (f.trendOk !== null) {
    signals.push({ label: f.trendOk ? "EMA20 > EMA50 (uptrend at entry)" : "EMA20 < EMA50 (downtrend at entry)", positive: f.trendOk });
  }
  if (f.marketOk !== null) {
    signals.push({ label: f.marketOk ? "EMA50 > EMA200 (bull market)" : "EMA50 < EMA200 (bear market)", positive: f.marketOk });
  }
  if (f.priceOk !== null) {
    signals.push({ label: f.priceOk ? "Price above EMA20 at entry" : "Price below EMA20 at entry", positive: f.priceOk });
  }
  if (f.rsiValue !== null) {
    const r = f.rsiValue;
    signals.push({
      label: r > 82 ? `RSI ${r.toFixed(0)} — overbought at entry`
        : r < 35 ? `RSI ${r.toFixed(0)} — oversold at entry`
        : `RSI ${r.toFixed(0)}${f.rsiOk ? " (ideal zone)" : ""}`,
      positive: f.rsiOk === true,
    });
  }
  if (f.volumeRatio !== null) {
    signals.push({
      label: f.volumeStrong ? `Volume ${f.volumeRatio.toFixed(1)}× avg — strong conviction`
        : f.volumeWeak ? `Volume ${f.volumeRatio.toFixed(1)}× avg — weak interest`
        : `Volume ${f.volumeRatio.toFixed(1)}× avg`,
      positive: f.volumeStrong === true,
    });
  }
  if (f.momentumUp !== null) {
    signals.push({ label: f.momentumUp ? "3-bar price rising before entry" : "3-bar price falling before entry", positive: f.momentumUp });
  }
  return signals;
}

/** Plain-English paragraph explaining why kept / removed (no outcome knowledge used) */
function buildReason(f: EntryFactors, score: number, threshold: number, kept: boolean): string {
  const positives: string[] = [];
  const negatives: string[] = [];

  if (f.trendOk === true)  positives.push("the short-term trend was bullish (EMA20 above EMA50) at the time of entry");
  if (f.trendOk === false) negatives.push("the short-term trend was bearish (EMA20 below EMA50), which is a headwind for a buy trade");
  if (f.marketOk === true)  positives.push("the broader market was in a bull phase (EMA50 above EMA200)");
  if (f.marketOk === false) negatives.push("the market was in a bearish long-term phase (EMA50 below EMA200), adding broader risk");
  if (f.priceOk === true)  positives.push("price was trading above the 20-day average, showing near-term momentum");
  if (f.priceOk === false) negatives.push("price was below the 20-day moving average, indicating weakness at entry");
  if (f.rsiOk === true && f.rsiValue !== null)
    positives.push(`RSI was ${f.rsiValue.toFixed(0)}, sitting in the healthy 45–75 zone — not overbought, not oversold`);
  if (f.rsiExtreme && f.rsiValue !== null) {
    const zone = f.rsiValue > 82 ? "overbought" : "oversold";
    negatives.push(`RSI was ${f.rsiValue.toFixed(0)}, which is an ${zone} extreme — a risky entry point`);
  }
  if (f.volumeStrong) positives.push(`volume was ${f.volumeRatio!.toFixed(1)}× the 20-day average, showing strong conviction in the move`);
  if (f.volumeWeak)   negatives.push(`volume was only ${f.volumeRatio!.toFixed(1)}× average — weak participation signals a low-confidence move`);
  if (f.momentumUp === true)  positives.push("price had been rising for 3 consecutive bars before entry, confirming momentum");
  if (f.momentumUp === false) negatives.push("price had been declining for 3 consecutive bars before entry — buying into a short-term falling move");

  const scoreNote = `Quality score: ${score}/100 (cutoff was ${threshold}).`;

  if (kept) {
    if (positives.length === 0) {
      return `This trade passed the filter with a score of ${score}/100. Limited indicator data was available, but it cleared the quality threshold of ${threshold}.`;
    }
    const main = positives.slice(0, 2).join(", and ");
    const extra = positives.length > 2 ? ` Additionally, ${positives.slice(2).join("; ")}.` : "";
    const caveat = negatives.length > 0 ? ` One risk flag: ${negatives[0]}.` : "";
    return `Kept because ${main}.${extra}${caveat} ${scoreNote}`;
  } else {
    if (negatives.length === 0) {
      return `Removed despite limited negative signals. Score ${score}/100 narrowly missed the cutoff of ${threshold}. This may indicate insufficient indicator data at entry.`;
    }
    const main = negatives.slice(0, 2).join(", and ");
    const extra = negatives.length > 2 ? ` Also: ${negatives.slice(2).join("; ")}.` : "";
    const bright = positives.length > 0 ? ` Note: ${positives[0]} — but it wasn't enough to offset the negatives.` : "";
    return `Removed because ${main}.${extra}${bright} ${scoreNote}`;
  }
}

function scoreFromTradeCandles(t: TradeRow): number {
  const f = calcEntryFactors(undefined, [], [], [], [], [], [], [], t);
  return scoreFromFactors(f);
}

async function fetchYahooDailySeries(symbol: string, exchange: string) {
  const candidates = new Set<string>();
  const base = symbol.toUpperCase().trim();
  candidates.add(base);
  if (exchange === "NSE") candidates.add(base.endsWith(".NS") ? base : `${base}.NS`);
  if (exchange === "BSE") candidates.add(base.endsWith(".BO") ? base : `${base}.BO`);
  if (exchange === "GLOBAL" || base.includes("-USD") || base.includes("-USDT")) {
    candidates.add(base);
    if (!base.includes("-")) candidates.add(`${base}-USD`);
  }
  if (base.endsWith(".NS")) candidates.add(base.slice(0, -3));
  if (base.endsWith(".BO")) candidates.add(base.slice(0, -3));

  const period1 = Math.floor(new Date(Date.now() - 900 * 24 * 3600 * 1000).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  for (const ySymbol of candidates) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&period1=${period1}&period2=${period2}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    }).catch(() => null);
    if (!res || !res.ok) continue;
    const y = await res.json().catch(() => ({}));
    const r0 = y?.chart?.result?.[0];
    const timestamps: number[] = Array.isArray(r0?.timestamp) ? r0.timestamp : [];
    const q0 = r0?.indicators?.quote?.[0] ?? {};
    const closes: number[] = Array.isArray(q0.close) ? q0.close.map((n: unknown) => Number(n)) : [];
    const volumes: number[] = Array.isArray(q0.volume) ? q0.volume.map((n: unknown) => Number(n)) : [];
    if (timestamps.length && closes.length === timestamps.length) {
      return { timestamps, closes, volumes };
    }
  }
  return null;
}

type SignalDetail = { label: string; positive: boolean };

type ScoredTrade = TradeRow & {
  score: number;
  returnPct: number;
  tradeNo: number;
  signals?: SignalDetail[];
  reason?: string;
};

function applyAdaptiveFilter(
  scored: ScoredTrade[],
  requestedThreshold: number,
): { filtered: ScoredTrade[]; effectiveThreshold: number; filterNote: string } {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  let thresh = Math.max(1, Math.min(100, requestedThreshold));
  let filtered = sorted.filter((t) => t.score >= thresh);
  if (filtered.length > 0 || scored.length === 0) {
    return { filtered, effectiveThreshold: thresh, filterNote: "" };
  }
  const scores = scored.map((t) => t.score).sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const median = scores.length % 2 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
  thresh = Math.min(thresh, median);
  filtered = sorted.filter((t) => t.score >= thresh);
  if (filtered.length > 0) {
    return {
      filtered,
      effectiveThreshold: Number(thresh.toFixed(2)),
      filterNote: `No trades met fixed threshold ${requestedThreshold}; using median score ${Number(median.toFixed(1))} so the comparison stays meaningful.`,
    };
  }
  const keepK = Math.max(1, Math.ceil(scored.length / 2));
  filtered = sorted.slice(0, keepK);
  const cut = filtered[filtered.length - 1]?.score ?? thresh;
  return {
    filtered,
    effectiveThreshold: cut,
    filterNote: `Kept top ${keepK}/${scored.length} trades by quality score (no single cutoff preserved any trades).`,
  };
}

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
/** Prefer newest Pro-class models first (same stack as main strategy backtest AI). */
const GEMINI_MODELS = [
  "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-pro-preview-05-06",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash",
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-3.1-pro-preview",
];

/**
 * Ask Gemini to decide keep/remove for each trade based on entry-time indicator context.
 * Returns a map of tradeNo -> { keep: boolean, score: number, reason: string, signals: SignalDetail[] }
 * Falls back to indicator-only scoring if Gemini is unavailable.
 */
async function runGeminiFilter(
  symbol: string,
  exchange: string,
  strategy: string,
  tradesWithFactors: Array<ScoredTrade & { _factors: EntryFactors }>,
  backtestMode: string,
): Promise<Map<number, { keep: boolean; score: number; reason: string; signals: SignalDetail[] }>> {
  const result = new Map<number, { keep: boolean; score: number; reason: string; signals: SignalDetail[] }>();

  if (!GEMINI_KEY || tradesWithFactors.length === 0) return result;

  // Build a compact summary of each trade for Gemini — entry context only, NO outcome/return
  const tradeLines = tradesWithFactors.map((t) => {
    const f = t._factors;
    const parts: string[] = [`#${t.tradeNo} (${t.entryDate ?? "?"})`];
    if (f.trendOk !== null) parts.push(f.trendOk ? "EMA20>EMA50✓" : "EMA20<EMA50✗");
    if (f.marketOk !== null) parts.push(f.marketOk ? "EMA50>EMA200✓" : "EMA50<EMA200✗");
    if (f.priceOk !== null) parts.push(f.priceOk ? "Price>EMA20✓" : "Price<EMA20✗");
    if (f.rsiValue !== null) parts.push(`RSI=${f.rsiValue.toFixed(0)}${f.rsiOk ? "✓" : f.rsiExtreme ? "✗(extreme)" : ""}`);
    if (f.volumeRatio !== null) parts.push(`Vol=${f.volumeRatio.toFixed(1)}x${f.volumeStrong ? "✓" : f.volumeWeak ? "✗" : ""}`);
    if (f.momentumUp !== null) parts.push(f.momentumUp ? "3bar-up✓" : "3bar-down✗");
    return parts.join(" | ");
  }).join("\n");

  const ctxLine = backtestMode === "options_orb"
    ? "Backtest type: OPTIONS ORB on an index/F&O underlying. Each row is an option premium trade; use the underlying daily indicator context at entry to judge whether the breakout day was a high-quality setup for buying premium (volatility/trend alignment). Still do NOT use trade outcome or returnPct."
    : "Backtest type: equity / directional strategy on the symbol below.";

  const prompt = `You are a quantitative trading analyst. Your job is to review each trade entry and decide whether it should be KEPT or REMOVED from a filtered backtest.

Symbol: ${symbol} (${exchange})
Strategy: ${strategy}
${ctxLine}
Total trades: ${tradesWithFactors.length}

Rules:
- Evaluate ONLY the entry-time market conditions listed. Do NOT factor in trade outcome.
- Keep a trade if at least 3-4 conditions look favorable for a strong entry.
- Remove a trade if the entry conditions are weak, conflicting, or risky (e.g. overbought RSI, downtrend, weak volume).
- Be strict: if it's borderline, remove it. The goal is to show only high-quality setups.
- For each trade give a score 0-100 (entry quality only) and a 1-2 sentence plain English reason why kept or removed.

Trade entry conditions (✓ = positive signal, ✗ = negative signal):
${tradeLines}

Respond with ONLY valid JSON (no markdown, no backticks), in this exact format:
{
  "decisions": [
    {"tradeNo": 1, "keep": true, "score": 72, "reason": "Strong uptrend with price above EMA20 and healthy RSI. Good entry conditions."},
    {"tradeNo": 2, "keep": false, "score": 38, "reason": "EMA20 below EMA50 shows a downtrend at entry. RSI also in overbought zone — risky setup."}
  ]
}`;

  const geminiBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 4000, temperature: 0.3 },
  });

  let geminiText: string | null = null;
  for (const model of GEMINI_MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: geminiBody, signal: AbortSignal.timeout(30000) },
      );
      if (r.ok) {
        const data = await r.json();
        const t = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t) { geminiText = t; break; }
      } else {
        console.error(`Gemini model ${model} failed:`, r.status);
      }
    } catch (e) {
      console.error(`Gemini model ${model} threw:`, e);
    }
  }

  if (!geminiText) return result; // signal caller to fall back

  // Parse Gemini JSON response
  try {
    // Strip any accidental markdown fences
    const cleaned = geminiText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const decisions: Array<{ tradeNo: number; keep: boolean; score: number; reason: string }> = parsed.decisions ?? [];
    for (const d of decisions) {
      const t = tradesWithFactors.find((x) => x.tradeNo === d.tradeNo);
      if (!t) continue;
      const signals = buildSignals(t._factors);
      result.set(d.tradeNo, {
        keep: Boolean(d.keep),
        score: Math.max(0, Math.min(100, Number(d.score ?? 50))),
        reason: String(d.reason ?? ""),
        signals,
      });
    }
  } catch (e) {
    console.error("Failed to parse Gemini response:", e, geminiText?.slice(0, 300));
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const exchange = String(body.exchange ?? "NSE").trim().toUpperCase();
    const strategy = String(body.strategy ?? "trend_following");
    const backtestMode = String(body.backtest_mode ?? "equity");
    const filterThreshold = Math.max(1, Math.min(100, Number(body.filterThreshold ?? 50)));
    const trades = Array.isArray(body.trades) ? (body.trades as TradeRow[]) : [];
    if (!symbol || trades.length === 0) {
      return new Response(JSON.stringify({ error: "symbol and trades are required" }), { status: 400, headers });
    }

    // Compute entry-time indicators from Yahoo OHLCV
    const ohlcv = await fetchYahooDailySeries(symbol, exchange);
    const timestamps = ohlcv?.timestamps ?? [];
    const closes = ohlcv?.closes ?? [];
    const volumes = ohlcv?.volumes ?? [];
    const ema20 = closes.length ? ema(closes, 20) : [];
    const ema50 = closes.length ? ema(closes, 50) : [];
    const ema200 = closes.length ? ema(closes, 200) : [];
    const rsi14 = closes.length ? rsi(closes, 14) : [];
    const volSma20 = volumes.length ? ema(volumes, 20) : [];
    const indexByDay = new Map<string, number>();
    for (let i = 0; i < timestamps.length; i++) {
      const day = new Date(Number(timestamps[i]) * 1000).toISOString().slice(0, 10);
      indexByDay.set(day, i);
    }

    // Pre-compute entry factors for each trade (used by both Gemini and fallback)
    const tradesWithFactors: (ScoredTrade & { _factors: EntryFactors })[] = trades.map((t, idx) => {
      const day = normalizeEntryDay(String(t.entryDate ?? ""));
      let i = day ? indexByDay.get(day) : undefined;
      if (day && typeof i !== "number" && timestamps.length) {
        const d0 = new Date(`${day}T12:00:00Z`);
        for (const delta of [-1, 1]) {
          const alt = new Date(d0.getTime() + delta * 86400000).toISOString().slice(0, 10);
          const j = indexByDay.get(alt);
          if (typeof j === "number") { i = j; break; }
        }
      }
      const f = calcEntryFactors(i, closes, ema20, ema50, ema200, rsi14, volumes, volSma20, t);
      const score = scoreFromFactors(f);
      const signals = buildSignals(f);
      return {
        ...t,
        tradeNo: Number(t.tradeNo ?? idx + 1),
        returnPct: Number(t.returnPct ?? 0),
        score,
        signals,
        _factors: f,
      };
    });

    // Run Gemini AI analysis
    const geminiDecisions = await runGeminiFilter(symbol, exchange, strategy, tradesWithFactors, backtestMode);
    const usedGemini = geminiDecisions.size > 0;
    let filterNote = usedGemini ? "" : "AI model unavailable — using indicator-based scoring as fallback.";
    if (backtestMode === "options_orb") {
      filterNote = usedGemini
        ? "Gemini scored option entries using underlying (index) daily context (Yahoo). Best live alignment: broker + OpenAlgo."
        : `${filterNote} Underlying daily (Yahoo) used for scoring.`;
    }

    // Apply Gemini decisions if we got them, else fall back to indicator scoring
    let scoredBase: (ScoredTrade & { _factors: EntryFactors })[];
    if (usedGemini) {
      scoredBase = tradesWithFactors.map((t) => {
        const d = geminiDecisions.get(t.tradeNo);
        if (d) {
          return { ...t, score: d.score, signals: d.signals, _geminiReason: d.reason, _geminiKeep: d.keep };
        }
        return t;
      }) as (ScoredTrade & { _factors: EntryFactors; _geminiReason?: string; _geminiKeep?: boolean })[];
    } else {
      scoredBase = tradesWithFactors;
    }

    // Determine kept/removed — use Gemini keep/remove directly if available, else threshold
    let keptTradeNos: Set<number>;
    let effectiveThreshold: number = filterThreshold;
    if (usedGemini) {
      // Use Gemini's explicit keep/remove decisions
      keptTradeNos = new Set(
        (scoredBase as (ScoredTrade & { _geminiKeep?: boolean })[])
          .filter((t) => {
            const d = geminiDecisions.get(t.tradeNo);
            return d ? d.keep : t.score >= filterThreshold;
          })
          .map((t) => t.tradeNo),
      );
      // If Gemini kept nothing (shouldn't happen) fall back to top half
      if (keptTradeNos.size === 0) {
        const sorted = [...scoredBase].sort((a, b) => b.score - a.score);
        const keepK = Math.max(1, Math.ceil(sorted.length / 2));
        keptTradeNos = new Set(sorted.slice(0, keepK).map((t) => t.tradeNo));
        filterNote = `Gemini kept 0 trades — fell back to top ${keepK} by score.`;
      }
    } else {
      const r = applyAdaptiveFilter(scoredBase, filterThreshold);
      keptTradeNos = new Set(r.filtered.map((t) => t.tradeNo));
      effectiveThreshold = r.effectiveThreshold;
      if (r.filterNote) filterNote = r.filterNote;
    }

    // Build final scored/filtered/removed arrays with reasons
    const scored: ScoredTrade[] = scoredBase.map((t) => {
      const kept = keptTradeNos.has(t.tradeNo);
      const d = geminiDecisions.get(t.tradeNo);
      const { _factors, ...rest } = t as ScoredTrade & { _factors: EntryFactors };
      const reason = d?.reason || buildReason(_factors, (t as ScoredTrade).score, effectiveThreshold, kept);
      return { ...rest, reason };
    });

    const filteredTrades = scored
      .filter((t) => keptTradeNos.has(t.tradeNo))
      .map((t, i) => ({ ...t, tradeNo: i + 1 }));

    const removedTrades = scored
      .filter((t) => !keptTradeNos.has(t.tradeNo))
      .sort((a, b) => (a.tradeNo ?? 0) - (b.tradeNo ?? 0));

    const rawMetrics = buildMetrics(scored);
    const aiMetrics = buildMetrics(filteredTrades);
    const avgRawScore = scored.length ? Number((scored.reduce((a, t) => a + (t.score ?? 0), 0) / scored.length).toFixed(2)) : 0;
    const avgFilteredScore = filteredTrades.length
      ? Number((filteredTrades.reduce((a, t) => a + (t.score ?? 0), 0) / filteredTrades.length).toFixed(2))
      : 0;

    return new Response(
      JSON.stringify({
        symbol,
        exchange,
        strategy,
        filterThreshold,
        effectiveThreshold,
        filterNote,
        usedGemini,
        rawTrades: scored,
        filteredTrades,
        removedTrades,
        rawMetrics,
        aiMetrics,
        avgRawScore,
        avgFilteredScore,
      }),
      { status: 200, headers },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
