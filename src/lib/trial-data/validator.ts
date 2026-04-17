import type {
  TrialBaseDataset,
  TrialDashboardDataset,
  TrialExecutionRecord,
  TrialOrderRecord,
  TrialPosition,
  TrialStrategyRecord,
} from "@/lib/trial-data/types";

export interface TrialDatasetValidationResult {
  ok: boolean;
  errors: string[];
}

function isIso(ts: string): boolean {
  return Number.isFinite(Date.parse(ts));
}

function validatePositions(positions: TrialPosition[], errors: string[]) {
  for (const p of positions) {
    if (!p.symbol.trim()) errors.push(`Position ${p.id}: missing symbol.`);
    if (p.quantity <= 0) errors.push(`Position ${p.id}: quantity must be > 0.`);
    if (p.averagePrice <= 0 || p.ltp <= 0) {
      errors.push(`Position ${p.id}: prices must be > 0.`);
    }
  }
}

function validateStrategies(strategies: TrialStrategyRecord[], errors: string[]) {
  for (const s of strategies) {
    if (!s.name.trim()) errors.push(`Strategy ${s.id}: missing name.`);
    if (s.winRate < 0 || s.winRate > 100) errors.push(`Strategy ${s.id}: winRate out of range.`);
    if (s.stage < 1 || s.stage > 4) errors.push(`Strategy ${s.id}: stage out of range.`);
    if (!s.symbols.length) errors.push(`Strategy ${s.id}: no symbols mapped.`);
  }
}

function validateOrders(
  orders: TrialOrderRecord[],
  strategyIds: Set<string>,
  errors: string[],
) {
  for (const o of orders) {
    if (!strategyIds.has(o.strategyId)) {
      errors.push(`Order ${o.id}: strategyId ${o.strategyId} not found.`);
    }
    if (!isIso(o.timestampIso)) errors.push(`Order ${o.id}: invalid timestamp.`);
    if (o.quantity <= 0) errors.push(`Order ${o.id}: quantity must be > 0.`);
    if (o.price <= 0 || o.filledPrice <= 0) errors.push(`Order ${o.id}: invalid price.`);
  }
}

function validateExecutions(
  executions: TrialExecutionRecord[],
  strategyIds: Set<string>,
  errors: string[],
) {
  for (const e of executions) {
    if (!strategyIds.has(e.strategyId)) {
      errors.push(`Execution ${e.id}: strategyId ${e.strategyId} not found.`);
    }
    if (!isIso(e.entryTimeIso) || !isIso(e.exitTimeIso)) {
      errors.push(`Execution ${e.id}: invalid timestamps.`);
      continue;
    }
    if (Date.parse(e.entryTimeIso) > Date.parse(e.exitTimeIso)) {
      errors.push(`Execution ${e.id}: entry occurs after exit.`);
    }
  }
}

function validateMonotonicity(dataset: TrialBaseDataset, errors: string[]) {
  const orderTimes = dataset.orders.map((o) => Date.parse(o.timestampIso));
  const logTimes = dataset.logs.map((l) => Date.parse(l.timestampIso));
  const equityTimes = dataset.equityCurve.map((p) => Date.parse(p.timestampIso));
  const allSeries = [
    { name: "orders", times: orderTimes },
    { name: "logs", times: logTimes },
    { name: "equity", times: equityTimes },
  ];
  for (const series of allSeries) {
    for (let i = 1; i < series.times.length; i += 1) {
      if (series.times[i] < series.times[i - 1]) {
        errors.push(`${series.name} timestamps are not monotonic at index ${i}.`);
        break;
      }
    }
  }
}

function validatePortfolioCoherence(dataset: TrialDashboardDataset, errors: string[]) {
  const positionMarketValue = dataset.base.positions.reduce(
    (sum, p) => sum + p.quantity * p.ltp,
    0,
  );
  const expectedPortfolioValue = dataset.base.cashBalance + positionMarketValue;
  const diff = Math.abs(expectedPortfolioValue - dataset.derived.portfolioValue);
  if (diff > 0.5) {
    errors.push(
      `Portfolio mismatch: expected ${expectedPortfolioValue.toFixed(2)} but derived ${dataset.derived.portfolioValue.toFixed(2)}.`,
    );
  }
}

export function validateTrialDashboardDataset(
  dataset: TrialDashboardDataset,
): TrialDatasetValidationResult {
  const errors: string[] = [];
  const strategyIds = new Set(dataset.base.strategies.map((s) => s.id));

  validatePositions(dataset.base.positions, errors);
  validateStrategies(dataset.base.strategies, errors);
  validateOrders(dataset.base.orders, strategyIds, errors);
  validateExecutions(dataset.base.executions, strategyIds, errors);
  validateMonotonicity(dataset.base, errors);
  validatePortfolioCoherence(dataset, errors);

  for (const log of dataset.base.logs) {
    if (!isIso(log.timestampIso)) errors.push(`Log ${log.id}: invalid timestamp.`);
  }

  return { ok: errors.length === 0, errors };
}
