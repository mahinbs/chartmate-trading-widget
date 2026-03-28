/**
 * Shared: evaluate one pending_conditional_orders row — strategy-entry-signals + optional placeorder.
 * Used by process-conditional-orders (cron) and stream-conditional-tick (live WS-driven).
 */
import {
  evaluateGuideRiskGates,
  parseGuideRiskGates,
} from "./algoGuideRiskGates.ts";
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export type DeployOverrides = {
  start_time?: string;
  end_time?: string;
  squareoff_time?: string;
  clock_entry_time?: string;
  clock_exit_time?: string;
  /** false = entry only, no automated exits for this deployment scan */
  use_auto_exit?: boolean;
};

export type PendingConditionalRow = {
  id: string;
  user_id: string;
  strategy_id: string;
  symbol: string;
  exchange: string;
  action: string;
  quantity: number;
  product: string;
  paper_strategy_type: string;
  deploy_overrides?: Record<string, unknown> | null;
};

export type TryExecuteResult =
  | "fired"
  | "not_matched"
  | "cooldown"
  | "cancelled"
  | "error"
  | "risk_blocked";

function cloneJson<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch {
    return v;
  }
}

/** Merge deploy-time session/clock/auto-exit into a copy of the strategy row for live scans (does not persist). */
export function applyDeployOverridesToStrategyRow(
  strategy: Record<string, unknown>,
  overrides: unknown,
): Record<string, unknown> {
  const o = overrides && typeof overrides === "object" ? overrides as DeployOverrides : {};
  const out = { ...strategy };

  if (o.start_time !== undefined && String(o.start_time).trim()) {
    out.start_time = String(o.start_time).trim();
  }
  if (o.end_time !== undefined && String(o.end_time).trim()) {
    out.end_time = String(o.end_time).trim();
  }
  if (o.squareoff_time !== undefined && String(o.squareoff_time).trim()) {
    out.squareoff_time = String(o.squareoff_time).trim();
  }

  const entryRaw = strategy.entry_conditions;
  if (o.clock_entry_time !== undefined && String(o.clock_entry_time).trim()) {
    const ent = entryRaw && typeof entryRaw === "object"
      ? cloneJson(entryRaw) as Record<string, unknown>
      : {};
    ent.clockEntryTime = String(o.clock_entry_time).trim();
    out.entry_conditions = ent;
  }

  const exitRaw = strategy.exit_conditions;
  const useAuto = o.use_auto_exit;

  if (useAuto === false) {
    out.exit_conditions = { autoExitEnabled: false };
    out.stop_loss_pct = null;
    out.take_profit_pct = null;
  } else {
    const base = exitRaw && typeof exitRaw === "object"
      ? cloneJson(exitRaw) as Record<string, unknown>
      : {};
    if (useAuto === true) {
      base.autoExitEnabled = true;
    }
    if (o.clock_exit_time !== undefined && String(o.clock_exit_time).trim()) {
      base.clockExitTime = String(o.clock_exit_time).trim();
    }
    if (useAuto === true || o.clock_exit_time !== undefined) {
      out.exit_conditions = Object.keys(base).length ? base : exitRaw;
    }
  }

  return out;
}

export async function tryExecutePendingRow(
  supabase: SupabaseLike,
  row: PendingConditionalRow,
  options: {
    supabaseUrl: string;
    openalgoUrl: string;
    entryDigestSecret: string;
    localFireGuard: Map<string, number>;
    cooldownSeconds: number;
  },
): Promise<TryExecuteResult> {
  const { supabaseUrl, openalgoUrl, entryDigestSecret, localFireGuard, cooldownSeconds } = options;

  const { data: strategy, error: stratErr } = await supabase
    .from("user_strategies")
    .select(
      "id, name, trading_mode, is_intraday, stop_loss_pct, take_profit_pct, paper_strategy_type, symbols, market_type, entry_conditions, exit_conditions, position_config, risk_config, chart_config, execution_days, start_time, end_time, squareoff_time, risk_per_trade_pct, description",
    )
    .eq("id", row.strategy_id)
    .single();

  if (stratErr || !strategy) {
    await supabase.from("pending_conditional_orders").update({
      status: "cancelled",
      error_message: "Strategy not found",
    }).eq("id", row.id);
    return "cancelled";
  }

  const merged = applyDeployOverridesToStrategyRow(strategy as Record<string, unknown>, row.deploy_overrides);

  const dedupeKey = `${row.strategy_id}|${row.symbol}|${row.action}`;
  const lastLocalFire = localFireGuard.get(dedupeKey) ?? 0;
  if (Date.now() - lastLocalFire < cooldownSeconds * 1000) {
    return "cooldown";
  }

  const cooldownIso = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
  const { data: recentExecuted } = await supabase
    .from("pending_conditional_orders")
    .select("id, executed_at")
    .eq("strategy_id", row.strategy_id)
    .eq("symbol", row.symbol)
    .eq("action", row.action)
    .eq("status", "executed")
    .gte("executed_at", cooldownIso)
    .limit(1)
    .maybeSingle();
  if (recentExecuted) return "cooldown";

  const customId = `custom_${strategy.id}`;
  const checkHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (entryDigestSecret) {
    checkHeaders["x-digest-secret"] = entryDigestSecret;
    checkHeaders["x-digest-user-id"] = String(row.user_id);
  }

  const chartCfg = merged.chart_config && typeof merged.chart_config === "object"
    ? merged.chart_config as Record<string, unknown>
    : {};
  let intradayInterval = String(chartCfg.interval ?? "5m").trim().toLowerCase() || "5m";
  if (intradayInterval === "1d" || intradayInterval === "1day" || intradayInterval === "daily") {
    intradayInterval = "5m";
  }

  const checkRes = await fetch(`${supabaseUrl}/functions/v1/strategy-entry-signals`, {
    method: "POST",
    headers: checkHeaders,
    body: JSON.stringify({
      symbol: row.symbol,
      strategies: [],
      action: row.action,
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
    }),
  });

  const checkData = (await checkRes.json().catch(() => ({}))) as any;
  const signals = Array.isArray(checkData?.signals) ? checkData.signals : [];
  const achieved = Boolean(signals.find((s: any) =>
    String(s?.strategyId ?? "") === customId &&
    String(s?.side ?? "").toUpperCase() === String(row.action).toUpperCase() &&
    Boolean(s?.isLive) &&
    !Boolean(s?.isPredicted),
  ));

  await supabase
    .from("pending_conditional_orders")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", row.id);

  if (!achieved) return "not_matched";

  const symU = String(row.symbol).toUpperCase();
  const riskTz = symU.endsWith(".NS") || symU.endsWith(".BO") ? "Asia/Kolkata" : "UTC";
  const gateCfg = parseGuideRiskGates(merged.risk_config, riskTz);
  const { count: openPosCount } = await supabase
    .from("active_trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", row.user_id)
    .in("status", ["active", "monitoring", "exit_zone"]);
  const gateDeny = evaluateGuideRiskGates({
    cfg: gateCfg,
    nowSec: Math.floor(Date.now() / 1000),
    timeZone: riskTz,
    isIntraday: Boolean(merged.is_intraday ?? true),
    openPositionCount: openPosCount ?? 0,
    stopLossPct: merged.stop_loss_pct != null ? Number(merged.stop_loss_pct) : 0,
    takeProfitPct: merged.take_profit_pct != null ? Number(merged.take_profit_pct) : 0,
  });
  if (!gateDeny.ok) return "risk_blocked";

  const { data: integration } = await supabase
    .from("user_trading_integration")
    .select("openalgo_api_key")
    .eq("user_id", row.user_id)
    .eq("is_active", true)
    .maybeSingle() as any;
  const apiKey = integration?.openalgo_api_key ?? "";
  if (!apiKey) {
    await supabase.from("pending_conditional_orders").update({
      status: "cancelled",
      error_message: "No broker connection",
    }).eq("id", row.id);
    return "cancelled";
  }

  const positionConfig = ((strategy as any)?.position_config && typeof (strategy as any).position_config === "object")
    ? ((strategy as any).position_config as Record<string, unknown>)
    : {};
  const resolvedExchange = String(positionConfig.exchange ?? row.exchange ?? "NSE").toUpperCase();
  const resolvedProduct = String(positionConfig.orderProduct ?? row.product ?? "MIS").toUpperCase();
  const rowQty = Number(row.quantity);
  const pcQty = Number(positionConfig.quantity);
  const resolvedQty = Number.isFinite(rowQty) && rowQty > 0
    ? rowQty
    : (Number.isFinite(pcQty) && pcQty > 0 ? pcQty : 1);
  const resolvedPriceType = String(
    (positionConfig.orderType === "LIMIT" ? "LIMIT" : (positionConfig.orderType === "STOP" || positionConfig.orderType === "STOP_LIMIT") ? "SL" : "MARKET"),
  ).toUpperCase();

  const orderPayload = {
    apikey: apiKey.trim(),
    strategy: strategy.name,
    exchange: resolvedExchange,
    symbol: String(row.symbol).toUpperCase().replace(/\.NS$/i, "").replace(/\.BO$/i, ""),
    action: row.action,
    product: resolvedProduct,
    pricetype: resolvedPriceType,
    quantity: String(Number.isFinite(resolvedQty) && resolvedQty > 0 ? resolvedQty : 1),
    price: resolvedPriceType === "MARKET" ? "0" : "0",
    trigger_price: "0",
    disclosed_quantity: "0",
  };

  const placeRes = await fetch(`${openalgoUrl}/api/v1/placeorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload),
  });
  const placeData = await placeRes.json().catch(() => ({}));
  const orderId = (placeData as any)?.orderid ?? (placeData as any)?.broker_order_id;

  await supabase.from("pending_conditional_orders").update({
    status: placeRes.ok ? "executed" : "cancelled",
    executed_at: placeRes.ok ? new Date().toISOString() : null,
    broker_order_id: orderId ?? null,
    error_message: placeRes.ok ? null : ((placeData as any)?.message ?? "Order failed"),
  }).eq("id", row.id);

  if (placeRes.ok) {
    localFireGuard.set(dedupeKey, Date.now());
    await supabase.from("order_audit_logs").insert({
      user_id: row.user_id,
      trade_id: null,
      intent: "entry",
      provider: "openalgo",
      request_payload: orderPayload,
      response_payload: placeData,
      status: "success",
    }).catch(() => {});
    return "fired";
  }

  return "error";
}
