/**
 * openalgo-webhook — Supabase Edge Function
 *
 * OpenAlgo calls this URL every time an order status changes (filled, rejected, etc.).
 * We write the update straight into ChartMate's Supabase DB so the UI stays in sync
 * without the user having to refresh.
 *
 * OpenAlgo side config:
 *   WEBHOOK_URL = https://<project>.functions.supabase.co/openalgo-webhook
 *   (Set this in OpenAlgo's .env or its webhook settings page)
 *
 * Supabase secret required:
 *   CHARTMATE_SECRET  — same value as CHARTMATE_SECRET in OpenAlgo .env
 *                       Used to verify the call is genuinely from OpenAlgo.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHARTMATE_SECRET = Deno.env.get("CHARTMATE_SECRET") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Chartmate-Secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  // ── Verify shared secret ─────────────────────────────────────────────────
  const incoming = req.headers.get("X-Chartmate-Secret") ?? "";
  if (CHARTMATE_SECRET && incoming !== CHARTMATE_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers,
    });
  }

  // ── Parse OpenAlgo webhook payload ────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers,
    });
  }

  /*
   * OpenAlgo webhook shape (subset we care about):
   * {
   *   orderid:     "110011001100",
   *   strategy:    "ChartMate AI",
   *   symbol:      "RELIANCE",
   *   action:      "BUY",
   *   exchange:    "NSE",
   *   product:     "CNC",
   *   quantity:    10,
   *   price:       2450.50,
   *   pricetype:   "MARKET",
   *   status:      "complete" | "rejected" | "cancelled" | "open",
   *   message:     "Order placed successfully",
   *   timestamp:   "2026-03-05T09:35:00+05:30"
   * }
   */
  const {
    orderid,
    strategy,
    symbol,
    action,
    exchange,
    quantity,
    price,
    status,
    message,
    timestamp,
  } = payload as {
    orderid?:   string;
    strategy?:  string;
    symbol?:    string;
    action?:    string;
    exchange?:  string;
    quantity?:  number;
    price?:     number;
    status?:    string;
    message?:   string;
    timestamp?: string;
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Upsert into openalgo_orders table ────────────────────────────────────
  // This table acts as the live mirror of OpenAlgo order events in Supabase.
  const { error: upsertError } = await supabase
    .from("openalgo_orders")
    .upsert(
      {
        order_id:    orderid,
        strategy:    strategy  ?? null,
        symbol:      symbol    ?? null,
        action:      action    ?? null,
        exchange:    exchange  ?? null,
        quantity:    quantity  ?? null,
        price:       price     ?? null,
        status:      status    ?? null,
        message:     message   ?? null,
        raw_payload: payload,
        updated_at:  timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      },
      { onConflict: "order_id" },
    );

  if (upsertError) {
    console.error("openalgo-webhook upsert error:", upsertError);
  }

  // ── Update active trade session if order is complete / rejected ───────────
  if (orderid && (status === "complete" || status === "rejected" || status === "cancelled")) {
    const newTradeStatus =
      status === "complete" ? "active" : "cancelled";

    const { error: tradeError } = await supabase
      .from("trade_sessions")
      .update({
        broker_order_id: orderid,
        status:          newTradeStatus,
        updated_at:      new Date().toISOString(),
      })
      .eq("broker_order_id", orderid);

    if (tradeError) {
      console.error("openalgo-webhook trade_sessions update error:", tradeError);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers,
  });
});
