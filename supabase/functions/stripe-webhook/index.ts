/**
 * stripe-webhook — Supabase Edge Function
 * Handles Stripe webhooks: checkout.session.completed, customer.subscription.updated/deleted.
 * Env: STRIPE_WEBHOOK_SECRET
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
      };
      const custId   = session.customer as string | undefined;
      const subId    = session.subscription as string | undefined;
      const wlToken  = meta.wl_token as string | undefined;

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

      const dbStatus =
        status === "active" || status === "trialing"
          ? status
          : status === "past_due"
            ? "past_due"
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
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error("stripe-webhook error:", err);
    return new Response(JSON.stringify({ error: "Webhook failed" }), { status: 500 });
  }
});
