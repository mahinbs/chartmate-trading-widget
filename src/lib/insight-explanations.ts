/** Short “why this label” copy for Insights cards (post-analysis). */

function norm(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

export function explainDriverKey(raw: string): string {
  const k = norm(raw);
  const map: Record<string, string> = {
    mean_reversion:
      "Price has moved away from its recent average; the engine weighs a partial snap-back unless trend strength overrides.",
    volume_confirmation:
      "Volume either backs the move (stronger conviction) or leaves it fragile (low participation).",
    momentum:
      "Directional speed of price changes: strong momentum can extend; weak momentum favours caution.",
    rsi_signal:
      "Relative strength index context (overbought/oversold/neutral) feeding the probability mix.",
    macd_signal:
      "Trend/momentum crossover structure from MACD—used as one vote, not a standalone trigger.",
    trend_following:
      "Signals aligned with the prevailing trend direction on your chart timeframe.",
    bollinger_squeeze:
      "Volatility compression that often precedes a larger move; direction still needs confirmation.",
    quantum_ensemble:
      "Blended statistical models when the primary AI path is unavailable or as a cross-check.",
    sentiment:
      "Headline and text sentiment from news feeds—can diverge from pure price action.",
  };
  return map[k] || "Feature from the model stack that influenced scores; it is one input among many, not a guarantee.";
}

export function explainRiskKey(raw: string): string {
  const k = norm(raw);
  const map: Record<string, string> = {
    high_volatility: "ATR/volatility regime suggests wider swings—position size and stops should reflect that.",
    extreme_deviation: "Price is far from a key mean; mean-reversion and trend trades both carry whip risk.",
    low_volume_confirmation: "The move lacks strong volume backing; breakouts are easier to fake.",
    weak_trend: "Trend strength is low—directional trades have less edge until structure improves.",
    extreme_volatility_regime: "Volatility is in a stress bucket; expect gaps and fast reversals.",
    volatility_breakout_imminent: "A volatility squeeze may resolve soon—wait for direction confirmation.",
  };
  return map[k] || "Risk flag from the pipeline; review how it interacts with your timeframe and leverage.";
}

export function explainPatternKey(raw: string): string {
  const k = norm(raw);
  const map: Record<string, string> = {
    macd_bearish: "MACD line below signal: short-term momentum leaning down on this window.",
    macd_bullish: "MACD line above signal: short-term momentum leaning up on this window.",
    bb_breakout_lower: "Close or probe near/below lower Bollinger Band—often mean-reversion or breakdown context.",
    bb_breakout_upper: "Close or probe near/above upper band—often continuation or exhaustion context.",
    oversold_rsi: "RSI in a low zone—bounce potential, not automatic buy without structure.",
    overbought_rsi: "RSI in a high zone—pullback potential, not automatic sell without structure.",
    mean_reversion_down: "Downside mean-reversion bias—price may be stretched below short-term fair value; confirm with trend.",
    mean_reversion_bullish: "Bullish mean-reversion cue—often after a dip into support or oversold momentum.",
    mean_reversion_bearish: "Bearish mean-reversion cue—often after a spike into resistance.",
    at_lower_bb: "Price interacting with the lower Bollinger band—watch for bounce vs breakdown.",
  };
  return map[k] || "Pattern label from rule-based detection on your candle series; confirm on the chart.";
}
