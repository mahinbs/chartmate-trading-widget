/**
 * options-place-order — Supabase Edge Function
 *
 * Places an options order via OpenAlgo /api/v1/optionsorder (strike-aware API).
 * Supports both live orders and paper trades. On successful fill, inserts a row
 * into active_trades with all options-specific metadata (strike, expiry, premium, etc.).
 *
 * Request body:
 *   {
 *     options_strategy_id?: string,   // FK to options_strategies
 *     underlying: string,             // "NIFTY" | "BANKNIFTY" etc.
 *     exchange: string,               // "NFO" | "BFO"
 *     expiry_date: string,            // "YYYY-MM-DD"
 *     strike_offset: string,          // "ATM" | "OTM1" | "OTM2" | "ITM1" | "ITM2"
 *     option_type: string,            // "CE" | "PE"
 *     action: string,                 // "BUY" | "SELL"
 *     quantity: number,               // lots × lot_size
 *     product: string,                // "MIS" (intraday) | "NRML"
 *     is_paper_trade?: boolean,
 *     entry_premium?: number,         // override entry premium (for paper trades)
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTradeAccess } from "../_shared/trade-access.ts";
import { checkAndConsumeTrialCredit } from "../_shared/trial-credit-check.ts";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

/** Map strike_offset string to numeric offset for OpenAlgo optionsorder API */
function strikeOffsetToNumber(offset: string): number {
  const map: Record<string, number> = {
    ITM2: -2, ITM1: -1, ATM: 0, OTM1: 1, OTM2: 2, OTM3: 3, OTM4: 4, OTM5: 5,
  };
  return map[offset.toUpperCase()] ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (!OPENALGO_URL) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_URL not configured." }),
        { status: 503, headers },
      );
    }

    // Authenticate
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json();
    const is_paper_trade = Boolean(body.is_paper_trade);

    const {
      options_strategy_id,
      underlying,
      exchange = "NFO",
      expiry_date,
      strike_offset = "ATM",
      option_type,
      action,
      quantity,
      product = "MIS",
      entry_premium: overridePremium,
    } = body;

    if (!underlying || !expiry_date || !option_type || !action || !quantity) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: underlying, expiry_date, option_type, action, quantity" }),
        { status: 422, headers },
      );
    }

    const access = await resolveTradeAccess(supabase, user.id);
    if (!access.hasAlgoEntitlement) {
      if (is_paper_trade) {
        const trialCredit = await checkAndConsumeTrialCredit(
          supabase,
          user.id,
          10,
          "options_paper_trade",
        );
        if (!trialCredit.ok) {
          return new Response(
            JSON.stringify({
              error: "Insufficient trial credits. Upgrade for unlimited access.",
              error_code: "TRIAL_CREDITS_EXHAUSTED",
              credits_remaining: trialCredit.creditsRemaining ?? 0,
              reason: trialCredit.reason ?? null,
            }),
            { status: 402, headers },
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: "Algo subscription required.", error_code: "NO_SUBSCRIPTION" }),
          { status: 403, headers },
        );
      }
    }

    const openalgoApiKey = access.integration?.openalgo_api_key;

    const strikeOffsetNum = strikeOffsetToNumber(strike_offset);

    // ── PAPER TRADE PATH ──────────────────────────────────────────────────
    if (is_paper_trade) {
      // For paper trades we need a premium price. If caller supplies one, use it;
      // otherwise fetch current market premium from /optionchain as approximation.
      let premiumLtp = overridePremium ?? 0;

      if (!premiumLtp && openalgoApiKey) {
        try {
          const chainRes = await fetch(`${OPENALGO_URL}/api/v1/optionchain`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apikey: openalgoApiKey.trim(),
              symbol: underlying.toUpperCase(),
              exchange: exchange.toUpperCase(),
              expiry: expiry_date,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (chainRes.ok) {
            const chainData = await chainRes.json();
            const raw = chainData?.data ?? chainData;
            const atmStrike = Number(raw?.atm_strike ?? raw?.atmstrike ?? 0);
            const calls: unknown[] = Array.isArray(raw?.calls) ? raw.calls : [];
            const puts: unknown[] = Array.isArray(raw?.puts) ? raw.puts : [];
            const legs = option_type === "CE" ? calls : puts;
            // Find the leg matching strike_offset from ATM
            const sorted = legs.map((l) => l as Record<string, unknown>).sort((a, b) => {
              const sA = Number(a.strike ?? a.strikePrice ?? 0);
              const sB = Number(b.strike ?? b.strikePrice ?? 0);
              return sA - sB;
            });
            const atmIdx = sorted.findIndex(
              (l) => Number(l.strike ?? l.strikePrice ?? 0) >= atmStrike,
            );
            const targetIdx = atmIdx + strikeOffsetNum;
            const targetLeg = sorted[Math.max(0, Math.min(targetIdx, sorted.length - 1))];
            if (targetLeg) {
              premiumLtp = Number(targetLeg.ltp ?? targetLeg.lastPrice ?? 0);
            }
          }
        } catch {
          // non-fatal — proceed with 0 premium
        }
      }

      // Insert paper trade directly into active_trades
      const tradeId = `PAPER-OPT-${Date.now()}`;
      const { data: tradeRow, error: insertErr } = await (supabase as any)
        .from("active_trades")
        .insert({
          user_id: user.id,
          symbol: `${underlying}${option_type}`,
          action: action.toUpperCase(),
          status: "active",
          entry_price: premiumLtp,
          reference_entry_price: premiumLtp,
          shares: Number(quantity),
          investment_amount: premiumLtp * Number(quantity),
          margin_type: "options",
          is_paper_trade: true,
          options_strategy_id: options_strategy_id ?? null,
          underlying: underlying.toUpperCase(),
          exchange: exchange.toUpperCase(),
          option_type: option_type.toUpperCase(),
          expiry_date,
          strike_offset,
          entry_premium: premiumLtp,
          peak_premium: premiumLtp,
          broker_order_id: tradeId,
        })
        .select()
        .single();

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: "Failed to insert paper trade.", detail: insertErr.message }),
          { status: 500, headers },
        );
      }

      return new Response(
        JSON.stringify({
          status: "paper_trade_created",
          trade_id: tradeRow?.id,
          broker_order_id: tradeId,
          entry_premium: premiumLtp,
          is_paper_trade: true,
        }),
        { status: 200, headers },
      );
    }

    // ── LIVE TRADE PATH ───────────────────────────────────────────────────
    if (!openalgoApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAlgo API key not configured.", error_code: "NO_API_KEY" }),
        { status: 422, headers },
      );
    }

    // Reference premium from chain (pre-order quote) for slippage vs fill
    let referencePremium = 0;
    try {
      const chainRes = await fetch(`${OPENALGO_URL}/api/v1/optionchain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apikey: openalgoApiKey.trim(),
          symbol: underlying.toUpperCase(),
          exchange: exchange.toUpperCase(),
          expiry: expiry_date,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (chainRes.ok) {
        const chainData = await chainRes.json();
        const raw = chainData?.data ?? chainData;
        const atmStrike = Number(raw?.atm_strike ?? raw?.atmstrike ?? 0);
        const calls: unknown[] = Array.isArray(raw?.calls) ? raw.calls : [];
        const puts: unknown[] = Array.isArray(raw?.puts) ? raw.puts : [];
        const legs = option_type === "CE" ? calls : puts;
        const sorted = legs.map((l) => l as Record<string, unknown>).sort((a, b) => {
          const sA = Number(a.strike ?? a.strikePrice ?? 0);
          const sB = Number(b.strike ?? b.strikePrice ?? 0);
          return sA - sB;
        });
        const atmIdx = sorted.findIndex(
          (l) => Number(l.strike ?? l.strikePrice ?? 0) >= atmStrike,
        );
        const targetIdx = atmIdx + strikeOffsetNum;
        const targetLeg = sorted[Math.max(0, Math.min(targetIdx, sorted.length - 1))];
        if (targetLeg) {
          referencePremium = Number(targetLeg.ltp ?? targetLeg.lastPrice ?? 0);
        }
      }
    } catch {
      /* non-fatal */
    }

    // Call OpenAlgo /optionsorder
    const optionsOrderPayload = {
      apikey: openalgoApiKey.trim(),
      strategy: "ChartMate Options",
      symbol: underlying.toUpperCase(),
      exchange: exchange.toUpperCase(),
      expiry: expiry_date,
      optiontype: option_type.toUpperCase(),
      strikeprice: String(strikeOffsetNum),  // OpenAlgo accepts offset string like "0", "1", "-1"
      action: action.toUpperCase(),
      product: product.toUpperCase(),
      quantity: String(Number(quantity)),
      pricetype: "MARKET",
      price: "0",
    };

    const orderRes = await fetch(`${OPENALGO_URL}/api/v1/optionsorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(optionsOrderPayload),
      signal: AbortSignal.timeout(15000),
    });

    const orderData = await orderRes.json().catch(() => ({}));

    if (!orderRes.ok || orderData?.status === "error") {
      return new Response(
        JSON.stringify({ error: "OpenAlgo optionsorder failed.", detail: orderData }),
        { status: 502, headers },
      );
    }

    const brokerOrderId: string = String(orderData?.orderid ?? orderData?.order_id ?? orderData?.data?.orderid ?? "");
    const resolvedSymbol: string = String(orderData?.symbol ?? orderData?.data?.symbol ?? `${underlying}${option_type}`);
    const strikePrice: number = Number(orderData?.strikeprice ?? orderData?.data?.strikeprice ?? 0);
    const fillPrice: number = Number(orderData?.price ?? orderData?.data?.price ?? orderData?.average_price ?? 0);
    const refPx =
      referencePremium > 0 ? referencePremium : (fillPrice > 0 ? fillPrice : 0);

    // Insert into active_trades
    const { data: tradeRow, error: insertErr } = await (supabase as any)
      .from("active_trades")
      .insert({
        user_id: user.id,
        symbol: resolvedSymbol,
        action: action.toUpperCase(),
        status: "active",
        entry_price: fillPrice,
        reference_entry_price: refPx > 0 ? refPx : fillPrice,
        shares: Number(quantity),
        investment_amount: fillPrice * Number(quantity),
        margin_type: "options",
        is_paper_trade: false,
        options_strategy_id: options_strategy_id ?? null,
        underlying: underlying.toUpperCase(),
        exchange: exchange.toUpperCase(),
        option_type: option_type.toUpperCase(),
        expiry_date,
        strike_price: strikePrice || null,
        strike_offset,
        entry_premium: fillPrice || null,
        peak_premium: fillPrice || null,
        options_symbol: resolvedSymbol,
        broker_order_id: brokerOrderId,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[options-place-order] active_trades insert failed:", insertErr);
    }

    return new Response(
      JSON.stringify({
        status: "order_placed",
        broker_order_id: brokerOrderId,
        trade_id: tradeRow?.id ?? null,
        resolved_symbol: resolvedSymbol,
        strike_price: strikePrice,
        fill_price: fillPrice,
        is_paper_trade: false,
        raw: orderData,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("[options-place-order] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers },
    );
  }
});
