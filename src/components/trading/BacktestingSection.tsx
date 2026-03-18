/**
 * Algo Trading only — VectorBT backtest via OpenAlgo (E2E).
 * Strategy (built-in or custom) or simple BUY/SELL on any symbol; real OHLC via OpenAlgo (broker → Historify → Yahoo).
 * Optional Gemini review: SL/TP/session timing vs backtest results.
 */
import { useEffect, useState, useCallback } from "react";
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
import { BarChart3, Brain, ChevronLeft, ChevronRight, Loader2, LineChart, Search } from "lucide-react";
import { toast } from "sonner";

const EXCHANGES = ["NSE", "BSE", "NFO", "MCX", "CDS"];

type SymbolResult = {
  symbol: string;
  exchange: string;
  type: string;
  description?: string;
  full_symbol?: string;
};

function SymbolSearchInput({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (symbol: string, exchange: string) => void;
}) {
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useState<{ t?: ReturnType<typeof setTimeout> }>({})[0];

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const data: SymbolResult[] = (res.data as any[]) ?? [];
      const indian = data.filter(d => d.full_symbol?.endsWith(".NS") || d.full_symbol?.endsWith(".BO"));
      setResults(indian.slice(0, 10));
      setOpen(indian.length > 0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    onChange(v);
    if (debounceRef.t) clearTimeout(debounceRef.t);
    debounceRef.t = setTimeout(() => search(v), 250);
  };

  const handleSelect = (item: SymbolResult) => {
    const ex = item.full_symbol?.endsWith(".BO") ? "BSE" : "NSE";
    onSelect(item.symbol, ex);
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <Input
          placeholder="Search symbol…"
          value={value}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="bg-zinc-800 border-zinc-700 font-mono text-sm pl-8 pr-8 uppercase"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden">
          {results.map((r) => (
            <button
              key={String(r.full_symbol ?? r.symbol)}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-zinc-100 text-xs">{r.symbol}</span>
                  <span className="text-[10px] text-zinc-500">{r.full_symbol?.endsWith(".BO") ? "BSE" : "NSE"}</span>
                </div>
                {r.description ? (
                  <div className="text-[10px] text-zinc-500 truncate">{r.description}</div>
                ) : null}
              </div>
              <span className="text-[10px] text-zinc-600 shrink-0">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BacktestingSection() {
  const [mode, setMode] = useState<"strategy" | "simple">("strategy");
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState("NSE");
  const [strategy, setStrategy] = useState("trend_following");
  const [customStrategies, setCustomStrategies] = useState<Array<{ id: string; name: string; stop_loss_pct?: number | null; take_profit_pct?: number | null }>>([]);
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
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [timingReview, setTimingReview] = useState<string | null>(null);
  const [tradesPage, setTradesPage] = useState(1);
  const tradesPerPage = 10;
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 10;

  const selectedCustom = customStrategies.find(s => s.id === selectedCustomId) ?? null;
  const stratLabel =
    selectedCustom?.name
    ?? STRATEGIES.find(s => s.value === strategy)?.label
    ?? strategy;

  const loadCustomStrategies = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_strategies" as any)
        .select("id,name,stop_loss_pct,take_profit_pct,is_active,updated_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      setCustomStrategies((Array.isArray(data) ? (data as any[]) : []) as any);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadCustomStrategies();
  }, [loadCustomStrategies]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("backtest_runs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error) setHistory(Array.isArray(data) ? data : []);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const runVectorBt = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      toast.error("Enter a symbol");
      return;
    }
    setLoading(true);
    setResult(null);
    setTimingReview(null);
    setTradesPage(1);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("backtest-vectorbt", {
        body: {
          symbol: sym,
          exchange,
          strategy: mode === "strategy"
            ? (selectedCustom ? "trend_following" : strategy)
            : "trend_following",
          action,
          days: Math.min(730, Math.max(30, parseInt(days, 10) || 365)),
          stop_loss_pct: parseFloat(slPct) || 2,
          take_profit_pct: parseFloat(tpPct) || 4,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = res.data as Record<string, unknown>;
      if (res.error || d?.error) {
        toast.error(String(d?.error ?? "Backtest failed"));
        return;
      }
      setResult(d);
      // Save historical record
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const trades = Array.isArray((d as any).trades) ? (d as any).trades : [];
          await supabase.from("backtest_runs" as any).insert({
            user_id: user.id,
            symbol: sym,
            exchange,
            action,
            mode,
            strategy_label: mode === "strategy" ? stratLabel : `Simple ${action}`,
            params: {
              stop_loss_pct: parseFloat(slPct) || 2,
              take_profit_pct: parseFloat(tpPct) || 4,
              days: Math.min(730, Math.max(30, parseInt(days, 10) || 365)),
              session_start: startTime,
              session_end: endTime,
              squareoff_time: squareoff,
            },
            summary: {
              totalTrades: d.totalTrades,
              winRate: d.winRate,
              totalReturn: d.totalReturn,
              maxDrawdown: d.maxDrawdown,
              profitFactor: d.profitFactor,
              sharpeRatio: d.sharpeRatio,
              backtestPeriod: d.backtestPeriod,
              strategyAchieved: d.strategyAchieved,
            },
            trades,
          });
          loadHistory();
        }
      } catch {
        // non-fatal
      }
      toast.success(`Backtest ready · ${d.totalTrades} trades`);
    } catch {
      toast.error("Backtest failed");
    } finally {
      setLoading(false);
    }
  }, [symbol, exchange, strategy, action, slPct, tpPct, days, mode, selectedCustom]);

  const runTimingReview = useCallback(async () => {
    if (!result) {
      toast.error("Run backtest first");
      return;
    }
    const sym = symbol.trim().toUpperCase();
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("analyze-trade", {
        body: {
          symbol: sym,
          exchange,
          action,
          quantity: 1,
          product: mode === "strategy" && !selectedCustom && STRATEGIES.find(s => s.value === strategy)?.product === "MIS" ? "MIS" : "CNC",
          timing_review: {
            mode: mode === "strategy" ? (selectedCustom ? "custom_strategy" : "preset_strategy") : "simple_trade",
            strategy_label: mode === "strategy" ? stratLabel : undefined,
            stop_loss_pct: parseFloat(slPct) || 2,
            take_profit_pct: parseFloat(tpPct) || 4,
            session_start: startTime,
            session_end: endTime,
            squareoff_time: squareoff,
            vectorbt: {
              totalTrades: result.totalTrades,
              winRate: result.winRate,
              totalReturn: result.totalReturn,
              sharpeRatio: result.sharpeRatio,
              data_source: result.data_source,
              strategyAchieved: result.strategyAchieved,
            },
          },
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const txt = String((res.data as any)?.analysis ?? "No review returned.");
      setTimingReview(txt);
      toast.info("SL/TP & timing review ready", { duration: 8000 });
    } catch {
      toast.error("Review failed");
    } finally {
      setAiLoading(false);
    }
  }, [result, symbol, exchange, action, slPct, tpPct, startTime, endTime, squareoff, mode, strategy, stratLabel, selectedCustom]);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white flex items-center gap-2">
          <LineChart className="h-4 w-4 text-teal-400" />
          Backtesting
        </CardTitle>
        <CardDescription className="text-zinc-500 text-xs" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={mode === "strategy" ? "default" : "outline"}
            className={mode === "strategy" ? "bg-teal-600" : "border-zinc-600"}
            onClick={() => setMode("strategy")}
          >
            Strategy
          </Button>
          <Button
            size="sm"
            variant={mode === "simple" ? "default" : "outline"}
            className={mode === "simple" ? "bg-teal-600" : "border-zinc-600"}
            onClick={() => setMode("simple")}
          >
            Simple BUY / SELL
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">Symbol</Label>
            <SymbolSearchInput
              value={symbol}
              onChange={setSymbol}
              onSelect={(s, ex) => {
                setSymbol(s.toUpperCase());
                setExchange(ex);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">Exchange</Label>
            <Select value={exchange} onValueChange={setExchange}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {EXCHANGES.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {mode === "strategy" ? (
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">Strategy</Label>
            <Select
              value={selectedCustomId ? `custom:${selectedCustomId}` : `preset:${strategy}`}
              onValueChange={(v) => {
                if (v.startsWith("custom:")) {
                  const id = v.replace("custom:", "");
                  setSelectedCustomId(id);
                  const cs = customStrategies.find(s => s.id === id);
                  if (cs?.stop_loss_pct != null) setSlPct(String(cs.stop_loss_pct));
                  if (cs?.take_profit_pct != null) setTpPct(String(cs.take_profit_pct));
                } else {
                  setSelectedCustomId("");
                  setStrategy(v.replace("preset:", ""));
                }
              }}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 max-h-64">
                <div className="px-2 py-1.5 text-[10px] text-zinc-500">Custom strategies</div>
                {customStrategies.length ? customStrategies.map(s => (
                  <SelectItem key={s.id} value={`custom:${s.id}`} className="text-xs">
                    {s.name}
                  </SelectItem>
                )) : (
                  <div className="px-2 py-2 text-xs text-zinc-600">No custom strategies yet</div>
                )}
                <div className="px-2 py-1.5 text-[10px] text-zinc-500">Built-in presets</div>
                {STRATEGIES.map(s => (
                  <SelectItem key={s.value} value={`preset:${s.value}`} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className={action === "BUY" ? "bg-emerald-600" : "bg-zinc-800"}
              onClick={() => setAction("BUY")}
            >
              BUY
            </Button>
            <Button
              type="button"
              size="sm"
              className={action === "SELL" ? "bg-red-600" : "bg-zinc-800"}
              onClick={() => setAction("SELL")}
            >
              SELL
            </Button>
            <span className="text-[10px] text-zinc-500 self-center">
              Uses trend-style simulation for simple direction; tune SL/TP below.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">Stop-loss %</Label>
            <Input value={slPct} onChange={e => setSlPct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">Take-profit %</Label>
            <Input value={tpPct} onChange={e => setTpPct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">Days history</Label>
            <Input value={days} onChange={e => setDays(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
          <p className="text-[10px] font-medium text-zinc-400">Session & exit time (for timing review)</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[9px] text-zinc-600">Start IST</Label>
              <Input value={startTime} onChange={e => setStartTime(e.target.value)} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <Label className="text-[9px] text-zinc-600">End IST</Label>
              <Input value={endTime} onChange={e => setEndTime(e.target.value)} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <Label className="text-[9px] text-zinc-600">Square-off</Label>
              <Input value={squareoff} onChange={e => setSquareoff(e.target.value)} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={runVectorBt}
            disabled={loading}
            className="bg-teal-600 hover:bg-teal-500"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
            Run Backtesting
          </Button>
          <Button
            variant="outline"
            onClick={runTimingReview}
            disabled={!result || aiLoading}
            className="border-purple-600/50 text-purple-300"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
            Review SL/TP & timing (AI)
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-zinc-700 p-3 space-y-3 text-xs">
            <p className="text-teal-400 font-semibold">
              {mode === "strategy" ? stratLabel : `Simple ${action}`}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                <p className="text-[10px] text-zinc-500">Trades</p>
                <p className="font-mono text-zinc-200">{String(result.totalTrades)}</p>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                <p className="text-[10px] text-zinc-500">Win rate</p>
                <p className="font-mono text-zinc-200">{String(result.winRate)}%</p>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                <p className="text-[10px] text-zinc-500">Total return</p>
                <p className={`font-mono ${Number(result.totalReturn) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {Number(result.totalReturn) >= 0 ? "+" : ""}{String(result.totalReturn)}%
                </p>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                <p className="text-[10px] text-zinc-500">Max DD</p>
                <p className="font-mono text-zinc-200">{String(result.maxDrawdown ?? "—")}%</p>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                <p className="text-[10px] text-zinc-500">Profit factor</p>
                <p className="font-mono text-zinc-200">{String(result.profitFactor ?? "—")}</p>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                <p className="text-[10px] text-zinc-500">Sharpe</p>
                <p className="font-mono text-zinc-200">{String(result.sharpeRatio ?? "—")}</p>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2 sm:col-span-2">
                <p className="text-[10px] text-zinc-500">Period</p>
                <p className="font-mono text-zinc-200">{String(result.backtestPeriod ?? "—")}</p>
              </div>
            </div>

            <p className="text-zinc-500">
              Setup now: {String(result.strategyAchieved) === "true" ? "Yes" : "No"} — {String(result.achievementReason ?? "")}
            </p>

            {Array.isArray((result as any).trades) && (result as any).trades.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-300 font-medium">Trades</p>
                  <p className="text-[10px] text-zinc-500">
                    Page {tradesPage} / {Math.max(1, Math.ceil(((result as any).trades.length as number) / tradesPerPage))}
                  </p>
                </div>
                <div className="overflow-auto rounded border border-zinc-800">
                  <table className="w-full text-[11px]">
                    <thead className="bg-zinc-950 sticky top-0">
                      <tr className="text-zinc-500">
                        <th className="text-left font-medium px-2 py-2">Entry</th>
                        <th className="text-left font-medium px-2 py-2">Exit</th>
                        <th className="text-right font-medium px-2 py-2">Hold</th>
                        <th className="text-right font-medium px-2 py-2">Entry Px</th>
                        <th className="text-right font-medium px-2 py-2">Exit Px</th>
                        <th className="text-right font-medium px-2 py-2">Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((result as any).trades as any[])
                        .slice((tradesPage - 1) * tradesPerPage, tradesPage * tradesPerPage)
                        .map((t, i) => (
                          <tr key={i} className="border-t border-zinc-800/60">
                            <td className="px-2 py-2 text-zinc-300 font-mono">{String(t.entryDate ?? "—")}</td>
                            <td className="px-2 py-2 text-zinc-300 font-mono">{String(t.exitDate ?? "—")}</td>
                            <td className="px-2 py-2 text-right text-zinc-400 font-mono">{t.holdingDays ?? "—"}</td>
                            <td className="px-2 py-2 text-right text-zinc-300 font-mono">{t.entryPrice ?? "—"}</td>
                            <td className="px-2 py-2 text-right text-zinc-300 font-mono">{t.exitPrice ?? "—"}</td>
                            <td className={`px-2 py-2 text-right font-mono ${Number(t.returnPct) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {Number(t.returnPct) >= 0 ? "+" : ""}{t.returnPct}%
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-200"
                    onClick={() => setTradesPage(p => Math.max(1, p - 1))}
                    disabled={tradesPage <= 1}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-200"
                    onClick={() => {
                      const totalPages = Math.max(1, Math.ceil(((result as any).trades.length as number) / tradesPerPage));
                      setTradesPage(p => Math.min(totalPages, p + 1));
                    }}
                    disabled={tradesPage >= Math.max(1, Math.ceil(((result as any).trades.length as number) / tradesPerPage))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {timingReview && (
          <Alert className="bg-purple-950/30 border-purple-800">
            <Brain className="h-4 w-4 text-purple-400" />
            <AlertDescription className="text-zinc-300 text-xs whitespace-pre-wrap">{timingReview}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-300 font-medium">Backtest history</p>
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-200"
              onClick={loadHistory}
              disabled={historyLoading}
            >
              {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-zinc-600">No backtests saved yet.</p>
          ) : (
            <>
              <div className="overflow-auto rounded border border-zinc-800">
                <table className="w-full text-[11px]">
                  <thead className="bg-zinc-950 sticky top-0">
                    <tr className="text-zinc-500">
                      <th className="text-left font-medium px-2 py-2">Time</th>
                      <th className="text-left font-medium px-2 py-2">Symbol</th>
                      <th className="text-left font-medium px-2 py-2">Type</th>
                      <th className="text-right font-medium px-2 py-2">Trades</th>
                      <th className="text-right font-medium px-2 py-2">WR</th>
                      <th className="text-right font-medium px-2 py-2">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history
                      .slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage)
                      .map((h) => {
                        const s = (h as any).summary ?? {};
                        const ret = Number(s.totalReturn ?? 0);
                        return (
                          <tr key={(h as any).id} className="border-t border-zinc-800/60">
                            <td className="px-2 py-2 text-zinc-500 font-mono">{String((h as any).created_at ?? "").slice(0, 19).replace("T", " ")}</td>
                            <td className="px-2 py-2 text-zinc-200 font-mono">{String((h as any).symbol ?? "—")}</td>
                            <td className="px-2 py-2 text-zinc-400">{String((h as any).strategy_label ?? (h as any).mode ?? "—")}</td>
                            <td className="px-2 py-2 text-right text-zinc-300 font-mono">{String(s.totalTrades ?? "—")}</td>
                            <td className="px-2 py-2 text-right text-zinc-300 font-mono">{String(s.winRate ?? "—")}%</td>
                            <td className={`px-2 py-2 text-right font-mono ${ret >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {ret >= 0 ? "+" : ""}{String(s.totalReturn ?? "—")}%
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 text-zinc-200"
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="text-[10px] text-zinc-600">
                  Page {historyPage} / {Math.max(1, Math.ceil(history.length / historyPerPage))}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 text-zinc-200"
                  onClick={() => setHistoryPage(p => Math.min(Math.max(1, Math.ceil(history.length / historyPerPage)), p + 1))}
                  disabled={historyPage >= Math.max(1, Math.ceil(history.length / historyPerPage))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
