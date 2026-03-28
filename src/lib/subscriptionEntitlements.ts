import type { UserSubscription } from "@/services/stripeService";
import { hasActiveSubscription } from "@/services/stripeService";

/** $49 bot / internal algo checkout plan ids — live OpenAlgo, no probability/analysis product. */
export const ALGO_ONLY_PLAN_IDS = new Set([
  "botIntegration",
  "algoTrading",
  "algoTrading_test",
  "test_1_rupee",
]);

/** $99 probability + $129 pro — full analysis, paper trade, predict flows. */
export const ANALYSIS_PLAN_IDS = new Set(["probIntelligence", "proPlan"]);

/** Live OpenAlgo, broker execution, algo onboarding, AI trading tools — Bot ($49) or Pro ($129) only; not $99 Probability. */
export function planAllowsAlgo(planId: string | null | undefined): boolean {
  if (!planId) return false;
  if (ALGO_ONLY_PLAN_IDS.has(planId)) return true;
  return planId === "proPlan";
}

export function planAllowsAnalysis(planId: string | null | undefined): boolean {
  if (!planId) return false;
  return ANALYSIS_PLAN_IDS.has(planId);
}

export function subscriptionAllowsAlgo(sub: UserSubscription | null): boolean {
  return hasActiveSubscription(sub) && planAllowsAlgo(sub.plan_id);
}

export function subscriptionAllowsAnalysis(sub: UserSubscription | null): boolean {
  return hasActiveSubscription(sub) && planAllowsAnalysis(sub.plan_id);
}

/** Active Bot ($49) or Probability ($99) — upgrades go to Pro ($129) only via billing portal. */
export function isMidTierEligibleForProOnlyUpgrade(planId: string | null | undefined): boolean {
  if (!planId || planId === "proPlan") return false;
  return (
    planId === "botIntegration" ||
    planId === "probIntelligence" ||
    ALGO_ONLY_PLAN_IDS.has(planId)
  );
}
