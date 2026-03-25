/**
 * queue-conditional-order — Queue an order to execute only when strategy conditions are met.
 * All UI — no scripts. Our backend processes these and fires when conditions match.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({})) as {
      strategy_id: string;
      symbol: string;
      exchange?: string;
      action: "BUY" | "SELL";
      quantity: number;
      product?: string;
      paper_strategy_type?: string;
      expires_hours?: number;
    };

    const { strategy_id, symbol, action, quantity } = body;
    if (!strategy_id || !symbol || !action || !quantity) {
      return new Response(JSON.stringify({ error: "strategy_id, symbol, action and quantity are required" }), { status: 400, headers });
    }

    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (sub?.status !== "active" && sub?.status !== "trialing") {
      return new Response(JSON.stringify({ error: "Active subscription required", error_code: "NO_SUBSCRIPTION" }), { status: 403, headers });
    }

    const { data: strategy } = await supabase
      .from("user_strategies")
      .select("id")
      .eq("id", strategy_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!strategy) {
      return new Response(JSON.stringify({ error: "Strategy not found" }), { status: 404, headers });
    }

    const expiresHours = Math.min(Math.max(Number(body.expires_hours) || 24, 1), 168);
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();

    // Duplicate pending guard: same strategy+symbol+side shouldn't queue repeatedly
    const normalizedSymbol = symbol.trim().toUpperCase();
    const normalizedAction = action.toUpperCase();
    const { data: existingPending } = await supabase
      .from("pending_conditional_orders")
      .select("id, created_at")
      .eq("user_id", user.id)
      .eq("strategy_id", strategy_id)
      .eq("symbol", normalizedSymbol)
      .eq("action", normalizedAction)
      .eq("status", "pending")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingPending) {
      return new Response(JSON.stringify({
        success: true,
        id: existingPending.id,
        deduped: true,
        message: "Already deployed and pending for this strategy/symbol/side.",
      }), { status: 200, headers });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("pending_conditional_orders")
      .insert({
        user_id: user.id,
        strategy_id,
        symbol: normalizedSymbol,
        exchange: (body.exchange ?? "NSE").toUpperCase(),
        action: normalizedAction,
        quantity: Number(quantity) || 1,
        product: (body.product ?? "MIS").toUpperCase(),
        paper_strategy_type: body.paper_strategy_type ?? "trend_following",
        status: "pending",
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers });
    }
    return new Response(JSON.stringify({ success: true, id: inserted.id }), { status: 201, headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers });
  }
});
