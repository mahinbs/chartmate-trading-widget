import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Clock, ChevronDown, Plus, History } from "lucide-react";
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

interface AnalysisData {
  symbol: string;
  summary?: string;
  dataSource?: string;
  marketData?: { candleCount: number; source: string; interval: string };
  from?: string;
  to?: string;
  ai?: { 
    summary?: string; 
    report?: {
      title: string;
      whatWePredicted: string;
      whatHappened: string;
      verdictExplanation: string;
      failureExcuse?: string | null;
      successExplanation?: string | null;
      keyFactors: string[];
      nextSteps: string[];
      confidenceNote: string;
    };
    rawText?: string;
  };
  evaluation?: {
    result: 'accurate' | 'partial' | 'failed' | 'inconclusive';
    startPrice: number;
    endPrice: number;
    actualChangePercent: number;
    predictedDirection?: 'up' | 'down' | 'neutral' | 'sideways' | null;
    predictedMovePercent?: number | null;
    hitTargetMin?: boolean;
    hitTargetMax?: boolean;
    endTimeUsed?: string;
    reasoning?: string;
  };
}

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

  // Calculate expected completion time for prediction windows using market hours
  const calculateExpectedTime = (createdAt: string, timeframe: string, marketStatus?: any): Date => {
    const baseTime = new Date(createdAt);
    const timeframeMinutes = {
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '4h': 240,
      '1d': 1440,
      '1w': 10080
    };
    const minutes = timeframeMinutes[timeframe as keyof typeof timeframeMinutes] || 60;
    
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
      const uniqueSymbols = [...new Set(predictions.map(p => p.symbol))];
      await Promise.all(uniqueSymbols.map(symbol => fetchMarketStatus(symbol)));
    };
    fetchMarketStatuses();
    
    // Auto-analyze predictions that have expired
    const interval = setInterval(() => {
      predictions.forEach(async (prediction) => {
        if (!analysisStates[prediction.id]?.data && !analysisStates[prediction.id]?.loading) {
          const marketStatus = marketStatuses[prediction.symbol];
          const expectedTime = calculateExpectedTime(prediction.created_at, prediction.timeframe, marketStatus);
          const now = new Date();
          if (now >= expectedTime) {
            await analyzePostPrediction(prediction, expectedTime);
          }
        }
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [predictions, analysisStates, marketStatuses]);

  // Cache management
  const CACHE_KEY = 'prediction-analysis-cache';
  
  const loadCachedAnalysis = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        setAnalysisStates(parsedCache);
      }
    } catch (error) {
      console.error('Failed to load cached analysis:', error);
    }
  };

  const saveCachedAnalysis = (states: Record<string, { loading: boolean; data: AnalysisData | null; error: string | null }>) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(states));
    } catch (error) {
      console.error('Failed to save cached analysis:', error);
    }
  };

  const removeCachedAnalysis = (predictionId: string) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        delete parsedCache[predictionId];
        localStorage.setItem(CACHE_KEY, JSON.stringify(parsedCache));
      }
    } catch (error) {
      console.error('Failed to remove cached analysis:', error);
    }
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
      setPredictions((data as any) || []);
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

  const analyzePostPrediction = async (prediction: Prediction, toOverride?: Date) => {
    const predictionId = prediction.id;
    
    // Check if analysis already exists in cache
    if (analysisStates[predictionId]?.data) {
      console.log(`Analysis already cached for ${prediction.symbol}`);
      return;
    }
    
    setAnalysisStates(prev => ({
      ...prev,
      [predictionId]: { loading: true, data: null, error: null }
    }));

    try {
      const marketStatus = marketStatuses[prediction.symbol];
      const effectiveStart = getEffectiveStart(new Date(prediction.created_at), marketStatus);
      const effectiveEnd = toOverride || getEffectiveTarget(prediction.timeframe, effectiveStart);

      const requestBody = {
        symbol: prediction.symbol,
        from: effectiveStart.toISOString(),
        to: effectiveEnd.toISOString(),
        expected: prediction.expected_move_direction ? {
          direction: prediction.expected_move_direction,
          movePercent: prediction.expected_move_percent || 0,
          priceTargetMin: prediction.price_target_min || null,
          priceTargetMax: prediction.price_target_max || null,
        } : null,
        marketMeta: prediction.raw_response?.marketMeta || null
      };

      console.log('🔍 Analyzing prediction:', requestBody);
      
      const { data, error } = await supabase.functions.invoke('analyze-post-prediction', {
        body: requestBody
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Edge function failed');
      }

      if (!data) {
        throw new Error('No data returned from analysis');
      }

      console.log('✅ Analysis result:', data);

      // Handle "no_data" responses gracefully
      if (data.status === 'no_data') {
        const adapted: AnalysisData = {
          symbol: prediction.symbol,
          summary: data.summary,
          dataSource: data.dataSource,
          evaluation: {
            result: 'inconclusive',
            startPrice: 0,
            endPrice: 0,
            actualChangePercent: 0,
            reasoning: 'No market data available for this timeframe'
          }
        };

        const newStates = {
          ...analysisStates,
          [predictionId]: { loading: false, data: adapted, error: null }
        };
        
        setAnalysisStates(newStates);
        saveCachedAnalysis(newStates);
        return;
      }

      // Store the full response including evaluation
      const adapted: AnalysisData = {
        symbol: prediction.symbol,
        summary: data.summary,
        dataSource: data.dataSource,
        marketData: data.marketData,
        from: data.from || prediction.created_at,
        to: data.to || new Date().toISOString(),
        ai: data.ai || { summary: data.summary },
        evaluation: data.evaluation
      };

      const newStates = {
        ...analysisStates,
        [predictionId]: { loading: false, data: adapted, error: null }
      };
      
      setAnalysisStates(newStates);
      saveCachedAnalysis(newStates);

    } catch (error: any) {
      console.error('❌ Analysis error:', error);
      
      // Better error message extraction
      let errorMessage = 'Analysis failed';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.error) {
        errorMessage = error.error;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      const newStates = {
        ...analysisStates,
        [predictionId]: { loading: false, data: null, error: errorMessage }
      };
      
      setAnalysisStates(newStates);
      saveCachedAnalysis(newStates);
      
      // Only show error toast for actual errors, not data availability issues
      if (!errorMessage?.includes('No market data') && !errorMessage?.includes('no_data')) {
        toast({
          title: "Analysis Failed",
          description: errorMessage + ". This can happen if: 1) Market data is not available yet, 2) The timeframe is too short, or 3) The market was closed during the analysis period. Try again later or check the console for details.",
          variant: "destructive",
        });
      }
    }
  };

  const getOutcome = (prediction: Prediction): 'accurate' | 'partial' | 'failed' | 'pending' | 'inconclusive' => {
    const evaluation = analysisStates[prediction.id]?.data?.evaluation;
    if (evaluation) {
      return evaluation.result as any;
    }
    
    const marketStatus = marketStatuses[prediction.symbol];
    const expectedTime = calculateExpectedTime(prediction.created_at, prediction.timeframe, marketStatus);
    const now = new Date();
    const isExpired = now >= expectedTime;
    
    return isExpired ? 'pending' : 'pending';
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
        <Container className="py-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate('/home')} className="hover:bg-white/5">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
            <Button onClick={() => navigate('/predict')} className="shadow-[0_0_20px_rgba(20,184,166,0.2)]">
              <Plus className="h-4 w-4 mr-2" />
              New Analysis
            </Button>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gradient flex items-center gap-2">
              <History className="h-8 w-8 text-primary" />
              My Analyses
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your AI-powered probability-based analyses and their outcomes
            </p>
          </div>
        </Container>
      </div>

      {/* Main Content */}
      <Container className="py-8">
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
              const startTime = new Date(prediction.created_at);
              const marketStatus = marketStatuses[prediction.symbol];
              const expectedTime = calculateExpectedTime(prediction.created_at, prediction.timeframe, marketStatus);
              const timeRemaining = expectedTime.getTime() - Date.now();
              const elapsedPercent = getElapsedPercent(startTime, expectedTime, new Date());
              const isExpired = timeRemaining < 0;
              const outcome = getOutcome(prediction);
              const isAnalyzing = analysisStates[prediction.id]?.loading;

              return (
                <Card key={prediction.id} className="glass-panel overflow-hidden flex flex-col">
                  {/* Header with Summary */}
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <SummaryHeader
                          symbol={prediction.symbol}
                          currentPrice={prediction.current_price || 0}
                          change={0}
                          changePercent={prediction.expected_move_percent || 0}
                          recommendation={prediction.recommendation || undefined}
                          confidence={prediction.confidence || undefined}
                        />
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <OutcomeBadge outcome={outcome} />
                        <ActionBar
                          onDelete={() => deletePrediction(prediction.id)}
                          onAnalyze={() => analyzePostPrediction(prediction)}
                          isAnalyzing={isAnalyzing}
                          showAnalyze={isExpired && !analysisStates[prediction.id]?.data?.evaluation}
                        />
                      </div>
                    </div>
                    
                    {/* Time Progress */}
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {isExpired ? 'Completed' : `${formatDuration(timeRemaining)} remaining`}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(prediction.created_at)}
                        </span>
                      </div>
                      <Progress value={isExpired ? 100 : elapsedPercent} className="h-2" />
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    {/* Investment Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-black/20 rounded-lg border border-white/5">
                      <div>
                        <p className="text-xs text-muted-foreground">Investment</p>
                        <p className="font-semibold text-white">{prediction.investment ? formatCurrency(prediction.investment, 0) : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Timeframe</p>
                        <p className="font-semibold text-white">{prediction.timeframe}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Expected Move</p>
                        <p className={`font-semibold ${
                          prediction.expected_move_direction === 'up' ? 'text-green-400' : 
                          prediction.expected_move_direction === 'down' ? 'text-red-400' : 
                          'text-yellow-400'
                        }`}>
                          {prediction.expected_move_percent ? formatPercentage(prediction.expected_move_percent, 1, false) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Price Target</p>
                        <p className="font-semibold text-white">
                          {prediction.price_target_min && prediction.price_target_max ? 
                            `${formatCurrency(prediction.price_target_min, 2)} - ${formatCurrency(prediction.price_target_max, 2)}` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Multi-Horizon Forecasts */}
                    {prediction.raw_response?.geminiForecast?.forecasts && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-white/5">
                            <h3 className="text-sm font-medium text-white">Multi-Horizon Forecasts</h3>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3">
                          <ForecastTable 
                            forecasts={prediction.raw_response.geminiForecast.forecasts} 
                            predictedAt={new Date(prediction.created_at)}
                            marketStatus={marketStatus}
                          />
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Key Levels */}
                    {prediction.raw_response?.geminiForecast?.support_resistance && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-white/5">
                            <h3 className="text-sm font-medium text-white">Key Price Levels</h3>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3">
                          <KeyLevels
                            supportLevels={prediction.raw_response.geminiForecast.support_resistance.supports}
                            resistanceLevels={prediction.raw_response.geminiForecast.support_resistance.resistances}
                            currentPrice={prediction.current_price || 0}
                          />
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
                        <CollapsibleContent className="mt-3">
                          <PostPredictionReport
                            symbol={prediction.symbol}
                            timeframe={prediction.timeframe}
                            evaluation={analysisStates[prediction.id]?.data?.evaluation}
                            marketData={analysisStates[prediction.id]?.data?.marketData}
                            ai={analysisStates[prediction.id]?.data?.ai}
                            dataSource={analysisStates[prediction.id]?.data?.dataSource}
                          />
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Pipeline Timeline */}
                    {prediction.raw_response?.meta?.pipeline && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-white/5">
                            <h3 className="text-sm font-medium text-white">Analysis Timeline</h3>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
