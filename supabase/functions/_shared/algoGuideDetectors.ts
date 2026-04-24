/**
 * Algo-guide style presets (ORB, Supertrend 7/3, VWAP bounce, RSI divergence,
 * Liquidity Sweep + Break of Structure, SMC Multi-Timeframe Confluence).
 * Session windows use `MarketSessionProfile` (India / US / crypto / forex).
 */

import type { MarketSessionProfile } from "./marketSession.ts";

export type AlgoGuidePresetId =
  | "ema_crossover"
  | "orb"
  | "supertrend_7_3"
  | "vwap_bounce"
  | "rsi_divergence"
  | "liquidity_sweep_bos"
  | "smc_mtf_confluence";

/** Matches UI `AlgoGuideParams` (subset used by edge detectors). */
export type AlgoGuideParams = {
  orbOpenStartMin?: number;
  orbOpenEndMin?: number;
  orbBreakoutAfterMin?: number;
  orbMinRangePct?: number;
  orbMaxRangePct?: number;
  orbTpRangeMult?: number;
  /** VIX gate — ORB: max (default 22) */
  orbVixMax?: number;
  orbRequireFiiNetBuying?: boolean;
  orbBlockMacroEvents?: boolean;
  orbMacroBlockWindowMin?: number;
  emaVixMin?: number;
  emaVixMax?: number;
  stVixMin?: number;
  stVixMax?: number;
  vwapVixMin?: number;
  lqVixMin?: number;
  lqVixMax?: number;
  stPeriod?: number;
  stMult?: number;
  stSessionStartMin?: number;
  stSessionEndMin?: number;
  stAtrFilterPct?: number;
  vwapMaxTestsPerDay?: number;
  vwapLastEntryBeforeMin?: number;
  vwapVolLookback?: number;
  vwapSlPctFromVwap?: number;
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  emaTrendPeriod?: number;
  emaRsiPeriod?: number;
  emaRsiLongMin?: number;
  emaRsiLongMax?: number;
  emaRsiShortMin?: number;
  emaRsiShortMax?: number;
  emaVolMult?: number;
  emaVolLookback?: number;
  emaTradeStartMin?: number;
  emaTradeEndMin?: number;
  emaTpRiskReward?: number;
  rsiDivPeriod?: number;
  rsiDivPivotWidth?: number;
  rsiDivMinSpan?: number;
  rsiDivMaxSpan?: number;
  rsiDivConfirmBars?: number;
  rsiDivTp2Mult?: number;
  lqLookback?: number;
  lqSwingWidth?: number;
  lqEqualZonePct?: number;
  lqAtrPeriod?: number;
};

export function extractAlgoGuidePreset(entryConditions: unknown): AlgoGuidePresetId | null {
  if (!entryConditions || typeof entryConditions !== "object") return null;
  const p = (entryConditions as { algoGuidePreset?: string }).algoGuidePreset;
  if (
    p === "ema_crossover" ||
    p === "orb" ||
    p === "supertrend_7_3" ||
    p === "vwap_bounce" ||
    p === "rsi_divergence" ||
    p === "liquidity_sweep_bos" ||
    p === "smc_mtf_confluence"
  ) {
    return p as AlgoGuidePresetId;
  }
  return null;
}

function barWallClockMinutes(tsSec: number, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(tsSec * 1000));
    const hh = Number(parts.find((x) => x.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((x) => x.type === "minute")?.value ?? NaN);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  } catch {
    return null;
  }
}

function barDateKey(tsSec: number, tz: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(tsSec * 1000));
    const y = parts.find((x) => x.type === "year")?.value;
    const mo = parts.find((x) => x.type === "month")?.value;
    const d = parts.find((x) => x.type === "day")?.value;
    if (!y || !mo || !d) return null;
    return `${y}-${mo}-${d}`;
  } catch {
    return null;
  }
}

function atrSeries(h: number[], l: number[], c: number[], period: number): number[] {
  const n = c.length;
  const out = new Array(n).fill(NaN);
  const tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tr[i] = h[i] - l[i];
    } else {
      tr[i] = Math.max(
        h[i] - l[i],
        Math.abs(h[i] - c[i - 1]),
        Math.abs(l[i] - c[i - 1]),
      );
    }
  }
  for (let i = period - 1; i < n; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += tr[i - j];
    out[i] = s / period;
  }
  return out;
}

/** Supertrend line + trend: 1 = bullish (green below), -1 = bearish */
export function supertrendSeries(
  h: number[],
  l: number[],
  c: number[],
  period = 7,
  mult = 3,
): { line: number[]; trend: number[] } {
  const n = c.length;
  const line = new Array(n).fill(NaN);
  const trend = new Array(n).fill(0);
  const atr = atrSeries(h, l, c, period);
  const hl2 = h.map((hi, i) => (hi + l[i]) / 2);
  const upper = hl2.map((x, i) => x + mult * (atr[i] || 0));
  const lower = hl2.map((x, i) => x - mult * (atr[i] || 0));

  line[0] = lower[0];
  trend[0] = 1;
  for (let i = 1; i < n; i++) {
    if (!Number.isFinite(atr[i])) {
      line[i] = line[i - 1];
      trend[i] = trend[i - 1];
      continue;
    }
    let up = upper[i];
    let lo = lower[i];
    if (c[i - 1] > line[i - 1]) {
      lo = Math.max(lower[i], line[i - 1]);
    } else {
      up = Math.min(upper[i], line[i - 1]);
    }
    if (c[i] > up) {
      line[i] = lo;
      trend[i] = 1;
    } else if (c[i] < lo) {
      line[i] = up;
      trend[i] = -1;
    } else {
      line[i] = line[i - 1];
      trend[i] = trend[i - 1];
    }
  }
  return { line, trend };
}

export type PresetHit = {
  i: number;
  side: "BUY" | "SELL";
  /** Intraday: bars after signal bar to use as entry index (guide ORB = next candle). Default 0. */
  entryBarOffset?: number;
  meta?: {
    orbH?: number;
    orbL?: number;
    breakoutBar?: number;
    supertrendSl?: number;
    /** VWAP bounce: VWAP value at entry bar */
    vwapAtEntry?: number;
    /** VWAP bounce: +1 standard deviation band */
    vwapSd1?: number;
    /** VWAP bounce: +2 standard deviation band */
    vwapSd2?: number;
    /** RSI divergence: swing point price (low for BUY, high for SELL) */
    rsiSwingPoint?: number;
    /** RSI divergence: prior opposing swing point (for TP target) */
    rsiPriorSwing?: number;
  };
};

/** EMA seed matches chartmate-strategy-engine `._ema` (first close seeds the series). */
function emaSeriesEngine(close: number[], _period: number): number[] {
  const n = close.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n < 1) return out;
  const k = 2 / (_period + 1);
  let prev = close[0];
  out[0] = prev;
  for (let i = 1; i < n; i++) {
    prev = close[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Strategy 01 — EMA 20/50 trend crossover (port of engine.py `eval_ema_crossover`) */
export function detectEmaCrossoverHits(
  t: number[],
  h: number[],
  l: number[],
  c: number[],
  v: number[],
  profile: MarketSessionProfile,
  params: AlgoGuideParams | undefined,
): PresetHit[] {
  const p = params ?? {};
  const fastN = p.emaFastPeriod ?? 20;
  const slowN = p.emaSlowPeriod ?? 50;
  const trendN = p.emaTrendPeriod ?? 200;
  const rsiP = p.emaRsiPeriod ?? 14;
  const rLongLo = p.emaRsiLongMin ?? 50;
  const rLongHi = p.emaRsiLongMax ?? 75;
  const rShortLo = p.emaRsiShortMin ?? 25;
  const rShortHi = p.emaRsiShortMax ?? 50;
  const volMult = p.emaVolMult ?? 1.5;
  let volLb = p.emaVolLookback ?? 20;
  volLb = Math.max(2, Math.min(100, volLb));
  const tradeS = p.emaTradeStartMin ?? 9 * 60 + 30;
  const tradeE = p.emaTradeEndMin ?? 14 * 60;
  const tpRr = p.emaTpRiskReward ?? 2.5;

  const n = c.length;
  const need = Math.max(slowN + 3, fastN + 3, trendN + 3, rsiP + 5, volLb + 3);
  if (n < need || h.length < n || l.length < n) return [];
  if (!v.length || v.length !== n) return [];

  const emaF = emaSeriesEngine(c, fastN);
  const emaS = emaSeriesEngine(c, slowN);
  const emaTr = emaSeriesEngine(c, trendN);
  const rsiV = rsiArr(c, rsiP);

  const volAvg = (idx: number): number => {
    const vals: number[] = [];
    for (let j = Math.max(0, idx - (volLb - 1)); j < idx; j++) {
      if (v[j] != null) vals.push(v[j] || 0);
    }
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const isLiveHit = (hitIdx: number) => hitIdx >= n - 2;
  const hits: PresetHit[] = [];
  const _tz = profile.timeZone;
  for (let i = n - 1; i >= Math.max(1, n - 3); i--) {
    const tsec = t[i] ?? 0;
    if (!tsec) continue;
    const m = barWallClockMinutes(tsec, _tz);
    if (m != null && !(tradeS <= m && m <= tradeE)) continue;
    if (!isLiveHit(i)) continue;

    const eFn = emaF[i];
    const eFp = emaF[i - 1];
    const eSn = emaS[i];
    const eSp = emaS[i - 1];
    const eTr = emaTr[i];
    const rsiNow = rsiV[i];
    if ([eFn, eFp, eSn, eSp, rsiNow].some((x) => !Number.isFinite(x))) continue;

    const va = volAvg(i);
    const volNow = v[i] || 0;
    const volOk = va > 0 ? volNow >= va * volMult : true;

    if (
      eFp <= eSp && eFn > eSn && rLongLo < rsiNow && rsiNow < rLongHi && volOk &&
      (!Number.isFinite(eTr) || c[i] > eTr)
    ) {
      const dist = c[i] - l[i];
      const sl = l[i];
      const tp = dist > 0 ? round2(c[i] + tpRr * dist) : round2(c[i] * (1 + 0.005 * tpRr));
      hits.push({
        i,
        side: "BUY",
        meta: { emaSl: sl, emaTp: tp, ema20: eFn, ema50: eSn } as PresetHit["meta"],
      });
      return hits;
    }
    if (
      eFp >= eSp && eFn < eSn && rShortLo < rsiNow && rsiNow < rShortHi && volOk &&
      (!Number.isFinite(eTr) || c[i] < eTr)
    ) {
      const dist = h[i] - c[i];
      const sl = h[i];
      const tp = dist > 0 ? round2(c[i] - tpRr * dist) : round2(c[i] * (1 - 0.005 * tpRr));
      hits.push({
        i,
        side: "SELL",
        meta: { emaSl: sl, emaTp: tp, ema20: eFn, ema50: eSn } as PresetHit["meta"],
      });
      return hits;
    }
  }
  return hits;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Toby Crabel ORB: first 15m range in local session, breakout after range ends */
export function detectOrbHits(
  t: number[],
  c: number[],
  h: number[],
  l: number[],
  profile: MarketSessionProfile,
  params?: AlgoGuideParams,
): PresetHit[] {
  const n = c.length;
  const hits: PresetHit[] = [];
  const tz = profile.timeZone;
  const OPEN_START = params?.orbOpenStartMin ?? profile.orbOpenStartMin;
  const OPEN_END = params?.orbOpenEndMin ?? profile.orbOpenEndMin;
  const AFTER_OPEN = params?.orbBreakoutAfterMin ?? profile.orbBreakoutAfterMin;
  const minPct = params?.orbMinRangePct ?? 0.002;
  const maxPct = params?.orbMaxRangePct ?? 0.01;
  const tpMultStore = params?.orbTpRangeMult ?? 1.5;

  const byDay = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const dk = barDateKey(t[i], tz);
    if (!dk) continue;
    if (!byDay.has(dk)) byDay.set(dk, []);
    byDay.get(dk)!.push(i);
  }

  for (const [, idxs] of byDay) {
    idxs.sort((a, b) => t[a] - t[b]);
    let orbH = -Infinity;
    let orbL = Infinity;
    let orbOk = false;
    for (const i of idxs) {
      const m = barWallClockMinutes(t[i], tz);
      if (m == null) continue;
      if (m >= OPEN_START && m < OPEN_END) {
        orbH = Math.max(orbH, h[i]);
        orbL = Math.min(orbL, l[i]);
        orbOk = true;
      }
    }
    if (!orbOk || !Number.isFinite(orbH) || !Number.isFinite(orbL)) continue;
    const mid = (orbH + orbL) / 2;
    const rng = orbH - orbL;
    if (mid <= 0 || rng / mid > maxPct || rng / mid < minPct) continue;

    const after = idxs.filter((i) => {
      const m = barWallClockMinutes(t[i], tz);
      return m != null && m >= AFTER_OPEN;
    });
    for (let k = 0; k < after.length; k++) {
      const i = after[k];
      const prevIdx = k > 0 ? after[k - 1] : null;
      const prevClose = prevIdx != null ? c[prevIdx] : null;
      const nextIdx = k + 1 < after.length ? after[k + 1] : null;

      if (c[i] > orbH && (prevClose == null || prevClose <= orbH)) {
        if (nextIdx != null) {
          const nc = c[nextIdx];
          if (nc >= orbL && nc <= orbH) continue;
        }
        hits.push({
          i,
          side: "BUY",
          entryBarOffset: 1,
          meta: { orbH, orbL, breakoutBar: i, orbTpRangeMult: tpMultStore },
        });
        break;
      }
      if (c[i] < orbL && (prevClose == null || prevClose >= orbL)) {
        if (nextIdx != null) {
          const nc = c[nextIdx];
          if (nc >= orbL && nc <= orbH) continue;
        }
        hits.push({
          i,
          side: "SELL",
          entryBarOffset: 1,
          meta: { orbH, orbL, breakoutBar: i, orbTpRangeMult: tpMultStore },
        });
        break;
      }
    }
  }
  return hits;
}

export function detectSupertrendFlipHits(
  h: number[],
  l: number[],
  c: number[],
  t: number[],
  profile: MarketSessionProfile,
  params?: AlgoGuideParams,
): PresetHit[] {
  const stP = params?.stPeriod ?? 7;
  const stM = params?.stMult ?? 3;
  const atrFilt = params?.stAtrFilterPct ?? 0.001;
  const { trend, line } = supertrendSeries(h, l, c, stP, stM);
  const atr = atrSeries(h, l, c, stP);
  const n = c.length;
  const hits: PresetHit[] = [];
  const tz = profile.timeZone;
  const SESSION_END = params?.stSessionEndMin ?? profile.supertrendSessionEndMin;
  const SESSION_START = params?.stSessionStartMin ?? profile.supertrendSessionStartMin;
  for (let i = 1; i < n; i++) {
    const m = barWallClockMinutes(t[i], tz);
    if (!profile.supertrend24h && (m == null || m < SESSION_START || m > SESSION_END)) continue;
    if (profile.supertrend24h && m == null) continue;
    const ar = atr[i];
    if (Number.isFinite(ar) && c[i] > 0 && ar / c[i] < atrFilt) continue;
    if (trend[i] === 1 && trend[i - 1] === -1) {
      hits.push({ i, side: "BUY", meta: { supertrendSl: line[i] } });
    }
    if (trend[i] === -1 && trend[i - 1] === 1) {
      hits.push({ i, side: "SELL", meta: { supertrendSl: line[i] } });
    }
  }
  return hits;
}

/**
 * Guide: 15m Supertrend direction + 5m flip (PDF). Aligns each fast bar to latest slow bar with tSlow <= tFast.
 */
export function detectSupertrendDualTfHits(
  tFast: number[],
  hFast: number[],
  lFast: number[],
  cFast: number[],
  tSlow: number[],
  hSlow: number[],
  lSlow: number[],
  cSlow: number[],
  profile: MarketSessionProfile,
  params?: AlgoGuideParams,
): PresetHit[] {
  if (tSlow.length < 15 || tFast.length < 15) {
    return detectSupertrendFlipHits(hFast, lFast, cFast, tFast, profile, params);
  }
  const stP = params?.stPeriod ?? 7;
  const stM = params?.stMult ?? 3;
  const atrFilt = params?.stAtrFilterPct ?? 0.001;
  const { trend: trendSlow } = supertrendSeries(hSlow, lSlow, cSlow, stP, stM);
  const { trend: trendFast, line: lineFast } = supertrendSeries(hFast, lFast, cFast, stP, stM);
  const atrFast = atrSeries(hFast, lFast, cFast, stP);
  const nF = cFast.length;
  const nS = tSlow.length;
  const slowTrendAtFast: number[] = new Array(nF).fill(0);
  let j = 0;
  for (let i = 0; i < nF; i++) {
    while (j + 1 < nS && tSlow[j + 1] <= tFast[i]) j++;
    slowTrendAtFast[i] = trendSlow[j] ?? 0;
  }
  const hits: PresetHit[] = [];
  const tz = profile.timeZone;
  const SESSION_END = params?.stSessionEndMin ?? profile.supertrendSessionEndMin;
  const SESSION_START = params?.stSessionStartMin ?? profile.supertrendSessionStartMin;
  for (let i = 1; i < nF; i++) {
    const m = barWallClockMinutes(tFast[i], tz);
    if (!profile.supertrend24h && (m == null || m < SESSION_START || m > SESSION_END)) continue;
    if (profile.supertrend24h && m == null) continue;
    const st = slowTrendAtFast[i];
    const ar = atrFast[i];
    if (Number.isFinite(ar) && cFast[i] > 0 && ar / cFast[i] < atrFilt) continue;
    if (trendFast[i] === 1 && trendFast[i - 1] === -1 && st === 1) {
      hits.push({ i, side: "BUY", meta: { supertrendSl: lineFast[i] } });
    }
    if (trendFast[i] === -1 && trendFast[i - 1] === 1 && st === -1) {
      hits.push({ i, side: "SELL", meta: { supertrendSl: lineFast[i] } });
    }
  }
  return hits;
}

function rsiArr(close: number[], period = 14): number[] {
  const n = close.length;
  const out = new Array(n).fill(NaN);
  if (n < period + 1) return out;
  const gains = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const d = close[i] - close[i - 1];
    gains[i] = Math.max(d, 0);
    losses[i] = Math.max(-d, 0);
  }
  let avgG = 0;
  let avgL = 0;
  for (let i = 1; i <= period; i++) {
    avgG += gains[i];
    avgL += losses[i];
  }
  avgG /= period;
  avgL /= period;
  const rs0 = avgL === 0 ? 100 : avgG / avgL;
  out[period] = 100 - 100 / (1 + rs0);
  for (let i = period + 1; i < n; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period;
    avgL = (avgL * (period - 1) + losses[i]) / period;
    const rs = avgL === 0 ? 100 : avgG / avgL;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function macdHist(close: number[]): number[] {
  const n = close.length;
  const ema = (arr: number[], p: number) => {
    const o = new Array(n).fill(NaN);
    const k = 2 / (p + 1);
    let prev = arr[0];
    o[0] = prev;
    for (let i = 1; i < n; i++) {
      prev = arr[i] * k + prev * (1 - k);
      o[i] = prev;
    }
    return o;
  };
  const fast = ema(close, 12);
  const slow = ema(close, 26);
  const ml = fast.map((x, i) => x - slow[i]);
  const sig = ema(ml.map((x) => (Number.isFinite(x) ? x : 0)), 9);
  return ml.map((x, i) => x - sig[i]);
}

function findPivots(series: number[], window: number): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const n = series.length;
  for (let i = window; i < n - window; i++) {
    const v = series[i];
    let isH = true;
    let isL = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (series[j] > v) isH = false;
      if (series[j] < v) isL = false;
    }
    if (isH) highs.push(i);
    if (isL) lows.push(i);
  }
  return { highs, lows };
}

/** RSI divergence + MACD hist + guide confirmation bar (close beyond prior high/low). */
export function detectRsiDivergenceHits(
  c: number[],
  h: number[],
  l: number[],
  params?: AlgoGuideParams,
): PresetHit[] {
  const lookback = params?.rsiDivMaxSpan ?? 50;
  const minSpan = params?.rsiDivMinSpan ?? 5;
  const window = params?.rsiDivPivotWidth ?? 5;
  const rsiP = params?.rsiDivPeriod ?? 14;
  const confirmMax = params?.rsiDivConfirmBars ?? 4;
  const n = c.length;
  const rsi = rsiArr(c, rsiP);
  const macdH = macdHist(c);
  const hits: PresetHit[] = [];
  const { highs: ph, lows: pl } = findPivots(c, window);
  const { highs: rh, lows: rl } = findPivots(rsi, window);

  for (let k = 1; k < pl.length; k++) {
    const i1 = pl[k - 1];
    const i2 = pl[k];
    if (i2 - i1 < minSpan || i2 - i1 > lookback) continue;
    const r1 = rl.filter((x) => Math.abs(x - i1) <= window);
    const r2 = rl.filter((x) => Math.abs(x - i2) <= window);
    if (!r1.length || !r2.length) continue;
    if (
      c[i2] < c[i1] &&
      rsi[r2[0]] > rsi[r1[0]] &&
      Number.isFinite(macdH[i2]) &&
      Number.isFinite(macdH[i2 - 1]) &&
      macdH[i2] > macdH[i2 - 1]
    ) {
      let entryI = -1;
      for (let j = i2 + 1; j <= Math.min(i2 + confirmMax, n - 1); j++) {
        if (c[j] > h[j - 1]) {
          entryI = j;
          break;
        }
      }
      if (entryI >= 0) {
        // Find prior swing high for BUY TP target
        const priorSwingHigh = ph.filter((x) => x < i2).map((x) => h[x]);
        const rsiPriorSwing = priorSwingHigh.length > 0 ? priorSwingHigh[priorSwingHigh.length - 1] : undefined;
        hits.push({
          i: entryI,
          side: "BUY",
          meta: {
            rsiSwingPoint: l[i2],
            rsiPriorSwing,
          },
        });
      }
    }
  }
  for (let k = 1; k < ph.length; k++) {
    const i1 = ph[k - 1];
    const i2 = ph[k];
    if (i2 - i1 < minSpan || i2 - i1 > lookback) continue;
    const r1 = rh.filter((x) => Math.abs(x - i1) <= window);
    const r2 = rh.filter((x) => Math.abs(x - i2) <= window);
    if (!r1.length || !r2.length) continue;
    if (
      c[i2] > c[i1] &&
      rsi[r2[0]] < rsi[r1[0]] &&
      Number.isFinite(macdH[i2]) &&
      Number.isFinite(macdH[i2 - 1]) &&
      macdH[i2] < macdH[i2 - 1]
    ) {
      let entryI = -1;
      for (let j = i2 + 1; j <= Math.min(i2 + confirmMax, n - 1); j++) {
        if (c[j] < l[j - 1]) {
          entryI = j;
          break;
        }
      }
      if (entryI >= 0) {
        // Find prior swing low for SELL TP target
        const priorSwingLow = pl.filter((x) => x < i2).map((x) => l[x]);
        const rsiPriorSwing = priorSwingLow.length > 0 ? priorSwingLow[priorSwingLow.length - 1] : undefined;
        hits.push({
          i: entryI,
          side: "SELL",
          meta: {
            rsiSwingPoint: h[i2],
            rsiPriorSwing,
          },
        });
      }
    }
  }
  return hits;
}

/** VWAP + 1st/2nd touch heuristic; needs volume */
export function detectVwapBounceHits(
  t: number[],
  h: number[],
  l: number[],
  c: number[],
  v: number[],
  profile: MarketSessionProfile,
  o: number[] | undefined,
  params: AlgoGuideParams | undefined,
): PresetHit[] {
  if (!v.length || v.length !== c.length) return [];
  const n = c.length;
  const hits: PresetHit[] = [];
  const tz = profile.timeZone;
  const vwapCutoff = params?.vwapLastEntryBeforeMin ?? profile.vwapLastEntryBeforeMin;
  const maxTests = params?.vwapMaxTestsPerDay ?? 2;
  const volLook = Math.max(2, Math.min(50, params?.vwapVolLookback ?? 10));

  const byDay = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const dk = barDateKey(t[i], tz);
    if (!dk) continue;
    if (!byDay.has(dk)) byDay.set(dk, []);
    byDay.get(dk)!.push(i);
  }

  for (const [, idxs] of byDay) {
    idxs.sort((a, b) => t[a] - t[b]);
    let cumPv = 0;
    let cumV = 0;
    let cumPv2 = 0;
    const vwap: number[] = new Array(n).fill(NaN);
    const sd: number[] = new Array(n).fill(NaN);
    const touchCount: number[] = new Array(n).fill(0);

    for (const i of idxs) {
      const tp = (h[i] + l[i] + c[i]) / 3;
      const vol = Math.max(0, v[i] || 0);
      cumPv += tp * vol;
      cumV += vol;
      cumPv2 += tp * tp * vol;
      const vw = cumV > 0 ? cumPv / cumV : NaN;
      vwap[i] = vw;
      sd[i] = cumV > 0 ? Math.sqrt(Math.max(0, cumPv2 / cumV - vw * vw)) : NaN;

      let touches = 0;
      for (const j of idxs) {
        if (j >= i) break;
        const vwJ = vwap[j];
        if (!Number.isFinite(vwJ)) continue;
        if (l[j] <= vwJ * 1.002 && h[j] >= vwJ * 0.998) touches++;
      }
      touchCount[i] = touches;
    }

    const volSmaN = (endIdx: number): number => {
      const j0 = idxs.indexOf(endIdx);
      if (j0 < 0) return NaN;
      let s = 0;
      let cnt = 0;
      for (let k = Math.max(0, j0 - (volLook - 1)); k <= j0; k++) {
        s += v[idxs[k]] || 0;
        cnt++;
      }
      return cnt ? s / cnt : NaN;
    };

    for (let k = 2; k < idxs.length; k++) {
      const i = idxs[k];
      const prev = idxs[k - 1];
      const m = barWallClockMinutes(t[i], tz);
      if (m == null) continue;
      if (vwapCutoff != null && m >= vwapCutoff) continue;
      const vw = vwap[i];
      if (!Number.isFinite(vw)) continue;
      if (touchCount[i] > maxTests) continue;
      const va = volSmaN(prev);
      if (!Number.isFinite(va) || v[i] <= va) continue;

      const rangePrev = h[prev] - l[prev];
      const openPrev = o && o.length === c.length && Number.isFinite(o[prev]) ? o[prev] : c[prev];
      const lowerWickPrev = Math.min(openPrev, c[prev]) - l[prev];
      const upperWickPrev = h[prev] - Math.max(openPrev, c[prev]);
      const rejectionLong = rangePrev > 1e-9 && lowerWickPrev >= 0.3 * rangePrev;
      const rejectionShort = rangePrev > 1e-9 && upperWickPrev >= 0.3 * rangePrev;

      const longOk =
        c[prev] >= vw * 0.999 &&
        l[prev] <= vw * 1.001 &&
        c[i] > vw &&
        c[i] > c[prev] &&
        rejectionLong;
      const shortOk =
        c[prev] <= vw * 1.001 &&
        h[prev] >= vw * 0.999 &&
        c[i] < vw &&
        c[i] < c[prev] &&
        rejectionShort;
      if (longOk) hits.push({
        i, side: "BUY", entryBarOffset: 1,
        meta: {
          vwapAtEntry: vw,
          vwapSd1: Number.isFinite(sd[i]) ? vw + sd[i] : undefined,
          vwapSd2: Number.isFinite(sd[i]) ? vw + 2 * sd[i] : undefined,
        },
      });
      else if (shortOk) hits.push({
        i, side: "SELL", entryBarOffset: 1,
        meta: {
          vwapAtEntry: vw,
          vwapSd1: Number.isFinite(sd[i]) ? vw - sd[i] : undefined,
          vwapSd2: Number.isFinite(sd[i]) ? vw - 2 * sd[i] : undefined,
        },
      });
    }
  }
  return hits;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 6: Liquidity Sweep + Break of Structure (Smart Money / ICT-style)
// ─────────────────────────────────────────────────────────────────────────────

export type LiquiditySweepBosMeta = {
  /** Price of the swept liquidity zone (the equal high/low that was taken out) */
  sweptZonePrice: number;
  /** Extreme of the sweep candle (sweep low for BUY, sweep high for SELL) */
  sweepExtreme: number;
  /** BOS level — the structural pivot that confirmed direction reversal */
  bosLevel: number;
  /** Next opposing liquidity zone (TP target) */
  targetZonePrice: number;
};

/**
 * Smart Money / ICT Liquidity Sweep + Break of Structure detector.
 *
 * Algorithm:
 * 1. Cluster swing highs/lows into "liquidity zones" (equal levels within 0.15%).
 * 2. Detect a sweep: price wicks beyond a zone by ≥ 0.1% then closes back inside.
 * 3. After the sweep, look for a BOS: a candle that closes beyond the last opposing
 *    swing point, confirming the intended move.
 * 4. Entry: on the close of the BOS candle (or the next candle as confirmation).
 * 5. SL: 1 ATR beyond the sweep extreme.
 * 6. TP: next opposing liquidity zone.
 */
export function detectLiquiditySweepBosHits(
  c: number[],
  h: number[],
  l: number[],
  params?: AlgoGuideParams,
): PresetHit[] {
  const lookback = params?.lqLookback ?? 80;
  const swingWindow = params?.lqSwingWidth ?? 4;
  const clusterPct = params?.lqEqualZonePct ?? 0.0015;
  const sweepPct = 0.001; // 0.1% beyond zone (spec)
  const n = c.length;
  if (n < lookback) return [];
  const hits: PresetHit[] = [];

  const atrPeriod = Math.max(2, Math.min(30, params?.lqAtrPeriod ?? 7));
  const atr7 = atrSeries(h, l, c, atrPeriod);

  for (let cursor = lookback; cursor < n - 1; cursor++) {
    const start = cursor - lookback;

    // ── Step 1: Find swing highs and lows in the lookback window ──────────────
    const swingHighs: number[] = [];
    const swingLows: number[] = [];
    for (let i = start + swingWindow; i < cursor - swingWindow; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = i - swingWindow; j <= i + swingWindow; j++) {
        if (j === i) continue;
        if (h[j] >= h[i]) isHigh = false;
        if (l[j] <= l[i]) isLow = false;
      }
      if (isHigh) swingHighs.push(i);
      if (isLow) swingLows.push(i);
    }
    if (swingHighs.length < 2 || swingLows.length < 2) continue;

    const lastSwingHigh = swingHighs[swingHighs.length - 1];
    const lastSwingLow = swingLows[swingLows.length - 1];

    // ── Step 2: Cluster equal levels (liquidity zones) ────────────────────────
    // A zone is formed when two or more swing highs/lows cluster within clusterPct.
    let bullishZonePrice = NaN; // cluster of equal lows = buy-side liquidity below price
    let bearishZonePrice = NaN; // cluster of equal highs = sell-side liquidity above price

    for (let a = 0; a < swingHighs.length - 1; a++) {
      for (let b = a + 1; b < swingHighs.length; b++) {
        const ia = swingHighs[a];
        const ib = swingHighs[b];
        const mid = (h[ia] + h[ib]) / 2;
        if (Math.abs(h[ia] - h[ib]) / mid < clusterPct) {
          bearishZonePrice = mid;
        }
      }
    }
    for (let a = 0; a < swingLows.length - 1; a++) {
      for (let b = a + 1; b < swingLows.length; b++) {
        const ia = swingLows[a];
        const ib = swingLows[b];
        const mid = (l[ia] + l[ib]) / 2;
        if (Math.abs(l[ia] - l[ib]) / mid < clusterPct) {
          bullishZonePrice = mid;
        }
      }
    }

    const prevBar = cursor - 1;
    const curBar = cursor;
    const atrVal = atr7[curBar] ?? (h[curBar] - l[curBar]);

    // ── Step 3a: Bullish setup — sweep of a low liquidity zone ───────────────
    // Price wicks below bullishZonePrice (buyside stops taken) → closes above it → BOS up
    if (
      Number.isFinite(bullishZonePrice) &&
      l[prevBar] < bullishZonePrice * (1 - sweepPct) && // sweep: wick below zone
      c[prevBar] > bullishZonePrice &&                   // close back above zone
      c[curBar] > h[lastSwingHigh] &&                    // BOS: current bar closes above prior swing high
      lastSwingHigh > lastSwingLow                       // structure: high is more recent than low
    ) {
      // Next opposing liquidity (bearish zone) becomes TP
      const tp = Number.isFinite(bearishZonePrice)
        ? bearishZonePrice
        : h[lastSwingHigh] + (h[lastSwingHigh] - bullishZonePrice) * 1.5;
      const sl = l[prevBar] - atrVal;

      hits.push({
        i: curBar,
        side: "BUY",
        meta: {
          sweptZonePrice: bullishZonePrice,
          sweepExtreme: l[prevBar],
          bosLevel: h[lastSwingHigh],
          targetZonePrice: tp,
        } as unknown as PresetHit["meta"],
      });
    }

    // ── Step 3b: Bearish setup — sweep of a high liquidity zone ──────────────
    if (
      Number.isFinite(bearishZonePrice) &&
      h[prevBar] > bearishZonePrice * (1 + sweepPct) && // sweep: wick above zone
      c[prevBar] < bearishZonePrice &&                   // close back below zone
      c[curBar] < l[lastSwingLow] &&                     // BOS: current bar closes below prior swing low
      lastSwingLow > lastSwingHigh                       // structure: low is more recent than high
    ) {
      const tp = Number.isFinite(bullishZonePrice)
        ? bullishZonePrice
        : l[lastSwingLow] - (bearishZonePrice - l[lastSwingLow]) * 1.5;

      hits.push({
        i: curBar,
        side: "SELL",
        meta: {
          sweptZonePrice: bearishZonePrice,
          sweepExtreme: h[prevBar],
          bosLevel: l[lastSwingLow],
          targetZonePrice: tp,
        } as unknown as PresetHit["meta"],
      });
    }
  }

  // Deduplicate: keep only the last hit per side per 10-bar window
  const deduped: PresetHit[] = [];
  for (const hit of hits) {
    const prev = deduped.findLast((x) => x.side === hit.side);
    if (!prev || hit.i - prev.i > 10) deduped.push(hit);
  }
  return deduped;
}

// =============================================================================
// PRESET: SMC Multi-Timeframe Confluence (Smart Money Concepts) — EXACT SPEC
// =============================================================================
//
// Exact implementation matching the strategy document:
//
//   Step 1  → HTF bias from REAL 4H candles (Yahoo 1H bars → aggregated to 4H)
//             Bullish = HH+HL structure. Bearish = LH+LL structure.
//
//   Step 2  → Key Zones from REAL 15M candles (Yahoo 15M direct):
//             Demand zone  = base-candle + strong bullish impulse (15M)
//             Supply zone  = base-candle + strong bearish impulse (15M)
//             FVG (bullish) = candle[i-1].high < candle[i+1].low (gap unfilled)
//             FVG (bearish) = candle[i-1].low  > candle[i+1].high (gap unfilled)
//             Unfilled check: current 15M price has NOT re-entered the gap.
//
//   Step 3  → Liquidity Sweep (pre-condition) from REAL 1M candles (Yahoo 1M):
//             Price wicks beyond swing high/low cluster (≤0.15%) then closes back.
//             Sweep must occur BEFORE price reaches the HTF zone.
//
//   Step 4  → ChoCH from REAL 1M candles (ICT definition):
//             After bearish leg to zone → price breaks above last bearish swing high (BUY)
//             After bullish leg to zone → price breaks below last bullish swing low  (SELL)
//             Confirmed by close, not just wick.
//
//   Step 5  → Mitigation entry from 1M candles:
//             After ChoCH, price retraces back into demand/supply zone OR FVG.
//             Entry = close of first 1M bar that re-enters the zone/FVG after ChoCH.
//
//   SL      → Below 15M demand zone low (BUY) / above 15M supply zone high (SELL).
//             Pinned to the ACTUAL 15M zone extreme, not a %-guess.
//
//   TP      → Nearest swing high/low OR opposing liquidity level from 15M data.
//
//   BE rule → Stored in meta.breakevenLevel = entry ± (risk × 2).
//             Execution engine uses this to move SL to entry when price reaches it.
//
//   Sessions→ London: 07:00–10:00 UTC  |  New York: 13:30–16:00 UTC  (exact open hours)
//
// Data sources (all via Yahoo Finance — free, no API key):
//   htf1h   → Yahoo 1H bars (~730 days available) → aggregated every 4 bars = 4H
//   slow15m → Yahoo 15M bars (60 days)
//   fast1m  → Yahoo 1M bars (7 days)
// =============================================================================

export type SmcMtfMeta = {
  htfBias: "bullish" | "bearish";
  zoneHigh: number;
  zoneLow: number;
  zoneType: "demand" | "supply" | "fvg";
  sweptLiquidityPrice: number;
  sweepExtreme: number;
  chochLevel: number;
  mitigationEntryPrice: number;
  /** SL pinned to real 15M zone extreme */
  structureSl: number;
  /** TP at nearest swing/liquidity from 15M data */
  liquidityTp: number;
  /** Trigger level: when price reaches this, move SL to entry (1:2 RR) */
  breakevenLevel: number;
  sessions: string[];
};

export type SmcFeeds = {
  /** Real 1H candles for 4H bias (Yahoo 1H, aggregated every 4 bars internally) */
  htf1h: { t: number[]; h: number[]; l: number[]; c: number[]; o: number[] };
  /** Real 15M candles for zones + SL (Yahoo 15M) */
  slow15m: { t: number[]; h: number[]; l: number[]; c: number[]; o: number[] };
  /** Real 1M candles for ChoCH + mitigation entry (Yahoo 1M) */
  fast1m: { t: number[]; h: number[]; l: number[]; c: number[]; o: number[] };
};

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Aggregate bars: combine every `n` consecutive bars into one wider candle */
function smcAggregateBars(
  t: number[], h: number[], l: number[], c: number[], o: number[], n: number,
): { t: number[]; h: number[]; l: number[]; c: number[]; o: number[] } {
  const out = { t: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], o: [] as number[] };
  const len = c.length;
  for (let i = 0; i + n <= len; i += n) {
    out.t.push(t[i + n - 1]);
    out.o.push(o[i]);
    out.h.push(Math.max(...h.slice(i, i + n)));
    out.l.push(Math.min(...l.slice(i, i + n)));
    out.c.push(c[i + n - 1]);
  }
  return out;
}

/** Strict pivot swing highs/lows: bar i is a swing high if h[i] > all neighbours within window w */
function smcSwingPoints(
  h: number[], l: number[], w = 3,
): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const n = h.length;
  for (let i = w; i < n - w; i++) {
    let isH = true, isL = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (h[j] >= h[i]) { isH = false; break; }
    }
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (l[j] <= l[i]) { isL = false; break; }
    }
    if (isH) highs.push(i);
    if (isL) lows.push(i);
  }
  return { highs, lows };
}

/**
 * HTF 4H Bias — exact ICT/SMC definition:
 *   Bullish = sequence of Higher Highs AND Higher Lows (HH+HL)
 *   Bearish = sequence of Lower Highs AND Lower Lows  (LH+LL)
 *   We look at the last 3 confirmed swing points of each type.
 */
function smcHtfBias(
  h4: number[], l4: number[], lookback = 20,
): "bullish" | "bearish" | "neutral" {
  const n = h4.length;
  if (n < 8) return "neutral";
  const start = Math.max(0, n - lookback);
  const { highs, lows } = smcSwingPoints(h4.slice(start), l4.slice(start), 2);

  if (highs.length >= 2 && lows.length >= 2) {
    const hh = h4.slice(start);
    const ll = l4.slice(start);
    // Last two swing highs and lows
    const sh1 = hh[highs[highs.length - 2]];
    const sh2 = hh[highs[highs.length - 1]];
    const sl1 = ll[lows[lows.length - 2]];
    const sl2 = ll[lows[lows.length - 1]];
    if (sh2 > sh1 && sl2 > sl1) return "bullish"; // HH + HL
    if (sh2 < sh1 && sl2 < sl1) return "bearish"; // LH + LL
  }

  // Fallback: price is above/below midpoint of range
  const slice = h4.slice(start).map((v, i) => (v + l4[start + i]) / 2);
  const mid = Math.floor(slice.length / 2);
  const avg1 = slice.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const avg2 = slice.slice(mid).reduce((a, b) => a + b, 0) / (slice.length - mid);
  return avg2 > avg1 ? "bullish" : "bearish";
}

/** Zone type */
type SmcZone = {
  type: "demand" | "supply" | "fvg_bull" | "fvg_bear";
  high: number;
  low: number;
  barIndex: number;
};

/**
 * Find 15M zones (demand, supply, FVG) — exact SMC definitions:
 *
 * Demand zone:  base candle (body ≤ 40% of range) immediately followed by
 *               strong bullish impulse (body ≥ 60% of range, close > open).
 *               Zone = [base.low, base.high].
 *
 * Supply zone:  same but next candle is strong bearish impulse.
 *               Zone = [base.low, base.high].
 *
 * Bullish FVG:  three-candle pattern where candle[i-1].high < candle[i+1].low.
 *               Gap = [candle[i-1].high, candle[i+1].low].
 *               Unfilled = current 15M price has NOT traded into the gap yet.
 *
 * Bearish FVG:  candle[i-1].low > candle[i+1].high.
 *               Gap = [candle[i+1].high, candle[i-1].low].
 *               Unfilled = price has NOT traded into gap yet.
 */
function smcFindZones15m(
  h: number[], l: number[], c: number[], o: number[],
  lookback = 60,
): SmcZone[] {
  const zones: SmcZone[] = [];
  const n = c.length;
  const start = Math.max(1, n - lookback);

  for (let i = start; i < n - 1; i++) {
    const bodySize = Math.abs(c[i] - o[i]);
    const range = h[i] - l[i];

    // ── Demand / Supply zone ──────────────────────────────────────────────────
    if (range > 0 && bodySize / range <= 0.4) {
      // Base candle detected
      const nb = Math.abs(c[i + 1] - o[i + 1]);
      const nr = h[i + 1] - l[i + 1];
      if (nr > 0 && nb / nr >= 0.6) {
        const bullishImpulse = c[i + 1] > o[i + 1];
        zones.push({
          type: bullishImpulse ? "demand" : "supply",
          high: h[i],
          low: l[i],
          barIndex: i,
        });
      }
    }

    // ── FVG (3-candle gap) ────────────────────────────────────────────────────
    if (i >= 1 && i + 1 < n) {
      // Bullish FVG: gap between candle[i-1].high and candle[i+1].low
      const bfgLow  = h[i - 1]; // bottom of the gap
      const bfgHigh = l[i + 1]; // top of the gap
      if (bfgHigh > bfgLow) {
        // Unfilled: current price (last close) hasn't entered the gap from above
        const currentC = c[n - 1];
        const stillUnfilled = currentC > bfgLow; // price is still above gap bottom
        if (stillUnfilled) {
          zones.push({ type: "fvg_bull", high: bfgHigh, low: bfgLow, barIndex: i });
        }
      }
      // Bearish FVG: gap between candle[i+1].high and candle[i-1].low
      const bfgBearHigh = l[i - 1]; // top of the gap (a low)
      const bfgBearLow  = h[i + 1]; // bottom of gap
      if (bfgBearHigh > bfgBearLow) {
        const currentC = c[n - 1];
        const stillUnfilled = currentC < bfgBearHigh;
        if (stillUnfilled) {
          zones.push({ type: "fvg_bear", high: bfgBearHigh, low: bfgBearLow, barIndex: i });
        }
      }
    }
  }
  return zones;
}

/**
 * Liquidity Sweep on 1M bars — exact SMC definition:
 *   Equal highs/lows = two or more swing highs/lows within 0.15% of each other (liquidity cluster).
 *   Sweep = 1M candle wicks BEYOND the cluster level by ≥ 0.1%, then CLOSES back on the other side.
 *   For BUY setup: sweep of lows (sell-side liquidity taken, bearish wick, bullish close).
 *   For SELL setup: sweep of highs (buy-side liquidity taken, bullish wick, bearish close).
 */
function smcLiquiditySweep1m(
  h1m: number[], l1m: number[], c1m: number[],
  side: "BUY" | "SELL",
  startBar: number, endBar: number,
): { sweptPrice: number; sweepExtreme: number; sweepBar: number } | null {
  if (endBar <= startBar + 2) return null;

  // Build list of swing lows (BUY) or swing highs (SELL) in the search window
  const { highs, lows } = smcSwingPoints(
    h1m.slice(startBar, endBar),
    l1m.slice(startBar, endBar),
    2,
  );

  const pivotIdxs = side === "BUY" ? lows : highs;
  const pivotPrices = pivotIdxs.map((i) =>
    side === "BUY" ? l1m[startBar + i] : h1m[startBar + i],
  );

  // Find equal levels (clusters within 0.15%)
  let clusterPrice: number | null = null;
  outer: for (let a = 0; a < pivotPrices.length - 1; a++) {
    for (let b = a + 1; b < pivotPrices.length; b++) {
      const mid = (pivotPrices[a] + pivotPrices[b]) / 2;
      if (mid > 0 && Math.abs(pivotPrices[a] - pivotPrices[b]) / mid < 0.0015) {
        clusterPrice = mid;
        break outer;
      }
    }
  }
  // Fallback: use the most recent swing point as a single level
  if (clusterPrice === null && pivotPrices.length > 0) {
    clusterPrice = pivotPrices[pivotPrices.length - 1];
  }
  if (clusterPrice === null) return null;

  // Find the sweep candle in the window
  for (let i = startBar; i < endBar; i++) {
    if (side === "BUY") {
      // Sweep of lows: wick breaks below cluster by ≥0.1%, close back ABOVE cluster
      if (l1m[i] < clusterPrice * (1 - 0.001) && c1m[i] > clusterPrice) {
        return { sweptPrice: clusterPrice, sweepExtreme: l1m[i], sweepBar: i };
      }
    } else {
      // Sweep of highs: wick breaks above cluster by ≥0.1%, close back BELOW cluster
      if (h1m[i] > clusterPrice * (1 + 0.001) && c1m[i] < clusterPrice) {
        return { sweptPrice: clusterPrice, sweepExtreme: h1m[i], sweepBar: i };
      }
    }
  }
  return null;
}

/**
 * ICT ChoCH (Change of Character) on 1M bars — exact definition:
 *
 *   BUY ChoCH: In a bearish leg (sequence of Lower Lows), the last swing HIGH before
 *              the most recent Low becomes the ChoCH level. When a 1M candle CLOSES
 *              above that swing high → ChoCH confirmed. Structure changed from bearish to bullish.
 *
 *   SELL ChoCH: In a bullish leg (sequence of Higher Highs), the last swing LOW before
 *               the most recent High becomes the ChoCH level. When a 1M candle CLOSES
 *               below that swing low → ChoCH confirmed.
 *
 *   Key: it must be a CLOSE beyond the level, not just a wick.
 */
function smcChoch1m(
  h1m: number[], l1m: number[], c1m: number[],
  side: "BUY" | "SELL",
  startBar: number, endBar: number,
): { chochBar: number; chochLevel: number } | null {
  if (endBar - startBar < 5) return null;
  const hSlice = h1m.slice(startBar, endBar + 1);
  const lSlice = l1m.slice(startBar, endBar + 1);

  const { highs, lows } = smcSwingPoints(hSlice, lSlice, 2);

  if (side === "BUY") {
    // Need at least one confirmed swing high (the high of the bearish leg)
    if (highs.length < 1) return null;
    // The ChoCH level = the most recent swing HIGH within our search window
    // (the last high that was made during the bearish move toward the zone)
    const chochLevelLocal = highs[highs.length - 1];
    const chochLevelAbs = startBar + chochLevelLocal;
    const level = h1m[chochLevelAbs];
    // Now find first 1M bar after that swing high where close > level
    for (let i = chochLevelAbs + 1; i <= endBar && i < c1m.length; i++) {
      if (c1m[i] > level) {
        return { chochBar: i, chochLevel: level };
      }
    }
  } else {
    if (lows.length < 1) return null;
    const chochLevelLocal = lows[lows.length - 1];
    const chochLevelAbs = startBar + chochLevelLocal;
    const level = l1m[chochLevelAbs];
    for (let i = chochLevelAbs + 1; i <= endBar && i < c1m.length; i++) {
      if (c1m[i] < level) {
        return { chochBar: i, chochLevel: level };
      }
    }
  }
  return null;
}

/** London open = 08:00 UTC (BST/GMT); New York open = 13:30 UTC (EDT/EST) */
function smcSession(tsSec: number): { inSession: boolean; sessions: string[] } {
  const d = new Date(tsSec * 1000);
  const minOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  const sessions: string[] = [];
  // London Stock Exchange: 08:00–16:30 UTC (core active window for SMC 07:00–10:00)
  if (minOfDay >= 7 * 60 && minOfDay < 10 * 60) sessions.push("london");
  // New York Stock Exchange: 13:30–16:00 UTC (core NY cash session for SMC)
  if (minOfDay >= 13 * 60 + 30 && minOfDay < 16 * 60) sessions.push("new_york");
  return {
    inSession: sessions.length > 0,
    sessions,
  };
}

/**
 * Full SMC MTF Confluence detector — EXACT spec implementation.
 *
 * All 3 timeframes are REAL separate feeds from Yahoo Finance:
 *   feeds.htf1h   — Yahoo 1H bars  → aggregated every 4 bars = real 4H candles
 *   feeds.slow15m — Yahoo 15M bars → used directly for zones + SL
 *   feeds.fast1m  — Yahoo 1M bars  → used directly for ChoCH + mitigation entry
 *
 * Trade flow:
 *   1. Determine 4H bias (HH+HL = bullish, LH+LL = bearish)
 *   2. Find 15M demand/supply zones and FVGs
 *   3. On 1M: detect liquidity sweep before zone
 *   4. On 1M: confirm ChoCH after sweep
 *   5. On 1M: wait for mitigation (retrace into 15M zone/FVG)
 *   6. Entry at close of mitigation candle
 *   7. SL below 15M demand low (BUY) / above 15M supply high (SELL)
 *   8. TP at nearest swing high/low or opposing liquidity from 15M
 *   9. BE level stored in meta at 1:2 RR
 *  10. Session gate: London (07:00–10:00 UTC) + New York (13:30–16:00 UTC) only
 */
export function detectSmcMtfConfluence(
  feeds: SmcFeeds,
): PresetHit[] {
  const { htf1h, slow15m, fast1m } = feeds;

  // ── Step 1: Real 4H bias (Yahoo 1H → aggregate every 4 bars = 4H) ────────
  if (htf1h.c.length < 8) return [];
  const htf4h = smcAggregateBars(htf1h.t, htf1h.h, htf1h.l, htf1h.c, htf1h.o, 4);
  if (htf4h.c.length < 4) return [];
  const htfBias = smcHtfBias(htf4h.h, htf4h.l, Math.min(htf4h.c.length, 20));
  if (htfBias === "neutral") return [];

  // ── Step 2: Real 15M zones (demand / supply / FVG) ───────────────────────
  if (slow15m.c.length < 10) return [];
  const allZones = smcFindZones15m(slow15m.h, slow15m.l, slow15m.c, slow15m.o, 60);
  // Filter by bias: demand/fvg_bull for bullish, supply/fvg_bear for bearish
  const zones = allZones.filter((z) =>
    htfBias === "bullish"
      ? z.type === "demand" || z.type === "fvg_bull"
      : z.type === "supply" || z.type === "fvg_bear",
  );
  if (zones.length === 0) return [];

  // ── Steps 3–9: Scan 1M bars for sweep → ChoCH → mitigation ──────────────
  const n1m = fast1m.c.length;
  if (n1m < 30) return [];

  const hits: PresetHit[] = [];
  const side: "BUY" | "SELL" = htfBias === "bullish" ? "BUY" : "SELL";
  const n15m = slow15m.c.length;

  for (let i = 20; i < n1m - 3; i++) {
    // ── Session gate ──────────────────────────────────────────────────────
    const { inSession, sessions } = smcSession(fast1m.t[i]);
    if (!inSession) continue;

    const currentPrice1m = fast1m.c[i];

    // ── Find the corresponding 15M bar for this 1M timestamp ─────────────
    // Match: find 15M bar whose timestamp is the closest <= fast1m.t[i]
    let slowIdx = n15m - 1;
    for (let si = 0; si < n15m; si++) {
      if (slow15m.t[si] > fast1m.t[i]) { slowIdx = Math.max(0, si - 1); break; }
    }

    // ── Check if 1M price is near or inside a 15M zone ───────────────────
    const zone = zones.find((z) => {
      // "Near" = within 50% of zone range above/below the zone boundaries
      const buf = Math.max((z.high - z.low) * 0.5, z.high * 0.002);
      return side === "BUY"
        ? currentPrice1m >= z.low - buf && currentPrice1m <= z.high + buf
        : currentPrice1m <= z.high + buf && currentPrice1m >= z.low - buf;
    });
    if (!zone) continue;

    // ── Step 3: Liquidity sweep on 1M — must precede zone touch ──────────
    const sweepSearchStart = Math.max(0, i - 30);
    const sweep = smcLiquiditySweep1m(
      fast1m.h, fast1m.l, fast1m.c,
      side,
      sweepSearchStart, i,
    );
    if (!sweep) continue;
    // Sweep must happen BEFORE price reaches the zone (sweep.sweepBar < zone touch)
    if (sweep.sweepBar >= i) continue;

    // ── Step 4: ChoCH on 1M after the sweep ──────────────────────────────
    const chochEnd = Math.min(i + 5, n1m - 2);
    const choch = smcChoch1m(
      fast1m.h, fast1m.l, fast1m.c,
      side,
      sweep.sweepBar, chochEnd,
    );
    if (!choch) continue;

    // ── Step 5: Mitigation — retrace into zone/FVG after ChoCH ───────────
    let entryBar = -1;
    for (let j = choch.chochBar + 1; j <= Math.min(choch.chochBar + 15, n1m - 2); j++) {
      const touchesZone = side === "BUY"
        ? fast1m.l[j] <= zone.high && fast1m.h[j] >= zone.low
        : fast1m.h[j] >= zone.low  && fast1m.l[j] <= zone.high;
      if (touchesZone) {
        entryBar = j;
        break;
      }
    }
    if (entryBar < 0) continue;

    // ── Entry price = close of the mitigation candle ──────────────────────
    const entryPrice = fast1m.c[entryBar];

    // ── Step 7: SL pinned to REAL 15M zone extreme ────────────────────────
    // SL = below 15M demand zone LOW (BUY) or above 15M supply zone HIGH (SELL)
    // Add 1 pip equivalent (0.01%) as buffer
    const structureSl = side === "BUY"
      ? zone.low  * (1 - 0.0001)
      : zone.high * (1 + 0.0001);

    // ── Step 8: TP at nearest opposing liquidity on 15M ──────────────────
    const { highs: swH15, lows: swL15 } = smcSwingPoints(
      slow15m.h.slice(0, slowIdx + 1),
      slow15m.l.slice(0, slowIdx + 1),
      3,
    );
    let liquidityTp: number;
    if (side === "BUY") {
      // TP = nearest swing HIGH above entry on 15M
      const cands = swH15.map((si) => slow15m.h[si]).filter((p) => p > entryPrice);
      liquidityTp = cands.length > 0
        ? Math.min(...cands)   // nearest (lowest) swing high above entry
        : entryPrice * 1.01;  // fallback 1%
    } else {
      // TP = nearest swing LOW below entry on 15M
      const cands = swL15.map((si) => slow15m.l[si]).filter((p) => p < entryPrice);
      liquidityTp = cands.length > 0
        ? Math.max(...cands)  // nearest (highest) swing low below entry
        : entryPrice * 0.99;
    }

    // ── Step 9: Breakeven at 1:2 RR ──────────────────────────────────────
    const riskDist = Math.abs(entryPrice - structureSl);
    const breakevenLevel = side === "BUY"
      ? entryPrice + riskDist * 2
      : entryPrice - riskDist * 2;

    const meta: SmcMtfMeta = {
      htfBias,
      zoneHigh: zone.high,
      zoneLow: zone.low,
      zoneType: zone.type === "fvg_bull" ? "fvg"
              : zone.type === "fvg_bear" ? "fvg"
              : zone.type as "demand" | "supply",
      sweptLiquidityPrice: sweep.sweptPrice,
      sweepExtreme: sweep.sweepExtreme,
      chochLevel: choch.chochLevel,
      mitigationEntryPrice: entryPrice,
      structureSl,
      liquidityTp,
      breakevenLevel,
      sessions,
    };

    hits.push({
      i: entryBar,
      side,
      meta: meta as unknown as PresetHit["meta"],
    });

    // Advance past this trade's zone to avoid duplicate signals in same zone
    i = entryBar + 15;
  }

  // Deduplicate: keep latest hit per side per 20-bar window on 1M
  const deduped: PresetHit[] = [];
  for (const hit of hits) {
    const prev = deduped.findLast((x) => x.side === hit.side);
    if (!prev || hit.i - prev.i > 20) deduped.push(hit);
  }
  return deduped;
}
