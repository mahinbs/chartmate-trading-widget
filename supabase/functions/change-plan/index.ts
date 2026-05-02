/**
 * change-plan — Supabase Edge Function
 *
 * Implements the plan-change policy:
 *
 * UPGRADE (new plan is higher tier than current):
 *   1. Charges are immediate via Stripe Invoice Items + instant Invoice.
 *   2. Two charges:
 *      a. Integration delta = newPlan.integrationFee - user.integration_fee_paid  (if > 0)
 *      b. Monthly proration = (newMonthly - oldMonthly) * (daysRemaining / 30)   (if > 0)
 *   3. Stripe subscription is updated to the new monthly Price immediately.
 *   4. DB: plan_id = newPlan, integration_fee_paid += delta, pending_plan_change cleared.
 *
 * DOWNGRADE (new plan is lower tier than current):
 *   1. No immediate charge. No refund.
 *   2. DB: pending_plan_change = newPlanId, pending_plan_change_at = now().
 *   3. The webhook (invoice.paid for next renewal) applies the switch.
 *   4. User keeps current plan features until period end.
 *
 * Body:
 *   { "new_plan_id": "growthPlan" }
 *
 * Env: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *      STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PROFESSIONAL
 *      STRIPE_PRICE_STARTER_SETUP, STRIPE_PRICE_GROWTH_SETUP, STRIPE_PRICE_PROFESSIONAL_SETUP
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getPlanMeta,
  planIntegrationAmount,
  planMonthlyAmount,
  planTier,
  resolveMonthlyPriceId,
} from "../_shared/plan-catalog.ts";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

async function stripePost(path: string, body: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error on ${path}`);
  return json;
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error on ${path}`);
  return json;
}

Deno.serve(async (req) => {
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
    const newPlanId: string = body.new_plan_id ?? "";

    const newMeta = getPlanMeta(newPlanId);
    if (!newMeta) {
      return new Response(
        JSON.stringify({ error: `Unknown plan: ${newPlanId}` }),
        { status: 400, headers },
      );
    }

    // Load current subscription
    const { data: sub, error: subErr } = await supabase
      .from("user_subscriptions")
      .select(
        "plan_id, stripe_customer_id, stripe_subscription_id, current_period_end, integration_fee_paid",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr || !sub) {
      return new Response(
        JSON.stringify({ error: "No active subscription found." }),
        { status: 400, headers },
      );
    }

    const currentPlanId: string = sub.plan_id ?? "";
    const customerId: string = sub.stripe_customer_id ?? "";
    const stripeSubId: string = sub.stripe_subscription_id ?? "";
    const periodEnd: Date = sub.current_period_end
      ? new Date(sub.current_period_end)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const integrationFeePaid: number = Number(sub.integration_fee_paid ?? 0);

    if (!customerId || !stripeSubId) {
      return new Response(
        JSON.stringify({ error: "Stripe customer / subscription not on file." }),
        { status: 400, headers },
      );
    }

    if (currentPlanId === newPlanId) {
      return new Response(
        JSON.stringify({ error: "You are already on this plan." }),
        { status: 400, headers },
      );
    }

    const currentMeta = getPlanMeta(currentPlanId);
    const currentTier = planTier(currentPlanId);
    const newTier = planTier(newPlanId);

    const isUpgrade = newTier > currentTier;

    // ── DOWNGRADE ───────────────────────────────────────────────────────────
    if (!isUpgrade) {
      await supabase
        .from("user_subscriptions")
        .update({
          pending_plan_change: newPlanId,
          pending_plan_change_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({
          ok: true,
          action: "downgrade_scheduled",
          message: `Downgrade to ${newMeta.name} scheduled. Your current plan stays active until ${periodEnd.toDateString()}. The lower rate applies at the next renewal.`,
          effective_date: periodEnd.toISOString(),
        }),
        { status: 200, headers },
      );
    }

    // ── UPGRADE ─────────────────────────────────────────────────────────────
    const stripeSub = await stripeGet(`/subscriptions/${encodeURIComponent(stripeSubId)}`);
    const subCur: "usd" | "inr" =
      (stripeSub?.items?.data?.[0]?.price?.currency ?? "usd").toLowerCase() === "inr"
        ? "inr"
        : "usd";

    const newMonthlyPriceId = resolveMonthlyPriceId(newPlanId, subCur);
    if (!newMonthlyPriceId) {
      return new Response(
        JSON.stringify({
          error:
            subCur === "inr"
              ? `Monthly Stripe INR price not configured for ${newPlanId}. Set STRIPE_PRICE_${String(
                  newPlanId,
                )
                  .replace("Plan", "")
                  .toUpperCase()}_INR in Supabase.`
              : `Monthly Stripe price not configured for ${newPlanId}. Set STRIPE_PRICE_STARTER/ GROWTH / PROFESSIONAL.`,
        }),
        { status: 503, headers },
      );
    }

    // 1. Integration fee delta (DB `integration_fee_paid` is in same major units as the subscription currency)
    const newIntegFull = planIntegrationAmount(newMeta, subCur);
    const integrationDeltaMinor = Math.max(
      0,
      Math.round((newIntegFull - integrationFeePaid) * 100),
    );

    // 2. Monthly proration for remaining days in current period
    const now = new Date();
    const msRemaining = Math.max(0, periodEnd.getTime() - now.getTime());
    const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);
    const oldMonthly = currentMeta ? planMonthlyAmount(currentMeta, subCur) : 0;
    const newMonthly = planMonthlyAmount(newMeta, subCur);
    const monthlyDeltaPerDay = (newMonthly - oldMonthly) / 30;
    const proratedMinor = Math.max(0, Math.round(monthlyDeltaPerDay * daysRemaining * 100));

    const totalChargeMinor = integrationDeltaMinor + proratedMinor;
    const currencyCode = subCur;
    const sym = subCur === "inr" ? "₹" : "$";

    // 3. Add Invoice Items to the customer so they appear on a single invoice
    if (integrationDeltaMinor > 0) {
      const integItem = new URLSearchParams();
      integItem.append("customer", customerId);
      integItem.append("amount", String(integrationDeltaMinor));
      integItem.append("currency", currencyCode);
      integItem.append(
        "description",
        `Integration fee upgrade: ${currentMeta?.name ?? currentPlanId} → ${newMeta.name} (delta)`,
      );
      integItem.append("subscription", stripeSubId);
      await stripePost("/invoiceitems", integItem);
    }

    if (proratedMinor > 0) {
      const proItem = new URLSearchParams();
      proItem.append("customer", customerId);
      proItem.append("amount", String(proratedMinor));
      proItem.append("currency", currencyCode);
      proItem.append(
        "description",
        `Monthly proration: ${currentMeta?.name ?? currentPlanId} → ${newMeta.name} (${daysRemaining.toFixed(1)} days remaining)`,
      );
      proItem.append("subscription", stripeSubId);
      await stripePost("/invoiceitems", proItem);
    }

    // 4. Finalize an immediate invoice to charge the delta(s)
    if (totalChargeMinor > 0) {
      const invForm = new URLSearchParams();
      invForm.append("customer", customerId);
      invForm.append("subscription", stripeSubId);
      invForm.append("auto_advance", "true");
      const invoice = await stripePost("/invoices", invForm);

      // Pay the invoice immediately (uses the default payment method on file)
      const payForm = new URLSearchParams();
      payForm.append("forgive", "false");
      await stripePost(`/invoices/${invoice.id}/pay`, payForm);
    }

    // 5. Switch the Stripe subscription to the new monthly price
    const currentItemId: string = stripeSub?.items?.data?.[0]?.id ?? "";
    if (!currentItemId) {
      return new Response(
        JSON.stringify({ error: "Could not find subscription item to update." }),
        { status: 500, headers },
      );
    }

    const updateForm = new URLSearchParams();
    updateForm.append(`items[0][id]`, currentItemId);
    updateForm.append(`items[0][price]`, newMonthlyPriceId);
    updateForm.append("proration_behavior", "none"); // we handled proration manually above
    updateForm.append("metadata[plan_id]", newPlanId);
    await stripePost(`/subscriptions/${stripeSubId}`, updateForm);

    // 6. Update DB: new plan, bump integration_fee_paid, clear any pending downgrade
    const newIntegrationFeePaid = integrationFeePaid + integrationDeltaMinor / 100;
    await supabase
      .from("user_subscriptions")
      .update({
        plan_id: newPlanId,
        integration_fee_paid: newIntegrationFeePaid,
        pending_plan_change: null,
        pending_plan_change_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const amountLabel = (minor: number) =>
      subCur === "inr"
        ? `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${(minor / 100).toFixed(2)}`;

    return new Response(
      JSON.stringify({
        ok: true,
        action: "upgraded",
        message: `Upgraded to ${newMeta.name}. Charged ${amountLabel(totalChargeMinor)} today (integration delta + proration). Monthly billing continues at ${sym}${newMonthly.toFixed(subCur === "inr" ? 0 : 2)}/mo.`,
        integration_delta: (integrationDeltaMinor / 100).toFixed(2),
        proration: (proratedMinor / 100).toFixed(2),
        total_charged: (totalChargeMinor / 100).toFixed(2),
        /** @deprecated use integration_delta */
        integration_delta_usd: (integrationDeltaMinor / 100).toFixed(2),
        /** @deprecated use proration */
        proration_usd: (proratedMinor / 100).toFixed(2),
        /** @deprecated use total_charged */
        total_charged_usd: (totalChargeMinor / 100).toFixed(2),
        currency: subCur,
        new_plan_id: newPlanId,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("change-plan error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers },
    );
  }
});
