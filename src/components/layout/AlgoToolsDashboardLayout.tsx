import { Outlet } from "react-router-dom";
import { DashboardShellLayout } from "./DashboardShellLayout";
import { TradingDashboardAccessGate } from "@/components/trading/TradingDashboardAccessGate";

export type AlgoToolsOutletContext = { broker: string };

/**
 * One dashboard shell + one `TradingDashboardAccessGate` around an `Outlet`, so switching
 * between `/ai-trading-analysis` and `/backtest` does not remount the gate (avoids a loading
 * flash and keeps provision checks from re-running on every click).
 */
export function AlgoToolsDashboardLayout() {
  return (
    <DashboardShellLayout>
      <TradingDashboardAccessGate notReadyRedirect="/algo-setup">
        {(ctx) => (
          <Outlet context={{ broker: ctx.broker } as AlgoToolsOutletContext} />
        )}
      </TradingDashboardAccessGate>
    </DashboardShellLayout>
  );
}
