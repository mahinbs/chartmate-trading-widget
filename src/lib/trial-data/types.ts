export type TrialBrokerSlug =
  | "zerodha"
  | "binance"
  | "exness"
  | "mt4-mt5"
  | "robinhood";

export type TrialOrderSide = "buy" | "sell";
export type TrialOrderStatus = "filled" | "rejected" | "pending";
export type TrialStrategyStatus = "active" | "paused";
export type TrialStrategyStage = 1 | 2 | 3 | 4;
export type TrialAssetClass = "equity" | "crypto" | "forex" | "cfd" | "option";

export interface TrialBrokerProfile {
  slug: TrialBrokerSlug;
  displayName: string;
  accountLabel: string;
  timezone: string;
  currency: string;
  marketLabel: string;
  marketOpen: boolean;
  websocketLabel: string;
  alertsCount: number;
  supportsOptions: boolean;
}

export interface TrialPosition {
  id: string;
  symbol: string;
  assetClass: TrialAssetClass;
  quantity: number;
  averagePrice: number;
  ltp: number;
}

export interface TrialOrderRecord {
  id: string;
  symbol: string;
  strategyId: string;
  side: TrialOrderSide;
  quantity: number;
  price: number;
  filledPrice: number;
  pnl: number;
  status: TrialOrderStatus;
  timestampIso: string;
}

export interface TrialStrategyRecord {
  id: string;
  name: string;
  status: TrialStrategyStatus;
  stage: TrialStrategyStage;
  trades: number;
  pnl: number;
  winRate: number;
  symbols: string[];
  timeframe: string;
  riskPerTradePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  deployed: boolean;
}

export interface TrialExecutionRecord {
  id: string;
  strategyId: string;
  symbol: string;
  entryTimeIso: string;
  exitTimeIso: string;
  resultPct: number;
}

export interface TrialOptionsStrategy {
  id: string;
  name: string;
  style: string;
  strike: string;
  expiry: string;
  stopLoss: string;
  takeProfit: string;
  status: "paper" | "live";
}

export interface TrialOptionsPosition {
  symbol: string;
  entry: number;
  current: number;
  pnlPct: number;
  dteLabel: string;
}

export interface TrialLogRecord {
  id: string;
  type: "info" | "exec" | "warn" | "error";
  message: string;
  timestampIso: string;
  source: "strategy" | "broker" | "risk" | "system";
  strategyId?: string;
  orderId?: string;
}

export interface TrialEquityPoint {
  timestampIso: string;
  value: number;
}

export interface TrialBaseDataset {
  profile: TrialBrokerProfile;
  cashBalance: number;
  positions: TrialPosition[];
  strategies: TrialStrategyRecord[];
  orders: TrialOrderRecord[];
  executions: TrialExecutionRecord[];
  logs: TrialLogRecord[];
  equityCurve: TrialEquityPoint[];
  optionsStrategies: TrialOptionsStrategy[];
  optionsPositions: TrialOptionsPosition[];
}

export interface TrialDerivedMetrics {
  portfolioValue: number;
  dailyPnl: number;
  cumulativePnl: number;
  winRate: number;
  sharpeLike: number;
  maxDrawdownPct: number;
  activePositions: number;
  avgTradeDurationMin: number;
  exposurePct: number;
  latencyMs: number;
  riskScore: number;
  ordersPerSecond: number;
  strategiesRunning: number;
  completedExecutions: number;
}

export interface TrialDashboardDataset {
  base: TrialBaseDataset;
  derived: TrialDerivedMetrics;
}

export interface TrialTimelineFrame {
  orders: TrialOrderRecord[];
  logs: TrialLogRecord[];
}
