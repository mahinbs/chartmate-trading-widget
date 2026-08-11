import { useNavigate } from "react-router-dom";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TradingAccountsSection from "@/components/algo/TradingAccountsSection";
import LiveAlgoTradingSection from "@/components/algo/LiveAlgoTradingSection";
import {
  Rocket,
  Clock,
  ArrowRight,
  ShieldCheck,
  Bot,
  Cpu,
} from "lucide-react";

interface PendingSetupDashboardProps {
  algoStatus: string | null;
}

/**
 * Shown at /home for users with an Algo entitlement who aren't provisioned
 * yet. A futuristic "command center" preview of the dashboard they unlock,
 * with a CTA back into the KYC form and a live (mocked) broker strip.
 */
export default function PendingSetupDashboard({
  algoStatus,
}: PendingSetupDashboardProps) {
  const navigate = useNavigate();
  const submitted =
    algoStatus === "pending" ||
    algoStatus === "submitted" ||
    algoStatus === "in_review";

  return (
    <DashboardShellLayout>
      <div className="relative min-h-full overflow-hidden">
        {/* ── futuristic backdrop ─────────────────────────── */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(45,212,191,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.06) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
          }}
        />
        <div className="pointer-events-none absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-teal-500/10 blur-[120px]" />
        <div className="pointer-events-none absolute top-20 right-0 h-96 w-96 rounded-full bg-violet-600/10 blur-[120px]" />

        <div className="relative mx-auto w-full max-w-6xl px-4 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="relative rounded-xl border border-teal-500/30 bg-teal-500/10 p-2.5">
                <Bot className="h-6 w-6 text-teal-300" />
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse ring-2 ring-[#05070d]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Algo Command Center
                </h1>
                <p className="text-zinc-400 mt-0.5 flex items-center gap-1.5 text-sm">
                  <Cpu className="h-3.5 w-3.5 text-teal-400" />
                  Automated trading control — engines, brokers &amp; risk in one place.
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                submitted
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30 font-mono"
                  : "bg-teal-500/10 text-teal-300 border-teal-500/30 font-mono"
              }
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              {submitted ? "SETUP UNDER REVIEW" : "SETUP INCOMPLETE"}
            </Badge>
          </div>

          {/* Status / CTA banner */}
          <div className="relative overflow-hidden rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/[0.08] to-transparent p-6 backdrop-blur">
            <div className="pointer-events-none absolute -top-24 -right-10 h-56 w-56 rounded-full bg-teal-500/10 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="rounded-xl bg-teal-500/15 p-3 shrink-0 border border-teal-500/20">
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
                      activates your live algo trading engine within 24 hours.
                    </p>
                  </>
                )}
                <Button
                  onClick={() => navigate("/algo-setup")}
                  className="mt-4 bg-teal-500 hover:bg-teal-400 text-black font-bold gap-2 shadow-[0_0_24px_-6px_rgba(45,212,191,0.7)]"
                >
                  {submitted ? "Review my details" : "Continue setup"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Live algo trading — bots actively trading (UI only) */}
          <LiveAlgoTradingSection />

          {/* Connected trading accounts (UI only) */}
          <TradingAccountsSection />

          {/* Reassurance */}
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-teal-400 shrink-0" />
            Bank-grade broker integration · you stay in full control · cancel anytime
          </div>
        </div>
      </div>
    </DashboardShellLayout>
  );
}
