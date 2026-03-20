/**
 * TradingDashboardPage — /trading-dashboard
 *
 * Two-column layout:
 *  Left  (60%): BrokerSyncSection + Live Portfolio card
 *  Right (40%): Sticky Place Order panel + Strategies panel
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Navigate } from "react-router-dom";
import {
  ArrowLeft, Send, Loader2, Info, Zap, Copy, RefreshCw,
  TrendingUp, TrendingDown, Search, ChevronDown, Plus,
  Trash2, ToggleLeft, ToggleRight, Webhook, BookOpen,
  AlertTriangle, CheckCircle2, ExternalLink, Clock, ChevronRight, LineChart, ScrollText, Target,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import BrokerSyncSection from "@/components/trading/BrokerSyncSection";
import BrokerPortfolioCard from "@/components/trading/BrokerPortfolioCard";
import PlaceOrderPanel from "@/components/trading/PlaceOrderPanel";
import BacktestingSection from "@/components/trading/BacktestingSection";
import StatementSection from "@/components/trading/StatementSection";
import { StrategyEntrySignalsPanel } from "@/components/prediction/StrategyEntrySignalsPanel";

// ── Constants ─────────────────────────────────────────────────────────────────
const EXCHANGES = [
  { value: "NSE",   label: "NSE — National Stock Exchange" },
  { value: "BSE",   label: "BSE — Bombay Stock Exchange" },
  { value: "NFO",   label: "NFO — NSE Futures & Options" },
  { value: "BFO",   label: "BFO — BSE Futures & Options" },
  { value: "CDS",   label: "CDS — Currency Derivatives" },
  { value: "MCX",   label: "MCX — Multi Commodity Exchange" },
  { value: "NCDEX", label: "NCDEX — National Commodity & Derivatives" },
];

const PRODUCT_TYPES = [
  { value: "CNC",  label: "CNC — Delivery" },
  { value: "MIS",  label: "MIS — Intraday" },
  { value: "NRML", label: "NRML — F&O Carry" },
  { value: "CO",   label: "CO — Cover Order" },
  { value: "BO",   label: "BO — Bracket Order" },
];

const ORDER_TYPES = [
  { value: "MARKET", label: "MARKET" },
  { value: "LIMIT",  label: "LIMIT" },
  { value: "SL",     label: "SL — Stop-Loss" },
  { value: "SL-M",   label: "SL-M — SL Market" },
];

// Quick-pick symbols for each exchange
const QUICK_PICKS: Record<string, { symbol: string; label: string }[]> = {
  NSE: [
    { symbol: "RELIANCE",  label: "RELIANCE" },
    { symbol: "TCS",       label: "TCS" },
    { symbol: "HDFCBANK",  label: "HDFCBANK" },
    { symbol: "INFY",      label: "INFY" },
    { symbol: "SBIN",      label: "SBIN" },
  ],
  NFO: [
    { symbol: "NIFTY",     label: "NIFTY" },
    { symbol: "BANKNIFTY", label: "BANKNIFTY" },
    { symbol: "FINNIFTY",  label: "FINNIFTY" },
  ],
};

// ── Market Status ─────────────────────────────────────────────────────────────
// NSE/BSE regular hours in IST (UTC+5:30)
// Pre-market:   09:00 – 09:15
// Market open:  09:15 – 15:30
// Post-market:  15:30 – 16:00  (AMO accepted)
// Closed:       otherwise / weekends

type MarketSession = "pre_market" | "open" | "post_market" | "closed" | "weekend";

interface MarketStatus {
  session: MarketSession;
  label: string;
  sublabel: string;
  color: string;          // tailwind text color
  bg: string;             // tailwind bg/border
  dot: string;            // dot bg color
  opensIn?: string;       // "opens in Xh Ym"
  closesIn?: string;      // "closes in Xh Ym"
}

function getISTNow(): { h: number; m: number; day: number } {
  // day: 0=Sun,1=Mon…6=Sat
  const now = new Date();
  // IST = UTC + 5h 30m
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + 5.5 * 3600000);
  return { h: ist.getHours(), m: ist.getMinutes(), day: ist.getDay() };
}

function toMinutes(h: number, m: number) { return h * 60 + m; }

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function computeMarketStatus(): MarketStatus {
  const { h, m, day } = getISTNow();
  const now = toMinutes(h, m);

  const PRE_START  = toMinutes(9,  0);
  const MKT_START  = toMinutes(9, 15);
  const MKT_END    = toMinutes(15, 30);
  const POST_END   = toMinutes(16,  0);

  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    // Next Monday open = Mon 09:15
    const daysToMon = day === 6 ? 2 : 1;
    return {
      session: "weekend",
      label: "Market Closed",
      sublabel: `Weekend — opens Mon 9:15 AM IST`,
      color: "text-zinc-400",
      bg: "bg-zinc-800/40 border-zinc-700/40",
      dot: "bg-zinc-500",
    };
  }

  if (now < PRE_START) {
    const opensIn = fmtDuration(MKT_START - now);
    return {
      session: "closed",
      label: "Market Closed",
      sublabel: `Pre-market starts 9:00 AM IST`,
      color: "text-zinc-400",
      bg: "bg-zinc-800/40 border-zinc-700/40",
      dot: "bg-zinc-500",
      opensIn,
    };
  }

  if (now >= PRE_START && now < MKT_START) {
    const opensIn = fmtDuration(MKT_START - now);
    return {
      session: "pre_market",
      label: "Pre-Market",
      sublabel: `Call auction — regular session in ${opensIn}`,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      dot: "bg-amber-400",
      opensIn,
    };
  }

  if (now >= MKT_START && now < MKT_END) {
    const closesIn = fmtDuration(MKT_END - now);
    return {
      session: "open",
      label: "Market Open",
      sublabel: `NSE/BSE live — closes in ${closesIn} (3:30 PM IST)`,
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/20",
      dot: "bg-green-400",
      closesIn,
    };
  }

  if (now >= MKT_END && now < POST_END) {
    return {
      session: "post_market",
      label: "After-Market (AMO)",
      sublabel: "Orders queued & executed at next open",
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
      dot: "bg-blue-400",
    };
  }

  return {
    session: "closed",
    label: "Market Closed",
    sublabel: "Opens 9:00 AM IST (Mon–Fri)",
    color: "text-zinc-400",
    bg: "bg-zinc-800/40 border-zinc-700/40",
    dot: "bg-zinc-500",
  };
}

function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(computeMarketStatus);

  useEffect(() => {
    // Recompute every 30 seconds
    const id = setInterval(() => setStatus(computeMarketStatus()), 30000);
    return () => clearInterval(id);
  }, []);

  return status;
}

// ── Types ──────────────────────────────────────────────────────────────────────
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

interface SymbolResult {
  symbol: string;
  description: string;
  full_symbol: string;
  exchange: string;
  type: string;
}

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
  openalgo_webhook_id?: string;
  webhook_url?: string | null;
  risk_per_trade_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  created_at: string;
}

// ── Strategy form defaults ────────────────────────────────────────────────────
interface StrategyForm {
  name: string;
  description: string;
  trading_mode: string;       // LONG | SHORT | BOTH
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  risk_per_trade_pct: string;
  stop_loss_pct: string;
  take_profit_pct: string;
  symbols_raw: string;        // comma-separated input → parsed to array on submit
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

// ── StrategiesPanel ────────────────────────────────────────────────────────────
function StrategiesPanel({ broker }: { broker: string }) {
  const [showGuide, setShowGuide] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<StrategyForm>(EMPTY_STRATEGY);
  const [creating, setCreating] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [entryExitOpen, setEntryExitOpen] = useState<Record<string, boolean>>({});
  // Per-strategy fire-signal state
  const [firePanel, setFirePanel] = useState<Record<string, {
  open: boolean;
    symbol: string;
    exchange: string;
    quantity: string;
    product: string;
    firing: boolean;
    aiOverride: boolean;
  }>>({});
  const brokerLabel = broker.charAt(0).toUpperCase() + broker.slice(1);

  const setF = <K extends keyof StrategyForm>(k: K, v: StrategyForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const getFireState = (id: string) => firePanel[id] ?? {
    open: false, symbol: "", exchange: "NSE", quantity: "1", product: "MIS", firing: false, aiOverride: false,
  };

  const setFireState = (id: string, patch: Partial<typeof firePanel[string]>) =>
    setFirePanel(fp => ({ ...fp, [id]: { ...getFireState(id), ...patch } }));

  const fireSignal = async (strategy: Strategy, action: "BUY" | "SELL") => {
    const fs = getFireState(strategy.id);
    const sym = fs.symbol.trim().toUpperCase() || (strategy.symbols?.[0] ?? "");
    if (!sym) { toast.error("Enter a symbol to fire this signal"); return; }
    const qty = parseInt(fs.quantity) || 1;

    setFireState(strategy.id, { firing: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Use fire-strategy-signal which routes the order under THIS strategy
      // and skips the admin assignment check (user owns the strategy)
      const res = await supabase.functions.invoke("fire-strategy-signal", {
        body: {
          strategy_id: strategy.id,
          symbol:      sym,
          exchange:    fs.exchange,
          action,
          quantity:    qty,
          product:     fs.product,
          ai_override: fs.aiOverride ?? false,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = res.data as any;
      if (res.error || result?.error) {
        const aiRejection = result?.ai_override;
        if (aiRejection?.decision === "REJECT") {
          toast.error(
            `AI Override REJECTED: ${aiRejection.reason}\n\nRisks: ${(aiRejection.risks ?? []).join(", ")}\nSuggested: ${aiRejection.suggestedAction ?? "Wait."}`,
            { duration: 15000 },
          );
        } else {
          toast.error(result?.error ?? "Signal failed");
        }
    } else {
        const oid = result?.orderid ?? result?.broker_order_id ?? "placed";
        toast.success(
          `${action} signal fired on "${strategy.name}" — ${sym} · #${String(oid).slice(-8)}`,
          { duration: 5000 }
        );
        setFireState(strategy.id, { open: false });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Signal failed");
    } finally {
      setFireState(strategy.id, { firing: false });
    }
  };

  const loadStrategies = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setStrategies((res.data as any)?.strategies ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStrategies(); }, []);

  const toggleStrategy = async (id: string) => {
    setToggleLoading(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke("manage-strategy", {
        body: { action: "toggle", strategy_id: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      await loadStrategies();
    } finally {
      setToggleLoading(null);
    }
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
    } catch {
      toast.error("Failed to delete strategy");
    }
  };

  const createStrategy = async () => {
    if (!form.name.trim()) { toast.error("Strategy name is required"); return; }
    const riskPct = parseFloat(form.risk_per_trade_pct);
    const slPct   = parseFloat(form.stop_loss_pct);
    const tpPct   = parseFloat(form.take_profit_pct);
    if (isNaN(riskPct) || riskPct <= 0) { toast.error("Risk % must be > 0"); return; }
    if (isNaN(slPct)   || slPct <= 0)   { toast.error("Stop-loss % must be > 0"); return; }
    if (isNaN(tpPct)   || tpPct <= 0)   { toast.error("Take-profit % must be > 0"); return; }

    const symbols = form.symbols_raw
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: {
          action:              "create",
          name:                form.name.trim(),
          description:         form.description.trim(),
          trading_mode:        form.trading_mode,
          is_intraday:         form.is_intraday,
          start_time:          form.start_time,
          end_time:            form.end_time,
          squareoff_time:      form.squareoff_time,
          risk_per_trade_pct:  riskPct,
          stop_loss_pct:       slPct,
          take_profit_pct:     tpPct,
          symbols,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || (res.data as any)?.error) {
        toast.error((res.data as any)?.error ?? "Failed to create strategy");
        return;
      }
      toast.success(`Strategy "${form.name.trim()}" created`);
      setForm(EMPTY_STRATEGY);
      setShowCreate(false);
      await loadStrategies();
    } finally {
      setCreating(false);
    }
  };

  const copyWebhook = (strategy: Strategy) => {
    const url = strategy.webhook_url;
    if (!url) { toast.error("No webhook URL — strategy may not be synced to OpenAlgo yet"); return; }
    navigator.clipboard.writeText(url);
    setCopiedId(strategy.id);
    toast.success("Webhook URL copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Card className="bg-zinc-950 border border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-purple-400" />
            Auto Strategies
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <button
              onClick={loadStrategies}
              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 text-[11px] text-zinc-400 hover:text-white hover:border-purple-500/50 transition-colors"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">
          Execute trades directly from ChartMate or connect any signal source
          </p>
        </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Create form — full details */}
        {showCreate && (
          <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-purple-400" />
                New Strategy
              </p>
              <button
                onClick={() => { setShowCreate(false); setForm(EMPTY_STRATEGY); }}
                className="text-zinc-600 hover:text-zinc-300 text-[10px]"
              >
                ✕ Cancel
              </button>
          </div>

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

            {/* Trading Mode + Session Type */}
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
                    className={`rounded text-[11px] font-medium transition-colors ${
                      form.is_intraday ? "bg-purple-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Intraday
                  </button>
                  <button
                    onClick={() => setF("is_intraday", false)}
                    className={`rounded text-[11px] font-medium transition-colors ${
                      !form.is_intraday ? "bg-purple-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Positional
                  </button>
                    </div>
                  </div>
                </div>

            {/* Trading Hours */}
            <div>
              <Label className="text-zinc-500 text-[11px] block mb-1.5">Trading Hours (IST)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-zinc-600 text-[10px]">Start</Label>
                  <Input
                    type="time"
                    value={form.start_time}
                    onChange={e => setF("start_time", e.target.value)}
                    className="bg-zinc-950 border-zinc-700 text-white text-xs h-8 px-2"
                  />
                    </div>
                <div className="space-y-1">
                  <Label className="text-zinc-600 text-[10px]">End</Label>
                  <Input
                    type="time"
                    value={form.end_time}
                    onChange={e => setF("end_time", e.target.value)}
                    className="bg-zinc-950 border-zinc-700 text-white text-xs h-8 px-2"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-600 text-[10px]">Squareoff</Label>
                  <Input
                    type="time"
                    value={form.squareoff_time}
                    onChange={e => setF("squareoff_time", e.target.value)}
                    className="bg-zinc-950 border-zinc-700 text-white text-xs h-8 px-2"
                  />
                </div>
                  </div>
                </div>

            {/* Risk Management */}
            <div>
              <Label className="text-zinc-500 text-[11px] block mb-1.5">Risk Management</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-zinc-600 text-[10px]">Risk / Trade %</Label>
                  <div className="relative">
                        <Input
                      type="number" min="0.1" step="0.1" max="100"
                      value={form.risk_per_trade_pct}
                      onChange={e => setF("risk_per_trade_pct", e.target.value)}
                      className="bg-zinc-950 border-zinc-700 text-white text-xs h-8 pr-5"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">%</span>
                      </div>
                    </div>
                <div className="space-y-1">
                  <Label className="text-zinc-600 text-[10px]">Stop-Loss %</Label>
                  <div className="relative">
                      <Input
                      type="number" min="0.1" step="0.1" max="100"
                      value={form.stop_loss_pct}
                      onChange={e => setF("stop_loss_pct", e.target.value)}
                      className="bg-zinc-950 border-zinc-700 text-red-400 text-xs h-8 pr-5"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">%</span>
                    </div>
              </div>
                <div className="space-y-1">
                  <Label className="text-zinc-600 text-[10px]">Take-Profit %</Label>
                  <div className="relative">
                      <Input
                      type="number" min="0.1" step="0.1" max="100"
                      value={form.take_profit_pct}
                      onChange={e => setF("take_profit_pct", e.target.value)}
                      className="bg-zinc-950 border-zinc-700 text-green-400 text-xs h-8 pr-5"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">%</span>
              </div>
              </div>
              </div>
              <p className="text-[10px] text-zinc-700 mt-1.5">
                Risk/trade: % of capital per signal. SL &amp; TP: % move from entry.
              </p>
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

            {/* Submit */}
            <button
              onClick={createStrategy}
              disabled={creating || !form.name.trim()}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {creating
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating…</>
                : <><Zap className="h-3.5 w-3.5" />Create Strategy &amp; Get Webhook URL</>
              }
            </button>
              </div>
        )}

        {/* Strategy list */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                    </div>
        ) : strategies.length === 0 ? (
          <div className="text-center py-5">
            <Zap className="h-7 w-7 text-zinc-800 mx-auto mb-2" />
            <p className="text-xs text-zinc-600">No strategies yet</p>
            <p className="text-[10px] text-zinc-700 mt-0.5">Create one to get a webhook URL for auto-execution</p>
          </div>
        ) : (
                    <div className="space-y-2">
            {strategies.map(s => {
              const fs = getFireState(s.id);
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border transition-colors ${
                    s.is_active
                      ? "bg-purple-500/5 border-purple-500/20"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 p-3">
                    <span className="flex-1 text-sm font-semibold text-white truncate">{s.name}</span>

                    {/* Fire Signal button */}
                    <button
                      onClick={() => setFireState(s.id, { open: !fs.open })}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                        fs.open
                          ? "bg-teal-500/20 border-teal-500/40 text-teal-300"
                          : "border-zinc-700 text-zinc-500 hover:border-teal-500/40 hover:text-teal-400"
                      }`}
                      title="Fire a signal directly from ChartMate"
                    >
                      <Zap className="h-3 w-3" />
                      Execute
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
                      {toggleLoading === s.id ? (
                        <Loader2 className="h-3 w-3 text-white mx-auto animate-spin" />
                      ) : (
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          s.is_active ? "translate-x-[18px]" : "translate-x-0.5"
                        }`} />
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => deleteStrategy(s.id, s.name)}
                      className="p-0.5 text-zinc-700 hover:text-red-400 transition-colors"
                      title="Delete strategy"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                </div>

                  {/* Meta badges */}
                  <div className="flex items-center gap-1.5 flex-wrap px-3 pb-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      s.is_active ? "bg-purple-500/15 text-purple-300" : "bg-zinc-800 text-zinc-500"
                    }`}>
                      {s.is_active ? "● ACTIVE" : "○ INACTIVE"}
                </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{s.trading_mode}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                      {s.is_intraday ? "Intraday" : "Positional"}
                </span>
                    <span className="text-[10px] text-zinc-700">{s.start_time}–{s.end_time}</span>
                    {s.stop_loss_pct && (
                      <span className="text-[10px] text-red-500/70">SL {s.stop_loss_pct}%</span>
                    )}
                    {s.take_profit_pct && (
                      <span className="text-[10px] text-green-500/70">TP {s.take_profit_pct}%</span>
                    )}
                </div>

                  {/* ── Fire Signal panel ── */}
                  {fs.open && (
                    <div className="mx-3 mb-3 rounded-lg border border-teal-500/20 bg-zinc-950 p-3 space-y-3">
                      <p className="text-[11px] font-semibold text-teal-400 flex items-center gap-1.5">
                        <Zap className="h-3 w-3" />
                        Fire Signal — {s.name}
                      </p>

                      {/* Symbol + Exchange */}
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
                              {EXCHANGES.map(e => (
                                <SelectItem key={e.value} value={e.value} className="text-xs text-zinc-200">{e.value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                      </div>

                      {/* Qty + Product */}
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
                              {PRODUCT_TYPES.map(p => (
                                <SelectItem key={p.value} value={p.value} className="text-xs text-zinc-200">{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                  </div>
                </div>

                      {/* AI Override toggle */}
                      <div className="flex items-center justify-between gap-2 px-1 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900/50">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-zinc-300 font-medium flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-amber-400" />
                            AI Override
                          </p>
                          <p className="text-[9px] text-zinc-500 pl-4">AI will validate & accept/reject trade before execution</p>
                        </div>
                        <Switch
                          checked={fs.aiOverride ?? false}
                          onCheckedChange={(v) => setFireState(s.id, { aiOverride: v })}
                        />
                      </div>

                      {/* BUY / SELL fire buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => fireSignal(s, "BUY")}
                          disabled={fs.firing}
                          className="py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                        >
                          {fs.firing
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><TrendingUp className="h-3.5 w-3.5" /> BUY Signal</>
                          }
                        </button>
                        <button
                          onClick={() => fireSignal(s, "SELL")}
                          disabled={fs.firing}
                          className="py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                        >
                          {fs.firing
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><TrendingDown className="h-3.5 w-3.5" /> SELL Signal</>
                          }
                        </button>
                </div>

                      <p className="text-[10px] text-zinc-700 text-center">
                        {fs.aiOverride ? "AI validates → then MARKET order on " : "MARKET order · executes instantly on "}{brokerLabel}
                      </p>
                    </div>
                  )}

                  {/* Entry / Exit Points viewer */}
                  <div className="mx-3 mb-2">
                    <button
                      onClick={() => setEntryExitOpen(p => ({ ...p, [s.id]: !p[s.id] }))}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                        entryExitOpen[s.id]
                          ? "bg-teal-500/10 border-teal-500/30 text-teal-300"
                          : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-teal-500/30 hover:text-teal-400"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Target className="h-3 w-3" />
                        Entry & Exit Points
                      </span>
                      <ChevronRight className={`h-3 w-3 transition-transform ${entryExitOpen[s.id] ? "rotate-90" : ""}`} />
                    </button>
                    {entryExitOpen[s.id] && (
                      <div className="mt-2">
                        <StrategyEntrySignalsPanel
                          symbol={(s.symbols?.[0] ?? "").includes(".") ? s.symbols![0] : `${s.symbols?.[0] ?? "RELIANCE"}.NS`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Webhook URL (for external integrations) */}
                  {s.webhook_url && (
                    <div className="flex items-center gap-1.5 mx-3 mb-3 bg-black/30 border border-zinc-800 rounded p-1.5">
                      <Webhook className="h-3 w-3 text-zinc-600 shrink-0" />
                      <code className="text-[9px] text-zinc-600 truncate flex-1">{s.webhook_url}</code>
                      <button
                        onClick={() => copyWebhook(s)}
                        className="shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors"
                        title="Copy webhook (for external use)"
                      >
                        {copiedId === s.id
                          ? <CheckCircle2 className="h-3 w-3 text-teal-400" />
                          : <Copy className="h-3 w-3" />
                        }
                      </button>
                    </div>
                        )}
                      </div>
              );
            })}
                    </div>
        )}

        {/* External integrations — collapsible, optional */}
        <button
          onClick={() => setShowGuide(g => !g)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Webhook className="h-3 w-3 text-zinc-600" />
            Connect external signal source (optional)
          </span>
          <ChevronRight className={`h-3 w-3 transition-transform ${showGuide ? "rotate-90" : ""}`} />
        </button>

        {showGuide && (
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-3 -mt-1 space-y-2">
            <p className="text-[10px] text-zinc-400">
              Each strategy has a webhook URL. Any system that can make HTTP POST requests can trigger orders automatically — your own Python script, a Pine Script alert, a cron job, anything.
            </p>
            <ol className="space-y-1 text-[10px] text-zinc-500">
              <li className="flex items-start gap-2">
                <span className="text-zinc-400 font-bold shrink-0">1.</span>
                Copy the webhook URL from the strategy card above
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-400 font-bold shrink-0">2.</span>
                Send a POST request to it with the order payload
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-400 font-bold shrink-0">3.</span>
                Order fires on your {brokerLabel} account instantly
              </li>
            </ol>
            <div className="p-2 bg-zinc-950 rounded text-[9px] text-zinc-500 font-mono break-all">
              {`POST {webhook_url}`}<br/>
              {`{"action":"BUY","symbol":"RELIANCE","exchange":"NSE","quantity":10,"product":"MIS","pricetype":"MARKET"}`}
            </div>
            <p className="text-[10px] text-zinc-700">
              Or just use the "Execute" button on each strategy above — no external tools needed.
            </p>
          </div>
              )}
        </CardContent>
      </Card>
  );
}

// ── LiveDashboard ──────────────────────────────────────────────────────────────
type ScannerSearchResult = {
  symbol: string;
  description: string;
  full_symbol: string;
  exchange: string;
  type: string;
};

const SCANNER_QUICK_PICKS = [
  { symbol: "RELIANCE.NS", label: "Reliance" },
  { symbol: "TCS.NS",      label: "TCS" },
  { symbol: "HDFCBANK.NS", label: "HDFC Bank" },
  { symbol: "INFY.NS",     label: "Infosys" },
  { symbol: "AAPL",        label: "Apple" },
  { symbol: "BTC-USD",     label: "Bitcoin" },
];

function LiveDashboard({ broker }: { broker: string }) {
  const [portfolioKey, setPortfolioKey] = useState(0);
  const market = useMarketStatus();
  const brokerLabel = broker.charAt(0).toUpperCase() + broker.slice(1);
  const [scannerSymbol, setScannerSymbol] = useState("");
  const [scannerInput, setScannerInput] = useState("");
  const [scannerResults, setScannerResults] = useState<ScannerSearchResult[]>([]);
  const [scannerSearching, setScannerSearching] = useState(false);
  const [scannerDropdownOpen, setScannerDropdownOpen] = useState(false);
  const scannerDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  const scannerSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setScannerResults([]); setScannerDropdownOpen(false); return; }
    setScannerSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const data: ScannerSearchResult[] = (res.data as any[]) ?? [];
      setScannerResults(data.slice(0, 10));
      if (data.length > 0) setScannerDropdownOpen(true);
    } catch { /* silent */ } finally { setScannerSearching(false); }
  }, []);

  const handleScannerInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    setScannerInput(v);
    clearTimeout(scannerDebounceRef.current);
    scannerDebounceRef.current = setTimeout(() => scannerSearch(v), 300);
  };

  const handleScannerSelect = (sym: string) => {
    setScannerSymbol(sym);
    setScannerInput(sym);
    setScannerDropdownOpen(false);
    setScannerResults([]);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scannerContainerRef.current && !scannerContainerRef.current.contains(e.target as Node))
        setScannerDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/home" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </a>
          <div>
              <h1 className="text-base font-bold text-white tracking-tight">Live Trading Dashboard</h1>
              <p className="text-[11px] text-zinc-500">Powered by {brokerLabel} via OpenAlgo</p>
          </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Market status chip */}
            <span className={`hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${market.bg} ${market.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${market.dot} ${market.session === "open" ? "animate-pulse" : ""}`} />
              {market.label}
            </span>
            {/* Broker chip */}
            <span className="flex items-center gap-1.5 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              {brokerLabel} Connected
                  </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5">
        {/* Broker Sync bar — full width */}
        <div className="mb-5">
          <BrokerSyncSection broker={broker} />
          </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-1 gap-5 items-start">

          {/* ── Left: Portfolio ── */}
          <div className="min-w-0">
            <Tabs defaultValue="portfolio" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-zinc-900 border border-zinc-800 h-auto gap-1 p-1 mb-3">
                <TabsTrigger value="portfolio" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
                  <BookOpen className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  Portfolio
                </TabsTrigger>
                <TabsTrigger value="scanner" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
                  <Target className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  Scanner
                </TabsTrigger>
                <TabsTrigger value="backtest" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
                  <LineChart className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  Backtesting
                </TabsTrigger>
                <TabsTrigger value="statement" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
                  <ScrollText className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  Statement
                </TabsTrigger>
              </TabsList>

              <TabsContent value="portfolio" className="pt-0">
                <BrokerPortfolioCard key={portfolioKey} broker={broker} />
              </TabsContent>

              <TabsContent value="scanner" className="pt-0 space-y-4">
                {/* Symbol search with autocomplete */}
                <Card className="border-zinc-800 bg-zinc-900/50">
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-xs text-zinc-400">Search stock / symbol</Label>
                    <div ref={scannerContainerRef} className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                        <Input
                          placeholder="Search… RELIANCE, TCS, AAPL, BTC"
                          value={scannerInput}
                          onChange={handleScannerInputChange}
                          onFocus={() => scannerResults.length > 0 && setScannerDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleScannerSelect(scannerInput.trim());
                              e.currentTarget.blur();
                            }
                          }}
                          className="pl-9 pr-9 bg-black/40 border-zinc-700 text-white font-mono uppercase placeholder:text-zinc-600"
                        />
                        {scannerSearching && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />
                        )}
                      </div>

                      {/* Autocomplete dropdown */}
                      {scannerDropdownOpen && scannerResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                          {scannerResults.map((item, i) => (
                            <button
                              key={i}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800 text-left transition-colors border-b border-zinc-800 last:border-0"
                              onMouseDown={() => handleScannerSelect(item.full_symbol || item.symbol)}
                            >
                              <div className="min-w-0">
                                <span className="font-mono text-white text-sm font-semibold">{item.symbol}</span>
                                <p className="text-[11px] text-zinc-500 truncate">{item.description}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded">
                                  {item.exchange}
                                </span>
                                <span className="text-[10px] text-zinc-500">{item.type}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick picks */}
                    <div className="flex flex-wrap gap-1.5">
                      {SCANNER_QUICK_PICKS.map((qp) => (
                        <button
                          key={qp.symbol}
                          onClick={() => handleScannerSelect(qp.symbol)}
                          className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                            scannerSymbol === qp.symbol
                              ? "bg-teal-500/20 border-teal-500/40 text-teal-300"
                              : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                          }`}
                        >
                          {qp.label}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Scanner results */}
                {scannerSymbol.trim() ? (
                  <StrategyEntrySignalsPanel symbol={scannerSymbol.trim()} />
                ) : (
                  <Card className="border-zinc-800 bg-zinc-900/30">
                    <CardContent className="p-8 text-center">
                      <Target className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                      <p className="text-sm text-zinc-400">Search a stock above to scan entry & exit points</p>
                      <p className="text-xs text-zinc-600 mt-1">
                        Select strategies, run the scan, and see AI-scored BUY/SELL signals with LIVE recommendations
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="backtest" className="pt-0">
                <BacktestingSection />
              </TabsContent>

              <TabsContent value="statement" className="pt-0">
                <StatementSection />
              </TabsContent>
            </Tabs>
                </div>
              </div>
      </main>
    </div>
  );
}

// ── Access gate ────────────────────────────────────────────────────────────────
interface ProvisionStatus {
  provisioned: boolean;
  broker: string | null;
  loading: boolean;
}

export default function TradingDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<ProvisionStatus>({ provisioned: false, broker: null, loading: true });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      const isPaid = sub?.status === "active" || sub?.status === "trialing";
      if (!isPaid) { setStatus({ provisioned: false, broker: null, loading: false }); return; }

      const { data: onboarding } = await (supabase as any)
        .from("algo_onboarding")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      const isProvisioned = onboarding?.status === "provisioned" || onboarding?.status === "active";

      const { data: integration } = await (supabase as any)
        .from("user_trading_integration")
        .select("is_active, broker")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      setStatus({
        provisioned: !!isProvisioned,
        broker: integration?.broker ?? null,
        loading: false,
      });
    })();
  }, [user?.id]);

  if (authLoading || status.loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth?redirect=/trading-dashboard" replace />;
  if (!status.provisioned) return <Navigate to="/algo-setup" replace />;

  return <LiveDashboard broker={status.broker ?? "zerodha"} />;
}
