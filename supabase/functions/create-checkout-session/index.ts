/**
 * create-checkout-session — Supabase Edge Function
 * Creates a Stripe Checkout Session for premium plans or white-label subscriptions.
 *
 * WL 1yr / 2yr     → mode: subscription (recurring yearly)
 * WL 5yr           → mode: payment (one-time, admin-generated link with security token)
 * Premium plans → mode: subscription (monthly recurring).
 *
 * When STRIPE_PRICE_*_SETUP is set for a premium plan, Checkout includes:
 *   - recurring monthly price + one-time setup price on the first invoice
 *   - subscription_data.trial_period_days = 30 (monthly billing starts after 30 days)
 * If setup env is omitted, only the monthly price is used (legacy Stripe products).
 *
 * Env: STRIPE_SECRET_KEY,
 *      STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PROFESSIONAL (monthly),
 *      STRIPE_PRICE_STARTER_SETUP, STRIPE_PRICE_GROWTH_SETUP, STRIPE_PRICE_PROFESSIONAL_SETUP (one-time, optional),
 *      STRIPE_PRICE_BOT, STRIPE_PRICE_PROB, STRIPE_PRICE_PRO (legacy),
 *      STRIPE_PRICE_WL_1Y, STRIPE_PRICE_WL_2Y, STRIPE_PRICE_WL_5Y, STRIPE_PRICE_TEST_1R (optional)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyAffiliateToUserProfileIfEmpty, getClientIp, resolveAffiliateIdFromVisitorIp } from "../_shared/affiliate-ip-resolution.ts";
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";
const PRICE_IDS_USD = {
  starterPlan: Deno.env.get("STRIPE_PRICE_STARTER") ?? "",
  growthPlan: Deno.env.get("STRIPE_PRICE_GROWTH") ?? "",
  professionalPlan: Deno.env.get("STRIPE_PRICE_PROFESSIONAL") ?? "",
  wl_1_year: Deno.env.get("STRIPE_PRICE_WL_1Y") ?? "",
  wl_2_years: Deno.env.get("STRIPE_PRICE_WL_2Y") ?? "",
  wl_5_years: Deno.env.get("STRIPE_PRICE_WL_5Y") ?? "",
};
const PRICE_IDS_INR = {
  starterPlan: Deno.env.get("STRIPE_PRICE_STARTER_INR") ?? "",
  growthPlan: Deno.env.get("STRIPE_PRICE_GROWTH_INR") ?? "",
  professionalPlan: Deno.env.get("STRIPE_PRICE_PROFESSIONAL_INR") ?? "",
  wl_1_year: "",
  wl_2_years: "",
  wl_5_years: "",
};
/** One-time integration fee per premium plan (Stripe one-time Prices). Optional: omit for legacy checkout. */
const SETUP_PRICE_IDS_USD: Record<string, string> = {
  starterPlan: Deno.env.get("STRIPE_PRICE_STARTER_SETUP") ?? "",
  growthPlan: Deno.env.get("STRIPE_PRICE_GROWTH_SETUP") ?? "",
  professionalPlan: Deno.env.get("STRIPE_PRICE_PROFESSIONAL_SETUP") ?? "",
};
const SETUP_PRICE_IDS_INR: Record<string, string> = {
  starterPlan: Deno.env.get("STRIPE_PRICE_STARTER_SETUP_INR") ?? "",
  growthPlan: Deno.env.get("STRIPE_PRICE_GROWTH_SETUP_INR") ?? "",
  professionalPlan: Deno.env.get("STRIPE_PRICE_PROFESSIONAL_SETUP_INR") ?? "",
};
const PREMIUM_PLAN_IDS = new Set([
  "starterPlan",
  "growthPlan",
  "professionalPlan",
]);
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
    const body = await req.json().catch(()=>({}));
    const planId = body.plan_id ?? "";
    const type = body.type ?? "premium";
    const currency = String(body.currency ?? "usd").toLowerCase() === "inr" ? "inr" : "usd";
    if (currency === "inr" && (type === "whitelabel" || String(planId).startsWith("wl_"))) {
      return new Response(
        JSON.stringify({
          error: "White-label plans are only available in USD. Switch currency to USD or use global pricing in INR.",
        }),
        { status: 400, headers },
      );
    }
    const successUrl = body.success_url || `${APP_URL}/?checkout=success`;
    const cancelUrl = body.cancel_url || `${APP_URL}/?checkout=cancelled`;
    const wlPayload = body.wl;
    const priceMap = currency === "inr" ? PRICE_IDS_INR : PRICE_IDS_USD;
    const setupMap = currency === "inr" ? SETUP_PRICE_IDS_INR : SETUP_PRICE_IDS_USD;
    let priceId = priceMap[planId] ?? "";
    if (!priceId && planId === "test_1_rupee") {
      priceId = Deno.env.get("STRIPE_PRICE_TEST_1R") ?? "";
    }
    if (!priceId) {
      const msg =
        currency === "inr"
          ? `INR price for plan "${planId}" not configured. Set STRIPE_PRICE_STARTER_INR / STRIPE_PRICE_GROWTH_INR / STRIPE_PRICE_PROFESSIONAL_INR and matching _SETUP_INR secrets in Supabase.`
          : `Price for plan "${planId}" not configured. Set the matching STRIPE_PRICE_* secret (e.g. STRIPE_PRICE_STARTER for starterPlan).`;
      console.error("create-checkout-session 400:", msg);
      return new Response(JSON.stringify({
        error: msg
      }), {
        status: 400,
        headers
      });
    }
    // WL 5yr — one-time payment, validate the admin-issued token
    const isWl5yr = planId === "wl_5_years";
    if (isWl5yr) {
      const token = wlPayload?.token;
      if (!token) {
        return new Response(JSON.stringify({
          error: "Missing payment link token"
        }), {
          status: 400,
          headers
        });
      }
      // Validate token: must be pending, not expired, and belong to this user's email
      const { data: pr, error: prErr } = await supabase.from("wl_payment_requests").select("id, email, status, expires_at").eq("token", token).maybeSingle();
      if (prErr || !pr) {
        return new Response(JSON.stringify({
          error: "Payment link not found"
        }), {
          status: 404,
          headers
        });
      }
      if (pr.status !== "pending") {
        return new Response(JSON.stringify({
          error: "Payment link already used or cancelled"
        }), {
          status: 400,
          headers
        });
      }
      if (new Date(pr.expires_at) < new Date()) {
        return new Response(JSON.stringify({
          error: "Payment link has expired"
        }), {
          status: 400,
          headers
        });
      }
      const userEmail = (user.email ?? "").toLowerCase().trim();
      const reqEmail = (pr.email ?? "").toLowerCase().trim();
      if (userEmail !== reqEmail) {
        return new Response(JSON.stringify({
          error: `This payment link is intended for ${reqEmail}. You are signed in as ${userEmail}.`
        }), {
          status: 403,
          headers
        });
      }
    // Save session ID on the request record (will be updated with stripe session id after creation)
    // We'll update after we get the Stripe session back
    }
    const { data: signupProf } = await supabase.from("user_signup_profiles").select("affiliate_id, referral_code_at_signup, user_id").eq("user_id", user.id).maybeSingle();
    let resolvedAffiliateId = signupProf?.affiliate_id ?? null;
    if (!resolvedAffiliateId) {
      const metaAff = user.user_metadata?.affiliate_id;
      if (typeof metaAff === "string" && metaAff.trim()) {
        const { data: affOk } = await supabase.from("affiliates").select("id").eq("id", metaAff.trim()).eq("is_active", true).maybeSingle();
        if (affOk?.id) resolvedAffiliateId = affOk.id;
      }
    }
    if (!resolvedAffiliateId) {
      const clientIp = getClientIp(req);
      resolvedAffiliateId = await resolveAffiliateIdFromVisitorIp(supabase, clientIp);
    }
    // Persist attribution on the user row (source of truth for webhooks / dashboards). No Stripe metadata needed.
    if (resolvedAffiliateId && !signupProf?.affiliate_id) {
      await applyAffiliateToUserProfileIfEmpty(supabase, user.id, user.email, resolvedAffiliateId);
    }
    const metadata = {
      user_id: user.id,
      plan_id: planId,
      type
    };
    if (type === "whitelabel" && wlPayload) {
      metadata.brand_name = wlPayload.brand_name ?? "";
      metadata.slug = (wlPayload.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
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
      const setupPriceId =
        type === "premium" && PREMIUM_PLAN_IDS.has(planId) ? (setupMap[planId] ?? "").trim() : "";
      if (setupPriceId) {
        formBody.append("line_items[0][price]", priceId);
        formBody.append("line_items[0][quantity]", "1");
        formBody.append("line_items[1][price]", setupPriceId);
        formBody.append("line_items[1][quantity]", "1");
        formBody.append("subscription_data[trial_period_days]", "30");
      } else {
        formBody.append("line_items[0][price]", priceId);
        formBody.append("line_items[0][quantity]", "1");
      }
      formBody.append("subscription_data[metadata][user_id]", user.id);
      formBody.append("subscription_data[metadata][plan_id]", planId);
      formBody.append("subscription_data[metadata][type]", type);
      if (metadata.brand_name) formBody.append("subscription_data[metadata][brand_name]", metadata.brand_name);
      if (metadata.slug) formBody.append("subscription_data[metadata][slug]", metadata.slug);
    }
    formBody.append("success_url", successUrl);
    formBody.append("cancel_url", cancelUrl);
    formBody.append("metadata[user_id]", user.id);
    formBody.append("metadata[plan_id]", planId);
    formBody.append("metadata[type]", type);
    if (user.email) formBody.append("customer_email", user.email);
    if (metadata.brand_name) formBody.append("metadata[brand_name]", metadata.brand_name);
    if (metadata.slug) formBody.append("metadata[slug]", metadata.slug);
    if (metadata.wl_token) formBody.append("metadata[wl_token]", metadata.wl_token);
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formBody.toString()
    });
    const stripeData = await stripeRes.json().catch(()=>({}));
    if (!stripeRes.ok) {
      const msg = stripeData.error?.message;
      const stripeErr = msg ?? (JSON.stringify(stripeData) || "Stripe error");
      console.error("create-checkout-session Stripe 400:", stripeErr);
      return new Response(JSON.stringify({
        error: stripeErr
      }), {
        status: 400,
        headers
      });
    }
    const sessionId = stripeData.id;
    const url = stripeData.url;
    // For 5yr WL: record the Stripe session ID so the webhook can match
    if (isWl5yr && sessionId && wlPayload?.token) {
      await supabase.from("wl_payment_requests").update({
        stripe_checkout_session_id: sessionId
      }).eq("token", wlPayload.token);
    }
    return new Response(JSON.stringify({
      url
    }), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return new Response(JSON.stringify({
      error: "Internal error"
    }), {
      status: 500,
      headers
    });
  }
});
