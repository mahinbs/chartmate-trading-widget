/**
 * broker-data — Supabase Edge Function
 *
 * Three lightweight OpenAlgo data queries in one function:
 *
 *   action: "orderstatus"
 *     POST /api/v1/orderstatus
 *     Body: { action, orderid, strategy? }
 *     Returns: order fill status (complete / open / rejected / cancelled)
 *
 *   action: "quotes"
 *     POST /api/v1/quotes
 *     Body: { action, symbol, exchange }
 *     Returns: live LTP, bid, ask, volume direct from broker
 *
 *   action: "multiquotes"
 *     POST /api/v1/multiquotes
 *     Body: { action, symbols: [{symbol, exchange}] }
 *     Returns: LTPs for multiple symbols at once
 *
 *   action: "margin"
 *     POST /api/v1/margin
 *     Body: { action, positions: [{symbol, exchange, action, quantity, product, pricetype, price?}] }
 *     Returns: required margin for the given position(s)
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

    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase   = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    // ── Get user's OpenAlgo API key ───────────────────────────────────────
    const { data: integration } = await supabase
      .from("user_trading_integration" as any)
      .select("openalgo_api_key, strategy_name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const apiKey       = (integration as any)?.openalgo_api_key ?? "";
    const strategyName = (integration as any)?.strategy_name ?? "ChartMate AI";

    if (!apiKey.trim()) {
      return new Response(
        JSON.stringify({ error: "No active broker integration.", error_code: "NO_INTEGRATION" }),
        { status: 400, headers },
      );
    }

    // ── Parse body ────────────────────────────────────────────────────────
    const body   = await req.json().catch(() => ({}));
    const action = ((body.action as string) ?? "").trim();

    // ── Route to correct OpenAlgo endpoint ───────────────────────────────
    let endpoint  = "";
    let oaPayload: Record<string, unknown> = { apikey: apiKey };

    if (action === "orderstatus") {
      const orderid = ((body.orderid as string) ?? "").trim();
      if (!orderid) {
        return new Response(JSON.stringify({ error: "orderid required" }), { status: 400, headers });
      }
      endpoint  = "/api/v1/orderstatus";
      oaPayload = { apikey: apiKey, strategy: strategyName, orderid };

    } else if (action === "quotes") {
      const symbol   = ((body.symbol   as string) ?? "").trim().toUpperCase();
      const exchange = ((body.exchange as string) ?? "NSE").trim().toUpperCase();
      if (!symbol) {
        return new Response(JSON.stringify({ error: "symbol required" }), { status: 400, headers });
      }
      endpoint  = "/api/v1/quotes";
      oaPayload = { apikey: apiKey, symbol, exchange };

    } else if (action === "multiquotes") {
      const symbols = body.symbols as Array<{ symbol: string; exchange: string }>;
      if (!Array.isArray(symbols) || symbols.length === 0) {
        return new Response(JSON.stringify({ error: "symbols array required" }), { status: 400, headers });
      }
      endpoint  = "/api/v1/multiquotes";
      oaPayload = { apikey: apiKey, symbols: symbols.map(s => ({ symbol: s.symbol.toUpperCase(), exchange: (s.exchange ?? "NSE").toUpperCase() })) };

    } else if (action === "margin") {
      const positions = body.positions as Array<{
        symbol: string; exchange: string; action: string;
        quantity: number; product: string; pricetype: string; price?: number;
      }>;
      if (!Array.isArray(positions) || positions.length === 0) {
        return new Response(JSON.stringify({ error: "positions array required" }), { status: 400, headers });
      }
      endpoint  = "/api/v1/margin";
      oaPayload = {
        apikey: apiKey,
        positions: positions.map(p => ({
          symbol:        p.symbol.toUpperCase(),
          exchange:      (p.exchange ?? "NSE").toUpperCase(),
          action:        (p.action ?? "BUY").toUpperCase(),
          quantity:      String(Number(p.quantity)),
          product:       (p.product ?? "CNC").toUpperCase(),
          pricetype:     (p.pricetype ?? "MARKET").toUpperCase(),
          price:         String(p.price ?? 0),
          trigger_price: "0",
        })),
      };

    } else {
      return new Response(
        JSON.stringify({ error: "action must be: orderstatus | quotes | multiquotes | margin" }),
        { status: 400, headers },
      );
    }

    // ── Call OpenAlgo ─────────────────────────────────────────────────────
    const oaRes = await fetch(`${OPENALGO_URL}${endpoint}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(oaPayload),
      signal:  AbortSignal.timeout(10_000),
    });

    const oaData = await oaRes.json().catch(() => ({}));

    if (!oaRes.ok) {
      const detail = (oaData as any)?.message ?? (oaData as any)?.error ?? `OpenAlgo ${oaRes.status}`;
      return new Response(JSON.stringify({ error: detail, raw: oaData }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ success: true, data: oaData }), { status: 200, headers });

  } catch (err) {
    console.error("broker-data error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
