/**
 * Backtesting — full detailed view with custom strategy conditions.
 * Custom strategies built in AlgoStrategyBuilder have their exact
 * entry/exit conditions (RSI, MACD, EMA, BB, crossovers) sent to the
 * VectorBT engine, which evaluates them on real daily OHLCV data.
 *
 * Trade detail opens in a Dialog popup with:
 *  - Full OHLC mini chart + RSI
 *  - Entry/exit indicators at each bar
 *  - Historical "what-if": what would have happened if you ran this
 *    same strategy 1w / 1m / 3m / 6m / 1y ago
 */
import { useEffect, useState, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ComposedChart, AreaChart, Area, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  Cell, LineChart, Line,
} from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Brain, ChevronLeft, ChevronRight, Download, ExternalLink,
  Eye, ListFilter, Loader2, LineChart as LineChartIcon, Search, ShieldCheck, 
  Trash2, TrendingUp, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { fetchUsdInr } from "@/lib/fxRates";
import {
  deriveMaxHoldDaysFromExit,
  entryConditionsConfigured,
  resolveEngineStrategyIdForCustom,
  mergeSnapshotWithBacktestRun,
  type FullCustomStrategy,
} from "@/lib/backtestVectorbtPayload";

const EXCHANGES = ["NSE", "BSE", "GLOBAL", "NFO", "MCX", "CDS"];

/** AlgoStrategyBuilder execution_days: 0=Sun … 6=Sat */
const EXEC_DAY_LABELS: Record<number, string> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

function defaultDisplayCurrency(exchange: string, sym: string): "INR" | "USD" {
  const u = sym.toUpperCase();
  if (exchange === "NSE" || exchange === "BSE") return "INR";
  if (u.endsWith(".NS") || u.endsWith(".BO")) return "INR";
  return "USD";
}

function isUsdQuotedSymbol(sym: string): boolean {
  const u = sym.trim().toUpperCase();
  if (!u || u.endsWith(".NS") || u.endsWith(".BO")) return false;
  if (u.includes("-USD")) return true;
  if (u.endsWith("USD") && !u.includes("INR")) return true;
  return false;
}

function quoteNoteForSymbol(
  sym: string,
  exchange: string,
  displayCurrency: "INR" | "USD",
  inrPerUsd: number | null,
  fxDate: string,
): string | null {
  const u = sym.trim().toUpperCase();
  if (!u) return null;
  const fxBit = inrPerUsd && fxDate
    ? ` Spot USD/INR ≈ ${inrPerUsd.toFixed(2)} (${fxDate}, ECB via Frankfurter).`
    : inrPerUsd
      ? ` Spot USD/INR ≈ ${inrPerUsd.toFixed(2)} (ECB via Frankfurter).`
      : "";
  if (u.includes("=X") || u.endsWith("=F")) {
    return `OHLC follows the feed’s quote. Money P&L = (return %) × notional in ${displayCurrency}.${fxBit}`;
  }
  if (isUsdQuotedSymbol(u)) {
    if (displayCurrency === "INR") {
      return `Chart prices stay in USD (feed). P&L uses your INR notional; changing USD/INR in the toolbar converts that notional at live rate so ₹ profit is not the same number as $ profit for the same economic size.${fxBit}`;
    }
    return `Chart prices are USD. Notional and P&L are in USD.${fxBit}`;
  }
  if (exchange === "NSE" || exchange === "BSE" || u.endsWith(".NS") || u.endsWith(".BO")) {
    return "Prices are typically INR. P&L uses your INR notional.";
  }
  return `Prices follow the feed’s quote currency. P&L = (return %) × notional in ${displayCurrency}.${fxBit}`;
}

function formatMoneyAmount(amount: number, currency: "INR" | "USD"): string {
  const abs = Math.abs(amount);
  const formatted = currency === "INR"
    ? abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })
    : abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const sign = amount >= 0 ? "+" : "−";
  return currency === "INR" ? `${sign}₹${formatted}` : `${sign}$${formatted}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SymbolResult = {
  symbol: string; exchange: string; type: string;
  description?: string; full_symbol?: string;
};

type Candle = {
  date: string; open: number; high: number; low: number; close: number;
  sma20: number | null; rsi14: number | null; isEntry: boolean; isExit: boolean;
};

type Trade = {
  tradeNo: number;
  entryDate: string; exitDate: string;
  entryPrice: number | null; exitPrice: number | null;
  holdingDays: number | null;
  returnPct: number; absPnl: number | null;
  profitable: boolean; exitReason: string;
  entryRsi: number | null; entrySma20: number | null;
  entryMacd: number | null; exitRsi: number | null;
  candles: Candle[];
};

type HistoricalSnapshot = {
  label: string; lookbackDays: number;
  trades: number; wins: number; losses: number;
  winRate: number; totalReturn: number;
  bestTrade: number; worstTrade: number; avgHoldingDays: number;
  equityCurveSlice: Array<{ date: string; value: number }>;
};

type BacktestResult = {
  engine: string; action: string; backtestPeriod: string;
  symbol: string; exchange: string; strategy: string;
  usedCustomConditions?: boolean;
  totalTrades: number; wins: number; losses: number; winRate: number;
  totalReturn: number; avgReturn: number; maxDrawdown: number;
  profitFactor: number; sharpeRatio: number;
  bestTrade: number; worstTrade: number; avgHoldingDays: number;
  avgWin: number; avgLoss: number; expectancy: number;
  maxWinStreak: number; maxLossStreak: number;
  exitReasonCounts: Record<string, number>;
  trades: Trade[];
  equityCurve: Array<{ date: string; value: number }>;
  dailyReturns?: Array<{ date: string; returnPct: number }>;
  executionDaysApplied?: number[] | null;
  historicalSnapshots: HistoricalSnapshot[];
  strategyAchieved: boolean; achievementReason: string;
  currentIndicators: {
    price: number; sma20: number; rsi14: number;
    macd: number; macdSignal: number; high20d: number; low20d: number;
  };
};

/** First instrument from saved strategy `symbols` jsonb (strings or { symbol, exchange } rows). */
function firstSymbolAndExchangeFromStrategy(cs: FullCustomStrategy): { symbol: string; exchange: string } | null {
  const raw = cs.symbols;
  if (!Array.isArray(raw) || raw.length === 0) {
    const pc = cs.position_config;
    if (pc && typeof pc === "object") {
      const sym = String((pc as Record<string, unknown>).symbol ?? "").trim().toUpperCase();
      if (sym) {
        const ex = String((pc as Record<string, unknown>).exchange ?? "NSE").toUpperCase();
        const exNorm = ["NSE", "BSE", "GLOBAL", "NFO", "MCX", "CDS"].includes(ex) ? ex : "NSE";
        return { symbol: sym, exchange: exNorm };
      }
    }
    return null;
  }
  const first = raw[0];
  if (typeof first === "string") {
    const u = first.trim().toUpperCase();
    if (!u) return null;
    const ex = u.endsWith(".BO") ? "BSE" : u.endsWith(".NS") ? "NSE" : "GLOBAL";
    return { symbol: u, exchange: ex };
  }
  if (first && typeof first === "object") {
    const o = first as Record<string, unknown>;
    const sym = String(o.symbol ?? o.tradingsymbol ?? "").trim().toUpperCase();
    if (!sym) return null;
    const ex = String(o.exchange ?? "NSE").toUpperCase();
    const exNorm = ["NSE", "BSE", "GLOBAL", "NFO", "MCX", "CDS"].includes(ex) ? ex : "NSE";
    return { symbol: sym, exchange: exNorm };
  }
  return null;
}

function formatSavedSymbolsList(cs: FullCustomStrategy): string {
  const raw = cs.symbols;
  if (!Array.isArray(raw) || raw.length === 0) return "—";
  return raw
    .map((item: unknown) => {
      if (typeof item === "string") return item.trim().toUpperCase();
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const s = String(o.symbol ?? o.tradingsymbol ?? "").trim();
        const x = o.exchange != null ? ` (${String(o.exchange)})` : "";
        return s ? `${s.toUpperCase()}${x}` : "";
      }
      return "";
    })
    .filter(Boolean)
    .join(", ") || "—";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SymbolSearchInput({ value, onChange, onSelect }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (symbol: string, exchange: string) => void;
}) {
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debRef = useState<{ t?: ReturnType<typeof setTimeout> }>({})[0];

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const list = ((res.data as any[]) ?? []).slice(0, 10) as SymbolResult[];
      setResults(list); setOpen(list.length > 0);
    } catch { setResults([]); setOpen(false); } finally { setSearching(false); }
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <Input
          placeholder="Search symbol…" value={value}
          onChange={e => { const v = e.target.value.toUpperCase(); onChange(v); if (debRef.t) clearTimeout(debRef.t); debRef.t = setTimeout(() => search(v), 250); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="bg-zinc-800 border-zinc-700 font-mono text-sm pl-8 pr-8 uppercase"
        />
        {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden">
          {results.map(r => (
            <button key={String(r.full_symbol ?? r.symbol)} type="button"
              onClick={() => { const full = (r.full_symbol ?? r.symbol ?? "").toUpperCase(); const ex = full.endsWith(".BO") ? "BSE" : full.endsWith(".NS") ? "NSE" : "GLOBAL"; onSelect(full || r.symbol, ex); setOpen(false); setResults([]); }}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-zinc-100 text-xs">{r.symbol}</span>
                </div>
                {r.description && <div className="text-[10px] text-zinc-500 truncate">{r.description}</div>}
              </div>
              <span className="text-[10px] text-zinc-600 shrink-0">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExitReasonBadge({ reason }: { reason: string }) {
  if (reason === "stop_loss") return <Badge className="bg-red-900/60 text-red-300 border-red-700 text-[10px] px-1.5 py-0">SL</Badge>;
  if (reason === "take_profit") return <Badge className="bg-emerald-900/60 text-emerald-300 border-emerald-700 text-[10px] px-1.5 py-0">TP</Badge>;
  if (reason === "max_hold") return <Badge className="bg-amber-900/60 text-amber-300 border-amber-700 text-[10px] px-1.5 py-0">Hold</Badge>;
  if (reason === "trailing_stop") return <Badge className="bg-orange-900/60 text-orange-300 border-orange-700 text-[10px] px-1.5 py-0">Trail</Badge>;
  if (reason === "indicator_exit") return <Badge className="bg-sky-900/60 text-sky-300 border-sky-700 text-[10px] px-1.5 py-0">Ind</Badge>;
  if (reason === "end_of_data") return <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[10px] px-1.5 py-0">EOD</Badge>;
  return <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700 text-[10px] px-1.5 py-0">{reason}</Badge>;
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string;
  color?: "green" | "red" | "yellow" | "blue" | "default";
}) {
  const cls = color === "green" ? "text-emerald-400" : color === "red" ? "text-red-400"
    : color === "yellow" ? "text-amber-400" : color === "blue" ? "text-sky-400" : "text-zinc-200";
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className={`font-mono font-semibold text-sm ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Trade detail popup ───────────────────────────────────────────────────────

function TradeDetailPopup({
  trade,
  action,
  symbol,
  snapshots,
  allTrades,
  open,
  onClose,
  initialCapital,
  displayCurrency,
  exchangeForQuote,
  inrPerUsd,
  fxRateDate,
}: {
  trade: Trade;
  action: string;
  symbol: string;
  snapshots: HistoricalSnapshot[];
  allTrades: Trade[];
  open: boolean;
  onClose: () => void;
  initialCapital: number;
  displayCurrency: "INR" | "USD";
  exchangeForQuote: string;
  inrPerUsd: number | null;
  fxRateDate: string;
}) {
  const [tab, setTab] = useState<"chart" | "whatif">("chart");

  const prices = trade.candles.map(c => c.close);
  const minP = prices.length ? Math.min(...prices) * 0.995 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.005 : 1;
  const profitable = trade.returnPct > 0;
  const pnlFromPct = (trade.returnPct / 100) * initialCapital;
  const pnlLabel = formatMoneyAmount(pnlFromPct, displayCurrency);

  // Find similar trades (same exit reason, within ±50% return relative)
  const similarTrades = allTrades.filter(
    t => t.tradeNo !== trade.tradeNo
      && t.exitReason === trade.exitReason
      && Math.abs(t.returnPct - trade.returnPct) <= Math.abs(trade.returnPct) * 0.5
  ).slice(0, 4);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] !max-w-[96vw] flex-col gap-0 !overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:!max-w-[800px] sm:h-auto sm:max-h-[90vh]">
        <div className="shrink-0 border-b border-zinc-800 px-5 py-4">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="text-white text-lg flex items-center gap-2">
                <span className="font-mono text-teal-400">{symbol}</span>
                <span className="text-zinc-600">/</span>
                Trade #{trade.tradeNo}
              </DialogTitle>
              <ExitReasonBadge reason={trade.exitReason} />
            </div>
            <div className="text-zinc-500 text-[10px] sm:text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`font-mono font-bold ${profitable ? "text-emerald-400" : "text-red-400"}`}>
                {trade.returnPct >= 0 ? "+" : ""}{trade.returnPct}%
              </span>
              <span className="text-zinc-700">|</span>
              <span>{pnlLabel} P&L</span>
              <span className="text-zinc-700">|</span>
              <span>{displayCurrency} {initialCapital.toLocaleString()} notional</span>
            </div>
          </DialogHeader>
        </div>

        {/* Tab switcher */}
        <div className="flex shrink-0 bg-zinc-900/30 px-5 border-b border-zinc-900">
          {(["chart", "whatif"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-xs font-medium transition-all relative ${
                tab === t
                  ? "text-teal-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "chart" ? "Trade Analysis" : "Historical Windows"}
              {tab === t && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500"
                />
              )}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800">
          {tab === "chart" && (
            <div className="space-y-6">
              {/* Key details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Entry" value={trade.entryPrice ?? "—"} sub={trade.entryDate} />
                <StatCard label="Exit" value={trade.exitPrice ?? "—"} sub={trade.exitDate} color={profitable ? "green" : "red"} />
                <StatCard label="Holding" value={`${trade.holdingDays ?? "—"}d`} sub="Duration" />
                <StatCard label="Return" value={`${trade.returnPct >= 0 ? "+" : ""}${trade.returnPct}%`} sub={pnlLabel} color={profitable ? "green" : "red"} />
              </div>

              {/* Indicators row */}
              {(trade.entryRsi !== null || trade.entrySma20 !== null || trade.entryMacd !== null) && (
                <div className="flex flex-wrap gap-2">
                  {trade.entryRsi !== null && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 flex items-center gap-2">
                      <span className="text-[10px] uppercase text-zinc-500 font-medium">RSI Entry</span>
                      <span className="text-purple-400 font-mono text-xs">{trade.entryRsi}</span>
                    </div>
                  )}
                  {trade.entrySma20 !== null && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 flex items-center gap-2">
                      <span className="text-[10px] uppercase text-zinc-500 font-medium">SMA20 Entry</span>
                      <span className="text-amber-400 font-mono text-xs">{trade.entrySma20}</span>
                    </div>
                  )}
                  {trade.entryMacd !== null && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 flex items-center gap-2">
                      <span className="text-[10px] uppercase text-zinc-500 font-medium">MACD Entry</span>
                      <span className="text-sky-400 font-mono text-xs">{trade.entryMacd}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Advanced charts */}
              {trade.candles.length > 0 ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-zinc-800 bg-black/40 p-4 shadow-inner">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Price Evolution & Indicators</p>
                      <div className="flex items-center gap-3 text-[9px] text-zinc-600">
                        <span className="flex items-center gap-1"><div className="w-2 h-1 bg-amber-500/80" /> SMA20</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-1 bg-emerald-500/80" /> ENTRY</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-1 bg-red-500/80" /> EXIT</span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={trade.candles} margin={{ top: 15, right: 10, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3f3f46" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#3f3f46" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#52525b", fontSize: 9 }}
                          tickFormatter={(v: string) => v.slice(5)}
                          axisLine={false}
                          tickLine={false}
                          padding={{ left: 10, right: 10 }}
                        />
                        <YAxis
                          domain={[minP, maxP]}
                          tick={{ fill: "#52525b", fontSize: 9 }}
                          tickFormatter={(v: number) => v.toLocaleString()}
                          width={45}
                          axisLine={false}
                          tickLine={false}
                          orientation="right"
                        />
                        <Tooltip
                          contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11, color: "#fff" }}
                          itemStyle={{ padding: 0 }}
                          cursor={{ stroke: "#3f3f46" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="close"
                          stroke="#71717a"
                          strokeWidth={2}
                          fill="url(#priceGrad)"
                          name="Price"
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="sma20"
                          stroke="#f59e0b"
                          dot={false}
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          name="SMA 20"
                          opacity={0.7}
                        />
                        <ReferenceLine
                          x={trade.entryDate}
                          stroke="#10b981"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{ value: "Entry", fill: "#10b981", fontSize: 10, position: "top", fontWeight: "bold" }}
                        />
                        <ReferenceLine
                          x={trade.exitDate}
                          stroke={profitable ? "#10b981" : "#ef4444"}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{ value: "Exit", fill: profitable ? "#10b981" : "#ef4444", fontSize: 10, position: "top", fontWeight: "bold" }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* RSI component */}
                  {trade.candles.some(c => c.rsi14 !== null) && (
                    <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                      <p className="text-[10px] font-semibold text-zinc-500 mb-3 uppercase tracking-widest">RSI (14)</p>
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={trade.candles} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                          <YAxis domain={[0, 100]} hide />
                          <Tooltip
                            contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 6, fontSize: 10 }}
                            formatter={(v: number) => [v?.toFixed?.(1), "RSI"]}
                          />
                          <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" opacity={0.4} />
                          <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" opacity={0.4} />
                          <ReferenceLine y={50} stroke="#52525b" strokeDasharray="1 1" opacity={0.2} />
                          <Line
                            type="monotone"
                            dataKey="rsi14"
                            stroke="#8b5cf6"
                            dot={false}
                            strokeWidth={2}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center border border-dashed border-zinc-800 rounded-lg text-zinc-600 text-xs italic">
                  Visual data not available for this window
                </div>
              )}

              {/* Similar Trades section */}
              {similarTrades.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Comparison: Similar Behavior</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {similarTrades.map(t => {
                      const isProf = t.returnPct > 0;
                      return (
                        <div key={t.tradeNo} className="flex items-center justify-between p-3 rounded-lg border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-900/60 transition-colors group">
                          <div className="space-y-1">
                            <p className="text-[11px] font-mono text-zinc-300">Run #{t.tradeNo} <span className="text-zinc-600 ml-1">• {t.entryDate}</span></p>
                            <ExitReasonBadge reason={t.exitReason} />
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-bold font-mono ${isProf ? "text-emerald-400" : "text-red-400"}`}>
                              {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "whatif" && (
            <div className="space-y-6">
              <div className="bg-teal-500/5 border border-teal-500/10 rounded-lg p-4">
                <p className="text-zinc-400 text-xs leading-relaxed">
                  <span className="text-teal-400 font-bold uppercase mr-2 tracking-tighter">Historical What-If</span>
                  Simulating the same strategy across different historical entry points. This helps validate if this trade's outcome was an outlier or consistent with past windows.
                </p>
              </div>

              {snapshots.length === 0 ? (
                <div className="h-40 flex items-center justify-center border border-dashed border-zinc-800 rounded-lg text-zinc-600 text-xs italic">
                  No multi-window benchmarks available
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Snapshot cards grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {snapshots.map(s => (
                      <div key={s.lookbackDays} className={`rounded-xl border p-4 space-y-4 transition-all ${s.totalReturn >= 0 ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-red-500/20 bg-red-500/[0.02]"}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-zinc-300 uppercase tracking-tighter text-xs">Window: {s.label}</p>
                          <Badge variant="outline" className={`${s.totalReturn >= 0 ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400"}`}>
                            {s.totalReturn >= 0 ? "+" : ""}{s.totalReturn}%
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <p className="text-[9px] text-zinc-500 uppercase">Win Rate</p>
                            <p className={`font-mono text-xs font-semibold ${s.winRate >= 50 ? "text-emerald-400" : "text-amber-400"}`}>{s.winRate}%</p>
                          </div>
                          <div className="space-y-1 text-right">
                            <p className="text-[9px] text-zinc-500 uppercase">Avg Hold</p>
                            <p className="font-mono text-xs text-zinc-300 font-semibold">{s.avgHoldingDays}d</p>
                          </div>
                        </div>

                        {s.equityCurveSlice.length > 5 && (
                          <div className="h-12 w-full opacity-60">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={s.equityCurveSlice} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id={`grad${s.lookbackDays}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={s.totalReturn >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={s.totalReturn >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <Area
                                  type="monotone"
                                  dataKey="value"
                                  stroke={s.totalReturn >= 0 ? "#10b981" : "#ef4444"}
                                  fill={`url(#grad${s.lookbackDays})`}
                                  strokeWidth={1}
                                  dot={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Windows Comparison Bar Chart */}
                  <div className="rounded-xl border border-zinc-800 bg-black/40 p-5">
                    <p className="text-[10px] font-semibold text-zinc-500 mb-5 uppercase tracking-widest text-center">Relative Performance Comparison</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <ComposedChart data={snapshots}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip
                          contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 10 }}
                          formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v}%`, "Return"]}
                        />
                        <Bar dataKey="totalReturn" radius={[4, 4, 0, 0]}>
                          {snapshots.map((s, i) => (
                            <Cell key={i} fill={s.totalReturn >= 0 ? "#10b981" : "#ef4444"} opacity={0.8} />
                          ))}
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800 p-4 bg-zinc-950 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-500 hover:text-white">
            Close Analysis
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────

function EquityCurveChart({
  data,
  initialCapital,
  displayCurrency,
}: {
  data: Array<{ date: string; value: number }>;
  initialCapital: number;
  displayCurrency: "INR" | "USD";
}) {
  if (!data || data.length === 0) return null;
  const base0 = data[0]?.value;
  const scale = base0 && Number.isFinite(base0) && base0 !== 0 ? initialCapital / base0 : 1;
  const scaled = data.map(d => ({ ...d, value: d.value * scale }));
  const startV = scaled[0]?.value ?? initialCapital;
  const endV = scaled[scaled.length - 1]?.value ?? startV;
  const isPos = endV >= startV;
  const totalRet = ((endV - startV) / startV) * 100;
  
  const curSym = displayCurrency === "INR" ? "₹" : "$";
  const loc = displayCurrency === "INR" ? "en-IN" : "en-US";
  const fmtK = (v: number) => `${curSym}${(v / 1000).toFixed(1)}k`;
  const fmtFull = (v: number) => `${curSym}${v.toLocaleString(loc, { maximumFractionDigits: 0 })}`;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Equity Curve</p>
          <p className="text-[10px] text-zinc-500">Starting: {fmtFull(initialCapital)} · {displayCurrency}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold font-mono ${isPos ? "text-emerald-400" : "text-red-400"}`}>
            {totalRet >= 0 ? "+" : ""}{totalRet.toFixed(2)}%
          </p>
          <p className="text-[9px] text-zinc-600 font-mono uppercase">Absolute Return</p>
        </div>
      </div>
      
      <div className="rounded-xl border border-zinc-800 bg-black/40 p-4 shadow-inner">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={scaled} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPos ? "#10b981" : "#ef4444"} stopOpacity={0.25} />
                <stop offset="95%" stopColor={isPos ? "#10b981" : "#ef4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="date" 
              tick={{ fill: "#52525b", fontSize: 9 }} 
              tickFormatter={(v: string) => v.slice(2, 10)} 
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fill: "#52525b", fontSize: 9 }} 
              tickFormatter={fmtK} 
              width={50} 
              axisLine={false}
              tickLine={false}
              orientation="right"
              domain={['auto', 'auto']}
            />
            <Tooltip 
              contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [fmtFull(Number(v)), "Portfolio Value"]} 
              labelStyle={{ color: "#71717a", marginBottom: 4 }}
            />
            <ReferenceLine 
              y={initialCapital} 
              stroke="#52525b" 
              strokeDasharray="4 4" 
              strokeWidth={1}
              label={{ value: "Initial Capital", position: "left", fill: "#52525b", fontSize: 10 }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke={isPos ? "#10b981" : "#ef4444"} 
              fill="url(#eqGrad)" 
              strokeWidth={2.5} 
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: isPos ? "#10b981" : "#ef4444" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TradeReturnsChart({ trades }: { trades: Trade[] }) {
  if (!trades || trades.length === 0) return null;
  const data = trades.map(t => ({ name: `#${t.tradeNo}`, ret: t.returnPct }));
  const avgRet = data.reduce((a, b) => a + b.ret, 0) / data.length;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Return per Trade (%)</p>
        <p className="text-[10px] text-zinc-500 font-mono">Avg: <span className={avgRet >= 0 ? "text-emerald-400" : "text-red-400"}>{avgRet.toFixed(2)}%</span></p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="name" 
              tick={{ fill: "#52525b", fontSize: 9 }} 
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tick={{ fill: "#52525b", fontSize: 9 }} 
              tickFormatter={(v: number) => `${v}%`} 
              width={40} 
              axisLine={false}
              tickLine={false}
              orientation="right"
            />
            <Tooltip 
              contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Trade Return"]} 
              labelStyle={{ color: "#71717a", marginBottom: 4 }}
            />
            <ReferenceLine y={0} stroke="#52525b" strokeWidth={1} />
            <ReferenceLine 
              y={avgRet} 
              stroke="#71717a" 
              strokeDasharray="3 3" 
              label={{ value: "Average", position: "left", fill: "#71717a", fontSize: 9 }} 
            />
            <Bar dataKey="ret" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell 
                  key={i} 
                  fill={d.ret > 0 ? "#10b981" : "#ef4444"} 
                  fillOpacity={0.7} 
                  className="transition-all hover:fill-opacity-100"
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DailyPortfolioReturnsChart({ data }: { data: Array<{ date: string; returnPct: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center border border-dashed border-zinc-800 rounded-xl text-zinc-600 text-xs italic">
        Daily return series not available
      </div>
    );
  }
  const chart = data.map(d => ({ name: d.date.slice(5), ret: d.returnPct }));
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Daily Portfolio Volatility (%)</p>
      <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chart} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="name" 
              tick={{ fill: "#52525b", fontSize: 8 }} 
              interval="preserveStartEnd" 
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tick={{ fill: "#52525b", fontSize: 9 }} 
              tickFormatter={(v: number) => `${v}%`} 
              width={40} 
              axisLine={false}
              tickLine={false}
              orientation="right"
            />
            <Tooltip 
              contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(3)}%`, "Bar Return"]} 
              labelStyle={{ color: "#71717a", marginBottom: 4 }}
            />
            <ReferenceLine y={0} stroke="#52525b" strokeWidth={1} />
            <Bar dataKey="ret" radius={[1, 1, 0, 0]}>
              {chart.map((d, i) => (
                <Cell 
                  key={i} 
                  fill={d.ret > 0 ? "#10b981" : "#ef4444"} 
                  fillOpacity={0.6} 
                  className="transition-all hover:fill-opacity-100"
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BacktestingSection() {
  const [mode, setMode] = useState<"strategy" | "simple">("strategy");
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState("NSE");
  const [strategy, setStrategy] = useState("trend_following");
  const [customStrategies, setCustomStrategies] = useState<FullCustomStrategy[]>([]);
  const [selectedCustomId, setSelectedCustomId] = useState<string>("");
  const [action, setAction] = useState<"BUY" | "SELL">("BUY");
  const [slPct, setSlPct] = useState("2");
  const [tpPct, setTpPct] = useState("4");
  const [startTime, setStartTime] = useState("09:15");
  const [endTime, setEndTime] = useState("15:15");
  const [squareoff, setSquareoff] = useState("15:15");
  const [days, setDays] = useState("365");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [timingReview, setTimingReview] = useState<string | null>(null);
  const [tradesPage, setTradesPage] = useState(1);
  const tradesPerPage = 15;
  type TradePopupState = {
    trade: Trade;
    symbol: string;
    exchange: string;
    action: string;
    snapshots: HistoricalSnapshot[];
    allTrades: Trade[];
    /** When opening from saved history, match the run’s notional / currency if stored */
    notionalOverride?: number;
    currencyOverride?: "INR" | "USD";
  };
  const [tradePopup, setTradePopup] = useState<TradePopupState | null>(null);
  const [initialCapital, setInitialCapital] = useState("100000");
  const [displayCurrency, setDisplayCurrency] = useState<"INR" | "USD">("INR");
  /** INR per 1 USD (ECB reference via Frankfurter) — used when switching P&L display ₹ ↔ $ */
  const [inrPerUsd, setInrPerUsd] = useState<number | null>(null);
  const [fxRateDate, setFxRateDate] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 10;
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"trades" | "equity" | "returns" | "daily">("trades");
  const [resultPopupOpen, setResultPopupOpen] = useState(false);

  const selectedCustom = customStrategies.find(s => s.id === selectedCustomId) ?? null;
  const stratLabel =
    selectedCustom?.name
    ?? STRATEGIES.find(s => s.value === strategy)?.label
    ?? strategy;

  // Load full custom strategy details including entry/exit conditions
  const loadCustomStrategies = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_strategies" as any)
        .select(
          "id,name,description,trading_mode,is_intraday,start_time,end_time,squareoff_time,risk_per_trade_pct,stop_loss_pct,take_profit_pct,entry_conditions,exit_conditions,market_type,paper_strategy_type,symbols,is_active,execution_days,position_config,risk_config,chart_config,updated_at",
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      setCustomStrategies((Array.isArray(data) ? data : []) as unknown as FullCustomStrategy[]);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => { loadCustomStrategies(); }, [loadCustomStrategies]);

  useEffect(() => {
    let cancelled = false;
    fetchUsdInr()
      .then(q => {
        if (!cancelled) {
          setInrPerUsd(q.inrPerUsd);
          setFxRateDate(q.rateDate);
        }
      })
      .catch(() => { /* optional: show once */ });
    return () => { cancelled = true; };
  }, []);

  const parseNotionalInput = (s: string) =>
    Math.max(1000, parseFloat(String(s).replace(/,/g, "")) || 0);

  const onDisplayCurrencyChange = useCallback(async (next: "INR" | "USD") => {
    if (next === displayCurrency) return;
    let rate = inrPerUsd;
    if (rate == null) {
      try {
        const q = await fetchUsdInr();
        rate = q.inrPerUsd;
        setInrPerUsd(rate);
        setFxRateDate(q.rateDate);
      } catch {
        toast.error("Could not load USD/INR for conversion. Check your connection.");
        return;
      }
    }
    const n = parseNotionalInput(initialCapital);
    const converted = next === "INR"
      ? Math.round(displayCurrency === "USD" ? n * rate : n)
      : Math.round(displayCurrency === "INR" ? Math.max(1000, n / rate) : n);
    setInitialCapital(String(converted));
    setDisplayCurrency(next);
  }, [displayCurrency, initialCapital, inrPerUsd]);

  const loadHistory = useCallback(async (): Promise<number> => {
    setHistoryLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setHistory([]);
        return 0;
      }
      const { data, error } = await supabase
        .from("backtest_runs" as any).select("*")
        .order("created_at", { ascending: false }).limit(200);
      const list = !error && Array.isArray(data) ? data : [];
      setHistory(list);
      return list.length;
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null);
  const [historyClearing, setHistoryClearing] = useState(false);
  const [clearHistoryDialogOpen, setClearHistoryDialogOpen] = useState(false);
  const [lastBacktestClientMs, setLastBacktestClientMs] = useState<number | null>(null);

  const deleteHistoryRun = useCallback(async (id: string) => {
    setHistoryDeletingId(id);
    try {
      const { error } = await supabase.from("backtest_runs" as any).delete().eq("id", id);
      if (error) throw error;
      setExpandedHistoryId(cur => (cur === id ? null : cur));
      setTradePopup(null);
      const n = await loadHistory();
      setHistoryPage(p => Math.min(p, Math.max(1, Math.ceil(n / historyPerPage))));
      toast.success("Removed from history");
    } catch {
      toast.error("Could not delete backtest");
    } finally {
      setHistoryDeletingId(null);
    }
  }, [loadHistory, historyPerPage]);

  const clearAllBacktestHistory = useCallback(async () => {
    setHistoryClearing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in to manage history");
        return;
      }
      const { error } = await supabase.from("backtest_runs" as any).delete().eq("user_id", user.id);
      if (error) throw error;
      setExpandedHistoryId(null);
      setTradePopup(null);
      await loadHistory();
      setHistoryPage(1);
      setClearHistoryDialogOpen(false);
      toast.success("All backtest history cleared");
    } catch {
      toast.error("Could not clear history");
    } finally {
      setHistoryClearing(false);
    }
  }, [loadHistory]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const openTradeFromLive = useCallback((t: Trade, d: BacktestResult) => {
    setTradePopup({
      trade: t,
      symbol: d.symbol,
      exchange: d.exchange,
      action: d.action,
      snapshots: d.historicalSnapshots ?? [],
      allTrades: d.trades ?? [],
    });
  }, []);

  const openTradeFromHistory = useCallback((t: Trade, row: Record<string, unknown>) => {
    const snaps = Array.isArray(row.historical_snapshots) ? row.historical_snapshots as HistoricalSnapshot[] : [];
    const trades = Array.isArray(row.trades) ? row.trades as Trade[] : [];
    const p = (row.params && typeof row.params === "object" ? row.params : {}) as Record<string, unknown>;
    const capRaw = p.initial_capital;
    const cap = capRaw != null && capRaw !== "" ? Math.max(1000, parseFloat(String(capRaw)) || 0) : undefined;
    const dc = p.display_currency;
    const cur = dc === "INR" || dc === "USD" ? dc : undefined;
    setTradePopup({
      trade: t,
      symbol: String(row.symbol ?? ""),
      exchange: String(row.exchange ?? "NSE"),
      action: String(row.action ?? "BUY"),
      snapshots: snaps,
      allTrades: trades,
      notionalOverride: cap,
      currencyOverride: cur,
    });
  }, []);

  const runVectorBt = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { toast.error("Enter a symbol"); return; }
    setLoading(true);
    setResult(null); setTimingReview(null);
    setTradesPage(1); setTradePopup(null); setActiveTab("trades");
    const runStarted = performance.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // For custom strategies, pass entry/exit when builder has real rules (visual, raw, or time/hybrid).
      const customEntryConditions = selectedCustom?.entry_conditions ?? null;
      const customExitConditions = selectedCustom?.exit_conditions ?? null;
      const hasCustomConds = entryConditionsConfigured(customEntryConditions);
      const runSl = parseFloat(slPct) || 2;
      const runTp = parseFloat(tpPct) || 4;
      const customSnapshot = selectedCustom
        ? mergeSnapshotWithBacktestRun(selectedCustom, sym, exchange, runSl, runTp)
        : null;
      const derivedMaxHold =
        mode === "strategy" && selectedCustom
          ? deriveMaxHoldDaysFromExit(selectedCustom.exit_conditions)
          : null;

      const engineStrategy =
        mode !== "strategy"
          ? "trend_following"
          : selectedCustom
            ? resolveEngineStrategyIdForCustom(selectedCustom.paper_strategy_type)
            : strategy;

      const backtestBody: Record<string, unknown> = {
        symbol: sym,
        exchange,
        strategy: engineStrategy,
        action: selectedCustom?.trading_mode === "SHORT" ? "SELL" : action,
        days: Math.min(730, Math.max(30, parseInt(days, 10) || 365)),
        stop_loss_pct: runSl,
        take_profit_pct: runTp,
        entry_conditions: hasCustomConds ? customEntryConditions : null,
        exit_conditions: hasCustomConds ? customExitConditions : null,
        custom_strategy_name: selectedCustom?.name ?? null,
        custom_strategy_id: selectedCustom?.id ?? null,
        custom_strategy_snapshot: customSnapshot,
        execution_days:
          mode === "strategy" && selectedCustom
          && Array.isArray(selectedCustom.execution_days)
          && selectedCustom.execution_days.length > 0
            ? selectedCustom.execution_days
            : null,
      };
      if (derivedMaxHold != null) backtestBody.max_hold_days = derivedMaxHold;

      const res = await supabase.functions.invoke("backtest-vectorbt", {
        body: backtestBody,
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      const d = res.data as BacktestResult & { error?: string };
      setLastBacktestClientMs(Math.round(performance.now() - runStarted));
      if (res.error || d?.error) { toast.error(String(d?.error ?? "Backtest failed")); return; }
      setResult(d);
      setResultPopupOpen(true);

      // Save to history
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("backtest_runs" as any).insert({
            user_id: user.id, symbol: sym, exchange,
            action: selectedCustom?.trading_mode === "SHORT" ? "SELL" : action,
            mode,
            strategy_label: mode === "strategy" ? stratLabel : `Simple ${action}`,
            params: {
              stop_loss_pct: runSl,
              take_profit_pct: runTp,
              days: Math.min(730, Math.max(30, parseInt(days, 10) || 365)),
              session_start: startTime, session_end: endTime, squareoff_time: squareoff,
              used_custom_conditions: d.usedCustomConditions ?? false,
              display_currency: displayCurrency,
              initial_capital: Math.max(1000, parseFloat(initialCapital) || 100000),
              engine_strategy: engineStrategy,
              custom_strategy_id: selectedCustom?.id ?? null,
              custom_strategy_snapshot: customSnapshot,
            },
            summary: {
              totalTrades: d.totalTrades, winRate: d.winRate,
              totalReturn: d.totalReturn, maxDrawdown: d.maxDrawdown,
              profitFactor: d.profitFactor, sharpeRatio: d.sharpeRatio,
              backtestPeriod: d.backtestPeriod, strategyAchieved: d.strategyAchieved,
              bestTrade: d.bestTrade, worstTrade: d.worstTrade,
              avgHoldingDays: d.avgHoldingDays, expectancy: d.expectancy,
              usedCustomConditions: d.usedCustomConditions,
            },
            trades: Array.isArray(d.trades) ? d.trades : [],
            historical_snapshots: Array.isArray(d.historicalSnapshots) ? d.historicalSnapshots : [],
            returns: Array.isArray(d.dailyReturns) ? d.dailyReturns : [],
          });
          loadHistory();
        }
      } catch { /* non-fatal */ }

      const modeNote = d.usedCustomConditions ? " · custom conditions applied" : "";
      toast.success(`Backtest ready · ${d.totalTrades} trades · WR ${d.winRate}%${modeNote}`);
    } catch {
      setLastBacktestClientMs(Math.round(performance.now() - runStarted));
      toast.error("Backtest failed");
    }
    finally { setLoading(false); }
  }, [symbol, exchange, strategy, action, slPct, tpPct, days, mode, selectedCustom, stratLabel, startTime, endTime, squareoff, loadHistory, displayCurrency, initialCapital]);

  const runTimingReview = useCallback(async () => {
    if (!result) { toast.error("Run backtest first"); return; }
    const sym = symbol.trim().toUpperCase();
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("analyze-trade", {
        body: {
          symbol: sym, exchange, action, quantity: 1,
          product: mode === "strategy" && !selectedCustom && STRATEGIES.find(s => s.value === strategy)?.product === "MIS" ? "MIS" : "CNC",
          timing_review: {
            mode: mode === "strategy" ? (selectedCustom ? "custom_strategy" : "preset_strategy") : "simple_trade",
            strategy_label: mode === "strategy" ? stratLabel : undefined,
            stop_loss_pct: parseFloat(slPct) || 2,
            take_profit_pct: parseFloat(tpPct) || 4,
            session_start: startTime, session_end: endTime, squareoff_time: squareoff,
            vectorbt: {
              totalTrades: result.totalTrades, winRate: result.winRate,
              totalReturn: result.totalReturn, sharpeRatio: result.sharpeRatio,
              bestTrade: result.bestTrade, worstTrade: result.worstTrade,
              expectancy: result.expectancy, maxWinStreak: result.maxWinStreak,
              maxLossStreak: result.maxLossStreak, exitReasonCounts: result.exitReasonCounts,
              strategyAchieved: result.strategyAchieved,
              usedCustomConditions: result.usedCustomConditions,
            },
          },
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setTimingReview(String((res.data as any)?.analysis ?? "No review returned."));
      toast.info("AI review ready", { duration: 8000 });
    } catch { toast.error("Review failed"); }
    finally { setAiLoading(false); }
  }, [result, symbol, exchange, action, slPct, tpPct, startTime, endTime, squareoff, mode, strategy, stratLabel, selectedCustom]);

  const pagedTrades = result ? (result.trades ?? []).slice((tradesPage - 1) * tradesPerPage, tradesPage * tradesPerPage) : [];
  const totalTradePages = result ? Math.max(1, Math.ceil((result.trades ?? []).length / tradesPerPage)) : 1;

  // Summarise what conditions a custom strategy has (visual + raw + time/hybrid)
  const customConditionsSummary = (() => {
    const ecRaw = selectedCustom?.entry_conditions;
    if (!ecRaw || typeof ecRaw !== "object") return null;
    const ec = ecRaw as Record<string, unknown>;
    const st = String(ec.strategySubtype ?? "").toLowerCase();
    if (st === "time_based") return "Time-based entry (wall-clock) — sent to backtest engine";
    if (st === "hybrid") return "Hybrid (time + indicators) — sent to backtest engine";
    const groups = Array.isArray(ec.groups) ? ec.groups as { conditions?: unknown[] }[] : [];
    const nVis = groups.reduce(
      (a, g) => a + (Array.isArray(g?.conditions) ? g.conditions.length : 0),
      0,
    );
    const raw = typeof ec.rawExpression === "string" && ec.rawExpression.trim().length > 0;
    if (ec.mode === "raw" && raw) return "Raw expression entry — sent to backtest engine";
    if (nVis > 0) {
      return `${groups.length} group(s), ${nVis} condition(s) — ${String(ec.groupLogic ?? "AND")} logic`;
    }
    if (raw) return "Raw expression (check builder mode) — sent if expression is non-empty";
    return null;
  })();

  const renderHistoryDetailModal = () => {
    const h = history.find(it => String((it as any).id) === expandedHistoryId);
    if (!h) return <div className="p-8 text-center text-zinc-500">History record not found.</div>;
    const s = (h as any).summary ?? {};
    const ret = Number(s.totalReturn ?? 0);
    const histTrades: Trade[] = Array.isArray((h as any).trades) ? (h as any).trades : [];

    return (
      <div className="flex min-h-0 flex-1 flex-col w-full">
        <div className="shrink-0 border-b border-zinc-800 px-5 py-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-white text-lg flex items-center gap-2">
               Backtest details: <span className="font-mono text-teal-400">{(h as any).symbol}</span>
            </DialogTitle>
            <div className="text-zinc-500 text-xs flex items-center gap-3">
              <span>{(h as any).strategy_label ?? (h as any).mode}</span>
              <span>•</span>
              <span>{new Date((h as any).created_at).toLocaleString()}</span>
            </div>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Win Rate" value={`${s.winRate ?? "—"}%`} color={Number(s.winRate) >= 50 ? "green" : "red"} />
            <StatCard label="Return" value={`${ret >= 0 ? "+" : ""}${s.totalReturn ?? "—"}%`} color={ret >= 0 ? "green" : "red"} />
            <StatCard label="Max DD" value={`${s.maxDrawdown ?? "—"}%`} color="red" />
            <StatCard label="Sharpe" value={s.sharpeRatio ?? "—"} />
            {s.bestTrade != null && <StatCard label="Best" value={`+${s.bestTrade}%`} color="green" />}
            {s.worstTrade != null && <StatCard label="Worst" value={`${s.worstTrade}%`} color="red" />}
            {s.avgHoldingDays != null && <StatCard label="Avg Hold" value={`${s.avgHoldingDays}d`} />}
            {s.expectancy != null && <StatCard label="Expectancy" value={`${Number(s.expectancy) >= 0 ? "+" : ""}${s.expectancy}%`} color={Number(s.expectancy) >= 0 ? "green" : "red"} />}
          </div>

          <DailyPortfolioReturnsChart data={(h as any).returns || []} />

          {histTrades.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Trade history ({histTrades.length})</p>
              <div className="rounded-lg border border-zinc-800 overflow-hidden bg-black/20">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 border-b border-zinc-800 sticky top-0">
                    <tr className="text-zinc-500">
                      <th className="text-left px-3 py-2">#</th>
                      <th className="text-left px-3 py-2">Entry</th>
                      <th className="text-left px-3 py-2">Exit</th>
                      <th className="text-right px-3 py-2">Hold</th>
                      <th className="text-right px-3 py-2">Px In</th>
                      <th className="text-right px-3 py-2">Px Out</th>
                      <th className="text-right px-3 py-2">Ret%</th>
                      <th className="text-center px-3 py-2">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histTrades.map((t, ti) => (
                      <tr key={ti}
                        className="border-t border-zinc-800/50 cursor-pointer hover:bg-zinc-800/40 transition-colors"
                        onClick={e => { e.stopPropagation(); openTradeFromHistory(t, h as Record<string, unknown>); }}>
                        <td className="px-3 py-2.5 text-zinc-600 font-mono">{t.tradeNo ?? ti + 1}</td>
                        <td className="px-3 py-2.5 text-zinc-300 font-mono">{t.entryDate}</td>
                        <td className="px-3 py-2.5 text-zinc-300 font-mono">{t.exitDate}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-400 font-mono">{t.holdingDays ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-300 font-mono">{t.entryPrice ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-300 font-mono">{t.exitPrice ?? "—"}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                          {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                        </td>
                        <td className="px-3 py-2.5 text-center"><ExitReasonBadge reason={t.exitReason ?? "unknown"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-5 py-3 pr-14 sm:pr-5">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="border-teal-700/50 text-teal-300 text-xs"
              onClick={e => {
                e.stopPropagation();
                const p = (h as any).params ?? {};
                setSymbol(String((h as any).symbol ?? ""));
                setExchange(String((h as any).exchange ?? "NSE"));
                setAction(((h as any).action === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL");
                if (p.stop_loss_pct) setSlPct(String(p.stop_loss_pct));
                if (p.take_profit_pct) setTpPct(String(p.take_profit_pct));
                if (p.days) setDays(String(p.days));
                if (p.display_currency === "INR" || p.display_currency === "USD") {
                  setDisplayCurrency(p.display_currency);
                }
                if (p.initial_capital != null && p.initial_capital !== "") {
                  setInitialCapital(String(p.initial_capital));
                }
                const csid = p.custom_strategy_id;
                if (csid != null && String(csid).length > 0) {
                  setSelectedCustomId(String(csid));
                }
                setExpandedHistoryId(null);
                toast.info("Config loaded — click Run Backtesting");
              }}>
              <Zap className="h-3 w-3 mr-1" /> Re-run this config
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-red-900/30 text-zinc-500 hover:text-red-400 hover:bg-red-950/20"
              disabled={historyDeletingId === expandedHistoryId}
              onClick={e => {
                e.stopPropagation();
                if (expandedHistoryId) void deleteHistoryRun(expandedHistoryId);
              }}
            >
               {historyDeletingId === expandedHistoryId
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Trash2 className="h-4 w-4 mr-2" />}
               Delete run
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpandedHistoryId(null)}>Close</Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white flex items-center gap-2">
          <LineChartIcon className="h-4 w-4 text-teal-400" />
          Backtesting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Mode */}
        <div className="flex flex-wrap gap-2">
          {(["strategy", "simple"] as const).map(m => (
            <Button key={m} size="sm" variant={mode === m ? "default" : "outline"}
              className={mode === m ? "bg-teal-600" : "border-zinc-600"}
              onClick={() => setMode(m)}>
              {m === "strategy" ? "Strategy" : "Simple BUY / SELL"}
            </Button>
          ))}
        </div>

        {/* Strategy first (Strategy mode) — then symbol; Simple mode uses symbol then direction */}
        {mode === "strategy" ? (
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">
              Strategy <span className="text-zinc-600 font-normal text-[10px]">· choose custom or built-in first</span>
            </Label>
            <Select
              value={selectedCustomId ? `custom:${selectedCustomId}` : `preset:${strategy}`}
              onValueChange={v => {
                if (v.startsWith("custom:")) {
                  const id = v.replace("custom:", "");
                  setSelectedCustomId(id);
                  const cs = customStrategies.find(s => s.id === id);
                  if (!cs) return;
                  const fe = firstSymbolAndExchangeFromStrategy(cs);
                  if (fe) {
                    setSymbol(fe.symbol);
                    setExchange(fe.exchange);
                    setDisplayCurrency(defaultDisplayCurrency(fe.exchange, fe.symbol));
                  }
                  let sl = cs.stop_loss_pct;
                  let tp = cs.take_profit_pct;
                  const xc = cs.exit_conditions;
                  if (xc && typeof xc === "object") {
                    const x = xc as Record<string, unknown>;
                    if (sl == null && typeof x.stopLossPct === "number") sl = x.stopLossPct;
                    if (tp == null && typeof x.takeProfitPct === "number") tp = x.takeProfitPct;
                  }
                  if (sl != null) setSlPct(String(sl));
                  if (tp != null) setTpPct(String(tp));
                } else {
                  setSelectedCustomId("");
                  setStrategy(v.replace("preset:", ""));
                }
              }}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 max-h-64">
                <div className="px-2 py-1.5 text-[10px] text-zinc-500">Custom strategies</div>
                {customStrategies.length ? customStrategies.map(s => (
                  <SelectItem key={s.id} value={`custom:${s.id}`} className="text-xs">
                    {s.name}{s.is_active === false ? " (INACTIVE)" : ""}
                  </SelectItem>
                )) : <div className="px-2 py-2 text-xs text-zinc-600">No custom strategies yet</div>}
                <div className="px-2 py-1.5 text-[10px] text-zinc-500">Built-in presets</div>
                {STRATEGIES.map(s => <SelectItem key={s.value} value={`preset:${s.value}`} className="text-xs">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Show custom conditions summary */}
            {customConditionsSummary && (
              <p className="text-[10px] text-teal-500 mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
                Custom conditions: {customConditionsSummary}
              </p>
            )}
            {selectedCustom && !customConditionsSummary && (
              <p className="text-[10px] text-zinc-500 mt-1">Custom strategy loaded · no visual conditions (uses preset signals)</p>
            )}
            {selectedCustom?.execution_days && selectedCustom.execution_days.length > 0 && (
              <p className="text-[10px] text-zinc-500 mt-1">
                Execution days: {selectedCustom.execution_days.map(d => EXEC_DAY_LABELS[d] ?? d).join(", ")}
              </p>
            )}
            {selectedCustom && (
              <details className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 text-[11px]">
                <summary className="cursor-pointer px-2.5 py-2 text-zinc-400 hover:text-zinc-200 select-none">
                  Strategy details (included in backtest)
                </summary>
                <div className="px-2.5 pb-2.5 pt-0 space-y-3 border-t border-zinc-800/80">
                  <p className="text-zinc-500 text-[10px] pt-2 leading-relaxed">
                    Choosing a custom strategy fills <span className="text-zinc-400">Symbol</span>, <span className="text-zinc-400">Stop-loss</span>, and <span className="text-zinc-400">Take-profit</span> from what you saved.
                    Anything you change in those fields before <span className="text-zinc-400">Run Backtesting</span> wins for that run.
                  </p>
                  <div className="rounded border border-zinc-800/60 bg-zinc-950/80 p-2 space-y-1.5">
                    <p className="text-[9px] font-medium text-teal-600/90 uppercase tracking-wide">This run uses</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                      <dt className="text-zinc-600">Symbol</dt>
                      <dd className="font-mono text-zinc-200">{symbol.trim() || "—"}</dd>
                      <dt className="text-zinc-600">Exchange</dt>
                      <dd className="font-mono text-zinc-200">{exchange}</dd>
                      <dt className="text-zinc-600">Stop-loss %</dt>
                      <dd className="font-mono text-zinc-200">{slPct || "—"}</dd>
                      <dt className="text-zinc-600">Take-profit %</dt>
                      <dd className="font-mono text-zinc-200">{tpPct || "—"}</dd>
                    </dl>
                  </div>
                  <div>
                    <p className="text-[9px] font-medium text-zinc-600 uppercase tracking-wide mb-1">Saved on strategy</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-zinc-500 text-[10px]">
                      <dt className="text-zinc-600">Symbols list</dt>
                      <dd className="font-mono text-zinc-400 break-words">{formatSavedSymbolsList(selectedCustom)}</dd>
                      <dt className="text-zinc-600">Engine preset</dt>
                      <dd className="font-mono text-teal-400/90">{resolveEngineStrategyIdForCustom(selectedCustom.paper_strategy_type)}</dd>
                      <dt className="text-zinc-600">Direction</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.trading_mode ?? "—"}</dd>
                      <dt className="text-zinc-600">Market</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.market_type ?? "—"}</dd>
                      <dt className="text-zinc-600">Session (IST)</dt>
                      <dd className="font-mono text-zinc-300">
                        {selectedCustom.start_time ?? "—"}–{selectedCustom.end_time ?? "—"} · SQ {selectedCustom.squareoff_time ?? "—"}
                      </dd>
                      <dt className="text-zinc-600">Intraday</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.is_intraday ? "Yes" : "No"}</dd>
                      <dt className="text-zinc-600">Risk / trade %</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.risk_per_trade_pct ?? "—"}</dd>
                      <dt className="text-zinc-600">Saved SL / TP %</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.stop_loss_pct ?? "—"} / {selectedCustom.take_profit_pct ?? "—"}</dd>
                    </dl>
                  </div>
                </div>
              </details>
            )}
            {/* <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
              Backtesting scans the whole history: a trade opens on any past day where your entry conditions pass (and execution-day filters apply).
              “Setup not active” on the last bar only describes today, not whether the run will find trades in the past.
            </p> */}
          </div>
        ) : null}

        {/* Symbol + Exchange */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">
              Symbol{selectedCustom ? <span className="text-zinc-600 font-normal text-[10px]"> · this run</span> : null}
            </Label>
            <SymbolSearchInput value={symbol} onChange={setSymbol}
              onSelect={(s, ex) => {
                const u = s.toUpperCase();
                setSymbol(u); setExchange(ex);
                setDisplayCurrency(defaultDisplayCurrency(ex, u));
              }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">Exchange</Label>
            <Select value={exchange} onValueChange={v => { setExchange(v); setDisplayCurrency(defaultDisplayCurrency(v, symbol)); }}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {EXCHANGES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {mode === "simple" ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" className={action === "BUY" ? "bg-emerald-600" : "bg-zinc-800"} onClick={() => setAction("BUY")}>BUY</Button>
            <Button type="button" size="sm" className={action === "SELL" ? "bg-red-600" : "bg-zinc-800"} onClick={() => setAction("SELL")}>SELL</Button>
          </div>
        ) : null}

        {/* Parameters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">
              Stop-loss %{selectedCustom ? <span className="text-zinc-600 font-normal"> · this run</span> : null}
            </Label>
            <Input value={slPct} onChange={e => setSlPct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">
              Take-profit %{selectedCustom ? <span className="text-zinc-600 font-normal"> · this run</span> : null}
            </Label>
            <Input value={tpPct} onChange={e => setTpPct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">Days history (30–730)</Label>
            <Input value={days} onChange={e => setDays(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">P&amp;L display currency</Label>
            <Select value={displayCurrency} onValueChange={v => { void onDisplayCurrencyChange(v as "INR" | "USD"); }}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="INR">INR (₹)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[10px] text-zinc-500">
              Notional ({displayCurrency === "INR" ? "₹" : "$"}) for % → money P&amp;L · switching ₹/$ converts this amount at live USD/INR
            </Label>
            <Input value={initialCapital} onChange={e => setInitialCapital(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" placeholder="100000" />
            {inrPerUsd != null && (
              <p className="text-[9px] text-zinc-600">
                USD/INR ref ≈ {inrPerUsd.toFixed(2)}
                {fxRateDate ? ` (${fxRateDate})` : ""} · ECB via Frankfurter
              </p>
            )}
          </div>
        </div>

        {/* Session */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
          <p className="text-[10px] font-medium text-zinc-400">Session & exit time (for AI timing review)</p>
          <div className="grid grid-cols-3 gap-2">
            {[["Start IST", startTime, setStartTime], ["End IST", endTime, setEndTime], ["Square-off", squareoff, setSquareoff]].map(([lbl, val, set]) => (
              <div key={lbl as string}>
                <Label className="text-[9px] text-zinc-600">{lbl as string}</Label>
                <Input value={val as string} onChange={e => (set as any)(e.target.value)} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={runVectorBt} disabled={loading} className="bg-teal-600 hover:bg-teal-500">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
            Run Backtesting
          </Button>
          <Button variant="outline" onClick={runTimingReview} disabled={!result || aiLoading} className="border-purple-600/50 text-purple-300">
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
            AI Review SL/TP & Timing
          </Button>
          {result && !resultPopupOpen && (
            <Button variant="ghost" onClick={() => setResultPopupOpen(true)} className="text-teal-400 hover:text-teal-300 hover:bg-teal-400/10">
              <Eye className="h-4 w-4 mr-2" /> View Last Result
            </Button>
          )}
        </div>

        {/* ─── Results Popup ────────────────────────────────────────────── */}
        <Dialog open={resultPopupOpen} onOpenChange={setResultPopupOpen}>
          <DialogContent className="flex h-[94vh] max-h-[94vh] w-[98vw] !max-w-[98vw] flex-col gap-0 !overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:h-[90vh] sm:max-h-[90vh] sm:!max-w-[1200px]">
            <div className="shrink-0 border-b border-zinc-800 px-5 py-4 flex items-center justify-between bg-zinc-950/50 backdrop-blur-xl">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-white text-lg flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20">
                    <BarChart3 className="h-5 w-5 text-teal-400" />
                  </div>
                  Backtest Analysis
                </DialogTitle>
                {result && (
                  <p className="text-zinc-500 text-[10px] sm:text-xs font-mono">
                    {result.symbol} · {result.exchange} · {result.backtestPeriod}
                  </p>
                )}
              </DialogHeader>
              <div className="flex items-center gap-3">
                {result?.strategyAchieved && (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider hidden sm:flex">
                    Setup Active
                  </Badge>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 scrollbar-none hover:scrollbar-thin scrollbar-thumb-zinc-800">
              {result && (
                <div className="space-y-10 pb-10 max-w-6xl mx-auto">
                  {/* Performance Summary Header */}
                  <div className="relative group">
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-zinc-900/40 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800/50">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h2 className="text-teal-400 font-bold text-xl tracking-tight">
                            {mode === "strategy" ? stratLabel : `Simple ${action}`}
                          </h2>
                          {result.usedCustomConditions && (
                            <Badge className="bg-teal-500/10 text-teal-300 border-teal-500/30 text-[9px] px-2 py-0">CUSTOM LOGIC</Badge>
                          )}
                        </div>
                        <p className="text-zinc-500 text-xs flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-zinc-700" />
                          Tested with engine {result.strategy}
                        </p>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Net Return</p>
                          <p className={`text-3xl font-black font-mono leading-none ${result.totalReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {result.totalReturn >= 0 ? "+" : ""}{result.totalReturn}%
                          </p>
                        </div>
                        <div className="w-px h-10 bg-zinc-800/50 hidden sm:block" />
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Win Rate</p>
                          <p className={`text-3xl font-black font-mono leading-none ${result.winRate >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                            {result.winRate}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Executed Trades" value={result.totalTrades} sub={`${result.wins}W / ${result.losses}L`} />
                    <StatCard label="Profit Factor" value={result.profitFactor} color={result.profitFactor >= 1.5 ? "green" : result.profitFactor >= 1 ? "yellow" : "red"} />
                    <StatCard label="Avg. Return" value={`${result.expectancy >= 0 ? "+" : ""}${result.expectancy}%`} color={result.expectancy >= 0 ? "green" : "red"} />
                    <StatCard label="Max Drawdown" value={`${result.maxDrawdown}%`} color="red" />
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Sharpe Ratio" value={result.sharpeRatio} color={result.sharpeRatio >= 1 ? "green" : "default"} />
                    <StatCard label="Avg Hold Time" value={`${result.avgHoldingDays}d`} />
                    <StatCard label="Best Trade" value={`+${result.bestTrade}%`} color="green" />
                    <StatCard label="Worst Trade" value={`${result.worstTrade}%`} color="red" />
                  </div>

                  {/* Analysis Tabs */}
                  <div className="space-y-6">
                    <div className="flex flex-wrap gap-2 bg-zinc-900/20 p-1.5 rounded-xl border border-zinc-900/50">
                      {(["trades", "equity", "returns", "daily"] as const).map(tab => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setActiveTab(tab)}
                          className={`px-5 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                            activeTab === tab
                              ? "bg-teal-500/10 text-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.1)] border border-teal-500/20"
                              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                          }`}
                        >
                          {tab === "trades" ? `Trade Log (${result.totalTrades})` : tab === "equity" ? "Equity Curve" : tab === "returns" ? "Return Distribution" : "Daily Volatility"}
                        </button>
                      ))}
                    </div>

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="pt-2"
                      >
                        {activeTab === "trades" && (
                          <div className="space-y-8">
                            {/* Card View for Recent Trades */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {result.trades.slice(0, 12).map(t => (
                                <button
                                  key={t.tradeNo}
                                  type="button"
                                  onClick={() => openTradeFromLive(t, result)}
                                  className="text-left rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-4 hover:border-teal-500/30 hover:bg-zinc-900/40 transition-all group relative overflow-hidden"
                                >
                                  <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
                                    <TrendingUp className="h-12 w-12 text-zinc-700" />
                                  </div>
                                  <div className="flex items-center justify-between mb-4 relative z-10">
                                    <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase tracking-widest">TRD-{t.tradeNo}</span>
                                    <ExitReasonBadge reason={t.exitReason} />
                                  </div>
                                  <div className="flex items-end justify-between relative z-10">
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-tighter">Exit Date</p>
                                      <p className="text-xs text-zinc-300 font-mono">{t.exitDate}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-xl font-black font-mono tracking-tighter ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                                        {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>

                            {/* Full Journal Table */}
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                  <ListFilter className="h-3.5 w-3.5" />
                                  Complete Trade Journal
                                </h3>
                              </div>
                              <div className="rounded-xl border border-zinc-800/80 overflow-hidden bg-black/40">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px] leading-relaxed">
                                    <thead className="bg-zinc-900/80 border-b border-zinc-800">
                                      <tr className="text-zinc-500 uppercase tracking-tighter">
                                        <th className="text-left px-4 py-3 font-bold"># ID</th>
                                        <th className="text-left px-4 py-3 font-bold">Execution Timeline</th>
                                        <th className="text-right px-4 py-3 font-bold">Hold</th>
                                        <th className="text-right px-4 py-3 font-bold">Price Point (In → Out)</th>
                                        <th className="text-right px-4 py-3 font-bold">Performance</th>
                                        <th className="text-center px-4 py-3 font-bold">Exit</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/50">
                                      {pagedTrades.map(t => (
                                        <tr key={t.tradeNo}
                                          className="cursor-pointer hover:bg-teal-500/[0.03] transition-colors group"
                                          onClick={() => openTradeFromLive(t, result)}>
                                          <td className="px-4 py-3.5 text-zinc-600 font-mono font-bold group-hover:text-zinc-400">#{t.tradeNo}</td>
                                          <td className="px-4 py-3.5">
                                            <div className="font-mono text-zinc-400 group-hover:text-zinc-200">
                                              {t.entryDate} <span className="text-zinc-800 mx-1">→</span> {t.exitDate}
                                            </div>
                                          </td>
                                          <td className="px-4 py-3.5 text-right text-zinc-500 font-mono group-hover:text-zinc-300">{t.holdingDays ?? "—"}d</td>
                                          <td className="px-4 py-3.5 text-right">
                                            <span className="font-mono text-zinc-500 group-hover:text-zinc-300">
                                              {t.entryPrice?.toLocaleString() ?? "—"} <span className="text-zinc-800 mx-1">→</span> {t.exitPrice?.toLocaleString() ?? "—"}
                                            </span>
                                          </td>
                                          <td className={`px-4 py-3.5 text-right font-mono font-bold ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                                            {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                                          </td>
                                          <td className="px-4 py-3.5 text-center"><ExitReasonBadge reason={t.exitReason} /></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between px-2 pt-2">
                                <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-teal-400 transition-colors"
                                  onClick={() => setTradesPage(p => Math.max(1, p - 1))} disabled={tradesPage <= 1}>
                                  <ChevronLeft className="h-4 w-4 mr-2" /> Previous Era
                                </Button>
                                <div className="flex gap-2">
                                  {[...Array(totalTradePages)].map((_, i) => (
                                    <button
                                      key={i}
                                      onClick={() => setTradesPage(i + 1)}
                                      className={`w-1 h-1 rounded-full transition-all duration-300 ${tradesPage === i + 1 ? "bg-teal-500 w-6" : "bg-zinc-800 hover:bg-zinc-600"}`}
                                    />
                                  ))}
                                </div>
                                <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-teal-400 transition-colors"
                                  onClick={() => setTradesPage(p => Math.min(totalTradePages, p + 1))} disabled={tradesPage >= totalTradePages}>
                                  Next Era <ChevronRight className="h-4 w-4 ml-2" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeTab === "equity" && (
                          <div className="max-w-5xl mx-auto py-4">
                            <EquityCurveChart
                              data={result.equityCurve}
                              initialCapital={Number(initialCapital)}
                              displayCurrency={displayCurrency}
                            />
                          </div>
                        )}

                        {activeTab === "returns" && (
                          <div className="max-w-5xl mx-auto py-4">
                            <TradeReturnsChart trades={result.trades} />
                          </div>
                        )}

                        {activeTab === "daily" && (
                          <div className="max-w-5xl mx-auto">
                            <DailyPortfolioReturnsChart data={result.dailyReturns || []} />
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Compliance & Footnote */}
                   <div className="pt-10 border-t border-zinc-900/50 flex flex-col sm:flex-row justify-between items-center gap-6">
                     <div className="flex items-center gap-6">
                       <div className="space-y-1">
                         <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-[0.2em]">Data Origin</p>
                         <p className="text-xs text-zinc-400 font-mono">{result.exchange}:{result.symbol}</p>
                       </div>
                       <div className="w-px h-6 bg-zinc-900" />
                       <div className="space-y-1">
                         <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-[0.2em]">Strategy ID</p>
                         <p className="text-xs text-zinc-400 font-mono">{result.strategy}</p>
                       </div>
                     </div>
                     <p className="text-[10px] text-zinc-600 italic text-center sm:text-right max-w-sm">
                        Hypothetical performance results have inherent limitations. No representation is being made that any account will achieve profits similar to those shown.
                     </p>
                   </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-900 p-5 bg-zinc-950 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2 text-zinc-600 text-[10px] uppercase font-bold tracking-widest">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-600/50" />
                Verified Backtest Service
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={() => setResultPopupOpen(false)} className="flex-1 sm:flex-none border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900">
                  Close Analysis
                </Button>
                <Button size="sm" className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-500 shadow-lg shadow-teal-500/10" onClick={() => window.print()}>
                  <Download className="h-3.5 w-3.5 mr-2" /> Export PDF Report
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {timingReview && (
          <Alert className="bg-purple-950/30 border-purple-800">
            <Brain className="h-4 w-4 text-purple-400" />
            <AlertDescription className="text-zinc-300 text-xs whitespace-pre-wrap">{timingReview}</AlertDescription>
          </Alert>
        )}

        {/* ─── History ───────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-300 font-medium">Backtest History</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="border-red-900/60 text-red-300 hover:bg-red-950/40"
                disabled={history.length === 0 || historyClearing || historyLoading}
                onClick={() => setClearHistoryDialogOpen(true)}>
                {historyClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span className="ml-1.5">Clear all</span>
              </Button>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200" onClick={() => void loadHistory()} disabled={historyLoading}>
                {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
              </Button>
            </div>
          </div>

          <AlertDialog open={clearHistoryDialogOpen} onOpenChange={setClearHistoryDialogOpen}>
            <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all backtest history?</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  This permanently deletes every saved backtest run for your account. You cannot undo this.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-zinc-600 bg-zinc-800 text-zinc-200">Cancel</AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-500"
                  disabled={historyClearing}
                  onClick={() => void clearAllBacktestHistory()}
                >
                  {historyClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete all"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {history.length === 0 ? (
            <p className="text-xs text-zinc-600">No backtests saved yet.</p>
          ) : (
            <>
              <div className="rounded border border-zinc-800 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-zinc-950 sticky top-0">
                    <tr className="text-zinc-500">
                      <th className="text-left px-2 py-2">Time</th>
                      <th className="text-left px-2 py-2">Symbol</th>
                      <th className="text-left px-2 py-2">Strategy</th>
                      <th className="text-right px-2 py-2">Trades</th>
                      <th className="text-right px-2 py-2">WR</th>
                      <th className="text-right px-2 py-2">Return</th>
                      <th className="text-center px-2 py-2 w-10"> </th>
                      <th className="text-center px-2 py-2">▾</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage).map(h => {
                      const s = (h as any).summary ?? {};
                      const ret = Number(s.totalReturn ?? 0);
                      const hId = String((h as any).id);
                      const isExp = expandedHistoryId === hId;
                      const histTrades: Trade[] = Array.isArray((h as any).trades) ? (h as any).trades : [];
                      return (
                        <Fragment key={hId}>
                            <tr 
                              className="border-t border-zinc-800/60 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                              onClick={() => setExpandedHistoryId(hId)}
                            >
                              <td className="px-2 py-2 text-zinc-500 font-mono">
                                {String((h as any).created_at ?? "").slice(0, 16).replace("T", " ")}
                              </td>
                              <td className="px-2 py-2 text-zinc-200 font-mono">
                                {String((h as any).symbol ?? "—")}
                              </td>
                              <td className="px-2 py-2 text-zinc-400 flex items-center gap-1">
                                {String((h as any).strategy_label ?? (h as any).mode ?? "—")}
                                {s.usedCustomConditions && (
                                  <Badge className="bg-teal-900/60 text-teal-300 border-teal-700 text-[9px] px-1 py-0 ml-1">
                                    CC
                                  </Badge>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right text-zinc-300 font-mono">
                                {String(s.totalTrades ?? "—")}
                              </td>
                              <td className="px-2 py-2 text-right text-zinc-300 font-mono">
                                {String(s.winRate ?? "—")}%
                              </td>
                              <td className={`px-2 py-2 text-right font-mono font-semibold ${ret >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {ret >= 0 ? "+" : ""}{String(s.totalReturn ?? "—")}%
                              </td>
                              <td className="px-2 py-2 text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-950/30"
                                  title="Delete this run"
                                  disabled={historyDeletingId === hId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteHistoryRun(hId);
                                  }}
                                >
                                  {historyDeletingId === hId ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </td>
                              <td className="px-2 py-2 text-center text-zinc-500">
                                <ExternalLink className="h-4 w-4" />
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200"
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="text-[10px] text-zinc-600">
                  Page {historyPage} / {Math.max(1, Math.ceil(history.length / historyPerPage))}
                </p>
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200"
                  onClick={() => setHistoryPage(p => Math.min(Math.max(1, Math.ceil(history.length / historyPerPage)), p + 1))}
                  disabled={historyPage >= Math.max(1, Math.ceil(history.length / historyPerPage))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>

      <Dialog open={!!expandedHistoryId} onOpenChange={(open) => !open && setExpandedHistoryId(null)}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] w-full !max-w-[95vw] mx-auto flex-col gap-0 !overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:!max-w-[98vw]">
          {renderHistoryDetailModal()}
        </DialogContent>
      </Dialog>

      {/* Trade detail popup — shared between live result and history trades */}
      {tradePopup && (
        <TradeDetailPopup
          trade={tradePopup.trade}
          action={tradePopup.action}
          symbol={tradePopup.symbol}
          exchangeForQuote={tradePopup.exchange}
          snapshots={tradePopup.snapshots}
          allTrades={tradePopup.allTrades}
          open={!!tradePopup}
          onClose={() => setTradePopup(null)}
          initialCapital={tradePopup.notionalOverride ?? Math.max(1000, parseFloat(initialCapital) || 100000)}
          displayCurrency={tradePopup.currencyOverride ?? displayCurrency}
          inrPerUsd={inrPerUsd}
          fxRateDate={fxRateDate}
        />
      )}
    </Card>
  );
}
