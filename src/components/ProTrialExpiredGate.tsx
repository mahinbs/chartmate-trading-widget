import { useState } from "react";
import { Button } from "@/components/ui/button";
import { premiumPlanCheckoutUrls } from "@/lib/premiumCheckoutUrls";
import { createCheckoutSession } from "@/services/stripeService";
import { toast } from "sonner";

/**
 * Shown when status is `pro_trial` and the 14-day period + 24h grace has ended.
 * Only Pro checkout — no other plans (see pricing matrix separately).
 */
export function ProTrialExpiredGate() {
  const [loading, setLoading] = useState(false);

  const onGetPro = async () => {
    setLoading(true);
    try {
      const { success_url, cancel_url } = premiumPlanCheckoutUrls("professionalPlan");
      const result = await createCheckoutSession({
        plan_id: "professionalPlan",
        success_url,
        cancel_url,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95 px-6 text-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-trial-expired-title"
    >
      <div className="max-w-md rounded-2xl border border-teal-500/30 bg-zinc-950/90 p-8 shadow-[0_0_60px_rgba(20,184,166,0.12)]">
        <p className="font-ibm-mono text-[10px] uppercase tracking-[0.2em] text-teal-400/90">
          ChartMate
        </p>
        <h1 id="pro-trial-expired-title" className="mt-3 font-bebas text-3xl text-white sm:text-4xl">
          Your 14-day Pro trial has ended
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          To continue using ChartMate with Pro features, complete checkout for the Pro plan.
        </p>
        <Button
          type="button"
          disabled={loading}
          onClick={() => void onGetPro()}
          className="mt-8 w-full h-12 bg-teal-500 text-black font-bold font-ibm-mono text-sm uppercase tracking-wider hover:bg-teal-400"
        >
          {loading ? "Redirecting…" : "Get Pro — $599 + $199/mo"}
        </Button>
      </div>
    </div>
  );
}
