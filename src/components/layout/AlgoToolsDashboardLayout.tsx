import { Outlet } from "react-router-dom";
import { TradingDashboardAccessGate } from "@/components/trading/TradingDashboardAccessGate";
import { TrialCreditsBanner } from "@/components/TrialCreditsBanner";

export type AlgoToolsOutletContext = { broker: string };

/**
 * Layout for /ai-trading-analysis and /backtest.
 * Requires an active algo-tier subscription but does NOT require a provisioned OpenAlgo account —
 * these are analysis/research tools, not live-trading screens.
 */
export function AlgoToolsDashboardLayout() {
  return (
    <TradingDashboardAccessGate skipProvisioningCheck={true}>
      {(ctx) => (
        <div className="min-h-screen bg-black">
          <div className="container mx-auto px-4 pt-4">
            <TrialCreditsBanner />
          </div>
          <Outlet context={{ broker: ctx.broker } as AlgoToolsOutletContext} />
        </div>
      )}
    </TradingDashboardAccessGate>
  );
}
