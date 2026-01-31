import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActiveTradeCard } from "@/components/tracking/ActiveTradeCard";
import { ActionSignal } from "@/components/prediction/ActionSignal";
import { PerformanceDashboard } from "@/components/performance/PerformanceDashboard";
import { tradeTrackingService, ActiveTrade } from "@/services/tradeTrackingService";
import { RefreshCw, TrendingUp, Activity, CheckCircle, Bell, BarChart3, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ActiveTradesPage() {
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadTrades = async () => {
    try {
      const [activeResult, completedResult] = await Promise.all([
        tradeTrackingService.getActiveTrades(),
        tradeTrackingService.getCompletedTrades(20)
      ]);

      if (activeResult.data) {
        console.log('📊 Loaded active trades:', activeResult.data.length);
        // Force new array reference to trigger React re-render
        setActiveTrades([...activeResult.data]);
      }

      if (completedResult.data) {
        console.log('✅ Loaded completed trades:', completedResult.data.length);
        // Force new array reference to trigger React re-render
        setCompletedTrades([...completedResult.data]);
      }
    } catch (error) {
      console.error('Error loading trades:', error);
      toast({
        title: "Error",
        description: "Failed to load trades",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTrades();
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Trade data updated"
    });
  };

  const handleCancelTrade = async (tradeId: string) => {
    if (!confirm("Are you sure you want to cancel this trade tracking? This will not close the position, only stop tracking.")) {
      return;
    }

    const result = await tradeTrackingService.cancelTrade(tradeId);
    
    if (result.error) {
      toast({
        title: "Error",
        description: "Failed to cancel trade",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Trade Cancelled",
        description: "Trade tracking has been stopped"
      });
      await loadTrades();
    }
  };

  const handleCloseTrade = async (tradeId: string, currentPrice: number) => {
    if (!confirm("Are you sure you want to close this trade? This will mark it as completed with current P&L.")) {
      return;
    }

    const result = await tradeTrackingService.closeTrade(tradeId, currentPrice);
    
    if (result.error) {
      toast({
        title: "Error",
        description: "Failed to close trade",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Trade Closed",
        description: "Trade has been closed successfully"
      });
      await loadTrades();
    }
  };

  useEffect(() => {
    loadTrades();

    // Subscribe to real-time updates
    const subscription = tradeTrackingService.subscribeToTrades((payload) => {
      console.log('🔄 Trade updated:', payload);
      // Force reload trades immediately
      loadTrades();
    });

    // Subscribe to notifications
    const notifSubscription = tradeTrackingService.subscribeToNotifications((payload) => {
      const notification = payload.new;
      toast({
        title: notification.title,
        description: notification.message
      });
    });

    // Auto-refresh prices every 30 seconds (faster for better UX)
    const priceRefreshInterval = setInterval(async () => {
      console.log('🔄 Auto-refreshing trade prices...');
      const result = await tradeTrackingService.updateAllPrices();
      if (!result.error) {
        // Force immediate reload after price update
        await loadTrades();
      }
    }, 30000); // 30 seconds

    return () => {
      subscription.unsubscribe();
      notifSubscription.unsubscribe();
      clearInterval(priceRefreshInterval);
    };
  }, []); // Remove dependency to avoid re-creating subscriptions

  const calculatePortfolioStats = () => {
    // Active trades
    const activeInvested = activeTrades.reduce((sum, t) => sum + t.investmentAmount, 0);
    const activePnL = activeTrades.reduce((sum, t) => sum + (t.currentPnl || 0), 0);
    
    // Completed trades
    const completedInvested = completedTrades.reduce((sum, t) => sum + (t.investmentAmount || 0), 0);
    const completedPnL = completedTrades.reduce((sum, t) => sum + (t.actualPnl || 0), 0);
    
    // Totals
    const totalInvested = activeInvested + completedInvested;
    const totalPnL = activePnL + completedPnL;
    const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return { 
      totalInvested, 
      totalPnL, 
      totalPnLPercentage,
      activeInvested,
      activePnL,
      completedInvested,
      completedPnL
    };
  };

  const stats = calculatePortfolioStats();

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Active Trades</h1>
          <p className="text-muted-foreground">Track your live positions in real-time</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate('/home')}
          >
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => navigate('/predict')}>
            <TrendingUp className="h-4 w-4 mr-2" />
            New Prediction
          </Button>
        </div>
      </div>

      {/* Portfolio Summary */}
      {activeTrades.length > 0 && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Invested
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">${stats.totalInvested.toFixed(2)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total P&L
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Portfolio Return
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${stats.totalPnLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.totalPnLPercentage >= 0 ? '+' : ''}{stats.totalPnLPercentage.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trades Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="active">
            <Activity className="h-4 w-4 mr-2" />
            Active ({activeTrades.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            <CheckCircle className="h-4 w-4 mr-2" />
            Completed ({completedTrades.length})
          </TabsTrigger>
          <TabsTrigger value="performance">
            <BarChart3 className="h-4 w-4 mr-2" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* Active Trades */}
        <TabsContent value="active" className="space-y-4 mt-6">
          {activeTrades.length === 0 ? (
            <Alert>
              <Bell className="h-4 w-4" />
              <AlertDescription>
                No active trades. Start by making a <a href="/predict" className="underline font-medium">new prediction</a> and clicking "Start Tracking".
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {activeTrades.map((trade) => (
                <ActiveTradeCard
                  key={`${trade.id}-${trade.lastPriceUpdate || trade.entryTime}`}
                  trade={trade}
                  onCancel={handleCancelTrade}
                  onClose={(id) => {
                    const tradeData = activeTrades.find(t => t.id === id);
                    if (tradeData) {
                      handleCloseTrade(id, tradeData.currentPrice || tradeData.entryPrice);
                    }
                  }}
                  onViewDetails={(id) => {
                    // Open trade in new tab with TradingView chart
                    const tradeData = activeTrades.find(t => t.id === id);
                    if (tradeData) {
                      window.open(`https://www.tradingview.com/chart/?symbol=${tradeData.symbol}`, '_blank');
                    }
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Completed Trades */}
        <TabsContent value="completed" className="space-y-4 mt-6">
          {completedTrades.length === 0 ? (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                No completed trades yet. Tracked trades will appear here after they finish.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {completedTrades.map((trade) => (
                <Card key={trade.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold">{trade.symbol}</h3>
                        <ActionSignal 
                          action={trade.action} 
                          confidence={trade.confidence || 0} 
                          size="sm"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {new Date(trade.entryTime).toLocaleDateString()} - {trade.exitTime && new Date(trade.exitTime).toLocaleDateString()}
                      </p>
                      <div className="mt-2 text-sm text-muted-foreground">
                        <p>Invested: <span className="font-semibold">${trade.investmentAmount?.toFixed(2) || '0.00'}</span></p>
                        <p>Entry: ${trade.entryPrice?.toFixed(2)} | Exit: ${trade.exitPrice?.toFixed(2) || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${(trade.actualPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(trade.actualPnl || 0) >= 0 ? '+' : ''}${trade.actualPnl?.toFixed(2) || '0.00'}
                      </p>
                      <p className={`text-sm font-medium ${(trade.actualPnlPercentage || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(trade.actualPnlPercentage || 0) >= 0 ? '+' : ''}{trade.actualPnlPercentage?.toFixed(2) || '0.00'}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {trade.exitReason?.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="secondary">
                      {trade.shares} shares
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Performance Tab - Failure Transparency & Stats */}
        <TabsContent value="performance" className="space-y-6 mt-6">
          <PerformanceDashboard />
        </TabsContent>
      </Tabs>

    </div>
  );
}
