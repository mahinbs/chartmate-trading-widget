import "./trial-demo.css";
import type { TrialExecutionRecord, TrialStrategyRecord } from "@/lib/trial-data";

type ExecutionView = {
  id: string;
  strategy: string;
  entry: string;
  exit: string;
  result: string;
  positive: boolean;
};

type Props = {
  executions: TrialExecutionRecord[];
  strategies: TrialStrategyRecord[];
};

function toViewRows(
  executions: TrialExecutionRecord[],
  strategies: TrialStrategyRecord[],
): ExecutionView[] {
  const strategyById = new Map(strategies.map((s) => [s.id, s.name]));
  return executions.slice(0, 5).map((e) => ({
    id: e.id,
    strategy: strategyById.get(e.strategyId) ?? "Strategy",
    entry: new Date(e.entryTimeIso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    exit: new Date(e.exitTimeIso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    result: `${e.resultPct > 0 ? "+" : ""}${e.resultPct.toFixed(2)}%`,
    positive: e.resultPct >= 0,
  }));
}

export function RecentExecutionsPanel({ executions, strategies }: Props) {
  const rows = toViewRows(executions, strategies);
  return (
    <div className="card trial-recent-exec">
      <div className="card-header">
        <div className="card-title">
          <span
            className="card-title-icon"
            style={{ background: "rgba(52,211,153,0.1)", color: "var(--accent-green)" }}
          >
            ✓
          </span>
          Recent System Executions
        </div>
        <span className="card-badge badge-green">Logged</span>
      </div>
      <div>
        {rows.map((t) => (
          <div className="trial-recent-row" key={t.id}>
            <span className="trial-recent-id">Trade {t.id.slice(-8).toUpperCase()}</span>
            <span className="trial-recent-strat">Strategy: {t.strategy}</span>
            <span>Entry: {t.entry}</span>
            <span>Exit: {t.exit}</span>
            <span style={{ color: t.positive ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 700 }}>
              Result: {t.result}
            </span>
          </div>
        ))}
        <p className="trial-recent-foot">All trades are logged, tracked, and analyzed.</p>
      </div>
    </div>
  );
}
