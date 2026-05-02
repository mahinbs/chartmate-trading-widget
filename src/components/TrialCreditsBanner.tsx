import { Link } from "react-router-dom";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialAccess } from "@/hooks/useTrialAccess";
import { trialCreditsPerActionLine } from "@/constants/trialCredits";

/**
 * Single global trial strip for non-subscribers: active trial credits, or ended trial CTA.
 * Rendered once from {@link DashboardShellLayout} (and removed from nested tool shells).
 */
export function TrialCreditsBanner() {
  const { isPremium, loading: subLoading } = useSubscription();
  const {
    loading: trialLoading,
    isOnTrial,
    trialExpired,
    hasTrialRecord,
    creditsRemaining,
    creditsPerDay,
    daysLeft,
  } = useTrialAccess();

  if (subLoading || trialLoading || isPremium) return null;

  if (trialExpired && hasTrialRecord) {
    return (
      <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-50">Trial ended</p>
            <p className="text-xs text-amber-200/90 mt-0.5">
              Backtesting, AI trading analysis, and paper deploys are paused until you subscribe.{" "}
              {trialCreditsPerActionLine()}
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 w-full sm:w-auto bg-teal-600 hover:bg-teal-500 text-black font-semibold">
          <Link to="/pricing">View plans &amp; upgrade</Link>
        </Button>
      </div>
    );
  }

  if (!isOnTrial) return null;

  return (
    <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <Sparkles className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-teal-50">14-day free trial</p>
          <p className="text-xs text-teal-200/90 mt-0.5">
            <span className="font-semibold tabular-nums">{creditsRemaining}</span> /{" "}
            <span className="tabular-nums">{creditsPerDay}</span> credits left today ·{" "}
            {trialCreditsPerActionLine()} ·{" "}
            <span className="tabular-nums">{daysLeft}</span> day{daysLeft === 1 ? "" : "s"} left in trial
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="secondary" className="shrink-0 w-full sm:w-auto">
        <Link to="/pricing">Upgrade for unlimited</Link>
      </Button>
    </div>
  );
}
