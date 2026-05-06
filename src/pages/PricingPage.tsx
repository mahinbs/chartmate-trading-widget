import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { isAnalysisExceptionEmail } from "@/lib/manualSubscriptionBypass";
import NewLandingPage from "@/pages/LandingPage/NewLandingPage";

const PricingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { loading: subLoading, hasAnalysisAccess, hasAlgoAccess } = useSubscription();

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
  }, [searchParams, subLoading, user?.id, hasAnalysisAccess, hasAlgoAccess, navigate]);

  useEffect(() => {
    if (subLoading) return;
    let attempts = 0;
    const maxAttempts = 40;
    const scrollToPricing = () => {
      const pricingSection = document.getElementById("pricing");
      if (pricingSection) {
        pricingSection.scrollIntoView({ block: "start" });
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(scrollToPricing, 50);
      }
    };
    scrollToPricing();
  }, [subLoading]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
      <Helmet>
        <title>Pricing — ChartMate.ai</title>
        <meta
          name="description"
          content="Starter, Growth, and Pro — one-time setup plus monthly plans after 30 days. Full platform access and flexible algo strategy limits."
        />
      </Helmet>
      <NewLandingPage />
    </div>
  );
};

export default PricingPage;
