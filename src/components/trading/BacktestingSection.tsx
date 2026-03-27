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
  BarChart3, Brain, ChevronLeft, ChevronRight,
  Loader2, LineChart as LineChartIcon, Search, Trash2, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { fetchUsdInr } from "@/lib/fxRates";

const EXCHANGES = ["NSE", "BSE", "GLOBAL", "NFO", "MCX", "CDS"];

/** AlgoStrategyBuilder execution_days: 0=Sun … 6=Sat */
const EXEC_DAY_LABELS: Record<number, string> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

/** Map time-based exit (minutes) to a coarse day count for daily VectorBT runs. */
function deriveMaxHoldDaysFromExit(xc: unknown): number | null {
  if (!xc || typeof xc !== "object") return null;
  const e = xc as Record<string, unknown>;
  if (e.timeBasedExit === true && typeof e.exitAfterMinutes === "number" && e.exitAfterMinutes > 0) {
    return Math.max(1, Math.min(365, Math.ceil(Number(e.exitAfterMinutes) / (60 * 24))));
  }
  return null;
}

/** True when custom entry rules should be sent to VectorBT (matches strategy-entry-signals idea). */
function entryConditionsConfigured(ec: unknown): boolean {
  if (!ec || typeof ec !== "object") return false;
  const cfg = ec as Record<string, unknown>;
  const st = String(cfg.strategySubtype ?? "").toLowerCase();
  if (st === "time_based" || st === "hybrid") return true;
  const groups = Array.isArray(cfg.groups) ? cfg.groups : [];
  const hasVisual = groups.some(
    (g: { conditions?: unknown[] }) => Array.isArray(g?.conditions) && g.conditions.length > 0,
  );
  const hasRaw = typeof cfg.rawExpression === "string" && cfg.rawExpression.trim().length > 0;
  return hasVisual || hasRaw;
}

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

type FullCustomStrategy = {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  trading_mode?: string;
  is_intraday?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  squareoff_time?: string | null;
  risk_per_trade_pct?: number | null;
  stop_loss_pct?: number | null;
  take_profit_pct?: number | null;
  entry_conditions?: any;
  exit_conditions?: any;
  market_type?: string | null;
  paper_strategy_type?: string | null;
  symbols?: any[];
  execution_days?: number[] | null;
  position_config?: Record<string, unknown> | null;
  risk_config?: Record<string, unknown> | null;
  chart_config?: Record<string, unknown> | null;
};

const PRESET_ENGINE_STRATEGY_IDS = new Set(STRATEGIES.map(s => s.value));

function resolveEngineStrategyIdForCustom(paperStrategyType: string | null | undefined): string {
  const v = String(paperStrategyType ?? "").trim().toLowerCase();
  if (v && PRESET_ENGINE_STRATEGY_IDS.has(v)) return v;
  return "trend_following";
}

/** Saved strategy row (no secrets) — base for VectorBT payload. */
function buildCustomStrategySnapshot(cs: FullCustomStrategy): Record<string, unknown> {
  return {
    id: cs.id,
    name: cs.name,
    description: cs.description ?? null,
    trading_mode: cs.trading_mode ?? null,
    is_intraday: cs.is_intraday ?? null,
    start_time: cs.start_time ?? null,
    end_time: cs.end_time ?? null,
    squareoff_time: cs.squareoff_time ?? null,
    risk_per_trade_pct: cs.risk_per_trade_pct ?? null,
    stop_loss_pct: cs.stop_loss_pct ?? null,
    take_profit_pct: cs.take_profit_pct ?? null,
    market_type: cs.market_type ?? null,
    paper_strategy_type: cs.paper_strategy_type ?? null,
    symbols: cs.symbols ?? null,
    execution_days: cs.execution_days ?? null,
    entry_conditions: cs.entry_conditions ?? null,
    exit_conditions: cs.exit_conditions ?? null,
    position_config: cs.position_config ?? null,
    risk_config: cs.risk_config ?? null,
    chart_config: cs.chart_config ?? null,
    is_active: cs.is_active ?? null,
  };
}

/** Snapshot with this run’s symbol / SL / TP (form overrides what was saved on the strategy). */
function mergeSnapshotWithBacktestRun(
  cs: FullCustomStrategy,
  runSymbol: string,
  runExchange: string,
  runSlPct: number,
  runTpPct: number,
): Record<string, unknown> {
  const base = buildCustomStrategySnapshot(cs);
  base.stop_loss_pct = runSlPct;
  base.take_profit_pct = runTpPct;
  base.backtest_symbol = runSymbol;
  base.backtest_exchange = runExchange;
  return base;
}

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
  const minP = prices.length ? Math.min(...prices) * 0.997 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.003 : 1;
  const profitable = trade.returnPct > 0;
  const pnlFromPct = (trade.returnPct / 100) * initialCapital;
  const pnlLabel = formatMoneyAmount(pnlFromPct, displayCurrency);
  const quoteNote = quoteNoteForSymbol(symbol, exchangeForQuote, displayCurrency, inrPerUsd, fxRateDate);

  // Find similar trades (same exit reason, within ±20% return)
  const similarTrades = allTrades.filter(
    t => t.tradeNo !== trade.tradeNo
      && t.exitReason === trade.exitReason
      && Math.abs(t.returnPct - trade.returnPct) <= Math.abs(trade.returnPct) * 0.5
  ).slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100 flex items-center gap-2 text-sm">
            <span className="font-mono text-teal-400">{symbol}</span>
            Trade #{trade.tradeNo}
            <ExitReasonBadge reason={trade.exitReason} />
            <span className={`font-mono font-bold ml-auto ${profitable ? "text-emerald-400" : "text-red-400"}`}>
              {trade.returnPct >= 0 ? "+" : ""}{trade.returnPct}%
              {` (${pnlLabel} on ${displayCurrency} ${initialCapital.toLocaleString(displayCurrency === "INR" ? "en-IN" : "en-US")} notional)`}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-1 border-b border-zinc-800 -mt-2 pb-0">
          {(["chart", "whatif"] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs rounded-t transition-colors ${tab === t ? "bg-zinc-800 text-zinc-200 border-b-2 border-teal-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t === "chart" ? "Trade Chart & Details" : "Historical What-If"}
            </button>
          ))}
        </div>

        {quoteNote && (
          <p className="text-[10px] text-zinc-500 mt-1">{quoteNote}</p>
        )}

        {tab === "chart" && (
          <div className="space-y-4 text-xs">
            {/* Key details row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-zinc-800/60 rounded p-2">
                <p className="text-[10px] text-zinc-500">Entry</p>
                <p className="font-mono text-zinc-200">{trade.entryDate}</p>
                <p className="font-mono text-emerald-300">{trade.entryPrice ?? "—"}</p>
              </div>
              <div className="bg-zinc-800/60 rounded p-2">
                <p className="text-[10px] text-zinc-500">Exit</p>
                <p className="font-mono text-zinc-200">{trade.exitDate}</p>
                <p className={`font-mono ${profitable ? "text-emerald-300" : "text-red-300"}`}>{trade.exitPrice ?? "—"}</p>
              </div>
              <div className="bg-zinc-800/60 rounded p-2">
                <p className="text-[10px] text-zinc-500">Holding</p>
                <p className="font-mono text-zinc-200">{trade.holdingDays ?? "—"} days</p>
              </div>
              <div className="bg-zinc-800/60 rounded p-2">
                <p className="text-[10px] text-zinc-500">P&L</p>
                <p className={`font-mono font-bold ${profitable ? "text-emerald-400" : "text-red-400"}`}>
                  {trade.returnPct >= 0 ? "+" : ""}{trade.returnPct}%
                </p>
                <p className="font-mono text-zinc-400">{pnlLabel}</p>
              </div>
            </div>

            {/* Indicators at entry */}
            <div className="flex flex-wrap gap-2">
              {trade.entryRsi !== null && (
                <span className="bg-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-400">
                  RSI at entry: <span className="text-purple-300 font-mono">{trade.entryRsi}</span>
                </span>
              )}
              {trade.entrySma20 !== null && (
                <span className="bg-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-400">
                  SMA20 at entry: <span className="text-amber-300 font-mono">{trade.entrySma20}</span>
                </span>
              )}
              {trade.entryMacd !== null && (
                <span className="bg-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-400">
                  MACD at entry: <span className="text-sky-300 font-mono">{trade.entryMacd}</span>
                </span>
              )}
              {trade.exitRsi !== null && (
                <span className="bg-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-400">
                  RSI at exit: <span className="text-purple-300 font-mono">{trade.exitRsi}</span>
                </span>
              )}
            </div>

            {/* Price chart */}
            {trade.candles.length > 0 ? (
              <>
                <div>
                  <p className="text-[10px] text-zinc-500 mb-1">
                    Price · <span className="text-amber-400">— SMA20</span> · Entry <span className="text-emerald-400">↑</span> Exit <span className={profitable ? "text-emerald-400" : "text-red-400"}>↑</span>
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={trade.candles} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                      <YAxis domain={[minP, maxP]} tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: number) => v.toFixed(0)} width={46} />
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
                        formatter={(v: number, name: string) => [v?.toFixed?.(2) ?? v, name]}
                      />
                      <Line type="monotone" dataKey="close" stroke="#94a3b8" dot={false} strokeWidth={1.5} name="Close" />
                      <Line type="monotone" dataKey="sma20" stroke="#f59e0b" dot={false} strokeWidth={1} strokeDasharray="4 2" name="SMA20" />
                      <ReferenceLine x={trade.entryDate} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 2"
                        label={{ value: "E", fill: "#22c55e", fontSize: 9, position: "top" }} />
                      <ReferenceLine x={trade.exitDate} stroke={profitable ? "#22c55e" : "#ef4444"} strokeWidth={1.5} strokeDasharray="4 2"
                        label={{ value: "X", fill: profitable ? "#22c55e" : "#ef4444", fontSize: 9, position: "top" }} />
                      {trade.entryPrice && <ReferenceLine y={trade.entryPrice} stroke="#22c55e" strokeWidth={1} strokeDasharray="2 2" />}
                      {trade.exitPrice && <ReferenceLine y={trade.exitPrice} stroke={profitable ? "#22c55e" : "#ef4444"} strokeWidth={1} strokeDasharray="2 2" />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* RSI sub-chart */}
                {trade.candles.some(c => c.rsi14 !== null) && (
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1">RSI(14)</p>
                    <ResponsiveContainer width="100%" height={70}>
                      <LineChart data={trade.candles} margin={{ top: 2, right: 8, bottom: 2, left: 4 }}>
                        <XAxis dataKey="date" hide />
                        <YAxis domain={[0, 100]} hide width={0} />
                        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="2 2" strokeWidth={0.8} />
                        <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="2 2" strokeWidth={0.8} />
                        <Line type="monotone" dataKey="rsi14" stroke="#a78bfa" dot={false} strokeWidth={1.5} />
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 10 }}
                          formatter={(v: number) => [v?.toFixed?.(1), "RSI"]} labelFormatter={() => ""} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <p className="text-zinc-600 py-4 text-center">No candle data available for this trade.</p>
            )}

            {/* Similar trades */}
            {similarTrades.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-400 font-medium mb-1">Similar trades in this backtest ({similarTrades.length} found)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {similarTrades.map(t => (
                    <div key={t.tradeNo} className="bg-zinc-800/50 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                      <span className="text-zinc-500 text-[10px] font-mono">#{t.tradeNo} · {t.entryDate}</span>
                      <div className="flex items-center gap-1">
                        <ExitReasonBadge reason={t.exitReason} />
                        <span className={`font-mono text-[11px] font-bold ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                          {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "whatif" && (
          <div className="space-y-4 text-xs">
            <p className="text-zinc-400">
              <span className="text-teal-300 font-medium">Historical what-if:</span> How would this same strategy have performed if you had started it at different points in the past?
            </p>

            {snapshots.length === 0 ? (
              <p className="text-zinc-600 py-4 text-center">Historical data not available.</p>
            ) : (
              <>
                {/* Snapshot cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {snapshots.map(s => (
                    <div key={s.lookbackDays} className={`rounded border p-3 space-y-2 ${s.totalReturn >= 0 ? "border-emerald-800/50 bg-emerald-950/20" : "border-red-800/50 bg-red-950/20"}`}>
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-zinc-300">Started {s.label}</p>
                        <span className={`font-mono font-bold text-sm ${s.totalReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {s.totalReturn >= 0 ? "+" : ""}{s.totalReturn}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[10px]">
                        <div>
                          <p className="text-zinc-500">Trades</p>
                          <p className="font-mono text-zinc-300">{s.trades}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Win rate</p>
                          <p className={`font-mono ${s.winRate >= 50 ? "text-emerald-300" : "text-red-300"}`}>{s.winRate}%</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Avg hold</p>
                          <p className="font-mono text-zinc-300">{s.avgHoldingDays}d</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Best</p>
                          <p className="font-mono text-emerald-300">+{s.bestTrade}%</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Worst</p>
                          <p className="font-mono text-red-300">{s.worstTrade}%</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">W/L</p>
                          <p className="font-mono text-zinc-300">{s.wins}/{s.losses}</p>
                        </div>
                      </div>
                      {/* Mini equity curve for this window */}
                      {s.equityCurveSlice.length > 3 && (
                        <ResponsiveContainer width="100%" height={50}>
                          <AreaChart data={s.equityCurveSlice} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                            <defs>
                              <linearGradient id={`g${s.lookbackDays}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={s.totalReturn >= 0 ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={s.totalReturn >= 0 ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="value"
                              stroke={s.totalReturn >= 0 ? "#22c55e" : "#ef4444"}
                              fill={`url(#g${s.lookbackDays})`} strokeWidth={1.2} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  ))}
                </div>

                {/* Comparison bar chart */}
                <div>
                  <p className="text-[10px] text-zinc-400 font-medium mb-1">Return comparison across windows</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <ComposedChart data={snapshots} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 9 }} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: number) => `${v}%`} width={36} />
                      <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
                        formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v}%`, "Return"]} />
                      <ReferenceLine y={0} stroke="#52525b" strokeWidth={1} />
                      <Bar dataKey="totalReturn" radius={[3, 3, 0, 0]}>
                        {snapshots.map((s, i) => <Cell key={i} fill={s.totalReturn >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.8} />)}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-[10px] text-zinc-600">
                  These figures show only trades that started within each time window, using the same strategy, same symbol, same conditions. Real returns would depend on execution timing.
                </p>
              </>
            )}
          </div>
        )}
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
  const isPos = (scaled[scaled.length - 1]?.value ?? startV) >= startV;
  const curSym = displayCurrency === "INR" ? "₹" : "$";
  const loc = displayCurrency === "INR" ? "en-IN" : "en-US";
  const fmtK = (v: number) => `${curSym}${(v / 1000).toFixed(0)}k`;
  const fmtFull = (v: number) => `${curSym}${v.toLocaleString(loc, { maximumFractionDigits: 0 })}`;
  return (
    <div>
      <p className="text-xs text-zinc-400 font-medium mb-2">
        Equity curve ({fmtFull(initialCapital)} starting notional · {displayCurrency})
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={scaled} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isPos ? "#22c55e" : "#ef4444"} stopOpacity={0.25} />
              <stop offset="95%" stopColor={isPos ? "#22c55e" : "#ef4444"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: string) => v.slice(2, 10)} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={fmtK} width={48} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
            formatter={(v: number) => [fmtFull(Number(v)), "Portfolio"]} />
          <ReferenceLine y={initialCapital} stroke="#71717a" strokeDasharray="3 3" strokeWidth={1} />
          <Area type="monotone" dataKey="value" stroke={isPos ? "#22c55e" : "#ef4444"} fill="url(#eqGrad)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TradeReturnsChart({ trades }: { trades: Trade[] }) {
  if (!trades || trades.length === 0) return null;
  const data = trades.map(t => ({ name: `#${t.tradeNo}`, ret: t.returnPct }));
  return (
    <div>
      <p className="text-xs text-zinc-400 font-medium mb-2">Return per Trade (%)</p>
      <ResponsiveContainer width="100%" height={120}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 9 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: number) => `${v}%`} width={36} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
            formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Return"]} />
          <ReferenceLine y={0} stroke="#52525b" strokeWidth={1} />
          <Bar dataKey="ret" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.ret > 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.8} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyPortfolioReturnsChart({ data }: { data: Array<{ date: string; returnPct: number }> }) {
  if (!data || data.length === 0) {
    return <p className="text-zinc-600 text-xs py-4 text-center">No daily return series from the engine.</p>;
  }
  const chart = data.map(d => ({ name: d.date.slice(5), ret: d.returnPct }));
  return (
    <div>
      <p className="text-xs text-zinc-400 font-medium mb-2">Portfolio return per bar / day (%)</p>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chart} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 8 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: number) => `${v}%`} width={40} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
            formatter={(v: number) => [`${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(3)}%`, "Return"]} />
          <ReferenceLine y={0} stroke="#52525b" strokeWidth={1} />
          <Bar dataKey="ret" radius={[1, 1, 0, 0]}>
            {chart.map((d, i) => <Cell key={i} fill={d.ret > 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.75} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
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
    const ec = selectedCustom?.entry_conditions;
    if (!ec) return null;
    const st = String(ec.strategySubtype ?? "").toLowerCase();
    if (st === "time_based") return "Time-based entry (wall-clock) — sent to backtest engine";
    if (st === "hybrid") return "Hybrid (time + indicators) — sent to backtest engine";
    const nVis = Array.isArray(ec.groups)
      ? ec.groups.reduce((a: number, g: { conditions?: unknown[] }) => a + (Array.isArray(g?.conditions) ? g.conditions.length : 0), 0)
      : 0;
    const raw = typeof ec.rawExpression === "string" && ec.rawExpression.trim().length > 0;
    if (ec.mode === "raw" && raw) return "Raw expression entry — sent to backtest engine";
    if (nVis > 0) {
      return `${ec.groups?.length ?? 0} group(s), ${nVis} condition(s) — ${ec.groupLogic ?? "AND"} logic`;
    }
    if (raw) return "Raw expression (check builder mode) — sent if expression is non-empty";
    return null;
  })();

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white flex items-center gap-2">
          <LineChartIcon className="h-4 w-4 text-teal-400" />
          Backtesting
        </CardTitle>
        <CardDescription className="text-zinc-500 text-xs max-w-2xl">
          VectorBT runs on the server (OpenAlgo + historical data). In Strategy mode, pick a preset or custom strategy first, then symbol and risk fields.
          The app sends your full custom-strategy snapshot plus this run’s symbol / SL / TP; the engine simulates bar by bar and opens trades when entry rules match on past bars (and execution days), not only when “setup” matches today.
        </CardDescription>
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
            <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
              Backtesting scans the whole history: a trade opens on any past day where your entry conditions pass (and execution-day filters apply).
              “Setup not active” on the last bar only describes today, not whether the run will find trades in the past.
            </p>
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
        </div>

        {/* ─── Results ──────────────────────────────────────────────────── */}
        {result && (
          <div className="rounded-lg border border-zinc-700 p-3 space-y-4 text-xs">

            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <div className="text-teal-400 font-semibold text-sm flex items-center gap-2 flex-wrap">
                  {mode === "strategy" ? stratLabel : `Simple ${action}`}
                  {result.usedCustomConditions && (
                    <Badge className="bg-teal-900/60 text-teal-300 border-teal-700 text-[10px] px-1.5 py-0">Custom conds</Badge>
                  )}
                </div>
                <p className="text-zinc-500 text-[10px]">
                  {result.symbol} · {result.exchange} · {result.backtestPeriod}
                  {result.strategy ? <span className="text-zinc-600"> · engine {result.strategy}</span> : null}
                  {lastBacktestClientMs != null ? (
                    <span className="text-zinc-600"> · round-trip {lastBacktestClientMs} ms</span>
                  ) : null}
                </p>
              </div>
              <Badge className={result.strategyAchieved ? "bg-emerald-900/60 text-emerald-300" : "bg-zinc-800 text-zinc-400"}>
                Setup: {result.strategyAchieved ? "Active now" : "Not active"}
              </Badge>
            </div>

            {/* Primary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard label="Total Trades" value={result.totalTrades} />
              <StatCard label="Win Rate" value={`${result.winRate}%`} sub={`${result.wins}W / ${result.losses}L`} color={result.winRate >= 50 ? "green" : "red"} />
              <StatCard label="Total Return" value={`${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn}%`} color={result.totalReturn >= 0 ? "green" : "red"} />
              <StatCard label="Max Drawdown" value={`${result.maxDrawdown}%`} color="red" />
              <StatCard label="Profit Factor" value={result.profitFactor} color={result.profitFactor >= 1.5 ? "green" : result.profitFactor >= 1 ? "yellow" : "red"} />
              <StatCard label="Sharpe" value={result.sharpeRatio} color={result.sharpeRatio >= 1 ? "green" : result.sharpeRatio >= 0.5 ? "yellow" : "default"} />
              <StatCard label="Best Trade" value={`+${result.bestTrade}%`} color="green" />
              <StatCard label="Worst Trade" value={`${result.worstTrade}%`} color="red" />
            </div>

            {/* Extended stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard label="Avg Hold" value={`${result.avgHoldingDays}d`} />
              <StatCard label="Avg Win" value={`+${result.avgWin}%`} color="green" />
              <StatCard label="Avg Loss" value={`${result.avgLoss}%`} color="red" />
              <StatCard label="Expectancy" value={`${result.expectancy >= 0 ? "+" : ""}${result.expectancy}%`} color={result.expectancy >= 0 ? "green" : "red"} />
              <StatCard label="Win Streak" value={`${result.maxWinStreak}`} color="green" />
              <StatCard label="Loss Streak" value={`${result.maxLossStreak}`} color="red" />
              {result.exitReasonCounts && Object.keys(result.exitReasonCounts).length > 0 && (
                <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2 sm:col-span-2">
                  <p className="text-[10px] text-zinc-500 mb-1">Exit reasons</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(result.exitReasonCounts).map(([r, cnt]) => (
                      <span key={r} className="flex items-center gap-1">
                        <ExitReasonBadge reason={r} />
                        <span className="text-zinc-400 font-mono">{cnt}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Current indicators */}
            {result.currentIndicators && (
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                <p className="text-[10px] text-zinc-500 mb-1">Current indicators</p>
                <div className="flex flex-wrap gap-3 text-[11px] font-mono">
                  <span className="text-zinc-400">Price: <span className="text-zinc-200">{result.currentIndicators.price}</span></span>
                  <span className="text-zinc-400">SMA20: <span className="text-amber-300">{result.currentIndicators.sma20}</span></span>
                  <span className="text-zinc-400">RSI14: <span className="text-purple-300">{result.currentIndicators.rsi14}</span></span>
                  <span className="text-zinc-400">MACD: <span className="text-sky-300">{result.currentIndicators.macd}</span> / <span className="text-sky-400">{result.currentIndicators.macdSignal}</span></span>
                </div>
              </div>
            )}

            <p className="text-zinc-500 text-[11px]">
              Setup now: {result.strategyAchieved ? "Yes ✓" : "No"} — {result.achievementReason}
            </p>

            {result.executionDaysApplied && result.executionDaysApplied.length > 0 && (
              <p className="text-[10px] text-zinc-500">
                <span className="text-zinc-400">Execution days in backtest:</span>{" "}
                {result.executionDaysApplied.map(d => EXEC_DAY_LABELS[d] ?? String(d)).join(", ")}
                <span className="text-zinc-600"> (matches strategy builder: 0=Sun … 6=Sat)</span>
              </p>
            )}

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-zinc-800">
              {(["trades", "equity", "returns", "daily"] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs rounded-t transition-colors ${activeTab === tab ? "bg-zinc-800 text-zinc-200 border-b-2 border-teal-500" : "text-zinc-500 hover:text-zinc-300"}`}>
                  {tab === "trades" ? `Trades (${result.totalTrades})` : tab === "equity" ? "Equity Curve" : tab === "returns" ? "Per-trade %" : "Daily %"}
                </button>
              ))}
            </div>

            {/* Tab: Trades */}
            {activeTab === "trades" && (result.totalTrades ?? 0) > 0 && (
              <div className="space-y-3">
                {Array.isArray(result.trades) && result.trades.length > 0 ? (
                  <>
                    <p className="text-zinc-400 text-[11px]">
                      <span className="text-teal-400 font-medium">Trade cards</span> — click a card or table row for full chart + historical what-if in a popup.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {result.trades.map(t => (
                        <button
                          key={t.tradeNo}
                          type="button"
                          onClick={() => result && openTradeFromLive(t, result)}
                          className="text-left rounded-lg border border-zinc-700 bg-zinc-950/80 p-3 hover:border-teal-600/50 hover:bg-zinc-900/90 transition-colors space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm text-zinc-200">Trade #{t.tradeNo}</span>
                            <ExitReasonBadge reason={t.exitReason} />
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-zinc-500">
                            <span>Entry</span>
                            <span className="font-mono text-zinc-300 text-right">{t.entryDate}</span>
                            <span>Exit</span>
                            <span className="font-mono text-zinc-300 text-right">{t.exitDate}</span>
                            <span>Hold</span>
                            <span className="font-mono text-zinc-300 text-right">{t.holdingDays ?? "—"}d</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {t.entryPrice ?? "—"} → {t.exitPrice ?? "—"}
                            </span>
                            <span className={`font-mono text-sm font-bold ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                              {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    <p className="text-zinc-500 text-[10px] font-medium pt-1">All trades (table)</p>
                    <div className="rounded border border-zinc-800 overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead className="bg-zinc-950 sticky top-0">
                          <tr className="text-zinc-500">
                            <th className="text-left px-2 py-2">#</th>
                            <th className="text-left px-2 py-2">Entry</th>
                            <th className="text-left px-2 py-2">Exit</th>
                            <th className="text-right px-2 py-2">Hold</th>
                            <th className="text-right px-2 py-2">Px In</th>
                            <th className="text-right px-2 py-2">Px Out</th>
                            <th className="text-right px-2 py-2">Return</th>
                            <th className="text-center px-2 py-2">Why</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedTrades.map(t => (
                            <tr key={t.tradeNo}
                              className="border-t border-zinc-800/60 cursor-pointer hover:bg-zinc-800/40 transition-colors"
                              onClick={() => result && openTradeFromLive(t, result)}>
                              <td className="px-2 py-2 text-zinc-600 font-mono">{t.tradeNo}</td>
                              <td className="px-2 py-2 text-zinc-300 font-mono">{t.entryDate}</td>
                              <td className="px-2 py-2 text-zinc-300 font-mono">{t.exitDate}</td>
                              <td className="px-2 py-2 text-right text-zinc-400 font-mono">{t.holdingDays ?? "—"}</td>
                              <td className="px-2 py-2 text-right text-zinc-300 font-mono">{t.entryPrice ?? "—"}</td>
                              <td className="px-2 py-2 text-right text-zinc-300 font-mono">{t.exitPrice ?? "—"}</td>
                              <td className={`px-2 py-2 text-right font-mono font-semibold ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                                {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                              </td>
                              <td className="px-2 py-2 text-center"><ExitReasonBadge reason={t.exitReason} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between">
                      <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200"
                        onClick={() => setTradesPage(p => Math.max(1, p - 1))} disabled={tradesPage <= 1}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                      </Button>
                      <span className="text-[10px] text-zinc-500">
                        {(tradesPage - 1) * tradesPerPage + 1}–{Math.min(tradesPage * tradesPerPage, result.trades.length)} of {result.trades.length}
                      </span>
                      <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200"
                        onClick={() => setTradesPage(p => Math.min(totalTradePages, p + 1))} disabled={tradesPage >= totalTradePages}>
                        Next <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <Alert className="bg-amber-950/30 border-amber-800">
                    <AlertDescription className="text-amber-200/90 text-xs">
                      The engine reports <strong>{result.totalTrades}</strong> trade(s), but the trade list in the response is empty.
                      Redeploy/restart OpenAlgo with the latest <code className="text-amber-100/80">vectorbt_backtest_service.py</code> so each trade is included in{" "}
                      <code className="text-amber-100/80">trades[]</code>.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {activeTab === "equity" && (
              <EquityCurveChart
                data={result.equityCurve ?? []}
                initialCapital={Math.max(1000, parseFloat(initialCapital) || 100000)}
                displayCurrency={displayCurrency}
              />
            )}
            {activeTab === "returns" && <TradeReturnsChart trades={result.trades ?? []} />}
            {activeTab === "daily" && <DailyPortfolioReturnsChart data={result.dailyReturns ?? []} />}
          </div>
        )}

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
                          <tr className={`border-t border-zinc-800/60 cursor-pointer transition-colors ${isExp ? "bg-zinc-800/60" : "hover:bg-zinc-800/30"}`}
                            onClick={() => setExpandedHistoryId(isExp ? null : hId)}>
                            <td className="px-2 py-2 text-zinc-500 font-mono">{String((h as any).created_at ?? "").slice(0, 16).replace("T", " ")}</td>
                            <td className="px-2 py-2 text-zinc-200 font-mono">{String((h as any).symbol ?? "—")}</td>
                            <td className="px-2 py-2 text-zinc-400 flex items-center gap-1">
                              {String((h as any).strategy_label ?? (h as any).mode ?? "—")}
                              {s.usedCustomConditions && <Badge className="bg-teal-900/60 text-teal-300 border-teal-700 text-[9px] px-1 py-0 ml-1">CC</Badge>}
                            </td>
                            <td className="px-2 py-2 text-right text-zinc-300 font-mono">{String(s.totalTrades ?? "—")}</td>
                            <td className="px-2 py-2 text-right text-zinc-300 font-mono">{String(s.winRate ?? "—")}%</td>
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
                                onClick={e => {
                                  e.stopPropagation();
                                  void deleteHistoryRun(hId);
                                }}
                              >
                                {historyDeletingId === hId
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </td>
                            <td className="px-2 py-2 text-center text-zinc-500">{isExp ? "▲" : "▼"}</td>
                          </tr>
                          {isExp && (
                            <tr className="bg-zinc-900/80">
                              <td colSpan={8} className="px-3 py-3 space-y-3">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <StatCard label="Win Rate" value={`${s.winRate ?? "—"}%`} color={Number(s.winRate) >= 50 ? "green" : "red"} />
                                  <StatCard label="Return" value={`${ret >= 0 ? "+" : ""}${s.totalReturn ?? "—"}%`} color={ret >= 0 ? "green" : "red"} />
                                  <StatCard label="Max DD" value={`${s.maxDrawdown ?? "—"}%`} color="red" />
                                  <StatCard label="Sharpe" value={s.sharpeRatio ?? "—"} />
                                  {s.bestTrade != null && <StatCard label="Best" value={`+${s.bestTrade}%`} color="green" />}
                                  {s.worstTrade != null && <StatCard label="Worst" value={`${s.worstTrade}%`} color="red" />}
                                  {s.avgHoldingDays != null && <StatCard label="Avg Hold" value={`${s.avgHoldingDays}d`} />}
                                  {s.expectancy != null && <StatCard label="Expectancy" value={`${Number(s.expectancy) >= 0 ? "+" : ""}${s.expectancy}%`} color={Number(s.expectancy) >= 0 ? "green" : "red"} />}
                                </div>

                                {histTrades.length > 0 && (
                                  <div>
                                    <p className="text-[10px] text-zinc-400 font-medium mb-1">
                                      All {histTrades.length} trades · click row to open popup
                                    </p>
                                    <div className="rounded border border-zinc-800 overflow-auto max-h-56">
                                      <table className="w-full text-[11px]">
                                        <thead className="bg-zinc-950 sticky top-0">
                                          <tr className="text-zinc-500">
                                            <th className="text-left px-2 py-1.5">#</th>
                                            <th className="text-left px-2 py-1.5">Entry</th>
                                            <th className="text-left px-2 py-1.5">Exit</th>
                                            <th className="text-right px-2 py-1.5">Hold</th>
                                            <th className="text-right px-2 py-1.5">Px In</th>
                                            <th className="text-right px-2 py-1.5">Px Out</th>
                                            <th className="text-right px-2 py-1.5">Ret%</th>
                                            <th className="text-center px-2 py-1.5">Why</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {histTrades.map((t, ti) => (
                                            <tr key={ti}
                                              className="border-t border-zinc-800/50 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                                              onClick={e => { e.stopPropagation(); openTradeFromHistory(t, h as Record<string, unknown>); }}>
                                              <td className="px-2 py-1.5 text-zinc-600 font-mono">{t.tradeNo ?? ti + 1}</td>
                                              <td className="px-2 py-1.5 text-zinc-300 font-mono">{t.entryDate}</td>
                                              <td className="px-2 py-1.5 text-zinc-300 font-mono">{t.exitDate}</td>
                                              <td className="px-2 py-1.5 text-right text-zinc-400 font-mono">{t.holdingDays ?? "—"}</td>
                                              <td className="px-2 py-1.5 text-right text-zinc-300 font-mono">{t.entryPrice ?? "—"}</td>
                                              <td className="px-2 py-1.5 text-right text-zinc-300 font-mono">{t.exitPrice ?? "—"}</td>
                                              <td className={`px-2 py-1.5 text-right font-mono font-semibold ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                                                {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                                              </td>
                                              <td className="px-2 py-1.5 text-center"><ExitReasonBadge reason={t.exitReason ?? "unknown"} /></td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

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
                              </td>
                            </tr>
                          )}
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
