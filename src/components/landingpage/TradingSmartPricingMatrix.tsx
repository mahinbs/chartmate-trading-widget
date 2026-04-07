import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PRICING_PLANS, PRICING_SETUP_AND_MONTHLY_NOTE } from "@/constants/pricing";
import { premiumPlanCheckoutUrls } from "@/lib/premiumCheckoutUrls";
import { createCheckoutSession } from "@/services/stripeService";
import { toast } from "sonner";

function planById(id: string) {
  const p = PRICING_PLANS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown plan ${id}`);
  return p;
}

/**
 * Shared pricing matrix (Starter / Growth / Pro) for marketing pages.
 */
export function TradingSmartPricingMatrix() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const starter = planById("starterPlan");
  const growth = planById("growthPlan");
  const pro = planById("professionalPlan");

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
      <h2 className="font-bebas text-4xl md:text-5xl text-center text-white mb-6 md:mb-16">
        PRICING
      </h2>
      {/* Mobile scroll hint */}
      <p className="md:hidden text-center text-[11px] text-zinc-500 font-ibm-mono mb-4 animate-pulse">
        ← scroll to see all plans →
      </p>
      <div className="-mx-4 px-4 pt-4 pb-4 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        <table className="min-w-[720px] w-full text-left font-ibm-sans border-collapse relative z-10">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="py-6 px-4 font-normal text-zinc-600 underline decoration-zinc-800 underline-offset-4">
                FEATURES
              </th>

              <th className="py-6 px-6 text-center w-1/4">
                <div className="font-bebas text-3xl text-white">{starter.name}</div>
                <div className="font-ibm-mono text-teal-400 mt-2 text-sm leading-snug">
                  <div>${starter.integrationFee} one-time</div>
                  <div className="text-zinc-400">
                    ${starter.price}/mo <span className="text-zinc-500">(after 30 days)</span>
                  </div>
                </div>
              </th>

              <th className="py-6 px-6 text-center w-1/4 bg-amber-400/[0.03] border-x border-t border-amber-400/20 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 font-ibm-mono text-[10px] bg-amber-400 text-black px-3 py-1 font-bold">
                  POPULAR
                </div>
                <div className="font-bebas text-3xl text-white">{growth.name}</div>
                <div className="font-ibm-mono text-amber-400 mt-2 text-sm leading-snug">
                  <div>${growth.integrationFee} one-time</div>
                  <div className="text-zinc-400">
                    ${growth.price}/mo <span className="text-zinc-500">(after 30 days)</span>
                  </div>
                </div>
              </th>

              <th className="py-6 px-6 text-center w-1/4">
                <div className="font-bebas text-3xl text-white">{pro.name}</div>
                <div className="font-ibm-mono text-teal-400 mt-2 text-sm leading-snug">
                  <div>${pro.integrationFee} one-time</div>
                  <div className="text-zinc-400">
                    ${pro.price}/mo <span className="text-zinc-500">(after 30 days)</span>
                  </div>
                </div>
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
                1 (edit access)
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-200">
                Up to 3
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Unlimited</td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Backtesting &amp; analytics</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Standard</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-200">
                Advanced
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">
                Advanced + optimization
              </td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Broker / OpenAlgo</td>
              <td className="py-5 px-6 text-center text-teal-400">✓</td>
              <td className="py-5 px-6 text-center bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-400">
                ✓
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Multi-broker</td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Support</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm">Basic</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-200">
                Priority
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Dedicated</td>
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

      <p className="mt-4 text-center text-[11px] text-zinc-500 font-ibm-mono max-w-2xl mx-auto leading-relaxed">
        {PRICING_SETUP_AND_MONTHLY_NOTE}
      </p>
      <p className="mt-2 text-center text-xs text-zinc-500 font-ibm-mono">
        {user ? "Signed in — choose a plan to open secure Stripe checkout." : "Sign in required to subscribe."}
      </p>
    </div>
  );
}
