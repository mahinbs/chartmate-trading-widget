/**
 * paper-exit-monitor — Polls active paper trades and evaluates exit conditions.
 *
 * Called by pg_cron every 2 minutes (or manually via X-Cron-Secret).
 * For each active paper trade with a strategy_id, checks:
 *   1. Clock-based exit time (clockExitTime or squareoff_time in strategy)
 *   2. Stop-loss / take-profit breach against current price
 *   3. Indicator reversal (opposite side live signal from strategy-entry-signals)
 *
 * When exit conditions are met, marks the active_trades row as completed.
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMarketSessionProfile } from "../_shared/marketSession.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const ENTRY_DIGEST_SECRET = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret"
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
async function fetchCurrentPrice(symbol, exchange) {
  try {
    let yahooSym = symbol.toUpperCase();
    if ((exchange === "NSE" || exchange === "BSE") && !yahooSym.endsWith(".NS") && !yahooSym.endsWith(".BO")) {
      yahooSym += exchange === "BSE" ? ".BO" : ".NS";
    }
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - 2 * 3600;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?period1=${period1}&period2=${period2}&interval=1m`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (price != null && Number.isFinite(Number(price))) return Number(price);
  } catch  {}
  return null;
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
  if (CRON_SECRET && req.headers.get("X-Cron-Secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({
      error: "Unauthorized"
    }), {
      status: 401,
      headers
    });
  }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    // Fetch all active paper trades that have a strategy attached
    const { data: trades, error: tradeErr } = await supabase.from("active_trades").select("id, user_id, symbol, action, status, strategy_id, entry_price, shares, investment_amount, exchange, product, stop_loss_price, take_profit_price, current_price, broker_order_id").like("broker_order_id", "PAPER-%").not("strategy_id", "is", null).in("status", [
      "active",
      "monitoring",
      "exit_zone"
    ]);
    if (tradeErr) {
      return new Response(JSON.stringify({
        error: tradeErr.message
      }), {
        status: 500,
        headers
      });
    }
    if (!trades || trades.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        checked: 0,
        exited: 0
      }), {
        status: 200,
        headers
      });
    }
    let checked = 0;
    let exited = 0;
    const results = [];
    for (const trade of trades){
      checked++;
      let shouldExit = false;
      let exitReason = "";
      let exitPrice = null;
      // Fetch strategy
      const { data: strategy } = await supabase.from("user_strategies").select("id, name, trading_mode, is_intraday, paper_strategy_type, exit_conditions, entry_conditions, position_config, risk_config, chart_config, execution_days, market_type, squareoff_time, start_time, end_time, stop_loss_pct, take_profit_pct, risk_per_trade_pct, description").eq("id", trade.strategy_id).maybeSingle();
      if (!strategy) {
        results.push({
          trade_id: trade.id,
          outcome: "skipped_no_strategy"
        });
        continue;
      }
      let signalSymbol = String(trade.symbol ?? "").toUpperCase();
      const exUpper = String(trade.exchange ?? "").toUpperCase();
      if (exUpper === "NSE" && !signalSymbol.endsWith(".NS") && !signalSymbol.endsWith(".BO")) {
        signalSymbol += ".NS";
      } else if (exUpper === "BSE" && !signalSymbol.endsWith(".BO") && !signalSymbol.endsWith(".NS")) {
        signalSymbol += ".BO";
      }
      const exitTz = resolveMarketSessionProfile(signalSymbol).timeZone;
      const exitCfg = strategy.exit_conditions && typeof strategy.exit_conditions === "object" ? strategy.exit_conditions : {};
      // 1. If auto exit disabled, skip indicator checks (but still check SL/TP price)
      const autoExitEnabled = exitCfg.autoExitEnabled !== false;
      if (autoExitEnabled) {
        // 2. Clock-based exit (symbol session TZ)
        const clockExit = String(exitCfg.clockExitTime ?? "").trim();
        if (!shouldExit && /^\d{1,2}:\d{2}$/.test(clockExit)) {
          const [hh, mm] = clockExit.split(":").map(Number);
          const localNow = wallClockMinutes(exitTz);
          if (localNow !== null && localNow >= hh * 60 + mm) {
            shouldExit = true;
            exitReason = `clock_exit_time_reached (${clockExit} ${exitTz})`;
          }
        }
        // 3. Squareoff time (intraday)
        const squareoffRaw = String(strategy.squareoff_time ?? "").trim();
        if (!shouldExit && Boolean(strategy.is_intraday) && /^\d{1,2}:\d{2}$/.test(squareoffRaw)) {
          const [hh, mm] = squareoffRaw.split(":").map(Number);
          const localSq = wallClockMinutes(exitTz);
          if (localSq !== null && localSq >= hh * 60 + mm) {
            shouldExit = true;
            exitReason = `squareoff_time_reached (${squareoffRaw} ${exitTz})`;
          }
        }
        // 4. Indicator reversal via strategy-entry-signals (only if no time exit yet)
        if (!shouldExit) {
          const tradeAction = String(trade.action ?? "BUY").toUpperCase();
          const exitSide = tradeAction === "BUY" ? "SELL" : "BUY";
          const customId = `paper_exit_${strategy.id}`;
          const chartCfg = strategy.chart_config && typeof strategy.chart_config === "object" ? strategy.chart_config : {};
          let intradayInterval = String(chartCfg.interval ?? "5m").trim().toLowerCase() || "5m";
          if ([
            "1d",
            "1day",
            "daily"
          ].includes(intradayInterval)) intradayInterval = "5m";
          const scanHeaders = {
            "Content-Type": "application/json"
          };
          if (ENTRY_DIGEST_SECRET) {
            scanHeaders["x-digest-secret"] = ENTRY_DIGEST_SECRET;
            scanHeaders["x-digest-user-id"] = String(trade.user_id);
          }
          try {
            const scanRes = await fetch(`${SUPABASE_URL}/functions/v1/strategy-entry-signals`, {
              method: "POST",
              headers: scanHeaders,
              body: JSON.stringify({
                symbol: signalSymbol,
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
              }),
              signal: AbortSignal.timeout(20000)
            });
            if (scanRes.ok) {
              const scanData = await scanRes.json().catch(()=>({}));
              const signals = Array.isArray(scanData?.signals) ? scanData.signals : [];
              const reversalSignal = signals.find((s)=>String(s?.strategyId ?? "") === customId && String(s?.side ?? "").toUpperCase() === exitSide && Boolean(s?.isLive) && !Boolean(s?.isPredicted));
              if (reversalSignal) {
                shouldExit = true;
                exitReason = `indicator_reversal_${exitSide.toLowerCase()}_signal`;
                exitPrice = Number.isFinite(Number(reversalSignal?.priceAtEntry)) ? Number(reversalSignal.priceAtEntry) : null;
              }
            }
          } catch  {}
        }
      }
      // 5. SL / TP price breach — always check regardless of autoExitEnabled
      if (!shouldExit) {
        const currentPx = exitPrice ?? (trade.current_price != null ? Number(trade.current_price) : null) ?? await fetchCurrentPrice(String(trade.symbol), String(trade.exchange ?? "NSE"));
        if (currentPx != null && Number.isFinite(currentPx)) {
          const isBuy = String(trade.action ?? "BUY").toUpperCase() === "BUY";
          const slPrice = trade.stop_loss_price != null ? Number(trade.stop_loss_price) : null;
          const tpPrice = trade.take_profit_price != null ? Number(trade.take_profit_price) : null;
          if (slPrice != null && Number.isFinite(slPrice)) {
            const slHit = isBuy ? currentPx <= slPrice : currentPx >= slPrice;
            if (slHit) {
              shouldExit = true;
              exitReason = "stop_loss_triggered";
              exitPrice = currentPx;
            }
          }
          if (!shouldExit && tpPrice != null && Number.isFinite(tpPrice)) {
            const tpHit = isBuy ? currentPx >= tpPrice : currentPx <= tpPrice;
            if (tpHit) {
              shouldExit = true;
              exitReason = "target_hit";
              exitPrice = currentPx;
            }
          }
        }
      }
      if (!shouldExit) {
        results.push({
          trade_id: trade.id,
          outcome: "watching"
        });
        continue;
      }
      // Resolve final exit price if still unknown
      if (exitPrice == null || !Number.isFinite(exitPrice)) {
        exitPrice = await fetchCurrentPrice(String(trade.symbol), String(trade.exchange ?? "NSE")) ?? Number(trade.current_price ?? trade.entry_price);
      }
      const entryPx = Number(trade.entry_price);
      const shares = Number(trade.shares);
      const isBuy = String(trade.action ?? "BUY").toUpperCase() === "BUY";
      const pnl = (exitPrice - entryPx) * shares * (isBuy ? 1 : -1);
      const investAmt = Number(trade.investment_amount) || entryPx * shares || 1;
      const pnlPct = pnl / investAmt * 100;
      const exitStatus = exitReason === "stop_loss_triggered" ? "stopped_out" : exitReason === "target_hit" ? "target_hit" : "completed";
      await supabase.from("active_trades").update({
        status: exitStatus,
        exit_price: exitPrice,
        exit_time: new Date().toISOString(),
        exit_reason: exitReason,
        actual_pnl: Math.round(pnl * 100) / 100,
        actual_pnl_percentage: Math.round(pnlPct * 100) / 100
      }).eq("id", trade.id);
      exited++;
      results.push({
        trade_id: trade.id,
        outcome: "exited",
        reason: exitReason,
        exit_price: exitPrice
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      checked,
      exited,
      results
    }), {
      status: 200,
      headers
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("paper-exit-monitor:", e);
    return new Response(JSON.stringify({
      error: msg
    }), {
      status: 500,
      headers
    });
  }
});
