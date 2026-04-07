/**
 * Server-side plan catalog for Edge Functions.
 * Mirrors src/constants/pricing.ts — keep in sync if prices change.
 *
 * integrationFee: one-time setup fee (USD)
 * monthlyPrice:   recurring amount per month (USD)
 */

export type PlanMeta = {
  planId: string;
  name: string;
  integrationFee: number;
  monthlyPrice: number;
  /** Stripe recurring Price ID (env-resolved at call-time). */
  monthlyPriceEnvKey: string;
  /** Stripe one-time setup Price ID (env-resolved at call-time). */
  setupPriceEnvKey: string;
};

export const PLAN_CATALOG: PlanMeta[] = [
  {
    planId: "starterPlan",
    name: "Starter",
    integrationFee: 149,
    monthlyPrice: 49,
    monthlyPriceEnvKey: "STRIPE_PRICE_STARTER",
    setupPriceEnvKey: "STRIPE_PRICE_STARTER_SETUP",
  },
  {
    planId: "growthPlan",
    name: "Growth",
    integrationFee: 249,
    monthlyPrice: 79,
    monthlyPriceEnvKey: "STRIPE_PRICE_GROWTH",
    setupPriceEnvKey: "STRIPE_PRICE_GROWTH_SETUP",
  },
  {
    planId: "professionalPlan",
    name: "Pro",
    integrationFee: 399,
    monthlyPrice: 129,
    monthlyPriceEnvKey: "STRIPE_PRICE_PROFESSIONAL",
    setupPriceEnvKey: "STRIPE_PRICE_PROFESSIONAL_SETUP",
  },
];

/** Lookup by planId — returns undefined for legacy/unknown plans. */
export function getPlanMeta(planId: string | null | undefined): PlanMeta | undefined {
  if (!planId) return undefined;
  return PLAN_CATALOG.find((p) => p.planId === planId);
}

/** Tier rank: higher number = higher plan. Returns -1 for unknown plans. */
export function planTier(planId: string | null | undefined): number {
  const idx = PLAN_CATALOG.findIndex((p) => p.planId === planId);
  return idx; // -1 if not found, 0 = Starter, 1 = Growth, 2 = Pro
}

/** Resolve the Stripe Price ID from env at call-time. */
export function resolveMonthlyPriceId(planId: string): string {
  const meta = getPlanMeta(planId);
  if (!meta) return "";
  return Deno.env.get(meta.monthlyPriceEnvKey)?.trim() ?? "";
}

export function resolveSetupPriceId(planId: string): string {
  const meta = getPlanMeta(planId);
  if (!meta) return "";
  return Deno.env.get(meta.setupPriceEnvKey)?.trim() ?? "";
}
