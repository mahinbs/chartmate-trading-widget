/**
 * Mirrors src/lib/subscriptionEntitlements.ts — plan gating for Edge Functions.
 */

const ALGO_ONLY = new Set([
  "botIntegration",
  "algoTrading",
  "algoTrading_test",
  "test_1_rupee",
]);

const LEGACY_ANALYSIS = new Set(["probIntelligence", "proPlan"]);
const NEW_MONTHLY = new Set(["starterPlan", "growthPlan", "professionalPlan", "institutionalPlan"]);

/** Bot + Pro only — not Probability ($99) legacy. */
export function planAllowsAlgo(planId: string | null | undefined): boolean {
  if (!planId) return false;
  if (NEW_MONTHLY.has(planId)) return true;
  if (ALGO_ONLY.has(planId)) return true;
  return planId === "proPlan";
}

export function planAllowsAnalysis(planId: string | null | undefined): boolean {
  if (!planId) return false;
  if (NEW_MONTHLY.has(planId)) return true;
  return LEGACY_ANALYSIS.has(planId);
}

export function stripePriceToPlanId(): Record<string, string> {
  const m: Record<string, string> = {};
  const pairs: [string | undefined, string][] = [
    [Deno.env.get("STRIPE_PRICE_STARTER"), "starterPlan"],
    [Deno.env.get("STRIPE_PRICE_GROWTH"), "growthPlan"],
    [Deno.env.get("STRIPE_PRICE_PROFESSIONAL"), "professionalPlan"],
    [Deno.env.get("STRIPE_PRICE_BOT"), "botIntegration"],
    [Deno.env.get("STRIPE_PRICE_PROB"), "probIntelligence"],
    [Deno.env.get("STRIPE_PRICE_PRO"), "proPlan"],
    [Deno.env.get("STRIPE_PRICE_TEST_1R"), "test_1_rupee"],
  ];
  for (const [price, id] of pairs) {
    if (price?.trim()) m[price.trim()] = id;
  }
  return m;
}
