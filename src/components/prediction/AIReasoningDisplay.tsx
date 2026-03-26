import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { LucideIcon } from "lucide-react";
import {
  Lightbulb,
  TrendingUp,
  Activity,
  Target,
  AlertTriangle,
  TrendingDown,
  Shield,
  BarChart3,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { formatTechnicalFactor, formatKeyDriver } from "@/lib/display-utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  technicalFactors?: string[];
  fundamentalFactors?: string[];
  keyDrivers?: string[];
  oneLineSummary?: string;
  deepAnalysis?: DeepAnalysis;
  marketContext?: MarketContext;
}

const tileClass =
  "p-3 bg-background rounded-lg border border-primary/20 shadow-sm shadow-black/5";

function SectionLabel({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 mb-2", className)}>
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <span className="font-semibold text-sm text-foreground">{children}</span>
    </div>
  );
}

export function AIReasoningDisplay({
  symbol: _symbol,
  action,
  confidence,
  technicalFactors = [],
  fundamentalFactors = [],
  keyDrivers = [],
  oneLineSummary,
  deepAnalysis,
  marketContext,
}: AIReasoningDisplayProps) {
  const [showBullBear, setShowBullBear] = useState(true);
  const [showMarketContext, setShowMarketContext] = useState(true);

  const generateOneLiner = () => {
    if (oneLineSummary) return oneLineSummary;

    const primaryDriver = keyDrivers[0]
      ? formatKeyDriver(keyDrivers[0])
      : technicalFactors[0]
        ? formatTechnicalFactor(technicalFactors[0])
        : "favorable market conditions";
    const confidenceLevel = confidence >= 80 ? "strong" : confidence >= 60 ? "moderate" : "weak";

    return `${action} signal generated with ${confidenceLevel} confidence due to ${primaryDriver.toLowerCase()}.`;
  };

  const actionStyles =
    action === "BUY"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : action === "SELL"
        ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
        : "border-primary/40 bg-primary/10 text-primary";

  const confidenceExpl =
    confidence >= 80
      ? `High confidence — multiple strong signals align with historical patterns; model indicates about ${confidence}% consistency in similar conditions.`
      : confidence >= 60
        ? `Moderate confidence — several supportive indicators, with some mixed signals. Estimated strength around ${confidence}%.`
        : `Lower confidence — mixed or weak signals and unclear conditions. About ${confidence}% — consider waiting for a clearer setup.`;

  const hasMarketContext = marketContext && Object.values(marketContext).some(Boolean);

  return (
    <Card className="border-primary/30 bg-primary/5 overflow-hidden">
      <CardContent className="pt-6 space-y-4">
        {/* Title row — mirrors disclaimer card density */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base tracking-tight text-foreground">AI reasoning</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                How the model explains this outlook — informational only, not advice.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end pl-12 sm:pl-0">
            <Badge variant="outline" className={cn("text-xs font-semibold border", actionStyles)}>
              {action}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs font-medium border-primary/30 bg-background text-foreground"
            >
              {confidence}% confidence
            </Badge>
          </div>
        </div>

        {/* Summary — same Alert pattern as RegulatoryDisclaimer */}
        <Alert className="border-primary/50 bg-background/80">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertDescription>
            <p className="font-semibold text-sm mb-1.5 text-foreground">At a glance</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{generateOneLiner()}</p>
          </AlertDescription>
        </Alert>

        {/* Drivers grid */}
        {(technicalFactors.length > 0 || keyDrivers.length > 0) && (
          <div className="grid md:grid-cols-2 gap-3">
            {technicalFactors.length > 0 && (
              <div className={tileClass}>
                <SectionLabel icon={Activity}>Technical factors</SectionLabel>
                <ul className="space-y-1.5">
                  {technicalFactors.slice(0, 5).map((factor, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground flex gap-2 leading-relaxed">
                      <span className="text-primary font-bold leading-none mt-0.5">·</span>
                      <span>{formatTechnicalFactor(factor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {keyDrivers.length > 0 && (
              <div className={tileClass}>
                <SectionLabel icon={Target}>Key drivers</SectionLabel>
                <ul className="space-y-1.5">
                  {keyDrivers.slice(0, 5).map((driver, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground flex gap-2 leading-relaxed">
                      <span className="text-primary font-bold leading-none mt-0.5">·</span>
                      <span>{formatKeyDriver(driver)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {fundamentalFactors.length > 0 && (
          <div className={tileClass}>
            <SectionLabel icon={TrendingUp}>Fundamental factors</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {fundamentalFactors.map((factor, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-xs border-primary/25 bg-primary/5 text-foreground font-normal"
                >
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Confidence explainer — legal-strip style from disclaimer */}
        <div className="p-4 bg-muted/50 rounded-lg border border-primary/15 text-xs space-y-2">
          <p className="font-semibold text-sm text-foreground">Model confidence</p>
          <p className="text-muted-foreground leading-relaxed">{confidenceExpl}</p>
        </div>

        {deepAnalysis && (
          <div className="space-y-3 pt-1 border-t border-primary/15">
            <div className="flex items-center gap-2 pt-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm text-foreground">Deep analysis</h4>
            </div>

            {(deepAnalysis.bullish_case || deepAnalysis.bearish_case) && (
              <Collapsible open={showBullBear} onOpenChange={setShowBullBear}>
                <CollapsibleTrigger
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary/20 bg-background px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 [&[data-state=open]_svg:last-child]:rotate-180"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    Bull vs bear case
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-200" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {deepAnalysis.bullish_case && (
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                      <p className="font-semibold text-xs text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Bullish case
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{deepAnalysis.bullish_case}</p>
                    </div>
                  )}
                  {deepAnalysis.bearish_case && (
                    <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3">
                      <p className="font-semibold text-xs text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5" />
                        Bearish case
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{deepAnalysis.bearish_case}</p>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {deepAnalysis.contrarian_view && (
              <div className={cn(tileClass, "border-amber-500/25 bg-amber-500/[0.06]")}>
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="font-semibold text-sm text-foreground">Contrarian view</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{deepAnalysis.contrarian_view}</p>
              </div>
            )}

            {deepAnalysis.conviction_rationale && (
              <div className={tileClass}>
                <SectionLabel icon={Target}>Why this outlook?</SectionLabel>
                <p className="text-xs text-muted-foreground leading-relaxed">{deepAnalysis.conviction_rationale}</p>
              </div>
            )}

            {(deepAnalysis.risk_reward_ratio != null || deepAnalysis.success_probability != null) && (
              <div className="grid grid-cols-2 gap-3">
                {deepAnalysis.risk_reward_ratio != null && (
                  <div className={cn(tileClass, "text-center py-4")}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      Risk / reward
                    </p>
                    <p className="text-2xl font-bold text-primary tabular-nums">
                      {deepAnalysis.risk_reward_ratio.toFixed(1)}:1
                    </p>
                  </div>
                )}
                {deepAnalysis.success_probability != null && (
                  <div className={cn(tileClass, "text-center py-4")}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      Success probability
                    </p>
                    <p className="text-2xl font-bold text-primary tabular-nums">
                      {deepAnalysis.success_probability}%
                    </p>
                  </div>
                )}
              </div>
            )}

            {deepAnalysis.invalidation_triggers && deepAnalysis.invalidation_triggers.length > 0 && (
              <Alert className="border-destructive/40 bg-destructive/5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertDescription>
                  <p className="font-semibold text-sm text-foreground mb-2">Invalidation triggers</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Reassess the thesis if any of the following occur.
                  </p>
                  <ul className="space-y-1.5">
                    {deepAnalysis.invalidation_triggers.map((trigger, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex gap-2 leading-relaxed">
                        <span className="text-destructive font-bold leading-none mt-0.5">·</span>
                        <span>{trigger}</span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {hasMarketContext && marketContext && (
          <div className="space-y-3 pt-1 border-t border-primary/15">
            <div className="flex items-center gap-2 pt-2">
              <Shield className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm text-foreground">Market context</h4>
            </div>

            <Collapsible open={showMarketContext} onOpenChange={setShowMarketContext}>
              <CollapsibleTrigger
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary/20 bg-background px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 [&[data-state=open]_svg]:rotate-180"
              >
                <span>Correlation, sector &amp; macro</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                {marketContext.correlation_insight && (
                  <div className={tileClass}>
                    <p className="font-semibold text-xs text-foreground mb-1">Correlation</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{marketContext.correlation_insight}</p>
                  </div>
                )}
                {marketContext.sector_strength && (
                  <div className={tileClass}>
                    <p className="font-semibold text-xs text-foreground mb-1">Sector strength</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{marketContext.sector_strength}</p>
                  </div>
                )}
                {marketContext.macro_factors && (
                  <div className={tileClass}>
                    <p className="font-semibold text-xs text-foreground mb-1">Macro environment</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{marketContext.macro_factors}</p>
                  </div>
                )}
                {marketContext.institutional_activity && (
                  <div className={tileClass}>
                    <p className="font-semibold text-xs text-foreground mb-1">Institutional activity</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {marketContext.institutional_activity}
                    </p>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-2 border-t border-primary/15">
          AI-generated analysis for research — verify with your own judgment and risk tolerance
        </p>
      </CardContent>
    </Card>
  );
}
