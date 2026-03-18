/**
 * BrokerPortfolioCard
 *
 * Full broker account view — funds, positions, holdings, orders, tradebook.
 * All data pulled live from OpenAlgo → broker. OpenAlgo is completely invisible to user.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
  TrendingUp, TrendingDown, BookOpen, Plus, Trash2, CheckCircle2, Send, Brain, Search,
} from "lucide-react";
import { toast } from "sonner";
import PlaceOrderPanel from "@/components/trading/PlaceOrderPanel";
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import { getStrategyParams } from "@/constants/strategyParams";

// ── SymbolSearchInput (same UX as PlaceOrderPanel) ────────────────────────────
type SymbolResult = { symbol: string; description: string; full_symbol: string; exchange: string; type: string };
function SymbolSearchInput({
  value, onChange, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (symbol: string, exchange: string) => void;
}) {
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const data: SymbolResult[] = (res.data as any[]) ?? [];
      const indian = data.filter(d => d.full_symbol?.endsWith(".NS") || d.full_symbol?.endsWith(".BO"));
      setResults(indian.slice(0, 8));
      if (indian.length > 0) setOpen(true);
    } catch { /* silent */ } finally { setSearching(false); }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 320);
  };

  const handleSelect = (item: SymbolResult) => {
    onSelect(item.symbol, item.full_symbol?.endsWith(".BO") ? "BSE" : "NSE");
    setOpen(false);
    setResults([]);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <Input
          placeholder="Search symbol…"
          value={value}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="bg-zinc-900 border-zinc-700 text-white font-mono pl-8 pr-8 uppercase text-xs h-8"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden">
          {results.map((item, i) => (
            <button
              key={i}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800 text-left transition-colors border-b border-zinc-800 last:border-0"
              onMouseDown={() => handleSelect(item)}
            >
              <div className="min-w-0">
                <span className="font-mono text-white text-sm font-semibold">{item.symbol}</span>
                <p className="text-[11px] text-zinc-500 truncate">{item.description}</p>
              </div>
              <span className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded ml-2 shrink-0">
                {item.full_symbol?.endsWith(".BO") ? "BSE" : "NSE"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TradingView Chart Widget ──────────────────────────────────────────────────

function TradingViewChart({ symbol, exchange, height = 320 }: { symbol: string; exchange: string; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !symbol) return;
    containerRef.current.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    containerRef.current.appendChild(inner);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol(symbol, exchange),
      interval: "D",
      timezone: "Asia/Kolkata",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_legend: false,
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      backgroundColor: "rgba(9,9,11,1)",
      gridColor: "rgba(39,39,42,0.6)",
    });
    containerRef.current.appendChild(script);
  }, [symbol, exchange]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container rounded-lg overflow-hidden border border-zinc-800"
      style={{ height: `${height}px`, width: "100%" }}
    />
  );
}

// Paper strategy → direction mapping
const PAPER_DIRECTION: Record<string, "LONG" | "SHORT" | "BOTH"> = {
  trend_following: "BOTH", breakout_breakdown: "BOTH", mean_reversion: "BOTH",
  momentum: "LONG", scalping: "BOTH", swing_trading: "BOTH", range_trading: "BOTH",
  news_based: "BOTH", options_buying: "LONG", options_selling: "SHORT", pairs_trading: "BOTH",
};

// Paper strategy → session (MIS=intraday, CNC/NRML=positional)
const PAPER_TO_INTRADAY: Record<string, boolean> = {
  trend_following: false, breakout_breakdown: false, mean_reversion: false,
  momentum: true, scalping: true, swing_trading: false, range_trading: false,
  news_based: true, options_buying: false, options_selling: false, pairs_trading: false,
};

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
  paper_strategy_type?: string | null;
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
  symbol?: string;
  tradingsymbol?: string; exchange?: string; product?: string;
  quantity?: number;
  netqty?: number; avgprice?: number; ltp?: number; pnl?: number;
  average_price?: number;
  buyqty?: number; sellqty?: number; buyavgprice?: number; sellavgprice?: number;
  [key: string]: unknown;
}
interface HoldingRow {
  symbol?: string;
  tradingsymbol?: string; exchange?: string; quantity?: number;
  average_price?: number;
  avgprice?: number; ltp?: number; pnl?: number; close?: number;
  [key: string]: unknown;
}
interface OrderRow {
  symbol?: string;
  action?: string;
  orderid?: string; tradingsymbol?: string; exchange?: string;
  transactiontype?: string; quantity?: number; filledquantity?: number;
  filled_quantity?: number;
  average_price?: number;
  order_status?: string;
  timestamp?: string;
  averageprice?: number; price?: number; product?: string; pricetype?: string;
  status?: string; updatetime?: string; ordertime?: string; rejectreason?: string;
  [key: string]: unknown;
}
interface TradeRow {
  symbol?: string;
  action?: string;
  quantity?: string | number;
  average_price?: string | number;
  timestamp?: string;
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

// ── Universal field helpers — works across ALL 39 OpenAlgo broker adapters ────
// Each broker may return slightly different field names; we chain all known variants.

const getSymbol = (row: any): string =>
  String(
    row?.tradingsymbol ?? row?.symbol ?? row?.scrip_code ?? row?.scripcode ??
    row?.instrument_name ?? row?.isin ?? ""
  ).toUpperCase().trim();

const getAction = (row: any): string => {
  const raw = String(
    row?.transactiontype ?? row?.transaction_type ?? row?.action ??
    row?.side ?? row?.type ?? row?.trade_type ?? row?.order_side ?? ""
  ).toUpperCase().trim();
  // Normalise single-char shortcodes some brokers use
  if (raw === "B" || raw === "1")  return "BUY";
  if (raw === "S" || raw === "2" || raw === "-1") return "SELL";
  return raw;
};

const getOrderStatus = (row: any): string =>
  String(
    row?.status ?? row?.order_status ?? row?.orderstatus ?? row?.state ??
    row?.order_state ?? ""
  ).toLowerCase().trim();

const getQty = (row: any): number =>
  // Positions use netqty/net_quantity; orders/trades use quantity/filledquantity
  Math.abs(Number(
    row?.netqty ?? row?.net_quantity ?? row?.net_qty ??
    row?.quantity ?? row?.qty ??
    row?.tradedquantity ?? row?.traded_quantity ?? row?.filledquantity ??
    row?.filled_quantity ?? 0
  )) || 0;

const getFilledQty = (row: any): number =>
  Number(
    row?.filledquantity ?? row?.filled_quantity ?? row?.tradedquantity ??
    row?.traded_quantity ?? row?.quantity ?? 0
  ) || 0;

const getAvgPrice = (row: any): number =>
  Number(
    row?.avgprice ?? row?.averageprice ?? row?.average_price ?? row?.avg_price ??
    row?.tradedprice ?? row?.trade_price ?? row?.fill_price ??
    row?.buy_average ?? row?.sell_average ?? 0
  ) || 0;

const getLtp = (row: any): number =>
  Number(
    row?.ltp ?? row?.last_price ?? row?.lastprice ?? row?.last_traded_price ??
    row?.close ?? row?.closing_price ?? 0
  ) || 0;

const getTime = (row: any): string =>
  String(
    row?.tradetime ?? row?.trade_time ?? row?.filltime ?? row?.fill_time ??
    row?.ordertime ?? row?.order_time ?? row?.updatetime ?? row?.update_time ??
    row?.timestamp ?? row?.fill_timestamp ?? row?.order_timestamp ??
    row?.exchange_timestamp ?? row?.created_at ?? ""
  );

const getOrderId = (row: any): string => {
  const v =
    row?.orderid ?? row?.order_id ??
    row?.broker_order_id ?? row?.brokerOrderId ??
    row?.exchange_order_id ?? row?.exchangeOrderId ??
    row?.orderno ?? row?.order_no ?? row?.order_number ??
    row?.parentorderid ?? row?.parent_order_id ??
    row?.oms_order_id ?? row?.app_order_id ??
    "";
  return String(v ?? "").trim();
};

const getExchange = (row: any): string =>
  String(row?.exchange ?? row?.exch ?? row?.exchange_code ?? "NSE").toUpperCase().trim();

const getProduct = (row: any): string =>
  String(row?.product ?? row?.producttype ?? row?.product_type ?? row?.segment ?? "CNC").toUpperCase().trim();

// All Indian exchanges (all 39 brokers operate on these)
const INDIAN_EXCHANGES = new Set(["NSE", "BSE", "NFO", "BFO", "MCX", "CDS", "NCDEX", "BCD", "NCE", "NSECD"]);

// TradingView symbol format per exchange
const tvSymbol = (symbol: string, exchange: string): string => {
  const exch = exchange.toUpperCase();
  // Map OpenAlgo exchanges → TradingView exchange prefixes
  const TV_EXCHANGE_MAP: Record<string, string> = {
    NSE: "NSE", BSE: "BSE", NFO: "NSE", BFO: "BSE",
    MCX: "MCX", CDS: "NSE", NCDEX: "NCDEX", BCD: "BSE",
  };
  const tvExch = TV_EXCHANGE_MAP[exch] ?? exch;
  return `${tvExch}:${symbol.toUpperCase()}`;
};
// Smart money formatter: shows ₹8.23 for small amounts, ₹1.2K for thousands, ₹2.3L for lakhs
const fmtMoney = (v: number): string => {
  if (v === 0) return "₹0";
  if (v < 1000) return `₹${v.toFixed(2)}`;
  if (v < 100000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${(v / 100000).toFixed(2)}L`;
};
// Format a datetime string to HH:MM:SS or HH:MM
const fmtTime = (t: string): string => {
  if (!t) return "—";
  const parts = t.split(" ");
  // "2021-08-17 13:23:35" → "13:23:35"
  if (parts.length >= 2 && parts[1].includes(":")) return parts[1];
  // ISO "2021-08-17T13:23:35" → "13:23:35"
  const iso = t.split("T");
  if (iso.length >= 2) return iso[1].split(".")[0];
  return t;
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function BrokerPortfolioCard({ broker = "" }: { broker?: string }) {
  const [data, setData]             = useState<PortfolioData | null>(null);
  const [strategyByOrderId, setStrategyByOrderId] = useState<Record<string, string>>({});
  const [autoExitByEntryOrderId, setAutoExitByEntryOrderId] = useState<Record<string, { status: string; exit_orderid?: string | null }>>({});
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
  const [useFromPaper, setUseFromPaper]   = useState(false);
  const [paperType, setPaperType]         = useState("");
  const [backtestSymbol, setBacktestSymbol] = useState("RELIANCE");
  const [autoNameFromPaper, setAutoNameFromPaper] = useState(true);
  const [autoTimesFromPaper, setAutoTimesFromPaper] = useState(true);
  const [backtestResult, setBacktestResult] = useState<{
    totalTrades: number; wins: number; losses: number; winRate: number;
    totalReturn: number; avgReturn: number; maxDrawdown: number; profitFactor: number;
    strategyAchieved: boolean; symbol: string; strategy: string; sampleTrades?: { entryDate: string; exitDate: string; returnPct: number; profitable: boolean }[];
  } | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [firePanel, setFirePanel]         = useState<Record<string, {
    open: boolean; symbol: string; exchange: string; quantity: string; product: string; firing: boolean;
    backtestPaperType?: string;     backtestResult?: {
      totalTrades: number; wins: number; losses: number; winRate: number; totalReturn: number;
      maxDrawdown?: number; profitFactor?: number; backtestPeriod?: string; strategyAchieved?: boolean; achievementReason?: string;
      sampleTrades?: { entryDate: string; exitDate: string; returnPct: number; profitable: boolean }[];
      currentIndicators?: { price?: number; sma20?: number | null; rsi14?: number | null; high20d?: number; low20d?: number };
      engine?: string; dataSource?: string; sharpeRatio?: number;
    } | null; backtestLoading?: boolean; backtestAiAnalysis?: string | null; backtestAiLoading?: boolean;
    lastFired?: { action: "BUY" | "SELL"; symbol: string; exchange: string; quantity: string; product: string };
  }>>({});
  const brokerLabel = (broker || "Broker").charAt(0).toUpperCase() + (broker || "broker").slice(1);

  // ── Quick Trade Dialog (click on any position/trade/holding row) ──────────
  const [qtd, setQtd] = useState<{
    symbol: string; exchange: string; qty: number; avgPrice: number;
    ltp: number; pnl: number; product: string; action: "BUY" | "SELL";
    qtyInput: string; placing: boolean;
    aiAnalysis: string | null; aiLoading: boolean;
    pricetype: "MARKET" | "LIMIT" | "SL" | "SL-M";
    price: string; trigger_price: string; validity: "DAY" | "IOC";
  } | null>(null);

  const qtdSet = <K extends keyof NonNullable<typeof qtd>>(k: K, v: NonNullable<typeof qtd>[K]) =>
    setQtd(prev => prev ? { ...prev, [k]: v } : null);

  const openQuickTrade = useCallback(async (
    symbol: string, exchange: string, qty: number,
    avgPrice: number, ltp: number, pnl: number,
    product: string, defaultAction: "BUY" | "SELL",
  ) => {
    setQtd({
      symbol, exchange, qty, avgPrice, ltp, pnl, product,
      action: defaultAction, qtyInput: String(Math.abs(qty) || 1),
      placing: false, aiAnalysis: null, aiLoading: true,
      pricetype: "MARKET", price: "", trigger_price: "", validity: "DAY",
    });
    // Auto-run AI analysis
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("analyze-trade", {
        body: { symbol: symbol.toUpperCase(), exchange, action: defaultAction, quantity: Math.abs(qty) || 1, product },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const txt = (res.data as any)?.analysis ?? "No AI analysis available for this symbol.";
      setQtd(prev => prev ? { ...prev, aiAnalysis: txt, aiLoading: false } : null);
    } catch {
      setQtd(prev => prev ? { ...prev, aiAnalysis: "AI analysis temporarily unavailable.", aiLoading: false } : null);
    }
  }, []);

  const placeQuickOrder = async () => {
    if (!qtd || qtd.placing) return;
    if (qtd.pricetype === "LIMIT" && !qtd.price) { toast.error("Enter limit price"); return; }
    if ((qtd.pricetype === "SL" || qtd.pricetype === "SL-M") && !qtd.trigger_price) { toast.error("Enter trigger price"); return; }
    setQtd(prev => prev ? { ...prev, placing: true } : null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("openalgo-place-order", {
        body: {
          symbol: qtd.symbol, exchange: qtd.exchange,
          action: qtd.action, quantity: parseInt(qtd.qtyInput) || 1,
          product: qtd.product, pricetype: qtd.pricetype,
          price: qtd.price ? parseFloat(qtd.price) : 0,
          trigger_price: qtd.trigger_price ? parseFloat(qtd.trigger_price) : 0,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = res.data as any;
      if (res.error || result?.error) {
        toast.error(result?.error ?? "Order failed");
        setQtd(prev => prev ? { ...prev, placing: false } : null);
      } else {
        const oid = result?.orderid ?? result?.broker_order_id ?? "placed";
        toast.success(`${qtd.action} ${qtd.symbol} placed — #${String(oid).slice(-8)}`, { duration: 6000 });
        setQtd(null);
        setTimeout(() => load(true), 1500);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Order failed");
      setQtd(prev => prev ? { ...prev, placing: false } : null);
    }
  };

  const setF = <K extends keyof StrategyForm>(k: K, v: StrategyForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const applyPaperPrefill = useCallback((code: string, opts?: { forceName?: boolean; forceTimes?: boolean }) => {
    if (!code) return;
    const params = getStrategyParams(code);
    const dir  = PAPER_DIRECTION[code] ?? "BOTH";
    const intraday = PAPER_TO_INTRADAY[code] ?? false;
    const s = STRATEGIES.find(x => x.value === code);
    const shouldName = (opts?.forceName ?? false) || autoNameFromPaper;
    const shouldTimes = (opts?.forceTimes ?? false) || autoTimesFromPaper;
    const defaultStart = "09:15";
    const defaultEnd = "15:15";
    const defaultSq = "15:15";
    setForm(f => ({
      ...f,
      trading_mode: dir,
      is_intraday: intraday,
      stop_loss_pct: String(params.stopLossPercentage),
      take_profit_pct: String(params.targetProfitPercentage),
      risk_per_trade_pct: "1",
      start_time: shouldTimes ? defaultStart : f.start_time,
      end_time: shouldTimes ? defaultEnd : f.end_time,
      squareoff_time: shouldTimes ? defaultSq : f.squareoff_time,
      name: shouldName ? (s ? `${s.label} Live` : "Strategy") : f.name,
      description: f.description.trim() ? f.description : (s ? `Based on ${s.label} paper strategy` : ""),
    }));
  }, [autoNameFromPaper, autoTimesFromPaper]);

  const runBacktestForFire = useCallback(async (strategy: Strategy) => {
    const fs = {
      open: false, symbol: "", exchange: "NSE", quantity: "1", product: "MIS", firing: false,
      backtestPaperType: "trend_following", backtestResult: null as any,
      backtestLoading: false, backtestAiAnalysis: null as string | null, backtestAiLoading: false,
      ...firePanel[strategy.id],
    };
    const sym = fs.symbol.trim().toUpperCase();
    if (!sym) { toast.error("Enter a symbol first"); return; }
    const strat = String(strategy.paper_strategy_type ?? "trend_following");
    const sid = strategy.id;
    setFireState(sid, { backtestLoading: true, backtestResult: null, backtestAiAnalysis: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const auth = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await supabase.functions.invoke("backtest-strategy", {
        body: { symbol: sym, strategy: strat, action: "BUY", exchange: fs.exchange || "NSE" },
        headers: auth,
      });
      const d = res.data as any;
      if (res.error || d?.error) {
        toast.error(d?.error ?? "Backtest failed");
        setFireState(sid, { backtestLoading: false });
        return;
      }
      setFireState(sid, {
        backtestLoading: false,
        backtestResult: {
          totalTrades: d.totalTrades ?? 0,
          wins: d.wins ?? 0,
          losses: d.losses ?? 0,
          winRate: d.winRate ?? 0,
          totalReturn: d.totalReturn ?? 0,
          maxDrawdown: d.maxDrawdown,
          profitFactor: d.profitFactor,
          backtestPeriod: d.backtestPeriod,
          strategyAchieved: d.strategyAchieved,
          achievementReason: d.achievementReason,
          sampleTrades: d.sampleTrades,
          currentIndicators: d.currentIndicators,
          engine: "edge",
          dataSource: d.dataSource,
        },
      });
      toast.success(`Backtest (${d.dataSource ?? "?"}): ${d.totalTrades} trades · use Algo → Backtesting for VectorBT`);
    } catch {
      setFireState(strategy.id, { backtestLoading: false });
      toast.error("Backtest failed");
    }
  }, [firePanel]);

  const runBacktest = useCallback(async () => {
    const sym = backtestSymbol.trim().toUpperCase() || "RELIANCE";
    const strat = paperType || "trend_following";
    setBacktestLoading(true);
    setBacktestResult(null);
    try {
      const res = await supabase.functions.invoke("backtest-strategy", {
        body: { symbol: sym, strategy: strat, action: "BUY" },
      });
      const d = res.data as any;
      if (res.error || d?.error) {
        toast.error(d?.error ?? "Backtest failed");
        return;
      }
      setBacktestResult({
        totalTrades: d.totalTrades ?? 0,
        wins: d.wins ?? 0,
        losses: d.losses ?? 0,
        winRate: d.winRate ?? 0,
        totalReturn: d.totalReturn ?? 0,
        avgReturn: d.avgReturn ?? 0,
        maxDrawdown: d.maxDrawdown ?? 0,
        profitFactor: d.profitFactor ?? 0,
        strategyAchieved: d.strategyAchieved ?? false,
        symbol: d.symbol ?? sym,
        strategy: d.strategy ?? strat,
        sampleTrades: d.sampleTrades,
      });
      toast.success(`Backtest done: ${d.totalTrades} trades, ${d.winRate}% win rate`);
    } finally {
      setBacktestLoading(false);
    }
  }, [backtestSymbol, paperType]);

  const getFireState = (id: string) => firePanel[id] ?? {
    open: false, symbol: "", exchange: "NSE", quantity: "1", product: "MIS", firing: false,
    backtestPaperType: "trend_following",
    backtestResult: null as any,
    backtestLoading: false,
    backtestAiAnalysis: null as string | null,
    backtestAiLoading: false,
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
          paper_strategy_type: useFromPaper ? (paperType || "trend_following") : null,
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

  const fireSignal = async (strategy: Strategy, action: "BUY" | "SELL") => {
    const fs  = getFireState(strategy.id);
    const sym = fs.symbol.trim().toUpperCase() || (strategy.symbols?.[0] ?? "");
    if (!sym) { toast.error("Enter a symbol to fire this signal"); return; }

    // If the strategy was created with an explicit symbol list, enforce it
    try {
      const rawList = (strategy as any)?.symbols;
      const list = Array.isArray(rawList)
        ? rawList.map((x: any) => String(x?.symbol ?? x ?? "").toUpperCase().trim()).filter(Boolean)
        : [];
      if (list.length && !list.includes(sym)) {
        toast.error(`This strategy is restricted to: ${list.slice(0, 6).join(", ")}${list.length > 6 ? "…" : ""}`);
        return;
      }
    } catch { /* non-blocking */ }

    setFireState(strategy.id, { firing: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Run AI analysis first — show as toast so user sees it before order lands
      try {
        const aiRes = await supabase.functions.invoke("analyze-trade", {
          body: { symbol: sym, exchange: fs.exchange, action, quantity: parseInt(fs.quantity) || 1, product: fs.product },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const analysis = (aiRes.data as any)?.analysis;
        if (analysis) toast.info(`AI: ${analysis}`, { duration: 10000, id: `ai-${strategy.id}` });
      } catch { /* non-blocking */ }

      const res = await supabase.functions.invoke("fire-strategy-signal", {
        body: { strategy_id: strategy.id, symbol: sym, exchange: fs.exchange, action, quantity: parseInt(fs.quantity) || 1, product: fs.product },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = res.data as any;
      if (res.error || result?.error) {
        const msg =
          result?.error ??
          result?.message ??
          res.error?.message ??
          "Signal failed";
        console.error("fireSignal failed:", { error: res.error, data: result });
        toast.error(msg);
      }
      else {
        const oid = result?.orderid ?? result?.broker_order_id ?? "placed";
        toast.success(`${action} signal fired on "${strategy.name}" — ${sym} · #${String(oid).slice(-8)}`, { duration: 5000 });
        setFireState(strategy.id, { lastFired: { action, symbol: sym, exchange: fs.exchange, quantity: fs.quantity, product: fs.product } });
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
        const portfolio = res.data as PortfolioData;
        setData(portfolio);

        // Load recent strategy mapping from audit logs (orderid -> strategy name)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const uid = user?.id;
          if (uid) {
            const { data: logs } = await (supabase as any)
              .from("order_audit_logs")
              .select("created_at, request_payload, response_payload, status")
              .eq("user_id", uid)
              .order("created_at", { ascending: false })
              .limit(200);

            const map: Record<string, string> = {};
            for (const l of (logs ?? [])) {
              const rp = (l as any)?.request_payload ?? {};
              const resp = (l as any)?.response_payload ?? {};
              const oid = String(resp?.orderid ?? resp?.broker_order_id ?? resp?.data?.orderid ?? "").trim();
              const strat = String(rp?.strategy ?? rp?.strategy_name ?? "").trim();
              if (oid && strat && !map[oid]) map[oid] = strat;
            }
            setStrategyByOrderId(map);

            // Load recent auto-exit tracked trades (entry orderid -> status)
            try {
              const ae = await supabase.functions.invoke("auto-exit-trades", {
                headers: { Authorization: `Bearer ${session?.access_token}` },
              });
              const rows = (ae.data as any)?.trades ?? [];
              const aeMap: Record<string, { status: string; exit_orderid?: string | null }> = {};
              for (const r of rows) {
                const entry = String(r?.entry_orderid ?? "").trim();
                if (!entry) continue;
                if (!aeMap[entry]) aeMap[entry] = { status: String(r?.status ?? ""), exit_orderid: r?.exit_orderid ?? null };
              }
              setAutoExitByEntryOrderId(aeMap);
            } catch {
              // non-blocking
            }
          }
        } catch { /* non-blocking */ }
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
  const refreshQuotes = useCallback(async (portfolio: PortfolioData, silent = false) => {
    const symbols: Array<{ symbol: string; exchange: string }> = [
      ...portfolio.positions.map(p => ({ symbol: getSymbol(p), exchange: getExchange(p) })),
      ...portfolio.holdings.map(h => ({ symbol: getSymbol(h), exchange: getExchange(h) })),
    ].filter(s => s.symbol);
    const uniqSymbols = Array.from(new Map(symbols.map(s => [`${s.exchange}:${s.symbol}`, s])).values());
    if (!uniqSymbols.length) return;
    setQLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("broker-data", {
        body: { action: "multiquotes", symbols: uniqSymbols },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const raw = (res.data as any)?.data;
      const map: Record<string, number> = {};
      const results = Array.isArray(raw?.results) ? raw.results : (Array.isArray(raw) ? raw : []);
      if (results.length) {
        results.forEach((q: any) => {
          const sym = String(q?.symbol ?? q?.tradingsymbol ?? q?.scrip_code ?? "").toUpperCase();
          const ltp = q?.ltp ?? q?.last_price ?? q?.lastprice ?? q?.last_traded_price ??
                      q?.close ?? q?.data?.ltp ?? q?.data?.last_price ?? q?.data?.close;
          if (sym && ltp != null && !Number.isNaN(Number(ltp))) map[sym] = Number(ltp);
        });
      } else if (raw && typeof raw === "object") {
        Object.entries(raw).forEach(([sym, q]: [string, any]) => {
          const ltp = q?.ltp ?? q?.data?.ltp ?? q?.last_price;
          if (ltp != null && !Number.isNaN(Number(ltp))) map[String(sym).toUpperCase()] = Number(ltp);
        });
      }
      if (Object.keys(map).length) {
        setLiveLtps(prev => ({ ...prev, ...map }));
        if (!silent) toast.success("Live quotes updated");
      } else if (!silent) {
        toast.error("Live quotes unavailable for selected symbols");
      }
    } catch {
      if (!silent) toast.error("Could not fetch live quotes");
    }
    finally { setQLoading(false); }
  }, []);

  useEffect(() => {
    if (!data) return;
    const hasInstruments = data.positions.length + data.holdings.length > 0;
    if (!hasInstruments) return;
    refreshQuotes(data, true);
    const id = setInterval(() => refreshQuotes(data, true), 15_000);
    return () => clearInterval(id);
  }, [data, refreshQuotes]);

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
    const symbol = getSymbol(modifyOrder);
    const action = getAction(modifyOrder) || "BUY";
    const ok = await doAction("modify", {
      orderid: modifyOrder.orderid, symbol,
      exchange: modifyOrder.exchange ?? "NSE", order_action: action,
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

  const openPositions  = data.positions.filter(p => getQty(p) !== 0);
  const positionsPnl   = data.positions.reduce((s, p) => s + Number((p as any).pnl ?? 0), 0);
  const holdingsPnl    = data.holdings.reduce((s, h) => s + Number(h.pnl ?? 0), 0);
  const totalPnl       = positionsPnl + holdingsPnl;
  const openOrders     = data.orders.filter(o => CANCELLABLE.includes(getOrderStatus(o).toLowerCase()));
  const completedToday = data.orders.filter(o => getOrderStatus(o).toLowerCase() === "complete").length;

  // Pie chart data for positions P&L
  const pieData = openPositions.map(p => ({
    name: getSymbol(p) || (p.tradingsymbol ?? ""),
    value: Math.abs(Number(p.pnl ?? 0)),
    color: Number(p.pnl ?? 0) >= 0 ? "#10b981" : "#ef4444",
  })).filter(d => d.value > 0);

  // Bar chart for tradebook buy/sell breakdown
  const tradeStats = (() => {
    const buys  = data.tradebook.filter(t => getAction(t) === "BUY");
    const sells = data.tradebook.filter(t => getAction(t) === "SELL");
    const buyVal  = buys.reduce((s, t)  => s + getQty(t) * getAvgPrice(t), 0);
    const sellVal = sells.reduce((s, t) => s + getQty(t) * getAvgPrice(t), 0);
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
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-zinc-400 font-semibold">Open Positions P&L Breakdown</p>
                <p className="text-[10px] text-zinc-500">
                  Open positions P/L:{" "}
                  <span className={openPositions.reduce((s, p) => s + Number((p as any).pnl ?? 0), 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {(() => {
                      const v = openPositions.reduce((s, p) => s + Number((p as any).pnl ?? 0), 0);
                      return Math.abs(v) < 0.005 ? "₹0.00" : `${v > 0 ? "+" : "−"}₹${Math.abs(v).toFixed(2)}`;
                    })()}
                  </span>
                </p>
              </div>
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
                      <span style={{ color: d.color }}>₹{d.value.toFixed(2)}</span>
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
                <span className="text-xs text-emerald-400">Buys: <strong>{tradeStats.buyCnt}</strong> ({fmtMoney(tradeStats.buyVal)})</span>
                <span className="text-xs text-red-400">Sells: <strong>{tradeStats.sellCnt}</strong> ({fmtMoney(tradeStats.sellVal)})</span>
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
                      {data.positions.filter(p => getQty(p) !== 0).map((p, i) => {
                        const symbol  = getSymbol(p);
                        const qty     = getQty(p);
                        const avg     = getAvgPrice(p);
                        const hasQty  = qty !== 0;
                        const liveLtp = liveLtps[symbol];
                        const ltp     = liveLtp ?? getLtp(p);
                        const pnl     = liveLtp != null
                          ? (liveLtp - avg) * qty
                          : Number(p.pnl ?? 0);
                        return (
                          <tr
                            key={i}
                            className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                            onClick={() => symbol && openQuickTrade(symbol, String(p.exchange ?? "NSE"), qty, avg, ltp, pnl, String(p.product ?? "CNC"), qty > 0 ? "SELL" : "BUY")}
                          >
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-white font-mono group-hover:text-teal-300 transition-colors">
                                {symbol || "—"}
                                {symbol && <span className="ml-1 text-[9px] text-zinc-700 group-hover:text-teal-600">↗</span>}
                              </p>
                              <p className="text-zinc-600 text-[10px]">{p.exchange}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`font-bold ${qty > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {qty}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-300 font-mono">{fmt(avg)}</td>
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
                        const symbol    = getSymbol(h);
                        const qty       = Number(h.quantity ?? 0);
                        const avg       = getAvgPrice(h);
                        const liveLtp   = liveLtps[symbol];
                        const ltp       = liveLtp ?? getLtp(h);
                        const pnl       = liveLtp != null
                          ? (liveLtp - avg) * qty
                          : Number(h.pnl ?? 0);
                        const curVal    = ltp * qty;
                        const pct       = avg > 0
                          ? ((ltp - avg) / avg) * 100
                          : 0;
                        return (
                          <tr
                            key={i}
                            className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                            onClick={() => symbol && openQuickTrade(symbol, String(h.exchange ?? "NSE"), qty, avg, ltp, pnl, String(h.product ?? "CNC"), "SELL")}
                          >
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-white font-mono group-hover:text-teal-300 transition-colors">
                                {symbol || "—"}
                                {symbol && <span className="ml-1 text-[9px] text-zinc-700 group-hover:text-teal-600">↗</span>}
                              </p>
                              <p className="text-zinc-600 text-[10px]">{h.exchange}</p>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-300">{qty || 0}</td>
                            <td className="px-3 py-2.5 text-zinc-300 font-mono">{fmt(avg)}</td>
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
                        {["Symbol", "Type", "Qty/Filled", "Price", "Product", "Status", "Strategy", "Time", ""].map(h => (
                          <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.slice(0, 50).map((o, i) => {
                        const symbol     = getSymbol(o);
                        const status     = getOrderStatus(o);
                        const isBuy      = getAction(o) === "BUY";
                        const canCancel  = CANCELLABLE.includes(status.toLowerCase());
                        const qty        = Number(o.quantity ?? 0);
                        const filledQty  = Number(o.filledquantity ?? o.filled_quantity ?? 0);
                        const avgPrice   = Number(o.averageprice ?? o.average_price ?? 0);
                        const limitPrice = Number(o.price ?? 0);
                        const oid        = getOrderId(o);
                        const strat      = oid ? strategyByOrderId[oid] : "";
                        return (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                {isBuy
                                  ? <ArrowUpRight className="h-3 w-3 text-emerald-400 shrink-0" />
                                  : <ArrowDownRight className="h-3 w-3 text-red-400 shrink-0" />}
                                <span className="font-mono text-white font-semibold">{symbol || "—"}</span>
                              </div>
                              <p className="text-zinc-600 text-[10px] ml-4">{o.exchange}</p>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`font-bold text-[11px] ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{getAction(o) || "—"}</span>
                            </td>
                            <td className="px-3 py-2 text-zinc-300 font-mono">
                              <span className={filledQty > 0 ? "text-white" : "text-zinc-500"}>{filledQty}</span>
                              <span className="text-zinc-600"> / {qty}</span>
                            </td>
                            <td className="px-3 py-2 text-zinc-300 font-mono">
                              {avgPrice > 0 ? fmt(avgPrice) : fmt(limitPrice)}
                            </td>
                            <td className="px-3 py-2 text-zinc-500">{o.product}</td>
                            <td className="px-3 py-2"><StatusBadge status={status} /></td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1">
                                {strat ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-300 w-fit">
                                    {strat}
                                  </span>
                                ) : (
                                  <span className="text-zinc-700">—</span>
                                )}
                                {(() => {
                                  const ae = oid ? autoExitByEntryOrderId[oid] : null;
                                  if (!ae?.status) return null;
                                  const s = String(ae.status);
                                  const cls =
                                    s === "active" ? "border-teal-500/20 bg-teal-500/10 text-teal-300" :
                                    s === "closed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" :
                                    s === "await_fill" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" :
                                    "border-red-500/20 bg-red-500/10 text-red-300";
                                  return (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls} w-fit`}>
                                      Auto-exit: {s}
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-zinc-600 text-[10px]">
                              {getTime(o).slice(11, 19)}
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
                      <p className="text-zinc-400 text-[10px]">{fmtMoney(tradeStats.buyVal)} value</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                      <p className="text-red-400 text-xs font-bold">{tradeStats.sellCnt} Sells</p>
                      <p className="text-zinc-400 text-[10px]">{fmtMoney(tradeStats.sellVal)} value</p>
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
                          {["Symbol", "Side", "Qty", "Avg Price", "Product", "Strategy", "Time"].map(h => (
                            <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.tradebook.map((t, i) => {
                          const symbol = getSymbol(t);
                          const side = getAction(t);
                          const qty = getQty(t);
                          const avg = getAvgPrice(t);
                          const isBuy = side === "BUY";
                          const oid = getOrderId(t);
                          const strat = oid ? strategyByOrderId[oid] : "";
                          return (
                            <tr
                              key={i}
                              className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer group"
                              onClick={() => symbol && openQuickTrade(
                                symbol, String(t.exchange ?? "NSE"), isBuy ? qty : -qty,
                                avg, liveLtps[symbol] ?? avg, 0,
                                String(t.product ?? "CNC"), isBuy ? "SELL" : "BUY"
                              )}
                            >
                              <td className="px-3 py-2">
                                <p className="font-mono text-white font-semibold group-hover:text-teal-300 transition-colors">
                                  {symbol || "—"}
                                  {symbol && <span className="ml-1 text-[9px] text-zinc-700 group-hover:text-teal-600">↗</span>}
                                </p>
                                <p className="text-zinc-600 text-[10px]">{t.exchange}</p>
                              </td>
                              <td className="px-3 py-2">
                                <Badge className={`text-[10px] font-bold border ${isBuy ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                                  {side || "—"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-zinc-300 font-mono">
                                <span className="text-white">{qty}</span>
                                <span className="text-zinc-600"> / {qty}</span>
                              </td>
                              <td className="px-3 py-2 text-zinc-300 font-mono">₹{avg.toFixed(2)}</td>
                              <td className="px-3 py-2 text-zinc-500">{t.product}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1">
                                  {strat ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-300 w-fit">
                                      {strat}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-700">—</span>
                                  )}
                                  {(() => {
                                    const ae = oid ? autoExitByEntryOrderId[oid] : null;
                                    if (!ae?.status) return null;
                                    const s = String(ae.status);
                                    const cls =
                                      s === "active" ? "border-teal-500/20 bg-teal-500/10 text-teal-300" :
                                      s === "closed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" :
                                      s === "await_fill" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" :
                                      "border-red-500/20 bg-red-500/10 text-red-300";
                                    return (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls} w-fit`}>
                                        Auto-exit: {s}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-zinc-600 text-[10px]">
                                {fmtTime(getTime(t))}
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
                  <p className="text-[10px] text-zinc-700 mt-0.5">Create strategies for auto-execution</p>
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
                          <span className="text-[10px] text-zinc-700" title="Session window (IST). Fire from UI = executes immediately. Webhook = when conditions met within this window.">{s.start_time}–{s.end_time}</span>
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
                                <SymbolSearchInput
                                  value={fs.symbol}
                                  onChange={(v) => setFireState(s.id, { symbol: v })}
                                  onSelect={(sym, ex) => setFireState(s.id, { symbol: sym, exchange: ex })}
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
                            {/* Backtest option — available for every order and strategy including custom */}
                            <div className="rounded border border-amber-900/50 bg-amber-950/20 p-2.5 space-y-2">
                              <p className="text-[10px] font-medium text-amber-500 flex items-center gap-1">
                                <BarChart3 className="h-3 w-3" /> Quick backtest (Edge)
                              </p>
                              <p className="text-[9px] text-zinc-600">
                                VectorBT + SL/TP timing review → <span className="text-teal-500/90">Algo Trading → Backtesting</span>
                              </p>
                              <div className="flex flex-wrap items-end gap-2">
                                <div className="flex-1 min-w-[160px]">
                                  <p className="text-[9px] text-zinc-600">Strategy model</p>
                                  <p className="text-[10px] text-zinc-200 font-semibold">
                                    {(() => {
                                      const code = String(s.paper_strategy_type ?? "trend_following");
                                      const label = STRATEGIES.find(x => x.value === code)?.label;
                                      return label ?? code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                                    })()}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[10px] border-amber-700/50 text-amber-400 hover:bg-amber-900/30"
                                  disabled={fs.backtestLoading || !fs.symbol.trim()}
                                  onClick={() => runBacktestForFire(s)}
                                >
                                  {fs.backtestLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
                                  <span className="ml-1">{fs.backtestLoading ? "Running…" : "Run Backtest"}</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[10px] border-purple-700/50 text-purple-300 hover:bg-purple-900/30"
                                  disabled={fs.backtestAiLoading || !fs.symbol.trim()}
                                  onClick={async () => {
                                    const sym = fs.symbol.trim().toUpperCase();
                                    if (!sym) return;
                                    setFireState(s.id, { backtestAiLoading: true });
                                    try {
                                      const { data: { session } } = await supabase.auth.getSession();
                                      const br = fs.backtestResult;
                                      const aiRes = await supabase.functions.invoke("analyze-trade", {
                                        body: {
                                          symbol: sym,
                                          exchange: fs.exchange,
                                          action: "BUY",
                                          quantity: parseInt(fs.quantity) || 1,
                                          product: fs.product,
                                          backtest_summary: br ? {
                                            totalTrades: br.totalTrades,
                                            winRate: br.winRate,
                                            totalReturn: br.totalReturn,
                                            strategyAchieved: br.strategyAchieved,
                                          } : undefined,
                                        },
                                        headers: { Authorization: `Bearer ${session?.access_token}` },
                                      });
                                      const analysis = (aiRes.data as any)?.analysis ?? "No AI analysis available.";
                                      setFireState(s.id, { backtestAiAnalysis: analysis });
                                      toast.info(`AI: ${analysis}`, { duration: 10000, id: `ai-bt-${s.id}` });
                                    } catch {
                                      toast.error("AI analysis failed");
                                    } finally {
                                      setFireState(s.id, { backtestAiLoading: false });
                                    }
                                  }}
                                >
                                  {fs.backtestAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                                  <span className="ml-1">{fs.backtestAiLoading ? "Analysing…" : "AI Analysis"}</span>
                                </Button>
                              </div>
                              {fs.backtestResult && (
                                <div className="text-[10px] space-y-2">
                                  {fs.backtestResult.dataSource && (
                                    <p className="text-zinc-500">
                                      Data: <span className="text-teal-400/90">{fs.backtestResult.dataSource}</span>
                                    </p>
                                  )}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                    <span className="text-zinc-500">Trades</span><span className="text-zinc-500">Win</span><span className="text-zinc-500">Win rate</span><span className="text-zinc-500">Return</span>
                                    <span className="font-mono">{fs.backtestResult.totalTrades}</span>
                                    <span className="font-mono text-zinc-200">{fs.backtestResult.wins}/{fs.backtestResult.losses}</span>
                                    <span className="font-mono text-emerald-400">{fs.backtestResult.winRate}%</span>
                                    <span className={`font-mono ${fs.backtestResult.totalReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fs.backtestResult.totalReturn >= 0 ? "+" : ""}{fs.backtestResult.totalReturn}%</span>
                                  </div>
                                  {typeof fs.backtestResult.profitFactor === "number" && (
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                      <span className="text-zinc-500">PF</span><span className="text-zinc-500">Max DD</span><span className="text-zinc-500">Now</span>
                                      <span className="font-mono">{fs.backtestResult.profitFactor}</span>
                                      <span className="font-mono">{fs.backtestResult.maxDrawdown ?? "—"}%</span>
                                      <span className={`font-mono ${fs.backtestResult.strategyAchieved ? "text-emerald-400" : "text-zinc-400"}`}>{fs.backtestResult.strategyAchieved ? "MET" : "NOT MET"}</span>
                                    </div>
                                  )}
                                  {fs.backtestResult.achievementReason && (
                                    <p className="text-[10px] text-zinc-500">{fs.backtestResult.achievementReason}</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => fireSignal(s, "BUY")} disabled={fs.firing}
                                className="py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {fs.firing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><TrendingUp className="h-3.5 w-3.5" /> BUY</>}
                              </button>
                              <button
                                onClick={() => fireSignal(s, "SELL")} disabled={fs.firing}
                                className="py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {fs.firing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><TrendingDown className="h-3.5 w-3.5" /> SELL</>}
                              </button>
                            </div>
                            {fs.lastFired && (
                              <button
                                onClick={() => {
                                  setFireState(s.id, {
                                    symbol: fs.lastFired!.symbol,
                                    exchange: fs.lastFired!.exchange,
                                    quantity: fs.lastFired!.quantity,
                                    product: fs.lastFired!.product,
                                  });
                                  fireSignal(s, fs.lastFired!.action);
                                }}
                                disabled={fs.firing}
                                className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> Re-execute last ({fs.lastFired.action})
                              </button>
                            )}
                            <p className="text-[10px] text-zinc-700 text-center">
                              Option to backtest every order and strategy (including custom). Fire executes immediately.
                            </p>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Create Strategy Dialog ──────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(o) => {
        if (!o) {
          setShowCreate(false);
          setForm(EMPTY_STRATEGY);
          setUseFromPaper(false);
          setPaperType("");
          setBacktestResult(null);
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="h-4 w-4 text-purple-400" />
              New Strategy
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Define your strategy parameters. Webhook is stored in backend for real-time execution.
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
                  onChange={e => { setAutoNameFromPaper(false); setF("name", e.target.value); }}
                  className="bg-zinc-950 border-zinc-700 text-white text-xs h-8"
                  autoFocus
                />
                {useFromPaper && (
                  <div className="flex items-center justify-between mt-1">
                    <button
                      onClick={() => { setAutoNameFromPaper(true); applyPaperPrefill(paperType || "trend_following", { forceName: true }); }}
                      className="text-[10px] text-purple-400 hover:text-purple-300"
                      type="button"
                    >
                      Auto-name from paper strategy
                    </button>
                    <span className="text-[10px] text-zinc-600">{autoNameFromPaper ? "ON" : "OFF"}</span>
                  </div>
                )}
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

            {/* Start from paper strategy */}
            <div className="space-y-2 p-3 rounded-lg border border-zinc-800 bg-zinc-950/50">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = !useFromPaper;
                    setUseFromPaper(next);
                    if (next) {
                      const pt = paperType || "trend_following";
                      if (!paperType) setPaperType(pt);
                      setAutoNameFromPaper(true);
                      setAutoTimesFromPaper(true);
                      applyPaperPrefill(pt, { forceName: true, forceTimes: true });
                    } else {
                      setBacktestResult(null);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${useFromPaper ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
                >
                  <BarChart3 className="h-3 w-3" />
                  Start from paper strategy
                </button>
                {useFromPaper && (
                  <button
                    type="button"
                    onClick={() => applyPaperPrefill(paperType || "trend_following", { forceName: autoNameFromPaper, forceTimes: true })}
                    className="ml-auto text-[10px] text-zinc-400 hover:text-zinc-200"
                    title="Re-apply direction/session/times"
                  >
                    Re-apply defaults
                  </button>
                )}
              </div>
              {useFromPaper && (
                <div className="space-y-1 pt-2 border-t border-zinc-800">
                  <Label className="text-zinc-500 text-[11px]">Paper strategy type</Label>
                  <Select value={paperType} onValueChange={(v) => { setPaperType(v); applyPaperPrefill(v, { forceTimes: true }); setBacktestResult(null); }}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-200 h-8 text-xs">
                      <SelectValue placeholder="Pick strategy" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-64">
                      {STRATEGIES.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-xs text-zinc-200">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                    <Input type="time" value={val} onChange={e => { setAutoTimesFromPaper(false); setF(field, e.target.value); }}
                      className="bg-zinc-950 border-zinc-700 text-white text-xs h-8 px-2" />
                  </div>
                ))}
              </div>
              {useFromPaper && (
                <div className="flex items-center justify-between mt-1">
                  <button
                    type="button"
                    onClick={() => { setAutoTimesFromPaper(true); applyPaperPrefill(paperType || "trend_following", { forceTimes: true }); }}
                    className="text-[10px] text-purple-400 hover:text-purple-300"
                  >
                    Auto-times from paper strategy
                  </button>
                  <span className="text-[10px] text-zinc-600">{autoTimesFromPaper ? "ON" : "OFF"}</span>
                </div>
              )}
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
                : <><Zap className="h-3.5 w-3.5 mr-1.5" />Create Strategy</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Place Order Dialog (full-screen, chart left + form right) ─────── */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-[100vw] max-w-[100vw] w-screen h-screen p-0 overflow-hidden rounded-none">
          <PlaceOrderPanel
            broker={broker}
            onOrderPlaced={() => { setShowOrderModal(false); load(true); }}
            asModal
            fullscreen
          />
        </DialogContent>
      </Dialog>

      {/* ── Quick Trade Dialog (click on row) ────────────────────────────────── */}
      <Dialog open={!!qtd} onOpenChange={(o) => !o && setQtd(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-[100vw] max-w-[100vw] w-screen h-screen p-0 overflow-hidden rounded-none">
          {qtd && (() => {
            const needsLimit   = qtd.pricetype === "LIMIT" || qtd.pricetype === "SL";
            const needsTrigger = qtd.pricetype === "SL"    || qtd.pricetype === "SL-M";
            const isBuy        = qtd.action === "BUY";
            const ltpDiff      = qtd.ltp > 0 && qtd.avgPrice > 0 ? qtd.ltp - qtd.avgPrice : 0;
            const ltpDiffPct   = qtd.avgPrice > 0 ? (ltpDiff / qtd.avgPrice) * 100 : 0;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
                {/* ── LEFT: Chart + AI Analysis ────────────────────────────── */}
                <div className="p-4 space-y-3 border-b lg:border-b-0 lg:border-r border-zinc-800 overflow-y-auto">
                  {/* Stock header */}
                  <div className="flex items-center gap-3">
                    <div>
                      <h2 className="font-mono text-xl font-bold text-white">{qtd.symbol}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">{qtd.exchange}</span>
                        <span className="text-[10px] text-teal-400 border border-teal-700/50 px-1.5 py-0.5 rounded">{qtd.product}</span>
                      </div>
                    </div>
                    <div className="ml-auto text-right">
                      {qtd.ltp > 0 && (
                        <>
                          <p className={`text-lg font-bold font-mono ${ltpDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            ₹{qtd.ltp.toFixed(2)}
                          </p>
                          {ltpDiff !== 0 && (
                            <p className={`text-[11px] ${ltpDiff >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {ltpDiff >= 0 ? "▲" : "▼"} ₹{Math.abs(ltpDiff).toFixed(2)} ({Math.abs(ltpDiffPct).toFixed(2)}%)
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Position summary row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        label: "Qty Held",
                        value: qtd.qty !== 0 ? `${Math.abs(qtd.qty)} ${qtd.qty > 0 ? "Long" : "Short"}` : "—",
                        color: qtd.qty > 0 ? "text-emerald-400" : qtd.qty < 0 ? "text-red-400" : "text-zinc-400",
                      },
                      {
                        label: "Avg Cost",
                        value: qtd.avgPrice > 0 ? `₹${qtd.avgPrice.toFixed(2)}` : "—",
                        color: "text-zinc-200",
                      },
                      {
                        label: "Unreal P&L",
                        value: qtd.pnl !== 0 ? `${qtd.pnl > 0 ? "+" : ""}₹${qtd.pnl.toFixed(2)}` : "—",
                        color: qtd.pnl >= 0 ? "text-emerald-400" : "text-red-400",
                      },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-zinc-900 rounded-lg p-2 border border-zinc-800 text-center">
                        <p className="text-zinc-600 text-[10px] mb-1">{label}</p>
                        <p className={`font-bold text-xs font-mono ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* TradingView Chart */}
                  <TradingViewChart symbol={qtd.symbol} exchange={qtd.exchange} height={220} />

                  {/* AI Analysis */}
                  <div className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5" /> AI Analysis
                      {qtd.aiLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                    </p>
                    {qtd.aiLoading ? (
                      <p className="text-[11px] text-zinc-500 animate-pulse">Analysing {qtd.symbol}…</p>
                    ) : (
                      <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {qtd.aiAnalysis}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── RIGHT: Order Form ─────────────────────────────────────── */}
                <div className="p-4 space-y-3">
                  <DialogHeader className="mb-1">
                    <DialogTitle className="text-base text-white">
                      Place Order — <span className="font-mono text-teal-300">{qtd.symbol}</span>
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 text-xs">
                      {qtd.exchange} · via {(broker || "broker").charAt(0).toUpperCase() + (broker || "broker").slice(1)}
                    </DialogDescription>
                  </DialogHeader>

                  {/* BUY / SELL */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-900 rounded-lg">
                    {(["BUY", "SELL"] as const).map(a => (
                      <button key={a} onClick={() => qtdSet("action", a)}
                        className={`py-2.5 rounded-md text-sm font-bold transition-all ${
                          qtd.action === a
                            ? a === "BUY" ? "bg-green-600 text-white shadow-lg shadow-green-900/40" : "bg-red-600 text-white shadow-lg shadow-red-900/40"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}>
                        {a === "BUY" ? "▲ BUY" : "▼ SELL"}
                      </button>
                    ))}
                  </div>

                  {/* Product type */}
                  <div className="space-y-1">
                    <Label className="text-zinc-500 text-[11px]">Product Type</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { v: "CNC",  l: "CNC",  sub: "Delivery" },
                        { v: "MIS",  l: "MIS",  sub: "Intraday" },
                        { v: "NRML", l: "NRML", sub: "F&O Carry" },
                      ].map(({ v, l, sub }) => (
                        <button key={v} onClick={() => qtdSet("product", v)}
                          className={`py-1.5 rounded-md text-center transition-all border text-xs font-bold ${
                            qtd.product === v
                              ? "bg-zinc-700 border-zinc-500 text-white"
                              : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                          }`}>
                          {l}<br />
                          <span className="font-normal text-[9px] text-zinc-600">{sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Order type tabs */}
                  <div className="space-y-1">
                    <Label className="text-zinc-500 text-[11px]">Order Type</Label>
                    <div className="grid grid-cols-4 gap-1">
                      {(["MARKET", "LIMIT", "SL", "SL-M"] as const).map(pt => (
                        <button key={pt} onClick={() => qtdSet("pricetype", pt)}
                          className={`py-1.5 rounded-md text-[11px] font-bold transition-all border ${
                            qtd.pricetype === pt
                              ? "bg-zinc-700 border-zinc-500 text-white"
                              : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                          }`}>
                          {pt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Qty + filled display */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-500 text-[11px]">Qty</Label>
                      {qtd.qty !== 0 && (
                        <span className="text-[10px] text-zinc-600 font-mono">
                          Placing: <span className="text-zinc-400">{qtd.qtyInput || "0"} / {Math.abs(qtd.qty)}</span> held
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input type="number" min={1}
                        value={qtd.qtyInput}
                        onChange={e => qtdSet("qtyInput", e.target.value)}
                        className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm font-mono" />
                      {qtd.qty > 0 && qtd.action === "SELL" && (
                        <button
                          onClick={() => qtdSet("qtyInput", String(Math.abs(qtd.qty)))}
                          className="text-[10px] text-teal-400 border border-teal-500/30 px-3 py-1 rounded-lg hover:bg-teal-500/10 transition-colors shrink-0 whitespace-nowrap"
                        >All ({qtd.qty})</button>
                      )}
                    </div>
                  </div>

                  {/* Limit / SL price fields */}
                  {(needsLimit || needsTrigger) && (
                    <div className="grid grid-cols-2 gap-2">
                      {needsLimit && (
                        <div className="space-y-1">
                          <Label className="text-zinc-500 text-[11px]">Limit Price ₹</Label>
                          <Input type="number" step="0.05" placeholder={qtd.ltp > 0 ? qtd.ltp.toFixed(2) : "0.00"}
                            value={qtd.price}
                            onChange={e => qtdSet("price", e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-white font-mono h-9 text-sm" />
                        </div>
                      )}
                      {needsTrigger && (
                        <div className="space-y-1">
                          <Label className="text-zinc-500 text-[11px]">Trigger Price ₹</Label>
                          <Input type="number" step="0.05" placeholder="0.00"
                            value={qtd.trigger_price}
                            onChange={e => qtdSet("trigger_price", e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-white font-mono h-9 text-sm" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Validity */}
                  <div className="space-y-1">
                    <Label className="text-zinc-500 text-[11px]">Validity</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { v: "DAY", l: "Day", sub: "Valid today" },
                        { v: "IOC", l: "IOC", sub: "Immediate or cancel" },
                      ].map(({ v, l, sub }) => (
                        <button key={v} onClick={() => qtdSet("validity", v as "DAY" | "IOC")}
                          className={`py-1.5 rounded-md text-center transition-all border text-xs font-bold ${
                            qtd.validity === v
                              ? "bg-zinc-700 border-zinc-500 text-white"
                              : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                          }`}>
                          {l}<br />
                          <span className="font-normal text-[9px] text-zinc-600">{sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Order summary strip */}
                  <div className={`rounded-lg p-2.5 text-[11px] font-mono border ${
                    isBuy ? "bg-green-500/5 border-green-500/20 text-green-300" : "bg-red-500/5 border-red-500/20 text-red-300"
                  }`}>
                    <span className="font-bold">{qtd.action}</span>{" "}
                    <span className="font-bold">{qtd.qtyInput || "?"}</span> ×{" "}
                    <span className="font-bold">{qtd.symbol}</span>{" "}
                    · {qtd.exchange} · {qtd.product} · {qtd.pricetype}
                    {needsLimit && qtd.price && ` @ ₹${qtd.price}`}
                    {needsTrigger && qtd.trigger_price && ` trigger ₹${qtd.trigger_price}`}
                    {" "}· {qtd.validity}
                  </div>

                  {/* Confirm button — blocked until AI analysis completes */}
                  <button
                    onClick={placeQuickOrder}
                    disabled={qtd.placing || qtd.aiLoading || !qtd.qtyInput || parseInt(qtd.qtyInput) < 1}
                    className={`w-full py-3.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                      isBuy
                        ? "bg-green-600 hover:bg-green-500 active:bg-green-700 text-white shadow-lg shadow-green-900/30"
                        : "bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-lg shadow-red-900/30"
                    }`}
                  >
                    {qtd.placing
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Placing…</>
                      : qtd.aiLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Waiting for AI analysis…</>
                      : <><Send className="h-4 w-4" />{isBuy ? "▲ Confirm BUY" : "▼ Confirm SELL"} {qtd.symbol}</>
                    }
                  </button>
                  <p className="text-[10px] text-center text-zinc-700">⚠ Real money — executes instantly on broker</p>
                </div>
              </div>
            );
          })()}
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