/**
 * Shared: evaluate one pending_conditional_orders row — strategy-entry-signals + optional placeorder.
 * Used by process-conditional-orders (cron) and stream-conditional-tick (live WS-driven).
 */
import {
  evaluateGuideRiskGates,
  parseGuideRiskGates,
} from "./algoGuideRiskGates.ts";
import { extractAlgoGuidePreset } from "./algoGuideDetectors.ts";
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

/** IST wall-clock minutes (hh*60 + mm) */
function istMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hh * 60 + mm;
}

/** IST weekday: 0=Sun .. 4=Thu .. 6=Sat */
function istWeekday(): number {
  const d = new Date();
  const ist = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return ist.getDay();
}

/** Fetch India VIX from Yahoo Finance (cached for 5 min) */
let _vixCache: { value: number; at: number } | null = null;
async function fetchIndiaVix(): Promise<number | null> {
  if (_vixCache && Date.now() - _vixCache.at < 5 * 60 * 1000) return _vixCache.value;
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?interval=1d&range=1d";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (price != null && Number.isFinite(Number(price))) {
      _vixCache = { value: Number(price), at: Date.now() };
      return _vixCache.value;
    }
  } catch { /* ignore */ }
  return null;
}

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
  /** Included in stream-conditional-tick select to detect queued-for-monitor rows */
  error_message?: string | null;
};

/**
 * When conditions match, the edge function no longer calls OpenAlgo directly
 * (cloud IPs are not whitelisted). Instead it returns this payload to the monitor
 * so the monitor can call OpenAlgo from its own server IP.
 */
export type ReadyToFirePayload = {
  pending_row_id: string;
  /** Full OpenAlgo /api/v1/placeorder body — monitor POSTs this directly */
  order_payload: Record<string, string | number>;
  /** Pre-computed active_trade row — monitor inserts this after successful placement */
  active_trade_template: Record<string, unknown>;
  strategy_name: string;
};

export type TryExecuteResult =
  | "fired"
  | "not_matched"
  | "cooldown"
  | "cancelled"
  | "error"
  | "risk_blocked"
  | { type: "ready_to_fire"; payload: ReadyToFirePayload };

function cloneJson<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch {
    return v;
  }
}

async function setPendingReason(
  supabase: SupabaseLike,
  rowId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("pending_conditional_orders")
    .update({ error_message: message.slice(0, 1500) })
    .eq("id", rowId)
    .eq("status", "pending");
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
  const { supabaseUrl, entryDigestSecret, localFireGuard, cooldownSeconds } = options;

  // Already handed off to monitor for placement — skip re-evaluation until confirmed.
  if (String(row.error_message ?? "").startsWith("__QUEUED_FOR_MONITOR__")) {
    return "cooldown";
  }

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

  // Touch on every evaluation attempt so NULL last_checked_at is visible when ticks/edge run.
  await supabase
    .from("pending_conditional_orders")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", row.id);

  const dedupeKey = `${row.strategy_id}|${row.symbol}|${row.action}`;
  const lastLocalFire = localFireGuard.get(dedupeKey) ?? 0;
  if (Date.now() - lastLocalFire < cooldownSeconds * 1000) {
    await setPendingReason(
      supabase,
      row.id,
      `Cooldown active after recent execution. Waiting ${cooldownSeconds}s before next entry attempt.`,
    );
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
  if (recentExecuted) {
    await setPendingReason(
      supabase,
      row.id,
      `Cooldown active after recent execution. Waiting ${cooldownSeconds}s before next entry attempt.`,
    );
    return "cooldown";
  }

  // ── Phase 4: Pre-trade validation gates (run before expensive signal scan) ──
  const entryRaw = merged.entry_conditions;
  const preset = extractAlgoGuidePreset(entryRaw);
  const riskCfg = merged.risk_config && typeof merged.risk_config === "object"
    ? merged.risk_config as Record<string, unknown>
    : {};

  // 4.2 First-15-min block: no entries before 09:30 IST
  const blockFirst = (entryRaw as Record<string, unknown> | null)?.algoGuideBlockFirstSessionMinutes;
  if (blockFirst && istMinutesNow() < 9 * 60 + 30) {
    await setPendingReason(supabase, row.id, "Waiting for market open (09:30 IST) — first 15 min blocked.");
    return "not_matched";
  }

  // 4.3 Expiry day filter: skip Thursdays for NSE derivatives
  if (riskCfg.blockExpiryDays && istWeekday() === 4) {
    await setPendingReason(supabase, row.id, "Skipped: expiry day (Thursday) — blockExpiryDays enabled.");
    return "not_matched";
  }

  // 4.1 VIX filter: block trades when volatility is outside acceptable range
  if (preset) {
    const vix = await fetchIndiaVix();
    if (vix != null) {
      let vixBlocked = false;
      let vixRange = "";
      if ((preset === "supertrend_7_3" || preset === "orb") && (vix < 12 || vix > 25)) {
        vixBlocked = true;
        vixRange = "12–25";
        if (preset === "orb" && vix > 22) { vixBlocked = true; vixRange = "12–22"; }
      } else if (preset === "vwap_bounce" && vix < 11) {
        vixBlocked = true;
        vixRange = ">11";
      }
      if (vixBlocked) {
        await setPendingReason(supabase, row.id, `VIX ${vix.toFixed(1)} outside range (${vixRange}) for ${preset}. Waiting.`);
        return "not_matched";
      }
    }
  }

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

  // Append exchange suffix so strategy-entry-signals data providers resolve Indian stocks correctly
  let signalSymbol = String(row.symbol).toUpperCase();
  const exUpper = String(row.exchange ?? "").toUpperCase();
  if (exUpper === "NSE" && !signalSymbol.endsWith(".NS") && !signalSymbol.endsWith(".BO")) {
    signalSymbol += ".NS";
  } else if (exUpper === "BSE" && !signalSymbol.endsWith(".BO") && !signalSymbol.endsWith(".NS")) {
    signalSymbol += ".BO";
  }

  const checkRes = await fetch(`${supabaseUrl}/functions/v1/strategy-entry-signals`, {
    method: "POST",
    headers: checkHeaders,
    body: JSON.stringify({
      symbol: signalSymbol,
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
  if (!checkRes.ok) {
    console.error("strategy-entry-signals failed for pending row", row.id, checkRes.status, checkData?.error);
    await setPendingReason(
      supabase,
      row.id,
      `Signal scan failed (${checkRes.status}). ${(checkData?.error ?? "Temporary edge-function error")}`,
    );
    return "error";
  }

  const signals = Array.isArray(checkData?.signals) ? checkData.signals : [];
  const matchedSignal = signals.find((s: any) =>
    String(s?.strategyId ?? "") === customId &&
    String(s?.side ?? "").toUpperCase() === String(row.action).toUpperCase() &&
    Boolean(s?.isLive) &&
    !Boolean(s?.isPredicted),
  );
  const achieved = Boolean(matchedSignal);

  if (!achieved) {
    const sideCandidates = signals.filter((s: any) =>
      String(s?.strategyId ?? "") === customId &&
      String(s?.side ?? "").toUpperCase() === String(row.action).toUpperCase() &&
      !Boolean(s?.isPredicted)
    );
    const nearest = sideCandidates[0] as Record<string, unknown> | undefined;
    const auditLinesRaw = (nearest?.conditionAudit && typeof nearest.conditionAudit === "object")
      ? (nearest.conditionAudit as { lines?: Array<{ ok?: boolean; label?: string }> }).lines
      : [];
    const auditLines = Array.isArray(auditLinesRaw)
      ? auditLinesRaw
        .slice(0, 3)
        .map((l) => `${l?.ok ? "PASS" : "FAIL"} ${String(l?.label ?? "").replace(/\s+/g, " ").trim()}`)
        .filter(Boolean)
      : [];
    const reason = nearest
      ? `No live entry signal yet (last matching bar is not live).${
        auditLines.length > 0 ? ` Checks: ${auditLines.join(" | ")}` : ""
      }`
      : "No live entry signal yet. Strategy conditions are still not met on the current live bar.";
    await setPendingReason(supabase, row.id, reason);
    return "not_matched";
  }

  const symU = String(row.symbol).toUpperCase();
  const riskTz = symU.endsWith(".NS") || symU.endsWith(".BO") ? "Asia/Kolkata" : "UTC";
  const gateCfg = parseGuideRiskGates(merged.risk_config, riskTz);
  // Only count strategy-linked algo trades (not paper predictions) toward position limit
  const { count: openPosCount } = await supabase
    .from("active_trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", row.user_id)
    .in("status", ["active", "monitoring", "exit_zone"])
    .not("strategy_id", "is", null);
  const gateDeny = evaluateGuideRiskGates({
    cfg: gateCfg,
    nowSec: Math.floor(Date.now() / 1000),
    timeZone: riskTz,
    isIntraday: Boolean(merged.is_intraday ?? true),
    openPositionCount: openPosCount ?? 0,
    stopLossPct: merged.stop_loss_pct != null ? Number(merged.stop_loss_pct) : 0,
    takeProfitPct: merged.take_profit_pct != null ? Number(merged.take_profit_pct) : 0,
  });
  if (!gateDeny.ok) {
    await setPendingReason(
      supabase,
      row.id,
      `Entry blocked by risk gate (${gateDeny.code}): ${gateDeny.reason}`,
    );
    return "risk_blocked";
  }

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

  // ── Build ReadyToFirePayload — monitor places order from its server IP ──────
  // Edge functions run on Supabase/Deno cloud (varying IPs) which are not in
  // OpenAlgo's API-key IP whitelist. The monitor runs co-located with OpenAlgo
  // and calls /api/v1/placeorder directly.
  let entryPx = Number((matchedSignal as any)?.priceAtEntry);
  if (!Number.isFinite(entryPx) || entryPx <= 0) {
    const fallback = signals.map((s: any) => Number(s?.priceAtEntry)).find((n: number) =>
      Number.isFinite(n) && n > 0
    );
    entryPx = fallback ?? 0;
  }
  const slPct = merged.stop_loss_pct != null ? Number(merged.stop_loss_pct) : 2;
  const tpPct = merged.take_profit_pct != null ? Number(merged.take_profit_pct) : 4;
  const isSell = String(row.action).toUpperCase() === "SELL";

  const presetLevels = (matchedSignal as any)?.presetPriceLevels as
    { stopLossPrice?: number; takeProfitPrice?: number } | null | undefined;
  const stopLossPrice = (presetLevels?.stopLossPrice != null && Number.isFinite(presetLevels.stopLossPrice))
    ? presetLevels.stopLossPrice
    : (isSell ? entryPx * (1 + slPct / 100) : entryPx * (1 - slPct / 100));
  const takeProfitPrice = (presetLevels?.takeProfitPrice != null && Number.isFinite(presetLevels.takeProfitPrice))
    ? presetLevels.takeProfitPrice
    : (isSell ? entryPx * (1 - tpPct / 100) : entryPx * (1 + tpPct / 100));
  const sharesInt = Math.max(1, Math.round(Number.isFinite(resolvedQty) && resolvedQty > 0 ? resolvedQty : 1));
  const investmentAmount = Math.round((entryPx > 0 ? entryPx * sharesInt : 0) * 100) / 100;

  const readyPayload: ReadyToFirePayload = {
    pending_row_id: row.id,
    order_payload: orderPayload as unknown as Record<string, string | number>,
    active_trade_template: {
      user_id: row.user_id,
      symbol: String(row.symbol).toUpperCase(),
      action: row.action,
      status: "active",
      entry_price: entryPx > 0 ? entryPx : 0.0001,
      shares: sharesInt,
      investment_amount: investmentAmount > 0 ? investmentAmount : 0.01,
      exchange: resolvedExchange,
      product: resolvedProduct,
      strategy_id: row.strategy_id,
      strategy_type: String(merged.paper_strategy_type ?? "custom"),
      stop_loss_price: Number.isFinite(stopLossPrice) ? stopLossPrice : null,
      take_profit_price: Number.isFinite(takeProfitPrice) ? takeProfitPrice : null,
      stop_loss_percentage: slPct,
      target_profit_percentage: tpPct,
      current_price: entryPx > 0 ? entryPx : null,
      current_pnl: 0,
      current_pnl_percentage: 0,
    },
    strategy_name: String(strategy.name ?? ""),
  };

  // Mark as queued — prevents re-evaluation on next tick while monitor is placing.
  // Monitor resets status to "executed"/"cancelled" after placement.
  localFireGuard.set(dedupeKey, Date.now());
  await supabase.from("pending_conditional_orders").update({
    error_message: `__QUEUED_FOR_MONITOR__:${new Date().toISOString()}`,
    last_checked_at: new Date().toISOString(),
  }).eq("id", row.id);

  return { type: "ready_to_fire", payload: readyPayload };
}
