import { useEffect, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, AlertTriangle, CheckCircle2, Lightbulb, Loader2, Zap,
  ChevronDown, ChevronUp, BarChart3, Globe, Newspaper,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ── All OpenAlgo-compatible strategies ────────────────────────────────────────
export const STRATEGIES: { value: string; label: string; description: string; product: string }[] = [
  { value: "trend_following",    label: "Trend Following",      description: "Ride the direction of the prevailing trend. Best for bull/bear markets.",          product: "CNC"  },
  { value: "breakout_breakdown", label: "Breakout & Breakdown",  description: "Enter on breakout above resistance or breakdown below support.",                   product: "CNC"  },
  { value: "mean_reversion",     label: "Mean Reversion",        description: "Bet on price returning to average after an extreme move.",                        product: "CNC"  },
  { value: "momentum",           label: "Momentum",              description: "Buy high and sell higher — follow short-term momentum bursts.",                    product: "MIS"  },
  { value: "scalping",           label: "Scalping",              description: "Very short-term intraday trades for small quick gains.",                           product: "MIS"  },
  { value: "swing_trading",      label: "Swing Trading",         description: "Hold 2–10 days to capture a price swing between support and resistance.",          product: "CNC"  },
  { value: "range_trading",      label: "Range Trading",         description: "Buy at support, sell at resistance in a sideways/ranging market.",                 product: "CNC"  },
  { value: "news_based",         label: "News / Event Based",    description: "Trade on earnings, results, government policy, or macro events.",                  product: "MIS"  },
  { value: "options_buying",     label: "Options Buying",        description: "Buy calls/puts for leveraged directional bets with limited risk.",                 product: "NRML" },
  { value: "options_selling",    label: "Options Selling",       description: "Sell options premium — collect theta. High probability, needs margin.",            product: "NRML" },
  { value: "pairs_trading",      label: "Pairs Trading",         description: "Go long one stock, short a correlated one. Market-neutral strategy.",             product: "CNC"  },
];

// Static fallback details per strategy
export const STRATEGY_DETAILS: Record<string, { whenToUse: string; pros: string[]; cons: string[]; inTrendWhen: string }> = {
  trend_following:    { whenToUse: "Strong directional moves; clear higher highs/higher lows.", pros: ["Works in strong trends", "Clear rules", "Cuts losers early"], cons: ["Whipsaws in sideways markets", "Lags at reversals"], inTrendWhen: "Markets are making new highs or new lows with momentum." },
  breakout_breakdown: { whenToUse: "Price at key support/resistance; volume confirmation.", pros: ["Captures big moves", "Defined risk at level"], cons: ["False breakouts common", "Needs volume filter"], inTrendWhen: "Volatility is rising and price is testing key levels." },
  mean_reversion:     { whenToUse: "Oversold/overbought extremes; price far from moving average.", pros: ["Good risk/reward at extremes", "Works in chop"], cons: ["Dangerous in strong trends", "Requires timing"], inTrendWhen: "Market is range-bound or after a sharp overextended move." },
  momentum:           { whenToUse: "Short-term strength; strong relative performance; intraday momentum.", pros: ["Quick gains", "Clear momentum signals"], cons: ["Reversals can be sharp", "Needs strict exit"], inTrendWhen: "Intraday momentum and volume are aligned." },
  scalping:           { whenToUse: "Liquid markets; tight spreads; very short timeframes (minutes).", pros: ["Many small wins", "Defined risk per trade"], cons: ["High stress", "Costs matter a lot"], inTrendWhen: "High liquidity and low spread; volatile intraday." },
  swing_trading:      { whenToUse: "2–10 day holds; pullbacks in uptrends or rallies in downtrends.", pros: ["Balances frequency and size", "Less screen time"], cons: ["Overnight risk", "Needs trend filter"], inTrendWhen: "Clear multi-day swings between support and resistance." },
  range_trading:      { whenToUse: "Sideways markets; defined support and resistance; no strong trend.", pros: ["Predictable levels", "Repeatable setup"], cons: ["Fails when trend starts", "Needs range confirmation"], inTrendWhen: "Price is bouncing between clear levels without breakout." },
  news_based:         { whenToUse: "Around earnings, policy events, or macro data; high-impact news.", pros: ["Catalyst-driven", "Big moves possible"], cons: ["Gap risk", "Hard to size"], inTrendWhen: "Scheduled events or breaking news that move the asset." },
  options_buying:     { whenToUse: "Strong view on direction or volatility; limited capital for leverage.", pros: ["Defined risk", "Leverage"], cons: ["Theta decay", "Need right strike/expiry"], inTrendWhen: "Expecting a clear move; volatility not too expensive." },
  options_selling:    { whenToUse: "High implied volatility; range-bound or slow grind; income focus.", pros: ["Theta in your favour", "High win rate"], cons: ["Unlimited risk if wrong", "Margin needed"], inTrendWhen: "IV is elevated and you expect range or mean reversion." },
  pairs_trading:      { whenToUse: "Correlated instruments; spread at extreme; market-neutral intent.", pros: ["Hedges market direction", "Statistical edge"], cons: ["Correlation can break", "More complex"], inTrendWhen: "A pair's spread has deviated from its mean." },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface StrategyStats {
  strategy:   string;
  total:      number;
  wins:       number;
  losses:     number;
  winRate:    number;
  avgPnlPct:  number;
  totalPnl:   number;
}

interface AiRankedStrategy {
  strategy:         string;
  label:            string;
  probabilityScore: number;
  verdict:          "great" | "good" | "neutral" | "poor" | "avoid";
  whyNow:           string;
  riskWarning:      string;
}

interface MarketContext {
  regime:          string;
  summary:         string;
  globalMacro:     string;
  newsSentiment:   "bullish" | "bearish" | "neutral";
  riskWarnings:    string[];
}

interface AiResult {
  marketContext: MarketContext;
  topPick:       { strategy: string; reason: string };
  ranked:        AiRankedStrategy[];
}

interface Props {
  open:            boolean;
  onOpenChange:    (v: boolean) => void;
  currentStrategy: string;
  symbol:          string;
  action:          "BUY" | "SELL";
  investment?:     number;
  timeframe?:      string;
  onConfirm:       (strategy: string, product: string) => void;
}

// ── Verdict helpers ────────────────────────────────────────────────────────────

function verdictBorderClass(v?: string) {
  if (v === "great")  return "border-green-500  bg-green-500/10  text-green-700";
  if (v === "good")   return "border-blue-500   bg-blue-500/10   text-blue-700";
  if (v === "poor" || v === "avoid") return "border-red-500 bg-red-500/10 text-red-700";
  if (v === "neutral") return "border-yellow-500 bg-yellow-500/10 text-yellow-700";
  return "border-muted bg-muted/30 text-muted-foreground";
}

function verdictLabel(v?: string) {
  if (v === "great")  return <Badge className="bg-green-600 text-white text-xs">AI: Great</Badge>;
  if (v === "good")   return <Badge className="bg-blue-600 text-white text-xs">AI: Good</Badge>;
  if (v === "poor")   return <Badge variant="destructive" className="text-xs">AI: Poor</Badge>;
  if (v === "avoid")  return <Badge variant="destructive" className="text-xs">AI: Avoid</Badge>;
  if (v === "neutral") return <Badge variant="outline" className="text-xs">AI: Neutral</Badge>;
  return null;
}

function regimeBadge(regime?: string) {
  const r = (regime || "").replace(/_/g, " ");
  if (regime?.includes("bullish"))  return <Badge className="bg-green-600 text-white capitalize">{r}</Badge>;
  if (regime?.includes("bearish"))  return <Badge className="bg-red-600 text-white capitalize">{r}</Badge>;
  if (regime?.includes("volatile")) return <Badge className="bg-orange-500 text-white capitalize">{r}</Badge>;
  return <Badge variant="outline" className="capitalize">{r || "Analysing…"}</Badge>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StrategySelectionDialog({
  open, onOpenChange, currentStrategy, symbol, action, investment = 10000, timeframe = "1d", onConfirm,
}: Props) {

  const [userStats,        setUserStats]        = useState<Record<string, StrategyStats>>({});
  const [bestHistory,      setBestHistory]       = useState<string | null>(null);
  const [aiResult,         setAiResult]          = useState<AiResult | null>(null);
  const [aiLoading,        setAiLoading]         = useState(false);
  const [aiError,          setAiError]           = useState<string | null>(null);
  const [histLoading,      setHistLoading]       = useState(true);
  const [selected,         setSelected]          = useState(currentStrategy || "trend_following");
  const [expandedDetails,  setExpandedDetails]   = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(currentStrategy || "trend_following");
    setAiResult(null);
    setAiError(null);
    loadHistory();
    loadAiAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Load user's personal trade history ───────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const { data } = await supabase
        .from("active_trades")
        .select("strategy_type, actual_pnl, actual_pnl_percentage, status")
        .in("status", ["completed", "stopped_out", "target_hit", "cancelled"]);

      const map: Record<string, { pnls: number[]; pnlPcts: number[] }> = {};
      (data || []).forEach((t: any) => {
        const s = t.strategy_type || "trend_following";
        if (!map[s]) map[s] = { pnls: [], pnlPcts: [] };
        if (t.actual_pnl != null) map[s].pnls.push(parseFloat(t.actual_pnl));
        if (t.actual_pnl_percentage != null) map[s].pnlPcts.push(parseFloat(t.actual_pnl_percentage));
      });

      const computed: Record<string, StrategyStats> = {};
      let bestWinRate = -1, bestKey: string | null = null;

      STRATEGIES.forEach(({ value }) => {
        const d = map[value];
        if (!d || d.pnls.length === 0) {
          computed[value] = { strategy: value, total: 0, wins: 0, losses: 0, winRate: 0, avgPnlPct: 0, totalPnl: 0 };
          return;
        }
        const wins     = d.pnls.filter(p => p > 0).length;
        const losses   = d.pnls.filter(p => p <= 0).length;
        const total    = d.pnls.length;
        const winRate  = (wins / total) * 100;
        const avgPnlPct = d.pnlPcts.reduce((a, b) => a + b, 0) / d.pnlPcts.length;
        const totalPnl  = d.pnls.reduce((a, b) => a + b, 0);
        computed[value] = { strategy: value, total, wins, losses, winRate, avgPnlPct, totalPnl };
        if (winRate > bestWinRate && total >= 2) { bestWinRate = winRate; bestKey = value; }
      });

      setUserStats(computed);
      setBestHistory(bestKey);
    } catch (e) {
      console.error("history stats error", e);
    } finally {
      setHistLoading(false);
    }
  }, []);

  // ── Call Gemini via the edge function ────────────────────────────────────────
  const loadAiAnalysis = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-strategy", {
        body: { symbol, action, investment, timeframe },
      });
      if (error) {
        console.error("suggest-strategy edge error", error);
        setAiError(error.message);
        return;
      }
      if (!data) {
        setAiError("No AI data returned");
        return;
      }

      if ((data as any).aiError) {
        setAiError((data as any).aiError as string);
      }

      if (data.ranked && data.ranked.length > 0) {
        setAiResult(data as AiResult);
        // Auto-select AI's top pick
        if (data.topPick?.strategy) setSelected(data.topPick.strategy);
      } else {
        // No ranked list, but we still keep page working with history-only mode
        setAiResult(null);
      }
    } catch (e: any) {
      console.error("AI analysis error", e);
      setAiError(e?.message ?? "AI analysis failed. Using historical data only.");
    } finally {
      setAiLoading(false);
    }
  }, [symbol, action, investment, timeframe]);

  // Merge AI ranks into a lookup
  const aiByStrategy = Object.fromEntries(
    (aiResult?.ranked ?? []).map(r => [r.strategy, r])
  );

  // Sort strategies: AI ranked first (best score first), then rest
  const sortedStrategies = aiResult?.ranked?.length
    ? aiResult.ranked
        .map(r => STRATEGIES.find(s => s.value === r.strategy))
        .filter(Boolean) as typeof STRATEGIES
    : STRATEGIES;

  const mc = aiResult?.marketContext;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Choose Strategy — {action} {symbol}
          </DialogTitle>
          <DialogDescription>
            AI analyses live price, RSI, MACD, news sentiment &amp; global macro right now to rank strategies for this exact trade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* ── Live AI Market Context ── */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <h4 className="font-semibold flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4" />
              Live Market Analysis (AI)
              {aiLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
            </h4>

            {aiLoading && (
              <p className="text-xs text-muted-foreground animate-pulse">
                AI is fetching live price, RSI, MACD, news &amp; global macro for <strong>{symbol}</strong>…
              </p>
            )}

            {aiError && (
              <p className="text-xs text-destructive">{aiError}</p>
            )}

            {mc && !aiLoading && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground">Regime:</span>
                  {regimeBadge(mc.regime)}
                  <span className="text-xs font-medium text-muted-foreground ml-2">News:</span>
                  <Badge
                    variant="outline"
                    className={cn("text-xs capitalize",
                      mc.newsSentiment === "bullish" ? "border-green-500 text-green-700" :
                      mc.newsSentiment === "bearish" ? "border-red-500 text-red-700" : ""
                    )}
                  >
                    {mc.newsSentiment}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{mc.summary}</p>
                {mc.globalMacro && (
                  <p className="text-xs text-muted-foreground italic">
                    <strong>Macro:</strong> {mc.globalMacro}
                  </p>
                )}
                {mc.riskWarnings?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {mc.riskWarnings.map((w, i) => (
                      <Badge key={i} variant="outline" className="text-xs border-orange-400 text-orange-700">
                        ⚠ {w}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fallback: user history best */}
            {!mc && !aiLoading && (
              <p className="text-xs text-muted-foreground">
                {bestHistory
                  ? <>Best strategy from your history: <button className="underline text-primary font-medium" onClick={() => setSelected(bestHistory)}>{STRATEGIES.find(s => s.value === bestHistory)?.label}</button> ({userStats[bestHistory]?.winRate.toFixed(0)}% win rate).</>
                  : "No trade history yet. Choose based on market conditions."}
              </p>
            )}
          </div>

          {/* ── AI Top Pick Banner ── */}
          {aiResult?.topPick && !aiLoading && (
            <Alert className="border-green-500 bg-green-500/10">
              <Lightbulb className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 text-sm">
                <strong>AI Top Pick:</strong>{" "}
                <button className="underline font-semibold" onClick={() => setSelected(aiResult.topPick.strategy)}>
                  {STRATEGIES.find(s => s.value === aiResult.topPick.strategy)?.label}
                </button>
                {" — "}{aiResult.topPick.reason}
              </AlertDescription>
            </Alert>
          )}

          {/* ── Strategy grid ── */}
          <div className="grid sm:grid-cols-2 gap-2 max-h-[48vh] overflow-y-auto pr-1">
            {(histLoading
              ? STRATEGIES   // show all while loading
              : sortedStrategies
            ).map(s => {
              const st  = userStats[s.value];
              const ai  = aiByStrategy[s.value];
              const isTopPick = aiResult?.topPick?.strategy === s.value;

              return (
                <button
                  key={s.value}
                  onClick={() => setSelected(s.value)}
                  className={cn(
                    "text-left p-3 rounded-lg border-2 transition-all",
                    selected === s.value
                      ? "border-primary bg-primary/10"
                      : isTopPick
                        ? "border-green-500 bg-green-500/5 hover:bg-green-500/10"
                        : "border-muted hover:border-primary/50 bg-background",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {isTopPick && "⭐ "}
                        {s.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{s.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs">{s.product}</Badge>
                      {ai && verdictLabel(ai.verdict)}
                    </div>
                  </div>

                  {/* AI probability score */}
                  {ai && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">AI Probability</span>
                        <span className={cn("font-semibold",
                          ai.probabilityScore >= 65 ? "text-green-600" :
                          ai.probabilityScore >= 45 ? "text-yellow-600" : "text-red-600"
                        )}>
                          {ai.probabilityScore}%
                        </span>
                      </div>
                      <Progress
                        value={ai.probabilityScore}
                        className={cn("h-1.5",
                          ai.probabilityScore >= 65 ? "[&>div]:bg-green-500" :
                          ai.probabilityScore >= 45 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"
                        )}
                      />
                      {ai.whyNow && (
                        <p className="text-xs text-muted-foreground leading-snug mt-0.5">{ai.whyNow}</p>
                      )}
                      {ai.riskWarning && (
                        <p className="text-xs text-orange-600 font-medium mt-0.5">⚠ {ai.riskWarning}</p>
                      )}
                    </div>
                  )}

                  {/* User historical stats */}
                  {st && st.total > 0 && (
                    <div className="mt-2 space-y-0.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Your history: {st.wins}W / {st.losses}L</span>
                        <span className={st.avgPnlPct >= 0 ? "text-green-600" : "text-red-600"}>
                          avg {st.avgPnlPct >= 0 ? "+" : ""}{st.avgPnlPct.toFixed(1)}%
                        </span>
                      </div>
                      <Progress
                        value={st.winRate}
                        className={cn("h-1",
                          st.winRate >= 50 ? "[&>div]:bg-green-400" : "[&>div]:bg-red-400"
                        )}
                      />
                    </div>
                  )}
                  {st && st.total === 0 && !ai && (
                    <p className="text-xs text-muted-foreground mt-1">No personal history yet</p>
                  )}

                  {/* Expandable static details */}
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      onClick={(e) => { e.stopPropagation(); setExpandedDetails(expandedDetails === s.value ? null : s.value); }}
                    >
                      {expandedDetails === s.value ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {expandedDetails === s.value ? "Hide" : "Show"} details
                    </button>
                    {expandedDetails === s.value && STRATEGY_DETAILS[s.value] && (
                      <div
                        className="mt-2 p-2 rounded bg-muted/50 text-xs space-y-1 text-left"
                        onClick={e => e.stopPropagation()}
                      >
                        <p><strong>When to use:</strong> {STRATEGY_DETAILS[s.value].whenToUse}</p>
                        <p><strong>In trend when:</strong> {STRATEGY_DETAILS[s.value].inTrendWhen}</p>
                        <p><strong>Pros:</strong> {STRATEGY_DETAILS[s.value].pros.join("; ")}</p>
                        <p><strong>Cons:</strong> {STRATEGY_DETAILS[s.value].cons.join("; ")}</p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Confirm ── */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                const product = STRATEGIES.find(s => s.value === selected)?.product ?? "CNC";
                onConfirm(selected, product);
                onOpenChange(false);
              }}
            >
              {aiByStrategy[selected]?.verdict === "poor" || aiByStrategy[selected]?.verdict === "avoid" ? (
                <><AlertTriangle className="h-4 w-4 mr-2" />Place Order Anyway</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Place Order</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
