/** Hover copy for post-analysis cards. Avoid em-dashes (they read as generic AI tone). */

export const HELP = {
  probabilityPanel:
    "Combines AI-derived probabilities with technical context for this symbol. All figures are model outputs for research, not financial advice or a recommendation to trade.",
  marketDirection:
    "Estimated chance price moves up, sideways, or down over the model horizon. Not a guarantee, since markets can gap on news. Sideways usually means consolidation or an unclear trend.",
  aiConfidence:
    "How strongly the combined model agrees with itself given your data. Low confidence means mixed signals. This is not the same as profit probability.",
  nextMoveScenarios:
    "A readable split of upward and downward totals into stronger vs moderate moves. Built from the same direction probabilities as the gauges above, not a second independent forecast.",
  pressureMap:
    "Bullish, neutral, and bearish pressure mirror the same up, sideways, and down probabilities. The top pin is net bias (up vs down), centered when they balance.",
  priceLevels:
    "Rough tags for nearby support and resistance from the model. They describe chart structure, not order book certainty.",
  probTimeline:
    "At each horizon, the bar shows modeled probability of upward resolution before that time elapses. Longer horizons usually smooth noise.",
  pressureMeter:
    "Blends directional odds, expected move, momentum, volume confirmation, and the model stance. When the meter pegs about 99 to 100% buyer side, the UI will say BUY explicitly because every input in this blend is maxed long. That is still not a profit promise.",
  volumeIntel:
    "24h volume vs recent average. Vol confirms move checks whether volume supports the lean; neutral volume often means the tape has not proven itself yet.",
  aiReasoningEngine:
    "Plain-language synthesis of what the run saw: drivers, risks, and context. This section explains the setup; it is not an order to trade.",
  marketConditions:
    "Backdrop matches your symbol type: US equities use S&P/Nasdaq/Dow and VIX; India listings use Nifty/Sensex/Bank Nifty and India VIX; crypto uses BTC/ETH/SOL with a stress score; FX uses DXY and majors with a stress score. Your ticker can still diverge.",
  marketSentiment:
    "Blends local index moves and the volatility index into a simple mood label. This is backdrop, not a duplicate of your symbol analysis.",
  majorIndices:
    "Index levels and session change vs reference close. If you see 0.00% flat on all names, quotes may be between sessions or delayed, so refresh after the open.",
  vix:
    "For US equities this is VIX; for India it is India VIX; for crypto and FX it is a scaled stress read from major benchmarks, not CBOE VIX. Higher usually means wider swings and more care on size, not a direction call.",
  newsImpact:
    "Quick macro headline risk dial for this dashboard. For the symbol, use Recent Headlines, which pulls feeds when API keys are set.",
  aiInsights:
    "Structured list of what the pipeline surfaced. Repeated labels mean several blocks agree on the same theme.",
  newsHeadlines:
    "Headlines from news APIs and RSS when available. If you see a link, it opens the publisher. If not, the line is a summary only.",
  pipelineProgress:
    "Server steps for this run. A dash for time means the step was too fast to meter separately. The bar is completion share, not accuracy.",
  pipelineStep:
    "One job stage. A dash for duration means timing was not split out, not that nothing ran.",
  multiHorizonTable:
    "Each row is another horizon from the same run. Compare to how long you plan to stay in the trade.",
  analysisTimelineCard:
    "Pipeline order plus optional horizon countdowns. Timing is diagnostic only.",
} as const;
