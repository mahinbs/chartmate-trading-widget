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
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import { Loader2, Sparkles, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
};

export function StrategyEntrySignalsPanel({
  symbol,
  postAnalysis,
  requirePostAnalysis = false,
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
        const data = (res.data as { strategies?: CustomStrategy[] } | null)?.strategies ?? [];
        if (!cancelled) setCustomStrategies(data);
      } catch {
        if (!cancelled) setCustomStrategies([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    } catch (e: unknown) {
      toast({
        title: "Scan failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [symbol, selected, selectedCustom, customStrategies, postAnalysis, requirePostAnalysis, toast, todayKey]);

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
      hour: "2-digit", minute: "2-digit",
    });
  };

  const visibleSignals = useMemo(() => signals, [signals]);

  const counts = useMemo(() => {
    const predicted = signals.filter((s) => s.isPredicted);
    const live = signals.filter((s) => s.isLive);
    const todays = signals.filter((s) => s.entryDate === todayKey && !s.isPredicted);
    const history = signals.filter((s) => !s.isLive && !s.isPredicted && s.entryDate !== todayKey);
    return {
      total: signals.length,
      predicted: predicted.length,
      today: todays.length,
      live: live.length,
      history: history.length,
      buyTotal: signals.filter((s) => s.side === "BUY").length,
      sellTotal: signals.filter((s) => s.side === "SELL").length,
    };
  }, [signals, todayKey]);

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
          <Target className="h-4 w-4 text-teal-400" />
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
      </CardHeader>

      <CardContent className="space-y-4">
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
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Built-in strategies</p>
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
            <p className="text-[10px] uppercase tracking-wide text-purple-300">
              Your custom strategies ({customStrategies.length})
            </p>
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
                  <th className="p-2 text-right">Score</th>
                  <th className="p-2">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {visibleSignals.map((row, i) => (
                  <tr
                    key={`${row.strategyId}-${row.entryDate}-${row.side}-${i}`}
                    className={`border-b border-white/5 ${
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
                    <td className="p-2 text-right font-mono text-teal-400">{row.probabilityScore}</td>
                    <td className="p-2">
                      <Badge variant={verdictVariant(row.verdict)} className="text-[10px]">
                        {row.verdict}
                      </Badge>
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
                  <span className={sideClass(row.side)}>{row.side === "BUY" ? "↑" : "↓"}</span>{" "}
                  <span className="text-white/80">{row.strategyLabel}</span> · {formatEntry(row)}: {row.rationale}
                </p>
              ))}
            </div>
          </div>
        )}

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
      </CardContent>
    </Card>
  );
}
