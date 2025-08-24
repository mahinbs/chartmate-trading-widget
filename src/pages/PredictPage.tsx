import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import TradingViewWidget from "@/components/TradingViewWidget";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

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
          symbol: symbol.toUpperCase(),
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
              <Label htmlFor="symbol">Stock Symbol</Label>
              <Input
                id="symbol"
                placeholder="e.g., AAPL, GOOGL, TSLA"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
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
                  <SelectItem value="30m">30 Minutes</SelectItem>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="2h">2 Hours</SelectItem>
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
              <CardTitle>Live Chart - {symbol}</CardTitle>
            </CardHeader>
            <CardContent>
              <TradingViewWidget symbol={`NASDAQ:${symbol}`} interval="15" />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Analysis Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getPriceChangeIcon(result.changePercent)}
              {result.symbol} Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{result.symbol} Analysis</h3>
              <Badge 
                variant="outline" 
                className={`${getPriceChangeColor(result.changePercent)} border`}
              >
                {getPriceChangeIcon(result.changePercent)}
                ${result.currentPrice.toFixed(2)} ({result.changePercent > 0 ? '+' : ''}{result.changePercent.toFixed(2)}%)
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">Current Stock Data</h4>
                <div className="space-y-1 text-sm">
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

              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">Investment Details</h4>
                <div className="space-y-1 text-sm">
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

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">OpenAI Analysis</h4>
              <Textarea
                value={result.analysis}
                readOnly
                className="min-h-[300px] resize-none bg-muted/50"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PredictPage;