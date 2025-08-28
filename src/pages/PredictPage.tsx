import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SymbolSearch } from "@/components/SymbolSearch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import ChartPanel from "@/components/ChartPanel";
import { AdvancedPredictLoader } from "@/components/AdvancedPredictLoader";
import { PredictionTimeline } from "@/components/PredictionTimeline";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, BrainCircuit, LineChart, ChevronDown, DollarSign, LogOut, History, BarChart3 } from "lucide-react";

interface GeminiForecast {
  symbol: string;
  as_of: string;
  forecasts: Array<{
    horizon: string;
    direction: "up" | "down" | "sideways";
    probabilities: { up: number; down: number; sideways: number };
    expected_return_bp: number;
    expected_range_bp: { p10: number; p50: number; p90: number };
    key_drivers: string[];
    risk_flags: string[];
    confidence: number;
    invalid_if: string[];
  }>;
  support_resistance: {
    supports: Array<{ level: number; strength: number }>;
    resistances: Array<{ level: number; strength: number }>;
  };
  positioning_guidance: {
    bias: "long" | "short" | "flat";
    notes: string;
  };
}

interface PipelineStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  startTime?: number;
  endTime?: number;
  duration?: number;
  details?: string;
}

interface PipelineMeta {
  totalDuration: number;
  steps: PipelineStep[];
  startTime: number;
  endTime: number;
}

interface PredictionResult {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  timeframe: string;
  analysis: string;
  stockData: {
    currentPrice: number;
    openPrice: number;
    highPrice: number;
    lowPrice: number;
    previousClose: number;
    change: number;
    changePercent: number;
  };
  geminiForecast?: GeminiForecast;
  meta?: {
    pipeline?: PipelineMeta;
  };
  // Legacy structured fields for backward compatibility
  recommendation?: "bullish" | "bearish" | "neutral";
  confidence?: number;
  expectedMove?: {
    percent?: number;
    direction?: "up" | "down" | "flat";
    priceTarget?: {
      min: number;
      max: number;
    };
  };
  patterns?: string[];
  keyLevels?: {
    support?: number[];
    resistance?: number[];
  };
  risks?: string[];
  opportunities?: string[];
  rationale?: string;
}

const PredictPage = () => {
  const [symbol, setSymbol] = useState("");
  const [investment, setInvestment] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [chartInterval, setChartInterval] = useState("15");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdvancedLoader, setShowAdvancedLoader] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [chartAnalysisLoading, setChartAnalysisLoading] = useState(false);
  const [chartAnalysis, setChartAnalysis] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState("NASDAQ:AAPL");
  const [chartDataSource, setChartDataSource] = useState<string | null>(null);
  const [predictedAt, setPredictedAt] = useState<Date | null>(null);
  
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  // Auto-save prediction to database
  const savePrediction = async (predictionData: PredictionResult) => {
    try {
      if (!user?.id) return;
      
      const { error } = await supabase
        .from('predictions' as any)
        .insert({
          user_id: user.id,
          symbol: predictionData.symbol,
          timeframe,
          investment: parseFloat(investment),
          current_price: predictionData.currentPrice,
          recommendation: predictionData.recommendation || null,
          confidence: predictionData.confidence || null,
          expected_move_direction: predictionData.expectedMove?.direction || null,
          expected_move_percent: predictionData.expectedMove?.percent || null,
          price_target_min: predictionData.expectedMove?.priceTarget?.min || null,
          price_target_max: predictionData.expectedMove?.priceTarget?.max || null,
          rationale: predictionData.rationale || null,
          patterns: predictionData.patterns || null,
          key_levels: predictionData.keyLevels || null,
          risks: predictionData.risks || null,
          opportunities: predictionData.opportunities || null,
          raw_response: {
            ...predictionData,
            geminiForecast: predictionData.geminiForecast
          }
        });

      if (error) {
        console.error('Error saving prediction:', error);
      }
    } catch (error) {
      console.error('Error saving prediction:', error);
    }
  };

  const handlePredict = async () => {
    if (!symbol || !investment || !timeframe) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    setShowAdvancedLoader(true);
    setAnalysisReady(false);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('predict-movement', {
        body: {
          symbol: symbol.split(':')[1] || symbol,
          investment: parseFloat(investment),
          timeframe,
          horizons: [15, 30, 60, 1440] // Request multiple horizons
        }
      });

      if (error) {
        console.error("Analysis error:", error);
        setShowAdvancedLoader(false);
        toast.error("Failed to get analysis. Please try again.");
        return;
      }

      setResult(data);
      setAnalysisReady(true);
      setPredictedAt(new Date()); // Capture stable timestamp
      // Auto-save the prediction
      await savePrediction(data);
      // Loader will complete when it's ready
    } catch (error) {
      console.error("Error:", error);
      setShowAdvancedLoader(false);
      setAnalysisReady(false);
      toast.error("An error occurred while getting the prediction");
    } finally {
      setLoading(false);
    }
  };

  const handleLoaderComplete = () => {
    setShowAdvancedLoader(false);
    setResultsOpen(true);
    toast.success("Analysis generated successfully!");
  };

  const getPriceChangeIcon = (changePercent: number) => {
    if (changePercent > 0) return <TrendingUp className="h-5 w-5 text-green-600" />;
    if (changePercent < 0) return <TrendingDown className="h-5 w-5 text-red-600" />;
    return <Minus className="h-5 w-5 text-muted-foreground" />;
  };

  const getPriceChangeColor = (changePercent: number) => {
    if (changePercent > 0) return "bg-green-100 text-green-800 border-green-200";
    if (changePercent < 0) return "bg-red-100 text-red-800 border-red-200";
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  };

  const getRecommendationIcon = (recommendation?: string) => {
    if (recommendation === "bullish") return <TrendingUp className="h-6 w-6 text-green-600" />;
    if (recommendation === "bearish") return <TrendingDown className="h-6 w-6 text-red-600" />;
    return <Minus className="h-6 w-6 text-muted-foreground" />;
  };

  const getRecommendationColor = (recommendation?: string) => {
    if (recommendation === "bullish") return "text-green-600";
    if (recommendation === "bearish") return "text-red-600";
    return "text-muted-foreground";
  };

  const calculatePnL = (investment: number, expectedPercent?: number) => {
    if (!expectedPercent) return null;
    return (investment * expectedPercent) / 100;
  };

  const getChartIntervalMapping = (interval: string) => {
    const mapping: Record<string, string> = {
      "1": "1",
      "5": "5", 
      "15": "15",
      "60": "60",
      "D": "D",
      "W": "W"
    };
    return mapping[interval] || "15";
  };

  const generateSparklineData = () => {
    if (!result?.expectedMove?.percent) return [];
    
    const currentPrice = result.currentPrice;
    const change = result.expectedMove.percent;
    const steps = 8;
    
    return Array.from({ length: steps }, (_, i) => ({
      x: i,
      price: currentPrice + (currentPrice * change * i) / (100 * (steps - 1))
    }));
  };

  const renderSparklineSVG = () => {
    if (!result?.expectedMove?.percent) return null;
    
    const data = generateSparklineData();
    const width = 200;
    const height = 40;
    const padding = 4;
    
    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * (width - 2 * padding) + padding;
      const y = height - padding - ((d.price - minPrice) / priceRange) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');
    
    const color = result.expectedMove.direction === 'up' ? '#10b981' : '#ef4444';
    
    return (
      <svg width={width} height={height} className="w-full h-full">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
        />
      </svg>
    );
  };

  // Date/Time helper functions
  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  };

  const calculateExpectedTime = (timeframe: string, startTime: Date = new Date()) => {
    const timeframeMinutes: Record<string, number> = {
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '2h': 120,
      '1d': 1440
    };
    
    const minutes = timeframeMinutes[timeframe] || 60;
    return new Date(startTime.getTime() + minutes * 60 * 1000);
  };

  const getCurrentPredictionTime = () => new Date();
  const getExpectedTime = () => calculateExpectedTime(timeframe, getCurrentPredictionTime());

  // Chart analysis functionality
  const getTimeWindowFromInterval = (interval: string) => {
    const now = new Date();
    const intervals: Record<string, number> = {
      "1": 90,      // 90 minutes
      "5": 1440,    // 24 hours  
      "15": 4320,   // 3 days
      "60": 14400,  // 10 days
      "240": 43200, // 30 days
      "D": 129600,  // 90 days
      "W": 518400   // 360 days
    };
    
    const minutes = intervals[interval] || 1440;
    const from = new Date(now.getTime() - minutes * 60 * 1000 - 5 * 60 * 1000); // Subtract 5 minutes padding
    const to = new Date(now.getTime() - 60 * 1000); // 1 minute ago to ensure closed candles
    
    return { from: from.toISOString(), to: to.toISOString() };
  };

  const handleAnalyzeChart = async (symbol: string, interval: string) => {
    setChartAnalysisLoading(true);
    setChartAnalysis(null);
    setChartDataSource(null);
    
    try {
      const { from, to } = getTimeWindowFromInterval(interval);
      const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      
      const { data, error } = await supabase.functions.invoke('analyze-post-prediction', {
        body: {
          symbol: cleanSymbol,
          from
        }
      });

      if (error) {
        console.error("Chart analysis error:", error);
        toast.error("Failed to analyze chart. Please try again.");
        return;
      }

      setChartAnalysis(data.summary || "No analysis available");
      setChartDataSource(data.dataSource || "Yahoo Finance");
      toast.success("Chart analysis completed!");
    } catch (error) {
      console.error("Error analyzing chart:", error);
      toast.error("An error occurred while analyzing the chart");
    } finally {
      setChartAnalysisLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="p-6 animate-fade-in">
        <div className="flex justify-between items-start mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/predictions')}
            className="flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            My Predictions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const { error } = await signOut();
              if (error) {
                toast.error("Failed to sign out");
              }
            }}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-teal-400">
            AI Market Prediction
          </h1>
          <p className="text-muted-foreground text-lg">
            Get real-time AI-powered predictions for any stock, forex, or crypto
          </p>
          {user?.email && (
            <p className="text-sm text-muted-foreground">
              Welcome back, {user.email}
            </p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
          {/* Left Column - Prediction Parameters */}
          <div className="space-y-6">
            <Card className="backdrop-blur-xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-teal-500/10 border-white/10 shadow-2xl rounded-2xl animate-fade-in">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-semibold">Prediction Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Symbol Input */}
                <div className="relative">
                  <Label 
                    htmlFor="symbol" 
                    className={`absolute left-3 transition-all duration-200 pointer-events-none ${
                      symbol ? 'top-2 text-xs text-muted-foreground' : 'top-4 text-sm text-muted-foreground'
                    }`}
                  >
                    {symbol ? 'Symbol' : ''}
                  </Label>
                  <div className={`transition-all duration-200 ${symbol ? 'ring-2 ring-primary/40 shadow-lg shadow-primary/20' : 'hover:ring-2 hover:ring-primary/20'} rounded-lg`}>
                    <SymbolSearch
                      value={symbol}
                      onValueChange={setSymbol}
                      placeholder="Search stocks, crypto, forex..."
                    />
                  </div>
                </div>

                {/* Investment Amount */}
                <div className="relative">
                  <Label 
                    htmlFor="investment" 
                    className={`absolute left-8 transition-all duration-200 pointer-events-none z-10 ${
                      investment ? 'top-2 text-xs text-muted-foreground' : 'top-4 text-sm text-muted-foreground'
                    }`}
                  >
                    {investment ? 'Investment Amount' : 'Investment Amount'}
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-4 h-4 w-4 text-muted-foreground z-10" />
                    <Input
                      id="investment"
                      type="number"
                      placeholder=" "
                      value={investment}
                      onChange={(e) => setInvestment(e.target.value)}
                      className={`pl-8 pt-6 pb-2 transition-all duration-200 ${
                        investment ? 'ring-2 ring-primary/50 shadow-lg shadow-primary/20' : 'hover:ring-2 hover:ring-primary/20'
                      } bg-background/50 backdrop-blur border-white/20`}
                    />
                  </div>
                </div>

                {/* Prediction Timeframe */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Prediction Timeframe</Label>
                  <ToggleGroup 
                    type="single" 
                    value={timeframe} 
                    onValueChange={setTimeframe}
                    className="grid grid-cols-5 gap-2"
                  >
                    <ToggleGroupItem value="15m" className="data-[state=on]:bg-gradient-to-r data-[state=on]:from-blue-600 data-[state=on]:to-purple-600 data-[state=on]:text-white">15m</ToggleGroupItem>
                    <ToggleGroupItem value="30m" className="data-[state=on]:bg-gradient-to-r data-[state=on]:from-blue-600 data-[state=on]:to-purple-600 data-[state=on]:text-white">30m</ToggleGroupItem>
                    <ToggleGroupItem value="1h" className="data-[state=on]:bg-gradient-to-r data-[state=on]:from-blue-600 data-[state=on]:to-purple-600 data-[state=on]:text-white">1h</ToggleGroupItem>
                    <ToggleGroupItem value="2h" className="data-[state=on]:bg-gradient-to-r data-[state=on]:from-blue-600 data-[state=on]:to-purple-600 data-[state=on]:text-white">2h</ToggleGroupItem>
                    <ToggleGroupItem value="1d" className="data-[state=on]:bg-gradient-to-r data-[state=on]:from-blue-600 data-[state=on]:to-purple-600 data-[state=on]:text-white">1d</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Generate Prediction Button */}
                <Button 
                  onClick={handlePredict} 
                  disabled={loading || !symbol || !investment || !timeframe} 
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:hover:scale-100"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="mr-2 h-5 w-5" />
                      Generate Prediction
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Prediction Results - Collapsible */}
            {result && (
              <Collapsible open={resultsOpen} onOpenChange={setResultsOpen}>
                <CollapsibleTrigger asChild>
                  <Card className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-purple-500/10 border-white/10 shadow-xl rounded-2xl cursor-pointer hover:shadow-2xl transition-all duration-300 animate-fade-in">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                          {getRecommendationIcon(result.recommendation)}
                          <span className={getRecommendationColor(result.recommendation)}>
                            Prediction Results
                          </span>
                        </CardTitle>
                        <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${resultsOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CardHeader>
                  </Card>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="animate-fade-in">
                  <Card className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/5 via-blue-500/5 to-purple-500/5 border-white/10 shadow-xl rounded-2xl mt-4">
                    <CardContent className="p-6 space-y-6">
                        {/* Enhanced Prediction Timeline */}
                        <PredictionTimeline 
                          pipeline={result.meta?.pipeline}
                          forecasts={result.geminiForecast?.forecasts}
                          predictedAt={predictedAt || new Date()}
                        />

                       {/* Direction & Confidence */}
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div className="text-center space-y-2">
                           <p className="text-sm text-muted-foreground">Direction</p>
                           <div className="flex items-center justify-center gap-2">
                             {getRecommendationIcon(result.recommendation)}
                             <span className={`font-semibold ${getRecommendationColor(result.recommendation)}`}>
                               {result.recommendation?.toUpperCase() || 'NEUTRAL'}
                             </span>
                           </div>
                         </div>
                        
                        {result.confidence !== undefined && (
                          <div className="text-center space-y-2">
                            <p className="text-sm text-muted-foreground">Confidence</p>
                            <div className="relative w-16 h-16 mx-auto">
                              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeDasharray={`${result.confidence}, 100`}
                                  className="text-gradient-to-r from-blue-500 to-purple-500"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold">{result.confidence}%</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {result.expectedMove && (
                          <div className="text-center space-y-2">
                            <p className="text-sm text-muted-foreground">Expected Move</p>
                            <div className="flex items-center justify-center gap-1">
                              {result.expectedMove.direction === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
                              {result.expectedMove.direction === "down" && <TrendingDown className="h-4 w-4 text-red-500" />}
                              <span className="font-bold">
                                {result.expectedMove.percent ? `${result.expectedMove.percent > 0 ? '+' : ''}${result.expectedMove.percent.toFixed(1)}%` : 'TBD'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Price Range & P/L */}
                      {result.expectedMove?.priceTarget && (
                        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                          <h4 className="font-medium text-sm">Expected Price Range</h4>
                          <div className="flex justify-between items-center">
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              ${result.expectedMove.priceTarget.min.toFixed(2)}
                            </Badge>
                            <div className="flex-1 mx-3 h-2 bg-gradient-to-r from-red-200 via-yellow-200 to-green-200 rounded-full"></div>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              ${result.expectedMove.priceTarget.max.toFixed(2)}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* Investment Impact */}
                      {result.expectedMove?.percent && (
                        <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                          <h4 className="font-medium text-sm">Investment Impact</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex justify-between">
                              <span className="text-sm">Investment:</span>
                              <span className="font-mono text-sm">${investment}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm">Est. P/L:</span>
                              <span className={`font-mono text-sm ${calculatePnL(parseFloat(investment), result.expectedMove.percent)! >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {calculatePnL(parseFloat(investment), result.expectedMove.percent)! >= 0 ? '+' : ''}${calculatePnL(parseFloat(investment), result.expectedMove.percent)!.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sparkline Chart */}
                      {result.expectedMove?.percent && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">Predicted Trend</h4>
                          <div className="h-12 w-full">
                            {renderSparklineSVG()}
                          </div>
                        </div>
                      )}

                      {/* Analysis Tabs */}
                      <Tabs defaultValue="explanation" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-muted/50">
                          <TabsTrigger value="explanation" className="flex items-center gap-2">
                            <BrainCircuit className="h-4 w-4" />
                            AI Explanation
                          </TabsTrigger>
                          <TabsTrigger value="indicators" className="flex items-center gap-2">
                            <LineChart className="h-4 w-4" />
                            Technical Indicators
                          </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="explanation" className="mt-4">
                          <Textarea
                            value={result.analysis}
                            readOnly
                            className="min-h-[200px] resize-none bg-muted/30 backdrop-blur border-white/20 rounded-xl"
                          />
                        </TabsContent>
                        
                        <TabsContent value="indicators" className="mt-4 space-y-4">
                          {result.patterns?.length && (
                            <div>
                              <h5 className="font-medium text-sm mb-2">Chart Patterns</h5>
                              <div className="flex flex-wrap gap-2">
                                {result.patterns.map((pattern, index) => (
                                  <Badge key={index} variant="secondary">{pattern}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {(result.keyLevels?.support?.length || result.keyLevels?.resistance?.length) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {result.keyLevels?.support?.length && (
                                <div>
                                  <h5 className="font-medium text-sm mb-2 text-green-600">Support Levels</h5>
                                  <div className="space-y-1">
                                    {result.keyLevels.support.map((level, index) => (
                                      <Badge key={index} variant="outline" className="bg-green-50 text-green-700 border-green-200 block w-fit">
                                        ${level.toFixed(2)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {result.keyLevels?.resistance?.length && (
                                <div>
                                  <h5 className="font-medium text-sm mb-2 text-red-600">Resistance Levels</h5>
                                  <div className="space-y-1">
                                    {result.keyLevels.resistance.map((level, index) => (
                                      <Badge key={index} variant="outline" className="bg-red-50 text-red-700 border-red-200 block w-fit">
                                        ${level.toFixed(2)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {(!result.patterns?.length && !result.keyLevels?.support?.length && !result.keyLevels?.resistance?.length) && (
                            <p className="text-muted-foreground text-sm">
                              Technical indicators can be analyzed on the live chart. Support and resistance levels will appear here when detected.
                            </p>
                          )}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Enhanced Multi-Horizon Forecast */}
            {result?.geminiForecast && (
              <Card className="backdrop-blur-xl bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-indigo-500/10 border-white/10 shadow-xl rounded-2xl animate-fade-in">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-purple-500" />
                    Enhanced Multi-Horizon Forecast
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    AI-powered predictions across multiple timeframes • Generated at {new Date(result.geminiForecast.as_of).toLocaleString()}
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Positioning Guidance */}
                  <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Market Bias</h4>
                      <Badge 
                        variant="outline" 
                        className={
                          result.geminiForecast.positioning_guidance.bias === 'long' 
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : result.geminiForecast.positioning_guidance.bias === 'short'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }
                      >
                        {result.geminiForecast.positioning_guidance.bias.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {result.geminiForecast.positioning_guidance.notes}
                    </p>
                  </div>

                  {/* Multi-Horizon Forecasts */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Forecasts by Time Horizon</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {result.geminiForecast.forecasts.map((forecast, index) => (
                        <div key={index} className="bg-muted/20 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium text-sm">{
                              forecast.horizon.startsWith('PT') 
                                ? forecast.horizon.replace('PT', '').replace('M', ' min').replace('H', ' hour')
                                : forecast.horizon.replace('P', '').replace('D', ' day')
                            }</h5>
                            <div className="flex items-center gap-2">
                              {forecast.direction === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                              {forecast.direction === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                              {forecast.direction === 'sideways' && <Minus className="h-4 w-4 text-yellow-500" />}
                              <Badge 
                                variant="outline" 
                                className={
                                  forecast.direction === 'up' 
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : forecast.direction === 'down'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                }
                              >
                                {forecast.direction.toUpperCase()}
                              </Badge>
                            </div>
                          </div>

                          {/* Probabilities */}
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="text-center">
                              <div className="text-green-600 font-mono">{(forecast.probabilities.up * 100).toFixed(0)}%</div>
                              <div className="text-muted-foreground">Up</div>
                            </div>
                            <div className="text-center">
                              <div className="text-yellow-600 font-mono">{(forecast.probabilities.sideways * 100).toFixed(0)}%</div>
                              <div className="text-muted-foreground">Flat</div>
                            </div>
                            <div className="text-center">
                              <div className="text-red-600 font-mono">{(forecast.probabilities.down * 100).toFixed(0)}%</div>
                              <div className="text-muted-foreground">Down</div>
                            </div>
                          </div>

                          {/* Expected Return */}
                          <div className="text-center">
                            <div className="text-sm font-medium">
                              Expected: {(forecast.expected_return_bp / 100).toFixed(2)}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Range: {(forecast.expected_range_bp.p10 / 100).toFixed(1)}% to {(forecast.expected_range_bp.p90 / 100).toFixed(1)}%
                            </div>
                          </div>

                          {/* Confidence */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Confidence</span>
                            <span className="font-mono">{(forecast.confidence * 100).toFixed(0)}%</span>
                          </div>

                          {/* Key Drivers */}
                          {forecast.key_drivers.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-green-700">Key Drivers</div>
                              <ul className="text-xs space-y-1">
                                {forecast.key_drivers.slice(0, 2).map((driver, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-green-500 mt-0.5">•</span>
                                    <span className="text-muted-foreground">{driver}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Risk Flags */}
                          {forecast.risk_flags.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-red-700">Risk Flags</div>
                              <ul className="text-xs space-y-1">
                                {forecast.risk_flags.slice(0, 2).map((risk, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-red-500 mt-0.5">⚠</span>
                                    <span className="text-muted-foreground">{risk}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Support & Resistance Levels */}
                  {(result.geminiForecast.support_resistance.supports.length > 0 || result.geminiForecast.support_resistance.resistances.length > 0) && (
                    <div className="bg-muted/20 rounded-xl p-4 space-y-3">
                      <h4 className="font-medium text-sm">Key Levels</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {result.geminiForecast.support_resistance.supports.length > 0 && (
                          <div>
                            <h5 className="text-xs font-medium text-green-600 mb-2">Support Levels</h5>
                            <div className="space-y-1">
                              {result.geminiForecast.support_resistance.supports.map((support, index) => (
                                <div key={index} className="flex items-center justify-between bg-green-50/50 rounded p-2">
                                  <span className="text-sm font-mono">${support.level.toFixed(2)}</span>
                                  <div className="flex">
                                    {Array.from({ length: 5 }, (_, i) => (
                                      <div 
                                        key={i} 
                                        className={`w-2 h-2 rounded-full mr-1 ${
                                          i < support.strength ? 'bg-green-500' : 'bg-green-200'
                                        }`} 
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {result.geminiForecast.support_resistance.resistances.length > 0 && (
                          <div>
                            <h5 className="text-xs font-medium text-red-600 mb-2">Resistance Levels</h5>
                            <div className="space-y-1">
                              {result.geminiForecast.support_resistance.resistances.map((resistance, index) => (
                                <div key={index} className="flex items-center justify-between bg-red-50/50 rounded p-2">
                                  <span className="text-sm font-mono">${resistance.level.toFixed(2)}</span>
                                  <div className="flex">
                                    {Array.from({ length: 5 }, (_, i) => (
                                      <div 
                                        key={i} 
                                        className={`w-2 h-2 rounded-full mr-1 ${
                                          i < resistance.strength ? 'bg-red-500' : 'bg-red-200'
                                        }`} 
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Live Chart */}
          <div className="space-y-4">
            <div className="h-[500px] lg:h-[600px]">
              <ChartPanel
                defaultSymbol={symbol || chartSymbol}
                defaultInterval={chartInterval}
                onAnalyzeChart={handleAnalyzeChart}
                isAnalyzing={chartAnalysisLoading}
              />
            </div>

            {/* Chart Analysis Results */}
            {chartAnalysis && (
              <Card className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-purple-500/10 border-white/10 shadow-xl rounded-2xl animate-fade-in">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    Chart Analysis
                  </CardTitle>
                  {chartDataSource && (
                    <p className="text-xs text-muted-foreground">
                      Data source: {chartDataSource}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-foreground">
                    {chartAnalysis.split('\n').map((line, index) => (
                      <p key={index} className="mb-2 last:mb-0">
                        {line.startsWith('•') ? (
                          <span className="flex items-start gap-2">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>{line.substring(1).trim()}</span>
                          </span>
                        ) : (
                          line
                        )}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      
      {/* Disclaimer */}
      {result && (
        <div className="px-6 pb-6">
          <div className="max-w-7xl mx-auto">
            <Alert className="backdrop-blur-xl bg-yellow-500/10 border-yellow-500/20 rounded-xl">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important Disclaimer</AlertTitle>
              <AlertDescription>
                This is an AI-generated analysis for informational purposes only and is not financial advice. Markets are risky; do your own research.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="px-6 pb-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <Card className="backdrop-blur-xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-teal-500/10 border-white/10 shadow-2xl rounded-2xl">
              <CardHeader>
                <Skeleton className="h-8 w-64" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Advanced Prediction Loader */}
      <AdvancedPredictLoader
        isVisible={showAdvancedLoader}
        symbol={symbol.split(':')[1] || symbol}
        timeframe={timeframe}
        ready={analysisReady}
        onComplete={handleLoaderComplete}
      />
    </div>
  );
};

export default PredictPage;