import { Navigate, useParams } from "react-router-dom";
import TrialMockDashboard from "@/components/trial-demo/TrialMockDashboard";
import { isTrialBrokerSlug, resolveValidatedTrialDataset } from "@/lib/trial-data";

const BROKER_SLUGS = new Set(["zerodha", "binance", "exness", "mt4-mt5", "robinhood"]);

export default function TrialDashboardPage() {
  const { brokerSlug } = useParams<{ brokerSlug?: string }>();
  const normalized = (brokerSlug ?? "zerodha").toLowerCase();

  if (!BROKER_SLUGS.has(normalized) || !isTrialBrokerSlug(normalized)) {
    return <Navigate to="/demo/zerodha" replace />;
  }

  const { dataset, validation } = resolveValidatedTrialDataset(normalized);
  if (!validation.ok) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="max-w-3xl mx-auto rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <h1 className="text-lg font-semibold mb-2">Dataset consistency check failed</h1>
          <p className="text-sm text-muted-foreground mb-3">
            Rendering is blocked to prevent contradictory trial data.
          </p>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {validation.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return <TrialMockDashboard dataset={dataset} />;
}
