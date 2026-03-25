import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { motion, Variants } from "framer-motion";
import { FaCheckCircle } from "react-icons/fa";

import AiPredictionHeader from "@/components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "@/components/landingpage/mainlandingpage/AiPredictionFooter";
import { Button } from "@/components/ui/button";
import { PRICING_PLANS } from "@/constants/pricing";
import { supabase } from "@/integrations/supabase/client";
import { createCheckoutSession } from "@/services/stripeService";
import { toast } from "sonner";

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

  const startPremiumCheckout = async (planId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth?redirect=" + encodeURIComponent("/pricing"));
      return;
    }
    const result = await createCheckoutSession({
      plan_id: planId,
      success_url: window.location.origin + "/algo-setup?checkout=success",
      cancel_url: window.location.origin + "/pricing",
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
        <motion.section
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="container mx-auto px-4 relative z-10 mb-16"
        >
          <motion.div variants={fadeUp} className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tight text-white">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                Pricing
              </span>{" "}
              plans
            </h1>
            <p className="text-zinc-400 text-xl font-light">
              Use AI to analyze probabilities and automate trades with powerful algorithmic
              intelligence. All plans bill annually unless noted.
            </p>
          </motion.div>
        </motion.section>

        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="py-8 bg-zinc-950 border-zinc-900 relative"
        >
          <div className="container mx-auto px-4 relative z-10">
            <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
              {PRICING_PLANS.map((plan) => (
                <motion.div
                  key={plan.id}
                  variants={fadeUp}
                  className={`p-8 rounded-3xl flex flex-col relative transition-all shadow-lg hover:border-zinc-700 ${
                    plan.recommended
                      ? "bg-gradient-to-b from-teal-950/40 to-black border border-teal-500/30 shadow-[0_0_40px_rgba(20,184,166,0.1)] lg:h-[110%] lg:-mt-[5%] lg:mb-[4%]"
                      : "bg-black border border-zinc-800"
                  }`}
                >
                  {plan.recommended && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-teal-500 text-black text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest">
                      Recommended
                    </div>
                  )}
                  <h3
                    className={`text-xl font-bold mb-2 ${
                      plan.recommended ? "text-teal-400" : "text-zinc-200"
                    }`}
                  >
                    {plan.name}
                  </h3>
                  <div
                    className={`${
                      plan.recommended ? "text-zinc-400" : "text-zinc-500"
                    } mb-6 font-light text-sm min-h-[40px]`}
                  >
                    {plan.description}
                  </div>
                  <div className="text-4xl font-black mb-6 tracking-tight text-white">
                    ${plan.price}
                    <span
                      className={`text-lg ${
                        plan.recommended ? "text-zinc-500" : "text-zinc-600"
                      } font-normal ml-1 tracking-normal`}
                    >
                      /{plan.period}
                    </span>
                  </div>
                  <ul
                    className={`space-y-4 mb-10 flex-1 text-sm ${
                      plan.recommended ? "text-zinc-200" : "text-zinc-300"
                    }`}
                  >
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex gap-3 items-center">
                        <FaCheckCircle
                          className={`${
                            plan.recommended ? "text-teal-400" : "text-teal-500"
                          } flex-shrink-0`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => startPremiumCheckout(plan.id)}
                    className={
                      plan.recommended
                        ? "w-full py-6 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl transition-colors shadow-lg shadow-teal-500/20"
                        : "w-full py-6 bg-zinc-100 text-black hover:bg-zinc-300 rounded-xl font-bold transition-colors"
                    }
                  >
                    {plan.recommended ? "Get Pro Plan" : "Get Started"}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      </main>

      <AiPredictionFooter />
    </div>
  );
};

export default PricingPage;
