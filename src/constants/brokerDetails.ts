// =====================================================================
// Broker integration detail content (powers /supported-brokers/:slug)
// =====================================================================
// Structured, broker-specific algo-trading integration guides for the
// brokers that have a dedicated detail page. Keyed by slug; the slug is
// referenced from SUPPORTED_BROKERS[].detailSlug.
// =====================================================================

export interface BrokerRequirement {
  requirement: string;
  details: string;
}

export interface BrokerMethod {
  title: string;
  points: string[];
}

export interface BrokerDetail {
  slug: string;
  name: string;
  domain: string;
  color: string;
  website: string;
  tagline: string;
  intro: string;
  platforms: string[];
  automations: string[];
  requirements: BrokerRequirement[];
  methods: BrokerMethod[];
  infoRequired: string[];
}

export const BROKER_DETAILS: Record<string, BrokerDetail> = {
  exness: {
    slug: "exness",
    name: "Exness",
    domain: "exness.com",
    color: "#ffe600",
    website: "https://www.exness.com",
    tagline: "Algo trading with Exness via MT4, MT5 & Python",
    intro:
      "Connect your trading bot, strategy engine, AI signals or TradingView alerts to Exness. Exness supports algorithmic trading mainly through MetaTrader 4 (MT4) and MetaTrader 5 (MT5), with Expert Advisors and a Python + MT5 bridge for advanced strategies.",
    platforms: [
      "MetaTrader 4 (MT4)",
      "MetaTrader 5 (MT5)",
      "Web Terminal",
      "Exness Terminal",
      "Expert Advisors (EA)",
      "Automated Trading Bots",
      "Python + MT5 Integration",
    ],
    automations: [
      "Buy Orders",
      "Sell Orders",
      "Stop Loss Management",
      "Take Profit Management",
      "Trailing Stops",
      "Position Monitoring",
      "Multi-Account Trading",
      "Signal Copying",
      "AI-Based Trading Strategies",
      "TradingView Alert Execution",
    ],
    requirements: [
      { requirement: "Broker Account", details: "Active Exness Trading Account" },
      { requirement: "Trading Platform", details: "MT4 or MT5" },
      { requirement: "Login ID", details: "MT4/MT5 Account Number" },
      { requirement: "Password", details: "Trading Password" },
      { requirement: "Server", details: "Exness Live/Demo Server" },
      { requirement: "VPS (Recommended)", details: "For 24/7 Execution" },
      { requirement: "Bot/EA", details: "MQL4, MQL5, Python or API-Based" },
      { requirement: "Internet", details: "Stable Low-Latency Connection" },
    ],
    methods: [
      {
        title: "Method 1 — MT4 Expert Advisor",
        points: ["Custom EA installed inside MT4", "Fast execution", "Most common method"],
      },
      {
        title: "Method 2 — MT5 Expert Advisor",
        points: ["Advanced automation", "More order types", "Better backtesting capabilities"],
      },
      {
        title: "Method 3 — Python + MT5",
        points: ["AI models", "Machine learning", "External signal engines", "Database integration"],
      },
      {
        title: "Method 4 — TradingView Alerts",
        points: ["TradingView Signal → Webhook → Bot Server → MT5 → Exness Account"],
      },
    ],
    infoRequired: [
      "MT4/MT5 Account Number",
      "Trading Server Name",
      "Investor Password (Read Only) or Trading Password",
      "Account Type (Demo / Live)",
    ],
  },

  vantage: {
    slug: "vantage",
    name: "Vantage Markets",
    domain: "vantagemarkets.com",
    color: "#009b3a",
    website: "https://www.vantagemarkets.com",
    tagline: "Algo trading with Vantage via MT4, MT5 & API Solutions",
    intro:
      "Connect your trading bot, strategy engine, AI signals or TradingView alerts to Vantage Markets. Vantage supports algorithmic trading through MetaTrader 4 (MT4), MetaTrader 5 (MT5), TradingView and dedicated API Solutions for SaaS and copy-trading platforms.",
    platforms: [
      "MT4",
      "MT5",
      "TradingView",
      "ProTrader",
      "Web Trading",
      "Expert Advisors (EA)",
      "API Solutions",
    ],
    automations: [
      "Forex Bots",
      "Gold Trading Bots",
      "Indices Trading Bots",
      "Scalping Systems",
      "Hedging Strategies",
      "Copy Trading Systems",
      "Signal Execution Systems",
      "TradingView Automation",
      "High Frequency Strategies (within broker limits)",
    ],
    requirements: [
      { requirement: "Broker Account", details: "Active Vantage Account" },
      { requirement: "Trading Platform", details: "MT4 or MT5" },
      { requirement: "Login Credentials", details: "MT4/MT5 Login" },
      { requirement: "Trading Server", details: "Vantage Live/Demo" },
      { requirement: "VPS", details: "Recommended" },
      { requirement: "Trading Bot", details: "EA / Python / TradingView" },
      { requirement: "API Access", details: "Available through API Solutions" },
    ],
    methods: [
      {
        title: "Method 1 — MT4 EA",
        points: ["Forex Scalping", "Grid Systems", "Martingale Systems"],
      },
      {
        title: "Method 2 — MT5 EA",
        points: ["Multi-Asset Trading", "Advanced Algorithms", "Portfolio Strategies"],
      },
      {
        title: "Method 3 — TradingView Webhooks",
        points: ["TradingView Strategy → Webhook → Bot → MT4/MT5 → Vantage Account"],
      },
      {
        title: "Method 4 — Direct API Solutions",
        points: ["SaaS Platforms", "Copy Trading Systems", "Fund Management Platforms", "Institutional Trading Tools"],
      },
    ],
    infoRequired: [
      "MT4/MT5 Account Number",
      "Trading Server",
      "Trading Password",
      "Account Type",
      "VPS Details (Optional)",
    ],
  },
};

export interface ComparisonRow {
  feature: string;
  exness: string;
  vantage: string;
}

/** Shown on every detail page to compare the two MetaTrader brokers. */
export const BROKER_COMPARISON: ComparisonRow[] = [
  { feature: "MT4 Support", exness: "Yes", vantage: "Yes" },
  { feature: "MT5 Support", exness: "Yes", vantage: "Yes" },
  { feature: "Expert Advisors", exness: "Yes", vantage: "Yes" },
  { feature: "TradingView Integration", exness: "Yes", vantage: "Yes" },
  { feature: "Python Integration", exness: "Yes", vantage: "Yes" },
  { feature: "VPS Friendly", exness: "Yes", vantage: "Yes" },
  { feature: "API Solutions", exness: "Limited / Advanced Setup", vantage: "Dedicated API Solutions" },
  { feature: "Copy Trading", exness: "Yes", vantage: "Yes" },
  { feature: "Scalping Support", exness: "Yes", vantage: "Yes" },
  { feature: "Hedging Support", exness: "Yes", vantage: "Yes" },
  { feature: "Multi Asset Trading", exness: "Yes", vantage: "Strong MT5 Support" },
];

/** Generic execution flow, shown on every detail page. */
export const EXECUTION_FLOW: string[] = [
  "User Creates Strategy",
  "Signal Generated",
  "Webhook / API Trigger",
  "Execution Engine",
  "MT4 / MT5 Connection",
  "Broker Account",
  "Order Executed",
];

export interface ArchitectureTier {
  tier: string;
  flow: string;
}

export const RECOMMENDED_ARCHITECTURE: ArchitectureTier[] = [
  { tier: "Beginner Users", flow: "TradingView Alerts → Webhook → MT5 Bridge → Broker" },
  { tier: "Advanced Users", flow: "Strategy Builder → Python Engine → MT5 API → Broker" },
  { tier: "Professional Users", flow: "AI Strategy → Risk Engine → Trade Executor → Multiple Broker Accounts" },
];

export const getBrokerDetail = (slug?: string): BrokerDetail | undefined =>
  slug ? BROKER_DETAILS[slug.toLowerCase()] : undefined;
