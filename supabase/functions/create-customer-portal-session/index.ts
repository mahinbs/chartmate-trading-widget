/**
 * Stripe Customer Portal — opens hosted flows (payment, plan change, cancel) using your portal config.
 *
 * Body JSON:
 * - return_url (optional)
 * - portal_flow (optional): "default" | "payment_method_update" | "subscription_update" | "subscription_cancel"
 *
 * Uses Billing Portal configuration:
 * - STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID env, or built-in default for this project.
 *
 * Env: STRIPE_SECRET_KEY, APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID (optional override)
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";
/** Default portal config (override with STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID for test/live splits). */ const DEFAULT_PORTAL_CONFIGURATION_ID = "bpc_1TIRfmSQFpbfNakVFN0mQ3gN";
const envPortal = Deno.env.get("STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID")?.trim() ?? "";
const PORTAL_CONFIGURATION_ID = envPortal.length > 0 ? envPortal : DEFAULT_PORTAL_CONFIGURATION_ID;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info"
};
function appendPortalFlow(form, flow, subscriptionId) {
  if (flow === "default") return;
  if (flow === "payment_method_update") {
    form.append("flow_data[type]", "payment_method_update");
    return;
  }
  if (!subscriptionId || !subscriptionId.startsWith("sub_")) {
    throw new Error("No active Stripe subscription on file for this account.");
  }
  if (flow === "subscription_cancel") {
    form.append("flow_data[type]", "subscription_cancel");
    form.append("flow_data[subscription_cancel][subscription]", subscriptionId);
    return;
  }
  if (flow === "subscription_update") {
    form.append("flow_data[type]", "subscription_update");
    form.append("flow_data[subscription_update][subscription]", subscriptionId);
  }
}
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
    const body = await req.json().catch(()=>({}));
    const returnUrl = typeof body.return_url === "string" && body.return_url.startsWith("http") ? body.return_url : `${APP_URL}/subscription`;
    const rawFlow = body.portal_flow;
    const portal_flow = rawFlow === "payment_method_update" || rawFlow === "subscription_update" || rawFlow === "subscription_cancel" ? rawFlow : "default";
    const { data: row, error: subErr } = await supabase.from("user_subscriptions").select("stripe_customer_id, stripe_subscription_id").eq("user_id", user.id).maybeSingle();
    if (subErr) {
      console.error("create-customer-portal-session sub fetch:", subErr);
      return new Response(JSON.stringify({
        error: "Could not load subscription"
      }), {
        status: 500,
        headers
      });
    }
    const customerId = row?.stripe_customer_id?.trim();
    if (!customerId) {
      return new Response(JSON.stringify({
        error: "No Stripe customer on file yet. Complete a plan purchase first."
      }), {
        status: 400,
        headers
      });
    }
    const subscriptionId = row?.stripe_subscription_id?.trim() ?? null;
    const form = new URLSearchParams();
    form.append("customer", customerId);
    form.append("return_url", returnUrl);
    form.append("configuration", PORTAL_CONFIGURATION_ID);
    try {
      appendPortalFlow(form, portal_flow, subscriptionId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid portal flow";
      return new Response(JSON.stringify({
        error: msg
      }), {
        status: 400,
        headers
      });
    }
    const stripeRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
    const stripeData = await stripeRes.json().catch(()=>({}));
    if (!stripeRes.ok) {
      const msg = stripeData.error?.message ?? "Stripe portal error";
      console.error("create-customer-portal-session:", msg);
      return new Response(JSON.stringify({
        error: msg
      }), {
        status: 400,
        headers
      });
    }
    const url = stripeData.url;
    if (!url) {
      return new Response(JSON.stringify({
        error: "No portal URL returned"
      }), {
        status: 500,
        headers
      });
    }
    return new Response(JSON.stringify({
      url
    }), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error("create-customer-portal-session error:", err);
    return new Response(JSON.stringify({
      error: "Internal error"
    }), {
      status: 500,
      headers
    });
  }
});
