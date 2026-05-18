import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronRight, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import BrokerSyncSection from "@/components/trading/BrokerSyncSection";
import BrokerPortfolioCard from "@/components/trading/BrokerPortfolioCard";
import { getTradingIntegration } from "@/services/openalgoIntegrationService";
import { planAllowsAlgo } from "@/lib/subscriptionEntitlements";
import {
  createBillingPortalSession,
  hasActiveSubscription,
  type UserSubscription,
} from "@/services/stripeService";
import { AlgoOnboardingWizard } from "@/components/algo/AlgoOnboardingWizard";

function normalizeBroker(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/_/g, " ");
  if (!raw || raw === "other" || raw === "others") return null;
  if (raw.includes("fyers") || raw.includes("fayer")) return "fyers";
  if (raw.includes("upstox")) return "upstox";
  if (raw.includes("angel")) return "angel";
  if (raw.includes("zerodha") || raw.includes("kite")) return "zerodha";
  return null;
}

export default function AlgoOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFromPayment = searchParams.get("checkout") === "success";

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [defaultName, setDefaultName] = useState("");
  const [planId, setPlanId] = useState<string>("professionalPlan");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [existingBroker, setExistingBroker] = useState<string | null>(null);
  const [existingOnboardingId, setExistingOnboardingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [isRefillingAfterRejection, setIsRefillingAfterRejection] = useState(false);
  const [checking, setChecking] = useState(true);
  const [done, setDone] = useState(false);
  const [hasBrokerIntegration, setHasBrokerIntegration] = useState(false);
  const [tierGate, setTierGate] = useState<"ok" | "prob" | "unpaid">("ok");
  const [portalBusy, setPortalBusy] = useState(false);

  const checkBrokerIntegration = async () => {
    const { data } = await getTradingIntegration();
    const connected =
      !!data?.is_active &&
      !!data?.broker &&
      !!data?.openalgo_api_key?.trim() &&
      !!data?.api_key_encrypted?.trim();
    setHasBrokerIntegration(connected);
  };

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in to continue.");
        navigate("/auth?redirect=/algo-setup");
        return;
      }

      setUserId(session.user.id);
      const fallbackEmail = session.user.email ?? "";
      const fallbackName =
        (session.user.user_metadata?.full_name as string) ??
        session.user.email?.split("@")[0] ??
        "";

      const { data: signupProfile } = await (supabase as any)
        .from("user_signup_profiles")
        .select("full_name, email")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setUserEmail(
        (signupProfile?.email as string | null | undefined)?.trim() || fallbackEmail,
      );
      setDefaultName(
        (signupProfile?.full_name as string | null | undefined)?.trim() || fallbackName,
      );

      const { data: sub } = await (supabase as any)
        .from("user_subscriptions")
        .select("plan_id, status, current_period_end, stripe_customer_id, stripe_subscription_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (sub?.plan_id) setPlanId(sub.plan_id);

      const subTyped = sub as UserSubscription | null;
      if (!hasActiveSubscription(subTyped)) {
        setTierGate("unpaid");
      } else if (subTyped?.plan_id === "probIntelligence") {
        setTierGate("prob");
      } else if (!planAllowsAlgo(subTyped?.plan_id)) {
        setTierGate("unpaid");
      } else {
        setTierGate("ok");
      }

      const { data: existing } = await (supabase as any)
        .from("algo_onboarding")
        .select("id, status, broker, broker_client_id, notes, rejection_reason")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (existing) {
        setExistingOnboardingId(existing.id ?? null);
        if (existing.status === "provisioned" || existing.status === "active") {
          navigate("/trading-dashboard", { replace: true });
          return;
        }
        setAlreadySubmitted(true);
        setExistingStatus(existing.status ?? null);
        setExistingBroker(
          normalizeBroker(existing.broker) ??
          normalizeBroker(existing.broker_client_id) ??
          normalizeBroker(existing.notes) ??
          "zerodha",
        );
        setRejectionReason((existing.rejection_reason as string | null | undefined) ?? null);
      }

      await checkBrokerIntegration();
      setChecking(false);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!(done || alreadySubmitted)) return;
    const status = done ? "pending" : (existingStatus ?? "pending");
    const isProvisioned = status === "provisioned" || status === "active";
    if (!isProvisioned) return;
    const id = setInterval(() => {
      checkBrokerIntegration();
    }, 10_000);
    return () => clearInterval(id);
  }, [done, alreadySubmitted, existingStatus]);

  if (checking || !userId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (tierGate === "prob") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="text-xl font-black">Live algo is not on your current plan</CardTitle>
            <CardDescription className="text-zinc-400">
              Probability ($99) includes detailed analysis and paper trading. OpenAlgo live execution is
              included on <strong className="text-zinc-200">Bot ($49)</strong> or{" "}
              <strong className="text-zinc-200">Pro</strong>. Upgrade to{" "}
              <strong className="text-teal-400">Pro</strong> in billing to get both.
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6 flex flex-col sm:flex-row gap-3">
            <Button
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold"
              disabled={portalBusy}
              onClick={async () => {
                setPortalBusy(true);
                const r = await createBillingPortalSession();
                setPortalBusy(false);
                if ("error" in r) {
                  toast.error(r.error);
                  return;
                }
                window.location.href = r.url;
              }}
            >
              {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open billing portal"}
            </Button>
            <Button variant="outline" className="border-zinc-600" onClick={() => navigate("/subscription")}>
              Subscription help
            </Button>
            <Button variant="ghost" className="text-zinc-400" onClick={() => navigate("/home")}>
              Back to dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (tierGate === "unpaid") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="text-xl font-black">Subscribe to use Algo setup</CardTitle>
            <CardDescription className="text-zinc-400">
              OpenAlgo onboarding is for paid plans with live algo. Choose a plan to continue.
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6 flex flex-col sm:flex-row gap-3">
            <Button className="bg-teal-500 hover:bg-teal-400 text-black font-bold" onClick={() => navigate("/pricing?feature=algo")}>
              View plans
            </Button>
            <Button variant="outline" className="border-zinc-600" onClick={() => navigate("/home")}>
              Back to dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const showSubmittedState = done || (alreadySubmitted && !isRefillingAfterRejection);

  if (showSubmittedState) {
    const status = done ? "pending" : (existingStatus ?? "pending");
    const broker = existingBroker ?? "zerodha";
    const isProvisioned = status === "provisioned" || status === "active";
    const isRejected = status === "rejected";

    if (isProvisioned) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-teal-500/10 p-6 border border-teal-500/30">
                <CheckCircle2 className="h-12 w-12 text-teal-400" />
              </div>
              <h1 className="text-2xl font-black text-white">Account ready</h1>
              <p className="text-zinc-400 text-sm">
                Connect your broker below, then open the trading dashboard.
              </p>
            </div>
            <BrokerSyncSection broker={broker} />
            {hasBrokerIntegration ? <BrokerPortfolioCard /> : null}
            <Button
              onClick={() => navigate("/trading-dashboard")}
              disabled={!hasBrokerIntegration}
              className="w-full bg-teal-500 hover:bg-teal-400 text-black font-bold"
            >
              {!hasBrokerIntegration ? "Connect broker to continue" : "Go to trading dashboard"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      );
    }

    if (isRejected) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg space-y-5">
            <Card className="bg-zinc-900 border-rose-500/30 text-white">
              <CardHeader>
                <CardTitle className="text-xl font-black text-rose-300">Application rejected</CardTitle>
                <CardDescription className="text-zinc-300">
                  Super admin asked for corrections before approval. Please review the reason and submit the form again.
                </CardDescription>
              </CardHeader>
              <div className="px-6 pb-6">
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100 leading-relaxed">
                  {rejectionReason?.trim() || "Your form was rejected. Please review details and re-submit."}
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-5">
                  <Button
                    onClick={() => setIsRefillingAfterRejection(true)}
                    className="bg-teal-500 hover:bg-teal-400 text-black font-bold"
                  >
                    Refill form
                  </Button>
                  <Button
                    onClick={() => navigate("/home")}
                    variant="outline"
                    className="border-zinc-600"
                  >
                    Back to dashboard
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="rounded-full bg-teal-500/10 p-6 border border-teal-500/30 mx-auto w-fit">
            <CheckCircle2 className="h-12 w-12 text-teal-400" />
          </div>
          <h1 className="text-2xl font-black text-white">Form submitted</h1>
          <p className="text-zinc-400 text-sm max-w-sm mx-auto leading-relaxed">
            Thank you! Our team will set up your account and get back to you shortly. You will receive an email when
            your OpenAlgo access is ready.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => navigate("/home")}
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold"
            >
              Go to dashboard
            </Button>
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              className="border-zinc-600"
            >
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center py-6 px-4">
      {isFromPayment && (
        <div className="w-full max-w-2xl mb-6 flex items-center gap-3 bg-teal-500/10 border border-teal-500/30 rounded-xl px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-teal-400 shrink-0" />
          <p className="text-teal-300 text-sm font-medium">
            Payment successful! Complete the steps below so our team can provision your OpenAlgo access.
          </p>
        </div>
      )}

      <div className="w-full max-w-2xl mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-center sm:text-left">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="rounded-lg bg-teal-500/10 p-2 border border-teal-500/30">
                <TrendingUp className="h-5 w-5 text-teal-400" />
              </div>
              <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/40 text-xs">Algo trading setup</Badge>
            </div>
            <h1 className="text-2xl font-black text-white">Request access &amp; KYC</h1>
            <p className="text-zinc-500 text-sm mt-1">
              6 steps — same details we use to create your OpenAlgo API access after admin review.
            </p>
          </div>
          <Button variant="outline" className="border-zinc-600 shrink-0" onClick={() => navigate("/home")}>
            Back to dashboard
          </Button>
        </div>
      </div>

      <AlgoOnboardingWizard
        userId={userId}
        userEmail={userEmail}
        defaultName={defaultName}
        planId={planId}
        onboardingId={isRefillingAfterRejection ? existingOnboardingId : null}
        onSuccess={() => setDone(true)}
        onCancel={() => navigate("/home")}
      />
    </div>
  );
}
