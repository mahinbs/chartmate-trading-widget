import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  AlertTriangle,
  BarChart2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Loader2,
  Pause,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Zap,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  getOptionsStrategyLimits,
  isAtOptionsStrategyCap,
  optionsStrategyCapMessage,
} from "@/lib/optionsStrategyLimits";
import { OptionsStrategyBuilderDialog } from "@/components/options/OptionsStrategyBuilderDialog";
import { OptionsStrategyActivateDialog } from "@/components/options/OptionsStrategyActivateDialog";
import { OptionsPaperDashboard } from "@/components/options/OptionsPaperDashboard";
import { OptionChainViewer } from "@/components/options/OptionChainViewer";
import {
  fetchExpiryDates,
  instrumentTypeForUnderlying,
  isOptionsApiConfigured,
  type NormalizedExpiryItem,
} from "@/lib/optionsApi";
import {
  getTradingIntegration,
  isBrokerSessionLive,
  BROKER_SESSION_UPDATED_EVENT,
} from "@/services/openalgoIntegrationService";

// ── Types ─────────────────────────────────────────────────────────────────

export interface OptionsStrategy {
  id: string;
  name: string;
  description: string | null;
  underlying: string;
  exchange: string;
  instrument_type: string;
  expiry_type: string;
  strike_selection: string;
  option_type: string;
  trade_direction: string;
  strategy_style: string;
  entry_conditions: Record<string, unknown>;
  orb_config: Record<string, unknown>;
  exit_rules: Record<string, unknown>;
  risk_config: Record<string, unknown>;
  is_paper_only: boolean;
  is_active: boolean;
  strategy_state: Record<string, unknown>;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function styleLabel(style: string): string {
  const map: Record<string, string> = {
    buying: "Buying",
    selling: "Selling",
    spread: "Spread",
    straddle: "Straddle",
    strangle: "Strangle",
    iron_condor: "Iron Condor",
  };
  return map[style] ?? style;
}

function directionColor(dir: string): string {
  if (dir === "bullish") return "text-green-500";
  if (dir === "bearish") return "text-red-400";
  return "text-yellow-400";
}

function directionIcon(dir: string) {
  if (dir === "bullish") return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (dir === "bearish") return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <BarChart2 className="h-4 w-4 text-yellow-400" />;
}

// ── Component ─────────────────────────────────────────────────────────────

/** Core options UI — only used inside Algo & Options → Options strategies tab (not a separate nav route). */
export function OptionsStrategiesWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { subscription, hasAlgoAccess } = useSubscription();
  const planId = (subscription as any)?.plan_id ?? null;

  const [strategies, setStrategies] = useState<OptionsStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editStrategy, setEditStrategy] = useState<OptionsStrategy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OptionsStrategy | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chainViewStrategy, setChainViewStrategy] = useState<OptionsStrategy | null>(null);
  const [activateTarget, setActivateTarget] = useState<OptionsStrategy | null>(null);
  const [activateMode, setActivateMode] = useState<"paper" | "live">("paper");

  // Pre-fetched expiry data keyed by underlying symbol — populated as soon as broker is connected
  const [prefetchedExpiries, setPrefetchedExpiries] = useState<Record<string, NormalizedExpiryItem[]>>({});
  const [brokerConnected, setBrokerConnected] = useState(false);
  const prefetchedRef = useRef<Set<string>>(new Set());

  const limits = getOptionsStrategyLimits(planId);
  const atCap = isAtOptionsStrategyCap(strategies.length, limits);

  const fetchStrategies = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("options_strategies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load options strategies.");
    } else {
      setStrategies(data ?? []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  // ── Broker connection status ────────────────────────────────────────────────
  const checkBroker = useCallback(async () => {
    const { data } = await getTradingIntegration();
    setBrokerConnected(isBrokerSessionLive(data));
  }, []);

  useEffect(() => { void checkBroker(); }, [checkBroker]);

  useEffect(() => {
    const onUpd = () => void checkBroker();
    window.addEventListener(BROKER_SESSION_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(BROKER_SESSION_UPDATED_EVENT, onUpd);
  }, [checkBroker]);

  // ── Pre-fetch expiries for all strategy underlyings ───────────────────────
  useEffect(() => {
    if (!brokerConnected || !strategies.length) return;
    const uniqueKeys = [
      ...new Set(
        strategies.map((s) => {
          const inst = instrumentTypeForUnderlying(s.underlying);
          return `${s.underlying}|${s.exchange}|${inst}`;
        })
      ),
    ];
    for (const key of uniqueKeys) {
      if (prefetchedRef.current.has(key)) continue;
      prefetchedRef.current.add(key);
      const [symbol, exchange, instrument] = key.split("|");
      fetchExpiryDates({ symbol, exchange, instrument })
        .then((data) => {
          setPrefetchedExpiries((prev) => ({ ...prev, [symbol]: data.expiries }));
        })
        .catch(() => {
          prefetchedRef.current.delete(key); // allow retry on next render
        });
    }
  }, [brokerConnected, strategies]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await (supabase as any)
      .from("options_strategies")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error("Failed to delete strategy.");
    } else {
      toast.success(`"${deleteTarget.name}" deleted.`);
      setStrategies((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const handlePause = async (strategy: OptionsStrategy) => {
    const { error } = await (supabase as any)
      .from("options_strategies")
      .update({ is_active: false })
      .eq("id", strategy.id);
    if (error) {
      toast.error("Failed to pause strategy.");
    } else {
      setStrategies((prev) =>
        prev.map((s) => (s.id === strategy.id ? { ...s, is_active: false } : s)),
      );
      toast.success(`"${strategy.name}" paused.`);
    }
  };

  const openActivate = (strategy: OptionsStrategy, mode: "paper" | "live") => {
    setActivateMode(mode);
    setActivateTarget(strategy);
  };

  const finalizeActivation = () => {
    setActivateTarget(null);
    fetchStrategies();
  };


  if (!hasAlgoAccess) {
    const gate = (
      <Card className="max-w-md w-full text-center mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Algo Subscription Required
          </CardTitle>
          <CardDescription>
            Options strategies require an active Algo plan. Connect a broker for live execution; paper-only
            strategies work without a live session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/pricing?feature=options")}>
            Upgrade Plan
          </Button>
        </CardContent>
      </Card>
    );
    if (embedded) {
      return <div className="p-4">{gate}</div>;
    }
    return (
      <div className="flex h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6 flex items-center justify-center">{gate}</main>
      </div>
    );
  }

  const workspaceInner = (
    <>
        {!isOptionsApiConfigured() && (
          <div className="mx-6 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <strong className="font-semibold">End-to-end options API:</strong> set{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">VITE_OPTIONS_API_URL</code> to your
            hosted ChartMate Options API (FastAPI) URL so the app calls chain, orders, and live positions
            through that service → OpenAlgo → your broker. Until then, chain/expiry use Supabase Edge Functions
            where configured.
          </div>
        )}
        {/* Header */}
        <div className="border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Options Strategies
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Paper strategies always work. Live F&amp;O needs broker + OpenAlgo (same hub as equities — use{" "}
                <span className="text-zinc-300">Algo &amp; Options</span>).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={fetchStrategies}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (atCap && limits) {
                    toast.warning(optionsStrategyCapMessage(limits));
                    return;
                  }
                  setEditStrategy(null);
                  setShowBuilder(true);
                }}
                disabled={atCap}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Strategy
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Plan cap warning */}
          {atCap && limits && (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {optionsStrategyCapMessage(limits)}
              <Button
                variant="link"
                size="sm"
                className="ml-auto text-yellow-600 dark:text-yellow-400 p-0 h-auto"
                onClick={() => navigate("/pricing?feature=options")}
              >
                Upgrade
              </Button>
            </div>
          )}

          {/* Open paper positions */}
          <OptionsPaperDashboard onRefreshStrategies={fetchStrategies} />

          {/* Strategy list */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Your Strategies ({strategies.length})
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : strategies.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <Zap className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">No options strategies yet.</p>
                  <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                    Create your first strategy with ORB breakout, momentum, and options-specific exit rules.
                  </p>
                  <Button onClick={() => setShowBuilder(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create First Strategy
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {strategies.map((s) => (
                  <Card
                    key={s.id}
                    className={`transition-all ${s.is_active ? "border-primary/30" : "opacity-60"}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {directionIcon(s.trade_direction)}
                          <div className="min-w-0">
                            <CardTitle className="text-base truncate">{s.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {s.underlying} · {s.exchange} · {styleLabel(s.strategy_style)} ·{" "}
                              <span className={directionColor(s.trade_direction)}>
                                {s.trade_direction}
                              </span>
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.is_paper_only && (
                            <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400">
                              <FlaskConical className="h-3 w-3 mr-1" /> Paper
                            </Badge>
                          )}
                          <Badge
                            variant={s.is_active ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {s.is_active ? "Active" : "Paused"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0">
                      {/* Quick stats row */}
                      <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                        <div className="rounded bg-muted/40 px-2 py-1.5">
                          <p className="text-muted-foreground/70">Strike</p>
                          <p className="font-semibold">{s.strike_selection}</p>
                        </div>
                        <div className="rounded bg-muted/40 px-2 py-1.5">
                          <p className="text-muted-foreground/70">Expiry</p>
                          <p className="font-semibold capitalize">{s.expiry_type}</p>
                        </div>
                        <div className="rounded bg-muted/40 px-2 py-1.5">
                          <p className="text-muted-foreground/70">SL %</p>
                          <p className="font-semibold text-red-400">
                            {(s.exit_rules as any)?.sl_pct ?? 30}%
                          </p>
                        </div>
                        <div className="rounded bg-muted/40 px-2 py-1.5">
                          <p className="text-muted-foreground/70">TP %</p>
                          <p className="font-semibold text-green-400">
                            {(s.exit_rules as any)?.tp_pct ?? 50}%
                          </p>
                        </div>
                      </div>

                      {/* Expandable details */}
                      {expandedId === s.id && (
                        <div className="space-y-2 mt-2 text-xs border-t border-border/50 pt-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">ORB Duration</span>
                              <span>{(s.orb_config as any)?.orb_duration_mins ?? 15} min</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Momentum Bars</span>
                              <span>{(s.orb_config as any)?.momentum_bars ?? 3}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Time Exit</span>
                              <span>{(s.exit_rules as any)?.time_exit_hhmm ?? "15:15"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Re-entries</span>
                              <span>{(s.exit_rules as any)?.max_reentry_count ?? 1}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Trail After</span>
                              <span>{(s.exit_rules as any)?.trail_after_pct ?? 30}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Trail By</span>
                              <span>{(s.exit_rules as any)?.trail_pct ?? 15}%</span>
                            </div>
                          </div>
                          {s.description && (
                            <p className="text-muted-foreground/70 italic">{s.description}</p>
                          )}

                          {/* Live option chain button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-1 text-xs"
                            onClick={() => setChainViewStrategy(s)}
                          >
                            <BarChart2 className="h-3.5 w-3.5 mr-1" />
                            View Live Option Chain
                          </Button>
                        </div>
                      )}

                      {/* Action row */}
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                        >
                          {expandedId === s.id ? (
                            <><ChevronUp className="h-3.5 w-3.5 mr-1" />Less</>
                          ) : (
                            <><ChevronDown className="h-3.5 w-3.5 mr-1" />Details</>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => { setEditStrategy(s); setShowBuilder(true); }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
                          onClick={() => navigate("/backtest")}
                          title="Backtest in the Backtesting panel (Options ORB mode)"
                        >
                          <PlayCircle className="h-3 w-3 mr-1" />Backtest
                        </Button>

                        {s.is_active ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                            onClick={() => handlePause(s)}
                          >
                            <Pause className="h-3 w-3 mr-1" />Pause
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 px-2 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                              onClick={() => openActivate(s, "paper")}
                              title="Run as paper (simulated) trade today"
                            >
                              <FlaskConical className="h-3 w-3 mr-1" />Paper Trade
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs h-7 px-2 bg-primary/90 hover:bg-primary"
                              onClick={() => openActivate(s, "live")}
                              title="Activate for real live orders today"
                            >
                              <Zap className="h-3 w-3 mr-1" />Activate Live
                            </Button>
                          </>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-destructive hover:text-destructive ml-auto"
                          onClick={() => setDeleteTarget(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
    </>
  );

  return (
    <>
      {embedded ? (
        <div className="w-full overflow-auto pb-2">{workspaceInner}</div>
      ) : (
        <div className="flex h-screen bg-background">
          <DashboardSidebar />
          <main className="flex-1 overflow-auto">{workspaceInner}</main>
        </div>
      )}

      {/* Strategy Builder Dialog */}
      {showBuilder && (
        <OptionsStrategyBuilderDialog
          open={showBuilder}
          onOpenChange={(open) => {
            setShowBuilder(open);
            if (!open) setEditStrategy(null);
          }}
          editStrategy={editStrategy}
          onSaved={() => {
            setShowBuilder(false);
            setEditStrategy(null);
            fetchStrategies();
          }}
        />
      )}

      <OptionsStrategyActivateDialog
        open={!!activateTarget}
        onOpenChange={(o) => { if (!o) setActivateTarget(null); }}
        strategy={activateTarget}
        onActivated={finalizeActivation}
        mode={activateMode}
        prefetchedExpiries={activateTarget ? (prefetchedExpiries[activateTarget.underlying] ?? []) : []}
      />

      {/* Live Option Chain Viewer */}
      {chainViewStrategy && (
        <OptionChainViewer
          open={!!chainViewStrategy}
          onOpenChange={(open) => { if (!open) setChainViewStrategy(null); }}
          symbol={chainViewStrategy.underlying}
          exchange={chainViewStrategy.exchange}
          selectedStrikeOffset={chainViewStrategy.strike_selection}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Strategy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
              Open positions from this strategy will remain in active trades.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

