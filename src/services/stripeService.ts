import { supabase } from "@/integrations/supabase/client";

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end?: boolean | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  /** Set by stripe-webhook on invoice.payment_failed; cleared on invoice.paid */
  payment_failed_at?: string | null;
}

export async function createCheckoutSession(params: {
  plan_id: string;
  type?: "premium" | "whitelabel";
  success_url?: string;
  cancel_url?: string;
  wl?: { brand_name?: string; slug?: string; token?: string };
}): Promise<{ url: string } | { error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: "Please sign in to continue" };
  }

  const res = await supabase.functions.invoke("create-checkout-session", {
    body: {
      plan_id: params.plan_id,
      type: params.type ?? "premium",
      success_url: params.success_url,
      cancel_url: params.cancel_url,
      wl: params.wl,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const data = res.data as { url?: string; error?: string } | null;
  const errMsg = data?.error ?? res.error?.message ?? "Failed to create checkout";
  if (res.error || data?.error) return { error: errMsg };
  if (!data?.url) return { error: "No checkout URL returned" };
  return { url: data.url };
}

export async function createBillingPortalSession(return_url?: string): Promise<
  { url: string } | { error: string }
> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: "Please sign in to continue" };
  }

  const res = await supabase.functions.invoke("create-customer-portal-session", {
    body: {
      return_url: return_url ?? `${window.location.origin}/subscription`,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const data = res.data as { url?: string; error?: string } | null;
  const errMsg = data?.error ?? res.error?.message ?? "Failed to open billing portal";
  if (res.error || data?.error) return { error: errMsg };
  if (!data?.url) return { error: "No portal URL returned" };
  return { url: data.url };
}

export async function getSubscription(): Promise<UserSubscription | null> {
  // Resolve the current user explicitly so the query always has a user_id filter,
  // avoiding timing edge-cases where auth.uid() isn't yet set in the RLS context.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;

  const { data, error } = await (supabase as any)
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserSubscription;
}

export function hasActiveSubscription(sub: UserSubscription | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  // Keep OpenAlgo access for a 24h grace window after expiry.
  if (sub.current_period_end) {
    const graceEndMs = new Date(sub.current_period_end).getTime() + (24 * 60 * 60 * 1000);
    if (graceEndMs < Date.now()) return false;
  }
  return true;
}
