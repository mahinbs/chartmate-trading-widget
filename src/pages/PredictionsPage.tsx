
import { useState } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
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

  if (isLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="container mx-auto p-6">
            <div className="space-y-6">
              <div>
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-96" />
              </div>
              <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="container mx-auto p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Saved Predictions</h1>
              <p className="text-muted-foreground">
                View and manage your AI-generated market predictions
              </p>
            </div>

            {predictions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No predictions saved yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Generate predictions from the AI Predict page to see them here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {predictions.map((prediction) => (
                  <Card key={prediction.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <CardTitle className="text-xl">{prediction.symbol}</CardTitle>
                          <Badge variant="outline">{prediction.timeframe}</Badge>
                          {prediction.expected_move_direction && (
                            <Badge variant={getDirectionColor(prediction.expected_move_direction)}>
                              <div className="flex items-center space-x-1">
                                {getDirectionIcon(prediction.expected_move_direction)}
                                <span>{prediction.expected_move_direction}</span>
                              </div>
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setSelectedPrediction(prediction)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>
                                  {prediction.symbol} - {prediction.timeframe} Prediction
                                </DialogTitle>
                                <DialogDescription>
                                  Generated {formatDistanceToNow(new Date(prediction.created_at))} ago
                                </DialogDescription>
                              </DialogHeader>
                              
                              <div className="space-y-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  {prediction.current_price && (
                                    <div className="text-center">
                                      <p className="text-sm text-muted-foreground">Current Price</p>
                                      <p className="text-lg font-semibold">{formatCurrency(prediction.current_price)}</p>
                                    </div>
                                  )}
                                  {prediction.expected_move_percent && (
                                    <div className="text-center">
                                      <p className="text-sm text-muted-foreground">Expected Move</p>
                                      <p className="text-lg font-semibold">{formatPercentage(prediction.expected_move_percent)}</p>
                                    </div>
                                  )}
                                  {prediction.confidence && (
                                    <div className="text-center">
                                      <p className="text-sm text-muted-foreground">Confidence</p>
                                      <p className="text-lg font-semibold">{prediction.confidence.toFixed(1)}%</p>
                                    </div>
                                  )}
                                  {prediction.investment && (
                                    <div className="text-center">
                                      <p className="text-sm text-muted-foreground">Investment</p>
                                      <p className="text-lg font-semibold">{formatCurrency(prediction.investment)}</p>
                                    </div>
                                  )}
                                </div>

                                {prediction.rationale && (
                                  <div>
                                    <h4 className="font-semibold mb-2">Analysis Rationale</h4>
                                    <p className="text-sm text-muted-foreground">{prediction.rationale}</p>
                                  </div>
                                )}

                                {prediction.recommendation && (
                                  <div>
                                    <h4 className="font-semibold mb-2">Recommendation</h4>
                                    <p className="text-sm">{prediction.recommendation}</p>
                                  </div>
                                )}

                                <div className="grid md:grid-cols-2 gap-4">
                                  {prediction.risks && Object.keys(prediction.risks).length > 0 && (
                                    <div>
                                      <h4 className="font-semibold mb-2 text-red-600">Risks</h4>
                                      <div className="text-sm space-y-1">
                                        {Array.isArray(prediction.risks) ? 
                                          prediction.risks.map((risk: string, index: number) => (
                                            <p key={index}>• {risk}</p>
                                          )) :
                                          <pre className="whitespace-pre-wrap">{JSON.stringify(prediction.risks, null, 2)}</pre>
                                        }
                                      </div>
                                    </div>
                                  )}

                                  {prediction.opportunities && Object.keys(prediction.opportunities).length > 0 && (
                                    <div>
                                      <h4 className="font-semibold mb-2 text-green-600">Opportunities</h4>
                                      <div className="text-sm space-y-1">
                                        {Array.isArray(prediction.opportunities) ? 
                                          prediction.opportunities.map((opp: string, index: number) => (
                                            <p key={index}>• {opp}</p>
                                          )) :
                                          <pre className="whitespace-pre-wrap">{JSON.stringify(prediction.opportunities, null, 2)}</pre>
                                        }
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Prediction</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this prediction for {prediction.symbol}? 
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deletePrediction(prediction.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      
                      <CardDescription className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDistanceToNow(new Date(prediction.created_at))} ago</span>
                        </div>
                        {prediction.confidence && (
                          <span>Confidence: {prediction.confidence.toFixed(1)}%</span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-4">
                          {prediction.current_price && (
                            <div className="flex items-center space-x-1">
                              <DollarSign className="h-3 w-3" />
                              <span>Current: {formatCurrency(prediction.current_price)}</span>
                            </div>
                          )}
                          {prediction.expected_move_percent && (
                            <span>
                              Expected: {formatPercentage(prediction.expected_move_percent)}
                            </span>
                          )}
                        </div>
                        {prediction.price_target_min && prediction.price_target_max && (
                          <span>
                            Target: {formatCurrency(prediction.price_target_min)} - {formatCurrency(prediction.price_target_max)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default PredictionsPage;
