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

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function pickOrderRows(payload: any): OpenAlgoOrder[] {
  if (!payload || typeof payload !== "object") return [];
  const candidates = [
    payload?.data,
    payload?.orders,
    payload?.orderbook,
    payload?.result,
    payload?.response?.data,
    payload?.response?.orders,
    payload?.response?.orderbook,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as OpenAlgoOrder[];
  }
  if (Array.isArray(payload)) return payload as OpenAlgoOrder[];
  return [];
}

function pickTradeRows(payload: any): OpenAlgoOrder[] {
  if (!payload || typeof payload !== "object") return [];
  const candidates = [
    payload?.data,
    payload?.trades,
    payload?.tradebook,
    payload?.result,
    payload?.response?.data,
    payload?.response?.trades,
    payload?.response?.tradebook,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as OpenAlgoOrder[];
  }
  if (Array.isArray(payload)) return payload as OpenAlgoOrder[];
  return [];
}

function normTimestamp(raw: unknown): string | null {
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

    // Fetch both orderbook and tradebook from OpenAlgo.
    const [orderRes, tradeRes] = await Promise.all([
      fetch(`${OPENALGO_URL}/api/v1/orderbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: apiKey }),
      }),
      fetch(`${OPENALGO_URL}/api/v1/tradebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: apiKey }),
      }),
    ]);

    const orderData = orderRes.ok ? await orderRes.json().catch(() => ({})) : {};
    const tradeData = tradeRes.ok ? await tradeRes.json().catch(() => ({})) : {};
    const orders = pickOrderRows(orderData);
    const trades = pickTradeRows(tradeData);

    if (!orders.length && !trades.length) {
      return new Response(
        JSON.stringify({ orders: [], synced_count: 0, message: "No orders found or broker returned empty" }),
        { status: 200, headers },
      );
    }

    // Upsert into Supabase
    const orderRows = orders.map((o: OpenAlgoOrder) => ({
      user_id:          user.id,
      broker_order_id:  (o.orderid ?? o.order_id ?? o.orderId ?? null) as string | null,
      symbol:           (o.tradingsymbol ?? o.symbol ?? null) as string | null,
      exchange:         (o.exchange ?? null) as string | null,
      action:           (o.transactiontype ?? o.action ?? o.side ?? null) as string | null,
      quantity:         Number((o.quantity ?? (o as any).qty ?? 0)) || null,
      price:            Number((o.price ?? 0)) || null,
      order_type:       (o.ordertype ?? (o as any).order_type ?? null) as string | null,
      product_type:     (o.producttype ?? (o as any).product ?? null) as string | null,
      status:           (o.status ?? "").toLowerCase(),
      filled_quantity:  Number((o.filledshares ?? (o as any).filledquantity ?? (o as any).filled_quantity ?? 0)) || null,
      average_price:    Number((o.averageprice ?? (o as any).average_price ?? 0)) || null,
      strategy_name:    (o.strategy ?? (o as any).strategy_name ?? null) as string | null,
      rejection_reason: (o.rejectreason ?? (o as any).rejection_reason ?? null) as string | null,
      order_timestamp:  normTimestamp(o.updatetime ?? o.ordertime ?? (o as any).timestamp),
      synced_at:        new Date().toISOString(),
    })).filter((r) => r.broker_order_id);

    const tradeRows = trades.map((t: OpenAlgoOrder) => {
      const orderId = (t.orderid ?? (t as any).order_id ?? (t as any).orderId ?? "").toString().trim();
      const fillId = ((t as any).fillid ?? (t as any).fill_id ?? "").toString().trim();
      const ts = normTimestamp((t as any).tradetime ?? (t as any).timestamp ?? (t as any).ordertime);
      const synthetic = fillId ? `TRADE-${fillId}` : (orderId && ts ? `TRADE-${orderId}-${ts}` : null);
      return {
        user_id:          user.id,
        broker_order_id:  orderId || synthetic,
        symbol:           ((t.tradingsymbol ?? (t as any).symbol ?? null) as string | null),
        exchange:         ((t.exchange ?? null) as string | null),
        action:           ((t.transactiontype ?? (t as any).action ?? (t as any).side ?? null) as string | null),
        quantity:         Number((t.quantity ?? (t as any).tradedquantity ?? (t as any).qty ?? 0)) || null,
        price:            Number(((t as any).price ?? 0)) || null,
        order_type:       ((t.ordertype ?? (t as any).order_type ?? "MARKET") as string),
        product_type:     ((t.producttype ?? (t as any).product ?? null) as string | null),
        status:           "complete",
        filled_quantity:  Number(((t as any).filledshares ?? (t as any).filledquantity ?? (t as any).tradedquantity ?? t.quantity ?? 0)) || null,
        average_price:    Number(((t as any).averageprice ?? (t as any).average_price ?? 0)) || null,
        strategy_name:    ((t.strategy ?? (t as any).strategy_name ?? null) as string | null),
        rejection_reason: null,
        order_timestamp:  ts,
        synced_at:        new Date().toISOString(),
      };
    }).filter((r) => r.broker_order_id);

    const rows = [...orderRows, ...tradeRows];

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
        fetched_trades_from_broker: trades.length,
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
