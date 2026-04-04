export type PricingPlan = {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  recommended?: boolean;
};

/** New subscribers: three monthly tiers. Legacy `plan_id`s stay valid in the database. */
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starterPlan",
    name: "Starter",
    price: 49,
    period: "month",
    description: "Full platform access with one custom algo strategy (edit only; no delete).",
    features: [
      "Everything locked for free users — unlocked",
      "AI analysis, paper trading, and predict flows",
      "Live OpenAlgo and broker execution",
      "1 custom algo strategy (edit only; replace by contacting support if needed)",
    ],
  },
  {
    id: "growthPlan",
    name: "Growth",
    price: 99,
    period: "month",
    description: "Full platform access with up to three custom strategies (edit only).",
    features: [
      "Everything in Starter",
      "Up to 3 custom algo strategies (edit only; no delete)",
      "Priority-friendly usage for active traders",
    ],
    recommended: true,
  },
  {
    id: "professionalPlan",
    name: "Professional",
    price: 199,
    period: "month",
    description: "Full platform access with up to ten strategies; create and delete freely.",
    features: [
      "Everything in Growth",
      "Up to 10 custom algo strategies",
      "Create, edit, and delete strategies anytime",
    ],
  },
];

export const WL_PRICING_PLANS = [
  { id: "wl_1_year", name: "1 Year License", price: 1999, years: 1, stripePriceId: "wl_1_year" },
  { id: "wl_2_years", name: "2 Year License", price: 2499, years: 2, stripePriceId: "wl_2_years", recommended: true },
  { id: "wl_5_years", name: "5 Year License", price: 3399, years: 5, stripePriceId: "wl_5_years", contactOnly: true },
] as const;
