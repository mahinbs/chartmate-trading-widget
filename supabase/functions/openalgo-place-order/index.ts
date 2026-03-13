/**
 * openalgo-place-order — Supabase Edge Function
 *
 * Uses the REAL OpenAlgo API:
 *   POST /api/v1/placeorder
 *   { apikey, strategy, exchange, symbol, action, quantity, pricetype, product, price }
 *
 * The user's OpenAlgo API key is stored in user_trading_integration.openalgo_api_key
 * (set once from openalgo.tradebrainx.com after logging in with Zerodha).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (!OPENALGO_URL) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_URL not configured. Contact support." }),
        { status: 503, headers },
      );
    }

    // ── Authenticate Supabase user ────────────────────────────────────────
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

    // ── Verify active subscription ────────────────────────────────────────
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const isActiveSub =
      sub &&
      sub.status === "active" &&
      (!sub.current_period_end || new Date(sub.current_period_end) > new Date());

    if (!isActiveSub) {
      return new Response(
        JSON.stringify({
          error: "An active subscription is required to place live orders. Please purchase a plan.",
          error_code: "NO_SUBSCRIPTION",
        }),
        { status: 403, headers },
      );
    }

    // ── Load user's OpenAlgo API key from DB ──────────────────────────────
    const { data: integration, error: dbError } = await supabase
      .from("user_trading_integration")
      .select("broker, openalgo_api_key, token_expires_at, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (dbError || !integration) {
      return new Response(
        JSON.stringify({
          error: "No broker connected. Please connect your broker in Settings.",
          error_code: "NO_INTEGRATION",
        }),
        { status: 400, headers },
      );
    }

    const openalgoApiKey = integration.openalgo_api_key ?? "";
    if (!openalgoApiKey.trim()) {
      return new Response(
        JSON.stringify({
          error: "OpenAlgo API key missing. Open 'Connect Broker' and paste your key from openalgo.tradebrainx.com → API Keys.",
          error_code: "NO_OPENALGO_KEY",
        }),
        { status: 400, headers },
      );
    }

    // ── Parse order payload ───────────────────────────────────────────────
    const body = await req.json();
    const { symbol, action, quantity, exchange, product, pricetype, price, strategy } = body as {
      symbol:     string;
      action:     string;
      quantity:   number;
      exchange?:  string;
      product?:   string;
      pricetype?: string;
      price?:     number;
      strategy?:  string;
    };

    if (!symbol || !action || !quantity) {
      return new Response(
        JSON.stringify({ error: "symbol, action and quantity are required" }),
        { status: 400, headers },
      );
    }

    const resolvedExchange = (exchange ?? "NSE").toUpperCase();
    const isIndianExchange = ["NSE", "BSE", "NFO", "BFO"].includes(resolvedExchange);

    // ── Indian market hours guard: Mon–Fri 09:00–15:30 IST ───────────────
    if (isIndianExchange) {
      const IST_OFFSET_MS = 330 * 60 * 1000;
      const nowIst = new Date(Date.now() + IST_OFFSET_MS);
      const day    = nowIst.getUTCDay();
      const mins   = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();

      if (day === 0 || day === 6 || mins < 540 || mins > 930) {
        return new Response(
          JSON.stringify({
            error: "Indian market is closed. Orders can only be placed Mon–Fri between 09:00 and 15:30 IST.",
            error_code: "MARKET_CLOSED",
          }),
          { status: 400, headers },
        );
      }
    }

    // ── Call real OpenAlgo /api/v1/placeorder ─────────────────────────────
    const orderPayload = {
      apikey:             openalgoApiKey.trim(),
      strategy:           strategy ?? "ChartMate AI",
      exchange:           resolvedExchange,
      symbol:             symbol.toUpperCase(),
      action:             action.toUpperCase(),
      product:            product  ?? "CNC",
      pricetype:          pricetype ?? "MARKET",
      quantity:           String(Number(quantity)),
      price:              String(price ?? 0),
      trigger_price:      "0",
      disclosed_quantity: "0",
    };

    const openalgoRes = await fetch(`${OPENALGO_URL}/api/v1/placeorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    const openalgoData = await openalgoRes.json().catch(() => ({}));

    // ── Map OpenAlgo error codes back to user-friendly messages ───────────
    if (!openalgoRes.ok) {
      const detail = (openalgoData as any)?.message ?? (openalgoData as any)?.error ?? "Order failed";

      // Invalid/expired API key
      if (openalgoRes.status === 401 || openalgoRes.status === 403) {
        return new Response(
          JSON.stringify({
            error: "Your OpenAlgo API key is invalid or expired. Please reconnect your broker.",
            error_code: "INVALID_OPENALGO_KEY",
          }),
          { status: 401, headers },
        );
      }

      return new Response(
        JSON.stringify({ error: detail, raw: openalgoData }),
        { status: 502, headers },
      );
    }

    // Success — return the order ID directly
    return new Response(JSON.stringify(openalgoData), { status: 200, headers });

  } catch (err) {
    console.error("openalgo-place-order error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error placing order" }),
      { status: 500, headers },
    );
  }
});
