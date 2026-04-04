/**
 * Custom algo strategy quotas by subscription plan_id.
 * Legacy plan_ids remain for existing subscribers; new checkout uses starter/growth/professional.
 */

export type AlgoStrategyLimits = {
  maxCustomStrategies: number;
  allowDeleteStrategies: boolean;
};

export function getAlgoStrategyLimits(planId: string | null | undefined): AlgoStrategyLimits | null {
  if (!planId) return null;
  switch (planId) {
    case "starterPlan":
    case "botIntegration":
    case "algoTrading":
    case "algoTrading_test":
    case "test_1_rupee":
      return { maxCustomStrategies: 1, allowDeleteStrategies: false };
    case "growthPlan":
    case "probIntelligence":
      return { maxCustomStrategies: 3, allowDeleteStrategies: false };
    case "professionalPlan":
    case "proPlan":
      return { maxCustomStrategies: 10, allowDeleteStrategies: true };
    default:
      return null;
  }
}
