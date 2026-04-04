import { supabase } from "@/integrations/supabase/client";
import { applyDeployOverridesToStrategyRow } from "@/lib/applyDeployOverrides";

export type LiveScanDeploySlice = {
  symbol: string;
  exchange?: string | null;
  action: string;
  deploy_overrides?: Record<string, unknown> | null;
};

/** Strategy row shape from manage-strategy list + fields needed for strategy-entry-signals customStrategies[]. */
export type LiveScanStrategyRow = Record<string, unknown> & {
  id: string;
  name?: string;
  trading_mode?: string;
  is_intraday?: boolean;
  stop_loss_pct?: number | null;
  take_profit_pct?: number | null;
  paper_strategy_type?: string | null;
  entry_conditions?: unknown;
  exit_conditions?: unknown;
  position_config?: unknown;
  risk_config?: unknown;
  chart_config?: unknown;
  execution_days?: unknown;
  market_type?: string;
  start_time?: string;
  end_time?: string;
  squareoff_time?: string;
  risk_per_trade_pct?: number;
  description?: string | null;
};

function signalSymbolForScan(rawSymbol: string, exchange: string): string {
  let signalSymbol = String(rawSymbol).toUpperCase().trim();
  const exUpper = String(exchange ?? "").toUpperCase();
  if (exUpper === "NSE" && !signalSymbol.endsWith(".NS") && !signalSymbol.endsWith(".BO")) {
    signalSymbol += ".NS";
  } else if (exUpper === "BSE" && !signalSymbol.endsWith(".BO") && !signalSymbol.endsWith(".NS")) {
    signalSymbol += ".BO";
  }
  return signalSymbol;
}

/**
 * Same scan as edge `tryExecutePendingRow` → strategy-entry-signals, using the user session.
 * Returns PASS/FAIL lines from the nearest custom-strategy signal’s conditionAudit.
 */
export async function runLiveEntryConditionScan(
  strategy: LiveScanStrategyRow,
  dep: LiveScanDeploySlice,
): Promise<{
  error: string | null;
  headline: string;
  checks: Array<{ ok: boolean; label: string }>;
  allMet: boolean;
}> {
  const empty = { error: null as string | null, headline: "", checks: [] as Array<{ ok: boolean; label: string }>, allMet: false };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ...empty, error: "Not signed in" };
  }

  const merged = applyDeployOverridesToStrategyRow(strategy, dep.deploy_overrides);
  const chartCfg = merged.chart_config && typeof merged.chart_config === "object"
    ? merged.chart_config as Record<string, unknown>
    : {};
  let intradayInterval = String(chartCfg.interval ?? "5m").trim().toLowerCase() || "5m";
  if (intradayInterval === "1d" || intradayInterval === "1day" || intradayInterval === "daily") {
    intradayInterval = "5m";
  }

  const symbol = signalSymbolForScan(dep.symbol, String(dep.exchange ?? "NSE"));
  if (!symbol) {
    return { ...empty, error: "No symbol for scan" };
  }

  const customId = `custom_${strategy.id}`;
  const actionUpper = String(dep.action ?? "BUY").toUpperCase();

  const body = {
    symbol,
    strategies: [] as string[],
    action: actionUpper,
    days: 90,
    preferIntraday: true,
    intradayInterval,
    intradayLookbackMinutes: 5 * 24 * 60,
    customStrategies: [{
      id: customId,
      name: merged.name,
      baseType: String(merged.paper_strategy_type ?? "trend_following"),
      tradingMode: String(merged.trading_mode ?? "BOTH"),
      stopLossPct: merged.stop_loss_pct != null ? Number(merged.stop_loss_pct) : null,
      takeProfitPct: merged.take_profit_pct != null ? Number(merged.take_profit_pct) : null,
      isIntraday: Boolean(merged.is_intraday ?? true),
      entryConditions: merged.entry_conditions ?? null,
      exitConditions: merged.exit_conditions ?? null,
      positionConfig: merged.position_config ?? null,
      riskConfig: merged.risk_config ?? null,
      chartConfig: merged.chart_config ?? null,
      executionDays: Array.isArray(merged.execution_days) ? merged.execution_days : [],
      marketType: String(merged.market_type ?? "stocks"),
      startTime: merged.start_time != null ? String(merged.start_time) : undefined,
      endTime: merged.end_time != null ? String(merged.end_time) : undefined,
      squareoffTime: merged.squareoff_time != null ? String(merged.squareoff_time) : undefined,
      riskPerTradePct: merged.risk_per_trade_pct != null ? Number(merged.risk_per_trade_pct) : undefined,
      description: merged.description != null ? String(merged.description) : undefined,
    }],
  };

  const res = await supabase.functions.invoke("strategy-entry-signals", {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const data = res.data as Record<string, unknown> | null;
  if (res.error) {
    return { ...empty, error: res.error.message ?? "Scan request failed" };
  }
  if (data && typeof data.error === "string" && data.error) {
    return { ...empty, error: data.error };
  }

  const signals = Array.isArray(data?.signals) ? data.signals as Array<Record<string, unknown>> : [];

  const matchedSignal = signals.find((s) =>
    String(s?.strategyId ?? "") === customId &&
    String(s?.side ?? "").toUpperCase() === actionUpper &&
    Boolean(s?.isLive) &&
    !Boolean(s?.isPredicted),
  );

  const pickAudit = (sig: Record<string, unknown> | undefined) => {
    const audit = sig?.conditionAudit;
    if (!audit || typeof audit !== "object") return [] as Array<{ ok: boolean; label: string }>;
    const lines = (audit as { lines?: unknown }).lines;
    if (!Array.isArray(lines)) return [];
    return lines
      .slice(0, 24)
      .map((l) => {
        const row = l as { ok?: boolean; label?: string };
        return {
          ok: Boolean(row?.ok),
          label: String(row?.label ?? "").replace(/\s+/g, " ").trim(),
        };
      })
      .filter((x) => x.label.length > 0);
  };

  if (matchedSignal) {
    const checks = pickAudit(matchedSignal);
    return {
      error: null,
      headline: "Live entry conditions are satisfied on the latest evaluated bar.",
      checks,
      allMet: true,
    };
  }

  const sideCandidates = signals.filter((s) =>
    String(s?.strategyId ?? "") === customId &&
    String(s?.side ?? "").toUpperCase() === actionUpper &&
    !Boolean(s?.isPredicted),
  );
  const nearest = sideCandidates[0];
  const checks = pickAudit(nearest);

  const liveFlag = Boolean(nearest?.isLive) ? "YES" : "NO";
  const px = Number((nearest as { priceAtEntry?: number })?.priceAtEntry ?? 0);
  const pxText = Number.isFinite(px) && px > 0 ? px.toFixed(2) : "—";
  const ts = String((nearest as { entryTimestamp?: string; entryTime?: string })?.entryTimestamp
    ?? (nearest as { entryTime?: string }).entryTime ?? "").trim();
  // `typeof null === "object"` — must exclude null before reading `.kind`
  const auditObj = nearest?.conditionAudit;
  const kind =
    auditObj != null && typeof auditObj === "object"
      ? String((auditObj as { kind?: string }).kind ?? "").trim()
      : "";

  const headline = nearest
    ? [
      "No live entry firing yet (order still pending).",
      `State: LIVE_BAR=${liveFlag} SIDE=${actionUpper} PRICE=${pxText}${ts ? ` TIME=${ts}` : ""}${kind ? ` KIND=${kind}` : ""}`,
    ].join(" ")
    : "No candidate signal returned for this symbol yet. Data may still be loading or the engine returned no row for this custom strategy.";

  return {
    error: null,
    headline,
    checks,
    allMet: false,
  };
}
