import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, TrendingUp, Activity, Target, AlertTriangle, TrendingDown, Shield, BarChart3 } from "lucide-react";
import { formatTechnicalFactor, formatKeyDriver } from "@/lib/display-utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface DeepAnalysis {
  bullish_case?: string;
  bearish_case?: string;
  contrarian_view?: string;
  conviction_rationale?: string;
  invalidation_triggers?: string[];
  risk_reward_ratio?: number;
  success_probability?: number;
}

interface MarketContext {
  correlation_insight?: string;
  sector_strength?: string;
  macro_factors?: string;
  institutional_activity?: string;
}

interface AIReasoningDisplayProps {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  technicalFactors?: string[];
  fundamentalFactors?: string[];
  keyDrivers?: string[];
  oneLineSummary?: string;
  deepAnalysis?: DeepAnalysis;
  marketContext?: MarketContext;
}

export function AIReasoningDisplay({
  symbol,
  action,
  confidence,
  technicalFactors = [],
  fundamentalFactors = [],
  keyDrivers = [],
  oneLineSummary,
  deepAnalysis,
  marketContext
}: AIReasoningDisplayProps) {

  const [showBullBear, setShowBullBear] = useState(true);
  const [showMarketContext, setShowMarketContext] = useState(true);

  // Generate one-line explanation if not provided
  const generateOneLiner = () => {
    if (oneLineSummary) return oneLineSummary;

    const primaryDriver = keyDrivers[0] ? formatKeyDriver(keyDrivers[0]) :
      technicalFactors[0] ? formatTechnicalFactor(technicalFactors[0]) :
        'favorable market conditions';
    const confidenceLevel = confidence >= 80 ? 'strong' : confidence >= 60 ? 'moderate' : 'weak';

    return `${action} signal generated with ${confidenceLevel} confidence due to ${primaryDriver.toLowerCase()}.`;
  };

  return (
    <Card className="glass-panel overflow-hidden relative">
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-70" />
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-xl tracking-tight text-white">
          <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <Lightbulb className="h-5 w-5 text-primary animate-pulse" />
          </div>
          AI Reasoning Engine
        </CardTitle>
        <p className="text-sm text-muted-foreground/80 pl-11">
          Algorithmic rationale and core drivers behind this signal
        </p>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* One-Line Summary */}
        <div className="p-5 bg-gradient-to-r from-primary/10 to-transparent border-l-4 border-primary rounded-r-xl shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay"></div>
          <p className="font-medium text-lg leading-relaxed text-zinc-200 relative z-10">
            "{generateOneLiner()}"
          </p>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* Technical Factors */}
          {technicalFactors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-blue-400" />
                <h4 className="font-semibold text-sm text-zinc-300">Technical Factors</h4>
              </div>
              <ul className="space-y-1">
                {technicalFactors.slice(0, 5).map((factor, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-blue-400 font-bold">•</span>
                    <span className="text-muted-foreground">{formatTechnicalFactor(factor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Drivers */}
          {keyDrivers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-green-400" />
                <h4 className="font-semibold text-sm text-zinc-300">Key Drivers</h4>
              </div>
              <ul className="space-y-1">
                {keyDrivers.slice(0, 5).map((driver, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-green-400 font-bold">•</span>
                    <span className="text-muted-foreground">{formatKeyDriver(driver)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* Fundamentals */}
        {fundamentalFactors.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              <h4 className="font-semibold text-sm text-zinc-300">Fundamental Factors</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {fundamentalFactors.map((factor, idx) => (
                <Badge key={idx} variant="outline" className="text-xs border-white/10 text-muted-foreground">
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Confidence Explanation */}
        <div className="p-3 bg-white/5 rounded-lg text-sm border border-white/5">
          <p className="font-semibold mb-1 text-zinc-300">ML Confidence Explanation:</p>
          <p className="text-muted-foreground">
            {confidence >= 80 && `High confidence - Multiple strong signals aligned with historical patterns showing ${confidence}% success rate in similar conditions.`}
            {confidence >= 60 && confidence < 80 && `Moderate confidence - Several positive indicators present, but some conflicting signals. ${confidence}% confidence based on pattern matching.`}
            {confidence < 60 && `Low confidence - Mixed or weak signals. Market conditions unclear. Only ${confidence}% confidence - consider waiting for better setup.`}
          </p>
        </div>

        {/* ENHANCED: Deep Analysis Section */}
        {deepAnalysis && (
          <div className="space-y-4 border-t border-white/10 pt-4">
            <h3 className="font-semibold text-base flex items-center gap-2 text-white">
              <BarChart3 className="h-5 w-5 text-primary" />
              Deep Analysis
            </h3>

            {/* Bullish vs Bearish Case */}
            {(deepAnalysis.bullish_case || deepAnalysis.bearish_case) && (
              <Collapsible open={showBullBear} onOpenChange={setShowBullBear}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-primary transition-colors">
                  <TrendingUp className="h-4 w-4 text-green-400" />
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  Bull vs Bear Case
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {deepAnalysis.bullish_case && (
                    <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                      <p className="font-semibold text-sm text-green-400 mb-1">
                        📈 Bullish Case
                      </p>
                      <p className="text-sm text-zinc-400">{deepAnalysis.bullish_case}</p>
                    </div>
                  )}
                  {deepAnalysis.bearish_case && (
                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <p className="font-semibold text-sm text-red-400 mb-1">
                        📉 Bearish Case
                      </p>
                      <p className="text-sm text-zinc-400">{deepAnalysis.bearish_case}</p>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Contrarian View */}
            {deepAnalysis.contrarian_view && (
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="font-semibold text-sm text-amber-400 mb-1 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Contrarian View (What Traders Might Miss)
                </p>
                <p className="text-sm text-zinc-400">{deepAnalysis.contrarian_view}</p>
              </div>
            )}

            {/* Conviction Rationale */}
            {deepAnalysis.conviction_rationale && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="font-semibold text-sm text-blue-400 mb-1 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Why This Recommendation?
                </p>
                <p className="text-sm text-zinc-400">{deepAnalysis.conviction_rationale}</p>
              </div>
            )}

            {/* Risk/Reward Metrics */}
            {(deepAnalysis.risk_reward_ratio || deepAnalysis.success_probability) && (
              <div className="grid grid-cols-2 gap-3">
                {deepAnalysis.risk_reward_ratio && (
                  <div className="p-3 bg-white/5 rounded-lg text-center border border-white/5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Risk/Reward Ratio</p>
                    <p className="text-2xl font-bold text-primary">
                      {deepAnalysis.risk_reward_ratio.toFixed(1)}:1
                    </p>
                  </div>
                )}
                {deepAnalysis.success_probability && (
                  <div className="p-3 bg-white/5 rounded-lg text-center border border-white/5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Success Probability</p>
                    <p className="text-2xl font-bold text-primary">
                      {deepAnalysis.success_probability}%
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Invalidation Triggers */}
            {deepAnalysis.invalidation_triggers && deepAnalysis.invalidation_triggers.length > 0 && (
              <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                <p className="font-semibold text-sm text-red-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  ⚠️ Invalidation Triggers (Exit if these happen)
                </p>
                <ul className="space-y-1">
                  {deepAnalysis.invalidation_triggers.map((trigger, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <span className="text-red-500 font-bold">•</span>
                      <span className="text-zinc-400">{trigger}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ENHANCED: Market Context Section */}
        {marketContext && Object.values(marketContext).some(v => v) && (
          <div className="space-y-3 border-t border-white/10 pt-4">
            <h3 className="font-semibold text-base flex items-center gap-2 text-white">
              <Shield className="h-5 w-5 text-primary" />
              Market Context
            </h3>

            <Collapsible open={showMarketContext} onOpenChange={setShowMarketContext}>
              <CollapsibleTrigger className="text-sm font-semibold text-zinc-300 hover:text-primary transition-colors">
                Correlation, Sector & Macro Analysis
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                {marketContext.correlation_insight && (
                  <div className="p-2 bg-white/5 rounded text-sm border border-white/5">
                    <span className="font-semibold text-zinc-300">SPY Correlation:</span>{" "}
                    <span className="text-muted-foreground">{marketContext.correlation_insight}</span>
                  </div>
                )}
                {marketContext.sector_strength && (
                  <div className="p-2 bg-white/5 rounded text-sm border border-white/5">
                    <span className="font-semibold text-zinc-300">Sector Strength:</span>{" "}
                    <span className="text-muted-foreground">{marketContext.sector_strength}</span>
                  </div>
                )}
                {marketContext.macro_factors && (
                  <div className="p-2 bg-white/5 rounded text-sm border border-white/5">
                    <span className="font-semibold text-zinc-300">Macro Environment:</span>{" "}
                    <span className="text-muted-foreground">{marketContext.macro_factors}</span>
                  </div>
                )}
                {marketContext.institutional_activity && (
                  <div className="p-2 bg-white/5 rounded text-sm border border-white/5">
                    <span className="font-semibold text-zinc-300">Institutional Activity:</span>{" "}
                    <span className="text-muted-foreground">{marketContext.institutional_activity}</span>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
