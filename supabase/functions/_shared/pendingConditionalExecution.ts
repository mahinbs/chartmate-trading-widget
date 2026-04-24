/**
 * Shared: evaluate one pending_conditional_orders row — strategy-entry-signals + optional placeorder.
 * Used by process-conditional-orders (cron) and stream-conditional-tick (live WS-driven).
 */
import {
  evaluateGuideRiskGates,
  parseGuideRiskGates,
} from "./algoGuideRiskGates.ts";
import { extractAlgoGuidePreset, type AlgoGuideParams } from "./algoGuideDetectors.ts";
import { calendarDateInTimeZone, fetchIndiaVixLtp } from "./openAlgoMarketData.ts";
import {
  resolveMarketSessionProfile,
  wallClockMinutesNowInZone,
} from "./marketSession.ts";
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

/** IST weekday: 0=Sun .. 4=Thu .. 6=Sat */
function istWeekday(): number {
  const d = new Date();
  const ist = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return ist.getDay();
}

/** India VIX from OpenAlgo /api/v1/quotes (cached 5m per user key) */
let _vixCache: { key: string; value: number; at: number } | null = null;
async function fetchIndiaVixFromBroker(apiKey: string, openalgoBase: string): Promise<number | null> {
  if (!apiKey || !openalgoBase) return null;
  if (
    _vixCache && _vixCache.key === apiKey && Date.now() - _vixCache.at < 5 * 60 * 1000
  ) {
    return _vixCache.value;
  }
  const v = await fetchIndiaVixLtp(apiKey, openalgoBase);
  if (v != null) _vixCache = { key: apiKey, value: v, at: Date.now() };
  return v;
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
  /** When true, entry creates an active_trades row directly (PAPER- prefix) instead of going through OpenAlgo */
  is_paper_trade?: boolean;
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
  const { supabaseUrl, entryDigestSecret, localFireGuard, cooldownSeconds, openalgoUrl: openalgoBase } = options;

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

  // Yahoo-style symbol + session profile (must match strategy-entry-signals)
  let signalSymbol = String(row.symbol).toUpperCase();
  const exUpper = String(row.exchange ?? "").toUpperCase();
  if (exUpper === "NSE" && !signalSymbol.endsWith(".NS") && !signalSymbol.endsWith(".BO")) {
    signalSymbol += ".NS";
  } else if (exUpper === "BSE" && !signalSymbol.endsWith(".BO") && !signalSymbol.endsWith(".NS")) {
    signalSymbol += ".BO";
  }
  const sessionProf = resolveMarketSessionProfile(signalSymbol);

  const { data: integrationEarly } = await supabase
    .from("user_trading_integration")
    .select("openalgo_api_key")
    .eq("user_id", row.user_id)
    .eq("is_active", true)
    .maybeSingle();
  const openalgoApiKey = String(
    (integrationEarly as { openalgo_api_key?: string } | null)?.openalgo_api_key ?? "",
  ).trim();
  const agParams = (entryRaw as { algoGuideParams?: AlgoGuideParams } | null | undefined)
    ?.algoGuideParams ?? ({} as AlgoGuideParams);
  const todayIst = calendarDateInTimeZone("Asia/Kolkata");

  // 4.2 Opening-range block: no entries before local ORB window ends (IST / US ET / UTC crypto)
  const blockFirst = (entryRaw as Record<string, unknown> | null)?.algoGuideBlockFirstSessionMinutes;
  if (blockFirst) {
    const localMin = wallClockMinutesNowInZone(sessionProf.timeZone);
    if (localMin != null && localMin < sessionProf.orbBreakoutAfterMin) {
      await setPendingReason(
        supabase,
        row.id,
        `Waiting for session open (${sessionProf.timeZone}) — no entries before ${Math.floor(sessionProf.orbBreakoutAfterMin / 60)}:${String(sessionProf.orbBreakoutAfterMin % 60).padStart(2, "0")} local.`,
      );
      return "not_matched";
    }
  }

  // 4.3 Expiry day filter: NSE-style Thursday skip (Indian symbols only)
  if (riskCfg.blockExpiryDays && sessionProf.kind === "india_equity" && istWeekday() === 4) {
    await setPendingReason(supabase, row.id, "Skipped: expiry day (Thursday) — blockExpiryDays enabled.");
    return "not_matched";
  }

  // 4.1 India VIX from OpenAlgo (Indian equities only)
  if (preset && sessionProf.kind === "india_equity") {
    const vix = openalgoApiKey
      ? await fetchIndiaVixFromBroker(openalgoApiKey, (openalgoBase || "").replace(/\/$/, ""))
      : null;
    if (vix != null) {
      let vixBlocked = false;
      let vixRange = "";
      if (preset === "ema_crossover") {
        const vmin = agParams.emaVixMin ?? 12;
        const vmax = agParams.emaVixMax ?? 25;
        if (vix < vmin || vix > vmax) {
          vixBlocked = true;
          vixRange = `${vmin}–${vmax}`;
        }
      } else if (preset === "orb") {
        const vmax = agParams.orbVixMax ?? 22;
        if (vix < 12 || vix > vmax) {
          vixBlocked = true;
          vixRange = `12–${vmax}`;
        }
      } else if (preset === "supertrend_7_3") {
        const vmin = agParams.stVixMin ?? 12;
        const vmax = agParams.stVixMax ?? 25;
        if (vix < vmin || vix > vmax) {
          vixBlocked = true;
          vixRange = `${vmin}–${vmax}`;
        }
      } else if (preset === "vwap_bounce") {
        const vmin = agParams.vwapVixMin ?? 11;
        if (vix < vmin) {
          vixBlocked = true;
          vixRange = `≥${vmin}`;
        }
      } else if (preset === "liquidity_sweep_bos") {
        const vmin = agParams.lqVixMin ?? 12;
        const vmax = agParams.lqVixMax ?? 30;
        if (vix < vmin || vix > vmax) {
          vixBlocked = true;
          vixRange = `${vmin}–${vmax}`;
        }
      } else if (preset === "rsi_divergence") {
        const vmin = agParams.emaVixMin ?? 12;
        const vmax = agParams.emaVixMax ?? 25;
        if (vix < vmin || vix > vmax) {
          vixBlocked = true;
          vixRange = `${vmin}–${vmax}`;
        }
      }
      if (vixBlocked) {
        await setPendingReason(
          supabase,
          row.id,
          `VIX ${vix.toFixed(1)} outside range (${vixRange}) for ${preset}. Waiting.`,
        );
        return "not_matched";
      }
    }
  }

  if (preset === "orb" && (agParams.orbRequireFiiNetBuying !== false) && sessionProf.kind === "india_equity") {
    const { data: fii } = await supabase
      .from("fii_dii_daily")
      .select("fii_net_buy")
      .eq("trade_date", todayIst)
      .maybeSingle();
    if (fii?.fii_net_buy != null && Number(fii.fii_net_buy) < 0) {
      await setPendingReason(
        supabase,
        row.id,
        `ORB blocked: FII net sell (₹${fii.fii_net_buy} Cr) on ${todayIst}.`,
      );
      return "not_matched";
    }
  }

  if (preset === "orb" && (agParams.orbBlockMacroEvents !== false) && sessionProf.kind === "india_equity") {
    const windowMin = agParams.orbMacroBlockWindowMin ?? 30;
    const { data: mevs } = await supabase
      .from("macro_events_today")
      .select("event_time_utc, title, impact")
      .eq("event_date", todayIst);
    const nowMs = Date.now();
    for (const e of mevs ?? []) {
      const im = String(e.impact ?? "").toLowerCase();
      if (!im.includes("high")) continue;
      const tRaw = e.event_time_utc;
      if (tRaw == null) continue;
      const ts = String(tRaw);
      const p = ts.split(/[:.]/);
      const hh = parseInt(p[0] ?? "0", 10);
      const mm = parseInt(p[1] ?? "0", 10);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      const ev = new Date();
      ev.setUTCHours(hh, mm, 0, 0);
      const tEv = ev.getTime();
      if (nowMs >= tEv - windowMin * 60_000 && nowMs < tEv) {
        await setPendingReason(
          supabase,
          row.id,
          `ORB blocked: macro high-impact event window (${(e as { title?: string }).title ?? "event"}).`,
        );
        return "not_matched";
      }
    }
  }

  const customId = `custom_${strategy.id}`;
  const tradingModeUpper = String(merged.trading_mode ?? "BOTH").toUpperCase();
  /** Request both scan sides when strategy is BOTH; LONG/SHORT limit signals to one side (row.action is not authoritative). */
  const signalsRequestAction =
    tradingModeUpper === "LONG" ? "BUY" : tradingModeUpper === "SHORT" ? "SELL" : "BOTH";
  const checkHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (entryDigestSecret) {
    checkHeaders["x-digest-secret"] = entryDigestSecret;
    checkHeaders["x-digest-user-id"] = String(row.user_id);
  }
  if (openalgoApiKey) {
    checkHeaders["x-openalgo-api-key"] = openalgoApiKey;
  }
  checkHeaders["x-pending-is-paper"] = row.is_paper_trade ? "true" : "false";

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
      symbol: signalSymbol,
      strategies: [],
      action: signalsRequestAction,
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

  const sideMatchesTradingMode = (s: any): boolean => {
    const side = String(s?.side ?? "").toUpperCase();
    if (tradingModeUpper === "LONG") return side === "BUY";
    if (tradingModeUpper === "SHORT") return side === "SELL";
    return side === "BUY" || side === "SELL";
  };

  const matchedSignal = signals.find((s: any) =>
    String(s?.strategyId ?? "") === customId &&
    sideMatchesTradingMode(s) &&
    Boolean(s?.isLive) &&
    !Boolean(s?.isPredicted),
  );
  const achieved = Boolean(matchedSignal);
  const resolvedAction: "BUY" | "SELL" = achieved
    ? (String((matchedSignal as any)?.side ?? "").toUpperCase() === "SELL" ? "SELL" : "BUY")
    : "BUY";

  if (!achieved) {
    const sideCandidates = signals.filter((s: any) =>
      String(s?.strategyId ?? "") === customId &&
      sideMatchesTradingMode(s) &&
      !Boolean(s?.isPredicted)
    );
    const nearest = sideCandidates[0] as Record<string, unknown> | undefined;
    const auditLinesRaw = (nearest?.conditionAudit && typeof nearest.conditionAudit === "object")
      ? (nearest.conditionAudit as { lines?: Array<{ ok?: boolean; label?: string }> }).lines
      : [];
    const auditLines = Array.isArray(auditLinesRaw)
      ? auditLinesRaw
        .slice(0, 28)
        .map((l) => `${l?.ok ? "PASS" : "FAIL"} ${String(l?.label ?? "").replace(/\s+/g, " ").trim()}`)
        .filter(Boolean)
      : [];
    const passCount = auditLines.filter((x) => x.startsWith("PASS ")).length;
    const failCount = auditLines.filter((x) => x.startsWith("FAIL ")).length;
    const liveFlag = Boolean(nearest?.isLive) ? "YES" : "NO";
    const px = Number((nearest as any)?.priceAtEntry ?? 0);
    const pxText = Number.isFinite(px) && px > 0 ? px.toFixed(2) : "—";
    const ts = String((nearest as any)?.entryTimestamp ?? (nearest as any)?.entryTime ?? "").trim();
    const strategyKind = String((nearest as any)?.conditionAudit?.kind ?? "").trim();
    const reason = nearest
      ? [
        "No live entry signal yet.",
        `State: LIVE_BAR=${liveFlag} SIDE=${String((nearest as any)?.side ?? row.action).toUpperCase()} PRICE=${pxText}${ts ? ` TIME=${ts}` : ""}${strategyKind ? ` KIND=${strategyKind}` : ""}`,
        ...(auditLines.length > 0
          ? [`Checks: ${passCount} pass / ${failCount} fail`, ...auditLines]
          : []),
      ].join("\n")
      : "No live entry signal yet. Strategy conditions are still not met on the current live bar.";
    await setPendingReason(supabase, row.id, reason);
    return "not_matched";
  }

  const riskTz = sessionProf.timeZone;
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

  // ── Paper trade path: skip broker entirely, insert active_trades directly ────
  if (row.is_paper_trade) {
    let entryPxPaper = Number((matchedSignal as any)?.priceAtEntry);
    if (!Number.isFinite(entryPxPaper) || entryPxPaper <= 0) {
      const fallback = signals.map((s: any) => Number(s?.priceAtEntry)).find((n: number) =>
        Number.isFinite(n) && n > 0
      );
      entryPxPaper = fallback ?? 0;
    }

    const slPctPaper = merged.stop_loss_pct != null ? Number(merged.stop_loss_pct) : 2;
    const tpPctPaper = merged.take_profit_pct != null ? Number(merged.take_profit_pct) : 4;
    const isSellPaper = resolvedAction === "SELL";
    const presetLevelsPaper = (matchedSignal as any)?.presetPriceLevels as
      { stopLossPrice?: number; takeProfitPrice?: number } | null | undefined;
    const slPricePaper = (presetLevelsPaper?.stopLossPrice != null && Number.isFinite(presetLevelsPaper.stopLossPrice))
      ? presetLevelsPaper.stopLossPrice
      : (isSellPaper ? entryPxPaper * (1 + slPctPaper / 100) : entryPxPaper * (1 - slPctPaper / 100));
    const tpPricePaper = (presetLevelsPaper?.takeProfitPrice != null && Number.isFinite(presetLevelsPaper.takeProfitPrice))
      ? presetLevelsPaper.takeProfitPrice
      : (isSellPaper ? entryPxPaper * (1 - tpPctPaper / 100) : entryPxPaper * (1 + tpPctPaper / 100));

    const positionConfigPaper = ((strategy as any)?.position_config && typeof (strategy as any).position_config === "object")
      ? ((strategy as any).position_config as Record<string, unknown>)
      : {};
    const resolvedExchangePaper = String(positionConfigPaper.exchange ?? row.exchange ?? "NSE").toUpperCase();
    const resolvedProductPaper = String(positionConfigPaper.orderProduct ?? row.product ?? "MIS").toUpperCase();
    const rowQtyPaper = Number(row.quantity);
    const pcQtyPaper = Number(positionConfigPaper.quantity);
    const resolvedQtyPaper = Number.isFinite(rowQtyPaper) && rowQtyPaper > 0
      ? rowQtyPaper
      : (Number.isFinite(pcQtyPaper) && pcQtyPaper > 0 ? pcQtyPaper : 1);
    const isCryptoPaper = resolvedExchangePaper === "CRYPTO"
      || String(row.symbol ?? "").toUpperCase().includes("-USD")
      || String(row.symbol ?? "").toUpperCase().includes("-USDT");
    const sharesPaper = isCryptoPaper
      ? Number(resolvedQtyPaper.toFixed(8))
      : Math.max(1, Math.round(resolvedQtyPaper));
    const investmentAmountPaper = Math.round((entryPxPaper > 0 ? entryPxPaper * sharesPaper : 0) * 100) / 100;
    const paperBrokerOrderId = `PAPER-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const { error: insertErr } = await supabase
      .from("active_trades")
      .insert({
        user_id: row.user_id,
        symbol: String(row.symbol).toUpperCase(),
        action: resolvedAction,
        status: "active",
        entry_price: entryPxPaper > 0 ? entryPxPaper : 0.0001,
        reference_entry_price: entryPxPaper > 0 ? entryPxPaper : 0.0001,
        shares: sharesPaper,
        investment_amount: investmentAmountPaper > 0 ? investmentAmountPaper : 0.01,
        exchange: resolvedExchangePaper,
        product: resolvedProductPaper,
        strategy_id: row.strategy_id,
        strategy_type: String(merged.paper_strategy_type ?? "custom"),
        broker_order_id: paperBrokerOrderId,
        stop_loss_price: Number.isFinite(slPricePaper) ? slPricePaper : null,
        take_profit_price: Number.isFinite(tpPricePaper) ? tpPricePaper : null,
        stop_loss_percentage: slPctPaper,
        target_profit_percentage: tpPctPaper,
        current_price: entryPxPaper > 0 ? entryPxPaper : null,
        current_pnl: 0,
        current_pnl_percentage: 0,
        entry_time: new Date().toISOString(),
      });

    if (insertErr) {
      await setPendingReason(supabase, row.id, `Paper trade insert failed: ${insertErr.message}`);
      return "error";
    }

    localFireGuard.set(dedupeKey, Date.now());
    await supabase.from("pending_conditional_orders").update({
      status: "executed",
      executed_at: new Date().toISOString(),
      broker_order_id: paperBrokerOrderId,
      error_message: null,
      last_checked_at: new Date().toISOString(),
    }).eq("id", row.id);

    return "fired";
  }

  const apiKey = openalgoApiKey;
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
  const isCryptoLive = resolvedExchange === "CRYPTO";
  const finalOrderQty = isCryptoLive
    ? Number(resolvedQty.toFixed(8))
    : Math.max(1, Math.round(resolvedQty));
  const resolvedPriceType = String(
    (positionConfig.orderType === "LIMIT" ? "LIMIT" : (positionConfig.orderType === "STOP" || positionConfig.orderType === "STOP_LIMIT") ? "SL" : "MARKET"),
  ).toUpperCase();

  const orderPayload = {
    apikey: apiKey.trim(),
    strategy: strategy.name,
    exchange: resolvedExchange,
    symbol: String(row.symbol).toUpperCase().replace(/\.NS$/i, "").replace(/\.BO$/i, ""),
    action: resolvedAction,
    product: resolvedProduct,
    pricetype: resolvedPriceType,
    quantity: String(Number.isFinite(finalOrderQty) && finalOrderQty > 0 ? finalOrderQty : 1),
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
  const isSell = resolvedAction === "SELL";

  const presetLevels = (matchedSignal as any)?.presetPriceLevels as
    { stopLossPrice?: number; takeProfitPrice?: number } | null | undefined;
  const stopLossPrice = (presetLevels?.stopLossPrice != null && Number.isFinite(presetLevels.stopLossPrice))
    ? presetLevels.stopLossPrice
    : (isSell ? entryPx * (1 + slPct / 100) : entryPx * (1 - slPct / 100));
  const takeProfitPrice = (presetLevels?.takeProfitPrice != null && Number.isFinite(presetLevels.takeProfitPrice))
    ? presetLevels.takeProfitPrice
    : (isSell ? entryPx * (1 - tpPct / 100) : entryPx * (1 + tpPct / 100));
  const sharesNum = Math.max(1, Number.isFinite(finalOrderQty) && finalOrderQty > 0 ? finalOrderQty : 1);
  const investmentAmount = Math.round((entryPx > 0 ? entryPx * sharesNum : 0) * 100) / 100;

  const readyPayload: ReadyToFirePayload = {
    pending_row_id: row.id,
    order_payload: orderPayload as unknown as Record<string, string | number>,
    active_trade_template: {
      user_id: row.user_id,
      symbol: String(row.symbol).toUpperCase(),
      action: resolvedAction,
      status: "active",
      entry_price: entryPx > 0 ? entryPx : 0.0001,
      reference_entry_price: entryPx > 0 ? entryPx : 0.0001,
      shares: sharesNum,
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
