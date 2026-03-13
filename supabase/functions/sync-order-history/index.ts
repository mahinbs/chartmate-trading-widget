/**
 * sync-order-history — Supabase Edge Function
 *
 * Fetches the user's live order history from OpenAlgo's /api/v1/orderbook
 * using their stored API key, then upserts into openalgo_order_history in Supabase.
 *
 * Can be called:
 *  - On-demand (user visits order history page)
 *  - Optionally as a cron job for all active users
 *
 * Body: {} (uses the calling user's integration)
 * Returns: { orders: [...], synced_count: N }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

interface OpenAlgoOrder {
  orderid?:         string;
  tradingsymbol?:   string;
  exchange?:        string;
  transactiontype?: string;
  quantity?:        number;
  price?:           number;
  ordertype?:       string;
  producttype?:     string;
  status?:          string;
  filledshares?:    number;
  averageprice?:    number;
  strategy?:        string;
  rejectreason?:    string;
  updatetime?:      string;
  ordertime?:       string;
  [key: string]:    unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
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

    // Get user's OpenAlgo API key
    const { data: integration } = await supabase
      .from("user_trading_integration")
      .select("openalgo_api_key, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const apiKey = (integration as any)?.openalgo_api_key ?? "";

    if (!apiKey.trim()) {
      return new Response(
        JSON.stringify({ error: "No active broker integration found.", error_code: "NO_INTEGRATION" }),
        { status: 400, headers },
      );
    }

    if (!OPENALGO_URL) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_URL not configured", error_code: "CONFIG_ERROR" }),
        { status: 503, headers },
      );
    }

    // Fetch orderbook from OpenAlgo
    const orderRes = await fetch(`${OPENALGO_URL}/api/v1/orderbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey }),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error("OpenAlgo orderbook fetch failed:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch orders from broker", detail: errText }),
        { status: 502, headers },
      );
    }

    const orderData = await orderRes.json() as { status: string; data?: OpenAlgoOrder[] };

    if (orderData.status !== "success" || !Array.isArray(orderData.data)) {
      return new Response(
        JSON.stringify({ orders: [], synced_count: 0, message: "No orders found or broker returned empty" }),
        { status: 200, headers },
      );
    }

    const orders = orderData.data;

    // Upsert into Supabase
    const rows = orders.map((o: OpenAlgoOrder) => ({
      user_id:          user.id,
      broker_order_id:  o.orderid ?? null,
      symbol:           o.tradingsymbol ?? null,
      exchange:         o.exchange ?? null,
      action:           o.transactiontype ?? null,
      quantity:         o.quantity ?? null,
      price:            o.price ?? null,
      order_type:       o.ordertype ?? null,
      product_type:     o.producttype ?? null,
      status:           (o.status ?? "").toLowerCase(),
      filled_quantity:  o.filledshares ?? null,
      average_price:    o.averageprice ?? null,
      strategy_name:    o.strategy ?? null,
      rejection_reason: o.rejectreason ?? null,
      order_timestamp:  o.updatetime ?? o.ordertime ?? null,
      synced_at:        new Date().toISOString(),
    })).filter((r) => r.broker_order_id);

    let syncedCount = 0;
    if (rows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("openalgo_order_history")
        .upsert(rows, { onConflict: "user_id,broker_order_id" });

      if (upsertErr) {
        console.error("Upsert error:", upsertErr);
      } else {
        syncedCount = rows.length;
      }
    }

    // Return orders from Supabase (includes historical ones)
    const { data: allOrders } = await supabase
      .from("openalgo_order_history")
      .select("*")
      .eq("user_id", user.id)
      .order("order_timestamp", { ascending: false })
      .limit(200);

    return new Response(
      JSON.stringify({
        orders:        allOrders ?? [],
        synced_count:  syncedCount,
        fetched_from_broker: orders.length,
      }),
      { status: 200, headers },
    );

  } catch (err) {
    console.error("sync-order-history error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error syncing order history" }),
      { status: 500, headers },
    );
  }
});
