/**
 * Returns recent Stripe invoices for the signed-in user (read-only, for in-app billing history).
 * Env: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders
  };
  try {
    if (!STRIPE_SECRET) {
      return new Response(JSON.stringify({
        error: "Stripe not configured"
      }), {
        status: 503,
        headers
      });
    }
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
    const { data: row } = await supabase.from("user_subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    const customerId = String(row?.stripe_customer_id ?? "").trim();
    if (!customerId || customerId.startsWith("cus_manual_exc_")) {
      return new Response(JSON.stringify({
        invoices: []
      }), {
        status: 200,
        headers
      });
    }
    const params = new URLSearchParams({
      customer: customerId,
      limit: "24"
    });
    const stripeRes = await fetch(`https://api.stripe.com/v1/invoices?${params}`, {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`
      }
    });
    const stripeData = await stripeRes.json().catch(()=>({}));
    if (!stripeRes.ok) {
      const msg = stripeData.error?.message ?? "Stripe invoice error";
      console.error("list-stripe-invoices:", msg);
      return new Response(JSON.stringify({
        error: msg
      }), {
        status: 400,
        headers
      });
    }
    const rawList = stripeData.data ?? [];
    const invoices = rawList.map((inv)=>{
      const o = inv;
      return {
        id: String(o.id ?? ""),
        number: o.number != null ? String(o.number) : null,
        status: o.status != null ? String(o.status) : null,
        total: Number(o.total ?? 0),
        amount_paid: Number(o.amount_paid ?? 0),
        currency: String(o.currency ?? "usd"),
        created: Number(o.created ?? 0),
        hosted_invoice_url: o.hosted_invoice_url != null ? String(o.hosted_invoice_url) : null,
        invoice_pdf: o.invoice_pdf != null ? String(o.invoice_pdf) : null
      };
    });
    return new Response(JSON.stringify({
      invoices
    }), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error("list-stripe-invoices error:", err);
    return new Response(JSON.stringify({
      error: "Internal error"
    }), {
      status: 500,
      headers
    });
  }
});
