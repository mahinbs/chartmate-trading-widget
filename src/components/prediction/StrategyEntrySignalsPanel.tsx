/**
 * Post-analysis: multi-strategy library entry & exit scan + AI probability / verdict.
 * Scans BOTH BUY (entry) and SELL (exit) simultaneously so users can see all opportunities.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "@/hooks/useAuth";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

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
  /** Echo of saved custom strategy fields passed through the scanner (session, SL/TP, risk, etc.) */
  customStrategyMeta?: Record<string, unknown> | null;
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
  /** When set (live rows), live badge/countdown uses this instead of entry time + liveWindow (scan latency no longer eats the window). */
  liveUiExpiresAtMs?: number | null;
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
  start_time?: string | null;
  end_time?: string | null;
  squareoff_time?: string | null;
  risk_per_trade_pct?: number | null;
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

const TIMEFRAME_PRESET_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  "730d": 730,
};

function clampInt(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function scanProgressStageLabel(p: number): string {
  if (p >= 100) return "Done — showing results";
  if (p < 20) return "Fetching OHLCV & computing indicators…";
  if (p < 45) return "Running entry/exit rules on each bar…";
  if (p < 78) return "AI (Gemini) scoring & blending with rule engine…";
  return "Merging outcomes & building signal cards…";
}

function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function verdictUiLabel(verdict: string): string {
  const v = String(verdict || "").toLowerCase();
  if (v === "mixed" || v === "review") return "Mixed signal";
  if (v === "confirm") return "Confirm";
  if (v === "reject") return "Reject";
  return verdict;
}

function isMixedVerdict(v: string): boolean {
  const x = String(v || "").toLowerCase();
  return x === "mixed" || x === "review";
}

function entryBarMs(row: SignalRow): number | null {
  if (row.entryTimestamp != null && Number.isFinite(Number(row.entryTimestamp))) {
    return Number(row.entryTimestamp);
  }
  if (row.entryTime) {
    const t = new Date(row.entryTime).getTime();
    return Number.isFinite(t) ? t : null;
  }
  const d = Date.parse(`${row.entryDate}T12:00:00.000Z`);
  return Number.isFinite(d) ? d : null;
}

/** Mirrors `intervalLabelToBarMinutes` in strategy-entry-signals (fallback when API omits liveWindowMs). */
function intervalLabelToBarMinutesClient(interval: string): number {
  const s = String(interval).trim().toLowerCase();
  const m = /^(\d+)\s*m$/.exec(s);
  if (m) return Math.max(1, Number(m[1]));
  if (s === "1h" || s === "60m") return 60;
  if (s.endsWith("d") || s === "1d") return 24 * 60;
  return 5;
}

/** Live badge window = one chart bar from scan (server sends ms; else derive from interval). */
function resolveLiveWindowMs(serverMs: number | null | undefined, interval: string | null | undefined): number {
  if (typeof serverMs === "number" && Number.isFinite(serverMs) && serverMs >= 60_000) {
    return Math.min(serverMs, 7 * 24 * 60 * 60 * 1000);
  }
  const mins = interval ? intervalLabelToBarMinutesClient(interval) : 5;
  return Math.max(60_000, mins * 60 * 1000);
}

function applyRowLiveWindow(row: SignalRow, nowMs: number, liveWindowMs: number): SignalRow {
  const uiExp = row.liveUiExpiresAtMs;
  if (typeof uiExp === "number" && Number.isFinite(uiExp)) {
    return {
      ...row,
      isPredicted: false,
      isLive: row.isLive ? nowMs <= uiExp : false,
    };
  }
  const ts = row.entryTimestamp
    ? Number(row.entryTimestamp)
    : row.entryTime
    ? new Date(row.entryTime).getTime()
    : NaN;
  if (!Number.isFinite(ts)) {
    return { ...row, isPredicted: false };
  }
  const isFuture = ts > nowMs;
  return {
    ...row,
    isPredicted: false,
    isLive: row.isLive ? !isFuture && nowMs - ts <= liveWindowMs : false,
  };
}

/** 12-hour times for scanner cards (not minute-truncated — uses full Date when formatting). */
const SCAN_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
};

function LiveOnAirBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/45 bg-gradient-to-r from-teal-950/90 via-cyan-950/80 to-teal-950/90 px-2.5 py-1 shadow-[0_0_14px_rgba(45,212,191,0.22)] ring-1 ring-teal-500/20"
      aria-label="Live signal on latest bar"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-50">Live</span>
    </span>
  );
}

function fmtNum(n: number, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

/** Uses saved custom meta (tradingMode, signalSide) so BUY/SELL map to entry vs exit correctly. */
function resolveScannerPointPresentation(row: SignalRow): {
  badgeText: string;
  badgeClass: string;
  detailLine: string;
  timeLabel: string;
  priceLabel: string;
} {
  const meta = row.customStrategyMeta;
  const tm = String(meta?.tradingMode ?? "").toUpperCase();
  const side = String(row.side).toUpperCase();
  const isClock =
    meta?.signalKind === "scheduled_clock_exit" ||
    String(row.strategyLabel).toLowerCase().includes("(time exit)");

  if (isClock) {
    return {
      badgeText: "Exit — scheduled time",
      badgeClass: "bg-amber-500/25 text-amber-200 border border-amber-500/35",
      detailLine:
        tm === "SHORT"
          ? "Cover / flatten short at this bar per your clock exit rule."
          : "Sell / flatten long at this bar per your clock exit rule.",
      timeLabel: "Exit time (bar)",
      priceLabel: "Exit price (bar close)",
    };
  }

  if (tm === "SHORT") {
    if (side === "SELL") {
      return {
        badgeText: "Entry — short",
        badgeClass: "bg-rose-500/20 text-rose-200 border border-rose-500/35",
        detailLine: "Open or add to a short position at this price.",
        timeLabel: "Entry time",
        priceLabel: "Entry price",
      };
    }
    if (side === "BUY") {
      return {
        badgeText: "Exit — cover short",
        badgeClass: "bg-sky-500/20 text-sky-200 border border-sky-500/35",
        detailLine: "Buy to cover / exit a short per your rules.",
        timeLabel: "Exit time",
        priceLabel: "Exit price",
      };
    }
  }

  if (tm === "LONG") {
    if (side === "BUY") {
      return {
        badgeText: "Entry — long",
        badgeClass: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/35",
        detailLine: "Open or add to a long position at this price.",
        timeLabel: "Entry time",
        priceLabel: "Entry price",
      };
    }
    if (side === "SELL") {
      return {
        badgeText: "Exit — close long",
        badgeClass: "bg-amber-500/20 text-amber-200 border border-amber-500/35",
        detailLine: "Sell / reduce long exposure at this price.",
        timeLabel: "Exit time",
        priceLabel: "Exit price",
      };
    }
  }

  if (side === "BUY") {
    return {
      badgeText: "BUY at this bar",
      badgeClass: "bg-emerald-500/15 text-emerald-300/95 border border-emerald-500/25",
      detailLine:
        "Strategy allows both directions — treat as a long entry unless your playbook uses this as another leg.",
      timeLabel: "Signal time",
      priceLabel: "Price at bar",
    };
  }
  return {
    badgeText: "SELL at this bar",
    badgeClass: "bg-red-500/15 text-red-300/95 border border-red-500/25",
    detailLine:
      "Strategy allows both directions — may be long exit or short entry depending on how you trade this setup.",
    timeLabel: "Signal time",
    priceLabel: "Price at bar",
  };
}

function savedPlanSlTpLine(row: SignalRow, meta: Record<string, unknown>): string | null {
  const slPct = Number(meta.stopLossPct);
  const tpPct = Number(meta.takeProfitPct);
  const p = row.priceAtEntry;
  if (!Number.isFinite(p) || !Number.isFinite(slPct) || !Number.isFinite(tpPct)) return null;
  const tm = String(meta.tradingMode ?? "").toUpperCase();
  const side = String(row.side).toUpperCase();
  const isClock = meta.signalKind === "scheduled_clock_exit";
  if (isClock) return null;

  if (tm === "LONG" && side === "BUY") {
    return `Saved plan: stop ≈ ${fmtNum(p * (1 - slPct / 100))} (−${slPct}%) · target ≈ ${fmtNum(p * (1 + tpPct / 100))} (+${tpPct}%) from this entry.`;
  }
  if (tm === "SHORT" && side === "SELL") {
    return `Saved plan: stop ≈ ${fmtNum(p * (1 + slPct / 100))} (+${slPct}%) · target ≈ ${fmtNum(p * (1 - tpPct / 100))} (−${tpPct}%) from this entry.`;
  }
  if (tm === "BOTH" && side === "BUY") {
    return `If trading long from this BUY: stop ≈ ${fmtNum(p * (1 - slPct / 100))} (−${slPct}%) · target ≈ ${fmtNum(p * (1 + tpPct / 100))} (+${tpPct}%).`;
  }
  if (tm === "BOTH" && side === "SELL") {
    return `If trading short from this SELL: stop ≈ ${fmtNum(p * (1 + slPct / 100))} (+${slPct}%) · target ≈ ${fmtNum(p * (1 - tpPct / 100))} (−${tpPct}%).`;
  }
  return null;
}

function CustomStrategySavedPlanBlock({ meta }: { meta: Record<string, unknown> }) {
  const days = Array.isArray(meta.executionDays) ? (meta.executionDays as unknown[]).filter((x) => typeof x === "number") : [];
  const dayStr =
    days.length > 0
      ? days.map((d) => DAY_LABELS.find((x) => x.bit === d)?.label ?? String(d)).join(", ")
      : null;
  const ex = meta.exitConditions && typeof meta.exitConditions === "object" ? (meta.exitConditions as Record<string, unknown>) : null;
  const pos = meta.positionConfig && typeof meta.positionConfig === "object" ? (meta.positionConfig as Record<string, unknown>) : null;
  const risk = meta.riskConfig && typeof meta.riskConfig === "object" ? (meta.riskConfig as Record<string, unknown>) : null;
  const chart = meta.chartConfig && typeof meta.chartConfig === "object" ? (meta.chartConfig as Record<string, unknown>) : null;

  const rows: Array<{ k: string; v: string }> = [];
  if (meta.tradingMode != null) rows.push({ k: "Direction", v: String(meta.tradingMode) });
  if (meta.marketType != null) rows.push({ k: "Market type", v: String(meta.marketType) });
  if (meta.isIntraday != null) rows.push({ k: "Intraday", v: meta.isIntraday ? "Yes" : "No" });
  if (meta.stopLossPct != null) rows.push({ k: "Stop loss (saved)", v: `${meta.stopLossPct}%` });
  if (meta.takeProfitPct != null) rows.push({ k: "Take profit (saved)", v: `${meta.takeProfitPct}%` });
  if (meta.riskPerTradePct != null) rows.push({ k: "Risk / trade (saved)", v: `${meta.riskPerTradePct}%` });
  if (meta.sessionStart != null && meta.sessionEnd != null) {
    rows.push({ k: "Session window", v: `${meta.sessionStart} – ${meta.sessionEnd}` });
  }
  if (meta.squareoffTime != null) rows.push({ k: "Square-off", v: String(meta.squareoffTime) });
  if (dayStr) rows.push({ k: "Execution days", v: dayStr });
  if (ex?.clockExitTime) rows.push({ k: "Clock exit", v: String(ex.clockExitTime) });
  if (ex?.timeBasedExit === true && typeof ex.exitAfterMinutes === "number") {
    rows.push({ k: "Time-based exit", v: `After ${ex.exitAfterMinutes} min` });
  }
  if (ex?.trailingStop === true) {
    const tpct = ex.trailingStopPct != null ? String(ex.trailingStopPct) : "?";
    rows.push({ k: "Trailing stop", v: `${tpct}%` });
  }
  if (pos?.orderType != null) rows.push({ k: "Order type", v: String(pos.orderType) });
  if (pos?.sizingMode != null) rows.push({ k: "Sizing", v: String(pos.sizingMode) });
  if (pos?.capitalPct != null) rows.push({ k: "Capital %", v: String(pos.capitalPct) });
  if (risk?.maxOpenPositions != null) rows.push({ k: "Max open positions", v: String(risk.maxOpenPositions) });
  if (risk?.maxDailyLossPct != null) rows.push({ k: "Max daily loss %", v: String(risk.maxDailyLossPct) });
  if (chart?.interval != null) rows.push({ k: "Chart interval", v: String(chart.interval) });
  if (chart?.chartType != null) rows.push({ k: "Chart type", v: String(chart.chartType) });
  if (meta.description != null && String(meta.description).trim()) {
    const note = String(meta.description);
    rows.push({ k: "Notes", v: note.length > 280 ? `${note.slice(0, 280)}…` : note });
  }

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/15 p-3 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-cyan-300/95">Saved strategy (this scan)</p>
      <p className="text-[11px] text-zinc-500 leading-snug">
        Values below are from your custom strategy record — use them together with the signal time and price above.
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        {rows.map((r) => (
          <div key={r.k} className="min-w-0">
            <dt className="text-zinc-500 font-medium">{r.k}</dt>
            <dd className="text-zinc-200 font-mono break-words">{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SignalAnalysisCard(props: {
  row: SignalRow;
  todayKey: string;
  nowMs: number;
  liveWindowMs: number;
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
    nowMs,
    liveWindowMs,
    formatEntry,
    formatEntryWithZone,
    formatMarketData,
    sideLabel,
    sideClass,
    verdictVariant,
    compactZone,
  } = props;
  const isPast = !row.isLive && row.entryDate !== todayKey;
  const barMs = entryBarMs(row);
  const uiExp =
    typeof row.liveUiExpiresAtMs === "number" && Number.isFinite(row.liveUiExpiresAtMs)
      ? row.liveUiExpiresAtMs
      : null;
  const liveRemainingMs =
    row.isLive && uiExp != null
      ? Math.max(0, uiExp - nowMs)
      : row.isLive && barMs != null
      ? Math.max(0, liveWindowMs - (nowMs - barMs))
      : null;
  const liveElapsedMs =
    row.isLive && liveRemainingMs != null
      ? uiExp != null
        ? Math.max(0, liveWindowMs - liveRemainingMs)
        : barMs != null
        ? Math.max(0, nowMs - barMs)
        : null
      : null;
  const pointUi = row.customStrategyMeta ? resolveScannerPointPresentation(row) : null;
  const slTpHint =
    row.customStrategyMeta && typeof row.customStrategyMeta === "object"
      ? savedPlanSlTpLine(row, row.customStrategyMeta)
      : null;
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
            {row.isLive ? <LiveOnAirBadge /> : null}
            {isPast ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Past</span>
            ) : null}
            {!row.isLive && row.entryDate === todayKey ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-400/90">Today</span>
            ) : null}
            <h3 className="text-base font-semibold text-white leading-tight">{row.strategyLabel}</h3>
          </div>
          {row.isLive && liveElapsedMs != null && liveRemainingMs != null ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-full max-w-full text-left rounded-md border border-transparent px-0 py-0.5 hover:border-teal-500/20 hover:bg-teal-500/5 transition-colors"
                >
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    <span className="text-zinc-500">Since signal bar: </span>
                    <span className="font-mono text-teal-200/95 tabular-nums">{formatDurationShort(liveElapsedMs)}</span>
                    <span className="text-zinc-500"> · </span>
                    {liveRemainingMs > 0 ? (
                      <span className="text-teal-300/95">
                        {formatDurationShort(liveRemainingMs)} left of {formatDurationShort(liveWindowMs)} live window
                      </span>
                    ) : (
                      <span className="text-zinc-500">Live window ended</span>
                    )}
                  </p>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
                {uiExp != null ? (
                  <>
                    This live window is one bar long and starts when the scan finished (so slow scoring doesn&apos;t
                    shrink your time to act). Signal bar time and price are unchanged. Total window:{" "}
                    <span className="font-medium">{formatDurationShort(liveWindowMs)}</span>.
                  </>
                ) : (
                  <>
                    Elapsed = your clock minus the signal bar&apos;s full timestamp. This card&apos;s live window is{" "}
                    <span className="font-medium">{formatDurationShort(liveWindowMs)}</span> — one bar of the OHLCV
                    interval used for this scan (<code className="text-[10px]">liveWindowMs</code> from the server when
                    available).
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {pointUi ? (
            <div className="space-y-1">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 inline-block ${pointUi.badgeClass}`}
              >
                {pointUi.badgeText}
              </span>
              <p className="text-xs text-zinc-400 leading-snug">{pointUi.detailLine}</p>
              <p className={`text-sm font-medium ${sideClass(row.side)}`}>{sideLabel(row.side)}</p>
            </div>
          ) : (
            <p className={`text-sm font-medium ${sideClass(row.side)}`}>{sideLabel(row.side)}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold tabular-nums text-teal-300">{row.probabilityScore}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Score</p>
          <Badge variant={verdictVariant(row.verdict)} className="mt-1.5 text-xs font-semibold">
            {verdictUiLabel(row.verdict)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-1 text-sm text-zinc-300">
        <p>
          <span className="text-zinc-500 font-medium">{pointUi ? `${pointUi.timeLabel}: ` : "When: "}</span>
          <span className="font-mono text-zinc-200">{compactZone ? formatEntry(row) : formatEntryWithZone(row)}</span>
        </p>
        <p>
          <span className="text-zinc-500 font-medium">{pointUi ? `${pointUi.priceLabel}: ` : "Price: "}</span>
          <span className="font-mono text-white">{row.priceAtEntry?.toFixed?.(2) ?? row.priceAtEntry}</span>
        </p>
        {slTpHint ? (
          <p className="text-[11px] text-cyan-200/90 leading-snug border-l-2 border-cyan-500/40 pl-2">{slTpHint}</p>
        ) : null}
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
            {new Date(row.scanEvaluatedAt).toLocaleString(undefined, SCAN_DATETIME_OPTS)}
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

      {row.customStrategyMeta && typeof row.customStrategyMeta === "object" ? (
        <CustomStrategySavedPlanBlock meta={row.customStrategyMeta} />
      ) : null}

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

      {(row.verdict === "reject" || isMixedVerdict(row.verdict)) && (row.rejectionDetail || row.rationale) ? (
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
            {row.verdict === "reject" ? "Rejected — detail" : "Mixed signal — why not a full confirm"}
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
  const { user } = useAuth();
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
    resultWindowDays?: number | null;
    interval?: string;
    liveWindowMs?: number;
    barMinutesApprox?: number;
    dataIsIntraday?: boolean;
    isIntraday?: boolean;
    customSelectionDailyOnly?: boolean;
  } | null>(null);
  const [timeframePreset, setTimeframePreset] = useState<string>("90d");
  const [customWindowDays, setCustomWindowDays] = useState<string>("90");
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
  const [scanProgress, setScanProgress] = useState(0);
  const scanProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const resultWindowDays = useMemo(() => {
    if (timeframePreset === "custom") {
      const n = parseInt(String(customWindowDays).trim(), 10);
      return clampInt(Number.isFinite(n) ? n : 90, 1, 730);
    }
    return TIMEFRAME_PRESET_DAYS[timeframePreset] ?? 90;
  }, [timeframePreset, customWindowDays]);

  /** OHLCV fetch depth — engine needs ≥60 daily bars for stable indicators; can be wider than the results window. */
  const fetchDays = useMemo(() => Math.min(730, Math.max(60, resultWindowDays)), [resultWindowDays]);

  const intradayLookbackMinutes = useMemo(
    () => Math.min(7 * 24 * 60, Math.max(60, resultWindowDays * 24 * 60)),
    [resultWindowDays],
  );

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

  // Live cards: tick every second while results are open so the live timer stays accurate.
  useEffect(() => {
    const fast = signals.length > 0;
    const id = setInterval(() => setNowMs(Date.now()), fast ? 1000 : 30000);
    return () => clearInterval(id);
  }, [signals.length]);

  useEffect(() => {
    return () => {
      if (scanProgressTimerRef.current != null) {
        clearInterval(scanProgressTimerRef.current);
        scanProgressTimerRef.current = null;
      }
    };
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

  /** When a scheduled digest finishes, `entry_point_alerts` includes `history_id` — refresh Past analyses without reload. */
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`strategy_scan_history_on_digest_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entry_point_alerts",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const meta = (payload.new as { metadata?: { history_id?: unknown } })?.metadata;
          const hid = meta?.history_id;
          if (typeof hid === "string" && hid.length > 0) {
            void fetchHistoryList(1);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, fetchHistoryList]);

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
      const uid = session.user.id;
      const { data, error } = await (supabase as any)
        .from("live_entry_trackers")
        .select("id,symbol,timezone,notify_time,enabled,schedule_mode,selected_strategies,selected_custom_strategy_ids,days_of_week,one_off_local_date,last_digest_on")
        .eq("user_id", uid)
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
    if (entryAlarmsOpen && scheduleTab === "existing") void loadExistingSchedules();
  }, [entryAlarmsOpen, scheduleTab, loadExistingSchedules]);
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

    if (scanProgressTimerRef.current != null) {
      clearInterval(scanProgressTimerRef.current);
      scanProgressTimerRef.current = null;
    }
    setLoading(true);
    setSignals([]);
    setScanProgress(6);
    scanProgressTimerRef.current = setInterval(() => {
      setScanProgress((prev) => Math.min(94, prev + 1.2 + Math.random() * 3.5));
    }, 400);

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
          startTime: cs.start_time ?? undefined,
          endTime: cs.end_time ?? undefined,
          squareoffTime: cs.squareoff_time ?? undefined,
          riskPerTradePct: cs.risk_per_trade_pct ?? undefined,
          description: cs.description ?? undefined,
        }));

      const { data, error } = await supabase.functions.invoke("strategy-entry-signals", {
        body: {
          symbol: symbol.trim(),
          strategies: Array.from(selected),
          customStrategies: customConfigs,
          action: "BOTH",
          days: fetchDays,
          maxSignalAgeDays: resultWindowDays,
          preferIntraday: true,
          intradayInterval: "5m",
          intradayLookbackMinutes,
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
      if (scanProgressTimerRef.current != null) {
        clearInterval(scanProgressTimerRef.current);
        scanProgressTimerRef.current = null;
      }
      setScanProgress(100);
      setSignals(list);
      setScanMeta({
        dataSource: (data as any)?.dataSource,
        indicatorSource: (data as any)?.indicatorSource,
        assetType: (data as any)?.assetType,
        lookbackDaysUsed: typeof (data as any)?.lookbackDaysUsed === "number" ? (data as any).lookbackDaysUsed : undefined,
        resultWindowDays:
          typeof (data as any)?.resultWindowDays === "number"
            ? (data as any).resultWindowDays
            : resultWindowDays,
        interval: typeof (data as any)?.interval === "string" ? (data as any).interval : undefined,
        liveWindowMs: typeof (data as any)?.liveWindowMs === "number" ? (data as any).liveWindowMs : undefined,
        barMinutesApprox:
          typeof (data as any)?.barMinutesApprox === "number" ? (data as any).barMinutesApprox : undefined,
        dataIsIntraday: typeof (data as any)?.dataIsIntraday === "boolean" ? (data as any).dataIsIntraday : undefined,
        isIntraday: typeof (data as any)?.isIntraday === "boolean" ? (data as any).isIntraday : undefined,
        customSelectionDailyOnly:
          typeof (data as any)?.customSelectionDailyOnly === "boolean"
            ? (data as any).customSelectionDailyOnly
            : undefined,
      });

      const live = list.filter((s) => s.isLive);
      const todaysCount = list.filter((s) => s.entryDate === todayKey).length;
      const historical = list.filter((s) => !s.isLive && s.entryDate !== todayKey).length;

      if (!list.length) {
        const onlyCustom = selected.size === 0 && selectedCustom.size > 0;
        toast({
          title: "No signals found",
          description: onlyCustom
            ? "No bars matched your custom entry logic on this lookback (rules too strict, session/day filter, or quiet tape)."
            : "Try selecting more strategies or check the symbol.",
        });
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
      await new Promise((r) => setTimeout(r, 420));
    } catch (e: unknown) {
      if (scanProgressTimerRef.current != null) {
        clearInterval(scanProgressTimerRef.current);
        scanProgressTimerRef.current = null;
      }
      setScanProgress(0);
      toast({
        title: "Scan failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setScanProgress(0);
    }
  }, [
    symbol,
    selected,
    selectedCustom,
    customStrategies,
    postAnalysis,
    requirePostAnalysis,
    toast,
    todayKey,
    fetchHistoryList,
    fetchDays,
    resultWindowDays,
    intradayLookbackMinutes,
  ]);

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
    if (row.entryTimestamp != null && Number.isFinite(Number(row.entryTimestamp))) {
      return new Date(Number(row.entryTimestamp)).toLocaleString(undefined, SCAN_DATETIME_OPTS);
    }
    const iso = row.entryTime || "";
    if (!iso) return row.entryDate;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return row.entryDate;
    if (row.entryTime && row.entryTime.length <= 10) return row.entryTime;
    return dt.toLocaleString(undefined, SCAN_DATETIME_OPTS);
  };

  const formatEntryWithZone = (row: SignalRow) => {
    if (row.entryTimestamp != null && Number.isFinite(Number(row.entryTimestamp))) {
      const dt = new Date(Number(row.entryTimestamp));
      return `${dt.toLocaleString(undefined, SCAN_DATETIME_OPTS)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
    }
    const iso = row.entryTime || "";
    if (!iso) return row.entryDate;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return row.entryDate;
    return `${dt.toLocaleString(undefined, SCAN_DATETIME_OPTS)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
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

  const liveWindowMsMain = useMemo(
    () => resolveLiveWindowMs(scanMeta?.liveWindowMs, scanMeta?.interval ?? null),
    [scanMeta?.liveWindowMs, scanMeta?.interval],
  );

  const liveWindowMsHistory = useMemo(
    () => resolveLiveWindowMs(undefined, historyDetail?.interval ?? null),
    [historyDetail?.interval],
  );

  const visibleSignals = useMemo(() => {
    const w = liveWindowMsMain;
    const mapped = signals.map((row) => applyRowLiveWindow(row, nowMs, w)).filter((s) => !s.isPredicted);
    return mapped.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      const ta = entryBarMs(a) ?? 0;
      const tb = entryBarMs(b) ?? 0;
      return tb - ta;
    });
  }, [signals, nowMs, liveWindowMsMain]);

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

  const historySignals = useMemo(() => {
    const w = liveWindowMsHistory;
    return (historyDetail?.signals ?? [])
      .filter((s) => !s.isPredicted)
      .map((row) => applyRowLiveWindow(row, nowMs, w));
  }, [historyDetail, nowMs, liveWindowMsHistory]);
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
              Pick a <span className="text-zinc-300 font-medium">results window</span> below (how far back entry/exit
              points may appear — up to now). We fetch enough history for indicators, then only keep signals inside
              that window. On intraday data when available we detect{" "}
              <span className="text-emerald-400 font-medium">entry (BUY)</span> and{" "}
              <span className="text-red-400 font-medium">exit (SELL)</span>, score with rules + Gemini —{" "}
              <span className="text-zinc-300">confirm</span>, <span className="text-zinc-300">mixed signal</span>, or{" "}
              <span className="text-zinc-300">reject</span>. Live cards use a clock; the live tag clears after{" "}
              <span className="text-zinc-300">one chart bar</span> from the signal time (e.g. 5m feed → 5m window, daily →
              24h), matching the scan interval. No projected &quot;upcoming&quot; entries.
              {postAnalysis?.result ? " Your post-analysis outcome is included as extra context." : ""}
            </p>
            {marketNote ? <p className="text-xs text-muted-foreground mt-1">{marketNote}</p> : null}
            {scanMeta && (
              <p className="text-[11px] text-zinc-500 mt-1">
                Data: <span className="text-zinc-400">{scanMeta.dataSource ?? "yahoo"}</span>
                {" · "}Indicators: <span className="text-zinc-400">{scanMeta.indicatorSource ?? "computed"}</span>
                {" · "}Data lookback:{" "}
                <span className="text-zinc-400">{scanMeta.lookbackDaysUsed != null ? `${scanMeta.lookbackDaysUsed}d` : "—"}</span>
                {scanMeta.resultWindowDays != null ? (
                  <>
                    {" · "}Results window:{" "}
                    <span className="text-zinc-400">{scanMeta.resultWindowDays}d</span>
                  </>
                ) : null}
                {scanMeta.interval ? (
                  <>
                    {" · "}Chart: <span className="text-zinc-400 font-mono">{scanMeta.interval}</span>
                  </>
                ) : null}
                {scanMeta.customSelectionDailyOnly ? (
                  <>
                    {" · "}
                    <span className="text-zinc-500">Customs:</span>{" "}
                    <span className="text-zinc-400">all daily — daily OHLCV only</span>
                  </>
                ) : scanMeta.isIntraday != null ? (
                  <>
                    {" · "}Intraday scan:{" "}
                    <span className="text-zinc-400">{scanMeta.isIntraday ? "yes" : "no"}</span>
                  </>
                ) : null}
                {" · "}Live window:{" "}
                <span className="text-zinc-400">{formatDurationShort(liveWindowMsMain)}</span>
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
            <SheetDescription className="text-zinc-400 space-y-2">
              <span className="block">
                Turn on <span className="text-zinc-300">entry point alarms</span> for{" "}
                <span className="font-mono text-teal-200/90">{symbol.trim().toUpperCase() || "this symbol"}</span> at a
                daily wall time. When due, the backend runs the same scanner as &quot;Run strategy entry scan&quot;,
                saves a row in <span className="text-zinc-300">Past analyses</span>, and adds one in-app item to the{" "}
                <span className="text-zinc-300">bell</span> (no browser push). Open the bell to jump to the snapshot (
                <span className="text-zinc-500">live counts in the message</span>).{" "}
                <span className="text-zinc-500">
                  Keep this Live Trading area open for best alignment: the app triggers the digest at your chosen minute
                  via Supabase Realtime; cron still runs if the tab is closed.
                </span>
              </span>
              <span className="block text-[11px] text-zinc-500 leading-snug">
                Requires the hosted job <code className="text-[10px]">entry-point-daily-digest</code> on a short cron (e.g.
                every minute) and <code className="text-[10px]">ENTRY_DIGEST_SECRET</code> set on Edge Functions — see{" "}
                <code className="text-[10px]">supabase/functions/entry-point-daily-digest/README.md</code>. This is
                separate from the built-in &quot;Time Scheduled&quot; strategy checkbox (clock-based signals inside a
                manual scan).
              </span>
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
        <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-cyan-300">Results time window</p>
          <p className="text-[10px] text-zinc-500 leading-snug">
            Only entry/exit points from the last <span className="text-zinc-400">{resultWindowDays} days</span> through
            now are returned. Data fetch uses at least 60 days when needed for indicators.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Preset</p>
              <Select value={timeframePreset} onValueChange={setTimeframePreset}>
                <SelectTrigger className="h-9 text-xs bg-black/40 border-zinc-700">
                  <SelectValue placeholder="Window" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">Last 1 day</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 1 month (~30d)</SelectItem>
                  <SelectItem value="90d">Last 3 months (~90d)</SelectItem>
                  <SelectItem value="180d">Last 6 months (~180d)</SelectItem>
                  <SelectItem value="365d">Last 1 year</SelectItem>
                  <SelectItem value="730d">Last 2 years</SelectItem>
                  <SelectItem value="custom">Custom (days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {timeframePreset === "custom" ? (
              <div className="w-full sm:w-32 space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Days (1–730)</p>
                <Input
                  type="number"
                  min={1}
                  max={730}
                  value={customWindowDays}
                  onChange={(e) => setCustomWindowDays(e.target.value)}
                  className="h-9 text-xs bg-black/40 border-zinc-700"
                />
              </div>
            ) : null}
          </div>
        </div>

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

        {loading ? (
          <div
            className="rounded-lg border border-teal-500/30 bg-teal-950/15 p-4 space-y-2"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-teal-100/95 font-medium leading-snug">
                {scanProgressStageLabel(scanProgress)}
              </span>
              <span className="tabular-nums text-zinc-500 shrink-0">{Math.min(100, Math.round(scanProgress))}%</span>
            </div>
            <Progress
              value={Math.min(100, scanProgress)}
              className="h-2.5 bg-zinc-800/90 [&>div]:bg-gradient-to-r [&>div]:from-teal-500 [&>div]:to-cyan-400"
            />
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Progress moves while the edge function runs (one request: candles → detection → Gemini). It is not a byte-accurate
              download meter; when it hits 100%, results below are the fresh scan.{" "}
              <span className="text-zinc-400">Live</span> appears on cards when the latest bar still matches and is inside the
              live time window for that chart interval.
            </p>
          </div>
        ) : null}

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
                  nowMs={nowMs}
                  liveWindowMs={liveWindowMsMain}
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
                      {new Date(item.scan_completed_at).toLocaleString(undefined, SCAN_DATETIME_OPTS)} ·{" "}
                      {item.signal_count} signals ·{" "}
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
                      {historyDetail.symbol} ·{" "}
                      {new Date(historyDetail.scan_completed_at).toLocaleString(undefined, SCAN_DATETIME_OPTS)} · Data{" "}
                      {historyDetail.data_source ?? "n/a"} · Indicators {historyDetail.indicator_source ?? "n/a"}
                    </p>

                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="grid gap-4 lg:grid-cols-2">
                        {pagedHistorySignals.map((row, i) => (
                          <SignalAnalysisCard
                            key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveHistorySignalPage}-${i}`}
                            row={row}
                            todayKey={todayKey}
                            nowMs={nowMs}
                            liveWindowMs={liveWindowMsHistory}
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
                      {new Date(historyDeleteTarget.scan_completed_at).toLocaleString(undefined, SCAN_DATETIME_OPTS)}.
                      This cannot be undone.
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
