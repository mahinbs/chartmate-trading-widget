/** Mirrors src/lib/algoStrategyLimits.ts for Edge Functions. */

export const UNLIMITED_CUSTOM_STRATEGIES = -1;

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
    case "institutionalPlan":
      return { maxCustomStrategies: UNLIMITED_CUSTOM_STRATEGIES, allowDeleteStrategies: true };
    default:
      return null;
  }
}
