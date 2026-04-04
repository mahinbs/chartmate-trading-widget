import { PRICING_PLANS, ALGO_TRADING_PLAN } from "@/constants/pricing";
import { hasActiveSubscription, type UserSubscription } from "@/services/stripeService";

const PLAN_NAMES: Record<string, string> = Object.fromEntries(
  PRICING_PLANS.map((p) => [p.id, p.name]),
);
PLAN_NAMES[ALGO_TRADING_PLAN.id] = ALGO_TRADING_PLAN.name;

const EXTRA_PLAN_LABELS: Record<string, string> = {
  algoTrading: "Algo Trading Setup",
  wl_1_year: "White Label (1 year)",
  wl_2_years: "White Label (2 years)",
  wl_5_years: "White Label (5 years)",
  test_1_rupee: "Test",
};

export function planIdToDisplayName(planId: string | null | undefined): string {
  if (!planId) return "—";
  return PLAN_NAMES[planId] ?? EXTRA_PLAN_LABELS[planId] ?? planId;
}

export function describeReferredUserSubscription(
  sub: Pick<UserSubscription, "plan_id" | "status" | "current_period_end"> | null | undefined,
): { billing: "Paid" | "Free"; planLine: string; statusRaw: string } {
  if (!sub) {
    return { billing: "Free", planLine: "—", statusRaw: "—" };
  }
  const paid = hasActiveSubscription(sub as UserSubscription);
  const name = planIdToDisplayName(sub.plan_id);
  const statusRaw = sub.status ?? "—";
  if (paid) {
    return { billing: "Paid", planLine: name, statusRaw };
  }
  if (sub.plan_id) {
    return { billing: "Free", planLine: `${name} (inactive)`, statusRaw };
  }
  return { billing: "Free", planLine: "—", statusRaw };
}
