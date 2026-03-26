import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Clock, ChevronDown, Plus, History, Maximize2, Loader2 } from "lucide-react";
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
import { getPredictionWindowEnd } from "@/lib/prediction-window";
import { getEffectiveStart } from "@/lib/market-hours";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { HELP } from "@/lib/analysis-ui-help";
import {
  readPredictionAnalysisCache,
  writePredictionAnalysisCache,
  removePredictionAnalysisFromCache,
  type CachedAnalysisData,
} from "@/lib/prediction-analysis-cache";
import { invokeAnalyzePostPrediction, type PredictionRow } from "@/lib/invoke-analyze-post-prediction";
import { persistPostOutcomeAnalysis } from "@/lib/prediction-persistence";

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
  updated_at?: string;
  post_outcome_analysis?: {
    evaluation?: CachedAnalysisData["evaluation"];
    ai?: CachedAnalysisData["ai"];
    marketData?: CachedAnalysisData["marketData"];
    dataSource?: string;
    summary?: string;
    updated_at?: string;
  } | null;
  raw_response: any;
}

type AnalysisData = CachedAnalysisData;

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisStates, setAnalysisStates] = useState<Record<string, {
    loading: boolean;
    data: AnalysisData | null;
    error: string | null;
  }>>({});
  const [marketStatuses, setMarketStatuses] = useState<Record<string, any>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch market status for a symbol
  const fetchMarketStatus = async (symbol: string) => {
    if (marketStatuses[symbol]) return marketStatuses[symbol];
    
    try {
      const { data, error } = await supabase.functions.invoke('get-market-status', {
        body: { symbol }
      });
      if (!error && data) {
        setMarketStatuses(prev => ({ ...prev, [symbol]: data }));
        return data;
      }
    } catch (error) {
      console.error('Failed to fetch market status for', symbol, error);
    }
    return null;
  };

  /** Merge server-stored outcome scoring into UI state (survives new device / cleared cache). */
  function postOutcomeToAnalysisData(
    symbol: string,
    po: NonNullable<Prediction["post_outcome_analysis"]>,
  ): AnalysisData {
    return {
      symbol,
      evaluation: po.evaluation,
      ai: po.ai,
      marketData: po.marketData,
      dataSource: po.dataSource,
      summary: po.summary,
    };
  }

  // React to predictions list changing: fetch market statuses + schedule auto-analysis
  useEffect(() => {
    if (predictions.length === 0) return;

    // Fetch market statuses for unique symbols
    const fetchMarketStatuses = async () => {
      const uniqueSymbols = [...new Set(predictions.map(p => p.symbol))];
      await Promise.all(uniqueSymbols.map(symbol => fetchMarketStatus(symbol)));
    };
    fetchMarketStatuses();
    
    // Auto-analyze predictions that have expired
    const interval = setInterval(() => {
      predictions.forEach(async (prediction) => {
        const st = analysisStates[prediction.id];
        if (!st?.data && !st?.loading && !st?.error) {
          const marketStatus = marketStatuses[prediction.symbol];
          const expectedTime = getPredictionWindowEnd(
            prediction.created_at,
            prediction.timeframe,
            prediction.raw_response,
            marketStatus,
          );
          const now = new Date();
          if (now >= expectedTime) {
            await analyzePostPrediction(prediction as PredictionRow, expectedTime);
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

  const saveCachedAnalysis = (states: Record<string, { loading: boolean; data: AnalysisData | null; error: string | null }>) => {
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
        .from('predictions' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = (data as Prediction[]) || [];
      setPredictions(rows);

      const cached = readPredictionAnalysisCache();
      const fromServer: Record<string, { loading: boolean; data: AnalysisData | null; error: string | null }> = {};
      for (const p of rows) {
        const po = p.post_outcome_analysis;
        if (po?.evaluation) {
          fromServer[p.id] = {
            loading: false,
            data: postOutcomeToAnalysisData(p.symbol, po),
            error: null,
          };
        }
      }
      setAnalysisStates((prev) => ({ ...cached, ...prev, ...fromServer }));
    } catch (error) {
      console.error('Error fetching predictions:', error);
      toast({
        title: "Error",
        description: "Failed to load analyses",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const deletePrediction = async (id: string) => {
    try {
      const { error } = await supabase
        .from('predictions' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setPredictions(predictions.filter(p => p.id !== id));
      removeCachedAnalysis(id);
      
      setAnalysisStates(prev => {
        const newStates = { ...prev };
        delete newStates[id];
        return newStates;
      });
      
      toast({
        title: "Success",
        description: "Analysis deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting prediction:', error);
      toast({
        title: "Error",
        description: "Failed to delete analysis",
        variant: "destructive"
      });
    }
  };

  // Date/Time helper functions
  const formatDateTime = (date: Date | string | null | undefined) => {
    if (!date) return 'Invalid Date';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
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

  const getElapsedPercent = (startTime: Date, endTime: Date, currentTime: Date) => {
    const totalDuration = endTime.getTime() - startTime.getTime();
    const elapsed = currentTime.getTime() - startTime.getTime();
    return Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
  };

  const analyzePostPrediction = async (prediction: PredictionRow, toOverride?: Date) => {
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
      const adapted: AnalysisData = await invokeAnalyzePostPrediction(prediction, marketStatus, toOverride);

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
      <div className="min-h-screen bg-background">
        <Container className="p-6">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" onClick={() => navigate('/home')} className="hover:bg-white/5">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
          </div>
          <div className="text-center text-muted-foreground">Loading analyses...</div>
        </Container>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <Container className="py-3 sm:py-4">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/home')} className="hover:bg-white/5">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Home</span>
            </Button>
            <Button size="sm" onClick={() => navigate('/predict')} className="shadow-[0_0_20px_rgba(20,184,166,0.2)]">
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
              Track your AI-powered probability-based analyses and their outcomes
            </p>
          </div>
        </Container>
      </div>
      {/* Main Content */}
      <Container className="py-4 sm:py-8">
        {predictions.length === 0 ? (
          <Card className="glass-panel max-w-md mx-auto text-center">
            <CardContent className="p-8">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Plus className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">No analyses yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Create your first AI-powered probability-based analysis to get started
                  </p>
                </div>
                <Button onClick={() => navigate('/predict')} className="w-full">
                  New Analysis
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {predictions.map((prediction) => {
              const marketStatus = marketStatuses[prediction.symbol];
              const effectiveStart = getEffectiveStart(new Date(prediction.created_at), marketStatus);
              const expectedTime = getPredictionWindowEnd(
                prediction.created_at,
                prediction.timeframe,
                prediction.raw_response,
                marketStatus,
              );
              const timeRemaining = expectedTime.getTime() - Date.now();
              const elapsedPercent = getElapsedPercent(effectiveStart, expectedTime, new Date());
              const isExpired = timeRemaining < 0;
              const isAnalyzing = analysisStates[prediction.id]?.loading;
              const outcome = getOutcome(prediction, isExpired, isAnalyzing);
              const evaluation = analysisStates[prediction.id]?.data?.evaluation;
              const outcomeScoredAt = prediction.post_outcome_analysis?.updated_at;
              const recordUpdatedMs =
                prediction.updated_at &&
                new Date(prediction.updated_at).getTime() - new Date(prediction.created_at).getTime() >
                  90_000;
              return (
                <Card
                  key={prediction.id}
                  className="glass-panel overflow-hidden flex flex-col transition-colors hover:border-white/15"
                  onClick={() => navigate(`/predict?saved=${prediction.id}`)}
                >
                  {/* Header with Summary */}
                  <CardHeader className="pb-3 px-3 sm:px-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0 w-full md:w-auto">
                        <SummaryHeader
                          symbol={prediction.symbol}
                          currentPrice={prediction.current_price || 0}
                          change={0}
                          changePercent={prediction.expected_move_percent || 0}
                          recommendation={prediction.recommendation || undefined}
                          confidence={prediction.confidence || undefined}
                        />
                      </div>
                      <div
                        className="flex justify-start md:justify-end flex-wrap w-full md:w-auto items-center gap-2 mt-2 md:mt-0 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <OutcomeBadge outcome={outcome} />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="bg-white/10 hover:bg-white/15 text-xs gap-1 shrink-0"
                          onClick={() => navigate(`/predict?saved=${prediction.id}`)}
                        >
                          <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="hidden sm:inline">See full analysis</span>
                          <span className="sm:hidden">Full</span>
                        </Button>
                        <ActionBar
                          onDelete={() => deletePrediction(prediction.id)}
                          onAnalyze={() => analyzePostPrediction(prediction as PredictionRow)}
                          isAnalyzing={isAnalyzing}
                          showAnalyze={isExpired && !analysisStates[prediction.id]?.data?.evaluation}
                        />
                      </div>
                    </div>
                    
                    {/* Time Progress */}
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground text-xs sm:text-sm">
                            {isExpired
                              ? `Window ended ${formatDateTime(expectedTime)}`
                              : `${formatDuration(timeRemaining)} remaining`}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground pl-5 sm:pl-0">
                          Started {formatDateTime(prediction.created_at)}
                        </span>
                      </div>
                      <Progress value={isExpired ? 100 : elapsedPercent} className="h-1.5" />
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 px-3 sm:px-6" onClick={(e) => e.stopPropagation()}>
                    {/* Investment Details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 sm:p-4 bg-black/20 rounded-lg border border-white/5">
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Investment</p>
                        <p className="font-semibold text-white text-sm sm:text-base">{prediction.investment ? formatCurrency(prediction.investment, 0) : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Timeframe</p>
                        <p className="font-semibold text-white text-sm sm:text-base">
                          {prediction.timeframe === "custom" && prediction.raw_response?.timeframe
                            ? String(prediction.raw_response.timeframe)
                            : prediction.timeframe}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Expected Move</p>
                        <p className={`font-semibold text-sm sm:text-base ${
                          prediction.expected_move_direction === 'up' ? 'text-green-400' : 
                          prediction.expected_move_direction === 'down' ? 'text-red-400' : 
                          'text-yellow-400'
                        }`}>
                          {prediction.expected_move_percent ? formatPercentage(prediction.expected_move_percent, 1, false) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Price Target</p>
                        <p className="font-semibold text-white text-xs sm:text-sm break-words">
                          {prediction.price_target_min && prediction.price_target_max ? 
                            `${formatCurrency(prediction.price_target_min, 2)} – ${formatCurrency(prediction.price_target_max, 2)}` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Prediction window vs market (after window ends) */}
                    {isExpired && (
                      <div className="rounded-xl border border-primary/35 bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent p-4 sm:p-5 space-y-3 ring-1 ring-primary/15">
                        <p className="text-sm sm:text-base font-bold text-white tracking-tight">
                          Prediction vs actual (your window)
                        </p>
                        {evaluation && evaluation.startPrice > 0 ? (
                          <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                              <div>
                                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">
                                  Price at start
                                </p>
                                <p className="font-mono font-bold text-white text-base sm:text-lg">
                                  {formatCurrency(evaluation.startPrice, 4)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">
                                  Price after window
                                </p>
                                <p className="font-mono font-bold text-white text-base sm:text-lg">
                                  {formatCurrency(evaluation.endPrice, 4)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">
                                  Actual move
                                </p>
                                <p
                                  className={`font-bold text-base sm:text-lg ${
                                    evaluation.actualChangePercent >= 0 ? "text-emerald-400" : "text-red-400"
                                  }`}
                                >
                                  {formatPercentage(evaluation.actualChangePercent, 2, true)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">
                                  Accuracy read
                                </p>
                                <div className="mt-0.5">
                                  <OutcomeBadge outcome={evaluation.result} size="md" />
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Compared to your expected{" "}
                              <span className="text-foreground font-medium">
                                {prediction.expected_move_direction || "—"} /{" "}
                                {prediction.expected_move_percent != null
                                  ? formatPercentage(prediction.expected_move_percent, 1, false)
                                  : "—"}
                              </span>
                              . Open <strong>Probability Outcome</strong> below for the full report.
                            </p>
                            {outcomeScoredAt && (
                              <p className="text-[11px] text-primary/90 font-medium">
                                Outcome scored {formatDateTime(outcomeScoredAt)}
                              </p>
                            )}
                          </>
                        ) : isAnalyzing ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            Scoring start vs end price over your window…
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            This prediction&apos;s timeframe finished at{" "}
                            <span className="text-foreground font-semibold">
                              {formatDateTime(expectedTime)}
                            </span>
                            . Tap <strong>Analyze outcome</strong> above to fetch closing prices for the window and
                            label how accurate the call was.
                          </p>
                        )}
                        {recordUpdatedMs && prediction.updated_at && (
                          <p className="text-[11px] text-amber-200/90 border-t border-white/10 pt-2">
                            This saved row was updated again at {formatDateTime(prediction.updated_at)} (for example
                            after a refresh or re-save), so the snapshot may differ slightly from the original run time.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Multi-Horizon Forecasts */}
                    {prediction.raw_response?.geminiForecast?.forecasts && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-white/5 gap-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <h3 className="text-sm font-medium text-white">Multi-Horizon Forecasts</h3>
                              <span
                                className="shrink-0 inline-flex"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <CardInfoTooltip text={HELP.multiHorizonTable} className="text-zinc-500" />
                              </span>
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3">
                          <ForecastTable 
                            forecasts={prediction.raw_response.geminiForecast.forecasts} 
                            predictedAt={new Date(prediction.created_at)}
                            marketStatus={marketStatus}
                          />
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 leading-relaxed">
                            {HELP.multiHorizonTable}
                          </p>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Key Levels */}
                    {prediction.raw_response?.geminiForecast?.support_resistance && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-white/5 gap-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <h3 className="text-sm font-medium text-white">Key Price Levels</h3>
                              <span
                                className="shrink-0 inline-flex"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <CardInfoTooltip text={HELP.priceLevels} className="text-zinc-500" />
                              </span>
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3">
                          <KeyLevels
                            supportLevels={prediction.raw_response.geminiForecast.support_resistance.supports}
                            resistanceLevels={prediction.raw_response.geminiForecast.support_resistance.resistances}
                            currentPrice={prediction.current_price || 0}
                          />
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 leading-relaxed">
                            {HELP.priceLevelsCardGuide}
                          </p>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* AI Insights */}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-white/5">
                          <h3 className="text-sm font-medium text-white">AI Insights & Analysis</h3>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <Insights
                          keyDrivers={prediction.raw_response?.geminiForecast?.forecasts?.[0]?.key_drivers}
                          riskFlags={prediction.raw_response?.geminiForecast?.forecasts?.[0]?.risk_flags}
                          opportunities={prediction.raw_response?.opportunities}
                          rationale={prediction.raw_response?.rationale}
                          patterns={prediction.raw_response?.patterns}
                        />
                      </CollapsibleContent>
                    </Collapsible>

                    {/* AI-Powered Analysis Results */}
                    {analysisStates[prediction.id]?.data && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-white/5">
                            <h3 className="text-sm font-medium text-white">Probability Outcome</h3>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3 space-y-4">
                          <PostPredictionReport
                            symbol={prediction.symbol}
                            timeframe={
                              prediction.timeframe === "custom" && prediction.raw_response?.timeframe
                                ? String(prediction.raw_response.timeframe)
                                : prediction.timeframe
                            }
                            evaluation={analysisStates[prediction.id]?.data?.evaluation}
                            marketData={analysisStates[prediction.id]?.data?.marketData}
                            ai={analysisStates[prediction.id]?.data?.ai}
                            dataSource={analysisStates[prediction.id]?.data?.dataSource}
                          />
                          <p className="text-xs text-muted-foreground">
                            Strategy entry scan & full AI dashboard: open{" "}
                            <button
                              type="button"
                              className="text-teal-400 underline"
                              onClick={() => navigate(`/predict?saved=${prediction.id}`)}
                            >
                              See full analysis
                            </button>
                            .
                          </p>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Pipeline Timeline */}
                    {prediction.raw_response?.meta?.pipeline && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-white/5 gap-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <h3 className="text-sm font-medium text-white">Analysis Timeline</h3>
                              <span
                                className="shrink-0 inline-flex"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <CardInfoTooltip text={HELP.analysisTimelineCard} className="text-zinc-500" />
                              </span>
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3">
                          <PredictionTimeline
                            pipeline={prediction.raw_response.meta.pipeline}
                            forecasts={prediction.raw_response?.geminiForecast?.forecasts?.map((f: any) => ({
                              horizon: f.horizon,
                              direction: f.direction,
                              probabilities: f.probabilities,
                              expected_return_bp: f.expected_return_bp,
                              confidence: f.confidence
                            })) || []}
                            predictedAt={new Date(prediction.created_at)}
                            symbol={prediction.symbol}
                            marketStatus={marketStatus}
                          />
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 leading-relaxed">
                            <span className="font-semibold text-foreground/85">Pipeline: </span>
                            {HELP.analysisTimelineCard}{" "}
                            <span className="font-semibold text-foreground/85">Forecast rows: </span>
                            {HELP.probTimeline}
                          </p>
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
  );
};
