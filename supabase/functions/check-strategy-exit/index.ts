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
import {
  extractAlgoGuidePreset,
  supertrendSeries,
} from "../_shared/algoGuideDetectors.ts";

const STREAM_TICK_SECRET = Deno.env.get("STREAM_TICK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
const ENTRY_DIGEST_SECRET = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";

function toTwelveDataSymbol(sym: string): string {
  return sym.replace(/\.(NS|BO|L|AX|TO|DE|F)$/, "");
}

async function fetchRecentCandles(
  symbol: string,
  interval = "5min",
  outputsize = 100,
): Promise<{ h: number[]; l: number[]; c: number[] } | null> {
  if (!TWELVE_DATA_API_KEY) {
    // Try Yahoo Finance as fallback
    const yahooSym = symbol.endsWith(".NS") || symbol.endsWith(".BO") ? symbol : `${symbol}.NS`;
    try {
      const period2 = Math.floor(Date.now() / 1000);
      const period1 = period2 - 5 * 24 * 3600;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?period1=${period1}&period2=${period2}&interval=5m`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const r = data?.chart?.result?.[0];
      const q = r?.indicators?.quote?.[0];
      if (!q?.close?.length) return null;
      const h: number[] = [], l: number[] = [], c: number[] = [];
      for (let i = 0; i < q.close.length; i++) {
        if (q.close[i] != null && q.high[i] != null && q.low[i] != null) {
          h.push(Number(q.high[i]));
          l.push(Number(q.low[i]));
          c.push(Number(q.close[i]));
        }
      }
      return c.length >= 20 ? { h, l, c } : null;
    } catch { return null; }
  }
  const tdSym = toTwelveDataSymbol(symbol);
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSym)}&interval=${interval}&outputsize=${outputsize}&order=ASC&apikey=${TWELVE_DATA_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === "error" || !Array.isArray(data?.values)) return null;
    const h: number[] = [], l: number[] = [], c: number[] = [];
    for (const row of data.values) {
      if (row?.high == null || row?.low == null || row?.close == null) continue;
      h.push(Number(row.high));
      l.push(Number(row.low));
      c.push(Number(row.close));
    }
    return c.length >= 20 ? { h, l, c } : null;
  } catch { return null; }
}

/** Simple EMA computation */
function ema(values: number[], period: number): number[] {
  const result = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

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
      .select("id, user_id, symbol, action, status, strategy_id, entry_price, shares, exchange, product, stop_loss_price, take_profit_price")
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

    // Append exchange suffix for Indian stocks so data providers resolve correctly
    let exitSymbol = String((trade as AnyRecord).symbol ?? "").toUpperCase();
    const tradeExchange = String((trade as AnyRecord).exchange ?? "").toUpperCase();
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

    // ── Phase 3: Dynamic trailing SL/TP ──
    // For preset strategies, recompute indicator and ratchet SL toward price
    let updatedLevels: { stop_loss_price?: number; take_profit_price?: number } | null = null;
    const preset = extractAlgoGuidePreset(strategy.entry_conditions);
    const currentSl = (trade as AnyRecord).stop_loss_price != null
      ? Number((trade as AnyRecord).stop_loss_price)
      : null;

    if (preset && currentSl != null && Number.isFinite(currentSl)) {
      const tradeSymbol = String((trade as AnyRecord).symbol ?? "").toUpperCase();
      const tradeExch = String((trade as AnyRecord).exchange ?? "").toUpperCase();
      const fullSymbol = (tradeExch === "NSE" && !tradeSymbol.endsWith(".NS") && !tradeSymbol.endsWith(".BO"))
        ? `${tradeSymbol}.NS`
        : tradeSymbol;

      if (preset === "supertrend_7_3") {
        const candles = await fetchRecentCandles(fullSymbol);
        if (candles) {
          const { line } = supertrendSeries(candles.h, candles.l, candles.c, 7, 3);
          const lastLine = line[line.length - 1];
          if (Number.isFinite(lastLine)) {
            const isBuy = tradeAction === "BUY";
            // Ratchet: BUY → SL only moves up; SELL → SL only moves down
            if (isBuy && lastLine > currentSl) {
              updatedLevels = { stop_loss_price: lastLine };
            } else if (!isBuy && lastLine < currentSl) {
              updatedLevels = { stop_loss_price: lastLine };
            }
          }
        }
      } else if (preset === "vwap_bounce" || !preset) {
        // EMA20 trailing for EMA crossover and fallback
        const candles = await fetchRecentCandles(fullSymbol);
        if (candles) {
          const ema20 = ema(candles.c, 20);
          const lastEma = ema20[ema20.length - 1];
          if (Number.isFinite(lastEma)) {
            const isBuy = tradeAction === "BUY";
            if (isBuy && lastEma > currentSl) {
              updatedLevels = { stop_loss_price: lastEma };
            } else if (!isBuy && lastEma < currentSl) {
              updatedLevels = { stop_loss_price: lastEma };
            }
          }
        }
      }

      // Persist trailing update to DB
      if (updatedLevels) {
        const updatePayload: AnyRecord = {};
        if (updatedLevels.stop_loss_price != null) updatePayload.stop_loss_price = updatedLevels.stop_loss_price;
        if (updatedLevels.take_profit_price != null) updatePayload.take_profit_price = updatedLevels.take_profit_price;
        if (Object.keys(updatePayload).length > 0) {
          await supabase
            .from("active_trades")
            .update(updatePayload)
            .eq("id", tradeId);
        }
      }
    }

    return new Response(
      JSON.stringify({ should_exit: false, reason: null, trade_id: tradeId, updatedLevels }),
      { status: 200, headers },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("check-strategy-exit:", e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});
