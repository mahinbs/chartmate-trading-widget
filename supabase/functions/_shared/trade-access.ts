import { planAllowsAlgo } from "./subscription-plans.ts";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};

export interface TradeAccessContext {
  /** Paid subscription row is active (any legacy plan). */
  hasActiveSubscription: boolean;
  /** Includes bot ($49) or analysis tiers that also get OpenAlgo. */
  hasAlgoEntitlement: boolean;
  onboardingStatus: string | null;
  hasProvisionedOnboarding: boolean;
  hasActiveIntegration: boolean;
  integration: {
    id: string;
    broker: string | null;
    strategy_name: string | null;
    openalgo_api_key: string | null;
    is_active: boolean | null;
  } | null;
}

export async function resolveTradeAccess(
  supabase: SupabaseLike,
  userId: string,
): Promise<TradeAccessContext> {
  const [{ data: sub }, { data: onboarding }, { data: integration }] = await Promise.all([
    supabase
      .from("user_subscriptions")
      .select("status, current_period_end, plan_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("algo_onboarding")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_trading_integration")
      .select("id, broker, strategy_name, openalgo_api_key, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const endMs = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : null;
  const graceEndMs = endMs != null ? endMs + (24 * 60 * 60 * 1000) : null;
  const hasActiveSubscription = Boolean(
    sub &&
      (sub.status === "active" || sub.status === "trialing") &&
      (graceEndMs == null || graceEndMs > Date.now()),
  );
  const planId = (sub?.plan_id as string | null) ?? null;
  const hasAlgoEntitlement = hasActiveSubscription && planAllowsAlgo(planId);
  const onboardingStatus = (onboarding?.status as string | null) ?? null;
  const hasProvisionedOnboarding = onboardingStatus === "provisioned" || onboardingStatus === "active";
  const hasActiveIntegration = Boolean(integration && integration.is_active);

  return {
    hasActiveSubscription,
    hasAlgoEntitlement,
    onboardingStatus,
    hasProvisionedOnboarding,
    hasActiveIntegration,
    integration: integration
      ? {
          id: integration.id as string,
          broker: (integration.broker as string | null) ?? null,
          strategy_name: (integration.strategy_name as string | null) ?? null,
          openalgo_api_key: (integration.openalgo_api_key as string | null) ?? null,
          is_active: (integration.is_active as boolean | null) ?? null,
        }
      : null,
  };
}
