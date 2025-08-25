import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Trash2, Clock, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  from: string;
  to: string;
  startPrice: number;
  endPrice: number;
  changeAbs: number;
  changePct: number;
  high: number;
  low: number;
  upCandles: number;
  downCandles: number;
  hitMinTarget: boolean | null;
  hitMaxTarget: boolean | null;
  ai: {
    summary: string;
  };
}

const PredictionsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [analysisStates, setAnalysisStates] = useState<Record<string, { loading: boolean; data: AnalysisData | null; error: string | null }>>({});

  useEffect(() => {
    fetchPredictions();
  }, []);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
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
        description: "Failed to load predictions",
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
      toast({
        title: "Success",
        description: "Prediction deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting prediction:', error);
      toast({
        title: "Error",
        description: "Failed to delete prediction",
        variant: "destructive"
      });
    }
  };

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation?.toLowerCase()) {
      case 'buy':
      case 'strong buy':
        return <TrendingUp className="h-4 w-4" />;
      case 'sell':
      case 'strong sell':
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation?.toLowerCase()) {
      case 'buy':
      case 'strong buy':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'sell':
      case 'strong sell':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    }
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

  const calculateExpectedTime = (timeframe: string, startTime: Date) => {
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

  const getStatusClasses = (timeRemaining: number) => {
    if (timeRemaining < 0) {
      return {
        text: 'text-red-500',
        progress: 'bg-red-500'
      };
    } else if (timeRemaining < 15 * 60 * 1000) { // Less than 15 minutes
      return {
        text: 'text-orange-500',
        progress: 'bg-orange-500'
      };
    } else {
      return {
        text: 'text-green-500',
        progress: 'bg-green-500'
      };
    }
  };

  const analyzePostPrediction = async (prediction: Prediction) => {
    const predictionId = prediction.id;
    
    setAnalysisStates(prev => ({
      ...prev,
      [predictionId]: { loading: true, data: null, error: null }
    }));

    try {
      const { data, error } = await supabase.functions.invoke('analyze-post-prediction', {
        body: {
          symbol: prediction.symbol,
          from: prediction.created_at,
          timeframe: prediction.timeframe,
          priceTargetMin: prediction.price_target_min,
          priceTargetMax: prediction.price_target_max
        }
      });

      if (error) throw error;

      setAnalysisStates(prev => ({
        ...prev,
        [predictionId]: { loading: false, data, error: null }
      }));

    } catch (error: any) {
      console.error('Analysis error:', error);
      setAnalysisStates(prev => ({
        ...prev,
        [predictionId]: { loading: false, data: null, error: error.message || 'Analysis failed' }
      }));
      
      toast({
        title: "Analysis Failed",
        description: error.message || "Unable to analyze stock movement",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" onClick={() => navigate('/predict')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
          <div className="text-center">Loading predictions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" onClick={() => navigate('/predict')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">My Predictions</h1>
        </div>

        {predictions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No predictions found. Generate your first prediction on the dashboard!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {predictions.map((prediction) => (
              <Card key={prediction.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{prediction.symbol}</CardTitle>
                      <Badge className={getRecommendationColor(prediction.recommendation)}>
                        {getRecommendationIcon(prediction.recommendation)}
                        {prediction.recommendation}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deletePrediction(prediction.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                   <CardDescription>
                     {prediction.timeframe}
                   </CardDescription>
                 </CardHeader>
                 <CardContent>
                   {/* Prediction Timeline */}
                   <div className="bg-muted/20 rounded-lg p-3 mb-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                       <div>
                         <p className="text-muted-foreground">Predicted at</p>
                         <p className="font-mono">{formatDateTime(new Date(prediction.created_at))}</p>
                       </div>
                       <div>
                         <p className="text-muted-foreground">Expected by</p>
                         <p className="font-mono">{formatDateTime(calculateExpectedTime(prediction.timeframe, new Date(prediction.created_at)))}</p>
                       </div>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Investment</p>
                      <p className="font-semibold">${prediction.investment?.toLocaleString() || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Current Price</p>
                      <p className="font-semibold">${prediction.current_price?.toFixed(2) || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Confidence</p>
                      <p className="font-semibold">{prediction.confidence?.toFixed(1) || 'N/A'}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Expected Move</p>
                      <p className={`font-semibold ${
                        prediction.expected_move_direction === 'up' ? 'text-green-500' : 
                        prediction.expected_move_direction === 'down' ? 'text-red-500' : 
                        'text-yellow-500'
                      }`}>
                        {prediction.expected_move_percent?.toFixed(1) || 'N/A'}%
                      </p>
                    </div>
                  </div>
                  
                  {(prediction.price_target_min || prediction.price_target_max) && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground mb-2">Price Targets</p>
                      <div className="flex gap-4 text-sm">
                        {prediction.price_target_min && (
                          <div>
                            <span className="text-muted-foreground">Min: </span>
                            <span className="font-semibold">${prediction.price_target_min.toFixed(2)}</span>
                          </div>
                        )}
                        {prediction.price_target_max && (
                          <div>
                            <span className="text-muted-foreground">Max: </span>
                            <span className="font-semibold">${prediction.price_target_max.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Countdown Timer */}
                  {(() => {
                    const startTime = new Date(prediction.created_at);
                    const expectedTime = calculateExpectedTime(prediction.timeframe, startTime);
                    const timeRemaining = expectedTime.getTime() - now.getTime();
                    const elapsedPercent = getElapsedPercent(startTime, expectedTime, now);
                    const statusClasses = getStatusClasses(timeRemaining);

                    return (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className={`text-sm font-medium ${statusClasses.text}`}>
                            {timeRemaining < 0 ? 'Overdue by' : 'Time remaining'}: {formatDuration(timeRemaining)}
                          </span>
                        </div>
                        <Progress 
                          value={elapsedPercent} 
                          className="h-2"
                        />
                      </div>
                    );
                  })()}

                  {/* Analysis Button */}
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      onClick={() => analyzePostPrediction(prediction)}
                      disabled={analysisStates[prediction.id]?.loading}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      {analysisStates[prediction.id]?.loading ? 'Analyzing...' : 'Analyze since prediction'}
                    </Button>
                  </div>

                  {/* Analysis Results */}
                  {analysisStates[prediction.id]?.data && (
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <h4 className="font-medium text-sm mb-2">Movement since prediction</h4>
                      <div className="text-xs text-muted-foreground mb-2">
                        From {formatDateTime(new Date(analysisStates[prediction.id]!.data!.from))} to {formatDateTime(new Date(analysisStates[prediction.id]!.data!.to))}
                      </div>
                      
                      <div className="space-y-2">
                        <div className={`text-sm font-medium ${analysisStates[prediction.id]!.data!.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Moved {analysisStates[prediction.id]!.data!.changePct >= 0 ? '+' : ''}{analysisStates[prediction.id]!.data!.changePct.toFixed(1)}% 
                          (from ${analysisStates[prediction.id]!.data!.startPrice.toFixed(2)} to ${analysisStates[prediction.id]!.data!.endPrice.toFixed(2)})
                        </div>
                        
                        <div className="text-xs space-y-1">
                          <div>High: ${analysisStates[prediction.id]!.data!.high.toFixed(2)} • Low: ${analysisStates[prediction.id]!.data!.low.toFixed(2)}</div>
                          <div>{analysisStates[prediction.id]!.data!.upCandles} up candles • {analysisStates[prediction.id]!.data!.downCandles} down candles</div>
                          {(analysisStates[prediction.id]!.data!.hitMinTarget !== null || analysisStates[prediction.id]!.data!.hitMaxTarget !== null) && (
                            <div>
                              {analysisStates[prediction.id]!.data!.hitMinTarget !== null && (
                                <span className={analysisStates[prediction.id]!.data!.hitMinTarget ? 'text-green-600' : 'text-red-600'}>
                                  Min target: {analysisStates[prediction.id]!.data!.hitMinTarget ? 'HIT' : 'Not reached'}
                                </span>
                              )}
                              {analysisStates[prediction.id]!.data!.hitMinTarget !== null && analysisStates[prediction.id]!.data!.hitMaxTarget !== null && ' • '}
                              {analysisStates[prediction.id]!.data!.hitMaxTarget !== null && (
                                <span className={analysisStates[prediction.id]!.data!.hitMaxTarget ? 'text-green-600' : 'text-red-600'}>
                                  Max target: {analysisStates[prediction.id]!.data!.hitMaxTarget ? 'HIT' : 'Not reached'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {analysisStates[prediction.id]!.data!.ai.summary && (
                          <div className="text-xs italic text-muted-foreground mt-2 pt-2 border-t">
                            💡 {analysisStates[prediction.id]!.data!.ai.summary}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {analysisStates[prediction.id]?.error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-red-600 text-sm">
                        {analysisStates[prediction.id]!.error}
                      </div>
                    </div>
                  )}
                 </CardContent>
               </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictionsPage;