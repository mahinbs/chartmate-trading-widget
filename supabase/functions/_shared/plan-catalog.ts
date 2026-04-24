/**
 * Server-side plan catalog for Edge Functions.
 * Mirrors src/constants/pricing.ts — keep in sync if prices change.
 */
export type PlanMeta = {
  planId: string;
  name: string;
  /** One-time setup fee (same unit as catalog — USD in UI). */
  integrationFee: number;
  /** Recurring / month (USD in UI for global users). */
  monthlyPrice: number;
  /** Optional: Stripe INR one-time (rupees) for Indian checkouts. */
  integrationFeeInr?: number;
  /** Optional: monthly in rupees. */
  monthlyPriceInr?: number;
  monthlyPriceEnvKey: string;
  setupPriceEnvKey: string;
  monthlyPriceEnvKeyInr: string;
  setupPriceEnvKeyInr: string;
};

export const PLAN_CATALOG: PlanMeta[] = [
  {
    planId: "starterPlan",
    name: "Starter",
    integrationFee: 149,
    monthlyPrice: 49,
    integrationFeeInr: 13000,
    monthlyPriceInr: 1999,
    monthlyPriceEnvKey: "STRIPE_PRICE_STARTER",
    setupPriceEnvKey: "STRIPE_PRICE_STARTER_SETUP",
    monthlyPriceEnvKeyInr: "STRIPE_PRICE_STARTER_INR",
    setupPriceEnvKeyInr: "STRIPE_PRICE_STARTER_SETUP_INR",
  },
  {
    planId: "growthPlan",
    name: "Growth",
    integrationFee: 299,
    monthlyPrice: 99,
    integrationFeeInr: 29000,
    monthlyPriceInr: 4999,
    monthlyPriceEnvKey: "STRIPE_PRICE_GROWTH",
    setupPriceEnvKey: "STRIPE_PRICE_GROWTH_SETUP",
    monthlyPriceEnvKeyInr: "STRIPE_PRICE_GROWTH_INR",
    setupPriceEnvKeyInr: "STRIPE_PRICE_GROWTH_SETUP_INR",
  },
  {
    planId: "professionalPlan",
    name: "Pro",
    integrationFee: 599,
    monthlyPrice: 199,
    integrationFeeInr: 75000,
    monthlyPriceInr: 12999,
    monthlyPriceEnvKey: "STRIPE_PRICE_PROFESSIONAL",
    setupPriceEnvKey: "STRIPE_PRICE_PROFESSIONAL_SETUP",
    monthlyPriceEnvKeyInr: "STRIPE_PRICE_PROFESSIONAL_INR",
    setupPriceEnvKeyInr: "STRIPE_PRICE_PROFESSIONAL_SETUP_INR",
  },
];

export function getPlanMeta(planId: string | null | undefined): PlanMeta | undefined {
  if (!planId) return undefined;
  return PLAN_CATALOG.find((p) => p.planId === planId);
}

export function planTier(planId: string | null | undefined): number {
  const idx = PLAN_CATALOG.findIndex((p) => p.planId === planId);
  return idx;
}

/** `currency`: `usd` (default) or `inr` — which Stripe price env keys to use. */
export function resolveMonthlyPriceId(planId: string, currency: "usd" | "inr" = "usd"): string {
  const meta = getPlanMeta(planId);
  if (!meta) return "";
  if (currency === "inr" && meta.monthlyPriceEnvKeyInr) {
    return Deno.env.get(meta.monthlyPriceEnvKeyInr)?.trim() ?? "";
  }
  return Deno.env.get(meta.monthlyPriceEnvKey)?.trim() ?? "";
}

export function resolveSetupPriceId(planId: string, currency: "usd" | "inr" = "usd"): string {
  const meta = getPlanMeta(planId);
  if (!meta) return "";
  if (currency === "inr" && meta.setupPriceEnvKeyInr) {
    return Deno.env.get(meta.setupPriceEnvKeyInr)?.trim() ?? "";
  }
  return Deno.env.get(meta.setupPriceEnvKey)?.trim() ?? "";
}

/** Major currency units: USD or INR — matches `integration_fee_paid` & Stripe proration for that subscription. */
export function planIntegrationAmount(meta: PlanMeta, currency: "usd" | "inr"): number {
  if (currency === "inr") return meta.integrationFeeInr ?? meta.integrationFee;
  return meta.integrationFee;
}

export function planMonthlyAmount(meta: PlanMeta, currency: "usd" | "inr"): number {
  if (currency === "inr") return meta.monthlyPriceInr ?? meta.monthlyPrice;
  return meta.monthlyPrice;
}
