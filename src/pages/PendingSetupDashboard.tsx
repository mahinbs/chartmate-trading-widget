import { useNavigate } from "react-router-dom";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Lock,
  Rocket,
  Clock,
  TrendingUp,
  Wallet,
  Activity,
  LineChart,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

interface PendingSetupDashboardProps {
  algoStatus: string | null;
}

/**
 * Shown at /home for users who have an Algo entitlement but haven't been
 * provisioned yet. Previously these users were bounced straight back to the
 * KYC form (making "Back to dashboard" feel broken). Instead we show a
 * preview of the live dashboard they'll unlock, with a clear CTA to finish
 * setup — so the destination feels real and motivates completion.
 */
export default function PendingSetupDashboard({
  algoStatus,
}: PendingSetupDashboardProps) {
  const navigate = useNavigate();
  const submitted =
    algoStatus === "pending" ||
    algoStatus === "submitted" ||
    algoStatus === "in_review";

  const previewCards = [
    { icon: Wallet, label: "Live P&L", value: "₹ ——", hint: "Realised + unrealised" },
    { icon: Activity, label: "Active Strategies", value: "—", hint: "Running on your broker" },
    { icon: TrendingUp, label: "Today's Trades", value: "—", hint: "Auto-executed" },
    { icon: LineChart, label: "Win Rate", value: "——%", hint: "Last 30 days" },
  ];

  return (
    <DashboardShellLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Your Algo Trading Dashboard
            </h1>
            <p className="text-zinc-400 mt-1">
              This is where your live automated trading will run.
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              submitted
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : "bg-teal-500/15 text-teal-300 border-teal-500/30"
            }
          >
            {submitted ? "Setup under review" : "Setup incomplete"}
          </Badge>
        </div>

        {/* Status / CTA banner */}
        <Card className="relative overflow-hidden border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-teal-500/15 p-3 shrink-0">
              {submitted ? (
                <Clock className="h-6 w-6 text-amber-300" />
              ) : (
                <Rocket className="h-6 w-6 text-teal-300" />
              )}
            </div>
            <div className="flex-1">
              {submitted ? (
                <>
                  <h2 className="text-lg font-semibold text-white">
                    ✅ Your details are in — activation in progress
                  </h2>
                  <p className="text-zinc-400 mt-1 max-w-2xl">
                    Our team is reviewing your KYC and provisioning your OpenAlgo
                    API access. This usually takes under 24 hours. As soon as it's
                    live, this dashboard fills with your real positions, P&amp;L and
                    strategies — no further action needed.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-white">
                    You're one short form away from going live
                  </h2>
                  <p className="text-zinc-400 mt-1 max-w-2xl">
                    Finish the 6-step setup (KYC + broker details) and our team
                    activates your live algo trading dashboard within 24 hours.
                    Everything below unlocks once you're set up.
                  </p>
                </>
              )}
              <Button
                onClick={() => navigate("/algo-setup")}
                className="mt-4 bg-teal-500 hover:bg-teal-400 text-black font-bold gap-2"
              >
                {submitted ? "Review my details" : "Continue setup"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Locked preview cards */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Unlocks after setup
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {previewCards.map((c) => (
              <Card
                key={c.label}
                className="relative overflow-hidden border-zinc-800 bg-zinc-900/40 p-5"
              >
                <div className="absolute right-3 top-3 text-zinc-600">
                  <Lock className="h-4 w-4" />
                </div>
                <c.icon className="h-5 w-5 text-zinc-500" />
                <div className="mt-3 text-2xl font-bold text-zinc-300 blur-[1.5px] select-none">
                  {c.value}
                </div>
                <div className="mt-1 text-sm font-medium text-zinc-400">
                  {c.label}
                </div>
                <div className="text-xs text-zinc-600">{c.hint}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* Reassurance */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <ShieldCheck className="h-4 w-4 text-teal-400 shrink-0" />
          Bank-grade broker integration · you stay in full control · cancel anytime
        </div>
      </div>
    </DashboardShellLayout>
  );
}
