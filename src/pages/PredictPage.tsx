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
  prediction: "bullish" | "bearish" | "neutral";
  confidence: number;
  timeframe: string;
  analysis: string;
  technicalIndicators: {
    sma: number;
    rsi: number;
    macd: number;
  };
  priceTargets: {
    target: number;
    support: number;
    resistance: number;
  };
}

const PredictPage = () => {
  const [symbol, setSymbol] = useState("");
  const [investment, setInvestment] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);

  const handlePredict = async () => {
    if (!symbol || !investment || !timeframe) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    setPrediction(null);

    try {
      const { data, error } = await supabase.functions.invoke('predict-movement', {
        body: {
          symbol: symbol.toUpperCase(),
          investment: parseFloat(investment),
          timeframe
        }
      });

      if (error) {
        console.error("Prediction error:", error);
        toast.error("Failed to get prediction. Please try again.");
        return;
      }

      setPrediction(data);
      toast.success("Prediction generated successfully!");
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred while getting the prediction");
    } finally {
      setLoading(false);
    }
  };

  const getPredictionIcon = (prediction: string) => {
    switch (prediction) {
      case "bullish":
        return <TrendingUp className="h-5 w-5 text-trading-green" />;
      case "bearish":
        return <TrendingDown className="h-5 w-5 text-trading-red" />;
      default:
        return <Minus className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getPredictionColor = (prediction: string) => {
    switch (prediction) {
      case "bullish":
        return "bg-trading-green";
      case "bearish":
        return "bg-trading-red";
      default:
        return "bg-muted";
    }
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

      {/* Prediction Results */}
      {prediction && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getPredictionIcon(prediction.prediction)}
                Prediction Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={getPredictionColor(prediction.prediction)}>
                  {prediction.prediction.toUpperCase()}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Confidence: {(prediction.confidence * 100).toFixed(1)}%
                </span>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Technical Indicators</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">SMA:</span>
                    <div className="font-mono">${prediction.technicalIndicators.sma.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RSI:</span>
                    <div className="font-mono">{prediction.technicalIndicators.rsi.toFixed(1)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">MACD:</span>
                    <div className="font-mono">{prediction.technicalIndicators.macd.toFixed(3)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Price Targets</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Target:</span>
                    <div className="font-mono text-trading-green">${prediction.priceTargets.target.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Support:</span>
                    <div className="font-mono text-trading-red">${prediction.priceTargets.support.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Resistance:</span>
                    <div className="font-mono text-trading-blue">${prediction.priceTargets.resistance.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={prediction.analysis}
                readOnly
                className="min-h-[300px] resize-none"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PredictPage;