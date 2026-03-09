export type PricingPlan = {
    id: string;
    name: string;
    price: number;
    period: string;
    description: string;
    features: string[];
    recommended?: boolean;
};

export const PRICING_PLANS: PricingPlan[] = [
    {
        id: "botIntegration",
        name: "AI Auto Trading Bot Integration",
        price: 49,
        period: "year",
        description: "Best for: Traders who want fully automated trading execution",
        features: [
            "Connect AI trading bot with your broker",
            "Automated trade execution",
            "Strategy-based bot integration",
            "Compatible with multiple trading platforms",
            "Easy setup and monitoring dashboard",
            "Risk control settings",
        ],
    },
    {
        id: "probIntelligence",
        name: "Probability-Based Trading Intelligence",
        price: 99,
        period: "year",
        description:
            "Best for: Traders who want AI-driven decision support before placing trades",
        features: [
            "AI probability analysis for trades",
            "Market pattern detection",
            "Strategy backtesting insights",
            "Trade success probability scoring",
            "Risk vs reward analysis",
            "Paper trading simulation",
        ],
    },
    {
        id: "proPlan",
        name: "Pro Plan",
        price: 129,
        period: "year",
        description:
            "Includes all features from the Bot Integration and Probability Analysis tiers.",
        features: [
            "AI Trading Bot Integration",
            "Probability Analysis Software",
            "Paper trading",
            "Strategy analytics dashboard",
            "Priority support",
        ],
        recommended: true,
    },
];
