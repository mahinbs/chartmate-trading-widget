/**
 * options-paper-exit-monitor — Supabase Edge Function
 *
 * Polls all open options positions (paper and live) and evaluates exit conditions
 * based on the PREMIUM price (not the underlying price). Called every 1–2 minutes
 * by pg_cron during market hours.
 *
 * Exit conditions evaluated per trade:
 *   1. SL on premium:       current_ltp < entry_premium * (1 - sl_pct/100)
 *   2. TP on premium:       current_ltp > entry_premium * (1 + tp_pct/100)
 *   3. Trailing SL:         activate after trail_after_pct profit; trail by trail_pct from peak
 *   4. Time-based exit:     IST time >= time_exit_hhmm → hard exit (theta decay guard)
 *   5. Expiry day exit:     today == expiry_date → square off before 3 PM
 *
 * For live trades: places a SELL/MARKET options order via OpenAlgo.
 * For paper trades: updates active_trades row directly (no broker call).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
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

function isoDateIST(d: Date): string {
  const ist = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

/** Fetch current LTP for an options symbol via OpenAlgo /quotes */
async function fetchOptionLtp(
  symbol: string,
  exchange: string,
  apiKey: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${OPENALGO_URL}/api/v1/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey, symbol, exchange }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ltp = data?.data?.ltp ?? data?.ltp ?? data?.close ?? data?.last_price;
    return ltp != null ? Number(ltp) : null;
  } catch {
    return null;
  }
}

/** Place an exit order via OpenAlgo /optionsorder (live trades only) */
async function placeExitOrder(
  symbol: string,
  exchange: string,
  quantity: number,
  apiKey: string,
  strategyName = "ChartMate Options Exit",
): Promise<string | null> {
  try {
    const res = await fetch(`${OPENALGO_URL}/api/v1/placeorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: apiKey,
        strategy: strategyName,
        symbol,
        exchange,
        action: "SELL",
        product: "MIS",
        pricetype: "MARKET",
        quantity: String(quantity),
        price: "0",
        trigger_price: "0",
        disclosed_quantity: "0",
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return String(data?.orderid ?? data?.order_id ?? data?.data?.orderid ?? "unknown");
  } catch {
    return null;
  }
}

/** Evaluate exit conditions. Returns reason string or null. */
function evaluateExitCondition(
  entryPremium: number,
  peakPremium: number,
  currentLtp: number,
  exitRules: {
    sl_pct?: number;
    tp_pct?: number;
    trailing_enabled?: boolean;
    trail_after_pct?: number;
    trail_pct?: number;
    time_exit_hhmm?: string;
  },
  nowHHMM: string,
  expiryDateStr: string | null,
  todayDateStr: string,
): string | null {
  const slPct = exitRules.sl_pct ?? 30;
  const tpPct = exitRules.tp_pct ?? 50;
  const trailingEnabled = exitRules.trailing_enabled ?? true;
  const trailAfterPct = exitRules.trail_after_pct ?? 30;
  const trailPct = exitRules.trail_pct ?? 15;
  const timeExit = exitRules.time_exit_hhmm ?? "15:15";

  // 1. Expiry day force exit at 14:30
  if (expiryDateStr === todayDateStr && nowHHMM >= "14:30") {
    return "expiry_day_exit";
  }

  // 2. Time-based exit
  if (nowHHMM >= timeExit) {
    return "time_exit";
  }

  if (entryPremium <= 0) return null;

  const gainPct = ((currentLtp - entryPremium) / entryPremium) * 100;

  // 3. Take profit
  if (gainPct >= tpPct) {
    return "take_profit";
  }

  // 4. Stop loss
  const slPrice = entryPremium * (1 - slPct / 100);
  if (currentLtp <= slPrice) {
    return "stop_loss";
  }

  // 5. Trailing stop (only once trade is in profit by trail_after_pct)
  if (trailingEnabled && gainPct >= trailAfterPct && peakPremium > entryPremium) {
    const trailSlPrice = peakPremium * (1 - trailPct / 100);
    if (currentLtp <= trailSlPrice) {
      return "trailing_stop";
    }
  }

  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  // Auth
  const incoming = req.headers.get("X-Cron-Secret") ?? "";
  if (CRON_SECRET && incoming !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const supabase = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = istNow();
  const nowHHMM = hhmm(now);
  const todayDateStr = isoDateIST(now);

  // Market hours guard (09:16 – 15:30 IST)
  if (nowHHMM < "09:16" || nowHHMM > "15:30") {
    return new Response(
      JSON.stringify({ status: "ok", message: "Outside market hours", time_ist: nowHHMM }),
      { status: 200, headers },
    );
  }

  const results: { trade_id: string; action: string; reason?: string }[] = [];

  try {
    // Fetch all open options positions
    const { data: trades, error: fetchErr } = await (supabase as any)
      .from("active_trades")
      .select(`
        id, user_id, symbol, exchange, action, shares, status,
        is_paper_trade, options_strategy_id, underlying, option_type,
        expiry_date, strike_offset, entry_premium, peak_premium, options_symbol,
        broker_order_id, entry_price
      `)
      .in("status", ["active", "monitoring", "exit_zone"])
      .not("options_strategy_id", "is", null);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!trades?.length) {
      return new Response(JSON.stringify({ status: "ok", checked: 0, results }), {
        status: 200, headers,
      });
    }

    // Batch fetch strategies for exit rules (deduplicate)
    const strategyIds = [...new Set(trades.map((t: Record<string, unknown>) => t.options_strategy_id as string))];
    const { data: strategies } = await (supabase as any)
      .from("options_strategies")
      .select("id, exit_rules")
      .in("id", strategyIds);
    const strategyMap = new Map<string, Record<string, unknown>>();
    for (const s of strategies ?? []) {
      strategyMap.set(s.id, s.exit_rules ?? {});
    }

    // Batch fetch API keys (deduplicate by user)
    const userIds = [...new Set(trades.map((t: Record<string, unknown>) => t.user_id as string))];
    const { data: integrations } = await (supabase as any)
      .from("user_trading_integration")
      .select("user_id, openalgo_api_key")
      .in("user_id", userIds)
      .eq("is_active", true);
    const apiKeyMap = new Map<string, string>();
    for (const i of integrations ?? []) {
      if (i.openalgo_api_key) apiKeyMap.set(i.user_id, i.openalgo_api_key);
    }

    for (const trade of trades) {
      const tradeId = trade.id as string;
      try {
        const entryPremium = Number(trade.entry_premium ?? trade.entry_price ?? 0);
        const peakPremium = Number(trade.peak_premium ?? entryPremium);
        const expiryDate: string | null = trade.expiry_date ?? null;
        const isPaper: boolean = Boolean(trade.is_paper_trade);
        const exitRules = strategyMap.get(trade.options_strategy_id as string) ?? {};

        // Get current LTP for the options symbol
        const apiKey = apiKeyMap.get(trade.user_id as string) ?? "";
        const optionsSymbol: string = trade.options_symbol ?? trade.symbol ?? "";
        let currentLtp: number | null = null;

        if (apiKey && optionsSymbol && OPENALGO_URL) {
          const exchg = (trade.exchange as string) ?? "NFO";
          currentLtp = await fetchOptionLtp(optionsSymbol, exchg, apiKey);
        }

        if (currentLtp === null || currentLtp <= 0) {
          // Cannot evaluate without current LTP — skip (monitor.py handles live ticks instead)
          results.push({ trade_id: tradeId, action: "skipped", reason: "no_ltp" });
          continue;
        }

        // Update peak_premium if LTP is higher
        const newPeak = Math.max(peakPremium, currentLtp);
        if (newPeak > peakPremium) {
          await (supabase as any)
            .from("active_trades")
            .update({ peak_premium: newPeak, current_price: currentLtp })
            .eq("id", tradeId);
        } else {
          // Still update current_price
          await (supabase as any)
            .from("active_trades")
            .update({ current_price: currentLtp })
            .eq("id", tradeId);
        }

        // Evaluate exit
        const exitReason = evaluateExitCondition(
          entryPremium,
          newPeak,
          currentLtp,
          exitRules as Parameters<typeof evaluateExitCondition>[3],
          nowHHMM,
          expiryDate,
          todayDateStr,
        );

        if (!exitReason) {
          results.push({ trade_id: tradeId, action: "monitoring" });
          continue;
        }

        // ── Execute exit ──────────────────────────────────────────────
        if (isPaper) {
          // Paper: close directly in DB
          const pnlPct = entryPremium > 0
            ? ((currentLtp - entryPremium) / entryPremium) * 100
            : 0;
          const actualPnl = (currentLtp - entryPremium) * Number(trade.shares ?? 1);

          await (supabase as any)
            .from("active_trades")
            .update({
              status: "completed",
              exit_price: currentLtp,
              exit_premium: currentLtp,
              exit_time: new Date().toISOString(),
              exit_reason: exitReason,
              actual_pnl: actualPnl,
              actual_pnl_percentage: pnlPct,
            })
            .eq("id", tradeId);

          results.push({ trade_id: tradeId, action: "paper_exited", reason: exitReason });
        } else {
          // Live: place exit order via OpenAlgo
          if (!apiKey || !optionsSymbol) {
            results.push({ trade_id: tradeId, action: "exit_failed", reason: "no_api_key_or_symbol" });
            continue;
          }
          const exitOrderId = await placeExitOrder(
            optionsSymbol,
            (trade.exchange as string) ?? "NFO",
            Number(trade.shares ?? 1),
            apiKey,
          );

          const pnlPct = entryPremium > 0
            ? ((currentLtp - entryPremium) / entryPremium) * 100
            : 0;
          const actualPnl = (currentLtp - entryPremium) * Number(trade.shares ?? 1);

          await (supabase as any)
            .from("active_trades")
            .update({
              status: "completed",
              exit_price: currentLtp,
              exit_premium: currentLtp,
              exit_time: new Date().toISOString(),
              exit_reason: exitReason,
              actual_pnl: actualPnl,
              actual_pnl_percentage: pnlPct,
              broker_order_id: exitOrderId ?? trade.broker_order_id,
            })
            .eq("id", tradeId);

          results.push({ trade_id: tradeId, action: "live_exited", reason: exitReason });
        }
      } catch (tradeErr) {
        console.error(`[options-paper-exit-monitor] trade ${tradeId} error:`, tradeErr);
        results.push({ trade_id: tradeId, action: "error", reason: String(tradeErr) });
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        time_ist: nowHHMM,
        checked: trades.length,
        exited: results.filter((r) => r.action.includes("exited")).length,
        results,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("[options-paper-exit-monitor] fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers },
    );
  }
});
