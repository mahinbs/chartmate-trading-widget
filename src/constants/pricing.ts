export type PricingPlan = {
  id: string;
  name: string;
  /** Monthly recurring amount (charged after the first 30 days). */
  price: number;
  period: string;
  /** One-time integration / setup fee (charged at checkout with the subscription). */
  integrationFee: number;
  description: string;
  features: string[];
  recommended?: boolean;
};

/** Shown under pricing cards. */
export const PRICING_SETUP_AND_MONTHLY_NOTE =
  "One Algo Platform plan: live deployment, broker integration, and automation. Integration fee + monthly maintenance (monthly fees begin after the first 30 days).";

/** Inquiry-only top tier; not a Stripe product in this checkout. */
export const INSTITUTIONAL_PLAN = {
  id: "institutionalPlan",
  name: "Institutional",
  contactOnly: true,
} as const;

/**
 * Public catalog: single Algo Platform SKU (Stripe `plan_id` = professionalPlan).
 * Legacy `starterPlan` / `growthPlan` rows may still exist in the database until migrated.
 */
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "professionalPlan",
    name: "Algo Platform",
    integrationFee: 599,
    price: 199,
    period: "month",
    description:
      "Live deployment, broker integration, and automation — one clear plan for executing verified strategies in real markets.",
    features: [
      "Live strategy deployment",
      "Broker connectivity & encrypted API vault",
      "Hands-off automation & execution guardrails",
      "Multi-account monitoring & Telegram alerts",
      "Platform access for validation workflows",
      "Engineer-assisted go-live (~72 h typical)",
    ],
    recommended: true,
  },
];

/**
 * Display amounts for India (INR) — must match your Stripe INR Price products.
 */
export const PRICING_PLANS_INR: PricingPlan[] = [
  {
    id: "professionalPlan",
    name: "Algo Platform",
    integrationFee: 75000,
    price: 12999,
    period: "month",
    description:
      "Live deployment, broker integration, and automation — one clear plan for executing verified strategies in real markets.",
    features: [
      "Live strategy deployment",
      "Broker connectivity & encrypted API vault",
      "Hands-off automation & execution guardrails",
      "Multi-account monitoring & Telegram alerts",
      "Platform access for validation workflows",
      "Engineer-assisted go-live (~72 h typical)",
    ],
    recommended: true,
  },
];

export const WL_PRICING_PLANS = [
  { id: "wl_1_year", name: "1 Year License", price: 1999, years: 1, stripePriceId: "wl_1_year" },
  { id: "wl_2_years", name: "2 Year License", price: 2499, years: 2, stripePriceId: "wl_2_years", recommended: true },
  { id: "wl_5_years", name: "5 Year License", price: 3399, years: 5, stripePriceId: "wl_5_years", contactOnly: true },
] as const;
