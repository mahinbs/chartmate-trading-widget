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
};

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
  const [scanMeta, setScanMeta] = useState<{ dataSource?: string; indicatorSource?: string; assetType?: string } | null>(null);
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

  // Keep "UPCOMING/LIVE" labels fresh as time moves.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const fetchHistoryList = useCallback(async (page = 1) => {
    if (!symbol.trim()) return;
    setHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke("strategy-scan-history", {
        body: { action: "list", symbol: symbol.trim(), page, pageSize: 10 },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { items?: HistoryItem[]; totalPages?: number; page?: number };
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
  }, [symbol]);

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
      });

      const predicted = list.filter((s) => s.isPredicted);
      const live = list.filter((s) => s.isLive);
      const todaysCount = list.filter((s) => s.entryDate === todayKey && !s.isPredicted).length;
      const historical = list.length - predicted.length - live.length - todaysCount;

      if (!list.length) {
        toast({ title: "No signals found", description: "Try selecting more strategies or check the symbol." });
      } else {
        const parts: string[] = [];
        if (predicted.length) parts.push(`${predicted.length} predicted upcoming`);
        if (live.length) parts.push(`${live.length} live`);
        if (todaysCount) parts.push(`${todaysCount} today`);
        if (historical > 0) parts.push(`${historical} historical`);
        toast({
          title: `${list.length} signals scored`,
          description: parts.join(" · "),
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
      isPredicted: row.isPredicted ? isFuture : false,
      isLive: row.isLive ? !isFuture && nowMs - ts <= fifteenMin : false,
    };
  }, [nowMs]);

  const visibleSignals = useMemo(() => signals.map(applyDynamicStatus), [signals, applyDynamicStatus]);

  const counts = useMemo(() => {
    const predicted = visibleSignals.filter((s) => s.isPredicted);
    const live = visibleSignals.filter((s) => s.isLive);
    const todays = visibleSignals.filter((s) => s.entryDate === todayKey && !s.isPredicted);
    const history = visibleSignals.filter((s) => !s.isLive && !s.isPredicted && s.entryDate !== todayKey);
    return {
      total: visibleSignals.length,
      predicted: predicted.length,
      today: todays.length,
      live: live.length,
      history: history.length,
      buyTotal: visibleSignals.filter((s) => s.side === "BUY").length,
      sellTotal: visibleSignals.filter((s) => s.side === "SELL").length,
    };
  }, [visibleSignals, todayKey]);

  const historySignals = useMemo(
    () => (historyDetail?.signals ?? []).map(applyDynamicStatus),
    [historyDetail, applyDynamicStatus],
  );
  const historySignalTotalPages = Math.max(1, Math.ceil(historySignals.length / 10));
  const pagedHistorySignals = useMemo(() => {
    const start = (historySignalPage - 1) * 10;
    return historySignals.slice(start, start + 10);
  }, [historySignals, historySignalPage]);

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-teal-400 shrink-0" />
              Strategy library — entry &amp; exit signals + AI score
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Symbol: <span className="text-white/90 font-mono">{symbol}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Select strategies. We detect both{" "}
              <span className="text-emerald-400">entry (BUY)</span> and{" "}
              <span className="text-red-400">exit (SELL)</span> points, rank each with an AI score,
              and surface today's best opportunities first.
              {postAnalysis?.result ? " Using your post-analysis outcome as extra context." : ""}
            </p>
            {marketNote ? <p className="text-[11px] text-muted-foreground mt-1">{marketNote}</p> : null}
            {scanMeta && (
              <p className="text-[10px] text-zinc-500 mt-1">
                Data: <span className="text-zinc-400">{scanMeta.dataSource ?? "yahoo"}</span>
                {" · "}Indicators: <span className="text-zinc-400">{scanMeta.indicatorSource ?? "computed"}</span>
                {" · "}AI scoring: <span className="text-teal-400">Gemini</span>
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
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {counts.predicted > 0 && (
              <Badge className="bg-amber-500/20 border border-amber-400/40 text-amber-300 hover:bg-amber-500/30 animate-pulse">
                PREDICTED: {counts.predicted}
              </Badge>
            )}
            {counts.live > 0 && (
              <Badge className="bg-teal-500/20 border border-teal-400/40 text-teal-300 hover:bg-teal-500/30 animate-pulse">
                LIVE NOW: {counts.live}
              </Badge>
            )}
            <Badge className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20">
              Entry (BUY): {counts.buyTotal}
            </Badge>
            <Badge className="bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/20">
              Exit (SELL): {counts.sellTotal}
            </Badge>
            {counts.today > 0 && (
              <span className="text-teal-400 text-[11px]">✦ {counts.today} today</span>
            )}
            {counts.history > 0 && (
              <span className="text-zinc-500 text-[11px]">{counts.history} historical</span>
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

        {/* Results table */}
        {visibleSignals.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/10 bg-black/20">
                  <th className="p-2">Strategy</th>
                  <th className="p-2">Signal type</th>
                  <th className="p-2">Time</th>
                  <th className="p-2 text-right">Price</th>
                  <th className="p-2">Market data</th>
                  <th className="p-2 text-right">Score</th>
                  <th className="p-2">Verdict</th>
                  <th className="p-2">Failed reason</th>
                </tr>
              </thead>
              <tbody>
                {visibleSignals.map((row, i) => (
                  <tr
                    key={`${row.strategyId}-${row.entryDate}-${row.side}-${i}`}
                    className={`border-b border-white/5 ${
                      row.verdict === "reject" ? "bg-red-500/10 border-l-2 border-l-red-500/60"
                      :
                      row.isPredicted ? "bg-amber-500/10 border-l-2 border-l-amber-400"
                      : row.isLive ? "bg-teal-500/10 border-l-2 border-l-teal-400"
                      : row.entryDate === todayKey ? "bg-teal-500/5"
                      : ""
                    }`}
                  >
                    <td className="p-2 text-white font-medium">
                      {row.isPredicted && (
                        <span className="inline-block text-[9px] font-bold uppercase tracking-wider bg-amber-500/30 text-amber-300 rounded px-1 py-0.5 mr-1.5 animate-pulse">
                          UPCOMING
                        </span>
                      )}
                      {row.isLive && !row.isPredicted && (
                        <span className="inline-block text-[9px] font-bold uppercase tracking-wider bg-teal-500/30 text-teal-300 rounded px-1 py-0.5 mr-1.5">
                          LIVE
                        </span>
                      )}
                      {row.strategyLabel}
                    </td>
                    <td className={`p-2 ${sideClass(row.side)}`}>{sideLabel(row.side)}</td>
                    <td className="p-2 font-mono text-muted-foreground text-[10px]">
                      {row.isPredicted ? (
                        <span className="text-amber-400">~{formatEntry(row)}</span>
                      ) : (
                        formatEntry(row)
                      )}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {row.isPredicted ? (
                        <span className="text-amber-400/80">~{row.priceAtEntry?.toFixed?.(2) ?? row.priceAtEntry}</span>
                      ) : (
                        row.priceAtEntry?.toFixed?.(2) ?? row.priceAtEntry
                      )}
                    </td>
                    <td className="p-2 text-[10px] text-zinc-300 max-w-[240px]">{formatMarketData(row)}</td>
                    <td className="p-2 text-right font-mono text-teal-400">{row.probabilityScore}</td>
                    <td className="p-2">
                      <Badge variant={verdictVariant(row.verdict)} className="text-[10px]">
                        {row.verdict}
                      </Badge>
                    </td>
                    <td className="p-2 text-[10px] text-red-300/90 max-w-[320px]">
                      {row.verdict === "reject" ? row.rationale : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* AI rationale notes */}
            <div className="p-2 space-y-1 border-t border-white/10 bg-black/20">
              {visibleSignals.slice(0, 12).map((row, i) => (
                <p key={i} className="text-[10px] text-muted-foreground">
                  {row.isPredicted && <span className="text-amber-400 font-bold mr-1">PREDICTED</span>}
                  {row.isLive && !row.isPredicted && <span className="text-teal-400 font-bold mr-1">LIVE</span>}
                  {row.verdict === "reject" && <span className="text-red-400 font-bold mr-1">FAILED</span>}
                  <span className={sideClass(row.side)}>{row.side === "BUY" ? "↑" : "↓"}</span>{" "}
                  <span className="text-white/80">{row.strategyLabel}</span> · {formatEntryWithZone(row)}: {row.rationale}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Saved scan history (per user, per symbol) */}
        <div className="rounded-lg border border-white/10 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/90 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-teal-400" />
              Saved scan history
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => fetchHistoryList(historyPage)}
              disabled={historyLoading}
            >
              Refresh
            </Button>
          </div>
          {historyLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading history…</p>
          ) : historyItems.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No saved scans yet for this symbol.</p>
          ) : (
            <div className="space-y-2">
              {historyItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openHistoryDetail(item.id)}
                  className="w-full text-left rounded-md border border-white/10 hover:border-teal-400/40 bg-black/20 p-2 transition-colors"
                >
                  <p className="text-xs text-white/90 font-mono">{item.symbol}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(item.scan_completed_at).toLocaleString()} · {item.signal_count} signals · live {item.live_count} · upcoming {item.predicted_count}
                  </p>
                </button>
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

        {/* Info when no predicted upcoming signals */}
        {signals.length > 0 && counts.predicted === 0 && (
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/30 p-3 text-xs">
            <p className="text-zinc-400 font-medium mb-0.5">No predicted upcoming signals</p>
            <p className="text-muted-foreground">
              Market may be closed or current conditions don&apos;t project new entry/exit points within the trading window.
              Historical and live signals are shown above.
            </p>
          </div>
        )}

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="w-[98vw] !max-w-[98vw] sm:!max-w-[98vw] h-[92vh] !max-h-[92vh] bg-zinc-950 border-zinc-800 p-0">
            <div className="h-full flex flex-col">
              <div className="border-b border-zinc-800 px-5 py-4">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-white text-lg">Saved scan details</DialogTitle>
                  <DialogDescription>
                    Snapshot captured at scan time. UPCOMING/LIVE labels auto-update as time passes.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="flex-1 min-h-0 px-5 py-4 overflow-hidden">
                {historyDetailLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : !historyDetail ? (
                  <p className="text-sm text-muted-foreground">No detail found.</p>
                ) : (
                  <div className="h-full flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                      {historyDetail.symbol} · {new Date(historyDetail.scan_completed_at).toLocaleString()} · Data {historyDetail.data_source ?? "n/a"} · Indicators {historyDetail.indicator_source ?? "n/a"}
                    </p>

                    <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-white/10">
                      <table className="w-full text-xs table-auto">
                        <thead className="sticky top-0 z-10">
                          <tr className="text-left text-muted-foreground border-b border-white/10 bg-black/80 backdrop-blur">
                            <th className="p-2 min-w-[170px]">Strategy</th>
                            <th className="p-2 min-w-[110px]">Type</th>
                            <th className="p-2 min-w-[230px]">Time</th>
                            <th className="p-2 text-right min-w-[90px]">Price</th>
                            <th className="p-2 min-w-[230px]">Market data</th>
                            <th className="p-2 text-right min-w-[80px]">Score</th>
                            <th className="p-2 min-w-[90px]">Verdict</th>
                            <th className="p-2 min-w-[300px]">Failed reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedHistorySignals.map((row, i) => (
                            <tr
                              key={`${row.strategyId}-${row.entryDate}-${row.side}-${i}`}
                              className={`border-b border-white/5 ${row.verdict === "reject" ? "bg-red-500/10" : ""}`}
                            >
                              <td className="p-2 text-white">
                                {row.isPredicted && <span className="text-amber-400 mr-1">UPCOMING</span>}
                                {row.isLive && !row.isPredicted && <span className="text-teal-400 mr-1">LIVE</span>}
                                {row.strategyLabel}
                              </td>
                              <td className={`p-2 ${sideClass(row.side)}`}>{sideLabel(row.side)}</td>
                              <td className="p-2 font-mono text-muted-foreground text-[10px]">{formatEntryWithZone(row)}</td>
                              <td className="p-2 text-right font-mono">{row.priceAtEntry?.toFixed?.(2) ?? row.priceAtEntry}</td>
                              <td className="p-2 text-[10px] text-zinc-300">{formatMarketData(row)}</td>
                              <td className="p-2 text-right font-mono text-teal-400">{row.probabilityScore}</td>
                              <td className="p-2"><Badge variant={verdictVariant(row.verdict)} className="text-[10px]">{row.verdict}</Badge></td>
                              <td className="p-2 text-[10px] text-red-300/90">{row.verdict === "reject" ? row.rationale : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-800 px-5 py-3 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setHistorySignalPage((p) => Math.max(1, p - 1))}
                  disabled={historySignalPage <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] text-muted-foreground">Signals page {historySignalPage} / {historySignalTotalPages} (10 per page)</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setHistorySignalPage((p) => Math.min(historySignalTotalPages, p + 1))}
                  disabled={historySignalPage >= historySignalTotalPages}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
