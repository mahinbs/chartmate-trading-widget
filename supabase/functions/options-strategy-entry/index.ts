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
 *   4. Skip if: expiry_day_guard enabled AND today is expiry day
 *   5. Skip if: vix_filter enabled AND VIX > max_vix
 *   6. ORB check: fetch 5m candles from 09:15 to orb_end_time, lock range high/low
 *   7. Momentum check: last N candles all making higher closes (for BUY) or lower closes (for SELL)
 *   8. Breakout: current close > ORB high (BUY CE) or current close < ORB low (BUY PE)
 *   9. On signal: call options-place-order to fire the trade
 *
 * Auth: X-Cron-Secret header matching CRON_SECRET env var
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";
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

/** Fetch 5m OHLCV bars from OpenAlgo platform API for a given symbol */
async function fetch5mBars(
  symbol: string,
  exchange: string,
  days: number,
  apiKey: string,
): Promise<{ o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; t: number[] } | null> {
  try {
    const res = await fetch(`${OPENALGO_URL}/api/v1/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: apiKey,
        symbol,
        exchange,
        interval: "5m",
        start_date: new Date(Date.now() - days * 86400 * 1000).toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const bars = data?.data ?? data;
    if (!Array.isArray(bars) || bars.length === 0) return null;
    return {
      o: bars.map((b: Record<string, unknown>) => Number(b.open ?? b.o ?? 0)),
      h: bars.map((b: Record<string, unknown>) => Number(b.high ?? b.h ?? 0)),
      l: bars.map((b: Record<string, unknown>) => Number(b.low ?? b.l ?? 0)),
      c: bars.map((b: Record<string, unknown>) => Number(b.close ?? b.c ?? 0)),
      v: bars.map((b: Record<string, unknown>) => Number(b.volume ?? b.v ?? 0)),
      t: bars.map((b: Record<string, unknown>) => Number(b.timestamp ?? b.t ?? b.time ?? 0)),
    };
  } catch {
    return null;
  }
}

/** Fetch current VIX from NSE (Yahoo Finance as fallback) */
async function fetchVix(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX?interval=1m&range=1d",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price != null ? Number(price) : null;
  } catch {
    return null;
  }
}

/** Check ORB breakout and momentum. Returns "CE", "PE", or null */
function evaluateORBSignal(
  bars: { o: number[]; h: number[]; l: number[]; c: number[]; t: number[] },
  orbConfig: {
    orb_duration_mins: number;
    min_range_pct: number;
    max_range_pct: number;
    momentum_bars: number;
  },
  todayDateStr: string,
): "CE" | "PE" | null {
  const { orb_duration_mins, min_range_pct, max_range_pct, momentum_bars } = orbConfig;

  // Filter today's bars
  const todayBars: { o: number; h: number; l: number; c: number; t: number }[] = [];
  for (let i = 0; i < bars.c.length; i++) {
    const barDate = new Date(bars.t[i] * 1000).toISOString().split("T")[0];
    if (barDate === todayDateStr) {
      todayBars.push({ o: bars.o[i], h: bars.h[i], l: bars.l[i], c: bars.c[i], t: bars.t[i] });
    }
  }
  if (todayBars.length < momentum_bars + 1) return null;

  // ORB = first N bars of the day (each bar = 5m, so N = orb_duration_mins / 5)
  const orbBarsCount = Math.max(1, Math.floor(orb_duration_mins / 5));
  const orbBars = todayBars.slice(0, orbBarsCount);
  const remainBars = todayBars.slice(orbBarsCount);
  if (remainBars.length < momentum_bars) return null;

  const orbHigh = Math.max(...orbBars.map((b) => b.h));
  const orbLow = Math.min(...orbBars.map((b) => b.l));
  const orbRange = orbHigh - orbLow;
  const orbMid = (orbHigh + orbLow) / 2;
  const rangePct = orbRange / orbMid;

  // Range validity check
  if (rangePct < min_range_pct / 100 || rangePct > max_range_pct / 100) return null;

  // Latest bars for momentum check
  const recentBars = remainBars.slice(-momentum_bars);
  const latestClose = recentBars[recentBars.length - 1].c;

  // Bullish breakout: price above ORB high with N consecutive higher closes
  if (latestClose > orbHigh) {
    const bullishMomentum = recentBars.every((b, idx) => {
      if (idx === 0) return true;
      return b.c > recentBars[idx - 1].c;
    });
    if (bullishMomentum) return "CE";
  }

  // Bearish breakout: price below ORB low with N consecutive lower closes
  if (latestClose < orbLow) {
    const bearishMomentum = recentBars.every((b, idx) => {
      if (idx === 0) return true;
      return b.c < recentBars[idx - 1].c;
    });
    if (bearishMomentum) return "PE";
  }

  return null;
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

    // Fetch VIX once for all strategies
    const currentVix = await fetchVix();

    for (const strategy of strategies) {
      const sid = strategy.id as string;
      try {
        const exitRules = strategy.exit_rules ?? {};
        const orbConfig = strategy.orb_config ?? {};
        const riskConfig = strategy.risk_config ?? {};
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

        // ── VIX filter ──────────────────────────────────────────────────
        if (entryConditions.vix_filter?.enabled && currentVix !== null) {
          const maxVix = entryConditions.vix_filter.max_vix ?? 25;
          if (currentVix > maxVix) {
            results.push({ strategy_id: sid, result: `skipped:vix_too_high(${currentVix})` });
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

        // ── ORB breakout check ──────────────────────────────────────────
        let signal: "CE" | "PE" | null = null;

        if (entryConditions.orb_breakout !== false) {
          const bars = await fetch5mBars(strategy.underlying, "NSE", 3, apiKey || "");
          if (!bars) {
            results.push({ strategy_id: sid, result: "skipped:no_price_data" });
            continue;
          }
          signal = evaluateORBSignal(bars, {
            orb_duration_mins: orbConfig.orb_duration_mins ?? 15,
            min_range_pct: orbConfig.min_range_pct ?? 0.2,
            max_range_pct: orbConfig.max_range_pct ?? 1.0,
            momentum_bars: orbConfig.momentum_bars ?? 3,
          }, todayDateStr);
        }

        // ── Override with strategy's option_type if not auto ───────────
        const resolvedOptionType =
          strategy.option_type === "auto" ? signal : (strategy.option_type ?? signal);
        if (!resolvedOptionType) {
          results.push({ strategy_id: sid, result: "no_signal" });
          continue;
        }

        // ── Fetch nearest expiry ────────────────────────────────────────
        const expiryType = strategy.expiry_type ?? "weekly";
        let expiryDate: string | null = null;
        if (apiKey) {
          try {
            const expiryRes = await fetch(`${OPENALGO_URL}/api/v1/expiry`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                apikey: apiKey,
                symbol: strategy.underlying,
                exchange: strategy.exchange,
                instrumenttype: strategy.instrument_type ?? "OPTIDX",
              }),
              signal: AbortSignal.timeout(10000),
            });
            if (expiryRes.ok) {
              const expiryData = await expiryRes.json();
              const dates: string[] = Array.isArray(expiryData?.data) ? expiryData.data : [];
              expiryDate = dates[expiryType === "monthly" ? 1 : 0] ?? dates[0] ?? null;
            }
          } catch { /* use null */ }
        }

        if (!expiryDate) {
          results.push({ strategy_id: sid, result: "skipped:no_expiry_resolved" });
          continue;
        }

        // ── Place the order ─────────────────────────────────────────────
        const lotSize = riskConfig.lot_size ?? 1;
        const isPaper = strategy.is_paper_only === true;

        // Use internal options-place-order via supabase.functions or direct HTTP
        const placeRes = await fetch(
          `${SUPABASE_URL}/functions/v1/options-place-order`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              options_strategy_id: sid,
              underlying: strategy.underlying,
              exchange: strategy.exchange,
              expiry_date: expiryDate,
              strike_offset: strategy.strike_selection ?? "ATM",
              option_type: resolvedOptionType,
              action: "BUY",
              quantity: lotSize,
              product: "MIS",
              is_paper_trade: isPaper,
            }),
            signal: AbortSignal.timeout(20000),
          },
        );

        const placeData = await placeRes.json().catch(() => ({}));

        if (!placeRes.ok) {
          results.push({ strategy_id: sid, result: `error:place_order_failed(${placeData?.error ?? placeRes.status})` });
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
              last_signal: resolvedOptionType,
              last_trade_id: placeData.trade_id,
            },
          })
          .eq("id", sid);

        results.push({ strategy_id: sid, result: `entered:${resolvedOptionType}(${isPaper ? "paper" : "live"})` });
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
