import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialAccess } from "@/hooks/useTrialAccess";

/**
 * Shown for users on the 2-day credit trial (no paid plan). Hidden for subscribers.
 */
export function TrialCreditsBanner() {
  const { isPremium, loading: subLoading } = useSubscription();
  const { loading: trialLoading, isOnTrial, creditsRemaining, creditsPerDay, daysLeft } = useTrialAccess();

  if (subLoading || trialLoading || isPremium || !isOnTrial) return null;

  return (
    <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <Sparkles className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-teal-50">2-day free trial</p>
          <p className="text-xs text-teal-200/90 mt-0.5">
            <span className="font-semibold tabular-nums">{creditsRemaining}</span> /{" "}
            <span className="tabular-nums">{creditsPerDay}</span> credits left today · Backtest, AI
            analysis, and paper deploy each use <span className="font-semibold">10</span> credits ·{" "}
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
