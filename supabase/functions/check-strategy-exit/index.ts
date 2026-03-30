/**
 * check-strategy-exit — Called by the monitor on each active trade that has a strategy_id.
 * Evaluates whether indicator-based exit conditions are currently met.
 *
 * Auth: X-Stream-Tick-Secret must match env STREAM_TICK_SECRET.
 *
 * POST { "trade_id": "uuid" }
 *
 * Returns: { should_exit: boolean, reason: string | null, trade_id: string }
 *
 * Exit logic:
 *   1. If exit_conditions.autoExitEnabled === false  → never indicator-exit
 *   2. If exit_conditions.clockExitTime set          → exit when wall clock >= that time (IST)
 *   3. Check strategy-entry-signals for the OPPOSITE action signal (live, not predicted)
 *      → reversal means exit
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STREAM_TICK_SECRET = Deno.env.get("STREAM_TICK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ENTRY_DIGEST_SECRET = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Stream-Tick-Secret",
};

function wallClockMinutes(timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  if (!STREAM_TICK_SECRET || req.headers.get("X-Stream-Tick-Secret") !== STREAM_TICK_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  try {
    const body = await req.json().catch(() => ({})) as { trade_id?: string };
    const tradeId = String(body.trade_id ?? "").trim();
    if (!tradeId) {
      return new Response(JSON.stringify({ error: "trade_id is required" }), { status: 400, headers });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the active trade
    const { data: trade, error: tradeErr } = await supabase
      .from("active_trades")
      .select("id, user_id, symbol, action, status, strategy_id, entry_price, shares, exchange, product")
      .eq("id", tradeId)
      .in("status", ["active", "monitoring", "exit_zone"])
      .maybeSingle();

    if (tradeErr || !trade) {
      return new Response(
        JSON.stringify({ should_exit: false, reason: null, trade_id: tradeId }),
        { status: 200, headers },
      );
    }

    const strategyId = (trade as AnyRecord).strategy_id as string | null;
    if (!strategyId) {
      // No strategy attached — no indicator exit, only price/time (handled by monitor directly)
      return new Response(
        JSON.stringify({ should_exit: false, reason: "no_strategy", trade_id: tradeId }),
        { status: 200, headers },
      );
    }

    // Fetch strategy
    const { data: strategy, error: stratErr } = await supabase
      .from("user_strategies")
      .select("id, name, trading_mode, is_intraday, paper_strategy_type, exit_conditions, entry_conditions, position_config, risk_config, chart_config, execution_days, market_type, squareoff_time, start_time, end_time, stop_loss_pct, take_profit_pct, risk_per_trade_pct, description")
      .eq("id", strategyId)
      .maybeSingle();

    if (stratErr || !strategy) {
      return new Response(
        JSON.stringify({ should_exit: false, reason: "strategy_not_found", trade_id: tradeId }),
        { status: 200, headers },
      );
    }

    const exitCfg = strategy.exit_conditions && typeof strategy.exit_conditions === "object"
      ? (strategy.exit_conditions as AnyRecord)
      : {};

    // If user explicitly disabled auto exit for this strategy → skip indicator check
    if (exitCfg.autoExitEnabled === false) {
      return new Response(
        JSON.stringify({ should_exit: false, reason: "auto_exit_disabled", trade_id: tradeId }),
        { status: 200, headers },
      );
    }

    // Clock-based exit check (clockExitTime in IST HH:MM)
    const clockExit = String(exitCfg.clockExitTime ?? "").trim();
    if (/^\d{1,2}:\d{2}$/.test(clockExit)) {
      const [hh, mm] = clockExit.split(":").map(Number);
      const targetMinutes = hh * 60 + mm;
      const istNow = wallClockMinutes("Asia/Kolkata");
      if (istNow !== null && istNow >= targetMinutes) {
        return new Response(
          JSON.stringify({
            should_exit: true,
            reason: `clock_exit_time_reached (${clockExit} IST)`,
            trade_id: tradeId,
          }),
          { status: 200, headers },
        );
      }
    }

    // Squareoff time check (IST HH:MM) for intraday
    const squareoffRaw = String(strategy.squareoff_time ?? "").trim();
    if (Boolean(strategy.is_intraday) && /^\d{1,2}:\d{2}$/.test(squareoffRaw)) {
      const [hh, mm] = squareoffRaw.split(":").map(Number);
      const targetMinutes = hh * 60 + mm;
      const istNow = wallClockMinutes("Asia/Kolkata");
      if (istNow !== null && istNow >= targetMinutes) {
        return new Response(
          JSON.stringify({
            should_exit: true,
            reason: `squareoff_time_reached (${squareoffRaw} IST)`,
            trade_id: tradeId,
          }),
          { status: 200, headers },
        );
      }
    }

    // Indicator-based exit: check if the OPPOSITE side now has a live signal
    // BUY trade → check if SELL signal is live (reversal = exit)
    const tradeAction = String((trade as AnyRecord).action ?? "BUY").toUpperCase();
    const exitSide = tradeAction === "BUY" ? "SELL" : "BUY";
    const customId = `exit_check_${strategy.id}`;

    const chartCfg = strategy.chart_config && typeof strategy.chart_config === "object"
      ? (strategy.chart_config as AnyRecord)
      : {};
    let intradayInterval = String(chartCfg.interval ?? "5m").trim().toLowerCase() || "5m";
    if (["1d", "1day", "daily"].includes(intradayInterval)) intradayInterval = "5m";

    const checkHeaders: AnyRecord = { "Content-Type": "application/json" };
    if (ENTRY_DIGEST_SECRET) {
      checkHeaders["x-digest-secret"] = ENTRY_DIGEST_SECRET;
      checkHeaders["x-digest-user-id"] = String((trade as AnyRecord).user_id);
    }

    const scanRes = await fetch(`${SUPABASE_URL}/functions/v1/strategy-entry-signals`, {
      method: "POST",
      headers: checkHeaders,
      body: JSON.stringify({
        symbol: (trade as AnyRecord).symbol,
        strategies: [],
        action: exitSide,
        days: 90,
        preferIntraday: Boolean(strategy.is_intraday ?? true),
        intradayInterval,
        intradayLookbackMinutes: 5 * 24 * 60,
        customStrategies: [{
          id: customId,
          name: strategy.name,
          baseType: String(strategy.paper_strategy_type ?? "trend_following"),
          tradingMode: String(strategy.trading_mode ?? "BOTH"),
          stopLossPct: strategy.stop_loss_pct != null ? Number(strategy.stop_loss_pct) : null,
          takeProfitPct: strategy.take_profit_pct != null ? Number(strategy.take_profit_pct) : null,
          isIntraday: Boolean(strategy.is_intraday ?? true),
          entryConditions: strategy.entry_conditions ?? null,
          exitConditions: strategy.exit_conditions ?? null,
          positionConfig: strategy.position_config ?? null,
          riskConfig: strategy.risk_config ?? null,
          chartConfig: strategy.chart_config ?? null,
          executionDays: Array.isArray(strategy.execution_days) ? strategy.execution_days : [],
          marketType: String(strategy.market_type ?? "stocks"),
          startTime: strategy.start_time ?? undefined,
          endTime: strategy.end_time ?? undefined,
          squareoffTime: strategy.squareoff_time ?? undefined,
          riskPerTradePct: strategy.risk_per_trade_pct != null ? Number(strategy.risk_per_trade_pct) : undefined,
          description: strategy.description ?? undefined,
        }],
      }),
    });

    const scanData = (await scanRes.json().catch(() => ({}))) as AnyRecord;
    const signals = Array.isArray(scanData?.signals) ? scanData.signals as AnyRecord[] : [];

    const reversalSignal = signals.find((s) =>
      String(s?.strategyId ?? "") === customId &&
      String(s?.side ?? "").toUpperCase() === exitSide &&
      Boolean(s?.isLive) &&
      !Boolean(s?.isPredicted),
    );

    if (reversalSignal) {
      return new Response(
        JSON.stringify({
          should_exit: true,
          reason: `indicator_reversal_${exitSide.toLowerCase()}_signal`,
          trade_id: tradeId,
          signal: reversalSignal,
        }),
        { status: 200, headers },
      );
    }

    return new Response(
      JSON.stringify({ should_exit: false, reason: null, trade_id: tradeId }),
      { status: 200, headers },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("check-strategy-exit:", e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});
