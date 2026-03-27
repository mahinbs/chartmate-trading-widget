/**
 * Post-analysis: multi-strategy library entry & exit scan + AI probability / verdict.
 * Scans BOTH BUY (entry) and SELL (exit) simultaneously so users can see all opportunities.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import { Loader2, Sparkles, Target, History, ChevronLeft, ChevronRight, Clock3, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LiveEntryTrackingSection } from "@/components/prediction/LiveEntryTrackingSection";

export interface PostAnalysisContext {
  result?: string;
  actualChangePercent?: number;
  predictedDirection?: string | null;
}

export interface StrategyEntrySignalsPanelProps {
  symbol: string;
  postAnalysis?: PostAnalysisContext | null;
  /** Only show when user has run post-analysis (recommended) */
  requirePostAnalysis?: boolean;
  /** Optional deep-link history id to open full saved scan detail */
  initialHistoryId?: string | null;
}

type SignalRow = {
  strategyId: string;
  strategyLabel: string;
  entryDate: string;
  entryTime?: string;
  entryTimestamp?: number | null;
  side: string;
  priceAtEntry: number;
  probabilityScore: number;
  verdict: string;
  rationale: string;
  entryExitRuleSummary?: string;
  whyThisScore?: string;
  liveViability?: string;
  rejectionDetail?: string;
  confirmationDetail?: string;
  scoreSource?: string;
  isLive?: boolean;
  isPredicted?: boolean;
  marketData?: {
    rsi14?: number | null;
    sma20?: number | null;
    high20?: number | null;
    low20?: number | null;
    dataSource?: string;
    indicatorSource?: string;
  } | null;
  /** Server time when this row was scored (same for all signals in one scan). */
  scanEvaluatedAt?: string;
  ohlcvPipeline?: string;
  indicatorPipeline?: string;
  /** follow_through | adverse_first | mixed | pending | unknown */
  simpleOutcomeLabel?: string;
  simpleOutcomeNote?: string;
  forwardProbeBars?: number;
  forwardMaxFavorablePct?: number | null;
  forwardMaxAdversePct?: number | null;
  conditionAudit?: {
    kind: string;
    overallMatch: boolean;
    lines?: Array<{ ok: boolean; label: string }>;
    snapshot?: Record<string, unknown>;
  } | null;
};

const HISTORY_LIST_PAGE_SIZE = 25;
const DETAIL_SIGNALS_PAGE_SIZE = 12;
/** Main scanner card grid — paginate so tall cards don’t bury controls */
const MAIN_SIGNALS_PAGE_SIZE = 8;

type CustomStrategy = {
  id: string;
  name: string;
  description: string | null;
  trading_mode: string;
  is_intraday: boolean;
  stop_loss_pct: number;
  take_profit_pct: number;
  paper_strategy_type?: string | null;
  entry_conditions?: Record<string, unknown> | null;
  exit_conditions?: Record<string, unknown> | null;
  position_config?: Record<string, unknown> | null;
  risk_config?: Record<string, unknown> | null;
  chart_config?: Record<string, unknown> | null;
  execution_days?: number[] | null;
  market_type?: string | null;
};

type ExistingScheduleRow = {
  id: string;
  symbol: string;
  timezone: string;
  notify_time: string;
  enabled: boolean;
  schedule_mode: string;
  selected_strategies?: string[];
  selected_custom_strategy_ids?: string[];
  days_of_week?: number[];
  one_off_local_date?: string | null;
  last_digest_on?: string | null;
};

const DAY_LABELS: { bit: number; label: string }[] = [
  { bit: 0, label: "Sun" },
  { bit: 1, label: "Mon" },
  { bit: 2, label: "Tue" },
  { bit: 3, label: "Wed" },
  { bit: 4, label: "Thu" },
  { bit: 5, label: "Fri" },
  { bit: 6, label: "Sat" },
];

function SignalAnalysisCard(props: {
  row: SignalRow;
  todayKey: string;
  formatEntry: (row: SignalRow) => string;
  formatEntryWithZone: (row: SignalRow) => string;
  formatMarketData: (row: SignalRow) => string;
  sideLabel: (side: string) => string;
  sideClass: (side: string) => string;
  verdictVariant: (v: string) => "default" | "destructive" | "secondary";
  compactZone?: boolean;
}) {
  const {
    row,
    todayKey,
    formatEntry,
    formatEntryWithZone,
    formatMarketData,
    sideLabel,
    sideClass,
    verdictVariant,
    compactZone,
  } = props;
  const isPast = !row.isLive && row.entryDate !== todayKey;
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        row.verdict === "reject"
          ? "border-red-500/40 bg-red-950/25"
          : row.isLive
          ? "border-teal-500/35 bg-teal-950/20"
          : row.entryDate === todayKey
          ? "border-teal-500/20 bg-black/35"
          : "border-white/10 bg-black/25"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {row.isLive ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-500/35 text-teal-200 rounded px-2 py-0.5">
                Live
              </span>
            ) : null}
            {isPast ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Past</span>
            ) : null}
            {!row.isLive && row.entryDate === todayKey ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-400/90">Today</span>
            ) : null}
            <h3 className="text-base font-semibold text-white leading-tight">{row.strategyLabel}</h3>
          </div>
          <p className={`text-sm font-medium ${sideClass(row.side)}`}>{sideLabel(row.side)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold tabular-nums text-teal-300">{row.probabilityScore}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Score</p>
          <Badge variant={verdictVariant(row.verdict)} className="mt-1.5 text-xs font-semibold capitalize">
            {row.verdict}
          </Badge>
        </div>
      </div>

      <div className="grid gap-1 text-sm text-zinc-300">
        <p>
          <span className="text-zinc-500 font-medium">When: </span>
          <span className="font-mono text-zinc-200">{compactZone ? formatEntry(row) : formatEntryWithZone(row)}</span>
        </p>
        <p>
          <span className="text-zinc-500 font-medium">Price: </span>
          <span className="font-mono text-white">{row.priceAtEntry?.toFixed?.(2) ?? row.priceAtEntry}</span>
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          <span className="text-zinc-500 font-medium">Bar context: </span>
          {formatMarketData(row)}
        </p>
        {row.scoreSource ? (
          <p className="text-[11px] text-zinc-600">
            Score mix: <span className="text-zinc-500">{row.scoreSource}</span>
          </p>
        ) : null}
        {row.scanEvaluatedAt ? (
          <p className="text-[11px] text-zinc-500">
            <span className="font-medium text-zinc-600">Scored at: </span>
            {new Date(row.scanEvaluatedAt).toLocaleString([], {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        ) : null}
        {row.ohlcvPipeline || row.indicatorPipeline ? (
          <p className="text-[11px] text-zinc-600 leading-snug">
            <span className="font-medium text-zinc-600">Feeds this row: </span>
            OHLCV <span className="text-zinc-500">{row.ohlcvPipeline ?? "—"}</span>
            {" · "}Indicators <span className="text-zinc-500">{row.indicatorPipeline ?? "—"}</span>
          </p>
        ) : null}
      </div>

      {row.simpleOutcomeLabel &&
      row.simpleOutcomeLabel !== "pending" &&
      row.simpleOutcomeLabel !== "unknown" &&
      row.simpleOutcomeNote ? (
        <div className="rounded-lg border border-zinc-600/40 bg-zinc-900/40 p-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">After signal (same chart series)</p>
          <p className="text-sm text-zinc-200 leading-relaxed">{row.simpleOutcomeNote}</p>
          {row.forwardMaxFavorablePct != null && row.forwardMaxAdversePct != null ? (
            <p className="text-[11px] text-zinc-500">
              Max favorable ≈ {row.forwardMaxFavorablePct}% · Max adverse ≈ {row.forwardMaxAdversePct}% over{" "}
              {row.forwardProbeBars ?? "?"} bars — not a full trade result.
            </p>
          ) : null}
        </div>
      ) : row.simpleOutcomeLabel === "pending" && row.simpleOutcomeNote ? (
        <p className="text-xs text-zinc-500 leading-relaxed">{row.simpleOutcomeNote}</p>
      ) : null}

      {row.conditionAudit && row.conditionAudit.lines && row.conditionAudit.lines.length > 0 ? (
        <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-purple-300">
            Strategy conditions (this bar, engine-checked)
          </p>
          <p className="text-[11px] text-zinc-500">
            Kind: <span className="text-zinc-400 font-mono">{row.conditionAudit.kind}</span>
            {" · "}
            Stack:{" "}
            <span className={row.conditionAudit.overallMatch ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
              {row.conditionAudit.overallMatch ? "all required checks passed" : "check log below"}
            </span>
          </p>
          <ul className="space-y-1.5 text-sm leading-snug">
            {row.conditionAudit.lines.map((ln, j) => (
              <li
                key={j}
                className={`font-mono text-[13px] pl-2 border-l-2 ${
                  ln.ok ? "border-emerald-500/60 text-emerald-100/95" : "border-red-500/60 text-red-200/90"
                }`}
              >
                {ln.label}
              </li>
            ))}
          </ul>
          {row.conditionAudit.snapshot && Object.keys(row.conditionAudit.snapshot).length > 0 ? (
            <div className="pt-2 border-t border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">Values at bar</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono text-zinc-400">
                {Object.entries(row.conditionAudit.snapshot).map(([k, v]) => (
                  <span key={k} className="truncate" title={`${k}: ${String(v)}`}>
                    <span className="text-zinc-600">{k}</span>={String(v)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {row.entryExitRuleSummary ? (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Rule / setup</p>
          <p className="text-sm text-zinc-100 leading-relaxed font-medium">{row.entryExitRuleSummary}</p>
        </div>
      ) : null}

      {row.whyThisScore ? (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Why this score</p>
          <p className="text-sm text-zinc-200 leading-relaxed">{row.whyThisScore}</p>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Full rationale</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{row.rationale || "—"}</p>
      </div>

      {row.isLive && row.liveViability ? (
        <div className="rounded-lg border border-teal-500/25 bg-teal-950/15 p-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-teal-400/90">Why live could work (or break)</p>
          <p className="text-sm text-teal-100/90 leading-relaxed">{row.liveViability}</p>
        </div>
      ) : null}

      {(row.verdict === "reject" || row.verdict === "review") && (row.rejectionDetail || row.rationale) ? (
        <div
          className={`rounded-lg border p-3 space-y-1 ${
            row.verdict === "reject" ? "border-red-500/30 bg-red-950/20" : "border-amber-500/25 bg-amber-950/15"
          }`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              row.verdict === "reject" ? "text-red-300" : "text-amber-200/90"
            }`}
          >
            {row.verdict === "reject" ? "Rejected — detail" : "Review — why not a hard confirm"}
          </p>
          <p className="text-sm text-zinc-200 leading-relaxed">{row.rejectionDetail || row.rationale}</p>
        </div>
      ) : null}

      {row.verdict === "confirm" ? (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 p-3 space-y-1">
          {row.confirmationDetail?.trim() || row.whyThisScore ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Why confirmed</p>
              <p className="text-sm text-emerald-50/95 leading-relaxed">
                {row.confirmationDetail?.trim() || row.whyThisScore}
              </p>
            </>
          ) : null}
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Gap, liquidity, and headline risk still apply — size positions and use stops.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function timeInputValueFromDb(t: string | undefined): string {
  if (!t) return "09:30";
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return "09:30";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function dbTimeFromInput(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return "09:30:00";
  return `${m[1].padStart(2, "0")}:${m[2]}:00`;
}

function formatDateKeyInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const da = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${mo}-${da}`;
}

function getTomorrowDateKeyInTz(tz: string): string {
  const now = new Date();
  const today = formatDateKeyInTz(now, tz);
  let t = now.getTime();
  for (let step = 0; step < 72; step++) {
    t += 3600000;
    const k = formatDateKeyInTz(new Date(t), tz);
    if (k !== today) return k;
  }
  return formatDateKeyInTz(new Date(now.getTime() + 36 * 3600000), tz);
}

type HistoryItem = {
  id: string;
  symbol: string;
  scan_started_at: string;
  scan_completed_at: string;
  signal_count: number;
  live_count: number;
  predicted_count: number;
  data_source?: string | null;
  indicator_source?: string | null;
  asset_type?: string | null;
  created_at: string;
};

type HistoryDetail = {
  id: string;
  symbol: string;
  scan_started_at: string;
  scan_completed_at: string;
  signal_count: number;
  live_count: number;
  predicted_count: number;
  data_source?: string | null;
  indicator_source?: string | null;
  interval?: string | null;
  signals: SignalRow[];
};

export function StrategyEntrySignalsPanel({
  symbol,
  postAnalysis,
  requirePostAnalysis = false,
  initialHistoryId = null,
}: StrategyEntrySignalsPanelProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["trend_following", "mean_reversion", "momentum"]),
  );
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [marketStatus, setMarketStatus] = useState<any>(null);
  const [scanMeta, setScanMeta] = useState<{
    dataSource?: string;
    indicatorSource?: string;
    assetType?: string;
    lookbackDaysUsed?: number;
  } | null>(null);
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
  const [selectedCustom, setSelectedCustom] = useState<Set<string>>(new Set());
  const [nowMs, setNowMs] = useState(Date.now());
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
  const [historySignalPage, setHistorySignalPage] = useState(1);
  const [mainResultsPage, setMainResultsPage] = useState(1);
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState<HistoryItem | null>(null);
  const [historyDeleting, setHistoryDeleting] = useState(false);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [pendingHistoryId, setPendingHistoryId] = useState<string | null>(initialHistoryId);
  const [entryAlarmsOpen, setEntryAlarmsOpen] = useState(false);
  const [scheduleTab, setScheduleTab] = useState<"create" | "existing">("create");
  const [existingSchedules, setExistingSchedules] = useState<ExistingScheduleRow[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Fetch market status
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("get-market-status", { body: { symbol } });
        if (!cancelled) setMarketStatus(data ?? null);
      } catch {
        if (!cancelled) setMarketStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  // Fetch user's custom strategies
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await supabase.functions.invoke("manage-strategy", {
          body: { action: "list" },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.error) throw new Error(res.error.message);
        const data = (res.data as { strategies?: CustomStrategy[] } | null)?.strategies ?? [];
        if (!cancelled) {
          setCustomStrategies(data);
          setSelectedCustom((prev) => {
            if (prev.size > 0) return prev;
            return new Set(data.map((d) => d.id));
          });
        }
      } catch (e: unknown) {
        if (!cancelled) {
          toast({
            title: "Could not load custom strategies",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  // Keep LIVE window fresh as time moves.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const fetchHistoryList = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke("strategy-scan-history", {
        body: { action: "list", page, pageSize: HISTORY_LIST_PAGE_SIZE },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { items?: HistoryItem[]; totalPages?: number; page?: number; error?: string };
      if (payload?.error) throw new Error(String(payload.error));
      setHistoryItems(Array.isArray(payload?.items) ? payload.items : []);
      setHistoryTotalPages(Math.max(1, Number(payload?.totalPages) || 1));
      setHistoryPage(Math.max(1, Number(payload?.page) || page));
    } catch {
      setHistoryItems([]);
      setHistoryTotalPages(1);
      setHistoryPage(1);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const confirmDeleteHistoryScan = useCallback(async () => {
    if (!historyDeleteTarget) return;
    const delId = historyDeleteTarget.id;
    const delSymbol = historyDeleteTarget.symbol;
    setHistoryDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke("strategy-scan-history", {
        body: { action: "delete", id: delId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { error?: string; ok?: boolean };
      if (payload?.error) throw new Error(payload.error);
      if (historyDetail?.id === delId) {
        setHistoryOpen(false);
        setHistoryDetail(null);
      }
      setHistoryDeleteTarget(null);
      toast({ title: "Scan removed", description: `${delSymbol} · snapshot deleted.` });
      setHistoryPage(1);
      await fetchHistoryList(1);
    } catch (e: unknown) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setHistoryDeleting(false);
    }
  }, [historyDeleteTarget, historyDetail, toast, fetchHistoryList]);

  const openHistoryDetail = useCallback(async (id: string) => {
    setHistoryDetailLoading(true);
    setHistoryOpen(true);
    setHistorySignalPage(1);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke("strategy-scan-history", {
        body: { action: "detail", id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { item?: HistoryDetail };
      setHistoryDetail(payload?.item ?? null);
    } catch {
      setHistoryDetail(null);
      toast({ title: "Could not load history details", variant: "destructive" });
    } finally {
      setHistoryDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (initialHistoryId) setPendingHistoryId(initialHistoryId);
  }, [initialHistoryId]);

  useEffect(() => {
    if (!pendingHistoryId) return;
    void openHistoryDetail(pendingHistoryId);
    setPendingHistoryId(null);
  }, [pendingHistoryId, openHistoryDetail]);

  useEffect(() => {
    fetchHistoryList(1);
  }, [fetchHistoryList]);

  const marketNote = useMemo(() => {
    if (!marketStatus) return "Scans intraday candles (with daily fallback) for both entry & exit points.";
    const qt = (marketStatus?.quoteType ?? "").toString().toUpperCase();
    if (qt === "CRYPTOCURRENCY") return "Crypto runs 24/7 — intraday timestamps are live.";
    if (qt === "FOREX" || qt === "CURRENCY") return "FX runs 24/5 — intraday timestamps are live.";
    if (marketStatus?.isRegularOpen) return "Market is open — using intraday candles for real-time entry & exit detection.";
    return "Market is closed — using recent intraday candles for last valid entry & exit points.";
  }, [marketStatus]);

  const toggle = (value: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(value)) n.delete(value);
      else n.add(value);
      return n;
    });
  };

  const toggleCustom = (id: string) => {
    setSelectedCustom((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const loadExistingSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await (supabase as any)
        .from("live_entry_trackers")
        .select("id,symbol,timezone,notify_time,enabled,schedule_mode,selected_strategies,selected_custom_strategy_ids,days_of_week,one_off_local_date,last_digest_on")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setExistingSchedules((data as ExistingScheduleRow[]) ?? []);
    } catch (e: unknown) {
      toast({
        title: "Could not load schedules",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSchedulesLoading(false);
    }
  }, [toast]);

  const removeExistingSchedule = useCallback(async (id: string) => {
    setDeletingScheduleId(id);
    try {
      const { error } = await (supabase as any).from("live_entry_trackers").delete().eq("id", id);
      if (error) throw error;
      setExistingSchedules((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Schedule removed" });
    } catch (e: unknown) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingScheduleId(null);
    }
  }, [toast]);

  const applyCurrentStrategySelectionToSchedule = useCallback(async (id: string) => {
    try {
      const payload = {
        selected_strategies: selected.size > 0
          ? Array.from(selected)
          : ["trend_following", "mean_reversion", "momentum"],
        selected_custom_strategy_ids: Array.from(selectedCustom),
      };
      const { error } = await (supabase as any).from("live_entry_trackers").update(payload).eq("id", id);
      if (error) throw error;
      setExistingSchedules((prev) => prev.map((r) => (r.id === id ? { ...r, ...payload } : r)));
      toast({ title: "Schedule updated", description: "Strategy selection saved." });
    } catch (e: unknown) {
      toast({
        title: "Could not update schedule",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [selected, selectedCustom, toast]);

  const updateExistingSchedule = useCallback(async (
    id: string,
    patch: Partial<{
      notify_time: string;
      schedule_mode: string;
      days_of_week: number[];
      enabled: boolean;
      one_off_local_date: string | null;
    }>,
  ) => {
    try {
      // Reset last_digest_on so updated schedule can still fire today if time window is upcoming.
      const fullPatch = { ...patch, last_digest_on: null };
      const { error } = await (supabase as any).from("live_entry_trackers").update(fullPatch).eq("id", id);
      if (error) throw error;
      setExistingSchedules((prev) => prev.map((r) => (r.id === id ? { ...r, ...fullPatch } : r)));
    } catch (e: unknown) {
      toast({
        title: "Could not update schedule",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [toast]);

  const toggleExistingDay = useCallback((id: string, bit: number, selectedDays: number[]) => {
    const set = new Set(selectedDays ?? []);
    if (set.has(bit)) set.delete(bit);
    else set.add(bit);
    void updateExistingSchedule(id, { days_of_week: Array.from(set).sort((a, b) => a - b) });
  }, [updateExistingSchedule]);

  useEffect(() => {
    if (entryAlarmsOpen) void loadExistingSchedules();
  }, [entryAlarmsOpen, loadExistingSchedules]);
  const selectAllBuiltIn = () => setSelected(new Set(STRATEGIES.map((s) => s.value)));
  const clearBuiltIn = () => setSelected(new Set());
  const selectAllCustom = () => setSelectedCustom(new Set(customStrategies.map((cs) => cs.id)));
  const clearCustom = () => setSelectedCustom(new Set());

  const runScan = useCallback(async () => {
    if (!symbol.trim()) return;
    if (selected.size === 0 && selectedCustom.size === 0) {
      toast({ title: "Pick at least one strategy", variant: "destructive" });
      return;
    }
    if (requirePostAnalysis && !postAnalysis?.result) {
      toast({
        title: "Run post-analysis first",
        description: "This scan works best after probability outcome is available.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setSignals([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in required");

      // Build custom strategy configs for the edge function
      const customConfigs = customStrategies
        .filter((cs) => selectedCustom.has(cs.id))
        .map((cs) => ({
          id: `custom_${cs.id}`,
          name: cs.name,
          baseType: cs.paper_strategy_type || "trend_following",
          tradingMode: cs.trading_mode,
          stopLossPct: cs.stop_loss_pct,
          takeProfitPct: cs.take_profit_pct,
          isIntraday: cs.is_intraday,
          entryConditions: cs.entry_conditions ?? null,
          exitConditions: cs.exit_conditions ?? null,
          positionConfig: cs.position_config ?? null,
          riskConfig: cs.risk_config ?? null,
          chartConfig: cs.chart_config ?? null,
          executionDays: Array.isArray(cs.execution_days) ? cs.execution_days : [],
          marketType: cs.market_type ?? "stocks",
        }));

      const { data, error } = await supabase.functions.invoke("strategy-entry-signals", {
        body: {
          symbol: symbol.trim(),
          strategies: Array.from(selected),
          customStrategies: customConfigs,
          action: "BOTH",
          days: 365,
          preferIntraday: true,
          intradayInterval: "5m",
          intradayLookbackMinutes: 5 * 24 * 60,
          postAnalysis: postAnalysis?.result
            ? {
                result: postAnalysis.result,
                actualChangePercent: postAnalysis.actualChangePercent,
                predictedDirection: postAnalysis.predictedDirection ?? undefined,
              }
            : undefined,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw new Error(error.message);
      const err = (data as any)?.error;
      if (err) throw new Error(String(err));

      const list = Array.isArray((data as any)?.signals) ? (data as any).signals as SignalRow[] : [];
      setSignals(list);
      setScanMeta({
        dataSource: (data as any)?.dataSource,
        indicatorSource: (data as any)?.indicatorSource,
        assetType: (data as any)?.assetType,
        lookbackDaysUsed: typeof (data as any)?.lookbackDaysUsed === "number" ? (data as any).lookbackDaysUsed : undefined,
      });

      const live = list.filter((s) => s.isLive);
      const todaysCount = list.filter((s) => s.entryDate === todayKey).length;
      const historical = list.filter((s) => !s.isLive && s.entryDate !== todayKey).length;

      if (!list.length) {
        toast({ title: "No signals found", description: "Try selecting more strategies or check the symbol." });
      } else {
        const parts: string[] = [];
        if (live.length) parts.push(`${live.length} live`);
        if (todaysCount) parts.push(`${todaysCount} today`);
        if (historical > 0) parts.push(`${historical} past`);
        toast({
          title: `${list.length} signals scored`,
          description: parts.join(" · ") || "Live and historical only (no projected entries).",
        });
      }
      fetchHistoryList(1);
    } catch (e: unknown) {
      toast({
        title: "Scan failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [symbol, selected, selectedCustom, customStrategies, postAnalysis, requirePostAnalysis, toast, todayKey, fetchHistoryList]);

  const verdictVariant = (v: string) => {
    if (v === "confirm") return "default" as const;
    if (v === "reject") return "destructive" as const;
    return "secondary" as const;
  };

  const sideLabel = (side: string) =>
    side === "BUY" ? "Entry (BUY)" : side === "SELL" ? "Exit (SELL)" : side;

  const sideClass = (side: string) =>
    side === "BUY"
      ? "text-emerald-400 font-semibold"
      : side === "SELL"
      ? "text-red-400 font-semibold"
      : "text-muted-foreground";

  const formatEntry = (row: SignalRow) => {
    const iso = row.entryTime || (row.entryTimestamp ? new Date(row.entryTimestamp).toISOString() : "");
    if (!iso) return row.entryDate;
    const dt = new Date(iso);
    if (row.entryTime && row.entryTime.length <= 10) return row.entryTime;
    return dt.toLocaleString([], {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    });
  };

  const formatEntryWithZone = (row: SignalRow) => {
    const iso = row.entryTime || (row.entryTimestamp ? new Date(row.entryTimestamp).toISOString() : "");
    if (!iso) return row.entryDate;
    const dt = new Date(iso);
    return `${dt.toLocaleString([], {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  };

  const formatMarketData = (row: SignalRow) => {
    const m = row.marketData;
    if (!m) return "n/a";
    const rsi = m.rsi14 != null ? `RSI ${m.rsi14}` : "RSI n/a";
    const sma = m.sma20 != null ? `SMA20 ${m.sma20}` : "SMA20 n/a";
    const h20 = m.high20 != null ? `H20 ${m.high20}` : "H20 n/a";
    const l20 = m.low20 != null ? `L20 ${m.low20}` : "L20 n/a";
    return `${rsi} · ${sma} · ${h20} · ${l20}`;
  };

  const applyDynamicStatus = useCallback((row: SignalRow): SignalRow => {
    const ts = row.entryTimestamp
      ? Number(row.entryTimestamp)
      : row.entryTime
      ? new Date(row.entryTime).getTime()
      : NaN;
    if (!Number.isFinite(ts)) return row;
    const fifteenMin = 15 * 60 * 1000;
    const isFuture = ts > nowMs;
    return {
      ...row,
      isPredicted: false,
      isLive: row.isLive ? !isFuture && nowMs - ts <= fifteenMin : false,
    };
  }, [nowMs]);

  const visibleSignals = useMemo(
    () => signals.map(applyDynamicStatus).filter((s) => !s.isPredicted),
    [signals, applyDynamicStatus],
  );

  useEffect(() => {
    setMainResultsPage(1);
  }, [signals]);

  const mainResultsTotalPages = Math.max(1, Math.ceil(visibleSignals.length / MAIN_SIGNALS_PAGE_SIZE));
  const effectiveMainPage = Math.min(mainResultsPage, mainResultsTotalPages);
  const pagedMainSignals = useMemo(() => {
    const start = (effectiveMainPage - 1) * MAIN_SIGNALS_PAGE_SIZE;
    return visibleSignals.slice(start, start + MAIN_SIGNALS_PAGE_SIZE);
  }, [visibleSignals, effectiveMainPage]);

  const counts = useMemo(() => {
    const live = visibleSignals.filter((s) => s.isLive);
    const todays = visibleSignals.filter((s) => s.entryDate === todayKey);
    const history = visibleSignals.filter((s) => !s.isLive && s.entryDate !== todayKey);
    return {
      total: visibleSignals.length,
      today: todays.length,
      live: live.length,
      history: history.length,
      buyTotal: visibleSignals.filter((s) => s.side === "BUY").length,
      sellTotal: visibleSignals.filter((s) => s.side === "SELL").length,
    };
  }, [visibleSignals, todayKey]);

  const historySignals = useMemo(
    () =>
      (historyDetail?.signals ?? [])
        .filter((s) => !s.isPredicted)
        .map(applyDynamicStatus),
    [historyDetail, applyDynamicStatus],
  );
  const historySignalTotalPages = Math.max(1, Math.ceil(historySignals.length / DETAIL_SIGNALS_PAGE_SIZE));
  const effectiveHistorySignalPage = Math.min(historySignalPage, historySignalTotalPages);
  const pagedHistorySignals = useMemo(() => {
    const start = (effectiveHistorySignalPage - 1) * DETAIL_SIGNALS_PAGE_SIZE;
    return historySignals.slice(start, start + DETAIL_SIGNALS_PAGE_SIZE);
  }, [historySignals, effectiveHistorySignalPage]);

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-teal-400 shrink-0" />
              Strategy scanner — live &amp; past signals
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Symbol: <span className="text-white/90 font-mono font-medium">{symbol}</span>
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We scan up to ~1 year of daily context (and intraday when available), detect{" "}
              <span className="text-emerald-400 font-medium">entry (BUY)</span> and{" "}
              <span className="text-red-400 font-medium">exit (SELL)</span> candidates, then score each with
              structured rules plus Gemini — with explicit reasons for confirm, review, and reject.
              No projected &quot;upcoming&quot; entries.
              {postAnalysis?.result ? " Your post-analysis outcome is included as extra context." : ""}
            </p>
            {marketNote ? <p className="text-xs text-muted-foreground mt-1">{marketNote}</p> : null}
            {scanMeta && (
              <p className="text-[11px] text-zinc-500 mt-1">
                Data: <span className="text-zinc-400">{scanMeta.dataSource ?? "yahoo"}</span>
                {" · "}Indicators: <span className="text-zinc-400">{scanMeta.indicatorSource ?? "computed"}</span>
                {" · "}Lookback:{" "}
                <span className="text-zinc-400">{scanMeta.lookbackDaysUsed != null ? `${scanMeta.lookbackDaysUsed}d` : "365d default"}</span>
                {" · "}AI: <span className="text-teal-400">Gemini + rule blend</span>
              </p>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-8 px-3 rounded-md border-teal-500/30 bg-black/40 text-teal-300 hover:bg-teal-500/10 hover:border-teal-400/50 text-xs"
                aria-label="Open schedule popup"
                onClick={() => setEntryAlarmsOpen(true)}
              >
                <Clock3 className="h-3.5 w-3.5 mr-1.5" />
                Schedule
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              Open schedule popup: create/edit and manage existing schedules.
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>

      <Sheet open={entryAlarmsOpen} onOpenChange={setEntryAlarmsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-4 pt-10">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-zinc-100">Schedule</SheetTitle>
            <SheetDescription className="text-zinc-400">
              Create a schedule for this symbol, or manage old schedules.
            </SheetDescription>
          </SheetHeader>

          <Tabs value={scheduleTab} onValueChange={(v) => setScheduleTab(v as "create" | "existing")} className="space-y-3">
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="create" className="text-xs data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300">
                Create schedule
              </TabsTrigger>
              <TabsTrigger value="existing" className="text-xs data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300">
                Existing schedules
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-0">
              <LiveEntryTrackingSection
                symbol={symbol}
                selectedBuiltInStrategies={Array.from(selected)}
                selectedCustomStrategyIds={Array.from(selectedCustom)}
              />
            </TabsContent>

            <TabsContent value="existing" className="mt-0">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                {schedulesLoading ? (
                  <p className="text-xs text-zinc-500">Loading schedules…</p>
                ) : existingSchedules.length === 0 ? (
                  <p className="text-xs text-zinc-500">No schedules created yet.</p>
                ) : (
                  existingSchedules.map((row) => (
                    <div key={row.id} className="rounded-md border border-white/10 p-2 space-y-2">
                      <div className="min-w-0">
                        <p className="text-xs text-white font-mono">{row.symbol}</p>
                        <p className="text-[11px] text-zinc-400">
                          {row.notify_time?.slice(0, 5)} · {row.timezone} · {row.schedule_mode}
                          {!row.enabled ? " · off" : ""}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Strategies: {(row.selected_strategies ?? []).length > 0
                            ? (row.selected_strategies ?? [])
                              .map((id) => STRATEGIES.find((s) => s.value === id)?.label ?? id)
                              .join(", ")
                            : "Default"}
                          {(row.selected_custom_strategy_ids ?? []).length > 0
                            ? ` · Custom: ${(row.selected_custom_strategy_ids ?? [])
                              .map((id) => customStrategies.find((c) => c.id === id)?.name ?? id)
                              .join(", ")}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!row.enabled}
                          onCheckedChange={(v) => {
                            void updateExistingSchedule(row.id, { enabled: !!v });
                          }}
                        />
                        <input
                          type="time"
                          className="h-7 rounded-md border border-zinc-700 bg-black/40 px-2 text-xs text-white"
                          value={timeInputValueFromDb(row.notify_time)}
                          onChange={(e) => {
                            void updateExistingSchedule(row.id, { notify_time: dbTimeFromInput(e.target.value) });
                          }}
                        />
                        <Select
                          value={row.schedule_mode || "all_days"}
                          onValueChange={(v) => {
                            if (v === "tomorrow_once") {
                              void updateExistingSchedule(row.id, {
                                schedule_mode: v,
                                one_off_local_date: getTomorrowDateKeyInTz(row.timezone),
                                days_of_week: [],
                              });
                            } else if (v === "custom") {
                              void updateExistingSchedule(row.id, { schedule_mode: v });
                            } else {
                              void updateExistingSchedule(row.id, {
                                schedule_mode: v,
                                days_of_week: [],
                                one_off_local_date: null,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-[170px] text-xs bg-black/40 border-zinc-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all_days">Every day</SelectItem>
                            <SelectItem value="weekdays">Weekdays</SelectItem>
                            <SelectItem value="custom">Custom days</SelectItem>
                            <SelectItem value="tomorrow_once">Tomorrow once</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] border-teal-500/30 text-teal-300"
                          onClick={() => void applyCurrentStrategySelectionToSchedule(row.id)}
                        >
                          Save current selection
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-zinc-400 hover:text-red-300 ml-auto"
                          disabled={deletingScheduleId === row.id}
                          onClick={() => void removeExistingSchedule(row.id)}
                        >
                          {deletingScheduleId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      {row.schedule_mode === "custom" && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {DAY_LABELS.map(({ bit, label }) => (
                            <label key={bit} className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                              <Checkbox
                                checked={(row.days_of_week ?? []).includes(bit)}
                                onCheckedChange={() => toggleExistingDay(row.id, bit, row.days_of_week ?? [])}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-teal-300">Select strategies for this scan</p>
          <p className="text-[10px] text-zinc-400">
            Selected: {selected.size} built-in
            {customStrategies.length > 0 ? ` + ${selectedCustom.size} custom` : ""}
          </p>
          {selected.size + selectedCustom.size === 0 ? (
            <p className="text-[10px] text-amber-300">Pick at least one strategy before running scan.</p>
          ) : null}
        </div>

        {/* Signal counts — always visible once results exist */}
        {counts.total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {counts.live > 0 && (
              <Badge className="bg-teal-500/20 border border-teal-400/40 text-teal-200 hover:bg-teal-500/30 text-sm font-semibold px-2.5 py-1">
                Live: {counts.live}
              </Badge>
            )}
            <Badge className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20 text-sm font-medium">
              Entry (BUY): {counts.buyTotal}
            </Badge>
            <Badge className="bg-red-500/15 border border-red-500/30 text-red-200 hover:bg-red-500/20 text-sm font-medium">
              Exit (SELL): {counts.sellTotal}
            </Badge>
            {counts.today > 0 && (
              <span className="text-teal-400 text-sm font-medium">Today: {counts.today}</span>
            )}
            {counts.history > 0 && (
              <span className="text-zinc-400 text-sm font-medium">Past: {counts.history}</span>
            )}
          </div>
        )}

        {/* Strategy picker */}
        <div className="rounded-lg border border-white/10 p-3 max-h-48 overflow-y-auto space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Built-in strategies</p>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={selectAllBuiltIn}>
                Select all
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={clearBuiltIn}>
                Clear
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STRATEGIES.map((s) => (
              <label key={s.value} className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={selected.has(s.value)}
                  onCheckedChange={() => toggle(s.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-white font-medium">{s.label}</span>
                  <span className="text-muted-foreground block text-[10px] leading-snug">{s.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* User's custom algo strategies */}
        {customStrategies.length > 0 && (
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 max-h-40 overflow-y-auto space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wide text-purple-300">
                Your custom strategies ({customStrategies.length})
              </p>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-purple-200 hover:text-purple-100" onClick={selectAllCustom}>
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-purple-200 hover:text-purple-100" onClick={clearCustom}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {customStrategies.map((cs) => {
                const baseLabel = STRATEGIES.find((s) => s.value === (cs.paper_strategy_type || ""))?.label;
                return (
                  <label key={cs.id} className="flex items-start gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={selectedCustom.has(cs.id)}
                      onCheckedChange={() => toggleCustom(cs.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-purple-200 font-medium">{cs.name}</span>
                      <span className="text-muted-foreground block text-[10px] leading-snug">
                        {cs.trading_mode} · SL {cs.stop_loss_pct}% · TP {cs.take_profit_pct}%
                        {baseLabel ? ` · based on ${baseLabel}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <Button
          className="w-full bg-teal-600 hover:bg-teal-500"
          onClick={runScan}
          disabled={loading}
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
            : <Sparkles className="h-4 w-4 mr-2" />}
          Run strategy entry scan
        </Button>

        {/* Results — detailed cards */}
        {visibleSignals.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Signal breakdown</p>
              {visibleSignals.length > MAIN_SIGNALS_PAGE_SIZE ? (
                <span className="text-[11px] text-zinc-500">
                  Page {effectiveMainPage} / {mainResultsTotalPages} ({MAIN_SIGNALS_PAGE_SIZE} per page)
                </span>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-1 xl:grid-cols-2">
              {pagedMainSignals.map((row, i) => (
                <SignalAnalysisCard
                  key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveMainPage}-${i}`}
                  row={row}
                  todayKey={todayKey}
                  formatEntry={formatEntry}
                  formatEntryWithZone={formatEntryWithZone}
                  formatMarketData={formatMarketData}
                  sideLabel={sideLabel}
                  sideClass={sideClass}
                  verdictVariant={verdictVariant}
                />
              ))}
            </div>
            {visibleSignals.length > MAIN_SIGNALS_PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 shrink-0 border-teal-500/30"
                  aria-label="Previous signals page"
                  onClick={() => setMainResultsPage((p) => Math.max(1, p - 1))}
                  disabled={effectiveMainPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Prev</span>
                </Button>
                <span className="text-xs text-zinc-500 text-center flex-1 min-w-0">
                  {visibleSignals.length} signals · page {effectiveMainPage} of {mainResultsTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 shrink-0 border-teal-500/30"
                  aria-label="Next signals page"
                  onClick={() => setMainResultsPage((p) => Math.min(mainResultsTotalPages, p + 1))}
                  disabled={effectiveMainPage >= mainResultsTotalPages}
                >
                  <span className="mr-1 hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Saved scan history — all symbols; does not depend on current symbol */}
        <div className="rounded-lg border border-white/10 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-white/90 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-teal-400" />
                Saved scan history
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">All commodities · newest first</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] shrink-0"
              onClick={() => fetchHistoryList(historyPage)}
              disabled={historyLoading}
            >
              Refresh
            </Button>
          </div>
          {historyLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading history…</p>
          ) : historyItems.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No saved scans yet.</p>
          ) : (
            <div className="space-y-2">
              {historyItems.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-1 rounded-lg border border-white/10 bg-black/25 transition-colors hover:border-teal-400/40"
                >
                  <button
                    type="button"
                    onClick={() => openHistoryDetail(item.id)}
                    className="min-w-0 flex-1 text-left p-3 rounded-l-lg"
                  >
                    <p className="text-sm font-semibold text-white font-mono tracking-tight">{item.symbol}</p>
                    <p className="text-sm text-zinc-400 font-medium leading-snug">
                      {new Date(item.scan_completed_at).toLocaleString()} · {item.signal_count} signals ·{" "}
                      <span className="text-teal-400/90">live {item.live_count}</span>
                      {" · "}
                      <span className="text-zinc-500">past {Math.max(0, item.signal_count - item.live_count)}</span>
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">Open for full snapshot. Delete removes this run only.</p>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-auto min-h-[3rem] shrink-0 rounded-l-none rounded-r-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/30"
                    aria-label={`Delete scan for ${item.symbol}`}
                    disabled={historyDeleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistoryDeleteTarget(item);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => fetchHistoryList(Math.max(1, historyPage - 1))}
                  disabled={historyPage <= 1 || historyLoading}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] text-muted-foreground">Page {historyPage} / {historyTotalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => fetchHistoryList(Math.min(historyTotalPages, historyPage + 1))}
                  disabled={historyPage >= historyTotalPages || historyLoading}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="flex h-[92vh] max-h-[92vh] w-[98vw] !max-w-[98vw] flex-col gap-0 !overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:!max-w-[98vw]">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-zinc-800 px-5 py-4">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-white text-lg">Saved scan details</DialogTitle>
                  <DialogDescription>
                    Snapshot from when the scan ran. Live vs past labels update with your current clock; we do not store projected future entries.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
                {historyDetailLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : !historyDetail ? (
                  <p className="text-sm text-muted-foreground">No detail found.</p>
                ) : (
                  <div className="flex h-full min-h-0 flex-col gap-3">
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {historyDetail.symbol} · {new Date(historyDetail.scan_completed_at).toLocaleString()} · Data {historyDetail.data_source ?? "n/a"} · Indicators {historyDetail.indicator_source ?? "n/a"}
                    </p>

                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="grid gap-4 lg:grid-cols-2">
                        {pagedHistorySignals.map((row, i) => (
                          <SignalAnalysisCard
                            key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveHistorySignalPage}-${i}`}
                            row={row}
                            todayKey={todayKey}
                            formatEntry={formatEntry}
                            formatEntryWithZone={formatEntryWithZone}
                            formatMarketData={formatMarketData}
                            sideLabel={sideLabel}
                            sideClass={sideClass}
                            verdictVariant={verdictVariant}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-5 py-3 pr-14 sm:pr-5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 px-3"
                  aria-label="Previous page of signals"
                  onClick={() => setHistorySignalPage((p) => Math.max(1, p - 1))}
                  disabled={effectiveHistorySignalPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Prev</span>
                </Button>
                <span className="min-w-0 flex-1 text-center text-xs text-muted-foreground">
                  Page {effectiveHistorySignalPage} / {historySignalTotalPages} · {DETAIL_SIGNALS_PAGE_SIZE} per page
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 px-3"
                  aria-label="Next page of signals"
                  onClick={() => setHistorySignalPage((p) => Math.min(historySignalTotalPages, p + 1))}
                  disabled={effectiveHistorySignalPage >= historySignalTotalPages}
                >
                  <span className="mr-1 hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={historyDeleteTarget !== null}
          onOpenChange={(open) => {
            if (!open && !historyDeleting) setHistoryDeleteTarget(null);
          }}
        >
          <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete this scan?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-zinc-400">
                  {historyDeleteTarget ? (
                    <p>
                      Permanently remove the saved snapshot for{" "}
                      <span className="font-mono text-zinc-200">{historyDeleteTarget.symbol}</span> from{" "}
                      {new Date(historyDeleteTarget.scan_completed_at).toLocaleString()}. This cannot be undone.
                    </p>
                  ) : null}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={historyDeleting} className="border-zinc-700 bg-zinc-900 text-zinc-200">
                Cancel
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={historyDeleting}
                className="bg-red-600 hover:bg-red-500"
                onClick={() => void confirmDeleteHistoryScan()}
              >
                {historyDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
