import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Search, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { StrategyEntrySignalsPanel } from "@/components/prediction/StrategyEntrySignalsPanel";
import { useLocation } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialAccess } from "@/hooks/useTrialAccess";
import { planAllowsAlgo } from "@/lib/subscriptionEntitlements";
import { trialCreditsPerActionLine } from "@/constants/trialCredits";

type ScannerSearchResult = {
  symbol: string;
  description: string;
  full_symbol: string;
  exchange: string;
  type: string;
};

const DEFAULT_SCANNER_PICKS = [
  { symbol: "RELIANCE.NS", label: "Reliance" },
  { symbol: "TCS.NS", label: "TCS" },
  { symbol: "HDFCBANK.NS", label: "HDFC Bank" },
  { symbol: "INFY.NS", label: "Infosys" },
  { symbol: "AAPL", label: "Apple" },
  { symbol: "BTC-USD", label: "Bitcoin" },
];

/**
 * AI symbol scanner + entry signals (no shell). Used inside TradingAlgoToolsCachedLayer
 * so state survives switching between /ai-trading-analysis and /backtest.
 */
export function TradingAiAnalysisPanel() {
  const location = useLocation();
  const { subscription } = useSubscription();
  const { isOnTrial } = useTrialAccess();
  const hasAlgoAccess = planAllowsAlgo(subscription?.plan_id);
  const showTrialCreditHint = Boolean(isOnTrial && !hasAlgoAccess);
  const [scannerSymbol, setScannerSymbol] = useState("");
  const [scannerInput, setScannerInput] = useState("");
  const [myStrategyPicks, setMyStrategyPicks] = useState<{ symbol: string; label: string }[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      (supabase as any)
        .from("options_strategies")
        .select("underlying, name, entry_conditions")
        .eq("user_id", data.user.id)
        .then(({ data: rows }: { data: any[] | null }) => {
          if (!rows?.length) return;
          const seen = new Set<string>();
          const picks: { symbol: string; label: string }[] = [];
          for (const r of rows) {
            const ec = r.entry_conditions ?? {};
            const isEma920 = String(ec.strategy_type ?? "").toLowerCase() === "ema_9_20_setup";
            if (!isEma920) continue;
            const sym = String(r.underlying ?? "").toUpperCase();
            if (!sym || seen.has(sym)) continue;
            seen.add(sym);
            picks.push({ symbol: sym, label: sym });
          }
          if (picks.length) setMyStrategyPicks(picks);
        });
    });
  }, []);
  const [scannerResults, setScannerResults] = useState<ScannerSearchResult[]>([]);
  const [scannerSearching, setScannerSearching] = useState(false);
  const [scannerDropdownOpen, setScannerDropdownOpen] = useState(false);
  const scannerDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  const scannerSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setScannerResults([]);
      setScannerDropdownOpen(false);
      return;
    }
    setScannerSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const data: ScannerSearchResult[] = (res.data as ScannerSearchResult[]) ?? [];
      setScannerResults(data.slice(0, 10));
      if (data.length > 0) setScannerDropdownOpen(true);
    } catch {
      /* silent */
    } finally {
      setScannerSearching(false);
    }
  }, []);

  const handleScannerInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    setScannerInput(v);
    clearTimeout(scannerDebounceRef.current);
    scannerDebounceRef.current = setTimeout(() => scannerSearch(v), 300);
  };

  const handleScannerSelect = (sym: string) => {
    setScannerSymbol(sym);
    setScannerInput(sym);
    setScannerDropdownOpen(false);
    setScannerResults([]);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        scannerContainerRef.current &&
        !scannerContainerRef.current.contains(e.target as Node)
      ) {
        setScannerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const historyIdFromQuery = new URLSearchParams(location.search).get("historyId");

  useEffect(() => {
    const qp = new URLSearchParams(location.search);
    const sym = qp.get("symbol");
    if (sym && sym.trim()) {
      const s = sym.trim().toUpperCase();
      setScannerSymbol(s);
      setScannerInput(s);
    }
  }, [location.search]);

  return (
    <div className="min-w-0 space-y-4">
      {showTrialCreditHint ? (
        <Alert className="border-teal-500/30 bg-teal-950/30 text-teal-50">
          <AlertDescription className="text-xs text-teal-100/90">
            {trialCreditsPerActionLine()} Runs triggered from this page (e.g. AI on your watchlist) use the same credit pool as backtests and paper deploys.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="p-4 space-y-3 flex flex-col items-center">
          <Label className="text-xs text-zinc-400">Search stock / symbol</Label>
          <div ref={scannerContainerRef} className="relative w-full">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
              <Input
                // placeholder="Search… RELIANCE, TCS, AAPL, BTC"
                value={scannerInput}
                onChange={handleScannerInputChange}
                onFocus={() => scannerResults.length > 0 && setScannerDropdownOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleScannerSelect(scannerInput.trim());
                    e.currentTarget.blur();
                  }
                }}
                className="pl-9 pr-9 bg-black/40 border-zinc-700 text-white font-mono uppercase placeholder:text-zinc-600"
              />
              {scannerSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />
              )}
            </div>

            {scannerDropdownOpen && scannerResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                {scannerResults.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800 text-left transition-colors border-b border-zinc-800 last:border-0"
                    onMouseDown={() => handleScannerSelect(item.full_symbol || item.symbol)}
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-white text-sm font-semibold">{item.symbol}</span>
                      <p className="text-[11px] text-zinc-500 truncate">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded">
                        {item.exchange}
                      </span>
                      <span className="text-[10px] text-zinc-500">{item.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {myStrategyPicks.length > 0 && (
            <div className="w-full space-y-1">
              <p className="text-[9px] text-teal-500/70 uppercase tracking-wider text-center">Your EMA 9-20 strategies</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {myStrategyPicks.map((qp) => (
                  <button
                    key={qp.symbol}
                    type="button"
                    onClick={() => handleScannerSelect(qp.symbol)}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                      scannerSymbol === qp.symbol
                        ? "bg-teal-500/20 border-teal-500/40 text-teal-300"
                        : "bg-teal-950/40 border-teal-800/40 text-teal-400 hover:bg-teal-900/40 hover:text-teal-200"
                    }`}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-1.5">
            {DEFAULT_SCANNER_PICKS.map((qp) => (
              <button
                key={qp.symbol}
                type="button"
                onClick={() => handleScannerSelect(qp.symbol)}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                  scannerSymbol === qp.symbol
                    ? "bg-teal-500/20 border-teal-500/40 text-teal-300"
                    : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {qp.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <StrategyEntrySignalsPanel
        symbol={scannerSymbol.trim()}
        initialHistoryId={historyIdFromQuery}
      />
    </div>
  );
}
