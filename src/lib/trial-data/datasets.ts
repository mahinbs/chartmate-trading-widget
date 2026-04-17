import { buildTrialDashboardDataset } from "@/lib/trial-data/metrics";
import type {
  TrialBaseDataset,
  TrialBrokerProfile,
  TrialBrokerSlug,
  TrialDashboardDataset,
  TrialExecutionRecord,
  TrialLogRecord,
  TrialOptionsPosition,
  TrialOptionsStrategy,
  TrialOrderRecord,
  TrialPosition,
  TrialStrategyRecord,
} from "@/lib/trial-data/types";

type BrokerSeedConfig = {
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
  symbols: string[];
  assetClass: TrialPosition["assetClass"];
  baseLtp: number;
  optionsUnderlyings: string[];
};

const BROKER_CONFIGS: Record<TrialBrokerSlug, BrokerSeedConfig> = {
  zerodha: {
    slug: "zerodha",
    displayName: "Zerodha",
    accountLabel: "Zerodha Kite · Individual",
    timezone: "Asia/Kolkata",
    currency: "INR",
    marketLabel: "NSE/BSE Cash + F&O Session",
    marketOpen: true,
    websocketLabel: "Kite Ticker connected",
    alertsCount: 2,
    supportsOptions: true,
    symbols: ["RELIANCE", "INFY", "HDFCBANK", "TCS", "SBIN", "ITC"],
    assetClass: "equity",
    baseLtp: 2280,
    optionsUnderlyings: ["NIFTY", "BANKNIFTY"],
  },
  binance: {
    slug: "binance",
    displayName: "Binance",
    accountLabel: "Binance Spot+Futures",
    timezone: "UTC",
    currency: "USDT",
    marketLabel: "Crypto 24/7 Session",
    marketOpen: true,
    websocketLabel: "Binance stream online",
    alertsCount: 1,
    supportsOptions: false,
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "AVAXUSDT"],
    assetClass: "crypto",
    baseLtp: 64000,
    optionsUnderlyings: [],
  },
  exness: {
    slug: "exness",
    displayName: "Exness",
    accountLabel: "Exness MT5 Pro",
    timezone: "Etc/UTC",
    currency: "USD",
    marketLabel: "FX/CFD Session Window",
    marketOpen: true,
    websocketLabel: "Exness quote stream active",
    alertsCount: 3,
    supportsOptions: false,
    symbols: ["XAUUSD", "EURUSD", "GBPUSD", "US30", "NAS100", "USOIL"],
    assetClass: "cfd",
    baseLtp: 1.09,
    optionsUnderlyings: [],
  },
  "mt4-mt5": {
    slug: "mt4-mt5",
    displayName: "MT4/MT5",
    accountLabel: "MetaTrader Multi-Asset",
    timezone: "Etc/UTC",
    currency: "USD",
    marketLabel: "Terminal Session",
    marketOpen: true,
    websocketLabel: "Terminal bridge synced",
    alertsCount: 2,
    supportsOptions: false,
    symbols: ["EURUSD", "USDJPY", "GBPJPY", "XAUUSD", "DE40", "US500"],
    assetClass: "forex",
    baseLtp: 1.11,
    optionsUnderlyings: [],
  },
  robinhood: {
    slug: "robinhood",
    displayName: "Robinhood",
    accountLabel: "Robinhood Brokerage",
    timezone: "America/New_York",
    currency: "USD",
    marketLabel: "US Equities Session",
    marketOpen: true,
    websocketLabel: "Broker stream connected",
    alertsCount: 2,
    supportsOptions: true,
    symbols: ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "META"],
    assetClass: "equity",
    baseLtp: 192,
    optionsUnderlyings: ["SPY", "QQQ"],
  },
};

function isoAt(base: string, minuteOffset: number): string {
  return new Date(Date.parse(base) + minuteOffset * 60_000).toISOString();
}

function makeProfile(cfg: BrokerSeedConfig): TrialBrokerProfile {
  return {
    slug: cfg.slug,
    displayName: cfg.displayName,
    accountLabel: cfg.accountLabel,
    timezone: cfg.timezone,
    currency: cfg.currency,
    marketLabel: cfg.marketLabel,
    marketOpen: cfg.marketOpen,
    websocketLabel: cfg.websocketLabel,
    alertsCount: cfg.alertsCount,
    supportsOptions: cfg.supportsOptions,
  };
}

function makeStrategies(cfg: BrokerSeedConfig): TrialStrategyRecord[] {
  const names = [
    "Momentum Alpha",
    "Mean Reversion X",
    "Breakout Ladder",
    "Volatility Guard",
    "Session Scalper",
  ];
  return names.map((name, i) => ({
    id: `st-${cfg.slug}-${i + 1}`,
    name,
    status: i === 4 ? "paused" : "active",
    stage: (Math.min(4, (i % 4) + 1) as 1 | 2 | 3 | 4),
    trades: 48 + i * 19,
    pnl: 1800 - i * 310,
    winRate: 71 - i * 4,
    symbols: [cfg.symbols[i % cfg.symbols.length]],
    timeframe: i % 2 === 0 ? "5m" : "15m",
    riskPerTradePct: 0.8 + i * 0.2,
    stopLossPct: 0.6 + i * 0.15,
    takeProfitPct: 1.2 + i * 0.3,
    maxPositions: 2 + i,
    deployed: i !== 4,
  }));
}

function makePositions(cfg: BrokerSeedConfig): TrialPosition[] {
  return cfg.symbols.slice(0, 4).map((symbol, i) => {
    const multiplier = cfg.baseLtp < 2 ? 1 + i * 0.02 : 1 + i * 0.07;
    const avgPrice = Number((cfg.baseLtp * multiplier).toFixed(4));
    const ltp = Number((avgPrice * (1 + (i % 2 === 0 ? 0.016 : -0.01))).toFixed(4));
    return {
      id: `pos-${cfg.slug}-${i + 1}`,
      symbol,
      assetClass: cfg.assetClass,
      quantity: cfg.baseLtp > 1000 ? 0.35 + i * 0.15 : 10 + i * 4,
      averagePrice: avgPrice,
      ltp,
    };
  });
}

function makeOrders(
  cfg: BrokerSeedConfig,
  strategies: TrialStrategyRecord[],
  baseIso: string,
): TrialOrderRecord[] {
  return Array.from({ length: 24 }, (_, i) => {
    const strategy = strategies[i % strategies.length];
    const symbol = strategy.symbols[0] ?? cfg.symbols[0];
    const side = i % 2 === 0 ? "buy" : "sell";
    const quantity = cfg.baseLtp > 1000 ? Number((0.2 + i * 0.01).toFixed(3)) : 5 + (i % 6);
    const priceSeed = cfg.baseLtp > 1000 ? cfg.baseLtp * (1 + (i % 4) * 0.002) : cfg.baseLtp * (1 + i * 0.0014);
    const price = Number(priceSeed.toFixed(4));
    const filledPrice = Number((price * (1 + (i % 3 === 0 ? 0.0005 : -0.0003))).toFixed(4));
    const pnl = Number(((filledPrice - price) * quantity * (side === "buy" ? 1 : -1)).toFixed(2));
    return {
      id: `ord-${cfg.slug}-${i + 1}`,
      symbol,
      strategyId: strategy.id,
      side,
      quantity,
      price,
      filledPrice,
      pnl,
      status: i % 11 === 0 ? "rejected" : "filled",
      timestampIso: isoAt(baseIso, i * 6),
    };
  });
}

function makeExecutions(
  cfg: BrokerSeedConfig,
  strategies: TrialStrategyRecord[],
  baseIso: string,
): TrialExecutionRecord[] {
  return Array.from({ length: 14 }, (_, i) => {
    const strategy = strategies[i % strategies.length];
    const entryMin = 12 + i * 22;
    const holdMin = 18 + (i % 5) * 7;
    const resultPct = Number(((i % 4 === 0 ? -1 : 1) * (0.45 + (i % 6) * 0.24)).toFixed(2));
    return {
      id: `exe-${cfg.slug}-${i + 1}`,
      strategyId: strategy.id,
      symbol: strategy.symbols[0] ?? cfg.symbols[0],
      entryTimeIso: isoAt(baseIso, entryMin),
      exitTimeIso: isoAt(baseIso, entryMin + holdMin),
      resultPct,
    };
  });
}

function makeLogs(
  cfg: BrokerSeedConfig,
  strategies: TrialStrategyRecord[],
  orders: TrialOrderRecord[],
  baseIso: string,
): TrialLogRecord[] {
  const seed: TrialLogRecord[] = [
    {
      id: `log-${cfg.slug}-0`,
      type: "info",
      message: `${cfg.displayName} account context initialized.`,
      timestampIso: isoAt(baseIso, 0),
      source: "system",
    },
  ];

  const orderLogs: TrialLogRecord[] = orders.map((order, i) => {
    const type = order.status === "rejected" ? "warn" : "exec";
    const strategy = strategies.find((s) => s.id === order.strategyId);
    return {
      id: `log-${cfg.slug}-o-${i + 1}`,
      type,
      message:
        order.status === "rejected"
          ? `Order rejected: ${order.symbol} ${order.side.toUpperCase()} ${order.quantity} (${strategy?.name ?? "strategy"}).`
          : `Execution event: ${order.symbol} ${order.side.toUpperCase()} ${order.quantity} @ ${order.filledPrice}.`,
      timestampIso: order.timestampIso,
      source: order.status === "rejected" ? "risk" : "broker",
      strategyId: order.strategyId,
      orderId: order.id,
    };
  });

  return [...seed, ...orderLogs].sort(
    (a, b) => Date.parse(a.timestampIso) - Date.parse(b.timestampIso),
  );
}

function makeEquityCurve(baseIso: string, startValue: number): { timestampIso: string; value: number }[] {
  let value = startValue;
  return Array.from({ length: 90 }, (_, i) => {
    const drift = i % 12 === 0 ? -220 : 140 + (i % 7) * 18;
    value = Number((value + drift).toFixed(2));
    return {
      timestampIso: isoAt(baseIso, i * 5),
      value,
    };
  });
}

function makeOptionsStrategies(cfg: BrokerSeedConfig): TrialOptionsStrategy[] {
  if (!cfg.supportsOptions) return [];
  const [u1, u2] = cfg.optionsUnderlyings;
  return [
    {
      id: `opt-${cfg.slug}-1`,
      name: `${u1} ORB Breakout`,
      style: "ORB Buying",
      strike: "ATM+1",
      expiry: "Weekly",
      stopLoss: "30%",
      takeProfit: "50%",
      status: "paper",
    },
    {
      id: `opt-${cfg.slug}-2`,
      name: `${u2} Premium Strangle`,
      style: "Short Vol",
      strike: "±300",
      expiry: "Weekly",
      stopLoss: "2x premium",
      takeProfit: "45%",
      status: "live",
    },
  ];
}

function makeOptionsPositions(cfg: BrokerSeedConfig): TrialOptionsPosition[] {
  if (!cfg.supportsOptions) return [];
  const [u1, u2] = cfg.optionsUnderlyings;
  return [
    {
      symbol: `${u1} 23650 CE`,
      entry: 142.2,
      current: 156.6,
      pnlPct: 10.1,
      dteLabel: "2d",
    },
    {
      symbol: `${u2} 49800 PE`,
      entry: 228.4,
      current: 211.5,
      pnlPct: -7.4,
      dteLabel: "Today",
    },
  ];
}

function buildBaseDataset(cfg: BrokerSeedConfig): TrialBaseDataset {
  const baseIso = "2026-04-14T03:30:00.000Z";
  const strategies = makeStrategies(cfg);
  const positions = makePositions(cfg);
  const orders = makeOrders(cfg, strategies, baseIso);
  const executions = makeExecutions(cfg, strategies, baseIso);
  const logs = makeLogs(cfg, strategies, orders, baseIso);
  const equityCurve = makeEquityCurve(baseIso, 2_500_000 + cfg.alertsCount * 80_000);

  return {
    profile: makeProfile(cfg),
    cashBalance: cfg.baseLtp > 1000 ? 1_250_000 : 95_000,
    positions,
    strategies,
    orders,
    executions,
    logs,
    equityCurve,
    optionsStrategies: makeOptionsStrategies(cfg),
    optionsPositions: makeOptionsPositions(cfg),
  };
}

const DATASET_MAP: Record<TrialBrokerSlug, TrialDashboardDataset> = {
  zerodha: buildTrialDashboardDataset(buildBaseDataset(BROKER_CONFIGS.zerodha)),
  binance: buildTrialDashboardDataset(buildBaseDataset(BROKER_CONFIGS.binance)),
  exness: buildTrialDashboardDataset(buildBaseDataset(BROKER_CONFIGS.exness)),
  "mt4-mt5": buildTrialDashboardDataset(buildBaseDataset(BROKER_CONFIGS["mt4-mt5"])),
  robinhood: buildTrialDashboardDataset(buildBaseDataset(BROKER_CONFIGS.robinhood)),
};

export function getTrialDashboardDataset(slug: TrialBrokerSlug): TrialDashboardDataset {
  return DATASET_MAP[slug];
}

export function getAllTrialBrokerSlugs(): TrialBrokerSlug[] {
  return Object.keys(DATASET_MAP) as TrialBrokerSlug[];
}
