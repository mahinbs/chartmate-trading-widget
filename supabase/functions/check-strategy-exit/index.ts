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
 *   2. If exit_conditions.clockExitTime set          → exit when wall clock >= that time (symbol session TZ)
 *   3. Check strategy-entry-signals for the OPPOSITE action signal (live, not predicted)
 *      → reversal means exit
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractAlgoGuidePreset, supertrendSeries } from "../_shared/algoGuideDetectors.ts";
import { resolveMarketSessionProfile } from "../_shared/marketSession.ts";
import { fetchOpenAlgoHistoryCandles, OPENALGO_URL } from "../_shared/openAlgoMarketData.ts";
const STREAM_TICK_SECRET = Deno.env.get("STREAM_TICK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ENTRY_DIGEST_SECRET = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";

/** Recent 5m bars from OpenAlgo (live path — no Yahoo). */
async function fetchRecentCandles(
  yahooStyleSymbol: string,
  exchange: string,
  apiKey: string,
): Promise<{ h: number[]; l: number[]; c: number[] } | null> {
  if (!apiKey || !OPENALGO_URL) return null;
  const endD = new Date().toISOString().slice(0, 10);
  const startD = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const sym = yahooStyleSymbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
  const pack = await fetchOpenAlgoHistoryCandles(
    apiKey,
    sym,
    exchange,
    "5m",
    startD,
    endD,
    OPENALGO_URL,
  );
  if (!pack || pack.c.length < 20) return null;
  return { h: pack.h, l: pack.l, c: pack.c };
}
/** Simple EMA computation */ function ema(values, period) {
  const result = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let sum = 0;
  for(let i = 0; i < period; i++)sum += values[i];
  result[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for(let i = period; i < values.length; i++){
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Stream-Tick-Secret"
};
function wallClockMinutes(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());
    const hh = Number(parts.find((p)=>p.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((p)=>p.type === "minute")?.value ?? NaN);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  } catch  {
    return null;
  }
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders
  };
  if (!STREAM_TICK_SECRET || req.headers.get("X-Stream-Tick-Secret") !== STREAM_TICK_SECRET) {
    return new Response(JSON.stringify({
      error: "Unauthorized"
    }), {
      status: 401,
      headers
    });
  }
  try {
    const body = await req.json().catch(()=>({}));
    const tradeId = String(body.trade_id ?? "").trim();
    if (!tradeId) {
      return new Response(JSON.stringify({
        error: "trade_id is required"
      }), {
        status: 400,
        headers
      });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    // Fetch the active trade
    const { data: trade, error: tradeErr } = await supabase.from("active_trades").select("id, user_id, symbol, action, status, strategy_id, entry_price, shares, exchange, product, stop_loss_price, take_profit_price").eq("id", tradeId).in("status", [
      "active",
      "monitoring",
      "exit_zone"
    ]).maybeSingle();
    if (tradeErr || !trade) {
      return new Response(JSON.stringify({
        should_exit: false,
        reason: null,
        trade_id: tradeId
      }), {
        status: 200,
        headers
      });
    }
    const strategyId = trade.strategy_id;
    if (!strategyId) {
      // No strategy attached — no indicator exit, only price/time (handled by monitor directly)
      return new Response(JSON.stringify({
        should_exit: false,
        reason: "no_strategy",
        trade_id: tradeId
      }), {
        status: 200,
        headers
      });
    }
    // Fetch strategy
    const { data: strategy, error: stratErr } = await supabase.from("user_strategies").select("id, name, trading_mode, is_intraday, paper_strategy_type, exit_conditions, entry_conditions, position_config, risk_config, chart_config, execution_days, market_type, squareoff_time, start_time, end_time, stop_loss_pct, take_profit_pct, risk_per_trade_pct, description").eq("id", strategyId).maybeSingle();
    if (stratErr || !strategy) {
      return new Response(JSON.stringify({
        should_exit: false,
        reason: "strategy_not_found",
        trade_id: tradeId
      }), {
        status: 200,
        headers
      });
    }
    const { data: brokerInt } = await supabase
      .from("user_trading_integration")
      .select("openalgo_api_key")
      .eq("user_id", trade.user_id)
      .eq("is_active", true)
      .maybeSingle();
    const oaKey = String((brokerInt as { openalgo_api_key?: string } | null)?.openalgo_api_key ?? "").trim();
    const exitCfg = strategy.exit_conditions && typeof strategy.exit_conditions === "object" ? strategy.exit_conditions : {};
    let clockSymbol = String(trade.symbol ?? "").toUpperCase();
    const tradeEx0 = String(trade.exchange ?? "").toUpperCase();
    if (tradeEx0 === "NSE" && !clockSymbol.endsWith(".NS") && !clockSymbol.endsWith(".BO")) {
      clockSymbol += ".NS";
    } else if (tradeEx0 === "BSE" && !clockSymbol.endsWith(".BO") && !clockSymbol.endsWith(".NS")) {
      clockSymbol += ".BO";
    }
    const exitTz = resolveMarketSessionProfile(clockSymbol).timeZone;
    // If user explicitly disabled auto exit for this strategy → skip indicator check
    if (exitCfg.autoExitEnabled === false) {
      return new Response(JSON.stringify({
        should_exit: false,
        reason: "auto_exit_disabled",
        trade_id: tradeId
      }), {
        status: 200,
        headers
      });
    }
    // Clock-based exit (HH:MM in symbol's session timezone — IST / US Eastern / UTC)
    const clockExit = String(exitCfg.clockExitTime ?? "").trim();
    if (/^\d{1,2}:\d{2}$/.test(clockExit)) {
      const [hh, mm] = clockExit.split(":").map(Number);
      const targetMinutes = hh * 60 + mm;
      const localNow = wallClockMinutes(exitTz);
      if (localNow !== null && localNow >= targetMinutes) {
        return new Response(JSON.stringify({
          should_exit: true,
          reason: `clock_exit_time_reached (${clockExit} ${exitTz})`,
          trade_id: tradeId
        }), {
          status: 200,
          headers
        });
      }
    }
    // Squareoff time (intraday) in symbol session timezone
    const squareoffRaw = String(strategy.squareoff_time ?? "").trim();
    if (Boolean(strategy.is_intraday) && /^\d{1,2}:\d{2}$/.test(squareoffRaw)) {
      const [hh, mm] = squareoffRaw.split(":").map(Number);
      const targetMinutes = hh * 60 + mm;
      const localSq = wallClockMinutes(exitTz);
      if (localSq !== null && localSq >= targetMinutes) {
        return new Response(JSON.stringify({
          should_exit: true,
          reason: `squareoff_time_reached (${squareoffRaw} ${exitTz})`,
          trade_id: tradeId
        }), {
          status: 200,
          headers
        });
      }
    }
    // Indicator-based exit: check if the OPPOSITE side now has a live signal
    // BUY trade → check if SELL signal is live (reversal = exit)
    const tradeAction = String(trade.action ?? "BUY").toUpperCase();
    const exitSide = tradeAction === "BUY" ? "SELL" : "BUY";
    const customId = `exit_check_${strategy.id}`;
    const chartCfg = strategy.chart_config && typeof strategy.chart_config === "object" ? strategy.chart_config : {};
    let intradayInterval = String(chartCfg.interval ?? "5m").trim().toLowerCase() || "5m";
    if ([
      "1d",
      "1day",
      "daily"
    ].includes(intradayInterval)) intradayInterval = "5m";
    const checkHeaders = {
      "Content-Type": "application/json"
    };
    if (ENTRY_DIGEST_SECRET) {
      checkHeaders["x-digest-secret"] = ENTRY_DIGEST_SECRET;
      checkHeaders["x-digest-user-id"] = String(trade.user_id);
    }
    if (oaKey) checkHeaders["x-openalgo-api-key"] = oaKey;
    checkHeaders["x-pending-is-paper"] = "false";
    // Append exchange suffix for Indian stocks so data providers resolve correctly
    let exitSymbol = String(trade.symbol ?? "").toUpperCase();
    const tradeExchange = String(trade.exchange ?? "").toUpperCase();
    if (tradeExchange === "NSE" && !exitSymbol.endsWith(".NS") && !exitSymbol.endsWith(".BO")) {
      exitSymbol += ".NS";
    } else if (tradeExchange === "BSE" && !exitSymbol.endsWith(".BO") && !exitSymbol.endsWith(".NS")) {
      exitSymbol += ".BO";
    }
    const scanRes = await fetch(`${SUPABASE_URL}/functions/v1/strategy-entry-signals`, {
      method: "POST",
      headers: checkHeaders,
      body: JSON.stringify({
        symbol: exitSymbol,
        strategies: [],
        action: exitSide,
        days: 90,
        preferIntraday: Boolean(strategy.is_intraday ?? true),
        intradayInterval,
        intradayLookbackMinutes: 5 * 24 * 60,
        customStrategies: [
          {
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
            description: strategy.description ?? undefined
          }
        ]
      })
    });
    const scanData = await scanRes.json().catch(()=>({}));
    const signals = Array.isArray(scanData?.signals) ? scanData.signals : [];
    const reversalSignal = signals.find((s)=>String(s?.strategyId ?? "") === customId && String(s?.side ?? "").toUpperCase() === exitSide && Boolean(s?.isLive) && !Boolean(s?.isPredicted));
    if (reversalSignal) {
      return new Response(JSON.stringify({
        should_exit: true,
        reason: `indicator_reversal_${exitSide.toLowerCase()}_signal`,
        trade_id: tradeId,
        signal: reversalSignal
      }), {
        status: 200,
        headers
      });
    }
    // ── Phase 3: Dynamic trailing SL/TP ──
    // For preset strategies, recompute indicator and ratchet SL toward price
    let updatedLevels = null;
    const preset = extractAlgoGuidePreset(strategy.entry_conditions);
    const currentSl = trade.stop_loss_price != null ? Number(trade.stop_loss_price) : null;
    if (preset && currentSl != null && Number.isFinite(currentSl)) {
      const tradeSymbol = String(trade.symbol ?? "").toUpperCase();
      const tradeExch = String(trade.exchange ?? "").toUpperCase();
      const fullSymbol = tradeExch === "NSE" && !tradeSymbol.endsWith(".NS") && !tradeSymbol.endsWith(".BO") ? `${tradeSymbol}.NS` : tradeSymbol;
      if (preset === "supertrend_7_3") {
        const candles = await fetchRecentCandles(fullSymbol, tradeExch, oaKey);
        if (candles) {
          const { line } = supertrendSeries(candles.h, candles.l, candles.c, 7, 3);
          const lastLine = line[line.length - 1];
          if (Number.isFinite(lastLine)) {
            const isBuy = tradeAction === "BUY";
            // Ratchet: BUY → SL only moves up; SELL → SL only moves down
            if (isBuy && lastLine > currentSl) {
              updatedLevels = {
                stop_loss_price: lastLine
              };
            } else if (!isBuy && lastLine < currentSl) {
              updatedLevels = {
                stop_loss_price: lastLine
              };
            }
          }
        }
      } else if (preset === "vwap_bounce" || !preset) {
        // EMA20 trailing for EMA crossover and fallback
        const candles = await fetchRecentCandles(fullSymbol, tradeExch, oaKey);
        if (candles) {
          const ema20 = ema(candles.c, 20);
          const lastEma = ema20[ema20.length - 1];
          if (Number.isFinite(lastEma)) {
            const isBuy = tradeAction === "BUY";
            if (isBuy && lastEma > currentSl) {
              updatedLevels = {
                stop_loss_price: lastEma
              };
            } else if (!isBuy && lastEma < currentSl) {
              updatedLevels = {
                stop_loss_price: lastEma
              };
            }
          }
        }
      }
      // Persist trailing update to DB
      if (updatedLevels) {
        const updatePayload = {};
        if (updatedLevels.stop_loss_price != null) updatePayload.stop_loss_price = updatedLevels.stop_loss_price;
        if (updatedLevels.take_profit_price != null) updatePayload.take_profit_price = updatedLevels.take_profit_price;
        if (Object.keys(updatePayload).length > 0) {
          await supabase.from("active_trades").update(updatePayload).eq("id", tradeId);
        }
      }
    }
    return new Response(JSON.stringify({
      should_exit: false,
      reason: null,
      trade_id: tradeId,
      updatedLevels
    }), {
      status: 200,
      headers
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("check-strategy-exit:", e);
    return new Response(JSON.stringify({
      error: msg
    }), {
      status: 500,
      headers
    });
  }
});
