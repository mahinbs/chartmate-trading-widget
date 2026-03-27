/**
 * AlgoStrategyBuilder — full-page multi-step algo strategy wizard.
 * Mirrors the Algorooms / Streak style of strategy creation:
 *  Step 1  Foundation    — name, strategy type, instrument, order type, direction
 *  Step 2  Instruments   — symbol, exchange, lot size, expiry, strike
 *  Step 3  Timing        — session hours, execution days, chart interval & type
 *  Step 4  Entry         — visual condition builder OR time-based entry OR raw expression
 *  Step 5  Exit          — TP%, SL%, trailing stop, indicator / time-based exit rules
 *  Step 6  Position      — order placement type, sizing, limit offset, scaling
 *  Step 7  Risk          — max risk/trade, max daily loss, max positions
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  AlgoCondition,
  ChartConfig,
  ConditionGroup,
  ConditionOp,
  EntryConditions,
  ExitConditions,
  IndicatorId,
  PositionConfig,
  RiskConfig,
} from "@/lib/algoStrategyTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

type BuilderStrategy = {
  id: string;
  name: string;
  description?: string | null;
  trading_mode: string;
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  risk_per_trade_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  symbols: string[];
  paper_strategy_type?: string | null;
  market_type?: string | null;
  entry_conditions?: EntryConditions | null;
  exit_conditions?: ExitConditions | null;
  position_config?: PositionConfig | null;
  risk_config?: RiskConfig | null;
  chart_config?: ChartConfig | null;
  execution_days?: number[] | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: BuilderStrategy | null;
  onSaved: () => void;
};

type StrategyType  = "indicator_based" | "time_based" | "hybrid";
type InstrumentType = "equity" | "futures" | "options" | "indices";
type OrderProduct  = "MIS" | "CNC" | "BTST" | "NRML";
type Direction     = "LONG" | "SHORT" | "BOTH";
type ExpiryType    = "weekly" | "monthly";
type StrikeType    = "ATM" | "ITM_1" | "ITM_2" | "OTM_1" | "OTM_2";

type BuilderForm = {
  // Step 1
  name: string;
  description: string;
  strategyType: StrategyType;
  instrumentType: InstrumentType;
  exchange: string;
  orderProduct: OrderProduct;
  direction: Direction;
  // Step 2
  symbol: string;
  lotSize: number;
  expiryType: ExpiryType;
  strikeType: StrikeType;
  // Step 3
  startTime: string;
  endTime: string;
  squareoffTime: string;
  executionDays: number[];
  chartInterval: ChartConfig["interval"];
  chartType: ChartConfig["chartType"];
  // Step 4
  entryConditions: EntryConditions;
  entryTime: string;   // time_based + hybrid — clock entry (HH:MM)
  // Step 5
  exitClockTime: string; // wall-clock exit for time-based / hybrid (HH:MM)
  takeProfitPct: number;
  stopLossPct: number;
  trailingStop: boolean;
  trailingStopPct: number;
  timeBasedExit: boolean;
  exitAfterMinutes: number;
  exitIndicatorGroups: ConditionGroup[];
  // Step 6
  orderType: PositionConfig["orderType"];
  sizingMode: PositionConfig["sizingMode"];
  capitalPct: number;
  limitOffsetPct: number;
  // Step 7
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  capitalAllocationPct: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { idx: 0, title: "Foundation",   sub: "Name, type & direction" },
  { idx: 1, title: "Instruments",  sub: "Symbol, lot & expiry" },
  { idx: 2, title: "Timing",       sub: "Session hours & chart" },
  { idx: 3, title: "Entry",        sub: "When to enter a trade" },
  { idx: 4, title: "Exit",         sub: "TP, SL & exit rules" },
  { idx: 5, title: "Position",     sub: "Order type & sizing" },
  { idx: 6, title: "Risk Rules",   sub: "Limits & capital" },
];

const DAY_LABELS: Array<{ v: number; l: string }> = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" },
  { v: 4, l: "Thu" }, { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];

const INDICATORS: IndicatorId[] = [
  "RSI", "MACD", "MACD_SIGNAL", "MACD_HIST",
  "EMA", "SMA", "BB_UPPER", "BB_MIDDLE", "BB_LOWER",
  "PRICE", "CHANGE_PCT", "VOLUME",
];

const OPS: Array<{ v: ConditionOp; l: string }> = [
  { v: "less_than",           l: "<" },
  { v: "greater_than",        l: ">" },
  { v: "equals",              l: "=" },
  { v: "less_than_or_equal",  l: "≤" },
  { v: "greater_than_or_equal", l: "≥" },
  { v: "crosses_above",       l: "crosses above" },
  { v: "crosses_below",       l: "crosses below" },
];

function makeCond(): AlgoCondition {
  return { id: crypto.randomUUID(), indicator: "EMA", period: 50, op: "crosses_above", rhs: { kind: "indicator", id: "EMA", period: 200 } };
}
function makeGroup(): ConditionGroup {
  return { id: crypto.randomUUID(), logic: "AND", conditions: [makeCond()] };
}

/** Parse TIME_IS(HH:MM) from saved raw expression → value suitable for <input type="time" /> */
function parseTimeFromSavedRaw(raw: string | undefined): string | null {
  const m = /TIME_IS\s*\(\s*(\d{1,2}):(\d{2})\s*\)/i.exec(String(raw ?? ""));
  if (!m) return null;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2].padStart(2, "0")}`;
}

/** Maps builder mode to `paper_strategy_type` for backtests / fallbacks */
function mapPaperStrategyType(st: StrategyType, orderProduct: OrderProduct): string {
  if (st === "time_based") return "time_scheduled";
  if (st === "hybrid") return "trend_following";
  if (orderProduct === "MIS" || orderProduct === "BTST") return "momentum";
  if (orderProduct === "NRML") return "swing_trading";
  return "trend_following";
}

const DEFAULT_FORM: BuilderForm = {
  name: "",
  description: "",
  strategyType: "indicator_based",
  instrumentType: "equity",
  exchange: "NSE",
  orderProduct: "MIS",
  direction: "LONG",
  symbol: "",
  lotSize: 1,
  expiryType: "weekly",
  strikeType: "ATM",
  startTime: "09:15",
  endTime: "15:15",
  squareoffTime: "15:15",
  executionDays: [1, 2, 3, 4, 5],
  chartInterval: "5m",
  chartType: "candlestick",
  entryConditions: {
    mode: "visual",
    groupLogic: "AND",
    groups: [makeGroup()],
    rawExpression: "EMA(50) > EMA(200) AND RSI(14) > 50",
  },
  entryTime: "09:20",
  exitClockTime: "13:01",
  takeProfitPct: 4,
  stopLossPct: 2,
  trailingStop: false,
  trailingStopPct: 1,
  timeBasedExit: false,
  exitAfterMinutes: 180,
  exitIndicatorGroups: [makeGroup()],
  orderType: "MARKET",
  sizingMode: "fixed_qty",
  capitalPct: 10,
  limitOffsetPct: 0.2,
  maxRiskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxOpenPositions: 3,
  capitalAllocationPct: 30,
};

function fromExisting(e?: BuilderStrategy | null): BuilderForm {
  if (!e) return { ...DEFAULT_FORM, entryConditions: { ...DEFAULT_FORM.entryConditions, groups: [makeGroup()] }, exitIndicatorGroups: [makeGroup()] };
  const ec = e.entry_conditions ?? DEFAULT_FORM.entryConditions;
  const xc = e.exit_conditions ?? null;
  const pc = e.position_config ?? null;
  const rc = e.risk_config ?? null;
  const cc = e.chart_config ?? null;

  const mt = String(e.market_type ?? "equity");
  const instrumentType: InstrumentType = (["equity", "futures", "options", "indices"].includes(mt) ? mt : "equity") as InstrumentType;

  const sub = ec.strategySubtype;
  const strategyType: StrategyType =
    sub === "time_based" || sub === "hybrid" || sub === "indicator_based"
      ? sub
      : /^\s*TIME_IS\s*\(/i.test(String(ec.rawExpression ?? "")) && (!ec.groups || ec.groups.length === 0)
        ? "time_based"
        : "indicator_based";

  const entryTime =
    (ec.clockEntryTime && String(ec.clockEntryTime).trim()) ||
    parseTimeFromSavedRaw(ec.rawExpression) ||
    "09:20";

  const exitClockTime =
    (xc && "clockExitTime" in xc && typeof (xc as ExitConditions).clockExitTime === "string" && (xc as ExitConditions).clockExitTime)
      ? String((xc as ExitConditions).clockExitTime)
      : e.squareoff_time ?? "15:15";

  return {
    name: e.name ?? "",
    description: e.description ?? "",
    strategyType,
    instrumentType,
    exchange: (pc as PositionConfig)?.exchange ?? "NSE",
    orderProduct: ((pc as PositionConfig)?.orderProduct as OrderProduct) ?? ((e.is_intraday ? "MIS" : "CNC") as OrderProduct),
    direction: e.trading_mode as Direction ?? "LONG",
    symbol: Array.isArray(e.symbols) ? e.symbols[0] ?? "" : "",
    lotSize: Number((pc as PositionConfig)?.quantity ?? 1),
    expiryType: ((pc as PositionConfig)?.expiryType as ExpiryType) ?? "weekly",
    strikeType: ((pc as PositionConfig)?.strikeType as StrikeType) ?? "ATM",
    startTime: e.start_time ?? "09:15",
    endTime: e.end_time ?? "15:15",
    squareoffTime: e.squareoff_time ?? "15:15",
    executionDays: Array.isArray(e.execution_days) && e.execution_days.length ? e.execution_days : [1,2,3,4,5],
    chartInterval: cc?.interval ?? "5m",
    chartType: cc?.chartType ?? "candlestick",
    entryConditions: {
      mode: ec.mode ?? "visual",
      groupLogic: ec.groupLogic ?? "AND",
      groups: Array.isArray(ec.groups) && ec.groups.length ? ec.groups : [makeGroup()],
      rawExpression: ec.rawExpression ?? "",
      strategySubtype: strategyType,
      clockEntryTime: entryTime,
    },
    entryTime,
    exitClockTime,
    takeProfitPct: Number(xc?.takeProfitPct ?? e.take_profit_pct ?? 4),
    stopLossPct: Number(xc?.stopLossPct ?? e.stop_loss_pct ?? 2),
    trailingStop: Boolean(xc?.trailingStop ?? false),
    trailingStopPct: Number(xc?.trailingStopPct ?? 1),
    timeBasedExit: Boolean(xc?.timeBasedExit ?? false),
    exitAfterMinutes: Number(xc?.exitAfterMinutes ?? 180),
    exitIndicatorGroups: Array.isArray(xc?.indicatorGroups) && xc.indicatorGroups.length ? xc.indicatorGroups : [makeGroup()],
    orderType: (pc as PositionConfig)?.orderType ?? "MARKET",
    sizingMode: (pc as PositionConfig)?.sizingMode ?? "fixed_qty",
    capitalPct: Number((pc as PositionConfig)?.capitalPct ?? 10),
    limitOffsetPct: Number((pc as PositionConfig)?.limitOffsetPct ?? 0.2),
    maxRiskPerTradePct: Number((rc as RiskConfig)?.maxRiskPerTradePct ?? e.risk_per_trade_pct ?? 1),
    maxDailyLossPct: Number((rc as RiskConfig)?.maxDailyLossPct ?? 3),
    maxOpenPositions: Number((rc as RiskConfig)?.maxOpenPositions ?? 3),
    capitalAllocationPct: Number((rc as RiskConfig)?.capitalAllocationPct ?? 30),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-zinc-300">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest pt-2 pb-1 border-b border-zinc-800 mb-3">{children}</p>;
}

type SymbolSearchRow = {
  symbol: string;
  description: string;
  full_symbol: string;
  exchange: string;
  type: string;
};

function parseSymbolList(csv: string): string[] {
  return csv.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

function mergeSymbolList(csv: string, token: string): string {
  const set = new Set(parseSymbolList(csv));
  set.add(token.toUpperCase().trim());
  return Array.from(set).join(", ");
}

/** Map Yahoo-style tickers to broker quote params (Zerodha / OpenAlgo) */
function brokerQuotePair(token: string, preferredExchange: string): { symbol: string; exchange: string } {
  const t = token.trim().toUpperCase();
  if (t.endsWith(".NS")) return { symbol: t.replace(/\.NS$/i, ""), exchange: "NSE" };
  if (t.endsWith(".BO")) return { symbol: t.replace(/\.BO$/i, ""), exchange: "BSE" };
  if (["NFO", "BFO", "MCX", "CDS", "NCDEX"].includes(preferredExchange)) {
    return { symbol: t, exchange: preferredExchange };
  }
  return { symbol: t, exchange: preferredExchange === "BSE" ? "BSE" : "NSE" };
}

function InstrumentSymbolPicker({
  symbolCsv,
  onSymbolCsvChange,
  preferredExchange,
  onExchangeSync,
}: {
  symbolCsv: string;
  onSymbolCsvChange: (v: string) => void;
  preferredExchange: string;
  onExchangeSync: (ex: string) => void;
}) {
  const [brokerConnected, setBrokerConnected] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [results, setResults] = useState<SymbolSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (!cancelled) setBrokerConnected(false);
        return;
      }
      const { data } = await supabase
        .from("user_trading_integration")
        .select("is_active, openalgo_username")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!cancelled) setBrokerConnected(Boolean((data as { openalgo_username?: string | null })?.openalgo_username));
    })();
    return () => { cancelled = true; };
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const data: SymbolSearchRow[] = Array.isArray(res.data) ? (res.data as SymbolSearchRow[]) : [];
      setResults(data.slice(0, 14));
      setOpen(data.length > 0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const addToken = (row: SymbolSearchRow) => {
    const token = (row.full_symbol || row.symbol || "").trim();
    if (!token) return;
    onSymbolCsvChange(mergeSymbolList(symbolCsv, token));
    if (row.full_symbol?.endsWith(".BO")) onExchangeSync("BSE");
    else if (row.full_symbol?.endsWith(".NS")) onExchangeSync("NSE");
    else if (row.exchange && /^[A-Z]{2,6}$/.test(String(row.exchange).toUpperCase())) {
      onExchangeSync(String(row.exchange).toUpperCase());
    }
    setDraft("");
    setOpen(false);
    setResults([]);
  };

  const verifyWithBroker = async () => {
    const list = parseSymbolList(symbolCsv);
    if (list.length === 0) {
      toast.error("Add at least one symbol to verify");
      return;
    }
    if (!brokerConnected) {
      toast.error("Connect your broker first — then you can verify tradingsymbols match your account.");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Sign in required");
      return;
    }
    setVerifying(true);
    try {
      const symbols = list.map((t) => brokerQuotePair(t, preferredExchange));
      const res = await supabase.functions.invoke("broker-data", {
        body: { action: "multiquotes", symbols },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = res.data as { success?: boolean; error?: string } | null;
      const errMsg = payload?.error ?? (res.error as { message?: string } | null)?.message;
      if (res.error || !payload?.success || errMsg) {
        toast.error(String(errMsg ?? res.error?.message ?? "Broker could not quote these symbols — check tradingsymbol and exchange (NSE / NFO / MCX)."));
        return;
      }
      toast.success("Broker returned quotes — symbols are reachable on this connection.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Broker verification failed");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const list = parseSymbolList(symbolCsv);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {brokerConnected === null ? (
          <Badge variant="outline" className="text-zinc-500 border-zinc-700">Checking broker…</Badge>
        ) : brokerConnected ? (
          <Badge className="bg-emerald-600/20 text-emerald-200 border border-emerald-500/35">Broker connected — verify symbols before deploy</Badge>
        ) : (
          <Badge variant="outline" className="text-amber-200/95 border-amber-500/40 bg-amber-500/10">
            Connect broker for live order routing — search uses the same market symbol index as the rest of the app
          </Badge>
        )}
      </div>

      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Search: RELIANCE, NIFTY 50, BANKNIFTY, BTC-USD…"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => search(v.trim()), 280);
            }}
            onFocus={() => results.length > 0 && setOpen(true)}
            className="h-10 bg-zinc-900 border-zinc-700 text-sm pl-9 pr-9"
          />
          {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-zinc-500" />}
        </div>
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 max-h-72 overflow-y-auto">
            {results.map((item, i) => (
              <button
                key={`${item.full_symbol}-${i}`}
                type="button"
                className="w-full flex items-start justify-between gap-2 px-3 py-2 hover:bg-zinc-800 text-left border-b border-zinc-800 last:border-0"
                onMouseDown={() => addToken(item)}
              >
                <div className="min-w-0">
                  <span className="font-mono text-white text-sm font-semibold">{item.symbol}</span>
                  <p className="text-[11px] text-zinc-500 line-clamp-2">{item.description}</p>
                </div>
                <span className="text-[10px] text-teal-400 shrink-0 uppercase">{item.type || "—"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {list.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-mono text-zinc-200"
            >
              {s}
              <button
                type="button"
                className="text-zinc-500 hover:text-red-400 px-0.5"
                onClick={() => onSymbolCsvChange(list.filter((x) => x !== s).join(", "))}
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            </span>
          ))}
          {brokerConnected && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs border-emerald-700/50 text-emerald-200"
              disabled={verifying}
              onClick={() => void verifyWithBroker()}
            >
              {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Verify with broker
            </Button>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold text-zinc-300">Or paste / edit (comma-separated)</Label>
        <Textarea
          value={symbolCsv}
          onChange={(e) => onSymbolCsvChange(e.target.value.toUpperCase())}
          placeholder="Leave empty to pick symbol when you deploy. Or: RELIANCE.NS, TCS.NS, ^NSEI, BTC-USD"
          className="min-h-[80px] bg-zinc-900 border-zinc-700 text-sm font-mono resize-y"
        />
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Same symbol search as orders &amp; charts (Yahoo-backed). For Indian F&amp;O, type the exact <strong>tradingsymbol</strong> your broker uses (e.g. NIFTY25JANFUT) or verify after connecting. Exchange on the Foundation step should match (NSE / NFO / MCX).
        </p>
      </div>
    </div>
  );
}

function ChoiceGroup<T extends string>({
  value, onChange, options, size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ v: T; l: string; sub?: string }>;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ v, l, sub }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-2 text-left transition-all ${
            value === v
              ? "border-teal-500 bg-teal-500/15 text-teal-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          } ${size === "sm" ? "text-xs" : "text-sm"}`}
        >
          <p className="font-semibold leading-tight">{l}</p>
          {sub && <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{sub}</p>}
        </button>
      ))}
    </div>
  );
}

function ConditionBuilder({
  groups,
  groupLogic,
  onGroups,
  onGroupLogic,
}: {
  groups: ConditionGroup[];
  groupLogic: "AND" | "OR";
  onGroups: (g: ConditionGroup[]) => void;
  onGroupLogic: (v: "AND" | "OR") => void;
}) {
  const updateCond = (gi: number, ci: number, patch: Partial<AlgoCondition>) => {
    const next = groups.map((g, i) => i !== gi ? g : {
      ...g,
      conditions: g.conditions.map((c, j) => j !== ci ? c : { ...c, ...patch }),
    });
    onGroups(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-400">Match</p>
        <ChoiceGroup
          value={groupLogic} onChange={onGroupLogic}
          size="sm"
          options={[{ v: "AND", l: "ALL groups (AND)" }, { v: "OR", l: "ANY group (OR)" }]}
        />
      </div>

      {groups.map((group, gi) => (
        <div key={group.id} className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <p className="text-xs text-zinc-500 font-bold">Group {gi + 1}</p>
              <ChoiceGroup
                value={group.logic}
                onChange={(v) => onGroups(groups.map((g, i) => i !== gi ? g : { ...g, logic: v }))}
                size="sm"
                options={[{ v: "AND", l: "AND" }, { v: "OR", l: "OR" }]}
              />
            </div>
            {groups.length > 1 && (
              <button type="button" onClick={() => onGroups(groups.filter((_, i) => i !== gi))}
                className="text-zinc-600 hover:text-red-400 text-xs transition-colors">Remove group</button>
            )}
          </div>

          {group.conditions.map((cond, ci) => (
            <div key={cond.id} className="grid grid-cols-12 gap-2 items-center">
              {/* Indicator */}
              <Select value={cond.indicator} onValueChange={(v) => updateCond(gi, ci, { indicator: v as IndicatorId })}>
                <SelectTrigger className="col-span-3 h-9 bg-zinc-900 border-zinc-700 text-sm text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {INDICATORS.map(ind => <SelectItem key={ind} value={ind} className="text-sm text-zinc-200">{ind}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Period */}
              <Input type="number" min="1" value={cond.period ?? 14}
                onChange={(e) => updateCond(gi, ci, { period: Number(e.target.value || 14) })}
                className="col-span-1 h-9 bg-zinc-900 border-zinc-700 text-sm text-white text-center" />
              {/* Op */}
              <Select value={cond.op} onValueChange={(v) => updateCond(gi, ci, { op: v as ConditionOp })}>
                <SelectTrigger className="col-span-2 h-9 bg-zinc-900 border-zinc-700 text-sm text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {OPS.map(op => <SelectItem key={op.v} value={op.v} className="text-sm text-zinc-200">{op.l}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* RHS kind */}
              <Select value={cond.rhs.kind ?? "number"} onValueChange={(v) => updateCond(gi, ci, {
                rhs: v === "number" ? { kind: "number", value: 30 } : { kind: "indicator", id: "EMA", period: 200 },
              })}>
                <SelectTrigger className="col-span-2 h-9 bg-zinc-900 border-zinc-700 text-sm text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="number" className="text-sm text-zinc-200">Value</SelectItem>
                  <SelectItem value="indicator" className="text-sm text-zinc-200">Indicator</SelectItem>
                </SelectContent>
              </Select>
              {/* RHS value or indicator */}
              {cond.rhs.kind === "number" ? (
                <Input type="number" value={(cond.rhs as any).value ?? 0}
                  onChange={(e) => updateCond(gi, ci, { rhs: { kind: "number", value: Number(e.target.value || 0) } })}
                  className="col-span-3 h-9 bg-zinc-900 border-zinc-700 text-sm text-white" />
              ) : (
                <div className="col-span-3 grid grid-cols-2 gap-2">
                  <Select value={(cond.rhs as any).id ?? "EMA"} onValueChange={(v) => updateCond(gi, ci, { rhs: { ...cond.rhs, kind: "indicator", id: v as IndicatorId } })}>
                    <SelectTrigger className="h-9 bg-zinc-900 border-zinc-700 text-sm text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {INDICATORS.map(ind => <SelectItem key={ind} value={ind} className="text-sm text-zinc-200">{ind}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="1" value={(cond.rhs as any).period ?? 200}
                    onChange={(e) => updateCond(gi, ci, { rhs: { ...cond.rhs, period: Number(e.target.value || 200) } })}
                    className="h-9 bg-zinc-900 border-zinc-700 text-sm text-white text-center" />
                </div>
              )}
              {/* Delete */}
              <button type="button" onClick={() => {
                const newConds = group.conditions.filter(c => c.id !== cond.id);
                onGroups(groups.map((g, i) => i !== gi ? g : { ...g, conditions: newConds.length ? newConds : [makeCond()] }));
              }} className="col-span-1 flex items-center justify-center h-9 w-9 rounded text-zinc-600 hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="h-8 text-xs border-zinc-700 text-zinc-300"
            onClick={() => onGroups(groups.map((g, i) => i !== gi ? g : { ...g, conditions: [...g.conditions, makeCond()] }))}>
            <Plus className="h-3 w-3 mr-1" /> Add condition
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="h-8 text-xs border-zinc-700 text-zinc-300"
        onClick={() => onGroups([...groups, makeGroup()])}>
        <Plus className="h-3 w-3 mr-1" /> Add group
      </Button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AlgoStrategyBuilder({ open, onOpenChange, existing, onSaved }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BuilderForm>(DEFAULT_FORM);
  const isEdit = Boolean(existing?.id);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setForm(fromExisting(existing));
  }, [open, existing]);

  const set = <K extends keyof BuilderForm>(k: K, v: BuilderForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const symbolCount = useMemo(
    () => form.symbol.split(",").map(s => s.trim()).filter(Boolean).length,
    [form.symbol],
  );

  const save = async () => {
    if (!form.name.trim()) { toast.error("Strategy name is required"); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in required");

      const entryConditions: EntryConditions =
        form.strategyType === "time_based"
          ? {
              mode: "raw",
              groupLogic: "AND",
              groups: [],
              rawExpression: `TIME_IS(${form.entryTime})`,
              strategySubtype: "time_based",
              clockEntryTime: form.entryTime,
            }
          : form.strategyType === "hybrid"
            ? {
                ...form.entryConditions,
                strategySubtype: "hybrid",
                clockEntryTime: form.entryTime,
              }
            : {
                ...form.entryConditions,
                strategySubtype: "indicator_based",
              };

      const exitPayload: ExitConditions = {
        takeProfitPct: form.takeProfitPct,
        stopLossPct: form.stopLossPct,
        trailingStop: form.trailingStop,
        trailingStopPct: form.trailingStopPct,
        indicatorGroups: form.exitIndicatorGroups,
        timeBasedExit: form.timeBasedExit,
        exitAfterMinutes: form.exitAfterMinutes,
        ...(form.strategyType === "time_based" || form.strategyType === "hybrid"
          ? { clockExitTime: form.exitClockTime }
          : {}),
      };

      const paperType = mapPaperStrategyType(form.strategyType, form.orderProduct);
      const sessionEnd = form.strategyType === "time_based" ? form.exitClockTime : form.endTime;
      const sessionSq = form.strategyType === "time_based" ? form.exitClockTime : form.squareoffTime;

      const body: Record<string, unknown> = {
        action: isEdit ? "update" : "create",
        ...(isEdit ? { strategy_id: existing?.id } : {}),
        name: form.name.trim(),
        description: form.description.trim(),
        trading_mode: form.direction,
        is_intraday: form.orderProduct === "MIS" || form.orderProduct === "BTST",
        start_time: form.startTime,
        end_time: sessionEnd,
        squareoff_time: sessionSq,
        risk_per_trade_pct: form.maxRiskPerTradePct,
        stop_loss_pct: form.stopLossPct,
        take_profit_pct: form.takeProfitPct,
        symbols: [...new Set(form.symbol.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))],
        paper_strategy_type: paperType,
        market_type: form.instrumentType,
        entry_conditions: entryConditions,
        exit_conditions: exitPayload,
        position_config: {
          orderType: form.orderType,
          sizingMode: form.sizingMode,
          quantity: form.lotSize,
          capitalPct: form.capitalPct,
          limitOffsetPct: form.limitOffsetPct,
          scaling: [],
          expiryType: form.expiryType,
          strikeType: form.strikeType,
          exchange: form.exchange,
          orderProduct: form.orderProduct,
        },
        risk_config: {
          maxRiskPerTradePct: form.maxRiskPerTradePct,
          maxDailyLossPct: form.maxDailyLossPct,
          maxOpenPositions: form.maxOpenPositions,
          capitalAllocationPct: form.capitalAllocationPct,
        },
        chart_config: { interval: form.chartInterval, chartType: form.chartType },
        execution_days: form.executionDays,
      };

      const res = await supabase.functions.invoke("manage-strategy", {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error || (res.data as { error?: string } | null)?.error) {
        throw new Error((res.data as { error?: string } | null)?.error ?? res.error?.message ?? "Failed to save");
      }
      toast.success(isEdit ? "Strategy updated" : "Strategy created");
      onOpenChange(false);
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 !w-[98vw] !max-w-[98vw] sm:!max-w-[98vw] lg:!max-w-[98vw] !h-[96vh] !max-h-[96vh] rounded-xl m-0 overflow-hidden p-0 border-zinc-800 bg-zinc-950 text-white flex flex-col">

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-zinc-800 shrink-0">
          <div>
            <DialogTitle className="text-lg font-bold text-white">
              {isEdit ? "Edit Algo Strategy" : "New Algo Strategy"}
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-500 mt-0.5">
              Build indicator or time-based logic with risk controls and execution settings.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
            {STEPS.map((s, i) => (
              <button key={s.idx} type="button" onClick={() => setStep(i)}
                className={`flex items-center gap-1 transition-colors ${i === step ? "text-teal-300 font-semibold" : "text-zinc-600 hover:text-zinc-400"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  i < step ? "bg-teal-600 text-white" : i === step ? "bg-teal-500/20 border border-teal-500 text-teal-300" : "bg-zinc-800 text-zinc-500"
                }`}>{i + 1}</span>
                <span className="hidden lg:inline">{s.title}</span>
                {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-zinc-700" />}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-44 shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-3 space-y-0.5 overflow-y-auto">
            {STEPS.map((s, i) => (
              <button key={s.idx} type="button" onClick={() => setStep(i)}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition-all ${
                  i === step ? "bg-teal-500/15 border border-teal-500/40 text-teal-300" : "text-zinc-400 hover:bg-zinc-800 border border-transparent"
                }`}>
                <p className={`text-xs font-bold leading-tight ${i === step ? "" : ""}`}>{i + 1}. {s.title}</p>
                <p className="text-[10px] text-zinc-600 leading-tight mt-0.5">{s.sub}</p>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* ── Step 0: Foundation ─────────────────────────────────────── */}
            {step === 0 && (
              <>
                <SectionTitle>Strategy Identity</SectionTitle>
                <Row>
                  <div className="col-span-2">
                    <Field label="Strategy Name *">
                      <Input value={form.name} onChange={e => set("name", e.target.value)}
                        placeholder="e.g. EMA Crossover Long, NIFTY Breakout"
                        className="h-10 bg-zinc-900 border-zinc-700 text-base" autoFocus />
                    </Field>
                  </div>
                </Row>
                <Field label="Description (optional)">
                  <Textarea value={form.description} onChange={e => set("description", e.target.value)}
                    placeholder="What does this strategy do? When does it work best?"
                    className="min-h-[80px] bg-zinc-900 border-zinc-700 text-sm resize-none" />
                </Field>

                <SectionTitle>Strategy Type</SectionTitle>
                <Field label="How does this strategy enter trades?" hint="Indicator-based uses technical signals. Time-based enters at a fixed time each day.">
                  <ChoiceGroup
                    value={form.strategyType} onChange={v => set("strategyType", v)}
                    options={[
                      { v: "indicator_based", l: "Indicator-Based", sub: "RSI, MACD, EMA crossover, etc." },
                      { v: "time_based",      l: "Time-Based",      sub: "Enter at a specific time daily" },
                      { v: "hybrid",          l: "Hybrid",          sub: "Time window + indicator confirmation" },
                    ]}
                  />
                </Field>

                {form.strategyType === "time_based" && (
                  <p className="text-xs text-teal-300/95 rounded-lg border border-teal-500/35 bg-teal-500/10 px-3 py-2 leading-relaxed">
                    <strong>Time-based mode:</strong> set your <strong>entry clock</strong> on the Entry step and{" "}
                    <strong>exit clock</strong> on the Exit step (same idea as Algorooms: e.g. enter 1:00 PM, exit 1:01 PM). Scans use IST for NSE/BSE.
                  </p>
                )}
                {form.strategyType === "hybrid" && (
                  <p className="text-xs text-violet-300/95 rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 py-2 leading-relaxed">
                    <strong>Hybrid:</strong> you must set both a <strong>daily entry time</strong> and <strong>indicator rules</strong> — both must agree to fire an entry.
                  </p>
                )}

                <SectionTitle>Instrument & Market</SectionTitle>
                <Field label="Instrument Type">
                  <ChoiceGroup
                    value={form.instrumentType} onChange={v => set("instrumentType", v)}
                    options={[
                      { v: "equity",  l: "Equity",  sub: "Stocks / Shares" },
                      { v: "futures", l: "Futures",  sub: "F&O — Carry" },
                      { v: "options", l: "Options",  sub: "Calls & Puts" },
                      { v: "indices", l: "Indices",  sub: "NIFTY, BANKNIFTY" },
                    ]}
                  />
                </Field>

                <Row>
                  <Field label="Exchange">
                    <Select value={form.exchange} onValueChange={v => set("exchange", v)}>
                      <SelectTrigger className="h-10 bg-zinc-900 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {["NSE", "BSE", "NFO", "BFO", "MCX", "CDS", "NCDEX"].map(ex => (
                          <SelectItem key={ex} value={ex} className="text-sm text-zinc-200">{ex}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Order Type" hint="MIS = Intraday, CNC = Delivery, BTST = Buy Today Sell Tomorrow">
                    <ChoiceGroup
                      value={form.orderProduct} onChange={v => set("orderProduct", v)} size="sm"
                      options={[
                        { v: "MIS",  l: "MIS",  sub: "Intraday" },
                        { v: "CNC",  l: "CNC",  sub: "Delivery" },
                        { v: "BTST", l: "BTST", sub: "Buy-Today-Sell-Tomorrow" },
                        { v: "NRML", l: "NRML", sub: "F&O Carry" },
                      ]}
                    />
                  </Field>
                </Row>

                <SectionTitle>Transaction Direction</SectionTitle>
                <Field label="Which way does this strategy trade?">
                  <ChoiceGroup
                    value={form.direction} onChange={v => set("direction", v)}
                    options={[
                      { v: "LONG",  l: "Long (Buy)",    sub: "Buy → expect price to rise" },
                      { v: "SHORT", l: "Short (Sell)",  sub: "Sell → expect price to fall" },
                      { v: "BOTH",  l: "Both",          sub: "Buy & Sell signals" },
                    ]}
                  />
                </Field>
              </>
            )}

            {/* ── Step 1: Instruments ─────────────────────────────────────── */}
            {step === 1 && (
              <>
                <SectionTitle>Symbol selection</SectionTitle>
                <Field
                  label="Instruments"
                  hint={
                    symbolCount > 0
                      ? `${symbolCount} symbol(s) — search picks validated market tickers; connect broker to verify against your account before deploy.`
                      : "Optional — leave empty to choose symbol when you deploy / execute (same as typical algo platforms)."
                  }
                >
                  <InstrumentSymbolPicker
                    symbolCsv={form.symbol}
                    onSymbolCsvChange={(v) => set("symbol", v)}
                    preferredExchange={form.exchange}
                    onExchangeSync={(ex) => set("exchange", ex)}
                  />
                </Field>

                <SectionTitle>Position Sizing</SectionTitle>
                <Row>
                  <Field label="Lot Size / Quantity" hint="Number of lots (futures/options) or shares (equity)">
                    <Input type="number" min="1" value={form.lotSize}
                      onChange={e => set("lotSize", Number(e.target.value || 1))}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                </Row>

                {(form.instrumentType === "futures" || form.instrumentType === "options") && (
                  <>
                    <SectionTitle>Derivatives Settings</SectionTitle>
                    <Field label="Expiry Type">
                      <ChoiceGroup
                        value={form.expiryType} onChange={v => set("expiryType", v)}
                        options={[
                          { v: "weekly",  l: "Weekly",  sub: "Nearest weekly expiry" },
                          { v: "monthly", l: "Monthly", sub: "Current month expiry" },
                        ]}
                      />
                    </Field>

                    {form.instrumentType === "options" && (
                      <Field label="Strike Selection" hint="ATM = At the Money, ITM = In the Money, OTM = Out of the Money">
                        <ChoiceGroup
                          value={form.strikeType} onChange={v => set("strikeType", v)}
                          options={[
                            { v: "ITM_2", l: "ITM 2",  sub: "Deep in the money" },
                            { v: "ITM_1", l: "ITM 1",  sub: "1 strike ITM" },
                            { v: "ATM",   l: "ATM",    sub: "At the money" },
                            { v: "OTM_1", l: "OTM 1",  sub: "1 strike OTM" },
                            { v: "OTM_2", l: "OTM 2",  sub: "Deep out of money" },
                          ]}
                        />
                      </Field>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Step 2: Timing ──────────────────────────────────────────── */}
            {step === 2 && (
              <>
                <SectionTitle>Session Hours (IST)</SectionTitle>
                <Row>
                  <Field label="Start Time" hint="Strategy activates from this time">
                    <Input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                  <Field label="End Time" hint="No new entries after this time">
                    <Input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                  <Field label="Squareoff Time" hint="Force-close all positions at this time">
                    <Input type="time" value={form.squareoffTime} onChange={e => set("squareoffTime", e.target.value)}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                </Row>

                <SectionTitle>Execution Days</SectionTitle>
                <div className="flex flex-wrap gap-3">
                  {DAY_LABELS.map(d => (
                    <label key={d.v} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.executionDays.includes(d.v)}
                        onCheckedChange={() => set("executionDays", (() => {
                          const s = new Set(form.executionDays);
                          if (s.has(d.v)) s.delete(d.v); else s.add(d.v);
                          return Array.from(s).sort((a, b) => a - b);
                        })())}
                        className="border-zinc-600"
                      />
                      <span className="text-sm text-zinc-300 font-medium">{d.l}</span>
                    </label>
                  ))}
                </div>

                <SectionTitle>Chart Settings</SectionTitle>
                <Row>
                  <Field label="Chart Interval" hint="Candle time frame for signal detection">
                    <Select value={form.chartInterval} onValueChange={v => set("chartInterval", v as ChartConfig["interval"])}>
                      <SelectTrigger className="h-10 bg-zinc-900 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"].map(i => (
                          <SelectItem key={i} value={i} className="text-sm text-zinc-200">{i}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Chart Type">
                    <Select value={form.chartType} onValueChange={v => set("chartType", v as ChartConfig["chartType"])}>
                      <SelectTrigger className="h-10 bg-zinc-900 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="candlestick" className="text-sm text-zinc-200">Candlestick</SelectItem>
                        <SelectItem value="heikin_ashi" className="text-sm text-zinc-200">Heikin Ashi</SelectItem>
                        <SelectItem value="line" className="text-sm text-zinc-200">Line</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </Row>
              </>
            )}

            {/* ── Step 3: Entry Conditions ────────────────────────────────── */}
            {step === 3 && (
              <>
                <SectionTitle>Entry Conditions</SectionTitle>

                {form.strategyType === "time_based" || form.strategyType === "hybrid" ? (
                  <Field label="Entry Time" hint="Strategy places an order at exactly this time each day">
                    <Input type="time" value={form.entryTime} onChange={e => set("entryTime", e.target.value)}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-xs" />
                  </Field>
                ) : null}

                {(form.strategyType === "indicator_based" || form.strategyType === "hybrid") && (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-sm font-semibold text-zinc-300">Builder Mode</p>
                      <ChoiceGroup
                        value={form.entryConditions.mode}
                        onChange={v => set("entryConditions", { ...form.entryConditions, mode: v })}
                        size="sm"
                        options={[
                          { v: "visual", l: "Visual Builder", sub: "Click to build conditions" },
                          { v: "raw",    l: "Expression Editor", sub: "Write formula manually" },
                        ]}
                      />
                    </div>

                    {form.entryConditions.mode === "visual" ? (
                      <ConditionBuilder
                        groups={form.entryConditions.groups}
                        groupLogic={form.entryConditions.groupLogic}
                        onGroups={g => set("entryConditions", { ...form.entryConditions, groups: g })}
                        onGroupLogic={v => set("entryConditions", { ...form.entryConditions, groupLogic: v })}
                      />
                    ) : (
                      <Field label="Entry Expression"
                        hint="Use: RSI(14) < 30 | EMA(50) > EMA(200) | MACD > MACD_SIGNAL | AND / OR">
                        <Textarea
                          value={form.entryConditions.rawExpression}
                          onChange={e => set("entryConditions", { ...form.entryConditions, rawExpression: e.target.value })}
                          className="min-h-[160px] bg-zinc-900 border-zinc-700 text-sm font-mono"
                          placeholder={`EMA(50) > EMA(200)\nAND RSI(14) > 55\nAND MACD > MACD_SIGNAL`}
                        />
                      </Field>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Step 4: Exit Conditions ─────────────────────────────────── */}
            {step === 4 && (
              <>
                {(form.strategyType === "time_based" || form.strategyType === "hybrid") && (
                  <>
                    <SectionTitle>Scheduled exit (clock)</SectionTitle>
                    <Field
                      label="Exit clock time"
                      hint="Close / flatten at this wall-clock time each session (scans: IST for Indian markets, UTC for global symbols)."
                    >
                      <Input
                        type="time"
                        value={form.exitClockTime}
                        onChange={(e) => set("exitClockTime", e.target.value)}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-xs"
                      />
                    </Field>
                  </>
                )}

                <SectionTitle>Take Profit & Stop Loss</SectionTitle>
                <Row>
                  <Field label="Take Profit %" hint="Close trade when price moves this much in profit">
                    <div className="relative">
                      <Input type="number" min="0.1" step="0.1" value={form.takeProfitPct}
                        onChange={e => set("takeProfitPct", Number(e.target.value || 0))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-base text-green-400 font-bold pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                  <Field label="Stop Loss %" hint="Close trade when price moves this much against position">
                    <div className="relative">
                      <Input type="number" min="0.1" step="0.1" value={form.stopLossPct}
                        onChange={e => set("stopLossPct", Number(e.target.value || 0))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-base text-red-400 font-bold pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                  <Field label="Trailing Stop %" hint="Trail the stop-loss as price moves in your favour">
                    <div className="relative">
                      <Input type="number" min="0.1" step="0.1" value={form.trailingStopPct}
                        onChange={e => set("trailingStopPct", Number(e.target.value || 0))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-base pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                </Row>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={form.trailingStop} onCheckedChange={v => set("trailingStop", v)} />
                    <span className="text-sm text-zinc-300">Enable trailing stop-loss</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={form.timeBasedExit} onCheckedChange={v => set("timeBasedExit", v)} />
                    <span className="text-sm text-zinc-300">Force-exit after time</span>
                  </label>
                </div>

                {form.timeBasedExit && (
                  <Field label="Force-exit after (minutes)" hint="Close position forcefully N minutes after entry">
                    <Input type="number" min="1" value={form.exitAfterMinutes}
                      onChange={e => set("exitAfterMinutes", Number(e.target.value || 1))}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-xs" />
                  </Field>
                )}

                <SectionTitle>Indicator-Based Exit (Optional)</SectionTitle>
                <p className="text-xs text-zinc-500 -mt-2 mb-2">Define conditions that trigger an exit signal — e.g. EMA crossover reversal. Leave empty to use only TP/SL.</p>
                <ConditionBuilder
                  groups={form.exitIndicatorGroups}
                  groupLogic="AND"
                  onGroups={g => set("exitIndicatorGroups", g)}
                  onGroupLogic={() => {}}
                />
              </>
            )}

            {/* ── Step 5: Position Builder ────────────────────────────────── */}
            {step === 5 && (
              <>
                <SectionTitle>Order Placement</SectionTitle>
                <Field label="Order Execution Type" hint="MARKET = execute at current price. LIMIT = set a specific price.">
                  <ChoiceGroup
                    value={form.orderType} onChange={v => set("orderType", v)}
                    options={[
                      { v: "MARKET",     l: "Market",     sub: "Execute at best available price" },
                      { v: "LIMIT",      l: "Limit",      sub: "Wait for specified price" },
                      { v: "STOP",       l: "Stop",       sub: "Trigger when price hits level" },
                      { v: "STOP_LIMIT", l: "Stop-Limit", sub: "Stop + limit combined" },
                    ]}
                  />
                </Field>

                {(form.orderType === "LIMIT" || form.orderType === "STOP_LIMIT") && (
                  <Field label="Limit Offset %" hint="% below market for BUY limit orders, % above for SELL">
                    <div className="relative max-w-xs">
                      <Input type="number" min="0" step="0.05" value={form.limitOffsetPct}
                        onChange={e => set("limitOffsetPct", Number(e.target.value || 0))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                )}

                <SectionTitle>Position Sizing</SectionTitle>
                <Field label="Sizing Mode" hint="How position size is calculated each trade">
                  <ChoiceGroup
                    value={form.sizingMode} onChange={v => set("sizingMode", v)}
                    options={[
                      { v: "fixed_qty",   l: "Fixed Qty",   sub: "Always use the lot size above" },
                      { v: "risk_based",  l: "Risk-Based",  sub: "Size based on max-risk % of capital" },
                      { v: "capital_pct", l: "Capital %",   sub: "Use N% of available capital" },
                    ]}
                  />
                </Field>

                {form.sizingMode === "capital_pct" && (
                  <Field label="Capital per trade %" hint="% of total capital to deploy per trade">
                    <div className="relative max-w-xs">
                      <Input type="number" min="1" max="100" value={form.capitalPct}
                        onChange={e => set("capitalPct", Number(e.target.value || 1))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                )}
              </>
            )}

            {/* ── Step 6: Risk Rules ──────────────────────────────────────── */}
            {step === 6 && (
              <>
                <SectionTitle>Per-Trade Limits</SectionTitle>
                <Row>
                  <Field label="Max Risk Per Trade %" hint="Maximum % of capital to risk per single trade">
                    <div className="relative">
                      <Input type="number" min="0.1" step="0.1" value={form.maxRiskPerTradePct}
                        onChange={e => set("maxRiskPerTradePct", Number(e.target.value || 0.1))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                  <Field label="Max Open Positions" hint="Stop taking new trades after this many are open">
                    <Input type="number" min="1" value={form.maxOpenPositions}
                      onChange={e => set("maxOpenPositions", Number(e.target.value || 1))}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                </Row>

                <SectionTitle>Daily Limits</SectionTitle>
                <Row>
                  <Field label="Max Daily Loss %" hint="Stop all new trades for the day after this loss">
                    <div className="relative">
                      <Input type="number" min="0.1" step="0.1" value={form.maxDailyLossPct}
                        onChange={e => set("maxDailyLossPct", Number(e.target.value || 0.1))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                  <Field label="Capital Allocation %" hint="Max % of total portfolio allocated to this strategy">
                    <div className="relative">
                      <Input type="number" min="1" max="100" value={form.capitalAllocationPct}
                        onChange={e => set("capitalAllocationPct", Number(e.target.value || 1))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                </Row>
              </>
            )}
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-start px-5 py-3 border-t border-zinc-800 shrink-0 bg-zinc-950 gap-10">
          <p className="text-xs text-zinc-600">Step {step + 1} of {STEPS.length} — {STEPS[step].title}</p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" className="h-9 px-4 border-zinc-700 text-zinc-200"
              onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || saving}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" className="h-9 px-5 bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>
                Next
              </Button>
            ) : (
              <Button type="button" className="h-9 px-5 bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isEdit ? "Update Strategy" : "Create Strategy"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
