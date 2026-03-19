/**
 * fire-strategy-signal — Supabase Edge Function
 *
 * Fires a BUY or SELL order for a user-created strategy.
 * Unlike openalgo-place-order, this does NOT check algo_user_assignments —
 * the user is firing their OWN strategy, so they already have the right.
 *
 * Required body:
 *   strategy_id  — UUID from user_strategies table
 *   symbol       — e.g. "RELIANCE"
 *   exchange     — e.g. "NSE"
 *   action       — "BUY" | "SELL"
 *   quantity     — number
 *   product      — "CNC" | "MIS" | "NRML"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (!OPENALGO_URL) {
      return new Response(JSON.stringify({ error: "OPENALGO_URL not configured" }), { status: 503, headers });
    }

    // ── Auth ───────────────────────────────────────────────────────────────
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

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as {
      strategy_id: string;
      symbol:      string;
      exchange?:   string;
      action:      "BUY" | "SELL";
      quantity:    number;
      product?:    string;
    };

    const { strategy_id, symbol, action, quantity } = body;
    const aiOverride = Boolean((body as any).ai_override);
    if (!strategy_id || !symbol || !action || !quantity) {
      return new Response(
        JSON.stringify({ error: "strategy_id, symbol, action and quantity are required" }),
        { status: 400, headers },
      );
    }

    // ── Check subscription ──────────────────────────────────────────────────
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (sub?.status !== "active" && sub?.status !== "trialing") {
      return new Response(
        JSON.stringify({ error: "Active subscription required to place orders", error_code: "NO_SUBSCRIPTION" }),
        { status: 403, headers },
      );
    }

    // ── Load strategy (must belong to this user) ────────────────────────────
    const { data: strategy, error: stratErr } = await supabase
      .from("user_strategies")
      .select("id, name, is_active, openalgo_webhook_id")
      .eq("id", strategy_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (stratErr || !strategy) {
      return new Response(
        JSON.stringify({ error: "Strategy not found or does not belong to your account" }),
        { status: 404, headers },
      );
    }

    if (!strategy.is_active) {
      return new Response(
        JSON.stringify({ error: `Strategy "${strategy.name}" is inactive. Enable it first.`, error_code: "STRATEGY_INACTIVE" }),
        { status: 400, headers },
      );
    }

    // ── Load user's OpenAlgo API key ────────────────────────────────────────
    const { data: integration } = await supabase
      .from("user_trading_integration")
      .select("openalgo_api_key, broker")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle() as any;

    const apiKey = (integration as any)?.openalgo_api_key ?? "";
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "No active broker connection. Connect your broker first.", error_code: "NO_INTEGRATION" }),
        { status: 400, headers },
      );
    }

    // ── AI Override: validate trade with AI before execution ────────────────
    if (aiOverride) {
      const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
      const GEMINI_MODEL = "gemini-3.1-pro-preview";
      if (GEMINI_API_KEY) {
        const aiPrompt = `You are a trading risk assistant. A user is about to execute a live trade. Evaluate if this is a good idea RIGHT NOW based on the parameters below. Be very strict — reject questionable trades.

Trade details:
- Symbol: ${symbol}
- Action: ${action}
- Quantity: ${quantity}
- Strategy: ${strategy.name}

Analyze the current market conditions for ${symbol} and determine:
1. Is this a good time to ${action} ${symbol}?
2. What are the main risks?
3. Should this trade be ACCEPTED or REJECTED?

Return ONLY a JSON object (no markdown):
{
  "decision": "ACCEPT" | "REJECT",
  "confidence": number 0-100,
  "reason": string (2-3 sentences explaining why),
  "risks": string[],
  "suggestedAction": string (what the user should do instead if rejected)
}`;

        try {
          const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
          const aiRes = await fetch(aiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: aiPrompt }] }],
              generationConfig: { maxOutputTokens: 2048, temperature: 0.2, responseMimeType: "application/json" },
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const aiText = aiData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
            try {
              const aiResult = JSON.parse(aiText.replace(/```json\s*/i, "").replace(/\s*```/i, "").trim());
              if (aiResult.decision === "REJECT") {
                return new Response(
                  JSON.stringify({
                    error: "Trade rejected by AI Override",
                    ai_override: {
                      decision: "REJECT",
                      confidence: aiResult.confidence ?? 0,
                      reason: aiResult.reason ?? "AI analysis suggests this is not a favorable trade.",
                      risks: aiResult.risks ?? [],
                      suggestedAction: aiResult.suggestedAction ?? "Wait for a better entry point.",
                    },
                  }),
                  { status: 422, headers },
                );
              }
              // ACCEPTED — continue to place order, attach AI result
              console.log(`AI Override ACCEPTED: ${symbol} ${action}, confidence: ${aiResult.confidence}`);
            } catch { /* parse failed, proceed without AI */ }
          }
        } catch (e) {
          console.error("AI Override error (non-fatal, proceeding):", e);
        }
      }
    }

    // ── Call OpenAlgo /api/v1/placeorder ────────────────────────────────────
    const exchange = (body.exchange ?? "NSE").toUpperCase();
    const product  = (body.product  ?? "MIS").toUpperCase();

    const orderPayload = {
      apikey:             apiKey.trim(),
      strategy:           strategy.name,
      exchange,
      symbol:             symbol.trim().toUpperCase(),
      action:             action.toUpperCase(),
      product,
      pricetype:          "MARKET",
      quantity:           String(Number(quantity)),
      price:              "0",
      trigger_price:      "0",
      disclosed_quantity: "0",
    };

    console.log(`fire-strategy-signal: ${action} ${quantity}x${symbol} on ${exchange} for strategy "${strategy.name}"`);

    const res = await fetch(`${OPENALGO_URL}/api/v1/placeorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    const data = await res.json().catch(() => ({}));

    // ── Audit log ───────────────────────────────────────────────────────────
    await supabase.from("order_audit_logs").insert({
      user_id:          user.id,
      trade_id:         null,
      intent:           "entry",
      provider:         "openalgo",
      request_payload:  orderPayload,
      response_payload: data,
      status:           res.ok ? "success" : "failed",
      error_code:       res.ok ? null : "OPENALGO_ERROR",
      error_message:    res.ok ? null : ((data as any)?.message ?? "Order failed"),
    }).catch(() => { /* non-fatal */ });

    if (!res.ok) {
      const msg = (data as any)?.message ?? (data as any)?.error ?? "Order failed";
      return new Response(JSON.stringify({ error: msg, raw: data }), { status: 502, headers });
    }

    return new Response(JSON.stringify(data), { status: 200, headers });

  } catch (err) {
    console.error("fire-strategy-signal error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
