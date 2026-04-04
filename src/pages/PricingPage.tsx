import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, Variants } from "framer-motion";
import { FaCheckCircle } from "react-icons/fa";

import AiPredictionHeader from "@/components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "@/components/landingpage/mainlandingpage/AiPredictionFooter";
import { TradingSmartPricingMatrix } from "@/components/landingpage/TradingSmartPricingMatrix";
import { Button } from "@/components/ui/button";
import { PRICING_PLANS } from "@/constants/pricing";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { isMidTierEligibleForProOnlyUpgrade } from "@/lib/subscriptionEntitlements";
import { isAnalysisExceptionEmail } from "@/lib/manualSubscriptionBypass";
import { supabase } from "@/integrations/supabase/client";
import {
  createBillingPortalSession,
  createCheckoutSession,
  hasActiveSubscription,
} from "@/services/stripeService";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const PricingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { subscription, loading: subLoading, hasAnalysisAccess, hasAlgoAccess } =
    useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

  const paid = hasActiveSubscription(subscription);
  const planId = subscription?.plan_id;
  const onProPlan = paid && planId === "proPlan";
  const proUpgradeViaPortal = paid && isMidTierEligibleForProOnlyUpgrade(planId);
  /** DB-granted access with fake Stripe ids (see migrations) — portal would fail. */
  const manualCompedPro = Boolean(
    subscription?.stripe_customer_id?.startsWith("cus_manual_exc_"),
  );

  const visiblePlans = useMemo(() => {
    if (onProPlan) return [];
    if (proUpgradeViaPortal) return PRICING_PLANS.filter((p) => p.id === "proPlan");
    return PRICING_PLANS;
  }, [onProPlan, proUpgradeViaPortal]);

  useEffect(() => {
    if (subLoading) return;
    const f = searchParams.get("feature");

    if (user?.id && f === "analysis" && hasAnalysisAccess) {
      navigate(
        isAnalysisExceptionEmail(user.email) ? "/predict" : "/home",
        { replace: true },
      );
      return;
    }
    if (user?.id && f === "algo" && hasAlgoAccess) {
      navigate("/trading-dashboard", { replace: true });
      return;
    }
    if (user?.id && f === "trades") {
      navigate("/active-trades", { replace: true });
      return;
    }
  }, [
    searchParams,
    subLoading,
    user?.id,
    hasAnalysisAccess,
    hasAlgoAccess,
    navigate,
  ]);

  const startPremiumCheckout = async (planId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth?redirect=" + encodeURIComponent("/pricing"));
      return;
    }
    const origin = window.location.origin;
    const successUrl =
      planId === "botIntegration"
        ? `${origin}/algo-setup?checkout=success`
        : `${origin}/home?checkout=success`;
    const result = await createCheckoutSession({
      plan_id: planId,
      success_url: successUrl,
      cancel_url: `${origin}/pricing`,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.url) window.location.href = result.url;
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
      <Helmet>
        <title>Pricing — TradingSmart.ai</title>
        <meta
          name="description"
          content="AI trading bot integration, probability intelligence, and Pro plan. Simple annual software pricing."
        />
      </Helmet>

      <AiPredictionHeader />

      <main className="pt-36 pb-16">
        <TradingSmartPricingMatrix />
      </main>

      <AiPredictionFooter />
    </div>
  );
};

export default PricingPage;
