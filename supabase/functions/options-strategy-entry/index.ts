/**
 * options-strategy-entry — Supabase Edge Function
 *
 * Evaluates all active options strategies and fires entries when conditions are met.
 * Called by pg_cron every 1 minute during market hours (09:16 – 15:14 IST).
 *
 * Entry logic per strategy:
 *   1. Skip if: outside execution_days, before start_time, after end_time
 *   2. Skip if: already has an open position today for this strategy
 *   3. Skip if: reentry_count >= max_reentry_count
 *   4. Build dynamic strategy params from DB JSON fields
 *   5. Delegate signal + execution to chartmate-options-api /execute-internal
 *   6. Update per-strategy run state after successful entry
 *
 * Auth: X-Cron-Secret header matching CRON_SECRET env var
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";
const OPTIONS_API_URL = (Deno.env.get("OPTIONS_API_URL") ?? "").replace(/\/$/, "");
const OPTIONS_API_INTERNAL_KEY = Deno.env.get("OPTIONS_API_INTERNAL_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Cron-Secret",
};

// ── Helpers ──────────────────────────────────────────────────────────────

function istNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayName(d: Date): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function isoDateIST(d: Date): string {
  const ist = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

type StrategyType = "iron_condor" | "strangle" | "bull_put_spread" | "jade_lizard" | "orb_buying";

function lotUnitsForUnderlying(underlying: string): number {
  const u = String(underlying ?? "").toUpperCase();
  if (u === "BANKNIFTY") return 15;
  if (u === "FINNIFTY") return 25;
  if (u === "MIDCPNIFTY") return 50;
  return 25;
}

function resolveStrategyType(strategy: Record<string, any>): StrategyType {
  const ec = (strategy.entry_conditions ?? {}) as Record<string, unknown>;
  const explicit = String(ec.strategy_type ?? "").toLowerCase();
  if (
    explicit === "iron_condor" ||
    explicit === "strangle" ||
    explicit === "bull_put_spread" ||
    explicit === "jade_lizard" ||
    explicit === "orb_buying"
  ) {
    return explicit as StrategyType;
  }
  const style = String(strategy.strategy_style ?? "").toLowerCase();
  if (style === "iron_condor" || style === "strangle") return style as StrategyType;
  return "orb_buying";
}

function buildExecuteParams(strategy: Record<string, any>, strategyType: StrategyType): Record<string, unknown> {
  const ec = (strategy.entry_conditions ?? {}) as Record<string, unknown>;
  const er = (strategy.exit_rules ?? {}) as Record<string, unknown>;
  const rc = (strategy.risk_config ?? {}) as Record<string, unknown>;
  const orb = (strategy.orb_config ?? {}) as Record<string, unknown>;
  const lots = Math.max(1, Number(rc.lot_size ?? 1));
  const lotSize = lotUnitsForUnderlying(String(strategy.underlying ?? "NIFTY"));
  const common = {
    underlying: strategy.underlying,
    exchange: "NSE_INDEX",
    expiry_date: typeof rc.explicit_expiry_iso === "string" ? rc.explicit_expiry_iso : undefined,
    lots,
    lot_size: lotSize,
    capital: Number(rc.capital ?? 500000),
    risk_pct: Number(ec.risk_pct ?? 0.02),
  };

  if (strategyType === "iron_condor") {
    return {
      ...common,
      wing_width_pts: Number(ec.wing_width_pts ?? 200),
      delta_target: Number(ec.delta_target ?? 0.16),
      min_vix: Number(ec.min_vix ?? 13),
      min_net_premium: Number(ec.min_net_premium ?? 35),
      profit_target_pct: Number(er.profit_target_pct ?? 45) / 100,
      stop_loss_mult: Number(er.stop_loss_mult ?? 2),
      iv_rank_min: Number(ec.iv_rank_min ?? 25),
      adx_max: Number(ec.adx_max ?? 30),
      macro_block_days: Number(ec.macro_block_days ?? 2),
    };
  }
  if (strategyType === "strangle") {
    return {
      ...common,
      delta_target: Number(ec.delta_target ?? 0.2),
      min_vix: Number(ec.min_vix ?? 18),
      min_net_premium: Number(ec.min_net_premium ?? 35),
      roll_trigger_pts: Number(ec.roll_trigger_pts ?? 30),
      max_adjustments: Number(ec.max_adjustments ?? 2),
      profit_target_pct: Number(er.profit_target_pct ?? 50) / 100,
      stop_loss_mult: Number(er.stop_loss_mult ?? 2),
      vix_3day_spike_pct: Number(ec.vix_3day_spike_pct ?? 15),
    };
  }
  if (strategyType === "bull_put_spread") {
    return {
      ...common,
      wing_width_pts: Number(ec.wing_width_pts ?? 100),
      min_drop_pct: Number(ec.min_drop_pct ?? 1.2),
      max_rsi: Number(ec.max_rsi ?? 38),
      min_credit_pct_of_width: Number(ec.min_credit_pct_of_width ?? 0.4),
      profit_target_pct: Number(er.profit_target_pct ?? 75) / 100,
      stop_loss_mult: Number(er.stop_loss_mult ?? 2),
      ema_proximity_pct: Number(ec.ema_proximity_pct ?? 0.005),
      min_dte: Number(ec.min_dte ?? 7),
      max_dte: Number(ec.max_dte ?? 14),
    };
  }
  if (strategyType === "jade_lizard") {
    return {
      ...common,
      min_vix: Number(ec.min_vix ?? 15),
      short_put_delta: Number(ec.short_put_delta ?? 0.25),
      short_call_delta: Number(ec.short_call_delta ?? 0.2),
      call_spread_width_pts: Number(ec.call_spread_width_pts ?? 150),
      profit_target_pct: Number(er.profit_target_pct ?? 50) / 100,
      stop_loss_mult: Number(er.stop_loss_mult ?? 2),
    };
  }
  return {
    underlying: strategy.underlying,
    exchange_underlying: "NSE",
    exchange_options: "NFO",
    expiry_type: strategy.expiry_type === "monthly" ? "monthly" : "weekly",
    strike_offset: strategy.strike_selection ?? "ATM",
    lots,
    lot_size: lotSize,
    orb_duration_mins: Number(orb.orb_duration_mins ?? 15),
    min_range_pct: Number(orb.min_range_pct ?? 0.2),
    max_range_pct: Number(orb.max_range_pct ?? 1.0),
    momentum_bars: Number(orb.momentum_bars ?? 3),
    trade_direction: strategy.trade_direction ?? "both",
    expiry_day_guard: Boolean(ec.expiry_day_guard ?? true),
    sl_pct: Number(er.sl_pct ?? 30),
    tp_pct: Number(er.tp_pct ?? 50),
    trailing_enabled: Boolean(er.trailing_enabled ?? true),
    trail_after_pct: Number(er.trail_after_pct ?? 30),
    trail_pct: Number(er.trail_pct ?? 15),
    time_exit_hhmm: String(er.time_exit_hhmm ?? "15:15"),
    max_reentry_count: Number(er.max_reentry_count ?? 1),
  };
}

// ── Main handler ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  // Authenticate via cron secret
  const incoming = req.headers.get("X-Cron-Secret") ?? "";
  if (CRON_SECRET && incoming !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const supabase = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = istNow();
  const todayDateStr = isoDateIST(now);
  const nowHHMM = hhmm(now);
  const todayDay = dayName(now);

  const results: { strategy_id: string; result: string }[] = [];

  try {
    // Fetch all active options strategies
    const { data: strategies, error: fetchErr } = await (supabase as any)
      .from("options_strategies")
      .select("*")
      .eq("is_active", true);

    if (fetchErr) throw new Error(`Failed to fetch strategies: ${fetchErr.message}`);
    if (!strategies?.length) {
      return new Response(JSON.stringify({ status: "ok", results: [], message: "No active strategies" }), {
        status: 200, headers,
      });
    }

    for (const strategy of strategies) {
      const sid = strategy.id as string;
      try {
        const exitRules = strategy.exit_rules ?? {};
        const entryConditions = strategy.entry_conditions ?? {};
        const strategyState = strategy.strategy_state ?? {};

        // ── Day/time guard ─────────────────────────────────────────────
        const execDays: string[] = strategy.execution_days ?? ["Mon","Tue","Wed","Thu","Fri"];
        if (!execDays.includes(todayDay)) {
          results.push({ strategy_id: sid, result: "skipped:wrong_day" });
          continue;
        }
        if (nowHHMM < (strategy.start_time ?? "09:30")) {
          results.push({ strategy_id: sid, result: "skipped:before_start" });
          continue;
        }
        if (nowHHMM > (strategy.end_time ?? "15:15")) {
          results.push({ strategy_id: sid, result: "skipped:after_end" });
          continue;
        }

        // ── Check if already ran today ──────────────────────────────────
        if (strategyState.last_run_date === todayDateStr) {
          const maxReentry = exitRules.max_reentry_count ?? 1;
          const reentryCount = strategyState.reentry_count ?? 0;
          if (reentryCount >= maxReentry) {
            results.push({ strategy_id: sid, result: "skipped:daily_limit_reached" });
            continue;
          }
        }

        // ── Expiry day guard ────────────────────────────────────────────
        if (entryConditions.expiry_day_guard) {
          const { data: expiries } = await supabase.functions.invoke("fetch-expiry-dates", {
            body: {
              symbol: strategy.underlying,
              exchange: strategy.exchange,
              instrumenttype: strategy.instrument_type ?? "OPTIDX",
            },
          }).catch(() => ({ data: null }));
          const nearestExpiry = expiries?.expiries?.[0]?.date;
          if (nearestExpiry === todayDateStr) {
            results.push({ strategy_id: sid, result: "skipped:expiry_day" });
            continue;
          }
        }

        // ── Check for existing open position ────────────────────────────
        const { data: openTrades } = await (supabase as any)
          .from("active_trades")
          .select("id")
          .eq("options_strategy_id", sid)
          .in("status", ["active", "monitoring", "exit_zone"])
          .limit(1);
        if (openTrades?.length > 0) {
          results.push({ strategy_id: sid, result: "skipped:open_position_exists" });
          continue;
        }

        // ── Fetch user's OpenAlgo API key ───────────────────────────────
        const { data: integration } = await (supabase as any)
          .from("user_trading_integration")
          .select("openalgo_api_key")
          .eq("user_id", strategy.user_id)
          .eq("is_active", true)
          .maybeSingle();
        const apiKey = integration?.openalgo_api_key ?? "";
        if (!apiKey && !strategy.is_paper_only) {
          results.push({ strategy_id: sid, result: "skipped:no_api_key" });
          continue;
        }
        if (!apiKey && !OPENALGO_APP_KEY) {
          results.push({ strategy_id: sid, result: "skipped:no_data_api_key" });
          continue;
        }

        const isPaper = strategy.is_paper_only === true;
        const strategyType = resolveStrategyType(strategy);
        const params = buildExecuteParams(strategy, strategyType);

        if (!OPTIONS_API_URL || !OPTIONS_API_INTERNAL_KEY) {
          results.push({ strategy_id: sid, result: "error:options_api_not_configured" });
          continue;
        }

        const execRes = await fetch(`${OPTIONS_API_URL}/api/options/strategies/execute-internal`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": OPTIONS_API_INTERNAL_KEY,
          },
          body: JSON.stringify({
            user_id: strategy.user_id,
            openalgo_api_key: apiKey || OPENALGO_APP_KEY,
            strategy_type: strategyType,
            params,
            is_paper: isPaper,
            strategy_id: sid,
          }),
          signal: AbortSignal.timeout(25000),
        });

        const execData = await execRes.json().catch(() => ({} as Record<string, unknown>));
        if (!execRes.ok) {
          const detail = String((execData as any)?.detail ?? (execData as any)?.error ?? execRes.status);
          results.push({ strategy_id: sid, result: `error:execute_failed(${detail})` });
          continue;
        }
        if (!execData?.executed) {
          results.push({ strategy_id: sid, result: `no_signal:${String(execData?.reason ?? "strategy_conditions_not_met")}` });
          continue;
        }

        // ── Update strategy state ───────────────────────────────────────
        const prevReentry = strategyState.last_run_date === todayDateStr
          ? (strategyState.reentry_count ?? 0)
          : 0;
        await (supabase as any)
          .from("options_strategies")
          .update({
            strategy_state: {
              ...strategyState,
              last_run_date: todayDateStr,
              reentry_count: prevReentry + 1,
              last_signal: String((execData as any)?.signal?.strategy ?? strategyType),
              last_trade_id: String((execData as any)?.order_result?.trade_id ?? ""),
            },
          })
          .eq("id", sid);

        results.push({ strategy_id: sid, result: `entered:${strategyType}(${isPaper ? "paper" : "live"})` });
      } catch (stratErr) {
        console.error(`[options-strategy-entry] strategy ${sid} error:`, stratErr);
        results.push({ strategy_id: sid, result: `error:${String(stratErr)}` });
      }
    }

    return new Response(
      JSON.stringify({ status: "ok", checked: strategies.length, results }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("[options-strategy-entry] fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers },
    );
  }
});
