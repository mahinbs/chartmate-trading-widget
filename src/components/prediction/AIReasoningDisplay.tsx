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
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          AI Reasoning
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Why the AI made this analysis
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        
        {/* One-Line Summary */}
        <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
          <p className="font-semibold text-base leading-relaxed">
            "{generateOneLiner()}"
          </p>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid md:grid-cols-2 gap-4">
          
          {/* Technical Factors */}
          {technicalFactors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <h4 className="font-semibold text-sm">Technical Factors</h4>
              </div>
              <ul className="space-y-1">
                {technicalFactors.slice(0, 5).map((factor, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
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
                <Target className="h-4 w-4 text-green-500" />
                <h4 className="font-semibold text-sm">Key Drivers</h4>
              </div>
              <ul className="space-y-1">
                {keyDrivers.slice(0, 5).map((driver, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-green-500 font-bold">•</span>
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
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <h4 className="font-semibold text-sm">Fundamental Factors</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {fundamentalFactors.map((factor, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Confidence Explanation */}
        <div className="p-3 bg-muted/50 rounded-lg text-sm">
          <p className="font-semibold mb-1">ML Confidence Explanation:</p>
          <p className="text-muted-foreground">
            {confidence >= 80 && `High confidence - Multiple strong signals aligned with historical patterns showing ${confidence}% success rate in similar conditions.`}
            {confidence >= 60 && confidence < 80 && `Moderate confidence - Several positive indicators present, but some conflicting signals. ${confidence}% confidence based on pattern matching.`}
            {confidence < 60 && `Low confidence - Mixed or weak signals. Market conditions unclear. Only ${confidence}% confidence - consider waiting for better setup.`}
          </p>
        </div>

        {/* ENHANCED: Deep Analysis Section */}
        {deepAnalysis && (
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Deep Analysis
            </h3>

            {/* Bullish vs Bearish Case */}
            {(deepAnalysis.bullish_case || deepAnalysis.bearish_case) && (
              <Collapsible open={showBullBear} onOpenChange={setShowBullBear}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold hover:text-primary">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  Bull vs Bear Case
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {deepAnalysis.bullish_case && (
                    <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                      <p className="font-semibold text-sm text-green-700 dark:text-green-400 mb-1">
                        📈 Bullish Case
                      </p>
                      <p className="text-sm text-muted-foreground">{deepAnalysis.bullish_case}</p>
                    </div>
                  )}
                  {deepAnalysis.bearish_case && (
                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <p className="font-semibold text-sm text-red-700 dark:text-red-400 mb-1">
                        📉 Bearish Case
                      </p>
                      <p className="text-sm text-muted-foreground">{deepAnalysis.bearish_case}</p>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Contrarian View */}
            {deepAnalysis.contrarian_view && (
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Contrarian View (What Traders Might Miss)
                </p>
                <p className="text-sm text-muted-foreground">{deepAnalysis.contrarian_view}</p>
              </div>
            )}

            {/* Conviction Rationale */}
            {deepAnalysis.conviction_rationale && (
              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <p className="font-semibold text-sm text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Why This Recommendation?
                </p>
                <p className="text-sm text-muted-foreground">{deepAnalysis.conviction_rationale}</p>
              </div>
            )}

            {/* Risk/Reward Metrics */}
            {(deepAnalysis.risk_reward_ratio || deepAnalysis.success_probability) && (
              <div className="grid grid-cols-2 gap-3">
                {deepAnalysis.risk_reward_ratio && (
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Risk/Reward Ratio</p>
                    <p className="text-2xl font-bold text-primary">
                      {deepAnalysis.risk_reward_ratio.toFixed(1)}:1
                    </p>
                  </div>
                )}
                {deepAnalysis.success_probability && (
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Success Probability</p>
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
                <p className="font-semibold text-sm text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  ⚠️ Invalidation Triggers (Exit if these happen)
                </p>
                <ul className="space-y-1">
                  {deepAnalysis.invalidation_triggers.map((trigger, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <span className="text-red-500 font-bold">•</span>
                      <span className="text-muted-foreground">{trigger}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ENHANCED: Market Context Section */}
        {marketContext && Object.values(marketContext).some(v => v) && (
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Market Context
            </h3>
            
            <Collapsible open={showMarketContext} onOpenChange={setShowMarketContext}>
              <CollapsibleTrigger className="text-sm font-semibold hover:text-primary">
                Correlation, Sector & Macro Analysis
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                {marketContext.correlation_insight && (
                  <div className="p-2 bg-muted/30 rounded text-sm">
                    <span className="font-semibold">SPY Correlation:</span>{" "}
                    <span className="text-muted-foreground">{marketContext.correlation_insight}</span>
                  </div>
                )}
                {marketContext.sector_strength && (
                  <div className="p-2 bg-muted/30 rounded text-sm">
                    <span className="font-semibold">Sector Strength:</span>{" "}
                    <span className="text-muted-foreground">{marketContext.sector_strength}</span>
                  </div>
                )}
                {marketContext.macro_factors && (
                  <div className="p-2 bg-muted/30 rounded text-sm">
                    <span className="font-semibold">Macro Environment:</span>{" "}
                    <span className="text-muted-foreground">{marketContext.macro_factors}</span>
                  </div>
                )}
                {marketContext.institutional_activity && (
                  <div className="p-2 bg-muted/30 rounded text-sm">
                    <span className="font-semibold">Institutional Activity:</span>{" "}
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
