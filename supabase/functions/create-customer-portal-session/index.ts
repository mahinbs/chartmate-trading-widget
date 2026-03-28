/**
 * Opens Stripe Customer Portal for plan changes, cancel, payment method.
 * Configure the portal in Stripe Dashboard: products, proration, downgrade at period end.
 *
 * Env: STRIPE_SECRET_KEY, APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (!STRIPE_SECRET) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), { status: 503, headers });
    }

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

    const body = await req.json().catch(() => ({}));
    const returnUrl = typeof body.return_url === "string" && body.return_url.startsWith("http")
      ? body.return_url
      : `${APP_URL}/subscription`;

    const { data: row, error: subErr } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr) {
      console.error("create-customer-portal-session sub fetch:", subErr);
      return new Response(JSON.stringify({ error: "Could not load subscription" }), { status: 500, headers });
    }

    const customerId = (row?.stripe_customer_id as string | null)?.trim();
    if (!customerId) {
      return new Response(
        JSON.stringify({ error: "No Stripe customer on file yet. Complete a plan purchase first." }),
        { status: 400, headers },
      );
    }

    const form = new URLSearchParams();
    form.append("customer", customerId);
    form.append("return_url", returnUrl);

    const stripeRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const stripeData = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) {
      const msg = (stripeData as { error?: { message?: string } }).error?.message ?? "Stripe portal error";
      console.error("create-customer-portal-session:", msg);
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers });
    }

    const url = (stripeData as { url?: string }).url;
    if (!url) {
      return new Response(JSON.stringify({ error: "No portal URL returned" }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ url }), { status: 200, headers });
  } catch (err) {
    console.error("create-customer-portal-session error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
