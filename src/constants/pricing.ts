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
  "All plans include one-time integration and recurring monthly maintenance (monthly fees begin after the first 30 days of each subscription).";

/** Inquiry-only top tier; not a Stripe product in this checkout. */
export const INSTITUTIONAL_PLAN = {
  id: "institutionalPlan",
  name: "Institutional",
  contactOnly: true,
} as const;

/** New subscribers: setup fee + monthly after 30-day trial on the subscription. Legacy `plan_id`s stay valid in the database. */
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starterPlan",
    name: "Starter",
    integrationFee: 149,
    price: 49,
    period: "month",
    description:
      "Full platform access with one custom algo strategy (edit access), backtesting, broker/OpenAlgo integration, and basic support.",
    features: [
      "Full platform access",
      "1 custom algo strategy (edit access)",
      "Backtesting & analytics",
      "Broker / OpenAlgo integration",
      "Basic support",
    ],
  },
  {
    id: "growthPlan",
    name: "Growth",
    integrationFee: 299,
    price: 99,
    period: "month",
    description:
      "Full platform access with up to three algo strategies, advanced backtesting & analytics, broker/OpenAlgo integration, and priority support.",
    features: [
      "Full platform access",
      "Up to 3 algo strategies",
      "Advanced backtesting & analytics",
      "Broker / OpenAlgo integration",
      "Priority support",
    ],
  },
  {
    id: "professionalPlan",
    name: "Pro",
    integrationFee: 599,
    price: 199,
    period: "month",
    description:
      "Full platform access with up to 10 custom algo strategies, advanced analytics & optimization, multi-broker integration, dedicated support, and fast execution setup.",
    features: [
      "Full platform access",
      "Up to 10 custom algo strategies",
      "Advanced analytics & optimization",
      "Multi-broker integration",
      "Dedicated support",
      "Fast execution setup",
    ],
    recommended: true,
  },
];

/**
 * Display amounts for India (INR) — must match your Stripe INR Price products.
 * Adjust when you finalize Stripe INR catalog in the dashboard.
 */
export const PRICING_PLANS_INR: PricingPlan[] = [
  {
    id: "starterPlan",
    name: "Starter",
    integrationFee: 13000,
    price: 1999,
    period: "month",
    description:
      "Full platform access with one custom algo strategy (edit access), backtesting, broker/OpenAlgo integration, and basic support.",
    features: [
      "Full platform access",
      "1 custom algo strategy (edit access)",
      "Backtesting & analytics",
      "Broker / OpenAlgo integration",
      "Basic support",
    ],
  },
  {
    id: "growthPlan",
    name: "Growth",
    integrationFee: 29000,
    price: 4999,
    period: "month",
    description:
      "Full platform access with up to three algo strategies, advanced backtesting & analytics, broker/OpenAlgo integration, and priority support.",
    features: [
      "Full platform access",
      "Up to 3 algo strategies",
      "Advanced backtesting & analytics",
      "Broker / OpenAlgo integration",
      "Priority support",
    ],
  },
  {
    id: "professionalPlan",
    name: "Pro",
    integrationFee: 75000,
    price: 12999,
    period: "month",
    description:
      "Full platform access with up to 10 custom algo strategies, advanced analytics & optimization, multi-broker integration, dedicated support, and fast execution setup.",
    features: [
      "Full platform access",
      "Up to 10 custom algo strategies",
      "Advanced analytics & optimization",
      "Multi-broker integration",
      "Dedicated support",
      "Fast execution setup",
    ],
    recommended: true,
  },
];

export const WL_PRICING_PLANS = [
  { id: "wl_1_year", name: "1 Year License", price: 1999, years: 1, stripePriceId: "wl_1_year" },
  { id: "wl_2_years", name: "2 Year License", price: 2499, years: 2, stripePriceId: "wl_2_years", recommended: true },
  { id: "wl_5_years", name: "5 Year License", price: 3399, years: 5, stripePriceId: "wl_5_years", contactOnly: true },
] as const;
