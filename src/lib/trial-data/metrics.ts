import type {
  TrialBaseDataset,
  TrialDashboardDataset,
  TrialDerivedMetrics,
  TrialEquityPoint,
  TrialExecutionRecord,
} from "@/lib/trial-data/types";

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function parseTs(ts: string): number {
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeMaxDrawdownPct(points: TrialEquityPoint[]): number {
  if (!points.length) return 0;
  let peak = points[0].value;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.value);
    if (!peak) continue;
    const dd = ((peak - point.value) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }
  return Number(maxDrawdown.toFixed(2));
}

function computeAvgDurationMin(executions: TrialExecutionRecord[]): number {
  if (!executions.length) return 0;
  const mins = executions
    .map((e) => (parseTs(e.exitTimeIso) - parseTs(e.entryTimeIso)) / 60000)
    .filter((m) => Number.isFinite(m) && m >= 0);
  return Number(average(mins).toFixed(2));
}

function computeDailyPnl(executions: TrialExecutionRecord[]): number {
  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  return Number(
    executions
      .filter((e) => parseTs(e.exitTimeIso) >= dayStart.getTime())
      .reduce((sum, e) => sum + e.resultPct, 0)
      .toFixed(2),
  );
}

function computeSharpeLike(executions: TrialExecutionRecord[]): number {
  if (!executions.length) return 0;
  const returns = executions.map((e) => e.resultPct / 100);
  const avg = average(returns);
  const variance =
    returns.reduce((sum, r) => sum + (r - avg) * (r - avg), 0) /
    Math.max(1, returns.length - 1);
  const stdev = Math.sqrt(variance);
  if (!stdev) return 0;
  return Number((avg / stdev).toFixed(2));
}

function computeRiskScore(executions: TrialExecutionRecord[], maxDrawdownPct: number): number {
  const negative = executions.filter((e) => e.resultPct < 0).length;
  const lossRate = pct(negative, executions.length);
  const score = Math.min(100, Math.round(lossRate * 0.4 + maxDrawdownPct * 1.6));
  return score;
}

export function deriveTrialMetrics(base: TrialBaseDataset): TrialDerivedMetrics {
  const positionMarketValue = base.positions.reduce(
    (sum, p) => sum + p.quantity * p.ltp,
    0,
  );
  const positionCost = base.positions.reduce(
    (sum, p) => sum + p.quantity * p.averagePrice,
    0,
  );
  const portfolioValue = Number((base.cashBalance + positionMarketValue).toFixed(2));
  const cumulativePnl = Number((positionMarketValue - positionCost).toFixed(2));
  const profitableExecutions = base.executions.filter((e) => e.resultPct > 0).length;
  const winRate = Number(pct(profitableExecutions, base.executions.length).toFixed(2));
  const maxDrawdownPct = computeMaxDrawdownPct(base.equityCurve);
  const avgTradeDurationMin = computeAvgDurationMin(base.executions);
  const dailyPnl = computeDailyPnl(base.executions);
  const sharpeLike = computeSharpeLike(base.executions);
  const exposurePct = Number(
    pct(positionMarketValue, Math.max(portfolioValue, 1)).toFixed(2),
  );
  const riskScore = computeRiskScore(base.executions, maxDrawdownPct);

  return {
    portfolioValue,
    dailyPnl,
    cumulativePnl,
    winRate,
    sharpeLike,
    maxDrawdownPct,
    activePositions: base.positions.length,
    avgTradeDurationMin,
    exposurePct,
    latencyMs: 18 + (base.profile.alertsCount % 6) * 4,
    riskScore,
    ordersPerSecond: Number((base.orders.length / 18).toFixed(1)),
    strategiesRunning: base.strategies.filter((s) => s.status === "active").length,
    completedExecutions: base.executions.length,
  };
}

export function buildTrialDashboardDataset(base: TrialBaseDataset): TrialDashboardDataset {
  return {
    base,
    derived: deriveTrialMetrics(base),
  };
}
