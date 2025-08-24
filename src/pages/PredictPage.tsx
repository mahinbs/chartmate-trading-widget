import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SymbolSearch } from "@/components/SymbolSearch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import TradingViewWidget from "@/components/TradingViewWidget";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);

  const handlePredict = async () => {
    if (!symbol || !investment || !timeframe) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
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
        toast.error("Failed to get analysis. Please try again.");
        return;
      }

      setResult(data);
      toast.success("Analysis generated successfully!");
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred while getting the prediction");
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Market Prediction</h1>
          <p className="text-muted-foreground">Get AI-powered analysis and predictions for any stock symbol</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Prediction Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <SymbolSearch
                value={symbol}
                onValueChange={setSymbol}
                placeholder="Search stocks, crypto, forex, commodities..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="investment">Investment Amount ($)</Label>
              <Input
                id="investment"
                type="number"
                placeholder="e.g., 1000"
                value={investment}
                onChange={(e) => setInvestment(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeframe">Prediction Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timeframe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5m">5 Minutes</SelectItem>
                  <SelectItem value="15m">15 Minutes</SelectItem>
                  <SelectItem value="30m">30 Minutes</SelectItem>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="2h">2 Hours</SelectItem>
                  <SelectItem value="4h">4 Hours</SelectItem>
                  <SelectItem value="1d">1 Day</SelectItem>
                  <SelectItem value="1w">1 Week</SelectItem>
                  <SelectItem value="1mo">1 Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handlePredict} 
              disabled={loading} 
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Generate Prediction"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Chart Panel */}
        {symbol && (
          <Card>
            <CardHeader>
              <CardTitle>Live Chart - {symbol.split(':')[1] || symbol}</CardTitle>
            </CardHeader>
            <CardContent className="h-[500px] p-0">
              <TradingViewWidget symbol={symbol} interval="15" />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Analysis Results */}
      {result && (
        <div className="space-y-6 animate-fade-in">
          {/* Decision Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                {getRecommendationIcon(result.recommendation)}
                <span className={getRecommendationColor(result.recommendation)}>
                  {result.recommendation?.charAt(0).toUpperCase() + result.recommendation?.slice(1) || "Analysis"} - {result.symbol}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Current Price */}
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Current Price</p>
                  <Badge 
                    variant="outline" 
                    className={`${getPriceChangeColor(result.changePercent)} border text-lg px-4 py-2`}
                  >
                    ${result.currentPrice.toFixed(2)}
                  </Badge>
                  <p className="text-sm mt-1">
                    {result.changePercent > 0 ? '+' : ''}{result.changePercent.toFixed(2)}% today
                  </p>
                </div>

                {/* Confidence */}
                {result.confidence !== undefined && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">Confidence Level</p>
                    <div className="space-y-2">
                      <Progress value={result.confidence} className="h-3" />
                      <Badge variant="secondary">{result.confidence}%</Badge>
                    </div>
                  </div>
                )}

                {/* Expected Move */}
                {result.expectedMove && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Expected Move ({result.timeframe})</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      {result.expectedMove.direction === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
                      {result.expectedMove.direction === "down" && <TrendingDown className="h-4 w-4 text-red-600" />}
                      {result.expectedMove.direction === "flat" && <Minus className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-semibold">
                        {result.expectedMove.percent ? `${result.expectedMove.percent > 0 ? '+' : ''}${result.expectedMove.percent.toFixed(1)}%` : 'TBD'}
                      </span>
                    </div>
                    {result.expectedMove.priceTarget && (
                      <div className="flex gap-2 mt-2 justify-center">
                        <Badge variant="outline" className="text-xs">
                          ${result.expectedMove.priceTarget.min.toFixed(2)} - ${result.expectedMove.priceTarget.max.toFixed(2)}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Investment Impact */}
              {result.expectedMove?.percent && (
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Investment Impact</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span>Investment:</span>
                      <span className="font-mono">${investment}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. P/L:</span>
                      <span className={`font-mono ${calculatePnL(parseFloat(investment), result.expectedMove.percent)! >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {calculatePnL(parseFloat(investment), result.expectedMove.percent)! >= 0 ? '+' : ''}${calculatePnL(parseFloat(investment), result.expectedMove.percent)!.toFixed(2)} est.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart Patterns & Key Levels */}
          {(result.patterns?.length || result.keyLevels?.support?.length || result.keyLevels?.resistance?.length) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Chart Patterns */}
              {result.patterns?.length && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Chart Patterns</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {result.patterns.map((pattern, index) => (
                        <Badge key={index} variant="secondary">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Key Levels */}
              {(result.keyLevels?.support?.length || result.keyLevels?.resistance?.length) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Key Levels</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.keyLevels?.support?.length && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Support Levels</p>
                        <div className="flex flex-wrap gap-2">
                          {result.keyLevels.support.map((level, index) => (
                            <Badge key={index} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              ${level.toFixed(2)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.keyLevels?.resistance?.length && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Resistance Levels</p>
                        <div className="flex flex-wrap gap-2">
                          {result.keyLevels.resistance.map((level, index) => (
                            <Badge key={index} variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              ${level.toFixed(2)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Stock Data & Investment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Market Data & Investment Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground">Current Stock Data</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Current Price:</span>
                      <span className="font-mono">${result.stockData.currentPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Open:</span>
                      <span className="font-mono">${result.stockData.openPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>High:</span>
                      <span className="font-mono">${result.stockData.highPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Low:</span>
                      <span className="font-mono">${result.stockData.lowPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Previous Close:</span>
                      <span className="font-mono">${result.stockData.previousClose.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground">Investment Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Investment:</span>
                      <span className="font-mono">${investment}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Timeframe:</span>
                      <Badge variant="secondary">{result.timeframe}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Shares (~):</span>
                      <span className="font-mono">{(parseFloat(investment) / result.currentPrice).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>AI Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={result.analysis}
                readOnly
                className="min-h-[300px] resize-none bg-muted/50"
              />
              
              {/* Disclaimer */}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  This is an AI-generated analysis for informational purposes only and is not financial advice. Markets are risky; do your own research.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6">
          <Card>
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
      )}
    </div>
  );
};

export default PredictPage;