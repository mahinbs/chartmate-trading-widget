import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Clock,
  ChevronDown,
  Plus,
  History,
  Maximize2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PredictionTimeline } from "@/components/PredictionTimeline";
import { SummaryHeader } from "@/components/prediction/SummaryHeader";
import { ForecastTable } from "@/components/prediction/ForecastTable";
import { OutcomeBadge } from "@/components/prediction/OutcomeBadge";
import { ActionBar } from "@/components/prediction/ActionBar";
import { KeyLevels } from "@/components/prediction/KeyLevels";
import { Insights } from "@/components/prediction/Insights";
import { PostPredictionReport } from "@/components/prediction/PostPredictionReport";
import { formatCurrency, formatPercentage } from "@/lib/display-utils";
import { Container } from "@/components/layout/Container";
import { getEffectiveStart, getEffectiveTarget } from "@/lib/market-hours";
import {
  readPredictionAnalysisCache,
  writePredictionAnalysisCache,
  removePredictionAnalysisFromCache,
  type CachedAnalysisData,
} from "@/lib/prediction-analysis-cache";
import {
  invokeAnalyzePostPrediction,
  type PredictionRow,
} from "@/lib/invoke-analyze-post-prediction";
import { persistPostOutcomeAnalysis } from "@/lib/prediction-persistence";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { cn } from "@/lib/utils";

interface Prediction {
  id: string;
  symbol: string;
  timeframe: string;
  investment: number | null;
  current_price: number | null;
  recommendation: string | null;
  confidence: number | null;
  expected_move_direction: string | null;
  expected_move_percent: number | null;
  price_target_min: number | null;
  price_target_max: number | null;
  created_at: string;
  raw_response: any;
}

type AnalysisData = CachedAnalysisData;

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisStates, setAnalysisStates] = useState<
    Record<
      string,
      {
        loading: boolean;
        data: AnalysisData | null;
        error: string | null;
      }
    >
  >({});
  const [marketStatuses, setMarketStatuses] = useState<Record<string, any>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch market status for a symbol
  const fetchMarketStatus = async (symbol: string) => {
    if (marketStatuses[symbol]) return marketStatuses[symbol];

    try {
      const { data, error } = await supabase.functions.invoke(
        "get-market-status",
        {
          body: { symbol },
        },
      );
      if (!error && data) {
        setMarketStatuses((prev) => ({ ...prev, [symbol]: data }));
        return data;
      }
    } catch (error) {
      console.error("Failed to fetch market status for", symbol, error);
    }
    return null;
  };

  // Calculate expected completion time for prediction windows using market hours
  const calculateExpectedTime = (
    createdAt: string,
    timeframe: string,
    marketStatus?: any,
  ): Date => {
    const baseTime = new Date(createdAt);
    const timeframeMinutes = {
      "15m": 15,
      "30m": 30,
      "1h": 60,
      "4h": 240,
      "1d": 1440,
      "1w": 10080,
    };
    const minutes =
      timeframeMinutes[timeframe as keyof typeof timeframeMinutes] || 60;

    if (marketStatus) {
      const effectiveStart = getEffectiveStart(baseTime, marketStatus);
      return getEffectiveTarget(minutes, effectiveStart);
    }

    return new Date(baseTime.getTime() + minutes * 60 * 1000);
  };

  // React to predictions list changing: fetch market statuses + schedule auto-analysis
  useEffect(() => {
    if (predictions.length === 0) return;

    // Fetch market statuses for unique symbols
    const fetchMarketStatuses = async () => {
      const uniqueSymbols = [...new Set(predictions.map((p) => p.symbol))];
      await Promise.all(
        uniqueSymbols.map((symbol) => fetchMarketStatus(symbol)),
      );
    };
    fetchMarketStatuses();

    // Auto-analyze predictions that have expired
    const interval = setInterval(() => {
      predictions.forEach(async (prediction) => {
        const st = analysisStates[prediction.id];
        if (!st?.data && !st?.loading && !st?.error) {
          const marketStatus = marketStatuses[prediction.symbol];
          const expectedTime = calculateExpectedTime(
            prediction.created_at,
            prediction.timeframe,
            marketStatus,
          );
          const now = new Date();
          if (now >= expectedTime) {
            await analyzePostPrediction(
              prediction as PredictionRow,
              expectedTime,
            );
          }
        }
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [predictions, analysisStates, marketStatuses]);

  const loadCachedAnalysis = () => {
    const parsed = readPredictionAnalysisCache();
    if (Object.keys(parsed).length) setAnalysisStates(parsed);
  };

  const saveCachedAnalysis = (
    states: Record<
      string,
      { loading: boolean; data: AnalysisData | null; error: string | null }
    >,
  ) => {
    writePredictionAnalysisCache(states);
  };

  const removeCachedAnalysis = (predictionId: string) => {
    removePredictionAnalysisFromCache(predictionId);
  };

  useEffect(() => {
    loadCachedAnalysis();
    fetchPredictions();
  }, []);

  const fetchPredictions = async () => {
    try {
      const { data, error } = await supabase
        .from("predictions" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPredictions((data as any) || []);
    } catch (error) {
      console.error("Error fetching predictions:", error);
      toast({
        title: "Error",
        description: "Failed to load analyses",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deletePrediction = async (id: string) => {
    try {
      const { error } = await supabase
        .from("predictions" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;

      setPredictions(predictions.filter((p) => p.id !== id));
      removeCachedAnalysis(id);

      setAnalysisStates((prev) => {
        const newStates = { ...prev };
        delete newStates[id];
        return newStates;
      });

      toast({
        title: "Success",
        description: "Analysis deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting prediction:", error);
      toast({
        title: "Error",
        description: "Failed to delete analysis",
        variant: "destructive",
      });
    }
  };

  // Date/Time helper functions
  const formatDateTime = (date: Date | string | null | undefined) => {
    if (!date) return "Invalid Date";

    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
      return "Invalid Date";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(dateObj);
  };

  // Countdown helper functions
  const formatDuration = (milliseconds: number) => {
    const totalSeconds = Math.floor(Math.abs(milliseconds) / 1000);
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getElapsedPercent = (
    startTime: Date,
    endTime: Date,
    currentTime: Date,
  ) => {
    const totalDuration = endTime.getTime() - startTime.getTime();
    const elapsed = currentTime.getTime() - startTime.getTime();
    return Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
  };

  const analyzePostPrediction = async (
    prediction: PredictionRow,
    toOverride?: Date,
  ) => {
    const predictionId = prediction.id;

    if (analysisStates[predictionId]?.data) {
      return;
    }

    setAnalysisStates((prev) => ({
      ...prev,
      [predictionId]: { loading: true, data: null, error: null },
    }));

    try {
      const marketStatus = marketStatuses[prediction.symbol];
      const adapted: AnalysisData = await invokeAnalyzePostPrediction(
        prediction,
        marketStatus,
        toOverride,
      );

      setAnalysisStates((prev) => {
        const newStates = {
          ...prev,
          [predictionId]: { loading: false, data: adapted, error: null },
        };
        saveCachedAnalysis(newStates);
        void persistPostOutcomeAnalysis(predictionId, adapted);
        return newStates;
      });
    } catch (error: unknown) {
      let errorMessage = "Analysis failed";
      if (error instanceof Error) errorMessage = error.message;
      else if (typeof error === "string") errorMessage = error;

      setAnalysisStates((prev) => {
        const newStates = {
          ...prev,
          [predictionId]: { loading: false, data: null, error: errorMessage },
        };
        saveCachedAnalysis(newStates);
        return newStates;
      });

      if (
        !errorMessage.includes("No market data") &&
        !errorMessage.includes("no_data")
      ) {
        toast({
          title: "Analysis failed",
          description:
            errorMessage +
            " Tap “Analyze outcome” to retry, or open full analysis from the card.",
          variant: "destructive",
        });
      }
    }
  };

  const getOutcome = (
    prediction: Prediction,
    isExpired: boolean,
    isAnalyzing: boolean,
  ):
    | "accurate"
    | "partial"
    | "failed"
    | "inconclusive"
    | "completed"
    | "in_progress"
    | "analyzing" => {
    const evaluation = analysisStates[prediction.id]?.data?.evaluation;
    if (evaluation) return evaluation.result;
    if (!isExpired) return "in_progress";
    if (isAnalyzing) return "analyzing";
    return "completed";
  };

  if (loading) {
    return (
      <DashboardShellLayout>
        <div className="min-h-screen bg-background">
          <Container className="p-6">
            <div className="text-center text-muted-foreground">
              Loading analyses...
            </div>
          </Container>
        </div>
      </DashboardShellLayout>
    );
  }

  return (
    <DashboardShellLayout>
      <div className="min-h-screen bg-background text-foreground">
        {/* Header */}
        <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl z-50">
          <Container className="py-3 sm:py-4">
            <div className="flex items-center justify-end mb-3">
              <Button
                size="sm"
                onClick={() => navigate("/predict")}
                className="shadow-[0_0_20px_rgba(20,184,166,0.2)]"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New Analysis
              </Button>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gradient flex items-center gap-2">
                <History className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                My Analyses
              </h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                Track your AI-powered probability-based analyses and their
                outcomes
              </p>
            </div>
          </Container>
        </div>
        {/* Main Content */}
        <Container className="py-4 sm:py-8">
          {predictions.length === 0 ? (
            <Card
              className={cn(
                "glass-card-premium max-w-md mx-auto text-center border-primary/25",
                "shadow-[0_12px_48px_-12px_rgba(20,184,166,0.18)]",
              )}
            >
              <div
                className="pointer-events-none absolute top-0 inset-x-0 z-[1] h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-90"
                aria-hidden
              />
              <CardContent className="relative z-0 p-8 sm:p-10">
                <div className="space-y-5">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 to-primary/5 shadow-[0_0_24px_-4px_rgba(20,184,166,0.35)]">
                    <Plus className="h-8 w-8 text-primary" strokeWidth={2.25} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight text-foreground">
                      No analyses yet
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      Run your first AI probability analysis to see it listed
                      here with outcomes and timelines.
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate("/predict")}
                    className="w-full glow-primary border border-primary/30 bg-primary hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New analysis
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {predictions.map((prediction) => {
                const startTime = new Date(prediction.created_at);
                const marketStatus = marketStatuses[prediction.symbol];
                const expectedTime = calculateExpectedTime(
                  prediction.created_at,
                  prediction.timeframe,
                  marketStatus,
                );
                const timeRemaining = expectedTime.getTime() - Date.now();
                const elapsedPercent = getElapsedPercent(
                  startTime,
                  expectedTime,
                  new Date(),
                );
                const isExpired = timeRemaining < 0;
                const isAnalyzing = analysisStates[prediction.id]?.loading;
                const outcome = getOutcome(prediction, isExpired, isAnalyzing);
                return (
                  <Card
                    key={prediction.id}
                    className="glass-panel overflow-hidden flex flex-col transition-colors hover:border-white/15 cursor-pointer"
                    onClick={() => navigate(`/predict?saved=${prediction.id}`)}
                  >
                    {/* Header with Summary */}
                    <CardHeader className="space-y-0 pb-3 px-3 sm:px-6 pt-4 sm:pt-5">
                      <div
                        className={cn(
                          "rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-background/30 to-transparent",
                          "p-3 sm:p-4",
                        )}
                      >
                        <div
                          className={cn(
                            "grid gap-3 sm:gap-4",
                            "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto]",
                            "items-start sm:items-center",
                          )}
                        >
                          <SummaryHeader
                            variant="flat"
                            symbol={prediction.symbol}
                            currentPrice={prediction.current_price || 0}
                            change={0}
                            changePercent={
                              prediction.expected_move_percent || 0
                            }
                            recommendation={
                              prediction.recommendation || undefined
                            }
                            confidence={prediction.confidence ?? undefined}
                          />
                          <div
                            className={cn(
                              "flex flex-wrap items-center gap-2",
                              "w-full sm:w-auto sm:shrink-0 sm:flex-nowrap sm:justify-end",
                            )}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <OutcomeBadge outcome={outcome} />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="glass-button-premium border-primary/25 text-xs gap-1 shrink-0 text-foreground hover:text-foreground"
                              onClick={() =>
                                navigate(`/predict?saved=${prediction.id}`)
                              }
                            >
                              <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                              <span className="hidden sm:inline">
                                See full analysis
                              </span>
                              <span className="sm:hidden">Full</span>
                            </Button>
                            <ActionBar
                              onDelete={() => deletePrediction(prediction.id)}
                              onAnalyze={() =>
                                analyzePostPrediction(
                                  prediction as PredictionRow,
                                )
                              }
                              isAnalyzing={isAnalyzing}
                              showAnalyze={
                                isExpired &&
                                !analysisStates[prediction.id]?.data?.evaluation
                              }
                            />
                          </div>
                        </div>
                      </div>

                      {/* Time Progress */}
                      <div className="mt-3 sm:mt-4 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-muted-foreground text-xs sm:text-sm">
                              {isExpired
                                ? "Completed"
                                : `${formatDuration(timeRemaining)} remaining`}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground pl-5 sm:pl-0">
                            {formatDateTime(prediction.created_at)}
                          </span>
                        </div>
                        <Progress
                          value={isExpired ? 100 : elapsedPercent}
                          className="h-1.5"
                        />
                      </div>
                    </CardHeader>

                    <CardContent
                      className="relative z-0 space-y-4 px-3 sm:px-6 pb-6 pt-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Investment Details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background/40 to-transparent p-3 sm:p-4 shadow-inner shadow-black/20">
                        <div>
                          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Investment
                          </p>
                          <p className="font-semibold text-foreground text-sm sm:text-base tabular-nums">
                            {prediction.investment
                              ? formatCurrency(prediction.investment, 0)
                              : "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Timeframe
                          </p>
                          <p className="font-semibold text-foreground text-sm sm:text-base">
                            {prediction.timeframe}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Expected Move
                          </p>
                          <p
                            className={`font-semibold text-sm sm:text-base ${
                              prediction.expected_move_direction === "up"
                                ? "text-green-400"
                                : prediction.expected_move_direction === "down"
                                  ? "text-red-400"
                                  : "text-yellow-400"
                            }`}
                          >
                            {prediction.expected_move_percent
                              ? formatPercentage(
                                  prediction.expected_move_percent,
                                  1,
                                  false,
                                )
                              : "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Price Target
                          </p>
                          <p className="font-semibold text-foreground text-xs sm:text-sm break-words">
                            {prediction.price_target_min &&
                            prediction.price_target_max
                              ? `${formatCurrency(prediction.price_target_min, 2)} – ${formatCurrency(prediction.price_target_max, 2)}`
                              : "N/A"}
                          </p>
                        </div>
                      </div>

                      {/* Multi-Horizon Forecasts */}
                      {prediction.raw_response?.geminiForecast?.forecasts && (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="w-full justify-between rounded-xl border border-transparent px-3 py-2.5 h-auto text-left hover:border-primary/20 hover:bg-primary/5"
                            >
                              <h3 className="text-sm font-semibold text-foreground">
                                Multi-Horizon Forecasts
                              </h3>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3">
                            <ForecastTable
                              forecasts={
                                prediction.raw_response.geminiForecast.forecasts
                              }
                              predictedAt={new Date(prediction.created_at)}
                              marketStatus={marketStatus}
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Key Levels */}
                      {prediction.raw_response?.geminiForecast
                        ?.support_resistance && (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="w-full justify-between rounded-xl border border-transparent px-3 py-2.5 h-auto text-left hover:border-primary/20 hover:bg-primary/5"
                            >
                              <h3 className="text-sm font-semibold text-foreground">
                                Key Price Levels
                              </h3>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3">
                            <KeyLevels
                              supportLevels={
                                prediction.raw_response.geminiForecast
                                  .support_resistance.supports
                              }
                              resistanceLevels={
                                prediction.raw_response.geminiForecast
                                  .support_resistance.resistances
                              }
                              currentPrice={prediction.current_price || 0}
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* AI Insights */}
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            className="w-full justify-between rounded-xl border border-transparent px-3 py-2.5 h-auto text-left hover:border-primary/20 hover:bg-primary/5"
                          >
                            <h3 className="text-sm font-semibold text-foreground">
                              AI Insights & Analysis
                            </h3>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3">
                          <Insights
                            keyDrivers={
                              prediction.raw_response?.geminiForecast
                                ?.forecasts?.[0]?.key_drivers
                            }
                            riskFlags={
                              prediction.raw_response?.geminiForecast
                                ?.forecasts?.[0]?.risk_flags
                            }
                            opportunities={
                              prediction.raw_response?.opportunities
                            }
                            rationale={prediction.raw_response?.rationale}
                            patterns={prediction.raw_response?.patterns}
                          />
                        </CollapsibleContent>
                      </Collapsible>

                      {/* AI-Powered Analysis Results */}
                      {analysisStates[prediction.id]?.data && (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="w-full justify-between rounded-xl border border-transparent px-3 py-2.5 h-auto text-left hover:border-primary/20 hover:bg-primary/5"
                            >
                              <h3 className="text-sm font-semibold text-foreground">
                                Probability Outcome
                              </h3>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3 space-y-4">
                            <PostPredictionReport
                              symbol={prediction.symbol}
                              timeframe={prediction.timeframe}
                              evaluation={
                                analysisStates[prediction.id]?.data?.evaluation
                              }
                              marketData={
                                analysisStates[prediction.id]?.data?.marketData
                              }
                              ai={analysisStates[prediction.id]?.data?.ai}
                              dataSource={
                                analysisStates[prediction.id]?.data?.dataSource
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Strategy entry scan & full AI dashboard: open{" "}
                              <button
                                type="button"
                                className="text-primary underline underline-offset-2 hover:text-primary/90"
                                onClick={() =>
                                  navigate(`/predict?saved=${prediction.id}`)
                                }
                              >
                                See full analysis
                              </button>
                            </p>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Pipeline Timeline */}
                      {prediction.raw_response?.meta?.pipeline && (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="w-full justify-between rounded-xl border border-transparent px-3 py-2.5 h-auto text-left hover:border-primary/20 hover:bg-primary/5"
                            >
                              <h3 className="text-sm font-semibold text-foreground">
                                Analysis Timeline
                              </h3>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3">
                            <PredictionTimeline
                              pipeline={prediction.raw_response.meta.pipeline}
                              forecasts={
                                prediction.raw_response?.geminiForecast?.forecasts?.map(
                                  (f: any) => ({
                                    horizon: f.horizon,
                                    direction: f.direction,
                                    probabilities: f.probabilities,
                                    expected_return_bp: f.expected_return_bp,
                                    confidence: f.confidence,
                                  }),
                                ) || []
                              }
                              predictedAt={new Date(prediction.created_at)}
                              symbol={prediction.symbol}
                              marketStatus={marketStatus}
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </Container>
      </div>
    </DashboardShellLayout>
  );
}
