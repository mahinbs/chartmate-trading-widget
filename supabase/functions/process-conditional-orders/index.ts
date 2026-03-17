/**
 * process-conditional-orders — Called by cron. Checks pending conditional orders,
 * runs condition check via backtest-strategy (mode: check), and fires order when met.
 * All logic in our backend — no external scripts.
 *
 * Call with: X-Cron-Secret: <CRON_SECRET> (optional; if set, required for cron)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  if (CRON_SECRET && req.headers.get("X-Cron-Secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pending, error: fetchErr } = await supabase
      .from("pending_conditional_orders")
      .select("id, user_id, strategy_id, symbol, exchange, action, quantity, product, paper_strategy_type")
      .eq("status", "pending")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .limit(20);

    if (fetchErr) {
      console.error("process-conditional-orders fetch:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers });
    }

    const processed: string[] = [];
    const fired: string[] = [];

    for (const row of pending ?? []) {
      processed.push(row.id);

      // Check conditions via backtest-strategy (mode: check)
      const checkRes = await fetch(`${SUPABASE_URL}/functions/v1/backtest-strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: row.symbol,
          strategy: row.paper_strategy_type,
          action: row.action,
          mode: "check",
        }),
      });
      const checkData = (await checkRes.json().catch(() => ({}))) as any;
      const achieved = checkData?.strategyAchieved === true;

      await supabase
        .from("pending_conditional_orders")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", row.id);

      if (!achieved) continue;

      // Load strategy + integration
      const { data: strategy } = await supabase
        .from("user_strategies")
        .select("id, name")
        .eq("id", row.strategy_id)
        .single();
      if (!strategy) {
        await supabase.from("pending_conditional_orders").update({
          status: "cancelled",
          error_message: "Strategy not found",
        }).eq("id", row.id);
        continue;
      }

      const { data: integration } = await supabase
        .from("user_trading_integration")
        .select("openalgo_api_key")
        .eq("user_id", row.user_id)
        .eq("is_active", true)
        .maybeSingle() as any;
      const apiKey = integration?.openalgo_api_key ?? "";
      if (!apiKey) {
        await supabase.from("pending_conditional_orders").update({
          status: "cancelled",
          error_message: "No broker connection",
        }).eq("id", row.id);
        continue;
      }

      const orderPayload = {
        apikey: apiKey.trim(),
        strategy: strategy.name,
        exchange: row.exchange,
        symbol: row.symbol,
        action: row.action,
        product: row.product,
        pricetype: "MARKET",
        quantity: String(row.quantity),
        price: "0",
        trigger_price: "0",
        disclosed_quantity: "0",
      };

      const placeRes = await fetch(`${OPENALGO_URL}/api/v1/placeorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      const placeData = await placeRes.json().catch(() => ({}));
      const orderId = (placeData as any)?.orderid ?? (placeData as any)?.broker_order_id;

      await supabase.from("pending_conditional_orders").update({
        status: placeRes.ok ? "executed" : "cancelled",
        executed_at: placeRes.ok ? new Date().toISOString() : null,
        broker_order_id: orderId ?? null,
        error_message: placeRes.ok ? null : ((placeData as any)?.message ?? "Order failed"),
      }).eq("id", row.id);

      if (placeRes.ok) {
        fired.push(row.id);
        await supabase.from("order_audit_logs").insert({
          user_id: row.user_id,
          trade_id: null,
          intent: "entry",
          provider: "openalgo",
          request_payload: orderPayload,
          response_payload: placeData,
          status: "success",
        }).catch(() => {});
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      processed: processed.length,
      fired: fired.length,
    }), { status: 200, headers });
  } catch (e: any) {
    console.error("process-conditional-orders error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers });
  }
});
