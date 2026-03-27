/**
 * TradingDashboardPage — /trading-dashboard
 *
 * Portfolio + Statement. AI Trading Analysis and Backtesting live on dedicated routes
 * (see TradingAiAnalysisPage, TradingBacktestPage) and sidebar links.
 */

import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Send, Loader2, Info, Zap, Copy, RefreshCw,
  TrendingUp, TrendingDown, ChevronDown, Plus,
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
import { supabase } from "@/integrations/supabase/client";
import BrokerPortfolioCard from "@/components/trading/BrokerPortfolioCard";
import StatementSection from "@/components/trading/StatementSection";
import { StrategyEntrySignalsPanel } from "@/components/prediction/StrategyEntrySignalsPanel";
import AlgoStrategyBuilder from "@/components/trading/AlgoStrategyBuilder";
import { TradingDashboardAccessGate } from "@/components/trading/TradingDashboardAccessGate";
import { TradingDashboardShell } from "@/components/trading/TradingDashboardShell";

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
  description?: string | null;
  trading_mode: string;
  is_active: boolean;
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  symbols: string[];
  openalgo_webhook_id?: string;
  webhook_url?: string | null;
  market_type?: "crypto" | "stocks" | "forex" | "all" | null;
  paper_strategy_type?: string | null;
  entry_conditions?: {
    mode?: "visual" | "raw";
    groups?: Array<{ conditions?: unknown[] }>;
    rawExpression?: string;
  } | null;
  exit_conditions?: {
    indicatorGroups?: Array<{ conditions?: unknown[] }>;
  } | null;
  position_config?: Record<string, unknown> | null;
  risk_config?: Record<string, unknown> | null;
  chart_config?: Record<string, unknown> | null;
  execution_days?: number[] | null;
  risk_per_trade_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  created_at: string;
}

// ── StrategiesPanel ────────────────────────────────────────────────────────────
function StrategiesPanel({ broker }: { broker: string }) {
  const [showGuide, setShowGuide] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
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
      if (!session?.access_token) {
        toast.error("Could not load strategies: sign in session not ready.");
        return;
      }
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const list = (res.data as any)?.strategies;
      if (Array.isArray(list)) {
        setStrategies(list);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load strategies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStrategies(); }, []);

  const toggleStrategy = async (id: string) => {
    setToggleLoading(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "toggle", strategy_id: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const err = (res.data as any)?.error;
      if (res.error || err) {
        toast.error(String(err ?? res.error?.message ?? "Could not change deployment status"));
        return;
      }
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

  const openCreateBuilder = () => {
    setEditingStrategy(null);
    setBuilderOpen(true);
  };

  const openEditBuilder = (strategy: Strategy) => {
    setEditingStrategy(strategy);
    setBuilderOpen(true);
  };

  const conditionCount = (s: Strategy): number => {
    const entryGroups = Array.isArray(s.entry_conditions?.groups) ? s.entry_conditions?.groups : [];
    const exitGroups = Array.isArray(s.exit_conditions?.indicatorGroups) ? s.exit_conditions?.indicatorGroups : [];
    let count = 0;
    for (const g of entryGroups ?? []) count += Array.isArray(g?.conditions) ? g.conditions.length : 0;
    for (const g of exitGroups ?? []) count += Array.isArray(g?.conditions) ? g.conditions.length : 0;
    return count;
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
              onClick={openCreateBuilder}
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
        <AlgoStrategyBuilder
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          existing={editingStrategy}
          onSaved={() => { void loadStrategies(); }}
        />

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

                    <button
                      onClick={() => openEditBuilder(s)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-zinc-700 text-zinc-500 hover:border-purple-500/40 hover:text-purple-300 transition-all"
                      title="Edit strategy builder configuration"
                    >
                      <LineChart className="h-3 w-3" />
                      Edit
                    </button>

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
                      {(s.market_type ?? "stocks").toUpperCase()}
                    </span>
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
                    <span className="text-[10px] text-zinc-500">
                      {conditionCount(s)} logic rules
                    </span>
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
function LiveDashboard({ broker }: { broker: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [portfolioKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"portfolio" | "statement">("portfolio");

  useEffect(() => {
    const qp = new URLSearchParams(location.search);
    const tab = qp.get("tab");
    if (tab === "ai-trading-analysis") {
      qp.delete("tab");
      const rest = qp.toString();
      navigate(`/ai-trading-analysis${rest ? `?${rest}` : ""}`, { replace: true });
      return;
    }
    if (tab === "backtest") {
      qp.delete("tab");
      const rest = qp.toString();
      navigate(`/backtest${rest ? `?${rest}` : ""}`, { replace: true });
      return;
    }
    if (tab === "portfolio" || tab === "statement") {
      setActiveTab(tab);
    }
  }, [location.search, navigate]);

  return (
    <TradingDashboardShell broker={broker}>
      <div className="grid grid-cols-1 gap-5 items-start">
        <div className="min-w-0">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "portfolio" | "statement")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-zinc-800 h-auto gap-1 p-1 mb-3">
              <TabsTrigger value="portfolio" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
                <BookOpen className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Portfolio
              </TabsTrigger>
              <TabsTrigger value="statement" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
                <ScrollText className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Statement
              </TabsTrigger>
            </TabsList>

            <TabsContent value="portfolio" className="pt-0">
              <BrokerPortfolioCard key={portfolioKey} broker={broker} />
            </TabsContent>

            <TabsContent value="statement" className="pt-0">
              <StatementSection />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TradingDashboardShell>
  );
}

export default function TradingDashboardPage() {
  return (
    <TradingDashboardAccessGate>
      {(ctx) => <LiveDashboard broker={ctx.broker} />}
    </TradingDashboardAccessGate>
  );
}
