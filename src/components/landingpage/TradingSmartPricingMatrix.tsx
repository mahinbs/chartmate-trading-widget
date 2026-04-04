import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { premiumPlanCheckoutUrls } from "@/lib/premiumCheckoutUrls";
import { createCheckoutSession } from "@/services/stripeService";
import { toast } from "sonner";

/**
 * Shared pricing matrix (Starter / Growth / Professional) for marketing pages.
 */
export function TradingSmartPricingMatrix() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const subscribe = async (planId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth?subscribe_plan=" + encodeURIComponent(planId));
      return;
    }
    const { success_url, cancel_url } = premiumPlanCheckoutUrls(planId);
    const result = await createCheckoutSession({
      plan_id: planId,
      success_url,
      cancel_url,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.url) window.location.href = result.url;
  };

  return (
    <div className="container mx-auto px-4 max-w-6xl pb-8 relative">
      <h2 className="font-bebas text-4xl md:text-5xl text-center text-white mb-10 md:mb-16">
        PRICING
      </h2>
      <div className="-mx-4 px-4 pb-4 scrollbar-thin scrollbar-thumb-zinc-800">
        <table className="min-w-[720px] w-full text-left font-ibm-sans border-collapse relative z-10">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="py-6 px-4 font-normal text-zinc-600 underline decoration-zinc-800 underline-offset-4">
                FEATURES
              </th>

              <th className="py-6 px-6 text-center w-1/4">
                <div className="font-bebas text-3xl text-white">Starter</div>
                <div className="font-ibm-mono text-teal-400 mt-1">$49 / month</div>
              </th>

              <th className="py-6 px-6 text-center w-1/4 bg-amber-400/[0.03] border-x border-t border-amber-400/20 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 font-ibm-mono text-[10px] bg-amber-400 text-black px-3 py-1 font-bold">
                  POPULAR
                </div>
                <div className="font-bebas text-3xl text-white">Growth</div>
                <div className="font-ibm-mono text-amber-400 mt-1">$99 / month</div>
              </th>

              <th className="py-6 px-6 text-center w-1/4">
                <div className="font-bebas text-3xl text-white">Professional</div>
                <div className="font-ibm-mono text-teal-400 mt-1">$199 / month</div>
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Platform access</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Full unlock</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-200">
                Full unlock
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Full unlock</td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Custom algo strategies</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">
                1 (edit only)
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-200">
                Up to 3 (edit only)
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">
                Up to 10 (create &amp; delete)
              </td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Target audience</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm">Beginner</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20">
                Active traders
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Power users</td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Backtesting &amp; analytics</td>
              <td className="py-5 px-6 text-center text-teal-400">✓</td>
              <td className="py-5 px-6 text-center bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-400">
                ✓
              </td>
              <td className="py-5 px-6 text-center text-teal-400">✓</td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Live broker / OpenAlgo</td>
              <td className="py-5 px-6 text-center text-teal-400">✓</td>
              <td className="py-5 px-6 text-center bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-400">
                ✓
              </td>
              <td className="py-5 px-6 text-center text-teal-400">✓</td>
            </tr>
            <tr className="border-b border-zinc-800">
              <td className="py-6 px-4 align-middle" aria-hidden />
              <td className="py-6 px-6 text-center align-middle">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full max-w-[200px] mx-auto font-ibm-mono text-xs uppercase tracking-wider border-teal-500/40 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300"
                  onClick={() => void subscribe("starterPlan")}
                >
                  Subscribe
                </Button>
              </td>
              <td className="py-6 px-6 text-center align-middle bg-amber-400/[0.03] border-x border-b border-amber-400/20">
                <Button
                  type="button"
                  className="w-full max-w-[200px] mx-auto font-ibm-mono text-xs uppercase tracking-wider bg-amber-400 text-black hover:bg-amber-300"
                  onClick={() => void subscribe("growthPlan")}
                >
                  Subscribe
                </Button>
              </td>
              <td className="py-6 px-6 text-center align-middle">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full max-w-[200px] mx-auto font-ibm-mono text-xs uppercase tracking-wider border-teal-500/40 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300"
                  onClick={() => void subscribe("professionalPlan")}
                >
                  Subscribe
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500 font-ibm-mono">
        {user ? "Signed in — choose a plan to open secure Stripe checkout." : "Sign in required to subscribe."}
      </p>
    </div>
  );
}
