/**
 * BrokerPortfolioCard
 *
 * Full broker account view — funds, positions, holdings, orders, tradebook.
 * All data pulled live from OpenAlgo → broker. OpenAlgo is completely invisible to user.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3,
  Briefcase, ClipboardList, Loader2, RefreshCw, Wallet, X, Pencil, Zap,
  TrendingUp, TrendingDown, BookOpen, Plus, Trash2, Copy, CheckCircle2,
  ChevronRight, Webhook, Send,
} from "lucide-react";
import { toast } from "sonner";
import PlaceOrderPanel from "@/components/trading/PlaceOrderPanel";

// ── Strategy types ────────────────────────────────────────────────────────────

interface Strategy {
  id: string;
  name: string;
  trading_mode: string;
  is_active: boolean;
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  symbols: string[];
  webhook_url?: string | null;
  risk_per_trade_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  created_at: string;
}

interface StrategyForm {
  name: string;
  description: string;
  trading_mode: string;
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  risk_per_trade_pct: string;
  stop_loss_pct: string;
  take_profit_pct: string;
  symbols_raw: string;
}

const EMPTY_STRATEGY: StrategyForm = {
  name: "",
  description: "",
  trading_mode: "LONG",
  is_intraday: true,
  start_time: "09:15",
  end_time: "15:15",
  squareoff_time: "15:15",
  risk_per_trade_pct: "1",
  stop_loss_pct: "2",
  take_profit_pct: "4",
  symbols_raw: "",
};

const EXCHANGES_LIST = ["NSE","BSE","NFO","BFO","CDS","MCX","NCDEX"];
const PRODUCT_LIST   = ["CNC","MIS","NRML","CO","BO"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortfolioData {
  broker: string | null;
  token_expires_at: string | null;
  token_expired: boolean;
  funds: Record<string, unknown> | null;
  positions: PositionRow[];
  holdings: HoldingRow[];
  orders: OrderRow[];
  tradebook: TradeRow[];
  errors: Record<string, string | null>;
}

interface PositionRow {
  tradingsymbol?: string; exchange?: string; product?: string;
  netqty?: number; avgprice?: number; ltp?: number; pnl?: number;
  buyqty?: number; sellqty?: number; buyavgprice?: number; sellavgprice?: number;
  [key: string]: unknown;
}
interface HoldingRow {
  tradingsymbol?: string; exchange?: string; quantity?: number;
  avgprice?: number; ltp?: number; pnl?: number; close?: number;
  [key: string]: unknown;
}
interface OrderRow {
  orderid?: string; tradingsymbol?: string; exchange?: string;
  transactiontype?: string; quantity?: number; filledquantity?: number;
  averageprice?: number; price?: number; product?: string; pricetype?: string;
  status?: string; updatetime?: string; ordertime?: string; rejectreason?: string;
  [key: string]: unknown;
}
interface TradeRow {
  tradingsymbol?: string; exchange?: string; transactiontype?: string;
  tradedquantity?: string | number; averageprice?: string | number;
  product?: string; orderid?: string; fillid?: string;
  pnl?: string | number; tradetime?: string; ordertime?: string;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CANCELLABLE = ["open", "pending", "trigger pending", "after market order req received"];

function fmt(v: number | undefined | null, prefix = "₹") {
  if (v == null || isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${prefix}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PnlBadge({ value }: { value: number | undefined | null }) {
  const n = Number(value ?? 0);
  if (!n || isNaN(n) || Math.abs(n) < 0.005) return <span className="text-zinc-500 text-xs">₹0.00</span>;
  const pos = n > 0;
  return (
    <span className={`text-xs font-bold flex items-center gap-0.5 ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {pos ? "+" : "−"}₹{Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  const map: Record<string, string> = {
    complete:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    rejected:  "bg-red-500/20 text-red-300 border-red-500/30",
    cancelled: "bg-zinc-600/30 text-zinc-400 border-zinc-600",
    open:      "bg-blue-500/20 text-blue-300 border-blue-500/30",
    pending:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  return (
    <Badge className={`text-[10px] border px-1.5 py-0 ${map[s] ?? "bg-zinc-700 text-zinc-400 border-zinc-600"}`}>
      {status ?? "—"}
    </Badge>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BrokerPortfolioCard({ broker = "" }: { broker?: string }) {
  const [data, setData]             = useState<PortfolioData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [actioning, setActioning]   = useState<string | null>(null);
  const [liveLtps, setLiveLtps]     = useState<Record<string, number>>({});
  const [quotesLoading, setQLoading] = useState(false);
  const [modifyOrder, setModifyOrder] = useState<OrderRow | null>(null);
  const [modifyPrice, setModifyPrice] = useState("");
  const [modifyQty, setModifyQty]     = useState("");
  const [modifyType, setModifyType]   = useState("LIMIT");
  const [showOrderModal, setShowOrderModal] = useState(false);

  // ── Strategy state ─────────────────────────────────────────────────────────
  const [strategies, setStrategies]       = useState<Strategy[]>([]);
  const [stratLoading, setStratLoading]   = useState(true);
  const [showCreate, setShowCreate]       = useState(false);
  const [form, setForm]                   = useState<StrategyForm>(EMPTY_STRATEGY);
  const [creating, setCreating]           = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId]           = useState<string | null>(null);
  const [showGuide, setShowGuide]         = useState(false);
  const [firePanel, setFirePanel]         = useState<Record<string, {
    open: boolean; symbol: string; exchange: string; quantity: string; product: string; firing: boolean;
  }>>({});
  const brokerLabel = (broker || "Broker").charAt(0).toUpperCase() + (broker || "broker").slice(1);

  const setF = <K extends keyof StrategyForm>(k: K, v: StrategyForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const getFireState = (id: string) => firePanel[id] ?? {
    open: false, symbol: "", exchange: "NSE", quantity: "1", product: "MIS", firing: false,
  };
  const setFireState = (id: string, patch: Partial<typeof firePanel[string]>) =>
    setFirePanel(fp => ({ ...fp, [id]: { ...getFireState(id), ...patch } }));

  const loadStrategies = useCallback(async () => {
    setStratLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setStrategies((res.data as any)?.strategies ?? []);
    } catch { /* silent */ } finally { setStratLoading(false); }
  }, []);

  useEffect(() => { loadStrategies(); }, [loadStrategies]);

  const toggleStrategy = async (id: string) => {
    setToggleLoading(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke("manage-strategy", {
        body: { action: "toggle", strategy_id: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      await loadStrategies();
    } finally { setToggleLoading(null); }
  };

  const deleteStrategy = async (id: string, name: string) => {
    if (!confirm(`Delete strategy "${name}"?`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke("manage-strategy", {
        body: { action: "delete", strategy_id: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      toast.success("Strategy deleted");
      await loadStrategies();
    } catch { toast.error("Failed to delete strategy"); }
  };

  const createStrategy = async () => {
    if (!form.name.trim()) { toast.error("Strategy name is required"); return; }
    const riskPct = parseFloat(form.risk_per_trade_pct);
    const slPct   = parseFloat(form.stop_loss_pct);
    const tpPct   = parseFloat(form.take_profit_pct);
    if (isNaN(riskPct) || riskPct <= 0) { toast.error("Risk % must be > 0"); return; }
    if (isNaN(slPct)   || slPct <= 0)   { toast.error("Stop-loss % must be > 0"); return; }
    if (isNaN(tpPct)   || tpPct <= 0)   { toast.error("Take-profit % must be > 0"); return; }
    const symbols = form.symbols_raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: {
          action: "create", name: form.name.trim(), description: form.description.trim(),
          trading_mode: form.trading_mode, is_intraday: form.is_intraday,
          start_time: form.start_time, end_time: form.end_time, squareoff_time: form.squareoff_time,
          risk_per_trade_pct: riskPct, stop_loss_pct: slPct, take_profit_pct: tpPct, symbols,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || (res.data as any)?.error) {
        toast.error((res.data as any)?.error ?? "Failed to create strategy"); return;
      }
      toast.success(`Strategy "${form.name.trim()}" created`);
      setForm(EMPTY_STRATEGY);
      setShowCreate(false);
      await loadStrategies();
    } finally { setCreating(false); }
  };

  const copyWebhook = (s: Strategy) => {
    if (!s.webhook_url) { toast.error("No webhook URL yet"); return; }
    navigator.clipboard.writeText(s.webhook_url);
    setCopiedId(s.id);
    toast.success("Webhook URL copied");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fireSignal = async (strategy: Strategy, action: "BUY" | "SELL") => {
    const fs  = getFireState(strategy.id);
    const sym = fs.symbol.trim().toUpperCase() || (strategy.symbols?.[0] ?? "");
    if (!sym) { toast.error("Enter a symbol to fire this signal"); return; }
    setFireState(strategy.id, { firing: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("fire-strategy-signal", {
        body: { strategy_id: strategy.id, symbol: sym, exchange: fs.exchange, action, quantity: parseInt(fs.quantity) || 1, product: fs.product },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = res.data as any;
      if (res.error || result?.error) { toast.error(result?.error ?? "Signal failed"); }
      else {
        const oid = result?.orderid ?? result?.broker_order_id ?? "placed";
        toast.success(`${action} signal fired on "${strategy.name}" — ${sym} · #${String(oid).slice(-8)}`, { duration: 5000 });
        setFireState(strategy.id, { open: false });
      }
    } catch (e: any) { toast.error(e?.message ?? "Signal failed"); }
    finally { setFireState(strategy.id, { firing: false }); }
  };

  // ── Load all portfolio data ───────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-portfolio-data", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || (res.data as any)?.error) {
        setError((res.data as any)?.error ?? res.error?.message ?? "Failed to load portfolio");
      } else {
        setData(res.data as PortfolioData);
      }
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  // ── Live LTPs ────────────────────────────────────────────────────────────
  const refreshQuotes = useCallback(async (portfolio: PortfolioData) => {
    const symbols: Array<{ symbol: string; exchange: string }> = [
      ...portfolio.positions.map(p => ({ symbol: p.tradingsymbol ?? "", exchange: p.exchange ?? "NSE" })),
      ...portfolio.holdings.map(h => ({ symbol: h.tradingsymbol ?? "", exchange: h.exchange ?? "NSE" })),
    ].filter(s => s.symbol);
    if (!symbols.length) return;
    setQLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("broker-data", {
        body: { action: "multiquotes", symbols },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const raw = (res.data as any)?.data;
      const map: Record<string, number> = {};
      if (Array.isArray(raw)) {
        raw.forEach((q: any) => { if (q?.symbol && q?.ltp != null) map[q.symbol] = Number(q.ltp); });
      } else if (raw && typeof raw === "object") {
        Object.entries(raw).forEach(([sym, q]: [string, any]) => {
          if (q?.ltp != null) map[sym] = Number(q.ltp);
        });
      }
      if (Object.keys(map).length) { setLiveLtps(map); toast.success("Live quotes updated"); }
    } catch { toast.error("Could not fetch live quotes"); }
    finally { setQLoading(false); }
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const doAction = useCallback(async (action: string, params: Record<string, unknown>, label: string) => {
    const key = (params.orderid as string) ?? action;
    setActioning(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("broker-order-action", {
        body: { action, ...params },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = res.data as any;
      if (res.error || d?.error) { toast.error(`${label} failed: ${d?.error ?? res.error?.message}`); return false; }
      toast.success(`${label} successful`);
      await load(true);
      return true;
    } catch (e: any) { toast.error(`${label} error: ${e.message}`); return false; }
    finally { setActioning(null); }
  }, [load]);

  const handleCancel       = (o: OrderRow) => doAction("cancel", { orderid: o.orderid }, "Cancel order");
  const handleCloseAll     = async () => { if (!confirm("Close ALL open positions? This cannot be undone.")) return; await doAction("close_all_pos", {}, "Close all positions"); };
  const handleCancelAll    = async () => { if (!confirm("Cancel ALL open orders?")) return; await doAction("cancel_all", {}, "Cancel all orders"); };
  const handleModifySubmit = async () => {
    if (!modifyOrder) return;
    const ok = await doAction("modify", {
      orderid: modifyOrder.orderid, symbol: modifyOrder.tradingsymbol,
      exchange: modifyOrder.exchange ?? "NSE", order_action: modifyOrder.transactiontype ?? "BUY",
      product: modifyOrder.product ?? "CNC", pricetype: modifyType,
      price: Number(modifyPrice), quantity: Number(modifyQty),
    }, "Modify order");
    if (ok) setModifyOrder(null);
  };

  // ── Loading / Error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-teal-400 mr-2" />
          <span className="text-zinc-400 text-sm">Loading account data…</span>
        </CardContent>
      </Card>
    );
  }
  if (error) {
    const noInt = error.includes("NO_INTEGRATION") || error.includes("No active broker");
    return (
      <Alert className="bg-zinc-900 border-zinc-800">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertDescription className="text-zinc-400 text-sm">
          {noInt ? "Broker not connected. Sync your daily token above to view live account data." : error}
        </AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;

  // ── Derived values ───────────────────────────────────────────────────────
  const funds = data.funds as any ?? {};

  // Try every known field name across all brokers
  const available   = funds.availablecash ?? funds.net ?? funds.available_balance ?? funds.available_cash ?? funds.cash ?? 0;
  const used        = funds.utiliseddebits ?? funds.used_margin ?? funds.utilised_debits ?? funds.marginused ?? 0;
  const collateral  = funds.collateral ?? funds.collateral_liquid ?? 0;
  const m2m         = funds.m2munrealized ?? funds.m2m_unrealised ?? funds.mtm ?? 0;

  const openPositions  = data.positions.filter(p => Number(p.netqty ?? 0) !== 0);
  const positionsPnl   = data.positions.reduce((s, p) => s + Number(p.pnl ?? 0), 0);
  const holdingsPnl    = data.holdings.reduce((s, h) => s + Number(h.pnl ?? 0), 0);
  const totalPnl       = positionsPnl + holdingsPnl;
  const openOrders     = data.orders.filter(o => CANCELLABLE.includes((o.status ?? "").toLowerCase()));
  const completedToday = data.orders.filter(o => (o.status ?? "").toLowerCase() === "complete").length;

  // Pie chart data for positions P&L
  const pieData = openPositions.map(p => ({
    name: p.tradingsymbol ?? "",
    value: Math.abs(Number(p.pnl ?? 0)),
    color: Number(p.pnl ?? 0) >= 0 ? "#10b981" : "#ef4444",
  })).filter(d => d.value > 0);

  // Bar chart for tradebook buy/sell breakdown
  const tradeStats = (() => {
    const buys  = data.tradebook.filter(t => (t.transactiontype ?? "").toUpperCase() === "BUY");
    const sells = data.tradebook.filter(t => (t.transactiontype ?? "").toUpperCase() === "SELL");
    const buyVal  = buys.reduce((s, t)  => s + Number(t.tradedquantity ?? 0) * Number(t.averageprice ?? 0), 0);
    const sellVal = sells.reduce((s, t) => s + Number(t.tradedquantity ?? 0) * Number(t.averageprice ?? 0), 0);
    return { buyCnt: buys.length, sellCnt: sells.length, buyVal, sellVal };
  })();

  return (
    <>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-teal-400" />
              {(data.broker ?? "Broker").charAt(0).toUpperCase() + (data.broker ?? "broker").slice(1)} Account
            </CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              {data.token_expired && (
                <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Session Expired
                </Badge>
              )}
              {openPositions.length > 0 && (
                <Button size="sm" variant="destructive" onClick={handleCloseAll} disabled={!!actioning}
                  className="h-7 text-[11px] px-2 bg-red-600/80 hover:bg-red-600">
                  {actioning === "close_all_pos" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                  Close All ({openPositions.length})
                </Button>
              )}
              {openOrders.length > 0 && (
                <Button size="sm" variant="outline" onClick={handleCancelAll} disabled={!!actioning}
                  className="h-7 text-[11px] px-2 border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
                  {actioning === "cancel_all" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                  Cancel All ({openOrders.length})
                </Button>
              )}
              {data.positions.length + data.holdings.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => refreshQuotes(data)} disabled={quotesLoading}
                  className="h-7 px-2 text-[11px] text-amber-400 hover:text-amber-300 border border-zinc-700 hover:border-amber-500/40">
                  {quotesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                  Live LTP
                </Button>
              )}
              <Button
                onClick={() => setShowOrderModal(true)}
                size="sm"
                className="h-7 text-[11px] px-2.5 bg-teal-500 hover:bg-teal-400 text-black font-bold"
              >
                <Send className="h-3 w-3 mr-1" /> Place Order
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { load(true); toast.success("Refreshed"); }}
                className="h-7 w-7 p-0 text-zinc-500 hover:text-teal-400">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">

          {/* ── Funds Overview ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Available Cash", value: Number(available), icon: <Wallet className="h-3 w-3" />, color: "text-teal-400" },
              { label: "Used Margin",    value: Number(used),      icon: <Briefcase className="h-3 w-3" />, color: "text-amber-400" },
              { label: "Collateral",     value: Number(collateral),icon: <BarChart3 className="h-3 w-3" />,  color: "text-blue-400" },
              { label: "Today's P/L",   value: totalPnl,           icon: totalPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />, color: totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-zinc-800 rounded-xl p-3 border border-zinc-700/50">
                <p className={`text-[10px] flex items-center gap-1 mb-1 ${color}`}>{icon}{label}</p>
                <p className={`font-bold text-sm ${color}`}>
                  {label === "Today's P/L"
                    ? (Math.abs(value) < 0.005 ? "₹0.00" : `${value > 0 ? "+" : "−"}₹${Math.abs(value).toFixed(2)}`)
                    : fmt(value)}
                </p>
              </div>
            ))}
          </div>

          {/* ── Quick Stats ────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Open Positions", value: openPositions.length, color: "text-blue-400" },
              { label: "Holdings",       value: data.holdings.length, color: "text-purple-400" },
              { label: "Open Orders",    value: openOrders.length,    color: "text-amber-400" },
              { label: "Filled Today",   value: completedToday,       color: "text-emerald-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-zinc-800/50 rounded-lg p-2 border border-zinc-800">
                <p className={`font-bold text-lg ${color}`}>{value}</p>
                <p className="text-[9px] text-zinc-500 leading-tight mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* ── P&L Chart (positions) ──────────────────────────────────── */}
          {pieData.length > 0 && (
            <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-3">
              <p className="text-xs text-zinc-400 font-semibold mb-2">Open Positions P&L Breakdown</p>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={100}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" innerRadius={28} outerRadius={48} strokeWidth={0}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {pieData.slice(0, 5).map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        <span className="text-zinc-300 font-mono">{d.name}</span>
                      </span>
                      <span style={{ color: d.color }}>₹{d.value.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tradebook bar chart ────────────────────────────────────── */}
          {data.tradebook.length > 0 && (
            <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-3">
              <p className="text-xs text-zinc-400 font-semibold mb-2">Today's Trading Activity</p>
              <div className="flex items-center gap-4 mb-2">
                <span className="text-xs text-emerald-400">Buys: <strong>{tradeStats.buyCnt}</strong> (₹{(tradeStats.buyVal / 1000).toFixed(0)}K)</span>
                <span className="text-xs text-red-400">Sells: <strong>{tradeStats.sellCnt}</strong> (₹{(tradeStats.sellVal / 1000).toFixed(0)}K)</span>
                <span className="text-xs text-zinc-500">Total: {data.tradebook.length} trades</span>
              </div>
              <ResponsiveContainer width="100%" height={60}>
                <BarChart data={[{ name: "Today", Buy: tradeStats.buyCnt, Sell: tradeStats.sellCnt }]} barGap={4}>
                  <XAxis dataKey="name" hide />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }} />
                  <Bar dataKey="Buy"  fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="Sell" fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Tabs ──────────────────────────────────────────────────── */}
          <Tabs defaultValue="positions">
            <TabsList className="bg-zinc-800 border border-zinc-700 h-8 w-full grid grid-cols-5">
              {[
                { value: "positions",  label: "Positions", icon: <ArrowUpRight className="h-3 w-3 mr-0.5" />, count: data.positions.length },
                { value: "holdings",   label: "Holdings",  icon: <Briefcase className="h-3 w-3 mr-0.5" />,    count: data.holdings.length },
                { value: "orders",     label: "Orders",    icon: <ClipboardList className="h-3 w-3 mr-0.5" />, count: data.orders.length },
                { value: "tradebook",  label: "Trades",    icon: <BookOpen className="h-3 w-3 mr-0.5" />,      count: data.tradebook.length },
                { value: "strategies", label: "Strategies",icon: <Zap className="h-3 w-3 mr-0.5" />,          count: strategies.length },
              ].map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}
                  className="text-[11px] h-6 data-[state=active]:bg-teal-500 data-[state=active]:text-black flex items-center gap-0.5">
                  {tab.icon}{tab.label} ({tab.count})
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── Positions ─────────────────────────────────────────── */}
            <TabsContent value="positions" className="mt-2">
              {data.positions.length === 0 ? (
                <div className="text-center py-10">
                  <ArrowUpRight className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No positions today</p>
                  <p className="text-zinc-600 text-xs mt-1">Place an order to start trading</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-800/50">
                        {["Symbol", "Qty", "Avg", "LTP", "P&L", "Product", ""].map(h => (
                          <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.positions.map((p, i) => {
                        const hasQty  = Number(p.netqty ?? 0) !== 0;
                        const liveLtp = liveLtps[p.tradingsymbol ?? ""];
                        const ltp     = liveLtp ?? Number(p.ltp ?? 0);
                        const pnl     = liveLtp != null
                          ? (liveLtp - Number(p.avgprice ?? 0)) * Number(p.netqty ?? 0)
                          : Number(p.pnl ?? 0);
                        return (
                          <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-white font-mono">{p.tradingsymbol}</p>
                              <p className="text-zinc-600 text-[10px]">{p.exchange}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`font-bold ${Number(p.netqty ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {p.netqty}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-300 font-mono">{fmt(Number(p.avgprice))}</td>
                            <td className="px-3 py-2.5">
                              <span className={`font-mono ${liveLtp ? "text-amber-300" : "text-zinc-300"}`}>{ltp > 0 ? fmt(ltp) : "—"}</span>
                              {liveLtp && <span className="text-[9px] text-amber-400 ml-0.5">●</span>}
                            </td>
                            <td className="px-3 py-2.5"><PnlBadge value={pnl} /></td>
                            <td className="px-3 py-2.5 text-zinc-500">{p.product}</td>
                            <td className="px-3 py-2.5">
                              {hasQty && (
                                <Button size="sm" variant="destructive" disabled={!!actioning}
                                  onClick={() => doAction("close_all_pos", {}, `Close ${p.tradingsymbol}`)}
                                  className="h-6 text-[10px] px-2 bg-red-600/70 hover:bg-red-600">
                                  Close
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Holdings ──────────────────────────────────────────── */}
            <TabsContent value="holdings" className="mt-2">
              {data.holdings.length === 0 ? (
                <div className="text-center py-10">
                  <Briefcase className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No holdings</p>
                  <p className="text-zinc-600 text-xs mt-1">Buy stocks with CNC to see them here</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-800/50">
                        {["Symbol", "Qty", "Avg", "LTP", "Current Value", "P&L", "%"].map(h => (
                          <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.holdings.map((h, i) => {
                        const liveLtp   = liveLtps[h.tradingsymbol ?? ""];
                        const ltp       = liveLtp ?? Number(h.ltp ?? h.close ?? 0);
                        const pnl       = liveLtp != null
                          ? (liveLtp - Number(h.avgprice ?? 0)) * Number(h.quantity ?? 0)
                          : Number(h.pnl ?? 0);
                        const curVal    = ltp * Number(h.quantity ?? 0);
                        const pct       = Number(h.avgprice ?? 0) > 0
                          ? ((ltp - Number(h.avgprice ?? 0)) / Number(h.avgprice ?? 1)) * 100
                          : 0;
                        return (
                          <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-white font-mono">{h.tradingsymbol}</p>
                              <p className="text-zinc-600 text-[10px]">{h.exchange}</p>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-300">{h.quantity}</td>
                            <td className="px-3 py-2.5 text-zinc-300 font-mono">{fmt(Number(h.avgprice))}</td>
                            <td className="px-3 py-2.5">
                              <span className={`font-mono ${liveLtp ? "text-amber-300" : "text-zinc-300"}`}>{ltp > 0 ? fmt(ltp) : "—"}</span>
                              {liveLtp && <span className="text-[9px] text-amber-400 ml-0.5">●</span>}
                            </td>
                            <td className="px-3 py-2.5 text-zinc-300 font-mono">{curVal > 0 ? fmt(curVal) : "—"}</td>
                            <td className="px-3 py-2.5"><PnlBadge value={pnl} /></td>
                            <td className="px-3 py-2.5">
                              <span className={`text-xs font-semibold ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Orders ────────────────────────────────────────────── */}
            <TabsContent value="orders" className="mt-2">
              {data.orders.length === 0 ? (
                <div className="text-center py-10">
                  <ClipboardList className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No orders today</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900 z-10">
                      <tr className="border-b border-zinc-800 bg-zinc-800/80">
                        {["Symbol", "Type", "Qty/Filled", "Price", "Product", "Status", "Time", ""].map(h => (
                          <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.slice(0, 50).map((o, i) => {
                        const canCancel  = CANCELLABLE.includes((o.status ?? "").toLowerCase());
                        const isBuy      = (o.transactiontype ?? "").toUpperCase() === "BUY";
                        return (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                {isBuy
                                  ? <ArrowUpRight className="h-3 w-3 text-emerald-400 shrink-0" />
                                  : <ArrowDownRight className="h-3 w-3 text-red-400 shrink-0" />}
                                <span className="font-mono text-white font-semibold">{o.tradingsymbol}</span>
                              </div>
                              <p className="text-zinc-600 text-[10px] ml-4">{o.exchange}</p>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`font-bold text-[11px] ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{o.transactiontype}</span>
                            </td>
                            <td className="px-3 py-2 text-zinc-300">
                              {o.quantity}
                              {o.filledquantity != null && o.filledquantity !== o.quantity && (
                                <span className="text-zinc-600"> / {o.filledquantity}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-zinc-300 font-mono">
                              {o.averageprice ? fmt(Number(o.averageprice)) : fmt(Number(o.price))}
                            </td>
                            <td className="px-3 py-2 text-zinc-500">{o.product}</td>
                            <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                            <td className="px-3 py-2 text-zinc-600 text-[10px]">
                              {(o.updatetime ?? o.ordertime ?? "").slice(11, 19)}
                            </td>
                            <td className="px-3 py-2">
                              {canCancel && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" disabled={!!actioning}
                                    onClick={() => { setModifyOrder(o); setModifyPrice(String(o.price ?? o.averageprice ?? "")); setModifyQty(String(o.quantity ?? "")); setModifyType(o.pricetype ?? "LIMIT"); }}
                                    className="h-5 px-1.5 text-[10px] border-blue-500/40 text-blue-400 hover:bg-blue-500/10">
                                    <Pencil className="h-2.5 w-2.5" />
                                  </Button>
                                  <Button size="sm" variant="destructive" disabled={!!actioning}
                                    onClick={() => handleCancel(o)}
                                    className="h-5 px-1.5 text-[10px] bg-red-600/70 hover:bg-red-600">
                                    {actioning === o.orderid ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                                  </Button>
                                </div>
                              )}
                              {o.rejectreason && (
                                <p className="text-[9px] text-red-400 max-w-[120px] truncate">{o.rejectreason}</p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Tradebook ─────────────────────────────────────────── */}
            <TabsContent value="tradebook" className="mt-2">
              {data.tradebook.length === 0 ? (
                <div className="text-center py-10">
                  <BookOpen className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No executed trades today</p>
                  <p className="text-zinc-600 text-xs mt-1">Confirmed fills will appear here</p>
                </div>
              ) : (
                <>
                  {/* Summary row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                      <p className="text-emerald-400 text-xs font-bold">{tradeStats.buyCnt} Buys</p>
                      <p className="text-zinc-400 text-[10px]">₹{(tradeStats.buyVal/1000).toFixed(1)}K value</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                      <p className="text-red-400 text-xs font-bold">{tradeStats.sellCnt} Sells</p>
                      <p className="text-zinc-400 text-[10px]">₹{(tradeStats.sellVal/1000).toFixed(1)}K value</p>
                    </div>
                    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-center">
                      <p className="text-zinc-300 text-xs font-bold">{data.tradebook.length} Total</p>
                      <p className="text-zinc-500 text-[10px]">Filled trades</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr className="border-b border-zinc-800 bg-zinc-800/80">
                          {["Symbol", "Side", "Qty", "Avg Price", "Product", "Time"].map(h => (
                            <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.tradebook.map((t, i) => {
                          const isBuy = (t.transactiontype ?? "").toUpperCase() === "BUY";
                          return (
                            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                              <td className="px-3 py-2">
                                <p className="font-mono text-white font-semibold">{t.tradingsymbol}</p>
                                <p className="text-zinc-600 text-[10px]">{t.exchange}</p>
                              </td>
                              <td className="px-3 py-2">
                                <Badge className={`text-[10px] font-bold border ${isBuy ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                                  {t.transactiontype}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-zinc-300">{t.tradedquantity}</td>
                              <td className="px-3 py-2 text-zinc-300 font-mono">₹{Number(t.averageprice ?? 0).toFixed(2)}</td>
                              <td className="px-3 py-2 text-zinc-500">{t.product}</td>
                              <td className="px-3 py-2 text-zinc-600 text-[10px]">
                                {(t.tradetime ?? t.ordertime ?? "").slice(11, 19)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </TabsContent>
            {/* ── Strategies ────────────────────────────────────────── */}
            <TabsContent value="strategies" className="mt-2 space-y-3">
              {/* Header row with Add button */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400 font-semibold flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-purple-400" /> Auto Strategies
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={loadStrategies} className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors" title="Refresh">
                    <RefreshCw className={`h-3 w-3 ${stratLoading ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 text-[11px] text-zinc-400 hover:text-white hover:border-purple-500/50 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> New Strategy
                  </button>
                </div>
              </div>

              {/* Strategy list */}
              {stratLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                </div>
              ) : strategies.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="h-8 w-8 text-zinc-800 mx-auto mb-2" />
                  <p className="text-xs text-zinc-600">No strategies yet</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">Create one to get a webhook URL for auto-execution</p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg border border-purple-500/30 text-[11px] text-purple-400 hover:bg-purple-500/10 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Create your first strategy
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {strategies.map(s => {
                    const fs = getFireState(s.id);
                    return (
                      <div key={s.id} className={`rounded-xl border transition-colors ${
                        s.is_active ? "bg-purple-500/5 border-purple-500/20" : "bg-zinc-900 border-zinc-800"
                      }`}>
                        {/* Header */}
                        <div className="flex items-center gap-2 p-3">
                          <span className="flex-1 text-sm font-semibold text-white truncate">{s.name}</span>
                          {/* Fire Signal */}
                          <button
                            onClick={() => setFireState(s.id, { open: !fs.open })}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                              fs.open ? "bg-teal-500/20 border-teal-500/40 text-teal-300" : "border-zinc-700 text-zinc-500 hover:border-teal-500/40 hover:text-teal-400"
                            }`}
                          >
                            <Zap className="h-3 w-3" /> Execute
                          </button>
                          {/* Active toggle */}
                          <button
                            onClick={() => toggleStrategy(s.id)}
                            disabled={toggleLoading === s.id}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                              s.is_active ? "bg-purple-600" : "bg-zinc-700"
                            } disabled:opacity-60`}
                            title={s.is_active ? "Deactivate" : "Activate"}
                          >
                            {toggleLoading === s.id
                              ? <Loader2 className="h-3 w-3 text-white mx-auto animate-spin" />
                              : <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                  s.is_active ? "translate-x-[18px]" : "translate-x-0.5"
                                }`} />}
                          </button>
                          {/* Delete */}
                          <button onClick={() => deleteStrategy(s.id, s.name)} className="p-0.5 text-zinc-700 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Meta badges */}
                        <div className="flex items-center gap-1.5 flex-wrap px-3 pb-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            s.is_active ? "bg-purple-500/15 text-purple-300" : "bg-zinc-800 text-zinc-500"
                          }`}>{s.is_active ? "● ACTIVE" : "○ INACTIVE"}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{s.trading_mode}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{s.is_intraday ? "Intraday" : "Positional"}</span>
                          <span className="text-[10px] text-zinc-700">{s.start_time}–{s.end_time}</span>
                          {s.stop_loss_pct && <span className="text-[10px] text-red-500/70">SL {s.stop_loss_pct}%</span>}
                          {s.take_profit_pct && <span className="text-[10px] text-green-500/70">TP {s.take_profit_pct}%</span>}
                        </div>

                        {/* Fire Signal panel */}
                        {fs.open && (
                          <div className="mx-3 mb-3 rounded-lg border border-teal-500/20 bg-zinc-950 p-3 space-y-3">
                            <p className="text-[11px] font-semibold text-teal-400 flex items-center gap-1.5">
                              <Zap className="h-3 w-3" /> Fire Signal — {s.name}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-zinc-600 text-[10px]">Symbol *</Label>
                                <Input
                                  placeholder={s.symbols?.[0] ?? "RELIANCE"}
                                  value={fs.symbol}
                                  onChange={e => setFireState(s.id, { symbol: e.target.value.toUpperCase() })}
                                  className="bg-zinc-900 border-zinc-700 text-white font-mono text-xs h-8"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-zinc-600 text-[10px]">Exchange</Label>
                                <Select value={fs.exchange} onValueChange={v => setFireState(s.id, { exchange: v })}>
                                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-zinc-900 border-zinc-700">
                                    {EXCHANGES_LIST.map(e => (
                                      <SelectItem key={e} value={e} className="text-xs text-zinc-200">{e}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-zinc-600 text-[10px]">Quantity</Label>
                                <Input
                                  type="number" min={1}
                                  value={fs.quantity}
                                  onChange={e => setFireState(s.id, { quantity: e.target.value })}
                                  className="bg-zinc-900 border-zinc-700 text-white text-xs h-8"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-zinc-600 text-[10px]">Product</Label>
                                <Select value={fs.product} onValueChange={v => setFireState(s.id, { product: v })}>
                                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-zinc-900 border-zinc-700">
                                    {PRODUCT_LIST.map(p => (
                                      <SelectItem key={p} value={p} className="text-xs text-zinc-200">{p}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => fireSignal(s, "BUY")} disabled={fs.firing}
                                className="py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {fs.firing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><TrendingUp className="h-3.5 w-3.5" /> BUY Signal</>}
                              </button>
                              <button
                                onClick={() => fireSignal(s, "SELL")} disabled={fs.firing}
                                className="py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {fs.firing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><TrendingDown className="h-3.5 w-3.5" /> SELL Signal</>}
                              </button>
                            </div>
                            <p className="text-[10px] text-zinc-700 text-center">MARKET order · executes instantly on {brokerLabel}</p>
                          </div>
                        )}

                        {/* Webhook URL */}
                        {s.webhook_url && (
                          <div className="flex items-center gap-1.5 mx-3 mb-3 bg-black/30 border border-zinc-800 rounded p-1.5">
                            <Webhook className="h-3 w-3 text-zinc-600 shrink-0" />
                            <code className="text-[9px] text-zinc-600 truncate flex-1">{s.webhook_url}</code>
                            <button onClick={() => copyWebhook(s)} className="shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors">
                              {copiedId === s.id ? <CheckCircle2 className="h-3 w-3 text-teal-400" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Webhook guide toggle */}
              <button
                onClick={() => setShowGuide(g => !g)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <span className="flex items-center gap-1.5"><Webhook className="h-3 w-3 text-zinc-600" /> Connect external signal source (optional)</span>
                <ChevronRight className={`h-3 w-3 transition-transform ${showGuide ? "rotate-90" : ""}`} />
              </button>
              {showGuide && (
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-3 space-y-2">
                  <p className="text-[10px] text-zinc-400">Each strategy has a webhook URL. Any system that can make HTTP POST requests can trigger orders automatically — your own script, Pine Script alert, cron job, anything.</p>
                  <div className="p-2 bg-zinc-950 rounded text-[9px] text-zinc-500 font-mono break-all">
                    {`POST {webhook_url}`}<br/>{`{"action":"BUY","symbol":"RELIANCE","exchange":"NSE","quantity":10,"product":"MIS","pricetype":"MARKET"}`}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Create Strategy Dialog ──────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) { setShowCreate(false); setForm(EMPTY_STRATEGY); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="h-4 w-4 text-purple-400" />
              New Strategy
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Define your strategy parameters and get a webhook URL for auto-execution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name + Description */}
            <div className="space-y-2.5">
              <div className="space-y-1">
                <Label className="text-zinc-500 text-[11px]">Strategy Name *</Label>
                <Input
                  placeholder="e.g. NIFTY Scalper, BTST Momentum"
                  value={form.name}
                  onChange={e => setF("name", e.target.value)}
                  className="bg-zinc-950 border-zinc-700 text-white text-xs h-8"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-500 text-[11px]">Description (optional)</Label>
                <Input
                  placeholder="Short description of the strategy"
                  value={form.description}
                  onChange={e => setF("description", e.target.value)}
                  className="bg-zinc-950 border-zinc-700 text-white text-xs h-8"
                />
              </div>
            </div>

            {/* Direction + Session */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-zinc-500 text-[11px]">Direction</Label>
                <Select value={form.trading_mode} onValueChange={v => setF("trading_mode", v)}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-200 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="LONG"  className="text-xs text-zinc-200">LONG only</SelectItem>
                    <SelectItem value="SHORT" className="text-xs text-zinc-200">SHORT only</SelectItem>
                    <SelectItem value="BOTH"  className="text-xs text-zinc-200">LONG &amp; SHORT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-500 text-[11px]">Session Type</Label>
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-zinc-950 border border-zinc-700 rounded-md h-8">
                  <button
                    onClick={() => setF("is_intraday", true)}
                    className={`rounded text-[11px] font-medium transition-colors ${form.is_intraday ? "bg-purple-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >Intraday</button>
                  <button
                    onClick={() => setF("is_intraday", false)}
                    className={`rounded text-[11px] font-medium transition-colors ${!form.is_intraday ? "bg-purple-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >Positional</button>
                </div>
              </div>
            </div>

            {/* Trading Hours */}
            <div>
              <Label className="text-zinc-500 text-[11px] block mb-1.5">Trading Hours (IST)</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Start",    field: "start_time"    as const, val: form.start_time },
                  { label: "End",      field: "end_time"      as const, val: form.end_time },
                  { label: "Squareoff",field: "squareoff_time"as const, val: form.squareoff_time },
                ].map(({ label, field, val }) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-zinc-600 text-[10px]">{label}</Label>
                    <Input type="time" value={val} onChange={e => setF(field, e.target.value)}
                      className="bg-zinc-950 border-zinc-700 text-white text-xs h-8 px-2" />
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Management */}
            <div>
              <Label className="text-zinc-500 text-[11px] block mb-1.5">Risk Management</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Risk / Trade %",  field: "risk_per_trade_pct" as const, val: form.risk_per_trade_pct, color: "text-white" },
                  { label: "Stop-Loss %",     field: "stop_loss_pct"      as const, val: form.stop_loss_pct,      color: "text-red-400" },
                  { label: "Take-Profit %",   field: "take_profit_pct"    as const, val: form.take_profit_pct,    color: "text-green-400" },
                ].map(({ label, field, val, color }) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-zinc-600 text-[10px]">{label}</Label>
                    <div className="relative">
                      <Input type="number" min="0.1" step="0.1" max="100" value={val}
                        onChange={e => setF(field, e.target.value)}
                        className={`bg-zinc-950 border-zinc-700 text-xs h-8 pr-5 ${color}`} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-zinc-700 mt-1.5">Risk/trade: % of capital per signal. SL &amp; TP: % move from entry.</p>
            </div>

            {/* Symbols */}
            <div className="space-y-1">
              <Label className="text-zinc-500 text-[11px]">Symbols (optional, comma-separated)</Label>
              <Input
                placeholder="RELIANCE, TCS, NIFTY25MARFUT"
                value={form.symbols_raw}
                onChange={e => setF("symbols_raw", e.target.value.toUpperCase())}
                className="bg-zinc-950 border-zinc-700 text-white font-mono text-xs h-8"
              />
              <p className="text-[10px] text-zinc-700">Leave blank to allow any symbol via webhook payload</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCreate(false); setForm(EMPTY_STRATEGY); }} className="border-zinc-700">
              Cancel
            </Button>
            <Button
              onClick={createStrategy}
              disabled={creating || !form.name.trim()}
              className="bg-purple-600 hover:bg-purple-500 font-bold"
            >
              {creating
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</>
                : <><Zap className="h-3.5 w-3.5 mr-1.5" />Create Strategy &amp; Get Webhook</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Place Order Dialog ────────────────────────────────────────────── */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Send className="h-4 w-4 text-teal-400" />
              Place Order
              <span className="ml-auto text-[10px] text-zinc-600 font-normal">via {brokerLabel}</span>
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs sr-only">
              Place a live or AMO order via your connected broker.
            </DialogDescription>
          </DialogHeader>
          <PlaceOrderPanel
            broker={broker}
            onOrderPlaced={() => { setShowOrderModal(false); load(true); }}
            asModal
          />
        </DialogContent>
      </Dialog>

      {/* ── Modify Order Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!modifyOrder} onOpenChange={(o) => !o && setModifyOrder(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Pencil className="h-4 w-4 text-blue-400" />
              Modify Order — {modifyOrder?.tradingsymbol}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Update price and/or quantity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Price Type</Label>
              <div className="flex gap-2">
                {["LIMIT", "MARKET", "SL", "SL-M"].map(t => (
                  <button key={t} onClick={() => setModifyType(t)}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${modifyType === t ? "bg-teal-500 text-black border-teal-500 font-bold" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Price</Label>
                <Input type="number" step="0.05" min="0" value={modifyPrice} onChange={e => setModifyPrice(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Quantity</Label>
                <Input type="number" min="1" step="1" value={modifyQty} onChange={e => setModifyQty(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModifyOrder(null)} className="border-zinc-700">Cancel</Button>
            <Button onClick={handleModifySubmit} disabled={!!actioning || !modifyPrice || !modifyQty} className="bg-blue-600 hover:bg-blue-500 font-bold">
              {actioning === modifyOrder?.orderid ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Modifying…</> : <><Pencil className="h-3.5 w-3.5 mr-1.5" />Modify Order</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
