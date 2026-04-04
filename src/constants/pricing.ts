export type PricingPlan = {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  recommended?: boolean;
};

/**
 * Premium software plans shown on /pricing and in upgrade dialogs.
 * Empty until you add new Stripe products (e.g. monthly) and wire each `id` to a price in
 * `supabase/functions/create-checkout-session/index.ts` + Supabase secrets.
 */
export const PRICING_PLANS: PricingPlan[] = [];

export const WL_PRICING_PLANS = [
  { id: "wl_1_year", name: "1 Year License", price: 1999, years: 1, stripePriceId: "wl_1_year" },
  { id: "wl_2_years", name: "2 Year License", price: 2499, years: 2, stripePriceId: "wl_2_years", recommended: true },
  { id: "wl_5_years", name: "5 Year License", price: 3399, years: 5, stripePriceId: "wl_5_years", contactOnly: true },
] as const;
