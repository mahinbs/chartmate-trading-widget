/**
 * scoringEngine.ts — Weighted 7-module trade-entry scoring engine.
 *
 * Inputs:  per-signal context (price, side, indicator snapshot) + pre-computed
 *          scan-level arrays (ADX, EMAs, pivots, FVG zones, order blocks, etc.)
 * Outputs: ScoreVector — the full structured JSON that replaces the old
 *          single-number heuristicMergeRow() result.
 */

import {
  type FVGZone,
  type MarketPhase,
  type OrderBlock,
  type Pivot,
  atrArr,
  classifyMarketPhase,
  combinedTrapProbability,
  computeATRSL,
  computeAdx,
  computeRRScore,
  computeVolumeDelta,
  detectFVG,
  detectOrderBlocks,
  detectStopHuntBars,
  detectTrapBars,
  emaArr,
  findPivots,
  priceInFVG,
  priceInOrderBlock,
  relativeVolume,
  rsiArr,
  smaArr,
} from "./scoringModules.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type { MarketPhase, FVGZone, OrderBlock, Pivot };

/** Full 7-module score breakdown returned per signal. */
export type ScoreVector = {
  /** Overall HTF trend direction */
  trend_direction: "UP" | "DOWN" | "NEUTRAL";
  /** M1: ADX strength + EMA phase (0–100) */
  market_strength_score: number;
  /** M2: EMA20/50/200 alignment + HH/HL structure (0–100) */
  trend_alignment_score: number;
  /** M3: RSI/MACD/BB + FVG/OB/liquidity sweep (0–100) */
  signal_strength_score: number;
  /** M4: Relative volume + delta (0–100) */
  volume_confirmation_score: number;
  /** M5: ATR volatility gate + session timing (0–100) */
  volatility_score: number;
  /** M6: Structure-based SL/TP → RR ratio mapped to 0–100 */
  rr_score: number;
  /** M7: Stop hunt + trap probability (0–100, higher = more dangerous) */
  trap_probability: number;
  /** Weighted composite: see WEIGHTS below */
  final_score: number;
  /** A = final≥75, B = 60–74, C = <60 */
  entry_quality: "A" | "B" | "C";
  /** Gate: true only when final_score > 75 and no conflicting signals */
  execute_trade: boolean;
  /** Derived SL/TP for display */
  stop_loss_price: number | null;
  take_profit_price: number | null;
  rr_ratio: number | null;
  /** Current ADX value for display */
  adx_value: number | null;
  /** Current market phase label */
  market_phase: MarketPhase | null;
};

/** Per-scan pre-computed context shared across all signals in one scan run. */
export type ScoringContext = {
  /** Primary OHLCV series (intraday or daily, whichever is used for detection) */
  h: number[];
  l: number[];
  c: number[];
  o: number[];
  v: number[];
  t: number[];
  /** Pre-computed indicator arrays (same length as h/l/c) */
  adxArr: number[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  atr14: number[];
  rsi14: number[];
  /** Market phase at the last bar */
  marketPhase: MarketPhase;
  trendDirection: "UP" | "DOWN" | "NEUTRAL";
  adxValue: number;
  /** Structural analysis */
  pivots: Pivot[];
  fvgZones: FVGZone[];
  orderBlocks: OrderBlock[];
  /** Volume flow */
  volumeDeltas: number[] | null;
  /** Trap detection arrays (same length as h/l/c) */
  stopHuntProbs: number[];
  trapProbs: number[];
  /** Real-time indicator snapshot from external API (enriches signal strength) */
  realIndicators: {
    rsi14: number | null;
    macdLine: number | null;
    macdSignal: number | null;
    bbUpper: number | null;
    bbMiddle: number | null;
    bbLower: number | null;
    currentPrice: number | null;
    changePct: number | null;
  } | null;
  /** Higher-timeframe EMA alignment for M2 context */
  htfTrendDirection?: "UP" | "DOWN" | "NEUTRAL";
};

/** Minimal signal descriptor consumed by the engine (subset of RawSignal). */
export type SignalForScoring = {
  side: "BUY" | "SELL";
  entryIndex: number;
  priceAtEntry: number;
  isLive?: boolean;
  strategyId?: string;
  customScanMeta?: Record<string, unknown> | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE WEIGHTS (sum = 1.0)
// Override via user_scoring_weights table in future continuous-learning loop.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_WEIGHTS = {
  market_context: 0.15,
  trend_alignment: 0.15,
  signal_strength: 0.20,
  volume_confirmation: 0.15,
  volatility: 0.10,
  rr_score: 0.15,
  trap_safety: 0.10, // (100 - trap_probability) × 0.10
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// MODULE SCORE CALCULATORS
// ─────────────────────────────────────────────────────────────────────────────

function scoreMarketContext(ctx: ScoringContext, side: "BUY" | "SELL"): number {
  const { adxValue, marketPhase, trendDirection, htfTrendDirection } = ctx;

  let score = 50;

  // ADX strength contribution
  if (Number.isFinite(adxValue)) {
    if (adxValue > 40) score += 25;
    else if (adxValue > 25) score += 15;
    else if (adxValue < 20) score -= 15;
  }

  // Phase alignment with trade side
  if (marketPhase === "TRENDING_UP") {
    score += side === "BUY" ? 20 : -20;
  } else if (marketPhase === "TRENDING_DOWN") {
    score += side === "SELL" ? 20 : -20;
  } else if (marketPhase === "RANGING") {
    score -= 10; // Lower conviction for breakout entries in ranging market
  } else if (marketPhase === "VOLATILE") {
    score -= 5; // Extra caution in volatile conditions
  }

  // HTF alignment bonus
  const htfDir = htfTrendDirection ?? trendDirection;
  if (
    (side === "BUY" && htfDir === "UP") ||
    (side === "SELL" && htfDir === "DOWN")
  ) {
    score += 10;
  } else if (
    (side === "BUY" && htfDir === "DOWN") ||
    (side === "SELL" && htfDir === "UP")
  ) {
    score -= 10;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

function scoreTrendAlignment(ctx: ScoringContext, signal: SignalForScoring): number {
  const { ema20, ema50, ema200, pivots, c } = ctx;
  const i = signal.entryIndex;
  const side = signal.side;

  let score = 50;

  // EMA 20/50/200 alignment
  const e20 = ema20[i];
  const e50 = ema50[i];
  const e200 = ema200[i];
  const price = c[i];

  if (Number.isFinite(e20) && Number.isFinite(e50)) {
    if (side === "BUY") {
      if (e20 > e50) score += 15; else score -= 15;
      if (Number.isFinite(e200) && e50 > e200) score += 10; else if (Number.isFinite(e200)) score -= 5;
      if (price > e20) score += 10; else score -= 10;
    } else {
      if (e20 < e50) score += 15; else score -= 15;
      if (Number.isFinite(e200) && e50 < e200) score += 10; else if (Number.isFinite(e200)) score -= 5;
      if (price < e20) score += 10; else score -= 10;
    }
  }

  // Structure: count recent HH/HL (bullish) or LH/LL (bearish) in last 8 pivots
  const recent = pivots.filter((p) => p.i <= i).slice(-8);
  if (recent.length >= 2) {
    const bullishCount = recent.filter((p) => p.kind === "HH" || p.kind === "HL").length;
    const bearishCount = recent.filter((p) => p.kind === "LH" || p.kind === "LL").length;
    const dominance = bullishCount - bearishCount;
    if (side === "BUY") score += Math.min(15, dominance * 3);
    else score += Math.min(15, -dominance * 3);
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

function scoreSignalStrength(ctx: ScoringContext, signal: SignalForScoring): number {
  const { rsi14, realIndicators, fvgZones, orderBlocks, c, h, l } = ctx;
  const i = signal.entryIndex;
  const side = signal.side;
  const price = signal.priceAtEntry;

  let score = 50;

  // RSI from bar (prefer real-time snapshot if live)
  const rsiBar = rsi14[i];
  const rsiSnap = realIndicators?.rsi14;
  const rsiVal = signal.isLive && rsiSnap != null ? rsiSnap : (Number.isFinite(rsiBar) ? rsiBar : rsiSnap);

  if (rsiVal != null && Number.isFinite(rsiVal)) {
    if (side === "BUY") {
      if (rsiVal < 30) score += 22;
      else if (rsiVal < 45) score += 12;
      else if (rsiVal > 70) score -= 20;
      else if (rsiVal > 58) score -= 8;
    } else {
      if (rsiVal > 70) score += 22;
      else if (rsiVal > 55) score += 12;
      else if (rsiVal < 30) score -= 20;
      else if (rsiVal < 42) score -= 8;
    }
  }

  // MACD
  const macdLine = realIndicators?.macdLine;
  const macdSignal = realIndicators?.macdSignal;
  if (macdLine != null && macdSignal != null) {
    const d = macdLine - macdSignal;
    if (side === "BUY") score += d > 0 ? 8 : -8;
    else score += d < 0 ? 8 : -8;
  }

  // Bollinger Bands
  const bbUpper = realIndicators?.bbUpper;
  const bbLower = realIndicators?.bbLower;
  if (bbLower != null && price > 0) {
    if (side === "BUY" && price <= bbLower * 1.01) score += 10;
    if (side === "SELL" && bbUpper != null && price >= bbUpper * 0.99) score += 10;
  }

  // FVG: +10 if price is inside an FVG zone aligned with trade side
  const fvg = priceInFVG(price, fvgZones);
  if (fvg) {
    const fvgAligned =
      (side === "BUY" && fvg.kind === "bullish") ||
      (side === "SELL" && fvg.kind === "bearish");
    score += fvgAligned ? 10 : -5;
  }

  // Order Block: +15 if price re-enters an aligned OB zone (institutional level)
  const ob = priceInOrderBlock(price, orderBlocks);
  if (ob) {
    const obAligned =
      (side === "BUY" && ob.kind === "bullish") ||
      (side === "SELL" && ob.kind === "bearish");
    score += obAligned ? 15 : -8;
  }

  // Candle strength: close near high (BUY) or close near low (SELL)
  const range = h[i] - l[i];
  if (range > 0) {
    const closeRatio = (c[i] - l[i]) / range; // 0=at low, 1=at high
    if (side === "BUY" && closeRatio > 0.6) score += 5;
    if (side === "SELL" && closeRatio < 0.4) score += 5;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

function scoreVolumeConfirmation(ctx: ScoringContext, signal: SignalForScoring): number {
  const { v, volumeDeltas } = ctx;
  const i = signal.entryIndex;
  const side = signal.side;

  if (!v.length) return 50; // No volume data — neutral

  let score = 50;

  // Relative volume: above average = bullish for conviction
  const relVol = relativeVolume(v, i, 20);
  if (relVol > 2) score += 20;
  else if (relVol > 1.5) score += 12;
  else if (relVol > 1.1) score += 6;
  else if (relVol < 0.5) score -= 15;
  else if (relVol < 0.8) score -= 8;

  // Volume delta: buying/selling pressure aligned with trade
  if (volumeDeltas) {
    const delta = volumeDeltas[i];
    if (Number.isFinite(delta)) {
      if (side === "BUY" && delta > 0) score += 15;
      else if (side === "BUY" && delta < 0) score -= 10;
      else if (side === "SELL" && delta < 0) score += 15;
      else if (side === "SELL" && delta > 0) score -= 10;
    }
  }

  // Volume spike bonus on live signal
  if (signal.isLive && relVol > 1.5) score += 5;

  return Math.round(Math.min(100, Math.max(0, score)));
}

function scoreVolatility(ctx: ScoringContext, signal: SignalForScoring): number {
  const { atr14, c, h, l } = ctx;
  const i = signal.entryIndex;

  let score = 50;

  const atrVal = atr14[i];
  const price = c[i];

  if (!Number.isFinite(atrVal) || price === 0) return 50;

  // ATR as % of price
  const atrPct = (atrVal / price) * 100;

  // Optimal volatility range: 0.3–2.5% ATR for most instruments
  // Too low = no movement opportunity; too high = uncontrollable risk
  if (atrPct < 0.2) {
    score -= 20; // Dead market
  } else if (atrPct < 0.5) {
    score += 10; // Low but tradeable
  } else if (atrPct <= 2.0) {
    score += 25; // Sweet spot
  } else if (atrPct <= 3.5) {
    score += 5; // Getting choppy
  } else {
    score -= 20; // Too volatile — wide stops required
  }

  // Candle body ratio: small bodies in volatile markets = indecision
  const range = h[i] - l[i];
  const body = Math.abs(c[i] - (i > 0 ? c[i - 1] : c[i]));
  if (range > 0 && body / range < 0.3) score -= 10; // Doji/spinning top

  return Math.round(Math.min(100, Math.max(0, score)));
}

function scoreRiskReward(ctx: ScoringContext, signal: SignalForScoring): {
  score: number;
  slPrice: number | null;
  tpPrice: number | null;
  rrRatio: number | null;
} {
  const { pivots, atr14, c } = ctx;
  const i = signal.entryIndex;
  const side = signal.side;
  const entry = signal.priceAtEntry;

  // Check if custom strategy has explicit SL/TP percentages
  const meta = signal.customScanMeta;
  const customSlPct = meta?.stop_loss_pct != null ? Number(meta.stop_loss_pct) : null;
  const customTpPct = meta?.take_profit_pct != null ? Number(meta.take_profit_pct) : null;

  const atrVal = atr14[i];
  const recentPivots = pivots.filter((p) => p.i <= i).slice(-10);

  let slPrice: number | null = null;
  let tpPrice: number | null = null;

  if (customSlPct && Number.isFinite(customSlPct)) {
    slPrice = side === "BUY"
      ? entry * (1 - customSlPct / 100)
      : entry * (1 + customSlPct / 100);
  } else {
    // Structure-based SL: nearest swing level + ATR buffer
    const swingLow = recentPivots.filter((p) => !p.isHigh).at(-1)?.price ?? null;
    const swingHigh = recentPivots.filter((p) => p.isHigh).at(-1)?.price ?? null;
    const swingLevel = side === "BUY" ? swingLow : swingHigh;

    if (swingLevel !== null && Number.isFinite(atrVal)) {
      slPrice = computeATRSL({ entryPrice: entry, side, swingLevel, atrValue: atrVal });
    } else if (Number.isFinite(atrVal)) {
      // Fallback: 1.5× ATR from entry
      slPrice = side === "BUY" ? entry - 1.5 * atrVal : entry + 1.5 * atrVal;
    }
  }

  if (customTpPct && Number.isFinite(customTpPct)) {
    tpPrice = side === "BUY"
      ? entry * (1 + customTpPct / 100)
      : entry * (1 - customTpPct / 100);
  } else if (slPrice !== null) {
    // Default: 1:2 RR
    const risk = Math.abs(entry - slPrice);
    tpPrice = side === "BUY" ? entry + 2 * risk : entry - 2 * risk;
  }

  if (slPrice === null || tpPrice === null) {
    return { score: 40, slPrice: null, tpPrice: null, rrRatio: null };
  }

  const { rrRatio, rrScore } = computeRRScore({
    entryPrice: entry,
    stopLossPrice: slPrice,
    takeProfitPrice: tpPrice,
  });

  // Gate: score is capped at 30 if RR < 1:2 (enforces minimum quality)
  const gatedScore = rrRatio < 2 ? Math.min(rrScore, 30) : rrScore;

  return {
    score: gatedScore,
    slPrice: Math.round(slPrice * 10000) / 10000,
    tpPrice: Math.round(tpPrice * 10000) / 10000,
    rrRatio,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full 7-module scoring engine for a single signal.
 * Returns a ScoreVector with all module scores, the weighted final_score,
 * entry_quality grade, and execute_trade decision.
 */
export function runScoringEngine(
  signal: SignalForScoring,
  ctx: ScoringContext,
  weights: typeof DEFAULT_WEIGHTS = DEFAULT_WEIGHTS,
): ScoreVector {
  const { stopHuntProbs, trapProbs, marketPhase, trendDirection, adxValue } = ctx;
  const i = signal.entryIndex;

  // ── Module scores ──
  const m1 = scoreMarketContext(ctx, signal.side);
  const m2 = scoreTrendAlignment(ctx, signal);
  const m3 = scoreSignalStrength(ctx, signal);
  const m4 = scoreVolumeConfirmation(ctx, signal);
  const m5 = scoreVolatility(ctx, signal);
  const m6Result = scoreRiskReward(ctx, signal);
  const m6 = m6Result.score;
  const m7 = combinedTrapProbability(stopHuntProbs, trapProbs, i);

  // ── Weighted final score ──
  const finalRaw =
    weights.market_context * m1 +
    weights.trend_alignment * m2 +
    weights.signal_strength * m3 +
    weights.volume_confirmation * m4 +
    weights.volatility * m5 +
    weights.rr_score * m6 +
    weights.trap_safety * (100 - m7);

  const final_score = Math.round(Math.min(100, Math.max(0, finalRaw)));

  // ── Entry quality ──
  const entry_quality: "A" | "B" | "C" =
    final_score >= 75 ? "A" : final_score >= 60 ? "B" : "C";

  // ── Execute gate: score > 75 AND trap_probability not critically high ──
  const execute_trade = final_score > 75 && m7 < 70;

  return {
    trend_direction: trendDirection,
    market_strength_score: m1,
    trend_alignment_score: m2,
    signal_strength_score: m3,
    volume_confirmation_score: m4,
    volatility_score: m5,
    rr_score: m6,
    trap_probability: m7,
    final_score,
    entry_quality,
    execute_trade,
    stop_loss_price: m6Result.slPrice,
    take_profit_price: m6Result.tpPrice,
    rr_ratio: m6Result.rrRatio,
    adx_value: Number.isFinite(adxValue) ? Math.round(adxValue * 10) / 10 : null,
    market_phase: marketPhase ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT BUILDER — call once per scan, shared across all signals
// ─────────────────────────────────────────────────────────────────────────────

export type OhlcvPack = {
  h: number[];
  l: number[];
  c: number[];
  o: number[];
  v: number[];
  t: number[];
};

export type RealIndicatorsSnapshot = {
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  currentPrice: number | null;
  changePct: number | null;
};

/**
 * Build the ScoringContext from raw OHLCV arrays + real indicator snapshot.
 * Call once per scan (not per signal) for efficiency.
 */
export function buildScoringContext(
  primary: OhlcvPack,
  realIndicators: RealIndicatorsSnapshot | null,
  htfOhlcv?: OhlcvPack | null,
): ScoringContext {
  const { h, l, c, o, v, t } = primary;

  const adx = computeAdx(h, l, c, 14);
  const ema20 = emaArr(c, 20);
  const ema50 = emaArr(c, 50);
  const ema200 = emaArr(c, 200);
  const atr14 = atrArr(h, l, c, 14);
  const rsi14 = rsiArr(c, 14);

  const phaseResult = classifyMarketPhase({
    adxArr: adx,
    ema20,
    ema50,
    ema200,
    h,
    l,
    c,
    atr: atr14,
  });

  const pivots = findPivots(h, l, 2);
  const fvgZones = detectFVG(h, l, 20);
  const orderBlocks = detectOrderBlocks(h, l, c, o, pivots, 10);
  const volumeDeltas = v.length === c.length ? computeVolumeDelta(h, l, c, v) : null;
  const stopHuntProbs = detectStopHuntBars(h, l, c, pivots);
  const trapProbs = detectTrapBars(h, l, c, rsi14, v.length === c.length ? v : new Array(c.length).fill(0));

  // HTF trend from higher-timeframe series
  let htfTrendDirection: "UP" | "DOWN" | "NEUTRAL" | undefined;
  if (htfOhlcv && htfOhlcv.c.length >= 50) {
    const htfEma20 = emaArr(htfOhlcv.c, 20);
    const htfEma50 = emaArr(htfOhlcv.c, 50);
    const n = htfOhlcv.c.length - 1;
    const he20 = htfEma20[n];
    const he50 = htfEma50[n];
    if (Number.isFinite(he20) && Number.isFinite(he50)) {
      htfTrendDirection = he20 > he50 ? "UP" : he20 < he50 ? "DOWN" : "NEUTRAL";
    }
  }

  return {
    h, l, c, o, v, t,
    adxArr: adx,
    ema20, ema50, ema200,
    atr14, rsi14,
    marketPhase: phaseResult.phase,
    trendDirection: phaseResult.trendDirection,
    adxValue: phaseResult.adxValue,
    pivots,
    fvgZones,
    orderBlocks,
    volumeDeltas,
    stopHuntProbs,
    trapProbs,
    realIndicators,
    htfTrendDirection,
  };
}
