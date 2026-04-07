/**
 * paper-exit-monitor — Polls active paper trades and evaluates exit conditions.
 *
 * Called by pg_cron every 2 minutes (or manually via X-Cron-Secret).
 * For each active paper trade with a strategy_id, checks:
 *   1. Clock-based exit time (clockExitTime or squareoff_time in strategy)
 *   2. Stop-loss / take-profit breach against current price
 *   3. Indicator reversal (opposite side live signal from strategy-entry-signals)
 *   4. Trailing stop updates:
 *      - supertrend_7_3: trails SL to current Supertrend line value
 *      - rsi_divergence: once trade reaches 2R profit, trails SL to EMA(20)
 *
 * When exit conditions are met, marks the active_trades row as completed.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMarketSessionProfile } from "../_shared/marketSession.ts";
import { supertrendSeries } from "../_shared/algoGuideDetectors.ts";
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
/** Fetch recent OHLCV bars from Yahoo Finance for trailing stop computation */
async function fetchOhlcvBars(
  yahooSymbol: string,
  interval: string,
  bars: number,
): Promise<{ h: number[]; l: number[]; c: number[] } | null> {
  try {
    const period2 = Math.floor(Date.now() / 1000);
    const rangeSeconds = interval === "1h" ? bars * 3600 : bars * 300;
    const period1 = period2 - rangeSeconds * 2; // fetch 2x to ensure we have enough bars
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp as number[] | undefined;
    const quotes = result?.indicators?.quote?.[0];
    if (!timestamps || !quotes) return null;
    const h: number[] = [];
    const l: number[] = [];
    const c: number[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const hi = Number(quotes.high?.[i]);
      const lo = Number(quotes.low?.[i]);
      const cl = Number(quotes.close?.[i]);
      if (!Number.isFinite(hi) || !Number.isFinite(lo) || !Number.isFinite(cl)) continue;
      h.push(hi);
      l.push(lo);
      c.push(cl);
    }
    if (c.length < 10) return null;
    return { h, l, c };
  } catch {
    return null;
  }
}

/** Simple EMA series */
function emaArr(close: number[], period: number): number[] {
  const n = close.length;
  const out = new Array(n).fill(NaN);
  if (n < period) return out;
  const k = 2 / (period + 1);
  let prev = close.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = close[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * For Supertrend trades: fetch recent 5m bars, compute Supertrend(7,3),
 * and tighten the SL if the Supertrend line has moved in our favor.
 * For RSI divergence trades: if trade is in 2R profit, trail SL to EMA(20).
 * Returns the new SL price if it should be updated, or null if no change.
 */
async function computeTrailingSlUpdate(
  yahooSymbol: string,
  preset: string,
  action: string,
  entryPrice: number,
  currentSl: number,
  currentPrice: number,
): Promise<number | null> {
  const isBuy = String(action).toUpperCase() === "BUY";

  if (preset === "supertrend_7_3") {
    // Fetch last 60 bars of 5m data
    const ohlcv = await fetchOhlcvBars(yahooSymbol, "5m", 60);
    if (!ohlcv || ohlcv.c.length < 15) return null;
    const { line, trend } = supertrendSeries(ohlcv.h, ohlcv.l, ohlcv.c, 7, 3);
    const latest = line[line.length - 1];
    const latestTrend = trend[trend.length - 1];
    if (!Number.isFinite(latest)) return null;
    // Only trail if Supertrend agrees with our direction
    if (isBuy && latestTrend !== 1) return null;
    if (!isBuy && latestTrend !== -1) return null;
    // Tighten SL only if new line is better than current SL
    if (isBuy && latest > currentSl && latest < currentPrice) return latest;
    if (!isBuy && latest < currentSl && latest > currentPrice) return latest;
    return null;
  }

  if (preset === "rsi_divergence") {
    const initialRisk = Math.abs(entryPrice - currentSl);
    if (initialRisk <= 0) return null;
    const profit = isBuy ? currentPrice - entryPrice : entryPrice - currentPrice;
    // Only trail once trade is in 2R profit
    if (profit < 2 * initialRisk) return null;
    // Fetch last 30 bars of 1H data to compute EMA(20)
    const ohlcv = await fetchOhlcvBars(yahooSymbol, "1h", 30);
    if (!ohlcv || ohlcv.c.length < 20) return null;
    const ema20 = emaArr(ohlcv.c, 20);
    const latestEma = ema20[ema20.length - 1];
    if (!Number.isFinite(latestEma)) return null;
    // Trail: move SL to EMA(20) if it's tighter (better protection) than current SL
    if (isBuy && latestEma > currentSl && latestEma < currentPrice) return latestEma;
    if (!isBuy && latestEma < currentSl && latestEma > currentPrice) return latestEma;
    return null;
  }

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
      // 5. Trailing stop update (Supertrend trail + RSI 2R EMA trail)
      const entryCondCfg = strategy.entry_conditions && typeof strategy.entry_conditions === "object"
        ? strategy.entry_conditions as Record<string, unknown>
        : {};
      const activePreset = String(entryCondCfg.algoGuidePreset ?? "");
      if (!shouldExit && (activePreset === "supertrend_7_3" || activePreset === "rsi_divergence")) {
        const currentPxForTrail = await fetchCurrentPrice(String(trade.symbol), String(trade.exchange ?? "NSE"));
        const currentSlForTrail = trade.stop_loss_price != null ? Number(trade.stop_loss_price) : null;
        const entryPxForTrail = Number(trade.entry_price);
        if (
          currentPxForTrail != null &&
          currentSlForTrail != null &&
          Number.isFinite(entryPxForTrail) &&
          Number.isFinite(currentSlForTrail)
        ) {
          const newSl = await computeTrailingSlUpdate(
            signalSymbol,
            activePreset,
            String(trade.action ?? "BUY"),
            entryPxForTrail,
            currentSlForTrail,
            currentPxForTrail,
          );
          if (newSl !== null) {
            await supabase.from("active_trades").update({
              stop_loss_price: Math.round(newSl * 100) / 100,
            }).eq("id", trade.id);
            results.push({
              trade_id: trade.id,
              outcome: "trailing_sl_updated",
              new_sl: Math.round(newSl * 100) / 100,
            });
          }
        }
      }

      // 6. SL / TP price breach — always check regardless of autoExitEnabled
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
