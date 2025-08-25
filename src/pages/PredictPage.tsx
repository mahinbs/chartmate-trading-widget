import { useState } from "react";
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
import TradingViewWidget from "@/components/TradingViewWidget";
import { AdvancedPredictLoader } from "@/components/AdvancedPredictLoader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, BrainCircuit, LineChart, ChevronDown, DollarSign, LogOut } from "lucide-react";

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
  // New structured fields
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
  
  const { signOut, user } = useAuth();

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
          timeframe
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="p-6 animate-fade-in">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1" />
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
          </div>

          {/* Right Column - Live Chart */}
          <div className="space-y-4">
            <Card className="backdrop-blur-xl bg-gradient-to-br from-slate-500/10 via-gray-500/10 to-zinc-500/10 border-white/10 shadow-2xl rounded-2xl overflow-hidden animate-fade-in">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold">
                    Live Chart {symbol && `- ${symbol.split(':')[1] || symbol}`}
                  </CardTitle>
                  
                  {/* Chart Interval Toggle */}
                  <ToggleGroup 
                    type="single" 
                    value={chartInterval} 
                    onValueChange={setChartInterval}
                    className="flex gap-1"
                  >
                    <ToggleGroupItem value="1" size="sm" className="text-xs px-2 py-1">1m</ToggleGroupItem>
                    <ToggleGroupItem value="5" size="sm" className="text-xs px-2 py-1">5m</ToggleGroupItem>
                    <ToggleGroupItem value="15" size="sm" className="text-xs px-2 py-1">15m</ToggleGroupItem>
                    <ToggleGroupItem value="60" size="sm" className="text-xs px-2 py-1">1h</ToggleGroupItem>
                    <ToggleGroupItem value="D" size="sm" className="text-xs px-2 py-1">1d</ToggleGroupItem>
                    <ToggleGroupItem value="W" size="sm" className="text-xs px-2 py-1">1w</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                <div className="h-[500px] lg:h-[600px] rounded-b-2xl overflow-hidden">
                  {symbol ? (
                    <TradingViewWidget 
                      symbol={symbol} 
                      interval={getChartIntervalMapping(chartInterval)} 
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-muted/20 rounded-b-2xl">
                      <div className="text-center space-y-2">
                        <LineChart className="h-12 w-12 mx-auto text-muted-foreground/50" />
                        <p className="text-muted-foreground">Select a symbol to view the live chart</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
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