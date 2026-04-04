/**
 * stripe-webhook — Supabase Edge Function
 *
 * Events to enable in Stripe Dashboard → Webhooks:
 * - checkout.session.completed
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_failed  (sets payment_failed_at)
 * - invoice.paid              (clears payment_failed_at when subscription renews)
 *
 * Env: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY (fetch full subscription on checkout)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripePriceToPlanId } from "../_shared/subscription-plans.ts";

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

function planIdFromStripeSubscription(sub: Record<string, unknown>): string | undefined {
  const metaPlan = (sub.metadata as Record<string, string> | undefined)?.plan_id;
  if (metaPlan) return metaPlan;
  const items = sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  const priceId = items?.data?.[0]?.price?.id;
  if (!priceId) return undefined;
  const map = stripePriceToPlanId();
  return map[priceId];
}

async function resolveAffiliateIdForPayment(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  /** Older sessions only — attribution lives on user_signup_profiles now. */
  legacyStripeMetaAffiliateId?: string | null,
): Promise<string | null> {
  const { data: prof } = await supabase
    .from("user_signup_profiles")
    .select("affiliate_id")
    .eq("user_id", userId)
    .maybeSingle();
  const fromProfile = prof?.affiliate_id as string | null;
  if (fromProfile) {
    const { data: aff } = await supabase
      .from("affiliates")
      .select("id")
      .eq("id", fromProfile)
      .eq("is_active", true)
      .maybeSingle();
    if (aff?.id) return aff.id as string;
  }
  if (legacyStripeMetaAffiliateId?.trim()) {
    const { data: aff2 } = await supabase
      .from("affiliates")
      .select("id")
      .eq("id", legacyStripeMetaAffiliateId.trim())
      .eq("is_active", true)
      .maybeSingle();
    if (aff2?.id) return aff2.id as string;
  }
  return null;
}

async function recordCheckoutPayment(
  supabase: ReturnType<typeof createClient>,
  params: {
    sessionId: string;
    userId: string;
    planId: string;
    legacyStripeMetaAffiliateId?: string | null;
    amountTotal?: number | null;
    currency?: string | null;
  },
) {
  if (!params.sessionId || !params.userId || !params.planId) return;

  const { data: existing } = await supabase
    .from("user_payments")
    .select("id")
    .eq("stripe_checkout_session_id", params.sessionId)
    .maybeSingle();
  if (existing?.id) return;

  const cents = params.amountTotal ?? 0;
  const amount = cents > 0 ? cents / 100 : 0;
  const currency = (params.currency ?? "inr").toUpperCase();

  let affiliateId: string | null = await resolveAffiliateIdForPayment(
    supabase,
    params.userId,
    params.legacyStripeMetaAffiliateId,
  );
  let commissionPercent: number | null = null;
  let commissionAmount: number | null = null;

  if (affiliateId) {
    const { data: aff } = await supabase
      .from("affiliates")
      .select("commission_percent, is_active")
      .eq("id", affiliateId)
      .maybeSingle();
    if (!aff || !(aff as { is_active?: boolean }).is_active) {
      affiliateId = null;
    } else {
      commissionPercent = Number((aff as { commission_percent?: number }).commission_percent ?? 0);
      commissionAmount = (amount * commissionPercent) / 100;
    }
  }

  await supabase.from("user_payments").insert({
    user_id: params.userId,
    amount,
    currency,
    status: "completed",
    affiliate_id: affiliateId,
    commission_percent: commissionPercent,
    commission_amount: commissionAmount,
    plan_id: params.planId,
    stripe_checkout_session_id: params.sessionId,
  });
}

async function fetchStripeSubscription(subId: string): Promise<Record<string, unknown> | null> {
  if (!STRIPE_SECRET) return null;
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

async function verifyStripeWebhook(payload: string, sigHeader: string, secret: string): Promise<{ type: string; data?: { object?: Record<string, unknown> } }> {
  const parts = sigHeader.split(",").reduce((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k.trim()] = v;
    return acc;
  }, {} as Record<string, string>);
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) throw new Error("Missing t or v1 in signature");
  const payloadToSign = timestamp + "." + payload;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadToSign));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== v1) throw new Error("Signature mismatch");
  return JSON.parse(payload) as { type: string; data?: { object?: Record<string, unknown> } };
}

Deno.serve(async (req: Request) => {
  try {
    if (!WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), { status: 500 });
    }

    const sig = req.headers.get("stripe-signature") ?? "";
    const body = await req.text();
    let event: { type: string; data?: { object?: Record<string, unknown> } };

    try {
      event = await verifyStripeWebhook(body, sig, WEBHOOK_SECRET);
    } catch (e: unknown) {
      console.error("Stripe signature verification failed:", e);
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const obj = event.data?.object as Record<string, unknown> | undefined;
    const meta = (obj?.metadata as Record<string, string>) ?? {};
    const userId = meta.user_id;
    const planId = meta.plan_id;
    const type = meta.type ?? "premium";

    if (event.type === "checkout.session.completed") {
      const session = obj as {
        id?: string; customer?: string; subscription?: string;
        customer_email?: string; payment_intent?: string;
        amount_total?: number | null;
        currency?: string | null;
      };
      const custId   = session.customer as string | undefined;
      const subId    = session.subscription as string | undefined;
      const wlToken  = meta.wl_token as string | undefined;
      const affiliateFromCheckout = typeof meta.affiliate_id === "string" && meta.affiliate_id.trim()
        ? meta.affiliate_id.trim()
        : null;

      if (type === "whitelabel" && userId && planId) {
        const brandName = meta.brand_name ?? "White Label Partner";
        const slug  = (meta.slug ?? "partner").toLowerCase().replace(/[^a-z0-9-]/g, "-") || "partner";
        const years = planId === "wl_5_years" ? 5 : planId === "wl_2_years" ? 2 : 1;
        const starts = new Date();
        const ends   = new Date(starts);
        ends.setFullYear(ends.getFullYear() + years);

        const subPlan = years === 5 ? "5_year" : years === 2 ? "2_year" : "1_year";
        const startsStr = starts.toISOString().slice(0, 10);
        const endsStr   = ends.toISOString().slice(0, 10);

        // Check if tenant already exists (admin pre-created flow)
        const { data: existingTenant } = await supabase
          .from("white_label_tenants")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();

        let tenantId: string | null = null;

        if (existingTenant?.id) {
          // Tenant was pre-created by admin — just activate it and record payment details
          const { data: updated } = await supabase
            .from("white_label_tenants")
            .update({
              status:             "active",
              subscription_plan:  subPlan,
              starts_on:          startsStr,
              ends_on:            endsStr,
              stripe_customer_id: custId ?? null,
              stripe_subscription_id: subId ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingTenant.id)
            .select("id")
            .single();
          tenantId = updated?.id ?? existingTenant.id;
        } else {
          // Brand-new tenant (self-signup via pricing page)
          const { data: inserted } = await supabase
            .from("white_label_tenants")
            .insert({
              slug,
              brand_name:          brandName,
              brand_primary_color: "#6366f1",
              owner_email:         session.customer_email ?? undefined,
              subscription_plan:   subPlan,
              starts_on:           startsStr,
              ends_on:             endsStr,
              status:              "active",
              stripe_customer_id:  custId ?? null,
              stripe_subscription_id: subId ?? null,
            })
            .select("id")
            .single();
          tenantId = inserted?.id ?? null;
        }

        if (tenantId) {
          // Ensure owner membership is active
          await supabase.from("white_label_tenant_users").upsert({
            tenant_id: tenantId,
            user_id:   userId,
            role:      "admin",
            status:    "active",
          }, { onConflict: "tenant_id,user_id" });

          // For 5yr: mark the payment request record as paid
          if (planId === "wl_5_years" && wlToken) {
            await supabase
              .from("wl_payment_requests")
              .update({ status: "paid", paid_at: new Date().toISOString() })
              .eq("token", wlToken);
          }
        }

        if (session.id && userId && planId) {
          await recordCheckoutPayment(supabase, {
            sessionId: session.id,
            userId,
            planId,
            legacyStripeMetaAffiliateId: affiliateFromCheckout,
            amountTotal: session.amount_total ?? null,
            currency: session.currency ?? null,
          });
        }
      } else if (userId && planId) {
        let periodEnd: string | null = null;
        let resolvedPlanId = planId;
        let cancelAtEnd = false;
        if (subId) {
          const stripeSub = await fetchStripeSubscription(subId);
          if (stripeSub) {
            const cpe = stripeSub.current_period_end as number | undefined;
            if (cpe) periodEnd = new Date(cpe * 1000).toISOString();
            const fromStripe = planIdFromStripeSubscription(stripeSub);
            if (fromStripe) resolvedPlanId = fromStripe;
            cancelAtEnd = Boolean(stripeSub.cancel_at_period_end);
          }
        } else if (obj?.current_period_end) {
          periodEnd = new Date((obj.current_period_end as number) * 1000).toISOString();
        }
        await supabase.from("user_subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: custId ?? null,
            stripe_subscription_id: subId ?? null,
            plan_id: resolvedPlanId,
            status: "active",
            current_period_end: periodEnd,
            cancel_at_period_end: cancelAtEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

        if (session.id) {
          await recordCheckoutPayment(supabase, {
            sessionId: session.id,
            userId,
            planId: resolvedPlanId,
            legacyStripeMetaAffiliateId: affiliateFromCheckout,
            amountTotal: session.amount_total ?? null,
            currency: session.currency ?? null,
          });
        }
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = obj as {
        id?: string;
        status?: string;
        customer?: string;
        current_period_end?: number;
        cancel_at_period_end?: boolean;
        metadata?: Record<string, string>;
        items?: { data?: Array<{ price?: { id?: string } }> };
      };
      const subId = sub.id;
      const status = (sub.status as string) ?? "canceled";
      const resolvedPlan = planIdFromStripeSubscription(obj as Record<string, unknown>);

      // unpaid = retries exhausted; treat like past_due for DB check constraint & app access
      const dbStatus =
        status === "active" || status === "trialing"
          ? status
          : status === "past_due" || status === "unpaid"
            ? "past_due"
            : status === "incomplete"
              ? "incomplete"
              : "canceled";
      const updatePayload: Record<string, unknown> = {
        status: dbStatus,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        updated_at: new Date().toISOString(),
      };
      if (resolvedPlan) updatePayload.plan_id = resolvedPlan;
      if (dbStatus === "canceled") {
        updatePayload.payment_failed_at = null;
      }

      await supabase
        .from("user_subscriptions")
        .update(updatePayload)
        .eq("stripe_subscription_id", subId);

      const wlRes = await supabase
        .from("white_label_tenants")
        .update({
          status: status === "active" ? "active" : "expired",
          stripe_subscription_id: status === "active" ? subId : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subId)
        .select("id");
      if (wlRes.data?.length) {
        await supabase
          .from("white_label_tenant_users")
          .update({ status: status === "active" ? "active" : "suspended" })
          .eq("tenant_id", wlRes.data[0].id);
      }
    } else if (event.type === "invoice.payment_failed") {
      const inv = obj as { subscription?: string | null };
      const subId = typeof inv.subscription === "string" ? inv.subscription : null;
      if (subId) {
        await supabase
          .from("user_subscriptions")
          .update({
            payment_failed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subId);
      }
    } else if (event.type === "invoice.paid") {
      const inv = obj as { subscription?: string | null };
      const subId = typeof inv.subscription === "string" ? inv.subscription : null;
      if (subId) {
        await supabase
          .from("user_subscriptions")
          .update({
            payment_failed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subId);
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error("stripe-webhook error:", err);
    return new Response(JSON.stringify({ error: "Webhook failed" }), { status: 500 });
  }
});
