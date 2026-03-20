/**
 * get-portfolio-data — Supabase Edge Function
 *
 * Fetches live broker account data from OpenAlgo in one call:
 *   - Funds/cash balance        → /api/v1/funds
 *   - Open positions (intraday) → /api/v1/positionbook
 *   - Holdings (long-term)      → /api/v1/holdings
 *   - Recent orders             → /api/v1/orderbook
 *
 * The user's openalgo_api_key (permanent, set by admin at provisioning) is used.
 * Returns combined portfolio snapshot. All data fetched in parallel.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

async function oaPost(endpoint: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${OPENALGO_URL}${endpoint}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ apikey: apiKey }),
    signal:  AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${endpoint} → ${res.status}`);
  return await res.json();
}

function pickList(payload: any, kind: "positions" | "holdings" | "orders" | "tradebook" | "open_positions"): any[] {
  if (!payload || typeof payload !== "object") return [];
  const keysByKind: Record<string, string[]> = {
    positions: ["data", "positions", "positionbook", "result"],
    holdings: ["data", "holdings", "result"],
    orders: ["data", "orders", "orderbook", "result"],
    tradebook: ["data", "trades", "tradebook", "result"],
    open_positions: ["data", "open_positions", "openposition", "result"],
  };
  for (const k of keysByKind[kind] ?? []) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.response?.data)) return payload.response.data;
  return [];
}

function pickFunds(payload: any): any {
  if (!payload) return null;
  if (payload?.funds && typeof payload.funds === "object") return payload.funds;
  if (payload?.data && !Array.isArray(payload.data) && typeof payload.data === "object") return payload.data;
  if (!Array.isArray(payload) && typeof payload === "object") return payload;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
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

    if (!OPENALGO_URL) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_URL not configured", error_code: "CONFIG_ERROR" }),
        { status: 503, headers },
      );
    }

    // Get user's permanent OpenAlgo API key
    const { data: integration } = await supabase
      .from("user_trading_integration" as any)
      .select("openalgo_api_key, broker, is_active, token_expires_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const apiKey      = (integration as any)?.openalgo_api_key ?? "";
    const broker      = (integration as any)?.broker ?? null;
    const tokenExpiry = (integration as any)?.token_expires_at ?? null;

    if (!apiKey.trim()) {
      return new Response(
        JSON.stringify({ error: "No active broker integration found.", error_code: "NO_INTEGRATION" }),
        { status: 400, headers },
      );
    }

    const isTokenExpired = tokenExpiry ? new Date(tokenExpiry).getTime() < Date.now() : false;

    // Fetch all data sources in parallel — don't fail if one is unavailable
    const [fundsResult, positionsResult, holdingsResult, ordersResult, tradeBookResult, openPosResult] = await Promise.allSettled([
      oaPost("/api/v1/funds",         apiKey),
      oaPost("/api/v1/positionbook",  apiKey),
      oaPost("/api/v1/holdings",      apiKey),
      oaPost("/api/v1/orderbook",     apiKey),
      oaPost("/api/v1/tradebook",     apiKey),  // actual fills (confirmed executions)
      oaPost("/api/v1/openposition",  apiKey),  // net open qty per symbol in real-time
    ]);

    const fulfilled = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? r.value : null);

    const extractError = (r: PromiseSettledResult<unknown>) =>
      r.status === "rejected" ? r.reason?.message ?? "Error" : null;

    const funds      = pickFunds(fulfilled(fundsResult));
    const positions  = pickList(fulfilled(positionsResult), "positions");
    const holdings   = pickList(fulfilled(holdingsResult), "holdings");
    const orders     = pickList(fulfilled(ordersResult), "orders");
    const tradebook  = pickList(fulfilled(tradeBookResult), "tradebook");
    const openPos    = pickList(fulfilled(openPosResult), "open_positions");

    return new Response(
      JSON.stringify({
        broker,
        token_expires_at: tokenExpiry,
        token_expired:    isTokenExpired,
        funds,
        positions:    Array.isArray(positions)  ? positions  : [],
        holdings:     Array.isArray(holdings)   ? holdings   : [],
        orders:       Array.isArray(orders)      ? orders     : [],
        tradebook:    Array.isArray(tradebook)   ? tradebook  : [],   // actual confirmed fills
        open_positions: Array.isArray(openPos)   ? openPos    : [],   // real-time net qty
        errors: {
          funds:      extractError(fundsResult),
          positions:  extractError(positionsResult),
          holdings:   extractError(holdingsResult),
          orders:     extractError(ordersResult),
          tradebook:  extractError(tradeBookResult),
          open_pos:   extractError(openPosResult),
        },
      }),
      { status: 200, headers },
    );

  } catch (err) {
    console.error("get-portfolio-data error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error fetching portfolio" }),
      { status: 500, headers },
    );
  }
});
