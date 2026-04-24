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

const STARTER_FEATURES = [
  "1 live strategy",
  "1 broker integration",
  "Live & paper execution 24/7",
  "Basic P&L analytics",
  "Standard backtester",
  "Email support · 24h SLA",
];

const GROWTH_FEATURES = [
  "3 live strategies",
  "3 broker integrations",
  "Advanced backtester",
  "Multi-currency dashboards",
  "Custom alerts & kill-switch",
  "Priority email · 8h SLA",
];

const PRO_FEATURES = [
  "10 live strategies",
  "Unlimited broker integrations",
  "Monte Carlo + walk-forward",
  "Full marketplace access",
  "Custom strategy builder",
  "Priority chat · 4h SLA",
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
            Most popular
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

/**
 * Card-based pricing (Starter / Growth / Pro / Institutional) for marketing pages.
 */
const PROFESSIONAL_PLAN_ID = "professionalPlan" as const;

export function TradingSmartPricingMatrix() {
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
  const byId = Object.fromEntries(plans.map((p) => [p.id, p]));
  const starter = byId.starterPlan;
  const growth = byId.growthPlan;
  const pro = byId.professionalPlan;

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
      toast.success("Your 14-day Pro trial has started.");
      window.location.assign("/home");
    } finally {
      setProCtaLoading(false);
    }
  };

  const onChooseProAndPay = async () => {
    setProCtaLoading(true);
    try {
      await subscribe(PROFESSIONAL_PLAN_ID);
    } finally {
      setProCtaLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 max-w-7xl pb-8 relative">
      <h2 className="font-bebas text-4xl md:text-5xl lg:text-7xl text-center text-white mb-6 md:mb-10">
        Pricing
      </h2>

      <div className="mb-10 rounded-2xl bg-teal-500/[0.06] border border-teal-500/20 px-6 py-5 flex flex-col md:flex-row gap-3 md:items-center md:gap-6">
        <div className="shrink-0 text-teal-400 font-black font-ibm-mono text-sm uppercase tracking-widest">vs. freelancer</div>
        <p className="text-zinc-300 text-sm font-light leading-relaxed">
          {inr ? (
            <>
              A freelance developer often charges{" "}
              <span className="text-white font-bold">₹40,000–₹1,50,000+</span> for a single algo — with no platform, no
              backtesting, and no ongoing support. Our Starter plan gets your strategy coded, tested, and live for{" "}
              <span className="text-teal-400 font-bold">₹13,000 one-time</span>.
            </>
          ) : (
            <>
              A freelance developer often charges{" "}
              <span className="text-white font-bold">$500–$2,000+</span> for a single algo — with no platform, no
              backtesting, and no ongoing support. Our Starter plan gets your strategy coded, tested, and live for{" "}
              <span className="text-teal-400 font-bold">$149 one-time</span>.
            </>
          )}
        </p>
      </div>

      <p className="md:hidden text-center text-[11px] text-zinc-500 font-ibm-mono mb-4 animate-pulse">
        ← scroll to see all plans →
      </p>
      <div className="flex flex-wrap justify-center gap-6 pb-2">
        <PricingCard
          title="Starter"
          inr={inr}
          integrationAmount={starter?.integrationFee ?? 149}
          monthlyAmount={starter?.price ?? 49}
          features={STARTER_FEATURES}
          cta={
            <Button
              type="button"
              variant="outline"
              className="w-full font-ibm-mono text-xs uppercase tracking-wider border-teal-500/40 text-teal-400 hover:bg-teal-500/10"
              onClick={() => void subscribe("starterPlan")}
            >
              Start Starter
            </Button>
          }
        />
        <PricingCard
          title="Growth"
          inr={inr}
          integrationAmount={growth?.integrationFee ?? 299}
          monthlyAmount={growth?.price ?? 99}
          features={GROWTH_FEATURES}
          cta={
            <Button
              type="button"
              className="w-full font-ibm-mono text-xs uppercase tracking-wider bg-amber-400 text-black hover:bg-amber-300"
              onClick={() => void subscribe("growthPlan")}
            >
              Choose Growth
            </Button>
          }
        />
        <PricingCard
          title="Pro"
          popular
          inr={inr}
          integrationAmount={pro?.integrationFee ?? 599}
          monthlyAmount={pro?.price ?? 199}
          features={PRO_FEATURES}
          cta={
            isProPaidStripe ? (
              <Button
                type="button"
                asChild
                className="w-full font-ibm-mono text-xs uppercase tracking-wider bg-zinc-800 text-teal-300 border border-teal-500/40 hover:bg-zinc-700"
              >
                <Link to="/subscription">Manage Pro subscription</Link>
              </Button>
            ) : user ? (
              <Button
                type="button"
                disabled={proCtaLoading || subLoading}
                className="w-full font-ibm-mono text-xs uppercase tracking-wider bg-teal-500 text-black hover:bg-teal-400"
                onClick={() => void subscribe(PROFESSIONAL_PLAN_ID)}
              >
                {proCtaLoading ? "Redirecting…" : "Choose Pro"}
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

      <InstitutionalInquiryModal open={instOpen} onOpenChange={setInstOpen} />

      <p className="mt-6 text-center text-[11px] text-zinc-500 font-ibm-mono max-w-2xl mx-auto leading-relaxed">
        {PRICING_SETUP_AND_MONTHLY_NOTE}
      </p>
      <p className="mt-2 text-center text-xs text-zinc-500 font-ibm-mono">
        {!user
          ? "Sign up free for a 14-day Pro trial (no card), or sign in to choose a plan."
          : isProPaidStripe
            ? "You have an active Pro subscription — use Subscription in the app to manage billing."
            : "Signed in — select any plan to open secure Stripe checkout."}
      </p>
    </div>
  );
}
