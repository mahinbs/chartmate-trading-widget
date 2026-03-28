/**
 * create-checkout-session — Supabase Edge Function
 * Creates a Stripe Checkout Session for premium plans or white-label subscriptions.
 *
 * WL 1yr / 2yr     → mode: subscription (recurring yearly)
 * WL 5yr           → mode: payment (one-time, admin-generated link with security token)
 * Premium plans → mode: subscription (recurring yearly)
 *
 * Billing notes (product policy — implement in Stripe Dashboard / Customer Portal as needed):
 * - Downgrades: effective after the current period ends (use cancel_at_period_end + new plan at renewal).
 * - Upgrade to Pro ($129) from Bot ($49) or Probability ($99): charge price difference via proration
 *   (Subscription update + proration_behavior) or Customer Portal.
 * - Adding Probability ($99) while on Bot-only is a separate product purchase (full $99), not a prorated
 *   upgrade from $49; next renewal can be consolidated to $129 in Stripe (merged subscription).
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_PRICE_BOT, STRIPE_PRICE_PROB, STRIPE_PRICE_PRO,
 *      STRIPE_PRICE_WL_1Y, STRIPE_PRICE_WL_2Y, STRIPE_PRICE_WL_5Y
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

const PRICE_IDS: Record<string, string> = {
  botIntegration:   Deno.env.get("STRIPE_PRICE_BOT")  ?? "",
  probIntelligence: Deno.env.get("STRIPE_PRICE_PROB") ?? "",
  proPlan:          Deno.env.get("STRIPE_PRICE_PRO")  ?? "",
  wl_1_year:        Deno.env.get("STRIPE_PRICE_WL_1Y") ?? "",
  wl_2_years:       Deno.env.get("STRIPE_PRICE_WL_2Y") ?? "",
  wl_5_years:       Deno.env.get("STRIPE_PRICE_WL_5Y") ?? "",
};

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({}));
    const planId     = (body.plan_id   as string) ?? "";
    const type       = (body.type      as string) ?? "premium";
    const successUrl = (body.success_url as string) || `${APP_URL}/?checkout=success`;
    const cancelUrl  = (body.cancel_url  as string) || `${APP_URL}/?checkout=cancelled`;
    const wlPayload  = body.wl as { brand_name?: string; slug?: string; token?: string } | undefined;

    const priceId = PRICE_IDS[planId] || (planId === "test_1_rupee" ? "" : PRICE_IDS.proPlan);
    if (!priceId) {
      const msg = `Price for plan ${planId} not configured. Set STRIPE_PRICE_TEST_1R in Supabase secrets.`;
      console.error("create-checkout-session 400:", msg);
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers });
    }

    // WL 5yr — one-time payment, validate the admin-issued token
    const isWl5yr = planId === "wl_5_years";
    if (isWl5yr) {
      const token = wlPayload?.token;
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing payment link token" }), { status: 400, headers });
      }
      // Validate token: must be pending, not expired, and belong to this user's email
      const { data: pr, error: prErr } = await supabase
        .from("wl_payment_requests")
        .select("id, email, status, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (prErr || !pr) {
        return new Response(JSON.stringify({ error: "Payment link not found" }), { status: 404, headers });
      }
      if (pr.status !== "pending") {
        return new Response(JSON.stringify({ error: "Payment link already used or cancelled" }), { status: 400, headers });
      }
      if (new Date(pr.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Payment link has expired" }), { status: 400, headers });
      }
      const userEmail = (user.email ?? "").toLowerCase().trim();
      const reqEmail  = (pr.email ?? "").toLowerCase().trim();
      if (userEmail !== reqEmail) {
        return new Response(
          JSON.stringify({ error: `This payment link is intended for ${reqEmail}. You are signed in as ${userEmail}.` }),
          { status: 403, headers },
        );
      }

      // Save session ID on the request record (will be updated with stripe session id after creation)
      // We'll update after we get the Stripe session back
    }

    const metadata: Record<string, string> = {
      user_id: user.id,
      plan_id: planId,
      type,
    };
    if (type === "whitelabel" && wlPayload) {
      metadata.brand_name = wlPayload.brand_name ?? "";
      metadata.slug       = (wlPayload.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (wlPayload.token) metadata.wl_token = wlPayload.token;
    }

    const formBody = new URLSearchParams();

    if (isWl5yr) {
      // One-time payment mode (5yr WL only)
      formBody.append("mode", "payment");
      formBody.append("payment_method_types[]", "card");
      formBody.append("line_items[0][price]", priceId);
      formBody.append("line_items[0][quantity]", "1");
    } else {
      // Recurring subscription for 1yr / 2yr WL and all premium plans
      formBody.append("mode", "subscription");
      formBody.append("payment_method_types[]", "card");
      formBody.append("line_items[0][price]", priceId);
      formBody.append("line_items[0][quantity]", "1");
      formBody.append("subscription_data[metadata][user_id]", user.id);
      formBody.append("subscription_data[metadata][plan_id]", planId);
      formBody.append("subscription_data[metadata][type]", type);
      if (metadata.brand_name) formBody.append("subscription_data[metadata][brand_name]", metadata.brand_name);
      if (metadata.slug)       formBody.append("subscription_data[metadata][slug]", metadata.slug);
    }

    formBody.append("success_url", successUrl);
    formBody.append("cancel_url", cancelUrl);
    formBody.append("metadata[user_id]", user.id);
    formBody.append("metadata[plan_id]", planId);
    formBody.append("metadata[type]", type);
    if (user.email) formBody.append("customer_email", user.email);
    if (metadata.brand_name) formBody.append("metadata[brand_name]", metadata.brand_name);
    if (metadata.slug)       formBody.append("metadata[slug]", metadata.slug);
    if (metadata.wl_token)   formBody.append("metadata[wl_token]", metadata.wl_token);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    const stripeData = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) {
      const msg = (stripeData as { error?: { message?: string } }).error?.message;
      const stripeErr = msg ?? (JSON.stringify(stripeData) || "Stripe error");
      console.error("create-checkout-session Stripe 400:", stripeErr);
      return new Response(JSON.stringify({ error: stripeErr }), { status: 400, headers });
    }

    const sessionId = (stripeData as { id?: string }).id;
    const url       = (stripeData as { url?: string }).url;

    // For 5yr WL: record the Stripe session ID so the webhook can match
    if (isWl5yr && sessionId && wlPayload?.token) {
      await supabase
        .from("wl_payment_requests")
        .update({ stripe_checkout_session_id: sessionId })
        .eq("token", wlPayload.token);
    }

    return new Response(JSON.stringify({ url }), { status: 200, headers });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
