/**
 * Shared: evaluate one pending_conditional_orders row — strategy-entry-signals + optional placeorder.
 * Used by process-conditional-orders (cron) and stream-conditional-tick (live WS-driven).
 */
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

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
};

export type TryExecuteResult = "fired" | "not_matched" | "cooldown" | "cancelled" | "error";

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
      "id, name, trading_mode, is_intraday, stop_loss_pct, take_profit_pct, paper_strategy_type, symbols, market_type, entry_conditions, exit_conditions, position_config, risk_config, chart_config, execution_days",
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

  const checkRes = await fetch(`${supabaseUrl}/functions/v1/strategy-entry-signals`, {
    method: "POST",
    headers: checkHeaders,
    body: JSON.stringify({
      symbol: row.symbol,
      strategies: [],
      action: row.action,
      days: 90,
      preferIntraday: true,
      intradayInterval: "5m",
      intradayLookbackMinutes: 5 * 24 * 60,
      customStrategies: [{
        id: customId,
        name: strategy.name,
        baseType: String((strategy as any).paper_strategy_type ?? "trend_following"),
        tradingMode: String((strategy as any).trading_mode ?? "BOTH"),
        stopLossPct: Number((strategy as any).stop_loss_pct ?? 2),
        takeProfitPct: Number((strategy as any).take_profit_pct ?? 4),
        isIntraday: Boolean((strategy as any).is_intraday ?? true),
        entryConditions: (strategy as any).entry_conditions ?? null,
        exitConditions: (strategy as any).exit_conditions ?? null,
        positionConfig: (strategy as any).position_config ?? null,
        riskConfig: (strategy as any).risk_config ?? null,
        chartConfig: (strategy as any).chart_config ?? null,
        executionDays: Array.isArray((strategy as any).execution_days) ? (strategy as any).execution_days : [],
        marketType: String((strategy as any).market_type ?? "stocks"),
        startTime: (strategy as any).start_time != null ? String((strategy as any).start_time) : undefined,
        endTime: (strategy as any).end_time != null ? String((strategy as any).end_time) : undefined,
        squareoffTime: (strategy as any).squareoff_time != null ? String((strategy as any).squareoff_time) : undefined,
        riskPerTradePct: (strategy as any).risk_per_trade_pct != null ? Number((strategy as any).risk_per_trade_pct) : undefined,
        description: (strategy as any).description != null ? String((strategy as any).description) : undefined,
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
  const resolvedQty = Number(positionConfig.quantity ?? row.quantity ?? 1);
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
