/**
 * options-paper-exit-monitor — Supabase Edge Function
 *
 * Polls all open options positions (paper and live) and evaluates exit conditions.
 * Called every 1–2 minutes by pg_cron during market hours.
 *
 * Exit conditions evaluated per trade (priority order):
 *   1. Underlying-price-based SL/TP (when strategy_metadata carries those levels):
 *      a. CE: exit if underlying_ltp <= underlying_sl_price  OR  >= underlying_tp2_price
 *      b. PE: exit if underlying_ltp >= underlying_sl_price  OR  <= underlying_tp2_price
 *      c. TP1 hit (1:2 RR): trail SL to entry (breakeven), continue monitoring
 *   2. Premium-based fallback (sl_pct/tp_pct from options_strategies.exit_rules)
 *   3. Trailing SL on premium after trail_after_pct gain
 *   4. Time-based exit: IST time >= time_exit_hhmm
 *   5. Expiry day exit: today == expiry_date → square off before 3 PM
 *
 * Market hours: 09:16 – 23:30 IST (covers both NSE 15:30 and MCX 23:30).
 * For NSE trades the time_exit rule (default 15:15) fires the exit at the right time.
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

/** Underlying or index LTP — exchange-aware (NSE_INDEX, MCX, etc.) */
async function fetchUnderlyingLtp(
  symbol: string,
  apiKey: string,
  exchange = "NSE_INDEX",
): Promise<number | null> {
  if (!OPENALGO_URL || !apiKey) return null;
  try {
    const res = await fetch(`${OPENALGO_URL}/api/v1/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey, symbol, exchange }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ltp = data?.data?.ltp ?? data?.ltp;
    const n = ltp != null ? Number(ltp) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function bumpOtmOffset(offset: string | undefined): string {
  const s = String(offset ?? "ATM").toUpperCase();
  const otm = /^OTM(\d+)$/.exec(s);
  if (otm) return `OTM${Number(otm[1]) + 1}`;
  if (s === "ATM") return "OTM1";
  const itm = /^ITM(\d+)$/.exec(s);
  if (itm) return `ITM${Math.max(0, Number(itm[1]) - 1)}`;
  return "OTM1";
}

/** Paper strangle: bump short leg offset in DB when spot near strike (no broker call). */
async function tryStranglePaperRoll(
  supabase: ReturnType<typeof createClient>,
  trade: Record<string, unknown>,
  apiKey: string,
): Promise<boolean> {
  const sm = trade.strategy_metadata as Record<string, unknown> | null | undefined;
  const sg = sm && typeof sm === "object" ? (sm as { strangle?: Record<string, unknown> }).strangle : undefined;
  if (!sg || typeof sg !== "object") return false;

  const rollPts = Number(sg.roll_trigger_pts ?? 30);
  const maxAdj = Number(sg.max_adjustments ?? 2);
  const adj = Number(sg.adjustment_count ?? 0);
  if (adj >= maxAdj) return false;

  const sc = Number(sg.short_call_strike ?? 0);
  const spb = Number(sg.short_put_strike ?? 0);
  if (!Number.isFinite(sc) || !Number.isFinite(spb) || sc <= 0 || spb <= 0) return false;

  const und = String(trade.underlying ?? "NIFTY").trim() || "NIFTY";
  const spot = await fetchUnderlyingLtp(und, apiKey);
  if (spot == null || spot <= 0) return false;

  const dCall = Math.abs(spot - sc);
  const dPut = Math.abs(spot - spb);
  if (dCall > rollPts && dPut > rollPts) return false;

  const legName = dCall <= dPut ? "short_call" : "short_put";
  const oldOff = String(
    legName === "short_call" ? sg.short_call_offset : sg.short_put_offset ?? "ATM",
  );
  const newOff = bumpOtmOffset(oldOff);

  if (legName === "short_call") (sg as Record<string, unknown>).short_call_offset = newOff;
  else (sg as Record<string, unknown>).short_put_offset = newOff;
  (sg as Record<string, unknown>).adjustment_count = adj + 1;
  (sm as Record<string, unknown>).strangle = sg;

  const legs = Array.isArray(trade.legs_data) ? trade.legs_data as Record<string, unknown>[] : [];
  const idx = legs.findIndex((l) => String(l.label) === legName);
  if (idx >= 0) {
    legs[idx] = { ...legs[idx], strike_offset: newOff, orderid: `PAPER-ROLL-${String(trade.id).slice(0, 8)}-${adj + 1}` };
  }

  const tid = String(trade.id);
  await (supabase as any)
    .from("active_trades")
    .update({ strategy_metadata: sm, legs_data: legs.length ? legs : trade.legs_data })
    .eq("id", tid);

  return true;
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

  // Market hours guard: 09:16 – 23:30 IST (covers NSE until 15:30 and MCX until 23:30).
  // NSE trades are handled via their time_exit rule (default 15:15) which fires within this window.
  if (nowHHMM < "09:16" || nowHHMM > "23:30") {
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
        broker_order_id, entry_price, legs_data, strategy_metadata
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
        const apiKey = apiKeyMap.get(trade.user_id as string) ?? "";
        const symStr = String(trade.symbol ?? trade.options_symbol ?? "");

        if (symStr.toUpperCase().startsWith("STRANGLE-")) {
          if (isPaper) {
            const rolled = await tryStranglePaperRoll(supabase, trade as Record<string, unknown>, apiKey);
            if (rolled) {
              results.push({ trade_id: tradeId, action: "strangle_roll" });
              continue;
            }
          }
          results.push({ trade_id: tradeId, action: "skipped", reason: "strangle_multileg" });
          continue;
        }

        // ── Underlying-price-based exit (EMA 9-20 and similar) ───────
        const tradeMetaRaw = trade.strategy_metadata as Record<string, unknown> | null | undefined;
        const tradeMeta = tradeMetaRaw && typeof tradeMetaRaw === "object" ? tradeMetaRaw : null;
        const undSlPrice = tradeMeta?.underlying_sl_price != null ? Number(tradeMeta.underlying_sl_price) : null;
        const undTp2Price = tradeMeta?.underlying_tp2_price != null ? Number(tradeMeta.underlying_tp2_price) : null;

        if (undSlPrice !== null && undTp2Price !== null && apiKey) {
          const undSym = String(trade.underlying ?? "NIFTY").trim() || "NIFTY";
          const undExch = String(tradeMeta?.underlying_exchange ?? "NSE_INDEX");
          const undLtp = await fetchUnderlyingLtp(undSym, apiKey, undExch);

          if (undLtp !== null && undLtp > 0) {
            const optType = String(trade.option_type ?? "CE").toUpperCase();
            const undTp1Price = tradeMeta?.underlying_tp1_price != null ? Number(tradeMeta.underlying_tp1_price) : null;
            const undEntryPrice = tradeMeta?.underlying_entry_price != null ? Number(tradeMeta.underlying_entry_price) : null;
            let tp1Hit = Boolean(tradeMeta?.tp1_hit ?? false);

            // Check TP1 (1:2 RR) — sell 50% of position, trail SL to entry for remainder
            if (!tp1Hit && undTp1Price !== null) {
              const tp1Crossed = optType === "CE" ? undLtp >= undTp1Price : undLtp <= undTp1Price;
              if (tp1Crossed) {
                const totalQty = Number(trade.shares ?? 1);
                const partialQty = Math.max(1, Math.floor(totalQty / 2));
                const remainingQty = totalQty - partialQty;
                const newSl = undEntryPrice ?? undSlPrice;

                // Fetch option LTP for recording partial exit price
                const optSym: string = trade.options_symbol ?? trade.symbol ?? "";
                const optExchg = String(trade.exchange ?? "NFO");
                let optLtpTp1 = entryPremium;
                if (apiKey && optSym) {
                  const fetched = await fetchOptionLtp(optSym, optExchg, apiKey);
                  if (fetched !== null && fetched > 0) optLtpTp1 = fetched;
                }

                // Place partial SELL order (live trades only)
                if (!isPaper && apiKey && optSym) {
                  await placeExitOrder(optSym, optExchg, partialQty, apiKey);
                }

                const updatedMeta = {
                  ...tradeMeta,
                  tp1_hit: true,
                  underlying_sl_price: newSl,
                  partial_qty_sold: partialQty,
                  partial_exit_ltp: optLtpTp1,
                };

                if (remainingQty <= 0) {
                  // Only 1 lot — fully exit at TP1
                  const pnlPct = entryPremium > 0 ? ((optLtpTp1 - entryPremium) / entryPremium) * 100 : 0;
                  const actualPnl = (optLtpTp1 - entryPremium) * totalQty;
                  await (supabase as any).from("active_trades").update({
                    status: "completed",
                    exit_price: optLtpTp1,
                    exit_premium: optLtpTp1,
                    exit_time: new Date().toISOString(),
                    exit_reason: "underlying_take_profit_rr1_2",
                    actual_pnl: actualPnl,
                    actual_pnl_percentage: pnlPct,
                    strategy_metadata: updatedMeta,
                  }).eq("id", tradeId);
                  results.push({ trade_id: tradeId, action: isPaper ? "paper_exited" : "live_exited", reason: "underlying_take_profit_rr1_2" });
                } else {
                  // Update shares to remaining, trail SL
                  await (supabase as any).from("active_trades").update({
                    shares: remainingQty,
                    strategy_metadata: updatedMeta,
                  }).eq("id", tradeId);
                  console.log(`[exit-monitor] TP1 hit trade=${tradeId} und=${undSym} ltp=${undLtp} partial_sold=${partialQty} remaining=${remainingQty} new_sl=${newSl}`);
                  results.push({ trade_id: tradeId, action: "tp1_partial_sold_sl_trailed", reason: `partial=${partialQty} remaining=${remainingQty}` });
                }
                tp1Hit = true;
                continue;
              }
            }

            // Resolve live SL (may have been trailed after TP1)
            const liveSl = tp1Hit && tradeMeta?.underlying_sl_price != null
              ? Number(tradeMeta.underlying_sl_price)
              : undSlPrice;

            // Check full exit on underlying price
            let undExitReason: string | null = null;

            // Time exit (exchange-aware)
            const undExchUpper = undExch.toUpperCase();
            const timeExitHhmm = undExchUpper.includes("MCX") ? "23:00" : "15:15";
            if (expiryDate === todayDateStr && nowHHMM >= "14:30") {
              undExitReason = "expiry_day_exit";
            } else if (nowHHMM >= timeExitHhmm) {
              undExitReason = "time_exit";
            } else if (optType === "CE") {
              if (undLtp <= liveSl) undExitReason = "underlying_stop_loss";
              else if (undLtp >= undTp2Price) undExitReason = "underlying_take_profit_rr3";
            } else {
              if (undLtp >= liveSl) undExitReason = "underlying_stop_loss";
              else if (undLtp <= undTp2Price) undExitReason = "underlying_take_profit_rr3";
            }

            if (undExitReason) {
              // Fetch current option LTP for accurate P&L recording
              const optionsSymbol: string = trade.options_symbol ?? trade.symbol ?? "";
              const exchg = String(trade.exchange ?? "NFO");
              let exitLtp = entryPremium;
              if (apiKey && optionsSymbol) {
                const fetched = await fetchOptionLtp(optionsSymbol, exchg, apiKey);
                if (fetched !== null && fetched > 0) exitLtp = fetched;
              }

              const pnlPct = entryPremium > 0 ? ((exitLtp - entryPremium) / entryPremium) * 100 : 0;
              const actualPnl = (exitLtp - entryPremium) * Number(trade.shares ?? 1);

              if (isPaper) {
                await (supabase as any).from("active_trades").update({
                  status: "completed",
                  exit_price: exitLtp,
                  exit_premium: exitLtp,
                  exit_time: new Date().toISOString(),
                  exit_reason: undExitReason,
                  actual_pnl: actualPnl,
                  actual_pnl_percentage: pnlPct,
                }).eq("id", tradeId);
                results.push({ trade_id: tradeId, action: "paper_exited", reason: undExitReason });
              } else {
                if (!apiKey || !optionsSymbol) {
                  results.push({ trade_id: tradeId, action: "exit_failed", reason: "no_api_key_or_symbol" });
                  continue;
                }
                const exitOrderId = await placeExitOrder(optionsSymbol, exchg, Number(trade.shares ?? 1), apiKey);
                await (supabase as any).from("active_trades").update({
                  status: "completed",
                  exit_price: exitLtp,
                  exit_premium: exitLtp,
                  exit_time: new Date().toISOString(),
                  exit_reason: undExitReason,
                  actual_pnl: actualPnl,
                  actual_pnl_percentage: pnlPct,
                  broker_order_id: exitOrderId ?? trade.broker_order_id,
                }).eq("id", tradeId);
                results.push({ trade_id: tradeId, action: "live_exited", reason: undExitReason });
              }
              continue; // Skip premium-based check
            }

            // No underlying exit → keep monitoring (update current price)
            await (supabase as any)
              .from("active_trades")
              .update({ current_price: undLtp })
              .eq("id", tradeId);
            results.push({ trade_id: tradeId, action: "monitoring" });
            continue;
          }
        }

        // ── Premium-based exit (fallback for trades without underlying levels) ──
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
