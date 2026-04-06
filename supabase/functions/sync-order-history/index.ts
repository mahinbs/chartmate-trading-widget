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
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info"
};
function asArray(v) {
  return Array.isArray(v) ? v : [];
}
function pickOrderRows(payload) {
  if (!payload || typeof payload !== "object") return [];
  const candidates = [
    payload?.data,
    payload?.orders,
    payload?.orderbook,
    payload?.result,
    payload?.response?.data,
    payload?.response?.orders,
    payload?.response?.orderbook
  ];
  for (const c of candidates){
    if (Array.isArray(c)) return c;
  }
  if (Array.isArray(payload)) return payload;
  return [];
}
function pickTradeRows(payload) {
  if (!payload || typeof payload !== "object") return [];
  const candidates = [
    payload?.data,
    payload?.trades,
    payload?.tradebook,
    payload?.result,
    payload?.response?.data,
    payload?.response?.trades,
    payload?.response?.tradebook
  ];
  for (const c of candidates){
    if (Array.isArray(c)) return c;
  }
  if (Array.isArray(payload)) return payload;
  return [];
}
function normTimestamp(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString();
  // Handle dd-mm-yyyy hh:mm:ss
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const hh = Number(m[4] ?? 0);
    const mi = Number(m[5] ?? 0);
    const ss = Number(m[6] ?? 0);
    return new Date(Date.UTC(yyyy, mm, dd, hh, mi, ss)).toISOString();
  }
  return null;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders
  };
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers
      });
    }
    // Get user's OpenAlgo API key
    const { data: integration } = await supabase.from("user_trading_integration").select("openalgo_api_key, is_active").eq("user_id", user.id).eq("is_active", true).maybeSingle();
    const apiKey = integration?.openalgo_api_key ?? "";
    if (!apiKey.trim()) {
      return new Response(JSON.stringify({
        error: "No active broker integration found.",
        error_code: "NO_INTEGRATION"
      }), {
        status: 400,
        headers
      });
    }
    if (!OPENALGO_URL) {
      return new Response(JSON.stringify({
        error: "OPENALGO_URL not configured",
        error_code: "CONFIG_ERROR"
      }), {
        status: 503,
        headers
      });
    }
    // Fetch both orderbook and tradebook from OpenAlgo.
    const [orderRes, tradeRes] = await Promise.all([
      fetch(`${OPENALGO_URL}/api/v1/orderbook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          apikey: apiKey
        })
      }),
      fetch(`${OPENALGO_URL}/api/v1/tradebook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          apikey: apiKey
        })
      })
    ]);
    const orderData = orderRes.ok ? await orderRes.json().catch(()=>({})) : {};
    const tradeData = tradeRes.ok ? await tradeRes.json().catch(()=>({})) : {};
    const orders = pickOrderRows(orderData);
    const trades = pickTradeRows(tradeData);
    if (!orders.length && !trades.length) {
      return new Response(JSON.stringify({
        orders: [],
        synced_count: 0,
        message: "No orders found or broker returned empty"
      }), {
        status: 200,
        headers
      });
    }
    // Upsert into Supabase
    const orderRows = orders.map((o)=>({
        user_id: user.id,
        broker_order_id: o.orderid ?? o.order_id ?? o.orderId ?? null,
        symbol: o.tradingsymbol ?? o.symbol ?? null,
        exchange: o.exchange ?? null,
        action: o.transactiontype ?? o.action ?? o.side ?? null,
        quantity: Number(o.quantity ?? o.qty ?? 0) || null,
        price: Number(o.price ?? 0) || null,
        order_type: o.ordertype ?? o.order_type ?? null,
        product_type: o.producttype ?? o.product ?? null,
        status: (o.status ?? "").toLowerCase(),
        filled_quantity: Number(o.filledshares ?? o.filledquantity ?? o.filled_quantity ?? 0) || null,
        average_price: Number(o.averageprice ?? o.average_price ?? 0) || null,
        strategy_name: o.strategy ?? o.strategy_name ?? null,
        rejection_reason: o.rejectreason ?? o.rejection_reason ?? null,
        order_timestamp: normTimestamp(o.updatetime ?? o.ordertime ?? o.timestamp),
        synced_at: new Date().toISOString()
      })).filter((r)=>r.broker_order_id);
    const tradeRows = trades.map((t)=>{
      const orderId = (t.orderid ?? t.order_id ?? t.orderId ?? "").toString().trim();
      const fillId = (t.fillid ?? t.fill_id ?? "").toString().trim();
      const ts = normTimestamp(t.tradetime ?? t.timestamp ?? t.ordertime);
      const synthetic = fillId ? `TRADE-${fillId}` : orderId && ts ? `TRADE-${orderId}-${ts}` : null;
      return {
        user_id: user.id,
        broker_order_id: orderId || synthetic,
        symbol: t.tradingsymbol ?? t.symbol ?? null,
        exchange: t.exchange ?? null,
        action: t.transactiontype ?? t.action ?? t.side ?? null,
        quantity: Number(t.quantity ?? t.tradedquantity ?? t.qty ?? 0) || null,
        price: Number(t.price ?? 0) || null,
        order_type: t.ordertype ?? t.order_type ?? "MARKET",
        product_type: t.producttype ?? t.product ?? null,
        status: "complete",
        filled_quantity: Number(t.filledshares ?? t.filledquantity ?? t.tradedquantity ?? t.quantity ?? 0) || null,
        average_price: Number(t.averageprice ?? t.average_price ?? 0) || null,
        strategy_name: t.strategy ?? t.strategy_name ?? null,
        rejection_reason: null,
        order_timestamp: ts,
        synced_at: new Date().toISOString()
      };
    }).filter((r)=>r.broker_order_id);
    const rows = [
      ...orderRows,
      ...tradeRows
    ];
    let syncedCount = 0;
    if (rows.length > 0) {
      const { error: upsertErr } = await supabase.from("openalgo_order_history").upsert(rows, {
        onConflict: "user_id,broker_order_id"
      });
      if (upsertErr) {
        console.error("Upsert error:", upsertErr);
      } else {
        syncedCount = rows.length;
      }
    }
    // Return orders from Supabase (includes historical ones)
    const { data: allOrders } = await supabase.from("openalgo_order_history").select("*").eq("user_id", user.id).order("order_timestamp", {
      ascending: false
    }).limit(200);
    return new Response(JSON.stringify({
      orders: allOrders ?? [],
      synced_count: syncedCount,
      fetched_from_broker: orders.length,
      fetched_trades_from_broker: trades.length
    }), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error("sync-order-history error:", err);
    return new Response(JSON.stringify({
      error: "Internal error syncing order history"
    }), {
      status: 500,
      headers
    });
  }
});
