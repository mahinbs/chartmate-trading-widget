import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { PRICING_PLANS, PRICING_PLANS_INR, PRICING_SETUP_AND_MONTHLY_NOTE } from "@/constants/pricing";
import { premiumPlanCheckoutUrls } from "@/lib/premiumCheckoutUrls";
import { createCheckoutSession, startProTrial } from "@/services/stripeService";
import { toast } from "sonner";
import { InstitutionalInquiryModal } from "@/components/InstitutionalInquiryModal";
import { useUserCurrency } from "@/hooks/useUserCurrency";

const ALGO_PLATFORM_FEATURES = [
  "Live strategy deployment",
  "Broker connectivity & encrypted API vault",
  "Hands-off automation & execution guardrails",
  "Multi-account monitoring & Telegram alerts",
  "Platform access for validation workflows",
  "Engineer-assisted go-live (~72 h typical)",
];

const INSTITUTIONAL_FEATURES = [
  "Unlimited strategies & brokers",
  "Dedicated infrastructure",
  "SOC 2 Type II audit logs",
  "White-label dashboards",
  "Dedicated account manager",
  "24/7 phone support",
];

type CardProps = {
  title: string;
  popular?: boolean;
  features: string[];
  cta: ReactNode;
  /** India: INTEGRATION / MAINTENANCE boxes; US: one-time + monthly stack */
  inr: boolean;
  /** null = Custom (Institutional) */
  integrationAmount: number | null;
  monthlyAmount: number | null;
};

function PricingCard({ title, popular, inr, integrationAmount, monthlyAmount, features, cta }: CardProps) {
  const isCustom = integrationAmount === null || monthlyAmount === null;

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-zinc-950/50 p-6 min-w-[260px] max-w-sm flex-1 ${
        popular ? "border-teal-500/50 shadow-[0_0_40px_rgba(20,184,166,0.12)]" : "border-zinc-800/80"
      }`}
    >
      {popular && (
        <div className="mb-3 text-center">
          <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-widest text-teal-400">
            Live execution
          </span>
        </div>
      )}
      <h3 className="font-bebas text-3xl text-white text-center">{title}</h3>

      {inr && !isCustom ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/70 px-4 py-3 text-center">
            <div className="font-ibm-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Integration
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-center gap-1.5">
              <span className="font-ibm-mono text-2xl text-white">
                ₹{integrationAmount.toLocaleString("en-IN")}
              </span>
              <span className="font-ibm-mono text-[11px] text-zinc-500">one-time</span>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/70 px-4 py-3 text-center">
            <div className="font-ibm-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Maintenance
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-center gap-1.5">
              <span className="font-ibm-mono text-2xl text-teal-400">
                ₹{monthlyAmount.toLocaleString("en-IN")}
              </span>
              <span className="font-ibm-mono text-[11px] text-zinc-500">/month</span>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500 font-ibm-sans">(after first 30 days)</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 text-center">
          <div className="font-ibm-mono text-xs uppercase tracking-wider text-zinc-500">One-time integration</div>
          <div className="mt-1 font-ibm-mono text-2xl text-white">
            {isCustom ? "Custom" : `$${integrationAmount}`}
          </div>
          <div className="mt-2 text-zinc-500 font-ibm-mono text-sm">+</div>
          <div className="font-ibm-mono text-xs uppercase tracking-wider text-zinc-500">Monthly</div>
          <div className="mt-1 font-ibm-mono text-2xl text-teal-400">
            {isCustom ? "Custom" : `$${monthlyAmount}/mo`}
          </div>
          {!isCustom && (
            <p className="mt-2 text-[10px] text-zinc-500 font-ibm-sans">(after first 30 days)</p>
          )}
        </div>
      )}

      <ul className="mt-6 flex-1 space-y-2.5 text-left text-sm text-zinc-300">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="h-4 w-4 shrink-0 text-teal-500/90 mt-0.5" aria-hidden />
            <span className="leading-snug">{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
    </div>
  );
}

const PROFESSIONAL_PLAN_ID = "professionalPlan" as const;

export function ChartMatePricingMatrix() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, loading: subLoading } = useSubscription();
  const { currency } = useUserCurrency();
  const inr = currency === "INR";
  const [instOpen, setInstOpen] = useState(false);
  const [proCtaLoading, setProCtaLoading] = useState(false);
  const isProPaidStripe =
    Boolean(user) &&
    !subLoading &&
    subscription?.plan_id === PROFESSIONAL_PLAN_ID &&
    (subscription?.status === "active" || subscription?.status === "trialing");
  const plans = inr ? PRICING_PLANS_INR : PRICING_PLANS;
  const algo = plans.find((p) => p.id === PROFESSIONAL_PLAN_ID) ?? plans[0];

  const subscribe = async (planId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const base = "/auth?subscribe_plan=" + encodeURIComponent(planId);
      navigate(inr ? `${base}&currency=INR` : base);
      return;
    }
    const { success_url, cancel_url } = premiumPlanCheckoutUrls(planId);
    const result = await createCheckoutSession({
      plan_id: planId,
      success_url,
      cancel_url,
      currency: inr ? "inr" : "usd",
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.url) window.location.href = result.url;
  };

  const onStartProTrial = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate(
        inr
          ? "/auth?subscribe_plan=professionalPlan&pro_trial=1&currency=INR"
          : "/auth?subscribe_plan=professionalPlan&pro_trial=1",
      );
      return;
    }
    setProCtaLoading(true);
    try {
      const r = await startProTrial();
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Your 14-day trial has started.");
      window.location.assign("/home");
    } finally {
      setProCtaLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 max-w-7xl pb-8 relative">
      <h2 className="font-bebas text-4xl md:text-5xl lg:text-7xl text-center text-white mb-6 md:mb-10">
        Pricing
      </h2>

      <div className="mb-8 rounded-2xl border border-purple-500/25 bg-purple-500/[0.07] px-6 py-4 text-center">
        <p className="font-bebas text-xl md:text-3xl tracking-tight text-white">
          Pro + Algo = <span className="text-teal-400">Complete Trading System</span>
        </p>
        <p className="mt-2 text-sm text-zinc-400 font-ibm-sans">
          Validate and stress-test on TradingSmart.ai (analysis &amp; simulation), then deploy the same playbook live with
          Algo automation and broker integrations.
        </p>
      </div>

      <div className="mb-10 rounded-2xl bg-teal-500/[0.06] border border-teal-500/20 px-6 py-5 flex flex-col md:flex-row gap-3 md:items-center md:gap-6">
        <div className="shrink-0 text-teal-400 font-black font-ibm-mono text-sm uppercase tracking-widest">
          Why one plan
        </div>
        <p className="text-zinc-300 text-sm font-light leading-relaxed">
          {inr ? (
            <>
              Freelancers often charge{" "}
              <span className="text-white font-bold">₹40,000–₹1,50,000+</span> per algo—with no maintained platform.
              One Algo Platform price covers{" "}
              <span className="text-teal-400 font-bold">live deployment, broker wiring, and automation</span>
              {""} plus ongoing reliability.
            </>
          ) : (
            <>
              Freelancers often charge{" "}
              <span className="text-white font-bold">$500–$2,000+</span> per one-off bots—with no platform or support SLA.
              Our single Algo plan bundles{" "}
              <span className="text-teal-400 font-bold">deployment, broker integration, and automation</span>
              {""} without tier confusion.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-6 pb-2 max-w-5xl mx-auto">
        <PricingCard
          title="Algo Platform"
          popular
          inr={inr}
          integrationAmount={algo.integrationFee}
          monthlyAmount={algo.price}
          features={ALGO_PLATFORM_FEATURES}
          cta={
            isProPaidStripe ? (
              <Button
                type="button"
                asChild
                className="w-full font-ibm-mono text-xs uppercase tracking-wider bg-zinc-800 text-teal-300 border border-teal-500/40 hover:bg-zinc-700"
              >
                <Link to="/subscription">Manage subscription</Link>
              </Button>
            ) : user ? (
              <Button
                type="button"
                disabled={proCtaLoading || subLoading}
                className="w-full font-ibm-mono text-xs uppercase tracking-wider bg-teal-500 text-black hover:bg-teal-400"
                onClick={() => void subscribe(PROFESSIONAL_PLAN_ID)}
              >
                {proCtaLoading ? "Redirecting…" : "Get Algo Platform"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={proCtaLoading}
                className="w-full font-ibm-mono text-xs uppercase tracking-wider bg-teal-500 text-black hover:bg-teal-400"
                onClick={() => void onStartProTrial()}
              >
                {proCtaLoading ? "Starting…" : "Start 14-day trial"}
              </Button>
            )
          }
        />
        <PricingCard
          title="Institutional"
          inr={inr}
          integrationAmount={null}
          monthlyAmount={null}
          features={INSTITUTIONAL_FEATURES}
          cta={
            <Button
              type="button"
              variant="outline"
              className="w-full font-ibm-mono text-xs uppercase tracking-wider border-zinc-600 text-zinc-200 hover:bg-zinc-800"
              onClick={() => setInstOpen(true)}
            >
              Talk to sales
            </Button>
          }
        />
      </div>

      <p className="mt-8 text-center max-w-3xl mx-auto text-[11px] text-zinc-500 font-ibm-sans">
        {PRICING_SETUP_AND_MONTHLY_NOTE}
      </p>
      <InstitutionalInquiryModal open={instOpen} onOpenChange={setInstOpen} />
    </div>
  );
}
