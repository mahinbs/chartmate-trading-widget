import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle, 
  CheckCircle,
  RefreshCw,
  Minus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface MarketConditions {
  timestamp: string;
  vix: {
    value: number;
    status: string;
    interpretation: string;
  };
  indices: Array<{
    name: string;
    price: number;
    change: number;
    changePercent: number;
  }>;
  sentiment: {
    overall: 'bullish' | 'bearish' | 'neutral';
    score: number;
    description: string;
    emoji: string;
  };
  recommendation: {
    level: 'favorable' | 'caution' | 'avoid';
    message: string;
    isSafeToTrade: boolean;
  };
  newsImpact: {
    score: string;
    description: string;
  };
}

export function MarketConditionsDashboard() {
  const [conditions, setConditions] = useState<MarketConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchConditions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('get-market-conditions');
      
      if (error) throw error;
      
      setConditions(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching market conditions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConditions();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchConditions, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !conditions) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!conditions) return null;

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'text-green-600';
      case 'bearish': return 'text-red-600';
      default: return 'text-yellow-600';
    }
  };

  const getSentimentBg = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'bg-green-500/10 border-green-500/30';
      case 'bearish': return 'bg-red-500/10 border-red-500/30';
      default: return 'bg-yellow-500/10 border-yellow-500/30';
    }
  };

  const getRecommendationColor = (level: string) => {
    switch (level) {
      case 'favorable': return 'bg-green-600';
      case 'caution': return 'bg-yellow-600';
      default: return 'bg-red-600';
    }
  };

  const getVixColor = (status: string) => {
    switch (status) {
      case 'low': return 'text-green-600';
      case 'normal': return 'text-blue-600';
      case 'elevated': return 'text-orange-600';
      default: return 'text-red-600';
    }
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <CardTitle className="text-xl">Market Conditions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Live market analysis · Updated {lastUpdated?.toLocaleTimeString()}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConditions}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        
        {/* Is Today Safe to Trade? */}
        <Alert className={cn(
          "border-2",
          conditions.recommendation.isSafeToTrade 
            ? "border-green-500 bg-green-500/10" 
            : "border-orange-500 bg-orange-500/10"
        )}>
          {conditions.recommendation.isSafeToTrade ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-orange-600" />
          )}
          <AlertDescription>
            <p className="font-bold text-lg mb-1">
              {conditions.recommendation.isSafeToTrade 
                ? "✅ Good Time to Trade" 
                : "⚠️ Trade with Caution"}
            </p>
            <p className="text-sm">{conditions.recommendation.message}</p>
          </AlertDescription>
        </Alert>

        {/* Market Sentiment */}
        <div className={cn(
          "p-4 rounded-lg border-2",
          getSentimentBg(conditions.sentiment.overall)
        )}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              {conditions.sentiment.emoji} Market Sentiment
            </h3>
            <Badge className={getRecommendationColor(conditions.recommendation.level)}>
              {conditions.recommendation.level.toUpperCase()}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Overall:</span>
              <span className={cn("font-bold text-lg capitalize", getSentimentColor(conditions.sentiment.overall))}>
                {conditions.sentiment.overall}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{conditions.sentiment.description}</p>
          </div>
        </div>

        {/* Market Indices */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Major Indices
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {conditions.indices.map((index) => (
              <div key={index.name} className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">{index.name}</p>
                <p className="font-bold">{index.price.toFixed(2)}</p>
                <div className="flex items-center gap-1 mt-1">
                  {index.changePercent >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-600" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-600" />
                  )}
                  <span className={cn(
                    "text-xs font-medium",
                    index.changePercent >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {index.changePercent >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VIX (Volatility Index) */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-muted/30 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">VIX (Fear Index)</h3>
              <Badge variant="outline" className={cn("font-bold", getVixColor(conditions.vix.status))}>
                {conditions.vix.status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-3xl font-bold mb-1">{conditions.vix.value}</p>
            <p className="text-xs text-muted-foreground">{conditions.vix.interpretation}</p>
            
            {/* VIX Guide */}
            <div className="mt-3 pt-3 border-t space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{'< 15'}</span>
                <span className="text-green-600 font-medium">Low Fear</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">15-20</span>
                <span className="text-blue-600 font-medium">Normal</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">20-30</span>
                <span className="text-orange-600 font-medium">Elevated</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{'>30'}</span>
                <span className="text-red-600 font-medium">High Fear</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted/30 rounded-lg border">
            <h3 className="font-semibold text-sm mb-2">News Impact</h3>
            <Badge variant="outline" className="mb-2">
              {conditions.newsImpact.score.toUpperCase()}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {conditions.newsImpact.description}
            </p>
            
            {/* Quick Tips */}
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-semibold mb-2">💡 Trading Tips:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {conditions.recommendation.isSafeToTrade ? (
                  <>
                    <li>• Good risk/reward environment</li>
                    <li>• Consider standard position sizing</li>
                    <li>• Follow normal stop-loss rules</li>
                  </>
                ) : (
                  <>
                    <li>• Reduce position sizes</li>
                    <li>• Use tighter stop-losses</li>
                    <li>• Consider waiting for clarity</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-sm">
          <p className="font-semibold mb-1">Summary:</p>
          <p className="text-muted-foreground">
            Market is showing <strong className={getSentimentColor(conditions.sentiment.overall)}>
              {conditions.sentiment.overall}
            </strong> sentiment with VIX at <strong>{conditions.vix.value}</strong>. 
            {conditions.recommendation.isSafeToTrade 
              ? " Conditions are favorable for trading with normal risk management."
              : " Exercise caution with reduced position sizes and tighter stops."}
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
