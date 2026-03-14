/**
 * TradingDashboardPage — /trading-dashboard
 *
 * The real OpenAlgo-powered live trading dashboard.
 * Only accessible to users who have paid AND been provisioned (openalgo_api_key set).
 *
 * Sections:
 *  1. Broker Sync — daily token entry (routes to OpenAlgo behind the scenes)
 *  2. Live Portfolio — funds, positions, holdings, orders (live from broker via OpenAlgo)
 *  3. Place Order — any symbol/exchange the connected broker supports
 *  4. Order History — real tradebook from broker
 */

import React, { useState, useEffect, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Wallet, RefreshCw, TrendingUp, TrendingDown, ShieldAlert,
  BarChart3, Loader2, AlertTriangle, CheckCircle2, ArrowLeft,
  Send, Info, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import BrokerSyncSection from "@/components/trading/BrokerSyncSection";
import BrokerPortfolioCard from "@/components/trading/BrokerPortfolioCard";

// ── Exchanges supported by OpenAlgo ──────────────────────────────────────────
const EXCHANGES = [
  { value: "NSE", label: "NSE — National Stock Exchange (Stocks/F&O)" },
  { value: "BSE", label: "BSE — Bombay Stock Exchange" },
  { value: "NFO", label: "NFO — NSE Futures & Options" },
  { value: "BFO", label: "BFO — BSE Futures & Options" },
  { value: "CDS", label: "CDS — Currency Derivatives" },
  { value: "MCX", label: "MCX — Multi Commodity Exchange" },
  { value: "NCDEX", label: "NCDEX — National Commodity & Derivatives" },
];

const PRODUCT_TYPES = [
  { value: "CNC", label: "CNC — Cash & Carry (Delivery)" },
  { value: "MIS", label: "MIS — Intraday (Margin)" },
  { value: "NRML", label: "NRML — Normal (F&O Carry Forward)" },
  { value: "CO",   label: "CO — Cover Order" },
  { value: "BO",   label: "BO — Bracket Order" },
];

const ORDER_TYPES = [
  { value: "MARKET", label: "MARKET — Execute at best available price" },
  { value: "LIMIT",  label: "LIMIT — Execute at specified price or better" },
  { value: "SL",     label: "SL — Stop-Loss (trigger + limit price)" },
  { value: "SL-M",   label: "SL-M — Stop-Loss Market (trigger price only)" },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProvisionStatus {
  provisioned: boolean;
  broker: string | null;
  loading: boolean;
}

interface OrderForm {
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL";
  quantity: string;
  product: string;
  pricetype: string;
  price: string;
  trigger_price: string;
}

interface TradeEntry {
  tradingsymbol?: string;
  transactiontype?: string;
  tradedquantity?: string | number;
  averageprice?: string | number;
  fillid?: string;
  exchange?: string;
  product?: string;
  pnl?: string | number;
  orderid?: string;
}

const EMPTY_ORDER: OrderForm = {
  symbol: "",
  exchange: "NSE",
  action: "BUY",
  quantity: "",
  product: "CNC",
  pricetype: "MARKET",
  price: "",
  trigger_price: "",
};

// ── Helper: P&L cell ─────────────────────────────────────────────────────────
function PnlCell({ value }: { value: number }) {
  const isNeutral = Math.abs(value) < 0.005;
  const tone = isNeutral ? "text-slate-400" : value > 0 ? "text-green-400" : "text-red-400";
  const prefix = isNeutral ? "" : value > 0 ? "+" : "";
  return (
    <span className={`font-semibold text-sm ${tone}`}>
      {prefix}₹{(isNeutral ? 0 : Math.abs(value)).toFixed(2)}
    </span>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
function LiveDashboard({ broker }: { broker: string }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderForm>(EMPTY_ORDER);
  const [placing, setPlacing] = useState(false);
  const [tradebook, setTradebook] = useState<TradeEntry[]>([]);
  const [tbLoading, setTbLoading] = useState(false);
  const [portfolioKey, setPortfolioKey] = useState(0); // force re-fetch portfolio

  const loadTradebook = useCallback(async () => {
    setTbLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-portfolio-data", {
        body: { action: "tradebook" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const trades: TradeEntry[] = (res.data as any)?.data ?? [];
      setTradebook(trades);
    } catch {
      // silent — user will see empty state
    } finally {
      setTbLoading(false);
    }
  }, []);

  useEffect(() => { loadTradebook(); }, [loadTradebook]);

  const placeOrder = async () => {
    if (!order.symbol.trim()) { toast.error("Enter a symbol (e.g. RELIANCE, NIFTY25MARFUT)"); return; }
    if (!order.quantity || parseInt(order.quantity) < 1) { toast.error("Enter a valid quantity"); return; }
    if (order.pricetype === "LIMIT" && !order.price) { toast.error("Enter limit price"); return; }
    if ((order.pricetype === "SL" || order.pricetype === "SL-M") && !order.trigger_price) { toast.error("Enter trigger price"); return; }

    setPlacing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("openalgo-place-order", {
        body: {
          symbol:        order.symbol.trim().toUpperCase(),
          exchange:      order.exchange,
          action:        order.action,
          quantity:      parseInt(order.quantity),
          product:       order.product,
          pricetype:     order.pricetype,
          price:         order.price ? parseFloat(order.price) : 0,
          trigger_price: order.trigger_price ? parseFloat(order.trigger_price) : 0,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      const result = res.data as any;
      if (res.error || result?.error) {
        toast.error(result?.error ?? res.error?.message ?? "Order failed");
      } else {
        const oid = result?.orderid ?? result?.broker_order_id ?? "placed";
        toast.success(`${order.action} order placed — ID: ${String(oid).slice(-8)}`, { duration: 6000 });
        setOrder(EMPTY_ORDER);
        setTimeout(() => { setPortfolioKey(k => k + 1); loadTradebook(); }, 2000);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Order placement failed");
    } finally {
      setPlacing(false);
    }
  };

  const brokerLabel = broker.charAt(0).toUpperCase() + broker.slice(1);

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-16">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-6xl">
          <div className="flex items-center gap-3">
            <a href="/algo-setup" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </a>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Live Trading Dashboard</h1>
              <p className="text-[11px] text-zinc-500">Powered by {brokerLabel} via OpenAlgo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              {brokerLabel} Connected
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-6xl">

        {/* ── Section 1: Broker Sync ── */}
        <section>
          <BrokerSyncSection broker={broker} />
        </section>

        {/* ── Section 2: Live Portfolio (funds + positions + holdings + orders) ── */}
        <section>
          <BrokerPortfolioCard key={portfolioKey} />
        </section>

        {/* ── Section 3: Place Order ── */}
        <section>
          <Card className="bg-zinc-950 border border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Send className="h-4 w-4 text-teal-400" />
                Place Order
              </CardTitle>
              <p className="text-xs text-zinc-500 mt-0.5">
                Orders execute on your {brokerLabel} account in real-time via OpenAlgo.
                Only instruments supported by {brokerLabel} will execute successfully.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Broker instrument note */}
              <Alert className="bg-amber-500/5 border-amber-500/20 py-2.5">
                <Info className="h-3.5 w-3.5 text-amber-400" />
                <AlertDescription className="text-xs text-amber-300/90">
                  {broker === "zerodha" || broker === "upstox"
                    ? "Zerodha/Upstox does not support crypto orders. Use NSE/BSE/NFO/MCX/CDS exchanges only."
                    : broker === "dhan"
                      ? "Dhan supports stocks, F&O, currency, and MCX. Crypto is not available."
                      : `${brokerLabel} supports the exchanges listed. Crypto is not available on Indian brokers. Place only valid ${brokerLabel} instruments.`
                  }
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Symbol */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Symbol <span className="text-red-400">*</span></Label>
                  <Input
                    placeholder="e.g. RELIANCE, NIFTY25MARFUT, BANKNIFTY"
                    value={order.symbol}
                    onChange={e => setOrder(o => ({ ...o, symbol: e.target.value.toUpperCase() }))}
                    className="bg-zinc-900 border-zinc-700 text-white font-mono"
                  />
                </div>

                {/* Exchange */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Exchange <span className="text-red-400">*</span></Label>
                  <Select value={order.exchange} onValueChange={v => setOrder(o => ({ ...o, exchange: v }))}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {EXCHANGES.map(e => (
                        <SelectItem key={e.value} value={e.value} className="text-zinc-200 text-xs">{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Action</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setOrder(o => ({ ...o, action: "BUY" }))}
                      className={`border-2 font-bold ${order.action === "BUY" ? "bg-green-500/20 border-green-500 text-green-400" : "border-zinc-700 text-zinc-500"}`}
                    >
                      BUY
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setOrder(o => ({ ...o, action: "SELL" }))}
                      className={`border-2 font-bold ${order.action === "SELL" ? "bg-red-500/20 border-red-500 text-red-400" : "border-zinc-700 text-zinc-500"}`}
                    >
                      SELL
                    </Button>
                  </div>
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Quantity <span className="text-red-400">*</span></Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g. 10"
                    value={order.quantity}
                    onChange={e => setOrder(o => ({ ...o, quantity: e.target.value }))}
                    className="bg-zinc-900 border-zinc-700 text-white"
                  />
                </div>

                {/* Product */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Product Type</Label>
                  <Select value={order.product} onValueChange={v => setOrder(o => ({ ...o, product: v }))}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {PRODUCT_TYPES.map(p => (
                        <SelectItem key={p.value} value={p.value} className="text-zinc-200 text-xs">{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Order Type */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Order Type</Label>
                  <Select value={order.pricetype} onValueChange={v => setOrder(o => ({ ...o, pricetype: v }))}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {ORDER_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-zinc-200 text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Limit price — only for LIMIT and SL */}
                {(order.pricetype === "LIMIT" || order.pricetype === "SL") && (
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Limit Price <span className="text-red-400">*</span></Label>
                    <Input
                      type="number"
                      step="0.05"
                      placeholder="e.g. 2450.50"
                      value={order.price}
                      onChange={e => setOrder(o => ({ ...o, price: e.target.value }))}
                      className="bg-zinc-900 border-zinc-700 text-white font-mono"
                    />
                  </div>
                )}

                {/* Trigger price — only for SL and SL-M */}
                {(order.pricetype === "SL" || order.pricetype === "SL-M") && (
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Trigger Price <span className="text-red-400">*</span></Label>
                    <Input
                      type="number"
                      step="0.05"
                      placeholder="e.g. 2440.00"
                      value={order.trigger_price}
                      onChange={e => setOrder(o => ({ ...o, trigger_price: e.target.value }))}
                      className="bg-zinc-900 border-zinc-700 text-white font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Summary + Submit */}
              {order.symbol && order.quantity && (
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 flex flex-wrap gap-3">
                  <span className={order.action === "BUY" ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{order.action}</span>
                  <span className="font-mono text-white">{order.symbol}</span>
                  <span>Qty: <strong className="text-white">{order.quantity}</strong></span>
                  <span>Exchange: <strong className="text-white">{order.exchange}</strong></span>
                  <span>Product: <strong className="text-white">{order.product}</strong></span>
                  <span>Type: <strong className="text-white">{order.pricetype}</strong></span>
                  {order.price && <span>@ <strong className="text-white">₹{order.price}</strong></span>}
                </div>
              )}

              <Button
                onClick={placeOrder}
                disabled={placing}
                className={`w-full py-5 font-bold text-sm ${
                  order.action === "BUY"
                    ? "bg-green-600 hover:bg-green-500 text-white"
                    : "bg-red-600 hover:bg-red-500 text-white"
                }`}
              >
                {placing
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Placing Order…</>
                  : <><Send className="h-4 w-4 mr-2" />{order.action} {order.symbol || "Order"}</>
                }
              </Button>

              <p className="text-[10px] text-center text-zinc-600">
                Order routes through OpenAlgo to your {brokerLabel} account in real-time.
                All orders are live — real money at risk.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* ── Section 4: Today's Tradebook ── */}
        <section>
          <Card className="bg-zinc-950 border border-zinc-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-teal-400" />
                  Today's Trades
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadTradebook}
                  disabled={tbLoading}
                  className="h-7 px-2 text-zinc-500 hover:text-white border border-zinc-800"
                >
                  {tbLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {tbLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                </div>
              ) : tradebook.length === 0 ? (
                <p className="text-center text-zinc-600 text-sm py-10">No trades today</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        {["Symbol", "Type", "Qty", "Price", "Product", "P&L"].map(h => (
                          <TableHead key={h} className="text-zinc-500 text-[11px] uppercase tracking-wider">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tradebook.map((t, i) => {
                        const pnl = Number(t.pnl ?? 0);
                        return (
                          <TableRow key={i} className="border-zinc-800/50 hover:bg-zinc-900/40">
                            <TableCell className="font-mono text-white text-sm">{t.tradingsymbol}</TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] font-bold ${
                                String(t.transactiontype).toUpperCase() === "BUY"
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                              }`}>
                                {t.transactiontype}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-zinc-300 text-sm">{t.tradedquantity}</TableCell>
                            <TableCell className="text-zinc-300 text-sm font-mono">₹{Number(t.averageprice ?? 0).toFixed(2)}</TableCell>
                            <TableCell className="text-zinc-500 text-sm">{t.product}</TableCell>
                            <TableCell><PnlCell value={pnl} /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

// ── Access gate ───────────────────────────────────────────────────────────────
export default function TradingDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<ProvisionStatus>({ provisioned: false, broker: null, loading: true });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      // Check subscription
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("status, plan_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const isPaid = sub?.status === "active" || sub?.status === "trialing";
      if (!isPaid) {
        setStatus({ provisioned: false, broker: null, loading: false });
        return;
      }

      // Check provisioning
      const { data: integration } = await (supabase as any)
        .from("user_trading_integration")
        .select("is_active, broker, openalgo_api_key")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      const provisioned = !!integration?.openalgo_api_key;
      setStatus({ provisioned, broker: integration?.broker ?? null, loading: false });
    })();
  }, [user?.id]);

  if (authLoading || status.loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth?redirect=/trading-dashboard" replace />;
  }

  // Not provisioned/paid — always use the single onboarding path (/algo-setup)
  if (!status.provisioned) {
    return <Navigate to="/algo-setup" replace />;
  }

  return <LiveDashboard broker={status.broker ?? "zerodha"} />;
}
