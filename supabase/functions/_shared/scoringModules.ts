/**
 * scoringModules.ts — Pure math utilities for the 7-module trade-entry scoring engine.
 * No I/O, no side effects. All functions operate on pre-fetched OHLCV number arrays.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function smaArr(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  for (let i = period - 1; i < arr.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += arr[i - j];
    out[i] = s / period;
  }
  return out;
}

export function emaArr(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  if (!arr.length || period <= 0) return out;
  const k = 2 / (period + 1);
  let prev = arr[0];
  out[0] = prev;
  for (let i = 1; i < arr.length; i++) {
    prev = arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function atrArr(h: number[], l: number[], c: number[], period = 14): number[] {
  const n = c.length;
  const out = new Array(n).fill(NaN);
  const tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    tr[i] =
      i === 0
        ? h[i] - l[i]
        : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  // Simple average for first window, then Wilder's smoothing
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1 HELPERS: ADX + MARKET PHASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the Average Directional Index (ADX) using Wilder's smoothing.
 * Returns array same length as input (NaN until enough bars).
 */
export function computeAdx(h: number[], l: number[], c: number[], period = 14): number[] {
  const n = c.length;
  const adxOut = new Array(n).fill(NaN);
  if (n < period * 2) return adxOut;

  const tr = new Array(n).fill(0);
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    const upMove = h[i] - h[i - 1];
    const downMove = l[i - 1] - l[i];
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  // First smoothed values
  let sTR = 0, sPDM = 0, sMDM = 0;
  for (let i = 1; i <= period; i++) {
    sTR += tr[i];
    sPDM += plusDM[i];
    sMDM += minusDM[i];
  }

  const diPlus = new Array(n).fill(NaN);
  const diMinus = new Array(n).fill(NaN);
  const dx = new Array(n).fill(NaN);

  function calcDI(pdm: number, mdm: number, atr: number) {
    const dip = atr > 0 ? (pdm / atr) * 100 : 0;
    const dim = atr > 0 ? (mdm / atr) * 100 : 0;
    const dxv = dip + dim > 0 ? (Math.abs(dip - dim) / (dip + dim)) * 100 : 0;
    return { dip, dim, dxv };
  }

  let firstDI = calcDI(sPDM, sMDM, sTR);
  diPlus[period] = firstDI.dip;
  diMinus[period] = firstDI.dim;
  dx[period] = firstDI.dxv;

  for (let i = period + 1; i < n; i++) {
    sTR = sTR - sTR / period + tr[i];
    sPDM = sPDM - sPDM / period + plusDM[i];
    sMDM = sMDM - sMDM / period + minusDM[i];
    const d = calcDI(sPDM, sMDM, sTR);
    diPlus[i] = d.dip;
    diMinus[i] = d.dim;
    dx[i] = d.dxv;
  }

  // ADX = Wilder-smoothed DX over `period` bars
  let dxSum = 0;
  let count = 0;
  for (let i = period; i <= period * 2 && i < n; i++) {
    if (Number.isFinite(dx[i])) {
      dxSum += dx[i];
      count++;
    }
  }
  if (count < period) return adxOut;
  adxOut[period * 2] = dxSum / period;
  for (let i = period * 2 + 1; i < n; i++) {
    if (!Number.isFinite(dx[i])) {
      adxOut[i] = adxOut[i - 1];
      continue;
    }
    adxOut[i] = (adxOut[i - 1] * (period - 1) + dx[i]) / period;
  }
  return adxOut;
}

export type MarketPhase = "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "VOLATILE";

/**
 * Classify the current market phase at the last bar index.
 * Uses ADX strength + EMA alignment + ATR/range ratio.
 */
export function classifyMarketPhase(params: {
  adxArr: number[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  h: number[];
  l: number[];
  c: number[];
  atr: number[];
}): { phase: MarketPhase; adxValue: number; trendDirection: "UP" | "DOWN" | "NEUTRAL" } {
  const { adxArr, ema20, ema50, ema200, h, l, c, atr } = params;
  const n = c.length;
  const i = n - 1;

  const adxVal = adxArr[i];
  const e20 = ema20[i];
  const e50 = ema50[i];
  const e200 = ema200[i];
  const atrVal = atr[i];
  const lastClose = c[i];

  // Volatility check: (H-L) / SMA(ATR,14) > 1.5
  const smaAtr = smaArr(atr, 14);
  const smaAtrVal = smaAtr[i];
  const hlRatio = smaAtrVal > 0 ? (h[i] - l[i]) / smaAtrVal : 0;

  let trendDirection: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";

  if (Number.isFinite(e20) && Number.isFinite(e50)) {
    if (e20 > e50 && lastClose > e20) trendDirection = "UP";
    else if (e20 < e50 && lastClose < e20) trendDirection = "DOWN";
  }

  if (Number.isFinite(hlRatio) && hlRatio > 1.5) {
    return { phase: "VOLATILE", adxValue: adxVal, trendDirection };
  }

  if (Number.isFinite(adxVal)) {
    if (adxVal > 25) {
      // Strong trend — check EMA alignment for direction
      const bullAligned =
        Number.isFinite(e20) && Number.isFinite(e50) && Number.isFinite(e200) &&
        e20 > e50 && e50 > e200;
      const bearAligned =
        Number.isFinite(e20) && Number.isFinite(e50) && Number.isFinite(e200) &&
        e20 < e50 && e50 < e200;
      if (bullAligned || (trendDirection === "UP" && !bearAligned)) {
        return { phase: "TRENDING_UP", adxValue: adxVal, trendDirection: "UP" };
      }
      if (bearAligned || (trendDirection === "DOWN" && !bullAligned)) {
        return { phase: "TRENDING_DOWN", adxValue: adxVal, trendDirection: "DOWN" };
      }
    }
    if (adxVal < 20) {
      return { phase: "RANGING", adxValue: adxVal, trendDirection };
    }
  }

  // ADX 20–25: mixed — lean on EMA alignment
  if (trendDirection === "UP") return { phase: "TRENDING_UP", adxValue: adxVal, trendDirection };
  if (trendDirection === "DOWN") return { phase: "TRENDING_DOWN", adxValue: adxVal, trendDirection };
  return { phase: "RANGING", adxValue: adxVal, trendDirection };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2 HELPERS: SWING PIVOT DETECTOR + STRUCTURE CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type PivotKind = "HH" | "HL" | "LH" | "LL";

export type Pivot = {
  i: number;
  price: number;
  kind: PivotKind;
  isHigh: boolean;
};

/**
 * Detect swing highs and lows with N-bar confirmation on each side.
 * Classifies each as HH/HL (lows) or LH/LL (highs) relative to the prior pivot of the same type.
 */
export function findPivots(h: number[], l: number[], n = 2): Pivot[] {
  const len = h.length;
  const pivots: Pivot[] = [];
  let lastSwingHigh: number | null = null;
  let lastSwingLow: number | null = null;

  for (let i = n; i < len - n; i++) {
    // Swing High: h[i] is the highest in the window [i-n..i+n]
    let isHigh = true;
    for (let k = 1; k <= n; k++) {
      if (h[i] <= h[i - k] || h[i] <= h[i + k]) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      const kind: PivotKind = lastSwingHigh === null || h[i] > lastSwingHigh ? "HH" : "LH";
      pivots.push({ i, price: h[i], kind, isHigh: true });
      lastSwingHigh = h[i];
    }

    // Swing Low: l[i] is the lowest in the window [i-n..i+n]
    let isLow = true;
    for (let k = 1; k <= n; k++) {
      if (l[i] >= l[i - k] || l[i] >= l[i + k]) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      const kind: PivotKind = lastSwingLow === null || l[i] > lastSwingLow ? "HL" : "LL";
      pivots.push({ i, price: l[i], kind, isHigh: false });
      lastSwingLow = l[i];
    }
  }

  return pivots.sort((a, b) => a.i - b.i);
}

/** Returns the most recent swing high and swing low from a pivot array. */
export function recentSwingLevels(pivots: Pivot[]): {
  swingHigh: number | null;
  swingLow: number | null;
} {
  let swingHigh: number | null = null;
  let swingLow: number | null = null;
  for (let i = pivots.length - 1; i >= 0; i--) {
    if (swingHigh === null && pivots[i].isHigh) swingHigh = pivots[i].price;
    if (swingLow === null && !pivots[i].isHigh) swingLow = pivots[i].price;
    if (swingHigh !== null && swingLow !== null) break;
  }
  return { swingHigh, swingLow };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 HELPERS: SMART MONEY — FVG + ORDER BLOCKS
// ─────────────────────────────────────────────────────────────────────────────

export type FVGZone = {
  i: number;
  kind: "bullish" | "bearish";
  low: number;
  high: number;
};

/**
 * Detect Fair Value Gaps (3-candle imbalance).
 * Bullish FVG: Low[i] > High[i-2] — price moved up leaving a gap.
 * Bearish FVG: High[i] < Low[i-2] — price moved down leaving a gap.
 * Returns only the last `maxZones` gaps so callers don't store huge arrays.
 */
export function detectFVG(h: number[], l: number[], maxZones = 20): FVGZone[] {
  const zones: FVGZone[] = [];
  for (let i = 2; i < h.length; i++) {
    if (l[i] > h[i - 2]) {
      zones.push({ i, kind: "bullish", low: h[i - 2], high: l[i] });
    } else if (h[i] < l[i - 2]) {
      zones.push({ i, kind: "bearish", low: h[i], high: l[i - 2] });
    }
  }
  return zones.slice(-maxZones);
}

export type OrderBlock = {
  i: number;
  kind: "bullish" | "bearish";
  zoneHigh: number;
  zoneLow: number;
};

/**
 * Detect Order Blocks: the last opposing candle before a Break of Structure (BOS).
 * BOS: Close[i] > previous swing high (bullish BOS) or Close[i] < previous swing low (bearish BOS).
 * The last bearish candle before the bullish BOS = bullish order block.
 */
export function detectOrderBlocks(
  h: number[],
  l: number[],
  c: number[],
  o: number[],
  pivots: Pivot[],
  maxBlocks = 10,
): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  const n = c.length;

  const swingHighs = pivots.filter((p) => p.isHigh);
  const swingLows = pivots.filter((p) => !p.isHigh);

  for (let i = 20; i < n; i++) {
    // Bullish BOS: close crosses above recent swing high
    const prevHigh = swingHighs.findLast((p) => p.i < i - 1)?.price;
    if (prevHigh !== undefined && c[i] > prevHigh) {
      // Traceback: last bearish candle (close < open) before i
      for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
        if (c[j] < o[j]) {
          blocks.push({ i: j, kind: "bullish", zoneHigh: h[j], zoneLow: l[j] });
          break;
        }
      }
    }

    // Bearish BOS: close crosses below recent swing low
    const prevLow = swingLows.findLast((p) => p.i < i - 1)?.price;
    if (prevLow !== undefined && c[i] < prevLow) {
      // Traceback: last bullish candle (close > open) before i
      for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
        if (c[j] > o[j]) {
          blocks.push({ i: j, kind: "bearish", zoneHigh: h[j], zoneLow: l[j] });
          break;
        }
      }
    }
  }

  // Deduplicate overlapping blocks and keep most recent
  const seen = new Set<number>();
  const unique: OrderBlock[] = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (!seen.has(blocks[i].i)) {
      seen.add(blocks[i].i);
      unique.unshift(blocks[i]);
    }
  }
  return unique.slice(-maxBlocks);
}

/**
 * Check if the current price is inside an order block zone.
 * Returns the first matching block or null.
 */
export function priceInOrderBlock(
  currentPrice: number,
  blocks: OrderBlock[],
): OrderBlock | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (currentPrice >= b.zoneLow && currentPrice <= b.zoneHigh) return b;
  }
  return null;
}

/**
 * Check if the current price is inside an FVG zone (gap not yet filled).
 */
export function priceInFVG(currentPrice: number, zones: FVGZone[]): FVGZone | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (currentPrice >= z.low && currentPrice <= z.high) return z;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 HELPERS: VOLUME & ORDER FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate per-bar volume delta: positive = buying pressure, negative = selling.
 * Formula: delta ≈ volume × ((close-low) - (high-close)) / (high-low)
 */
export function computeVolumeDelta(
  h: number[],
  l: number[],
  c: number[],
  v: number[],
): number[] {
  return h.map((hi, i) => {
    const range = hi - l[i];
    if (range === 0 || !Number.isFinite(v[i])) return 0;
    return v[i] * ((c[i] - l[i]) - (hi - c[i])) / range;
  });
}

/**
 * Relative volume at a bar index: volume[i] / SMA(volume, lookback).
 * Returns 1.0 if no volume data.
 */
export function relativeVolume(v: number[], i: number, lookback = 20): number {
  if (!v.length || i < lookback) return 1.0;
  let sum = 0;
  for (let k = i - lookback; k < i; k++) sum += v[k];
  const avg = sum / lookback;
  return avg > 0 ? v[i] / avg : 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 7 HELPERS: LIQUIDITY TRAP DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stop Hunt detection: price wicks below a known swing low but closes back above it.
 * Returns trap_probability 0–100 at each bar index (0 = no trap, 80 = stop hunt pattern).
 */
export function detectStopHuntBars(
  h: number[],
  l: number[],
  c: number[],
  pivots: Pivot[],
): number[] {
  const n = c.length;
  const out = new Array(n).fill(0);
  const swingLows = pivots.filter((p) => !p.isHigh);
  const swingHighs = pivots.filter((p) => p.isHigh);

  for (let i = 1; i < n; i++) {
    // Bearish stop hunt (sweep below swing low then recover)
    const nearLow = swingLows.findLast((p) => p.i < i - 1);
    if (nearLow && l[i] < nearLow.price && c[i] > nearLow.price) {
      out[i] = Math.max(out[i], 80);
    }
    // Bullish stop hunt (sweep above swing high then reverse)
    const nearHigh = swingHighs.findLast((p) => p.i < i - 1);
    if (nearHigh && h[i] > nearHigh.price && c[i] < nearHigh.price) {
      out[i] = Math.max(out[i], 80);
    }
  }
  return out;
}

/**
 * Bull/Bear Trap: price breaks a 20-bar high/low but RSI diverges AND volume is weak.
 * Returns probability 0–100 per bar.
 */
export function detectTrapBars(
  h: number[],
  l: number[],
  c: number[],
  rsi: number[],
  v: number[],
): number[] {
  const n = c.length;
  const out = new Array(n).fill(0);
  const lookback = 20;
  const volLookback = 10;

  for (let i = lookback + volLookback; i < n; i++) {
    if (!Number.isFinite(rsi[i])) continue;

    // 20-bar high
    const high20 = Math.max(...h.slice(i - lookback, i));
    // 20-bar low
    const low20 = Math.min(...l.slice(i - lookback, i));

    // Volume average over last 10 bars
    let volSum = 0;
    for (let k = i - volLookback; k < i; k++) volSum += v[k] ?? 0;
    const volAvg = volSum / volLookback;
    const volWeak = (v[i] ?? 0) < volAvg;

    // Bull trap: breaks 20-bar high but RSI is lower than prior local max RSI
    if (c[i] > high20 * 0.999) {
      const priorRsiMax = Math.max(...rsi.slice(Math.max(0, i - lookback), i).filter(Number.isFinite));
      if (rsi[i] < priorRsiMax - 5 && volWeak) {
        out[i] = Math.max(out[i], 70);
      }
    }

    // Bear trap: breaks 20-bar low but RSI is higher than prior local min RSI
    if (c[i] < low20 * 1.001) {
      const priorRsiMin = Math.min(...rsi.slice(Math.max(0, i - lookback), i).filter(Number.isFinite));
      if (rsi[i] > priorRsiMin + 5 && volWeak) {
        out[i] = Math.max(out[i], 70);
      }
    }
  }
  return out;
}

/** Combine stop-hunt and trap probabilities at a given bar index. */
export function combinedTrapProbability(
  stopHuntProbs: number[],
  trapProbs: number[],
  i: number,
): number {
  const sh = stopHuntProbs[i] ?? 0;
  const tr = trapProbs[i] ?? 0;
  return clamp(Math.max(sh, tr), 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 6 HELPERS: RISK-REWARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute structure-based stop loss using the nearest swing level and ATR buffer.
 */
export function computeATRSL(params: {
  entryPrice: number;
  side: "BUY" | "SELL";
  swingLevel: number;
  atrValue: number;
  atrMult?: number;
}): number {
  const { entryPrice, side, swingLevel, atrValue, atrMult = 0.5 } = params;
  if (!Number.isFinite(entryPrice) || !Number.isFinite(atrValue)) return NaN;
  const buffer = atrValue * atrMult;
  if (side === "BUY") {
    return Math.max(swingLevel - buffer, entryPrice * 0.97);
  }
  return Math.min(swingLevel + buffer, entryPrice * 1.03);
}

/**
 * Map risk:reward ratio to a 0–100 score.
 * 1:1 = 20, 1:2 = 70, 1:3 = 100 (linear interpolation).
 */
export function computeRRScore(params: {
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}): { rrRatio: number; rrScore: number } {
  const { entryPrice, stopLossPrice, takeProfitPrice } = params;
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopLossPrice) ||
    !Number.isFinite(takeProfitPrice)
  ) {
    return { rrRatio: 0, rrScore: 0 };
  }
  const risk = Math.abs(entryPrice - stopLossPrice);
  const reward = Math.abs(takeProfitPrice - entryPrice);
  if (risk === 0) return { rrRatio: 0, rrScore: 0 };
  const rrRatio = reward / risk;

  // Piecewise linear: 0→0, 1→20, 2→70, 3→100, >3→100
  let rrScore: number;
  if (rrRatio < 1) {
    rrScore = rrRatio * 20;
  } else if (rrRatio < 2) {
    rrScore = 20 + (rrRatio - 1) * 50;
  } else if (rrRatio < 3) {
    rrScore = 70 + (rrRatio - 2) * 30;
  } else {
    rrScore = 100;
  }

  return { rrRatio: Math.round(rrRatio * 100) / 100, rrScore: clamp(Math.round(rrScore), 0, 100) };
}

// ─────────────────────────────────────────────────────────────────────────────
// RSI (exported for use in scoringEngine without re-importing)
// ─────────────────────────────────────────────────────────────────────────────

export function rsiArr(c: number[], period = 14): number[] {
  const n = c.length;
  const out = new Array(n).fill(NaN);
  if (n < period + 1) return out;
  const gains = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const d = c[i] - c[i - 1];
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
  out[period] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
  for (let i = period + 1; i < n; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period;
    avgL = (avgL * (period - 1) + losses[i]) / period;
    out[i] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
  }
  return out;
}
