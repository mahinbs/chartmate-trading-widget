export type StrategyCategory = "Intraday" | "Swing" | "Options" | "Positional";
export type StrategyRisk = "Low" | "Moderate" | "High";
export type FeeModel = "Subscription" | "Fixed" | "Profit Share";

export type StrategyPlan = {
  id: string;
  label: string;
  priceInr: number;
  billingCycle: string;
};

export type RaStrategy = {
  id: string;
  raSlug: string;
  name: string;
  category: StrategyCategory;
  risk: StrategyRisk;
  minCapitalInr: number;
  summary: string;
  feeModel: FeeModel;
  plans: StrategyPlan[];
};

export type RaListing = {
  id: string;
  slug: string;
  displayName: string;
  sebiRegNo: string;
  yearsActive: number;
  niche: string;
  trustHighlight: string;
  heroLine: string;
  bio: string;
  minTicketInr: number;
  tags: string[];
};

export const RA_LISTINGS: RaListing[] = [
  {
    id: "ra-arya-capital",
    slug: "arya-capital-advisors",
    displayName: "Arya Capital Advisors",
    sebiRegNo: "INA200012345",
    yearsActive: 7,
    niche: "Index + options risk-managed systems",
    trustHighlight: "SEBI Registered RA",
    heroLine: "Systematic index and options strategies for disciplined execution.",
    bio: "Arya Capital focuses on rule-based index and options strategies with strict max drawdown protocols and transparent review cadences.",
    minTicketInr: 100000,
    tags: ["Options", "Risk-Managed", "NIFTY"],
  },
  {
    id: "ra-bullbridge",
    slug: "bullbridge-research",
    displayName: "BullBridge Research",
    sebiRegNo: "INA300023456",
    yearsActive: 5,
    niche: "Momentum and swing advisory",
    trustHighlight: "SEBI Registered RA",
    heroLine: "Momentum-first swing strategies with clear stop-loss discipline.",
    bio: "BullBridge specializes in high-conviction swing setups and sector momentum frameworks with capital allocation templates for retail traders.",
    minTicketInr: 50000,
    tags: ["Swing", "Momentum", "Sector Rotation"],
  },
  {
    id: "ra-zenalpha",
    slug: "zenalpha-strategy-lab",
    displayName: "ZenAlpha Strategy Lab",
    sebiRegNo: "INA100045678",
    yearsActive: 9,
    niche: "Positional + portfolio overlay",
    trustHighlight: "SEBI Registered RA",
    heroLine: "Portfolio-oriented positional systems for sustainable compounding.",
    bio: "ZenAlpha builds longer-horizon strategy frameworks combining trend, valuation, and volatility overlays for balanced portfolio deployment.",
    minTicketInr: 200000,
    tags: ["Positional", "Portfolio", "Low Churn"],
  },
];

export const RA_STRATEGIES: RaStrategy[] = [
  {
    id: "strat-ic-01",
    raSlug: "arya-capital-advisors",
    name: "NIFTY Intraday Breakout Engine",
    category: "Intraday",
    risk: "Moderate",
    minCapitalInr: 100000,
    summary: "Time-window breakout strategy with strict intraday stop and no overnight carry.",
    feeModel: "Subscription",
    plans: [
      { id: "plan-ic-01-m", label: "Monthly", priceInr: 4999, billingCycle: "per month" },
      { id: "plan-ic-01-q", label: "Quarterly", priceInr: 12999, billingCycle: "every 3 months" },
    ],
  },
  {
    id: "strat-ic-02",
    raSlug: "arya-capital-advisors",
    name: "BankNIFTY Options Income Basket",
    category: "Options",
    risk: "High",
    minCapitalInr: 200000,
    summary: "Defined-risk options structures with weekly risk rebalance triggers.",
    feeModel: "Subscription",
    plans: [
      { id: "plan-ic-02-m", label: "Monthly", priceInr: 6999, billingCycle: "per month" },
      { id: "plan-ic-02-q", label: "Quarterly", priceInr: 17999, billingCycle: "every 3 months" },
    ],
  },
  {
    id: "strat-bb-01",
    raSlug: "bullbridge-research",
    name: "Sector Momentum Swing Model",
    category: "Swing",
    risk: "Moderate",
    minCapitalInr: 75000,
    summary: "Relative strength-based sector rotation with staged entries and exits.",
    feeModel: "Fixed",
    plans: [
      { id: "plan-bb-01-f", label: "One-time Access", priceInr: 14999, billingCycle: "one-time" },
    ],
  },
  {
    id: "strat-bb-02",
    raSlug: "bullbridge-research",
    name: "Earnings Surprise Positional",
    category: "Positional",
    risk: "High",
    minCapitalInr: 100000,
    summary: "Event-driven positional setups with risk bands and position sizing framework.",
    feeModel: "Profit Share",
    plans: [
      { id: "plan-bb-02-p", label: "Profit Share", priceInr: 0, billingCycle: "20% of net gains" },
    ],
  },
  {
    id: "strat-za-01",
    raSlug: "zenalpha-strategy-lab",
    name: "Portfolio Trend Regime Overlay",
    category: "Positional",
    risk: "Low",
    minCapitalInr: 300000,
    summary: "Regime-aware portfolio strategy balancing growth and capital protection.",
    feeModel: "Subscription",
    plans: [
      { id: "plan-za-01-m", label: "Monthly", priceInr: 8999, billingCycle: "per month" },
      { id: "plan-za-01-y", label: "Annual", priceInr: 89999, billingCycle: "per year" },
    ],
  },
];

export function getRaBySlug(slug: string) {
  return RA_LISTINGS.find((ra) => ra.slug === slug) ?? null;
}

export function getStrategiesByRaSlug(raSlug: string) {
  return RA_STRATEGIES.filter((strategy) => strategy.raSlug === raSlug);
}

export function getStrategyById(raSlug: string, strategyId: string) {
  return RA_STRATEGIES.find(
    (strategy) => strategy.raSlug === raSlug && strategy.id === strategyId,
  ) ?? null;
}
