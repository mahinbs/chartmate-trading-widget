import React from "react";
import BacktestingSection from "@/components/trading/BacktestingSection";
import { TradingDashboardAccessGate } from "@/components/trading/TradingDashboardAccessGate";
import { TradingDashboardShell } from "@/components/trading/TradingDashboardShell";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";

function BacktestContent({ broker }: { broker: string }) {
  return (
    <TradingDashboardShell broker={broker} pageTitle="Backtesting">
      <div className="min-w-0">
        <BacktestingSection />
      </div>
    </TradingDashboardShell>
  );
}

export default function TradingBacktestPage() {
  return (
    <DashboardShellLayout>
      <TradingDashboardAccessGate>
        {(ctx) => <BacktestContent broker={ctx.broker} />}
      </TradingDashboardAccessGate>
    </DashboardShellLayout>
  );
}
