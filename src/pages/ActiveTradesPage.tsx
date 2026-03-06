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
import { getTradingViewSymbol, isUsdDenominatedSymbol } from "@/lib/tradingview-symbols";
import { RefreshCw, TrendingUp, Activity, CheckCircle, Bell, BarChart3, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ActiveTradesPage() {
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<"INR" | "USD">("INR");
  const [usdPerInr, setUsdPerInr] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
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

  const loadFxRate = async () => {
    try {
      setFxLoading(true);
      setFxError(null);
      const res = await fetch(
        "https://api.frankfurter.app/latest?from=INR&to=USD",
      );
      if (!res.ok) throw new Error("Failed to load FX rate");
      const json = await res.json();
      const rate = json?.rates?.USD;
      if (typeof rate === "number" && rate > 0) {
        setUsdPerInr(rate);
      } else {
        throw new Error("Invalid FX rate");
      }
    } catch (e: any) {
      console.error("FX load error", e);
      setFxError(e?.message || "Failed to load USD/INR rate");
    } finally {
      setFxLoading(false);
    }
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
    if (!confirm("Close this trade in the app only (no order placed on broker)?")) {
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
        description: "Trade has been closed in the app"
      });
      await loadTrades();
    }
  };

  const handleSquareOff = async (tradeId: string) => {
    const result = await tradeTrackingService.squareOff(tradeId);
    if (result.error) {
      toast({
        title: "Square Off Failed",
        description: result.error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Squared Off",
        description: `Exit order placed${result.exitOrderId ? ` (Order ID: ${result.exitOrderId})` : ""}. Position closed.`,
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

    return () => {
      subscription.unsubscribe();
      notifSubscription.unsubscribe();
    };
  }, []); // Remove dependency to avoid re-creating subscriptions

  useEffect(() => {
    const hasUsdAssets =
      activeTrades.some((t) => isUsdDenominatedSymbol(t.symbol)) ||
      completedTrades.some((t) => isUsdDenominatedSymbol(t.symbol));

    if (usdPerInr == null && !fxLoading && hasUsdAssets) {
      loadFxRate();
    }
  }, [usdPerInr, fxLoading, activeTrades, completedTrades]);

  // Binance WebSocket for crypto symbols (BTC-USD, etc.) so prices match TradingView's Binance feed
  useEffect(() => {
    // Collect all USD-denominated symbols we are tracking (crypto/US stocks)
    const cryptoSymbols = Array.from(
      new Set(
        activeTrades
          .filter((t) => isUsdDenominatedSymbol(t.symbol))
          .map((t) => t.symbol.toUpperCase())
      )
    );

    if (cryptoSymbols.length === 0) {
      return;
    }

    const toBinanceSymbol = (symbol: string) => {
      // BTC-USD -> BTCUSDT, ETH-USD -> ETHUSDT, etc.
      const base = symbol.replace(/[^A-Z]/gi, "").replace(/USD$/i, "");
      return `${base}USDT`.toUpperCase();
    };

    const streams = cryptoSymbols.map((s) => `${toBinanceSymbol(s).toLowerCase()}@trade`);
    const url = `wss://stream.binance.com:9443/stream?streams=${streams.join("/")}`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("⚡ Binance WS connected for", cryptoSymbols.join(", "));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const tick = payload.data || payload;
          const binanceSymbol: string = (tick.s || tick.symbol || "").toUpperCase();
          const price: number = parseFloat(tick.p || tick.c || tick.price);
          if (!binanceSymbol || !price || Number.isNaN(price)) return;

          const fromBinanceToInternal = (sym: string) =>
            `${sym.replace(/USDT$/i, "")}-USD`;
          const internalSymbol = fromBinanceToInternal(binanceSymbol).toUpperCase();

          setActiveTrades((prev) =>
            prev.map((t) => {
              if (t.symbol.toUpperCase() !== internalSymbol) return t;
              const pnl = (price - t.entryPrice) * t.shares * (t.action === "SELL" ? -1 : 1);
              const pnlPct = (pnl / t.investmentAmount) * 100;
              return {
                ...t,
                currentPrice: price,
                currentPnl: pnl,
                currentPnlPercentage: pnlPct,
                lastPriceUpdate: new Date().toISOString(),
              };
            })
          );
        } catch {
          // ignore malformed ticks
        }
      };

      ws.onerror = () => {
        console.warn("Binance WS error");
        ws?.close();
      };
    } catch (e) {
      console.error("Binance WS connect error", e);
    }

    return () => {
      ws?.close();
    };
  }, [activeTrades.map((t) => t.symbol).join(",")]);

  const convertAmount = (value: number, symbol?: string) => {
    const assetCurrency = symbol ? (isUsdDenominatedSymbol(symbol) ? "USD" : "INR") : "INR";
    if (displayCurrency === assetCurrency) return value;
    if (displayCurrency === "USD" && assetCurrency === "INR" && usdPerInr && usdPerInr > 0) return value * usdPerInr;
    if (displayCurrency === "INR" && assetCurrency === "USD" && usdPerInr && usdPerInr > 0) return value / usdPerInr;
    return value;
  };

  const calculatePortfolioStats = () => {
    // Top summary should reflect only ACTIVE portfolio,
    // so completed trades do not distort current P&L.
    const activeInvested = activeTrades.reduce((sum, t) => sum + convertAmount(t.investmentAmount, t.symbol), 0);
    const activePnL = activeTrades.reduce((sum, t) => sum + convertAmount(t.currentPnl ?? 0, t.symbol), 0);
    const totalInvested = activeInvested;
    const totalPnL = activePnL;
    const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    return { totalInvested, totalPnL, totalPnLPercentage, activeInvested, activePnL, completedInvested: 0, completedPnL: 0 };
  };

  const stats = calculatePortfolioStats();

  const currencySymbol = displayCurrency === "USD" ? "$" : "₹";

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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs bg-muted/60">
            <span className="text-muted-foreground">Currency:</span>
            <button
              className={`px-2 py-0.5 rounded-full ${displayCurrency === "INR" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setDisplayCurrency("INR")}
            >
              INR
            </button>
            <button
              className={`px-2 py-0.5 rounded-full ${displayCurrency === "USD" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setDisplayCurrency("USD")}
            >
              USD
            </button>
          </div>
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
            New Analysis
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
              <p className="text-2xl font-bold">
                {currencySymbol}
                {stats.totalInvested.toFixed(2)}
              </p>
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
                {stats.totalPnL >= 0 ? '+' : ''}
                {currencySymbol}
                {stats.totalPnL.toFixed(2)}
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
                No active trades. Start by making a <a href="/predict" className="underline font-medium">new analysis</a> and clicking "Start Tracking".
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {activeTrades.map((trade) => (
                <ActiveTradeCard
                  key={trade.id}
                  trade={trade}
                  displayCurrency={displayCurrency}
                  usdPerInr={usdPerInr}
                  onCancel={handleCancelTrade}
                  onSquareOff={trade.brokerOrderId ? handleSquareOff : undefined}
                  onClose={(id) => {
                    const tradeData = activeTrades.find(t => t.id === id);
                    if (tradeData) {
                      handleCloseTrade(id, tradeData.currentPrice || tradeData.entryPrice);
                    }
                  }}
                  onViewDetails={(id) => {
                    const tradeData = activeTrades.find(t => t.id === id);
                    if (tradeData) {
                      const tvSymbol = getTradingViewSymbol(tradeData.symbol);
                      window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`, '_blank');
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
                        <p>
                          Invested:{" "}
                          <span className="font-semibold">
                            {currencySymbol}
                            {convertAmount(trade.investmentAmount || 0, trade.symbol).toFixed(2)}
                          </span>
                        </p>
                        <p>
                          Entry: {currencySymbol}
                          {convertAmount(trade.entryPrice || 0, trade.symbol).toFixed(2)} | Exit:{" "}
                          {trade.exitPrice != null
                            ? `${currencySymbol}${convertAmount(trade.exitPrice, trade.symbol).toFixed(2)}`
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${(trade.actualPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(trade.actualPnl || 0) >= 0 ? '+' : ''}
                        {currencySymbol}
                        {convertAmount(trade.actualPnl || 0, trade.symbol).toFixed(2)}
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
