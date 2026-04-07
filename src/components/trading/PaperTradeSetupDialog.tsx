import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SymbolSearch, SymbolData } from "@/components/SymbolSearch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserStrategyRow = {
  id: string;
  name: string;
  description: string | null;
  paper_strategy_type: string | null;
  trading_mode: string | null;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  is_intraday: boolean | null;
  entry_conditions: Record<string, unknown> | null;
  exit_conditions: Record<string, unknown> | null;
  execution_days: string[] | null;
  position_config: Record<string, unknown> | null;
  start_time?: string | null;
  end_time?: string | null;
  squareoff_time?: string | null;
};

type Step = "strategy" | "instrument" | "schedule";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successfully queueing the paper trade */
  onCreated?: () => void;
  /**
   * When set (e.g. from a strategy card), loads that strategy by id — including paused —
   * and skips the strategy picker. Starts at Instrument + Schedule.
   */
  preselectedStrategyId?: string | null;
  /** Pre-filled symbol from Strategy scanner (Yahoo format, e.g. RELIANCE.NS) */
  initialSymbol?: string | null;
  /**
   * From scanner: single step — strategy locked, symbol locked, quantity + one button to queue
   * monitoring now (skips schedule step).
   */
  scannerQuickMode?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function describeEntryConditions(ec: Record<string, unknown> | null): string {
  if (!ec) return "No entry conditions defined";
  const groups = (ec.groups as Array<{ conditions?: unknown[] }> | null) ?? [];
  const count = groups.reduce((s, g) => s + (Array.isArray(g?.conditions) ? g.conditions.length : 0), 0);
  if (count === 0) {
    if (ec.clockEntryTime) return `Time-based entry at ${ec.clockEntryTime}`;
    return "Custom entry conditions";
  }
  return `${count} indicator condition${count !== 1 ? "s" : ""} (${String(ec.groupLogic ?? "AND")})`;
}

function describeExitConditions(ex: Record<string, unknown> | null): string {
  if (!ex) return "No exit conditions — manual close only";
  if (ex.autoExitEnabled === false) return "Manual close only (auto-exit disabled)";
  const parts: string[] = [];
  if (ex.clockExitTime) parts.push(`Exit at ${ex.clockExitTime}`);
  if (ex.indicatorGroups) {
    const gs = ex.indicatorGroups as Array<{ conditions?: unknown[] }>;
    const cnt = gs.reduce((s, g) => s + (Array.isArray(g?.conditions) ? g.conditions.length : 0), 0);
    if (cnt > 0) parts.push(`${cnt} exit indicator${cnt !== 1 ? "s" : ""}`);
  }
  return parts.length > 0 ? parts.join(", ") : "Reversal signal exit";
}

function formatConditionOperand(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v !== "object") return String(v);
  const o = v as Record<string, unknown>;
  const k = String(o.kind ?? "");
  if (k === "number" && o.value != null) return String(o.value);
  if (k === "indicator") {
    const id = String(o.id ?? o.indicator ?? "indicator").trim();
    const period = o.period != null ? String(o.period) : "";
    return period ? `${id}(${period})` : id;
  }
  try {
    const s = JSON.stringify(o);
    return s.length > 96 ? `${s.slice(0, 93)}…` : s;
  } catch {
    return "[value]";
  }
}

/** Readable lines from saved entry JSON (same shape as algo builder). */
function collectEntrySummaryLines(entry: unknown): string[] {
  if (!entry || typeof entry !== "object") return [];
  const e = entry as Record<string, unknown>;
  const out: string[] = [];
  const preset = String(e.algoGuidePreset ?? "").trim();
  if (preset) {
    out.push(`Built-in rule pack: ${preset.replace(/_/g, " ")}`);
  }
  const groups = Array.isArray(e.groups) ? (e.groups as Array<Record<string, unknown>>) : [];
  if (groups.length > 0) {
    out.push(`Group logic: ${String(e.groupLogic ?? "AND").toUpperCase()}`);
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i];
      const conds = Array.isArray(g.conditions) ? g.conditions : [];
      out.push(`Group ${i + 1}: ${String(g.groupLogic ?? "AND").toUpperCase()} · ${conds.length} condition(s)`);
      for (const c of conds.slice(0, 12)) {
        const cc = c as Record<string, unknown>;
        const indName = String(
          cc.indicator ?? cc.leftOperand ?? cc.left ?? cc.lhs ?? cc.field ?? "",
        ).trim();
        const indPeriod = cc.period != null && indName ? `(${cc.period})` : "";
        const indicator = `${indName}${indPeriod}`.trim() || "rule";
        const operator = String(
          cc.operator ?? cc.comparator ?? cc.op ?? cc.condition ?? "compare",
        ).trim();
        const rawRight = cc.value ?? cc.rightOperand ?? cc.right ?? cc.rhs ?? cc.threshold ?? null;
        const right = formatConditionOperand(rawRight);
        if (!indName && !operator && !right) {
          out.push(`- ${JSON.stringify(cc)}`);
        } else if (!right) {
          out.push(`- ${indicator} ${operator}`.trim());
        } else {
          out.push(`- ${indicator} ${operator} ${right}`.trim());
        }
      }
    }
    return out;
  }
  const timeEntry = String(e.clockEntryTime ?? "").trim();
  if (timeEntry) out.push(`Clock entry time: ${timeEntry}`);
  const mode = String(e.executionMode ?? "").trim();
  if (mode) out.push(`Execution mode: ${mode}`);
  const raw = String(e.rawExpression ?? e.customConditionRaw ?? "").trim();
  if (raw) out.push(`Raw rule: ${raw.slice(0, 260)}${raw.length > 260 ? "…" : ""}`);
  if (out.length === 0) {
    try {
      const s = JSON.stringify(e);
      out.push(s.length > 280 ? `Saved entry config: ${s.slice(0, 277)}…` : `Saved entry config: ${s}`);
    } catch {
      out.push("Entry rules exist but could not be summarized.");
    }
  }
  return out;
}

function simplifyEntrySummaryLine(line: string): string {
  if (line.startsWith("Built-in rule pack:")) {
    return `Uses built-in rules: ${line.replace("Built-in rule pack:", "").trim()}`;
  }
  if (line.startsWith("Group logic:")) {
    if (line.toUpperCase().includes("OR")) return "Across groups: at least one group must pass (OR).";
    return "Across groups: every group must pass (AND).";
  }
  const gm = line.match(/^Group (\d+): (\w+) · (\d+) condition\(s\)/);
  if (gm) {
    const inner = gm[2] === "OR" ? "Any check in this group can qualify" : "Every check in this group must pass";
    return `Group ${gm[1]} (${gm[2]}): ${inner} — ${gm[3]} condition(s).`;
  }
  if (line.startsWith("- ")) return line.slice(2).replace(/_/g, " ");
  return line.replace(/_/g, " ");
}

function collectExitSummaryLines(ex: unknown): string[] {
  if (!ex || typeof ex !== "object") {
    return ["No separate exit JSON — stops/targets from the strategy card apply if set."];
  }
  const e = ex as Record<string, unknown>;
  if (e.autoExitEnabled === false) {
    return ["Auto-exit is turned off — you close the paper trade yourself."];
  }
  const out: string[] = [];
  const clock = String(e.clockExitTime ?? "").trim();
  if (clock) out.push(`Clock exit / square-off time: ${clock}.`);
  const tp = e.takeProfitPct;
  const sl = e.stopLossPct;
  if (tp != null && Number(tp) > 0) out.push(`Exit block includes take-profit near ${tp}%.`);
  if (sl != null && Number(sl) > 0) out.push(`Exit block includes stop-loss near ${sl}%.`);
  if (e.trailingStop) {
    const p = e.trailingStopPct;
    out.push(`Trailing stop${p != null ? ` (~${p}%)` : ""}.`);
  }
  if (e.timeBasedExit && e.exitAfterMinutes != null) {
    out.push(`Time-based exit after about ${e.exitAfterMinutes} minutes in the trade.`);
  }
  const ig = Array.isArray(e.indicatorGroups) ? (e.indicatorGroups as Array<Record<string, unknown>>) : [];
  for (let gi = 0; gi < ig.length; gi++) {
    const g = ig[gi];
    const conds = Array.isArray(g.conditions) ? g.conditions : [];
    if (conds.length === 0) continue;
    out.push(
      `Exit indicator group ${gi + 1} (${String(g.groupLogic ?? "AND")}): ${conds.length} condition(s).`,
    );
    for (const c of conds.slice(0, 10)) {
      const cc = c as Record<string, unknown>;
      const indName = String(cc.indicator ?? cc.leftOperand ?? cc.left ?? cc.lhs ?? cc.field ?? "").trim();
      const indPeriod = cc.period != null && indName ? `(${cc.period})` : "";
      const indicator = `${indName}${indPeriod}`.trim() || "rule";
      const operator = String(cc.operator ?? cc.comparator ?? cc.op ?? cc.condition ?? "").trim();
      const rawRight = cc.value ?? cc.rightOperand ?? cc.right ?? cc.rhs ?? cc.threshold ?? null;
      const right = formatConditionOperand(rawRight);
      if (indName || operator || right) {
        out.push(`${indicator} ${operator || "—"} ${right}`.trim());
      }
    }
  }
  if (out.length === 0) {
    out.push("Exits use your strategy defaults (stop / target / reversal) once you are in a trade.");
  }
  return out;
}

function formatExecutionDays(days: string[]): string {
  return days
    .map((d) => {
      const x = String(d).trim();
      if (!x) return "";
      return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(", ");
}

function paperTradeScheduleSummary(strategy: UserStrategyRow | null): {
  entryLines: string[];
  exitLines: string[];
  sessionLines: string[];
  directionLine: string;
} {
  if (!strategy) {
    return { entryLines: [], exitLines: [], sessionLines: [], directionLine: "—" };
  }
  const rawEntry = collectEntrySummaryLines(strategy.entry_conditions);
  const entryLines =
    rawEntry.length > 0
      ? rawEntry.map(simplifyEntrySummaryLine)
      : [describeEntryConditions(strategy.entry_conditions)];
  const exitLines = collectExitSummaryLines(strategy.exit_conditions);
  const sessionLines: string[] = [];
  const st = String(strategy.start_time ?? "").trim();
  const en = String(strategy.end_time ?? "").trim();
  if (st && en) sessionLines.push(`Session window: ${st}–${en}.`);
  const sq = String(strategy.squareoff_time ?? "").trim();
  if (sq && sq !== en) sessionLines.push(`Square-off time: ${sq}.`);
  const days = Array.isArray(strategy.execution_days) ? strategy.execution_days : [];
  if (days.length > 0) sessionLines.push(`Trading days: ${formatExecutionDays(days)}.`);
  sessionLines.push(strategy.is_intraday ? "Intraday strategy." : "Positional / multi-day allowed.");
  if (strategy.stop_loss_pct != null) {
    sessionLines.push(`Stop loss on the strategy: ${strategy.stop_loss_pct}%.`);
  }
  if (strategy.take_profit_pct != null) {
    sessionLines.push(`Take profit on the strategy: ${strategy.take_profit_pct}%.`);
  }
  const desc = String(strategy.description ?? "").trim();
  if (desc) {
    sessionLines.push(desc.length > 320 ? `${desc.slice(0, 317)}…` : desc);
  }
  const m = String(strategy.trading_mode ?? "BOTH").toUpperCase();
  const directionLine =
    m === "LONG"
      ? "Only long entries when conditions align."
      : m === "SHORT"
        ? "Only short entries when conditions align."
        : "Long or short — whichever live entry signal matches first.";
  return { entryLines, exitLines, sessionLines, directionLine };
}

// Convert local datetime-local input value to ISO UTC string
function localDatetimeToUtc(value: string): string {
  // value is "YYYY-MM-DDTHH:MM" in local time
  return new Date(value).toISOString();
}

// Minimum datetime-local value: 2 minutes from now
function minScheduleDatetime(): string {
  const d = new Date(Date.now() + 2 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** DB column `action` must be BUY|SELL. BOTH strategies store BUY as placeholder; execution uses live signal side. */
function pendingRowActionFromTradingMode(tradingMode: string | null): "BUY" | "SELL" {
  const m = String(tradingMode ?? "BOTH").toUpperCase();
  return m === "SHORT" ? "SELL" : "BUY";
}

// ── Component ─────────────────────────────────────────────────────────────────

const STRATEGY_SELECT =
  "id,name,description,paper_strategy_type,trading_mode,stop_loss_pct,take_profit_pct,is_intraday,entry_conditions,exit_conditions,execution_days,position_config,start_time,end_time,squareoff_time";

export function PaperTradeSetupDialog({
  open,
  onOpenChange,
  onCreated,
  preselectedStrategyId,
  initialSymbol,
  scannerQuickMode = false,
}: Props) {
  const { toast } = useToast();
  const presetId = preselectedStrategyId?.trim() || null;
  const initialSymTrim = initialSymbol?.trim() || null;
  const quick = Boolean(scannerQuickMode && presetId && initialSymTrim);

  // Step state
  const [step, setStep] = useState<Step>("strategy");

  // Step 1: strategy
  const [strategies, setStrategies] = useState<UserStrategyRow[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<UserStrategyRow | null>(null);

  // Step 2: instrument
  const [symbolValue, setSymbolValue] = useState("");
  const [symbolData, setSymbolData] = useState<SymbolData | null>(null);
  const [quantity, setQuantity] = useState("1");

  // Step 3: schedule
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleDatetime, setScheduleDatetime] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);

  const isPreset = Boolean(presetId);

  const stepLabels = useMemo(() => {
    if (isPreset && quick) {
      return [{ id: "instrument" as const, label: "Quantity" }];
    }
    if (isPreset) {
      return [
        { id: "instrument" as const, label: "Instrument" },
        { id: "schedule" as const, label: "Schedule" },
      ];
    }
    return [
      { id: "strategy" as const, label: "Strategy" },
      { id: "instrument" as const, label: "Instrument" },
      { id: "schedule" as const, label: "Schedule" },
    ];
  }, [isPreset, quick]);

  const stepIndex = stepLabels.findIndex((s) => s.id === step);

  const scheduleSummary = useMemo(
    () => paperTradeScheduleSummary(selectedStrategy),
    [selectedStrategy],
  );

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("strategy");
      setSelectedStrategy(null);
      setStrategies([]);
      setSymbolValue("");
      setSymbolData(null);
      setQuantity("1");
      setScheduleMode("now");
      setScheduleDatetime("");
    }
  }, [open]);

  // Load when dialog opens: either single strategy (preset) or active list for picker
  useEffect(() => {
    if (!open) return;
    setStrategiesLoading(true);
    (async () => {
      try {
        if (presetId) {
          const { data, error } = await (supabase as any)
            .from("user_strategies")
            .select(STRATEGY_SELECT)
            .eq("id", presetId)
            .maybeSingle();
          if (error || !data) {
            toast({
              title: "Strategy not found",
              description: "This strategy may have been deleted.",
              variant: "destructive",
            });
            onOpenChange(false);
            return;
          }
          setSelectedStrategy(data as UserStrategyRow);
          setStep("instrument");
          if (initialSymTrim) setSymbolValue(initialSymTrim);
          setStrategies([]);
        } else {
          setSelectedStrategy(null);
          setStep("strategy");
          const { data, error } = await (supabase as any)
            .from("user_strategies")
            .select(STRATEGY_SELECT)
            .eq("is_active", true)
            .order("created_at", { ascending: false });
          if (!error && data) setStrategies(data as UserStrategyRow[]);
          else setStrategies([]);
        }
      } finally {
        setStrategiesLoading(false);
      }
    })();
  }, [open, presetId, initialSymTrim, onOpenChange, toast]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (step === "strategy") {
      if (!selectedStrategy) {
        toast({ title: "Select a strategy", description: "Pick a saved strategy to continue.", variant: "destructive" });
        return;
      }
      setStep("instrument");
    } else if (step === "instrument") {
      const sym = symbolData?.full_symbol || symbolValue.trim();
      if (!sym) {
        toast({ title: "Symbol required", description: "Search and select a symbol.", variant: "destructive" });
        return;
      }
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast({ title: "Invalid quantity", description: "Enter a positive quantity.", variant: "destructive" });
        return;
      }
      setStep("schedule");
    }
  }, [step, selectedStrategy, symbolData, symbolValue, quantity, toast]);

  const goBack = useCallback(() => {
    if (step === "instrument") {
      if (isPreset) onOpenChange(false);
      else setStep("strategy");
    } else if (step === "schedule") {
      setStep("instrument");
    }
  }, [step, isPreset, onOpenChange]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedStrategy) return;
    const sym = symbolData?.full_symbol || symbolValue.trim();
    const qty = Math.max(1, Math.round(Number(quantity)));
    if (!sym || !qty) return;

    const schedMode = quick ? "now" : scheduleMode;

    const positionConfig = selectedStrategy.position_config as Record<string, unknown> | null;

    let scheduledFor: string | null = null;
    let initialStatus: "pending" | "scheduled" = "pending";
    if (schedMode === "later") {
      if (!scheduleDatetime) {
        toast({ title: "Schedule time required", description: "Pick a future date and time.", variant: "destructive" });
        return;
      }
      scheduledFor = localDatetimeToUtc(scheduleDatetime);
      initialStatus = "scheduled";
    }

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");

      const symUpperCheck = sym.toUpperCase();
      let exchange = String(
        (positionConfig?.exchange ?? symbolData?.exchange ?? "NSE"),
      ).toUpperCase();
      if (symUpperCheck.includes("-USD") || symUpperCheck.includes("-USDT")) {
        exchange = "CRYPTO";
      }
      let product = String(
        (positionConfig?.orderProduct ?? (selectedStrategy.is_intraday ? "MIS" : "CNC")),
      ).toUpperCase();
      if (exchange === "CRYPTO") product = "SPOT";

      const rowAction = pendingRowActionFromTradingMode(selectedStrategy.trading_mode);

      const { error } = await (supabase as any)
        .from("pending_conditional_orders")
        .insert({
          user_id: session.user.id,
          strategy_id: selectedStrategy.id,
          symbol: sym.toUpperCase().replace(/\.NS$/i, "").replace(/\.BO$/i, ""),
          exchange,
          action: rowAction,
          quantity: qty,
          product,
          paper_strategy_type: selectedStrategy.paper_strategy_type ?? "trend_following",
          status: initialStatus,
          is_paper_trade: true,
          scheduled_for: scheduledFor,
          expires_at: null,
        });

      if (error) throw error;

      toast({
        title: schedMode === "now" ? "Paper strategy activated" : "Paper trade scheduled",
        description:
          schedMode === "now"
            ? `Watching ${sym} for ${selectedStrategy.name} entry conditions…`
            : `Will start monitoring ${sym} at ${new Date(scheduledFor!).toLocaleString()}.`,
      });

      onOpenChange(false);
      onCreated?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not queue paper trade.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedStrategy,
    symbolData,
    symbolValue,
    quantity,
    scheduleMode,
    scheduleDatetime,
    quick,
    onOpenChange,
    onCreated,
    toast,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-full">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-teal-400" />
            <DialogTitle>{isPreset ? "Strategy paper trade" : "New Paper Trade"}</DialogTitle>
          </div>
          <DialogDescription>
            Entry and exit will happen automatically when your strategy conditions are met in real-time.
          </DialogDescription>
        </DialogHeader>

        {/* Step progress — hidden until preset strategy row is loaded */}
        {(!isPreset || selectedStrategy) && (
        <div className="flex items-center gap-1 mt-1">
          {stepLabels.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 flex-1">
              <div
                className={cn(
                  "flex items-center justify-center rounded-full text-xs font-bold w-6 h-6 shrink-0",
                  i < stepIndex
                    ? "bg-teal-500 text-black"
                    : i === stepIndex
                      ? "bg-teal-500/20 text-teal-400 border border-teal-500/40"
                      : "bg-white/5 text-muted-foreground border border-white/10",
                )}
              >
                {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs truncate",
                  i === stepIndex ? "text-teal-400 font-medium" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < stepLabels.length - 1 && (
                <div className={cn("flex-1 h-px mx-1", i < stepIndex ? "bg-teal-500/50" : "bg-white/10")} />
              )}
            </div>
          ))}
        </div>
        )}

        {isPreset && strategiesLoading && !selectedStrategy ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
          </div>
        ) : null}

        {/* ── Step 1: Strategy ── */}
        {!isPreset && step === "strategy" && (
          <div className="space-y-3 mt-2 max-h-[55vh] overflow-y-auto pr-1">
            {strategiesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
              </div>
            ) : strategies.length === 0 ? (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <AlertDescription className="text-amber-300 text-sm">
                  No active strategies found. Create a strategy in{" "}
                  <a href="/strategies" className="underline font-medium">
                    Strategies
                  </a>{" "}
                  first, then come back here.
                </AlertDescription>
              </Alert>
            ) : (
              strategies.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStrategy(s)}
                  className={cn(
                    "w-full text-left rounded-xl border p-4 transition-colors",
                    selectedStrategy?.id === s.id
                      ? "border-teal-500/60 bg-teal-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-white">{s.name}</span>
                        {s.is_intraday && (
                          <Badge className="text-[9px] bg-violet-500/20 text-violet-300 border-violet-500/30 border">
                            Intraday
                          </Badge>
                        )}
                        {s.trading_mode && (
                          <Badge variant="outline" className="text-[9px] border-white/20 text-zinc-400">
                            {s.trading_mode}
                          </Badge>
                        )}
                      </div>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
                      )}
                      <div className="mt-2 space-y-0.5">
                        <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                          <BookOpen className="h-3 w-3 shrink-0" />
                          <span>{describeEntryConditions(s.entry_conditions)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{describeExitConditions(s.exit_conditions)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {s.stop_loss_pct != null && (
                        <span className="text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                          SL {s.stop_loss_pct}%
                        </span>
                      )}
                      {s.take_profit_pct != null && (
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                          TP {s.take_profit_pct}%
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Step 2: Instrument ── */}
        {step === "instrument" && (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Symbol</Label>
              {quick && initialSymTrim ? (
                <div className="space-y-1">
                  <div className="rounded-md border border-teal-500/30 bg-teal-950/20 px-3 py-2.5 text-sm text-teal-100 font-mono">
                    {initialSymTrim}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Locked to this scanner run — change symbol by closing and selecting another ticker above.
                  </p>
                </div>
              ) : (
                <SymbolSearch
                  value={symbolValue}
                  onValueChange={setSymbolValue}
                  onSelectSymbol={setSymbolData}
                  placeholder="Search symbol (NSE, BSE, crypto, forex)"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-qty">Quantity</Label>
              <Input
                id="pt-qty"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>

            {selectedStrategy && (
              <div className="rounded-lg bg-zinc-900/60 border border-white/10 p-3 text-xs text-zinc-400 space-y-0.5">
                <p className="text-zinc-300 font-medium">{selectedStrategy.name}</p>
                {selectedStrategy.trading_mode && (
                  <p className="text-zinc-500">
                    Direction:{" "}
                    <span className="text-zinc-300">{String(selectedStrategy.trading_mode).toUpperCase()}</span>
                    {String(selectedStrategy.trading_mode).toUpperCase() === "BOTH" && (
                      <span> — entry side follows whichever live signal fires first</span>
                    )}
                  </p>
                )}
                <p>{describeEntryConditions(selectedStrategy.entry_conditions)}</p>
                <p>{describeExitConditions(selectedStrategy.exit_conditions)}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Schedule ── */}
        {step === "schedule" && (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScheduleMode("now")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  scheduleMode === "now"
                    ? "border-teal-500/60 bg-teal-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
              >
                <Play className="h-5 w-5 text-teal-400 mb-2" />
                <p className="font-semibold text-sm text-white">Start Now</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Begin watching for entry conditions immediately.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode("later")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  scheduleMode === "later"
                    ? "border-violet-500/60 bg-violet-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
              >
                <Calendar className="h-5 w-5 text-violet-400 mb-2" />
                <p className="font-semibold text-sm text-white">Schedule</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Activate at a specific date &amp; time.
                </p>
              </button>
            </div>

            {scheduleMode === "later" && (
              <div className="space-y-2">
                <Label htmlFor="pt-schedule">Start monitoring at</Label>
                <Input
                  id="pt-schedule"
                  type="datetime-local"
                  min={minScheduleDatetime()}
                  value={scheduleDatetime}
                  onChange={(e) => setScheduleDatetime(e.target.value)}
                  className="bg-zinc-900 border-white/10"
                />
                <p className="text-[11px] text-muted-foreground">
                  Condition scanning begins at this time. Entry fires as soon as conditions are met after that.
                </p>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg bg-zinc-900/60 border border-white/10 p-3 space-y-3 text-xs max-h-[52vh] overflow-y-auto">
              <p className="text-zinc-300 font-medium">Summary</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-zinc-400">
                  <span>Strategy</span>
                  <span className="text-white font-medium text-right">{selectedStrategy?.name}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-zinc-400">
                  <span>Symbol</span>
                  <span className="text-white font-medium text-right">
                    {symbolData?.full_symbol || symbolValue || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Quantity</span>
                  <span className="text-white font-medium">{quantity}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Activation</span>
                  <span className="text-white font-medium">
                    {scheduleMode === "now"
                      ? "Immediately"
                      : scheduleDatetime
                        ? new Date(scheduleDatetime).toLocaleString()
                        : "—"}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Session &amp; sizing
                </p>
                <ul className="space-y-1 text-[11px] text-zinc-400 leading-snug list-disc pl-4">
                  {scheduleSummary.sessionLines.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  When entry can happen
                </p>
                <ul className="space-y-1 text-[11px] text-zinc-400 leading-snug list-disc pl-4">
                  <li className="text-zinc-300">{scheduleSummary.directionLine}</li>
                  {scheduleSummary.entryLines.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  When exit can happen
                </p>
                <ul className="space-y-1 text-[11px] text-zinc-400 leading-snug list-disc pl-4">
                  {scheduleSummary.exitLines.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>

            <Alert className="border-teal-500/20 bg-teal-500/5 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" />
              <AlertDescription className="text-xs text-teal-300">
                Entry will only happen when strategy conditions are met — no immediate entry. You can cancel anytime from the Pending Paper Strategies panel.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 pt-2">
          <div>
            {step !== "strategy" && (
              <Button variant="ghost" size="sm" onClick={goBack} disabled={submitting}>
                <ArrowLeft className="h-4 w-4 mr-1" /> {isPreset && step === "instrument" ? "Close" : "Back"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            {quick && step === "instrument" ? (
              <Button
                size="sm"
                onClick={() => void handleSubmit()}
                disabled={
                  submitting ||
                  (isPreset && strategiesLoading && !selectedStrategy) ||
                  !symbolValue.trim() ||
                  !Number.isFinite(Number(quantity)) ||
                  Number(quantity) <= 0
                }
                className="shadow-[0_0_20px_rgba(20,184,166,0.2)]"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <FlaskConical className="h-4 w-4 mr-1" />
                )}
                Queue paper trade
              </Button>
            ) : step !== "schedule" ? (
              <Button
                size="sm"
                onClick={goNext}
                disabled={
                  (step === "strategy" && (strategies.length === 0 || strategiesLoading)) ||
                  (isPreset && strategiesLoading && !selectedStrategy)
                }
              >
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || (scheduleMode === "later" && !scheduleDatetime)}
                className="shadow-[0_0_20px_rgba(20,184,166,0.2)]"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <FlaskConical className="h-4 w-4 mr-1" />
                )}
                {scheduleMode === "now" ? "Activate Strategy" : "Schedule Trade"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
