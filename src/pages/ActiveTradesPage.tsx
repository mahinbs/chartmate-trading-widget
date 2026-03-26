import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionSignal } from "@/components/prediction/ActionSignal";
import { PerformanceDashboard } from "@/components/performance/PerformanceDashboard";
import {
  tradeTrackingService,
  ActiveTrade,
} from "@/services/tradeTrackingService";
import {
  getTradingViewSymbol,
  isUsdDenominatedSymbol,
} from "@/lib/tradingview-symbols";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle,
  Bell,
  BarChart3,
  Home,
  History,
  Loader2,
  ShieldAlert,
  Target,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";

interface BrokerOrder {
  id: string;
  broker_order_id: string | null;
  symbol: string | null;
  exchange: string | null;
  action: string | null;
  quantity: number | null;
  price: number | null;
  order_type: string | null;
  product_type: string | null;
  status: string | null;
  filled_quantity: number | null;
  average_price: number | null;
  strategy_name: string | null;
  rejection_reason: string | null;
  order_timestamp: string | null;
  synced_at: string;
}

function decodeYFProto(bytes: Uint8Array): { id?: string; price?: number } {
  const out: Record<number, unknown> = {};
  let pos = 0;
  while (pos < bytes.length) {
    const tagByte = bytes[pos++];
    const field = tagByte >> 3;
    const wire = tagByte & 0x7;
    if (wire === 0) {
      // varint
      while (pos < bytes.length) {
        const b = bytes[pos++];
        if (!(b & 0x80)) break;
      }
    } else if (wire === 2) {
      // length-delimited
      let len = 0,
        shift = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        len |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      out[field] = new TextDecoder().decode(bytes.slice(pos, pos + len));
      pos += len;
    } else if (wire === 5) {
      // 32-bit float
      const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, 4);
      out[field] = dv.getFloat32(0, true);
      pos += 4;
    } else if (wire === 1) {
      pos += 8;
    } else {
      break;
    }
  }
  return {
    id: out[1] as string | undefined,
    price: out[2] as number | undefined,
  };
}

export default function ActiveTradesPage() {
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<"INR" | "USD">("INR");
  const [usdPerInr, setUsdPerInr] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [brokerOrders, setBrokerOrders] = useState<BrokerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSyncing, setOrdersSyncing] = useState(false);
  const yahooWsRef = useRef<WebSocket | null>(null);
  const yahooReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track trade IDs already auto-exited this session to avoid duplicate orders
  const triggeredRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Real-time SL / TP auto-exit ────────────────────────────────────────────
  // Called on every live price tick. If SL or TP is breached for a live-order
  // trade, places an immediate MARKET exit order through OpenAlgo.
  const checkAndAutoExit = useCallback(
    async (trade: ActiveTrade, price: number) => {
      if (!trade.brokerOrderId?.startsWith("PAPER") === false) return; // paper trades — skip
      if (
        trade.status !== "active" &&
        trade.status !== "monitoring" &&
        trade.status !== "exit_zone"
      )
        return;
      if (triggeredRef.current.has(trade.id)) return; // already triggered

      const isBuy = trade.action === "BUY";
      const slHit = trade.stopLossPrice
        ? isBuy
          ? price <= trade.stopLossPrice
          : price >= trade.stopLossPrice
        : false;
      const tpHit = trade.takeProfitPrice
        ? isBuy
          ? price >= trade.takeProfitPrice
          : price <= trade.takeProfitPrice
        : false;

      if (!slHit && !tpHit) return;

      triggeredRef.current.add(trade.id); // prevent re-entry

      const reason = slHit ? "Stop Loss" : "Take Profit";
      const emoji = slHit ? "🛑" : "🎯";
      sonnerToast(
        `${emoji} ${reason} hit for ${trade.symbol} @ ₹${price.toFixed(2)}`,
        {
          description: "Placing auto-exit order…",
          duration: 6000,
        },
      );

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        // Place the exit order
        const res = await supabase.functions.invoke("broker-order-action", {
          body: {
            action: "close_all_pos", // squares off all positions in strategy
            trade_id: trade.id,
          },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });

        const ok = !res.error && !(res.data as any)?.error;
        if (ok) {
          sonnerToast.success(
            `Auto-exit complete — ${reason} triggered on ${trade.symbol}`,
          );
          const exitStatus = slHit ? "stopped_out" : "target_hit";
          await supabase
            .from("active_trades" as any)
            .update({
              status: exitStatus,
              exit_price: price,
              exit_time: new Date().toISOString(),
              exit_reason: slHit ? "stop_loss_triggered" : "target_hit",
              actual_pnl: trade.currentPnl ?? null,
            })
            .eq("id", trade.id);

          // ── Auto post-trade AI analysis ──────────────────────────────────
          supabase.auth.getSession().then(({ data: { session } }) => {
            supabase.functions
              .invoke("analyze-post-prediction", {
                body: {
                  symbol: trade.symbol,
                  action: trade.action,
                  entry_price: trade.entryPrice,
                  exit_price: price,
                  exit_reason: slHit ? "stop_loss" : "take_profit",
                  pnl: trade.currentPnl ?? 0,
                  strategy: trade.strategyType ?? "unknown",
                  trade_id: trade.id,
                },
                headers: { Authorization: `Bearer ${session?.access_token}` },
              })
              .then(() => {
                sonnerToast.info(
                  `AI post-trade analysis ready for ${trade.symbol}`,
                  { duration: 4000 },
                );
              })
              .catch(() => {});
          });

          loadTrades();
        } else {
          sonnerToast.error(
            `Auto-exit order failed for ${trade.symbol}: ${(res.data as any)?.error ?? "unknown"}`,
          );
          triggeredRef.current.delete(trade.id); // allow retry
        }
      } catch (e: any) {
        sonnerToast.error("Auto-exit error: " + e.message);
        triggeredRef.current.delete(trade.id);
      }
    },
    [],
  );

  const loadBrokerOrders = useCallback(
    async (sync = false) => {
      if (sync) setOrdersSyncing(true);
      else setOrdersLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const res = await supabase.functions.invoke("sync-order-history", {
          body: {},
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const data = res.data as { orders?: BrokerOrder[] } | null;
        if (data?.orders) setBrokerOrders(data.orders);
        if (sync) toast({ title: "Orders synced from broker", duration: 2000 });
      } catch {
        // non-fatal — user may not have integration set up
      } finally {
        setOrdersLoading(false);
        setOrdersSyncing(false);
      }
    },
    [toast],
  );

  const loadTrades = async () => {
    try {
      const [activeResult, completedResult] = await Promise.all([
        tradeTrackingService.getActiveTrades(),
        tradeTrackingService.getCompletedTrades(20),
      ]);

      if (activeResult.data) {
        console.log("📊 Loaded active trades:", activeResult.data.length);
        // Force new array reference to trigger React re-render
        setActiveTrades([...activeResult.data]);
      }

      if (completedResult.data) {
        console.log("✅ Loaded completed trades:", completedResult.data.length);
        // Force new array reference to trigger React re-render
        setCompletedTrades([...completedResult.data]);
      }
    } catch (error) {
      console.error("Error loading trades:", error);
      toast({
        title: "Error",
        description: "Failed to load trades",
        variant: "destructive",
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
      description: "Trade data updated",
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

  useEffect(() => {
    loadTrades();

    // Subscribe to real-time updates
    const subscription = tradeTrackingService.subscribeToTrades((payload) => {
      console.log("🔄 Trade updated:", payload);
      // Force reload trades immediately
      loadTrades();
    });

    // Subscribe to notifications
    const notifSubscription = tradeTrackingService.subscribeToNotifications(
      (payload) => {
        const notification = payload.new;
        toast({
          title: notification.title,
          description: notification.message,
        });
      },
    );

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
          .map((t) => t.symbol.toUpperCase()),
      ),
    );

    if (cryptoSymbols.length === 0) {
      return;
    }

    const toBinanceSymbol = (symbol: string) => {
      // BTC-USD -> BTCUSDT, ETH-USD -> ETHUSDT, etc.
      const base = symbol.replace(/[^A-Z]/gi, "").replace(/USD$/i, "");
      return `${base}USDT`.toUpperCase();
    };

    const streams = cryptoSymbols.map(
      (s) => `${toBinanceSymbol(s).toLowerCase()}@trade`,
    );
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
          const binanceSymbol: string = (
            tick.s ||
            tick.symbol ||
            ""
          ).toUpperCase();
          const price: number = parseFloat(tick.p || tick.c || tick.price);
          if (!binanceSymbol || !price || Number.isNaN(price)) return;

          const fromBinanceToInternal = (sym: string) =>
            `${sym.replace(/USDT$/i, "")}-USD`;
          const internalSymbol =
            fromBinanceToInternal(binanceSymbol).toUpperCase();

          setActiveTrades((prev) => {
            const updated = prev.map((t) => {
              if (t.symbol.toUpperCase() !== internalSymbol) return t;
              const pnl =
                (price - t.entryPrice) *
                t.shares *
                (t.action === "SELL" ? -1 : 1);
              const pnlPct = (pnl / t.investmentAmount) * 100;
              return {
                ...t,
                currentPrice: price,
                currentPnl: pnl,
                currentPnlPercentage: pnlPct,
                lastPriceUpdate: new Date().toISOString(),
              };
            });
            // Check SL/TP on updated trades (outside setState to avoid stale closure)
            updated.forEach((t) => {
              if (
                t.symbol.toUpperCase() === internalSymbol &&
                t.brokerOrderId &&
                !t.brokerOrderId.startsWith("PAPER")
              ) {
                checkAndAutoExit(t, price);
              }
            });
            return updated;
          });
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
  }, [activeTrades.map((t) => t.symbol).join(","), checkAndAutoExit]);

  // Yahoo WebSocket for non-USD symbols (NSE/BSE etc.) for truly live updates.
  useEffect(() => {
    const stockSymbols = Array.from(
      new Set(
        activeTrades
          .filter((t) => !isUsdDenominatedSymbol(t.symbol))
          .map((t) => t.symbol.toUpperCase()),
      ),
    );

    if (stockSymbols.length === 0) {
      if (yahooWsRef.current) {
        yahooWsRef.current.close(1000, "no-symbols");
        yahooWsRef.current = null;
      }
      if (yahooReconnectRef.current) {
        clearTimeout(yahooReconnectRef.current);
        yahooReconnectRef.current = null;
      }
      return;
    }

    const connectYahoo = () => {
      if (yahooWsRef.current) yahooWsRef.current.close(1000, "reconnect");
      if (yahooReconnectRef.current) {
        clearTimeout(yahooReconnectRef.current);
        yahooReconnectRef.current = null;
      }

      const ws = new WebSocket("wss://streamer.finance.yahoo.com");
      ws.onopen = () => {
        ws.send(JSON.stringify({ subscribe: stockSymbols }));
        console.log("⚡ Yahoo WS connected for", stockSymbols.join(", "));
      };

      ws.onmessage = (event) => {
        try {
          const raw = atob(event.data);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const msg = decodeYFProto(bytes);
          const symbol = (msg.id || "").toUpperCase();
          const price = Number(msg.price);
          if (!symbol || !price || Number.isNaN(price)) return;

          setActiveTrades((prev) => {
            const updated = prev.map((t) => {
              if (t.symbol.toUpperCase() !== symbol) return t;
              const pnl =
                (price - t.entryPrice) *
                t.shares *
                (t.action === "SELL" ? -1 : 1);
              const pnlPct = (pnl / t.investmentAmount) * 100;
              return {
                ...t,
                currentPrice: price,
                currentPnl: pnl,
                currentPnlPercentage: pnlPct,
                lastPriceUpdate: new Date().toISOString(),
              };
            });
            // Real-time SL/TP check on every tick
            updated.forEach((t) => {
              if (
                t.symbol.toUpperCase() === symbol &&
                t.brokerOrderId &&
                !t.brokerOrderId.startsWith("PAPER")
              ) {
                checkAndAutoExit(t, price);
              }
            });
            return updated;
          });
        } catch {
          // ignore malformed tick
        }
      };

      ws.onclose = (e) => {
        if (e.code !== 1000) {
          yahooReconnectRef.current = setTimeout(connectYahoo, 2000);
        }
      };

      ws.onerror = () => ws.close();
      yahooWsRef.current = ws;
    };

    connectYahoo();
    return () => {
      if (yahooWsRef.current) {
        yahooWsRef.current.close(1000, "cleanup");
        yahooWsRef.current = null;
      }
      if (yahooReconnectRef.current) {
        clearTimeout(yahooReconnectRef.current);
        yahooReconnectRef.current = null;
      }
    };
  }, [
    activeTrades
      .map((t) => t.symbol.toUpperCase())
      .sort()
      .join(","),
    checkAndAutoExit,
  ]);

  const convertAmount = (value: number, symbol?: string) => {
    const assetCurrency = symbol
      ? isUsdDenominatedSymbol(symbol)
        ? "USD"
        : "INR"
      : "INR";
    if (displayCurrency === assetCurrency) return value;
    if (
      displayCurrency === "USD" &&
      assetCurrency === "INR" &&
      usdPerInr &&
      usdPerInr > 0
    )
      return value * usdPerInr;
    if (
      displayCurrency === "INR" &&
      assetCurrency === "USD" &&
      usdPerInr &&
      usdPerInr > 0
    )
      return value / usdPerInr;
    return value;
  };

  const calculatePortfolioStats = () => {
    // Top summary should reflect only ACTIVE portfolio,
    // so completed trades do not distort current P&L.
    const activeInvested = activeTrades.reduce(
      (sum, t) => sum + convertAmount(t.investmentAmount, t.symbol),
      0,
    );
    const activePnL = activeTrades.reduce(
      (sum, t) => sum + convertAmount(t.currentPnl ?? 0, t.symbol),
      0,
    );
    const totalInvested = activeInvested;
    const totalPnL = activePnL;
    const totalPnLPercentage =
      totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    return {
      totalInvested,
      totalPnL,
      totalPnLPercentage,
      activeInvested,
      activePnL,
      completedInvested: 0,
      completedPnL: 0,
    };
  };

  const stats = calculatePortfolioStats();

  const currencySymbol = displayCurrency === "USD" ? "$" : "₹";

  if (loading) {
    return (
      <DashboardShellLayout>
        <div className="container max-w-7xl mx-auto p-3 sm:p-6">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </DashboardShellLayout>
    );
  }

  return (
    <DashboardShellLayout>
      <div className="container max-w-7xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
          <div className="pt-10 lg:pt-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">
              Active Trades
            </h1>
            <p className="text-muted-foreground text-sm">
              Track your live positions in real-time
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-white/10 px-2 text-xs bg-zinc-900/50 py-2">
              <span className="text-muted-foreground">Currency:</span>
              <button
                className={`px-2 py-0.5 rounded-full ${displayCurrency === "INR" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDisplayCurrency("INR")}
              >
                INR
              </button>
              <button
                className={`px-2 py-0.5 rounded-full ${displayCurrency === "USD" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDisplayCurrency("USD")}
              >
                USD
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/home")}
              className="hover:bg-white/5"
            >
              <Home className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Home</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="border-white/10 hover:bg-white/5"
            >
              <RefreshCw
                className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/predict")}
              className="shadow-[0_0_20px_rgba(20,184,166,0.2)]"
            >
              <TrendingUp className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Analysis</span>
            </Button>
          </div>
        </div>

        {/* Portfolio Summary */}
        {activeTrades.length > 0 && (
          <>
            {/* Prominent Real-time P/L Card */}
            <Card className="glass-panel border-teal-500/30 bg-gradient-to-br from-zinc-900/90 to-zinc-950">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full bg-teal-400 animate-pulse"
                      title="Live prices"
                    />
                    Profit &amp; Loss (Real-time)
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className="text-xs bg-teal-500/20 text-teal-400 border-teal-500/40"
                  >
                    Live
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                      Total P&amp;L
                    </p>
                    <p
                      className={`text-2xl sm:text-3xl md:text-4xl font-bold ${stats.totalPnL >= 0 ? "text-teal-400" : "text-red-500"}`}
                    >
                      {stats.totalPnL >= 0 ? "+" : ""}
                      {currencySymbol}
                      {stats.totalPnL.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                      Return
                    </p>
                    <p
                      className={`text-xl sm:text-2xl md:text-3xl font-bold ${stats.totalPnLPercentage >= 0 ? "text-teal-400" : "text-red-500"}`}
                    >
                      {stats.totalPnLPercentage >= 0 ? "+" : ""}
                      {stats.totalPnLPercentage.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                      Invested
                    </p>
                    <p className="text-lg sm:text-xl font-semibold text-white">
                      {currencySymbol}
                      {stats.totalInvested.toFixed(2)}
                    </p>
                  </div>
                </div>
                {/* Per-trade P&L breakdown */}
                <div className="border-t border-white/10 pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Per position
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeTrades.map((t) => {
                      const pnl = t.currentPnl ?? 0;
                      const pnlConverted = convertAmount(pnl, t.symbol);
                      const isPos = pnlConverted >= 0;
                      return (
                        <div
                          key={t.id}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-white/5 border border-white/10 text-sm"
                        >
                          <span className="font-medium text-white truncate max-w-[100px]">
                            {t.symbol}
                          </span>
                          <span
                            className={isPos ? "text-teal-400" : "text-red-500"}
                          >
                            {isPos ? "+" : ""}
                            {currencySymbol}
                            {pnlConverted.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            (
                            {t.currentPnlPercentage != null
                              ? `${t.currentPnlPercentage >= 0 ? "+" : ""}${t.currentPnlPercentage.toFixed(1)}%`
                              : "—"}
                            )
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <Card className="glass-panel">
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Total Invested
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <p className="text-lg sm:text-2xl font-bold text-white">
                    {currencySymbol}
                    {stats.totalInvested.toFixed(2)}
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Total P&amp;L
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <p
                    className={`text-lg sm:text-2xl font-bold ${stats.totalPnL >= 0 ? "text-teal-400" : "text-red-500"}`}
                  >
                    {stats.totalPnL >= 0 ? "+" : ""}
                    {currencySymbol}
                    {stats.totalPnL.toFixed(2)}
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Portfolio Return
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <p
                    className={`text-lg sm:text-2xl font-bold ${stats.totalPnLPercentage >= 0 ? "text-teal-400" : "text-red-500"}`}
                  >
                    {stats.totalPnLPercentage >= 0 ? "+" : ""}
                    {stats.totalPnLPercentage.toFixed(2)}%
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Trades Tabs */}
        <Tabs
          defaultValue="active"
          className="w-full"
          onValueChange={(v) => {
            if (v === "orders" && brokerOrders.length === 0)
              loadBrokerOrders(false);
          }}
        >
          <div className="overflow-x-auto pb-1">
            <TabsList className="grid w-full min-w-[360px] max-w-3xl grid-cols-4">
              <TabsTrigger value="active" className="text-xs sm:text-sm">
                <Activity className="h-3.5 w-3.5 mr-1" />
                <span>Active ({activeTrades.length})</span>
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs sm:text-sm">
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Completed</span>
                <span className="sm:hidden">Done</span>
                <span> ({completedTrades.length})</span>
              </TabsTrigger>
              <TabsTrigger value="orders" className="text-xs sm:text-sm">
                <History className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Broker Orders</span>
                <span className="sm:hidden">Orders</span>
              </TabsTrigger>
              <TabsTrigger value="performance" className="text-xs sm:text-sm">
                <BarChart3 className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Performance</span>
                <span className="sm:hidden">Perf.</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Active Trades */}
          <TabsContent value="active" className="space-y-4 mt-4">
            {activeTrades.length === 0 ? (
              <Alert className="border-white/10 bg-white/5">
                <Bell className="h-4 w-4 text-primary" />
                <AlertDescription>
                  No active trades. Start by making a{" "}
                  <a
                    href="/predict"
                    className="underline font-medium text-primary"
                  >
                    new analysis
                  </a>{" "}
                  and clicking &quot;Start Tracking&quot;.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="minimal-panel rounded-xl overflow-hidden">
                  {/* Table Header — hidden on xs, visible sm+ */}
                  <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-3 border-b border-white/5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-black/20">
                    <div>Market</div>
                    <div className="text-right w-24 sm:w-32">Entry</div>
                    <div className="text-right w-24 sm:w-32">Current</div>
                    <div className="text-right w-24 sm:w-32">P/L</div>
                  </div>

                  {/* Table Rows */}
                  <div className="divide-y divide-white/5">
                    {activeTrades.map((trade) => {
                      const pnl = convertAmount(
                        trade.currentPnl ?? 0,
                        trade.symbol,
                      );
                      const isNeutral = Math.abs(pnl) < 0.005;
                      const isPositive = !isNeutral && pnl > 0;
                      const pnlClass = isNeutral
                        ? "text-slate-400"
                        : isPositive
                          ? "text-teal-400"
                          : "text-red-500";
                      const pnlPrefix = isNeutral ? "" : isPositive ? "+" : "";
                      const displayPnl = isNeutral ? 0 : pnl;

                      return (
                        <div
                          key={trade.id}
                          className="flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto] gap-x-3 sm:items-center px-3 sm:px-4 py-3 sm:py-4 hover:bg-white/5 cursor-pointer transition-colors"
                          onClick={() => navigate(`/trade/${trade.id}`)}
                        >
                          {/* Mobile layout: full width info */}
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-sm tracking-tight truncate text-white">
                                  {trade.symbol.replace("-USD", "")}
                                </span>
                                <span
                                  className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded leading-none uppercase font-bold ${
                                    trade.action === "BUY"
                                      ? "bg-teal-500/10 text-teal-400"
                                      : "bg-red-500/10 text-red-400"
                                  }`}
                                >
                                  {trade.action}
                                </span>
                              </div>
                              {/* Mobile-only P/L on the right */}
                              <div
                                className={`sm:hidden flex items-center gap-1 text-sm font-bold ${pnlClass}`}
                              >
                                {isNeutral ? null : isPositive ? (
                                  <TrendingUp className="h-3.5 w-3.5" />
                                ) : (
                                  <TrendingDown className="h-3.5 w-3.5" />
                                )}
                                {pnlPrefix}
                                {currencySymbol}
                                {Math.abs(displayPnl).toFixed(2)}
                              </div>
                            </div>
                            <div
                              className={`hidden sm:flex items-center gap-1 text-[11px] font-medium ${pnlClass}`}
                            >
                              {isNeutral ? null : isPositive ? (
                                <TrendingUp className="h-3 w-3 shrink-0" />
                              ) : (
                                <TrendingDown className="h-3 w-3 shrink-0" />
                              )}
                              <span className="truncate">
                                {pnlPrefix}
                                {currencySymbol}
                                {Math.abs(displayPnl).toFixed(2)}
                              </span>
                            </div>
                            {/* Mobile price row */}
                            <div className="flex items-center gap-3 sm:hidden text-xs text-muted-foreground">
                              <span>
                                Entry: {currencySymbol}
                                {convertAmount(
                                  trade.entryPrice,
                                  trade.symbol,
                                ).toFixed(2)}
                              </span>
                              <span className={`font-semibold ${pnlClass}`}>
                                Now: {currencySymbol}
                                {convertAmount(
                                  trade.currentPrice || trade.entryPrice,
                                  trade.symbol,
                                ).toFixed(2)}
                              </span>
                            </div>
                            {/* SL / TP badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {trade.stopLossPrice && (
                                <span className="flex items-center gap-0.5 text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                                  <ShieldAlert className="h-2.5 w-2.5" />
                                  SL {currencySymbol}
                                  {convertAmount(
                                    trade.stopLossPrice,
                                    trade.symbol,
                                  ).toFixed(2)}
                                </span>
                              )}
                              {trade.takeProfitPrice && (
                                <span className="flex items-center gap-0.5 text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                  <Target className="h-2.5 w-2.5" />
                                  TP {currencySymbol}
                                  {convertAmount(
                                    trade.takeProfitPrice,
                                    trade.symbol,
                                  ).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Entry Price Column — desktop only */}
                          <div className="hidden sm:block text-right w-24 sm:w-32">
                            <span className="text-xs sm:text-sm font-medium text-muted-foreground tabular-nums">
                              {currencySymbol}
                              {convertAmount(
                                trade.entryPrice,
                                trade.symbol,
                              ).toFixed(2)}
                            </span>
                          </div>

                          {/* Current Price Column — desktop only */}
                          <div
                            className={`hidden sm:block text-right w-24 sm:w-32 text-xs sm:text-sm font-bold tabular-nums ${pnlClass}`}
                          >
                            {currencySymbol}
                            {convertAmount(
                              trade.currentPrice || trade.entryPrice,
                              trade.symbol,
                            ).toFixed(2)}
                          </div>

                          {/* P/L Column — desktop only */}
                          <div
                            className={`hidden sm:block text-right w-24 sm:w-32 text-xs sm:text-sm font-bold tabular-nums ${pnlClass}`}
                          >
                            {pnlPrefix}
                            {currencySymbol}
                            {Math.abs(displayPnl).toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* Completed Trades */}
          <TabsContent value="completed" className="space-y-4 mt-4">
            {completedTrades.length === 0 ? (
              <Alert className="border-white/10 bg-white/5">
                <CheckCircle className="h-4 w-4 text-primary" />
                <AlertDescription>
                  No completed trades yet. Tracked trades will appear here after
                  they finish.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {completedTrades.map((trade) => (
                  <Card
                    key={trade.id}
                    className="p-4 sm:p-6 border-white/5 bg-card hover:bg-white/5 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg sm:text-xl font-bold text-white">
                            {trade.symbol}
                          </h3>
                          <ActionSignal
                            action={trade.action}
                            confidence={trade.confidence || 0}
                            size="sm"
                          />
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          {new Date(trade.entryTime).toLocaleDateString()} -{" "}
                          {trade.exitTime &&
                            new Date(trade.exitTime).toLocaleDateString()}
                        </p>
                        <div className="mt-2 text-xs sm:text-sm text-muted-foreground space-y-0.5">
                          <p>
                            Invested:{" "}
                            <span className="font-semibold text-zinc-300">
                              {currencySymbol}
                              {convertAmount(
                                trade.investmentAmount || 0,
                                trade.symbol,
                              ).toFixed(2)}
                            </span>
                          </p>
                          <p>
                            Entry: {currencySymbol}
                            {convertAmount(
                              trade.entryPrice || 0,
                              trade.symbol,
                            ).toFixed(2)}{" "}
                            | Exit:{" "}
                            {trade.exitPrice != null
                              ? `${currencySymbol}${convertAmount(trade.exitPrice, trade.symbol).toFixed(2)}`
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p
                          className={`text-xl sm:text-2xl font-bold ${(trade.actualPnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                        >
                          {(trade.actualPnl || 0) >= 0 ? "+" : ""}
                          {currencySymbol}
                          {convertAmount(
                            trade.actualPnl || 0,
                            trade.symbol,
                          ).toFixed(2)}
                        </p>
                        <p
                          className={`text-sm font-medium ${(trade.actualPnlPercentage || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                        >
                          {(trade.actualPnlPercentage || 0) >= 0 ? "+" : ""}
                          {trade.actualPnlPercentage?.toFixed(2) || "0.00"}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="capitalize border-white/10 text-muted-foreground text-xs"
                      >
                        {trade.exitReason?.replace(/_/g, " ")}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="bg-white/10 text-zinc-300 hover:bg-white/20 text-xs"
                      >
                        {trade.shares} shares
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Broker Orders Tab */}
          <TabsContent value="orders" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs sm:text-sm text-zinc-400">
                Real-time orders from your broker via OpenAlgo.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadBrokerOrders(true)}
                disabled={ordersSyncing}
                className="border-zinc-700 hover:bg-zinc-800 text-xs"
              >
                {ordersSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Sync from Broker
              </Button>
            </div>

            {ordersLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
              </div>
            ) : brokerOrders.length === 0 ? (
              <Alert className="border-white/10 bg-white/5">
                <History className="h-4 w-4 text-zinc-400" />
                <AlertDescription className="text-zinc-400">
                  No broker orders found. Click &quot;Sync from Broker&quot; to
                  fetch your latest orders.
                  <br />
                  <span className="text-xs text-zinc-500 mt-1 block">
                    Requires an active OpenAlgo integration. Complete onboarding
                    at{" "}
                    <a href="/algo-setup" className="underline text-teal-400">
                      Algo Setup
                    </a>
                    .
                  </span>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Desktop Table */}
                <Card className="hidden sm:block bg-zinc-900 border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 text-xs text-zinc-400">
                          <th className="text-left px-4 py-3">Symbol</th>
                          <th className="text-left px-4 py-3">Action</th>
                          <th className="text-right px-4 py-3">Qty</th>
                          <th className="text-right px-4 py-3">Price</th>
                          <th className="text-left px-4 py-3">Type</th>
                          <th className="text-left px-4 py-3">Strategy</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-left px-4 py-3">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brokerOrders.map((order) => {
                          const statusColors: Record<string, string> = {
                            complete:
                              "bg-green-500/10 text-green-400 border-green-500/30",
                            rejected:
                              "bg-red-500/10 text-red-400 border-red-500/30",
                            open: "bg-teal-500/10 text-teal-400 border-teal-500/30",
                            cancelled:
                              "bg-zinc-700 text-zinc-400 border-zinc-600",
                            trigger_pending:
                              "bg-amber-500/10 text-amber-400 border-amber-500/30",
                          };
                          const sc =
                            statusColors[(order.status ?? "").toLowerCase()] ??
                            "bg-zinc-700 text-zinc-400 border-zinc-600";
                          const isBuy =
                            (order.action ?? "").toUpperCase() === "BUY";

                          return (
                            <tr
                              key={order.id}
                              className="border-b border-zinc-800/60 hover:bg-zinc-800/30"
                            >
                              <td className="px-4 py-3 font-mono font-medium text-white">
                                {order.symbol ?? "—"}
                                {order.exchange && (
                                  <span className="text-[10px] text-zinc-500 ml-1">
                                    {order.exchange}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`font-bold text-xs ${isBuy ? "text-green-400" : "text-red-400"}`}
                                >
                                  {order.action ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-zinc-300">
                                {order.filled_quantity != null
                                  ? `${order.filled_quantity}/${order.quantity}`
                                  : (order.quantity ?? "—")}
                              </td>
                              <td className="px-4 py-3 text-right text-zinc-300">
                                {order.average_price
                                  ? `₹${order.average_price.toLocaleString()}`
                                  : order.price
                                    ? `₹${order.price.toLocaleString()}`
                                    : "—"}
                              </td>
                              <td className="px-4 py-3 text-zinc-400 text-xs">
                                {[order.order_type, order.product_type]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </td>
                              <td className="px-4 py-3 text-zinc-400 text-xs max-w-[120px] truncate">
                                {order.strategy_name ?? "—"}
                              </td>
                              <td className="px-4 py-3">
                                <Badge className={`text-[10px] border ${sc}`}>
                                  {(order.status ?? "unknown")
                                    .charAt(0)
                                    .toUpperCase() +
                                    (order.status ?? "unknown").slice(1)}
                                </Badge>
                                {order.rejection_reason && (
                                  <p
                                    className="text-[10px] text-red-400 mt-0.5 max-w-[100px] truncate"
                                    title={order.rejection_reason}
                                  >
                                    {order.rejection_reason}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                                {order.order_timestamp
                                  ? new Date(
                                      order.order_timestamp,
                                    ).toLocaleString()
                                  : new Date(order.synced_at).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
                {/* Mobile Card List */}
                <div className="sm:hidden space-y-2">
                  {brokerOrders.map((order) => {
                    const statusColors: Record<string, string> = {
                      complete:
                        "bg-green-500/10 text-green-400 border-green-500/30",
                      rejected: "bg-red-500/10 text-red-400 border-red-500/30",
                      open: "bg-teal-500/10 text-teal-400 border-teal-500/30",
                      cancelled: "bg-zinc-700 text-zinc-400 border-zinc-600",
                      trigger_pending:
                        "bg-amber-500/10 text-amber-400 border-amber-500/30",
                    };
                    const sc =
                      statusColors[(order.status ?? "").toLowerCase()] ??
                      "bg-zinc-700 text-zinc-400 border-zinc-600";
                    const isBuy = (order.action ?? "").toUpperCase() === "BUY";
                    return (
                      <Card
                        key={order.id}
                        className="bg-zinc-900 border-zinc-800 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-white text-sm truncate">
                                {order.symbol ?? "—"}
                              </span>
                              {order.exchange && (
                                <span className="text-[10px] text-zinc-500">
                                  {order.exchange}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span
                                className={`font-bold text-xs ${isBuy ? "text-green-400" : "text-red-400"}`}
                              >
                                {order.action ?? "—"}
                              </span>
                              <span className="text-zinc-400 text-xs">
                                {order.filled_quantity != null
                                  ? `${order.filled_quantity}/${order.quantity}`
                                  : (order.quantity ?? "—")}{" "}
                                shares
                              </span>
                              {(order.average_price || order.price) && (
                                <span className="text-zinc-300 text-xs font-mono">
                                  ₹
                                  {(
                                    order.average_price || order.price
                                  )?.toLocaleString()}
                                </span>
                              )}
                            </div>
                            {order.strategy_name && (
                              <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                                {order.strategy_name}
                              </p>
                            )}
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                              {order.order_timestamp
                                ? new Date(
                                    order.order_timestamp,
                                  ).toLocaleString()
                                : new Date(order.synced_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            <Badge className={`text-[10px] border ${sc}`}>
                              {(order.status ?? "unknown")
                                .charAt(0)
                                .toUpperCase() +
                                (order.status ?? "unknown").slice(1)}
                            </Badge>
                            {order.rejection_reason && (
                              <p
                                className="text-[10px] text-red-400 mt-0.5 max-w-[120px] truncate"
                                title={order.rejection_reason}
                              >
                                {order.rejection_reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* Performance Tab - Failure Transparency & Stats */}
          <TabsContent value="performance" className="space-y-6 mt-6">
            <PerformanceDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShellLayout>
  );
}
