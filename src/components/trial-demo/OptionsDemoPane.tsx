import "./trial-demo.css";
import type { TrialOptionsPosition, TrialOptionsStrategy } from "@/lib/trial-data";

type Props = {
  supportsOptions: boolean;
  optionsStrategies: TrialOptionsStrategy[];
  optionsPositions: TrialOptionsPosition[];
};

export function OptionsDemoPane({
  supportsOptions,
  optionsStrategies,
  optionsPositions,
}: Props) {
  if (!supportsOptions) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">O</span>
            Options Surface
          </div>
          <span className="card-badge badge-yellow">Not supported</span>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          This broker profile is focused on spot/CFD/FX instruments. Options ladder,
          chain and open options positions are intentionally unavailable for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="trial-options-grid">
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">O</span>
            Options Strategies
          </div>
          <span className="card-badge badge-blue">Demo</span>
        </div>
        <div className="trial-options-list">
          {optionsStrategies.map((s) => (
            <div key={s.id} className="trial-options-item">
              <div className="trial-options-head">
                <strong>{s.name}</strong>
                <span
                  className={`trial-options-status ${s.status === "live" ? "is-live" : "is-paper"}`}
                >
                  {s.status.toUpperCase()}
                </span>
              </div>
              <div className="trial-options-meta">
                {s.style} · Strike {s.strike} · {s.expiry}
              </div>
              <div className="trial-options-metrics">
                <span>SL {s.stopLoss}</span>
                <span>TP {s.takeProfit}</span>
                <button type="button" className="trial-options-mini-btn">
                  View Option Chain
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">P</span>
            Open Options Positions
          </div>
          <span className="card-badge badge-green">Live-like</span>
        </div>
        <div className="trial-options-list">
          {optionsPositions.map((p) => (
            <div key={p.symbol} className="trial-options-item">
              <div className="trial-options-head">
                <strong>{p.symbol}</strong>
                <span className={p.pnlPct >= 0 ? "trial-pnl-pos" : "trial-pnl-neg"}>
                  {p.pnlPct >= 0 ? "+" : ""}
                  {p.pnlPct.toFixed(1)}%
                </span>
              </div>
              <div className="trial-options-meta">
                Entry {p.entry.toFixed(2)} · Current {p.current.toFixed(2)}
              </div>
              <div className="trial-options-metrics">
                <span>DTE {p.dteLabel}</span>
                <button type="button" className="trial-options-mini-btn">
                  Exit Position
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
