export type IndicatorId =
  | "RSI"
  | "MACD"
  | "MACD_SIGNAL"
  | "MACD_HIST"
  | "EMA"
  | "SMA"
  | "BB_UPPER"
  | "BB_MIDDLE"
  | "BB_LOWER"
  | "VOLUME"
  | "PRICE"
  | "CHANGE_PCT";

export type ConditionOp =
  | "less_than"
  | "greater_than"
  | "equals"
  | "less_than_or_equal"
  | "greater_than_or_equal"
  | "crosses_above"
  | "crosses_below";

export type ConditionRhs =
  | { kind: "number"; value: number }
  | { kind: "indicator"; id: IndicatorId; period?: number };

export type AlgoCondition = {
  id: string;
  indicator: IndicatorId;
  period?: number;
  op: ConditionOp;
  rhs: ConditionRhs;
};

export type ConditionGroup = {
  id: string;
  logic: "AND" | "OR";
  conditions: AlgoCondition[];
};

export type BuilderStrategySubtype = "indicator_based" | "time_based" | "hybrid";

export type EntryConditions = {
  mode: "visual" | "raw";
  groupLogic: "AND" | "OR";
  groups: ConditionGroup[];
  rawExpression: string;
  /** How the builder interprets entry rules (persisted for scans / fallbacks) */
  strategySubtype?: BuilderStrategySubtype;
  /** For time_based / hybrid — wall-clock entry (HH:MM), evaluated in scan timezone */
  clockEntryTime?: string;
};

export type ExitConditions = {
  takeProfitPct: number;
  stopLossPct: number;
  trailingStop: boolean;
  trailingStopPct: number;
  indicatorGroups: ConditionGroup[];
  timeBasedExit: boolean;
  exitAfterMinutes: number;
  /** Explicit wall-clock exit (e.g. Algorooms-style “exit at 1:01 PM”) — HH:MM */
  clockExitTime?: string;
};

export type ScalingRule = {
  triggerPct: number;
  addQty: number;
};

export type PositionConfig = {
  orderType: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  sizingMode: "fixed_qty" | "risk_based" | "capital_pct";
  quantity: number;
  capitalPct: number;
  limitOffsetPct: number;
  scaling: ScalingRule[];
  /** Broker / exchange metadata from builder */
  exchange?: string;
  orderProduct?: string;
  expiryType?: string;
  strikeType?: string;
};

export type RiskConfig = {
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  capitalAllocationPct: number;
};

export type ChartConfig = {
  interval: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W";
  chartType: "candlestick" | "heikin_ashi" | "line";
};
