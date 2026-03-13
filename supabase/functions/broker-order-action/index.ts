/**
 * broker-order-action — Supabase Edge Function
 *
 * Single function handling 4 live broker actions via OpenAlgo:
 *   cancel        POST /api/v1/cancelorder      { orderid }
 *   modify        POST /api/v1/modifyorder       { orderid, symbol, exchange, action, product, pricetype, price, quantity }
 *   close_all_pos POST /api/v1/closeposition     {}  (closes all open positions for user's strategy)
 *   cancel_all    POST /api/v1/cancelallorder    {}  (cancels all open orders for user's strategy)
 *
 * Body: { action: "cancel"|"modify"|"close_all_pos"|"cancel_all", ...params }
 * Returns: OpenAlgo response + audit log entry
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

type ActionType = "cancel" | "modify" | "close_all_pos" | "cancel_all";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (!OPENALGO_URL) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_URL not configured" }),
        { status: 503, headers },
      );
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

    // ── Load user's OpenAlgo API key ──────────────────────────────────────
    const { data: integration } = await supabase
      .from("user_trading_integration" as any)
      .select("openalgo_api_key, strategy_name, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const apiKey       = (integration as any)?.openalgo_api_key ?? "";
    const strategyName = (integration as any)?.strategy_name ?? "ChartMate AI";

    if (!apiKey.trim()) {
      return new Response(
        JSON.stringify({ error: "No active broker integration. Please reconnect your broker.", error_code: "NO_INTEGRATION" }),
        { status: 400, headers },
      );
    }

    // ── Parse request ─────────────────────────────────────────────────────
    const body      = await req.json().catch(() => ({}));
    const action    = (body.action as ActionType ?? "").trim();

    if (!action) {
      return new Response(
        JSON.stringify({ error: "action is required: cancel | modify | close_all_pos | cancel_all" }),
        { status: 400, headers },
      );
    }

    // ── Build OpenAlgo payload per action ─────────────────────────────────
    let endpoint   = "";
    let oaPayload: Record<string, unknown> = { apikey: apiKey, strategy: strategyName };

    if (action === "cancel") {
      const orderid = ((body.orderid as string) ?? "").trim();
      if (!orderid) {
        return new Response(JSON.stringify({ error: "orderid is required for cancel" }), { status: 400, headers });
      }
      endpoint  = "/api/v1/cancelorder";
      oaPayload = { ...oaPayload, orderid };

    } else if (action === "modify") {
      const { orderid, symbol, exchange, order_action, product, pricetype, price, quantity } = body as {
        orderid:      string;
        symbol:       string;
        exchange?:    string;
        order_action: string;
        product?:     string;
        pricetype?:   string;
        price:        number;
        quantity:     number;
      };
      if (!orderid || !symbol || !price || !quantity || !order_action) {
        return new Response(
          JSON.stringify({ error: "orderid, symbol, order_action, price, and quantity are required for modify" }),
          { status: 400, headers },
        );
      }
      endpoint  = "/api/v1/modifyorder";
      oaPayload = {
        ...oaPayload,
        orderid,
        symbol:             symbol.toUpperCase(),
        exchange:           (exchange ?? "NSE").toUpperCase(),
        action:             order_action.toUpperCase(),
        product:            (product  ?? "CNC").toUpperCase(),
        pricetype:          (pricetype ?? "LIMIT").toUpperCase(),
        price:              Number(price),
        quantity:           Number(quantity),
        disclosed_quantity: 0,
        trigger_price:      0,
      };

    } else if (action === "close_all_pos") {
      endpoint = "/api/v1/closeposition";
      // no extra fields — closes all open positions for the strategy

    } else if (action === "cancel_all") {
      endpoint = "/api/v1/cancelallorder";
      // no extra fields — cancels all open orders for the strategy

    } else {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers },
      );
    }

    // ── Call OpenAlgo ─────────────────────────────────────────────────────
    const oaRes = await fetch(`${OPENALGO_URL}${endpoint}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(oaPayload),
      signal:  AbortSignal.timeout(12_000),
    });

    const oaData = await oaRes.json().catch(() => ({}));

    // ── Audit log ─────────────────────────────────────────────────────────
    await supabase.from("order_audit_logs" as any).insert({
      user_id:          user.id,
      trade_id:         (body.trade_id as string) ?? null,
      intent:           action,
      provider:         "openalgo",
      request_payload:  { ...oaPayload, apikey: "[redacted]" },
      response_payload: oaData,
      status:           oaRes.ok ? "success" : "failed",
      error_code:       oaRes.ok ? null : "OPENALGO_ACTION_FAILED",
      error_message:    oaRes.ok ? null : ((oaData as any)?.message ?? `${oaRes.status}`),
    }).catch((e) => console.warn("audit log error:", e));

    if (!oaRes.ok) {
      const detail = (oaData as any)?.message ?? (oaData as any)?.error ?? `OpenAlgo returned ${oaRes.status}`;
      return new Response(
        JSON.stringify({ error: detail, raw: oaData }),
        { status: 502, headers },
      );
    }

    return new Response(JSON.stringify({ success: true, data: oaData }), { status: 200, headers });

  } catch (err) {
    console.error("broker-order-action error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers },
    );
  }
});
