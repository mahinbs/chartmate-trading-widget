
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Trash2, Eye, TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react';
import { usePredictions, Prediction } from '@/hooks/usePredictions';
import { formatDistanceToNow } from 'date-fns';

const PredictionsPage = () => {
  const { predictions, isLoading, deletePrediction } = usePredictions();
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);

  const formatCurrency = (value?: number) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatPercentage = (value?: number) => {
    if (!value) return 'N/A';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getDirectionIcon = (direction?: string) => {
    if (!direction) return null;
    return direction.toLowerCase().includes('up') || direction.toLowerCase().includes('bullish') ? 
      <TrendingUp className="h-4 w-4 text-green-500" /> : 
      <TrendingDown className="h-4 w-4 text-red-500" />;
  };

  const getDirectionColor = (direction?: string) => {
    if (!direction) return 'secondary';
    return direction.toLowerCase().includes('up') || direction.toLowerCase().includes('bullish') ? 
      'default' : 'destructive';
  };


  return (
    <div className="min-h-screen container mx-auto p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saved Predictions</h1>
          <p className="text-muted-foreground">
            View and manage your AI-generated predictions.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : predictions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No predictions found. Generate your first prediction!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {predictions.map((prediction) => (
              <Card key={prediction.id}>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{prediction.symbol}</h3>
                        <Badge variant={prediction.expected_move_direction?.toLowerCase().includes('up') ? 'default' : 'destructive'}>
                          {prediction.expected_move_direction}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Timeframe</p>
                          <p>{prediction.timeframe}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Expected Move</p>
                          <p>{formatPercentage(prediction.expected_move_percent)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Confidence</p>
                          <p>{prediction.confidence?.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Created</p>
                          <p>{new Date(prediction.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      {prediction.recommendation && (
                        <div>
                          <p className="text-muted-foreground text-sm">Recommendation</p>
                          <p className="text-sm">{prediction.recommendation}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPrediction(prediction)}
                      >
                        View Details
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deletePrediction(prediction.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {selectedPrediction && (
          <Dialog open={!!selectedPrediction} onOpenChange={() => setSelectedPrediction(null)}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Prediction Details: {selectedPrediction.symbol}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium">Current Price</p>
                    <p>{formatCurrency(selectedPrediction.current_price)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Expected Move</p>
                    <p>{formatPercentage(selectedPrediction.expected_move_percent)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Direction</p>
                    <Badge variant={selectedPrediction.expected_move_direction?.toLowerCase().includes('up') ? 'default' : 'destructive'}>
                      {selectedPrediction.expected_move_direction}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Confidence</p>
                    <p>{selectedPrediction.confidence?.toFixed(1)}%</p>
                  </div>
                </div>
                
                {selectedPrediction.rationale && (
                  <div>
                    <p className="text-sm font-medium">Rationale</p>
                    <p className="text-sm text-muted-foreground">{selectedPrediction.rationale}</p>
                  </div>
                )}
                
                {selectedPrediction.recommendation && (
                  <div>
                    <p className="text-sm font-medium">Recommendation</p>
                    <p className="text-sm text-muted-foreground">{selectedPrediction.recommendation}</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
};

export default PredictionsPage;
