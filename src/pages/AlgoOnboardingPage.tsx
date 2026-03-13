import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import BrokerSyncSection from "@/components/trading/BrokerSyncSection";
import BrokerPortfolioCard from "@/components/trading/BrokerPortfolioCard";

interface OnboardingForm {
  full_name: string;
  phone: string;
  broker: string;
  broker_client_id: string;
  capital_amount: string;
  risk_level: string;
  strategy_pref: string;
  notes: string;
}

const EMPTY_FORM: OnboardingForm = {
  full_name: "",
  phone: "",
  broker: "",
  broker_client_id: "",
  capital_amount: "",
  risk_level: "medium",
  strategy_pref: "",
  notes: "",
};

const BROKERS = [
  { value: "zerodha", label: "Zerodha" },
  { value: "upstox", label: "Upstox" },
  { value: "angel", label: "Angel One" },
  { value: "fyers", label: "Fyers" },
  { value: "dhan", label: "Dhan" },
  { value: "other", label: "Other" },
];

const STRATEGIES = [
  { value: "momentum", label: "Momentum Trading" },
  { value: "scalping", label: "Scalping" },
  { value: "swing", label: "Swing Trading" },
  { value: "intraday", label: "Intraday" },
  { value: "positional", label: "Positional" },
];

export default function AlgoOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFromPayment = searchParams.get("checkout") === "success";

  const [userId, setUserId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string>("premium");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [existingBroker, setExistingBroker] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<OnboardingForm>(EMPTY_FORM);

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

      // Grab plan from user_subscriptions
      const { data: sub } = await (supabase as any)
        .from("user_subscriptions")
        .select("plan_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (sub?.plan_id) setPlanId(sub.plan_id);

      // Pre-fill name from profile if available
      const name = session.user.user_metadata?.full_name ?? session.user.email?.split("@")[0] ?? "";
      setForm((f) => ({ ...f, full_name: name }));

      // Check if already submitted
      const { data: existing } = await (supabase as any)
        .from("algo_onboarding")
        .select("id,status")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (existing) {
        setAlreadySubmitted(true);
        setExistingStatus(existing.status ?? null);
        setExistingBroker(existing.broker ?? null);
      }

      setChecking(false);
    })();
  }, [navigate]);

  const set = (k: keyof OnboardingForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    if (!form.full_name.trim() || !form.broker) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);

    const { error } = await (supabase as any).from("algo_onboarding").insert({
      user_id: userId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      broker: form.broker,
      broker_client_id: form.broker_client_id.trim() || null,
      capital_amount: form.capital_amount ? parseFloat(form.capital_amount) : null,
      risk_level: form.risk_level,
      strategy_pref: form.strategy_pref || null,
      notes: form.notes.trim() || null,
      plan_id: planId,
    });

    setSubmitting(false);

    if (error) {
      toast.error("Failed to save your details. Please try again.");
      console.error(error);
      return;
    }

    setDone(true);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (done || alreadySubmitted) {
    const status = done ? "pending" : (existingStatus ?? "pending");
    const broker = existingBroker ?? "other";
    const isProvisioned = status === "provisioned" || status === "active";

    const statusTone =
      status === "active"
        ? "bg-green-500/10 text-green-300 border-green-500/30"
        : status === "provisioned"
          ? "bg-teal-500/10 text-teal-300 border-teal-500/30"
          : "bg-amber-500/10 text-amber-300 border-amber-500/30";
    const statusLabel =
      status === "active"
        ? "Active"
        : status === "provisioned"
          ? "Provisioned — connect your broker below"
          : "Pending setup (24h)";

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-teal-500/10 p-6 border border-teal-500/30">
              <CheckCircle2 className="h-12 w-12 text-teal-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                {done ? "You're all set!" : "Already submitted"}
              </h1>
              <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                {isProvisioned
                  ? "Your algo trading account is ready. Connect your broker below to start placing live orders."
                  : done
                    ? "Our team will configure your algo trading account within 24 hours."
                    : "We already have your details. You can track current onboarding status below."}
              </p>
            </div>
            <div className={`text-xs font-semibold px-4 py-2 rounded-full border ${statusTone}`}>
              Onboarding status: {statusLabel}
            </div>
            {!isProvisioned && (
              <div className="flex items-center gap-1 text-xs text-teal-400 border border-teal-500/30 bg-teal-500/10 rounded-full px-4 py-2">
                <Zap className="h-3.5 w-3.5 mr-1" />
                Algo Trade access active for 1 year
              </div>
            )}
          </div>

          {/* Broker sync + live portfolio once provisioned */}
          {isProvisioned && (
            <>
              <BrokerSyncSection broker={broker} />
              <BrokerPortfolioCard />
            </>
          )}

          <Button
            onClick={() => navigate("/predict")}
            className="w-full bg-teal-500 hover:bg-teal-400 text-black font-bold px-8 rounded-xl"
          >
            Go to Trading Dashboard
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {isFromPayment && (
          <div className="mb-6 flex items-center gap-3 bg-teal-500/10 border border-teal-500/30 rounded-xl px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-teal-400 shrink-0" />
            <p className="text-teal-300 text-sm font-medium">
              Payment successful! Complete this form so our team can activate your algo trading account.
            </p>
          </div>
        )}

        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="rounded-lg bg-teal-500/10 p-2 border border-teal-500/30">
                <TrendingUp className="h-5 w-5 text-teal-400" />
              </div>
              <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/40 text-xs">
                Algo Trade Setup
              </Badge>
            </div>
            <CardTitle className="text-xl font-black">OpenAlgo Onboarding</CardTitle>
            <CardDescription className="text-zinc-400 text-sm">
              Fill in your details below. We'll configure your OpenAlgo account and send you the API credentials via email within 24 hours.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">
                  Full Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="Your full name"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  required
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Phone Number</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>

              {/* Broker */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">
                  Broker <span className="text-red-400">*</span>
                </Label>
                <Select value={form.broker} onValueChange={(v) => set("broker", v)} required>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select your broker" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                    {BROKERS.map((b) => (
                      <SelectItem key={b.value} value={b.value} className="focus:bg-zinc-700">
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Broker Client ID */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Broker Client ID</Label>
                <Input
                  value={form.broker_client_id}
                  onChange={(e) => set("broker_client_id", e.target.value)}
                  placeholder="e.g. AB1234 (Zerodha client ID)"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>

              {/* Capital & Risk */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">Capital (₹)</Label>
                  <Input
                    type="number"
                    value={form.capital_amount}
                    onChange={(e) => set("capital_amount", e.target.value)}
                    placeholder="e.g. 100000"
                    min={0}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">Risk Level</Label>
                  <Select value={form.risk_level} onValueChange={(v) => set("risk_level", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectItem value="low" className="focus:bg-zinc-700">Low</SelectItem>
                      <SelectItem value="medium" className="focus:bg-zinc-700">Medium</SelectItem>
                      <SelectItem value="high" className="focus:bg-zinc-700">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Strategy */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Preferred Strategy</Label>
                <Select value={form.strategy_pref} onValueChange={(v) => set("strategy_pref", v)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Choose a strategy (optional)" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                    {STRATEGIES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="focus:bg-zinc-700">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Additional Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Any specific requirements or questions for our team..."
                  rows={3}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full py-5 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit & Activate Algo Access
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>

              <p className="text-xs text-zinc-500 text-center">
                After submission our team provisions your OpenAlgo account (within 24h). Your Place Order button is already unlocked.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
