/**
 * Mirrors src/lib/subscriptionEntitlements.ts — plan gating for Edge Functions.
 */

const ALGO_ONLY = new Set([
  "botIntegration",
  "algoTrading",
  "algoTrading_test",
  "test_1_rupee",
]);

const ANALYSIS = new Set(["probIntelligence", "proPlan"]);

/** Bot + Pro only — not Probability ($99). */
export function planAllowsAlgo(planId: string | null | undefined): boolean {
  if (!planId) return false;
  if (ALGO_ONLY.has(planId)) return true;
  return planId === "proPlan";
}

export function planAllowsAnalysis(planId: string | null | undefined): boolean {
  if (!planId) return false;
  return ANALYSIS.has(planId);
}

export function stripePriceToPlanId(): Record<string, string> {
  const bot = Deno.env.get("STRIPE_PRICE_BOT") ?? "";
  const prob = Deno.env.get("STRIPE_PRICE_PROB") ?? "";
  const pro = Deno.env.get("STRIPE_PRICE_PRO") ?? "";
  const m: Record<string, string> = {};
  if (bot) m[bot] = "botIntegration";
  if (prob) m[prob] = "probIntelligence";
  if (pro) m[pro] = "proPlan";
  return m;
}
