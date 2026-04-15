import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlarmClock,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  DEFAULT_TRIAL_LIMITS,
  WEBINAR_BATCH_DEFINITIONS,
} from "@/constants/webinarBatches";
import { trackFunnelEvent } from "@/lib/funnelTracking";

type WebinarLeadForm = {
  fullName: string;
  email: string;
  phone: string;
  batchCode: string;
  consent: boolean;
};

const initialForm: WebinarLeadForm = {
  fullName: "",
  email: "",
  phone: "",
  batchCode: WEBINAR_BATCH_DEFINITIONS[0]?.code ?? "",
  consent: false,
};

export default function SignupWebinarLandingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<WebinarLeadForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const upcomingSlots = useMemo(
    () =>
      WEBINAR_BATCH_DEFINITIONS.map((batch) => ({
        code: batch.code,
        name: batch.name,
        tagline: batch.tagline,
      })),
    [],
  );

  useEffect(() => {
    void trackFunnelEvent("landing_view", { page: "signup-webinar-landing" });
  }, []);

  const scrollToLeadForm = () => {
    document.getElementById("reserve-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handlePrimarySignup = () => {
    void trackFunnelEvent("signup_start", {
      source_page: "signup-webinar-landing",
      cta: "start_2_day_access",
    });
    navigate("/auth?entry=meta_webinar");
  };

  const reserveSeat = async () => {
    if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
      toast.error("Please fill name, email, and phone number.");
      return;
    }
    if (!form.consent) {
      toast.error("Please accept consent to receive webinar reminders.");
      return;
    }
    setSubmitting(true);
    try {
      const selected = WEBINAR_BATCH_DEFINITIONS.find((b) => b.code === form.batchCode);
      const description = [
        "Source: Meta webinar campaign landing page",
        `Selected webinar batch: ${selected?.name ?? form.batchCode}`,
        `Batch schedule: ${selected?.tagline ?? "N/A"}`,
      ].join("\n");

      // Keep backward compatibility with existing lead pipeline.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table typed loosely in project
      await (supabase as any).from("contact_submissions").insert([
        {
          name: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          description,
        },
      ]);

      // New webinar registration table (created in migration); keep fail-safe if not yet applied.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration-backed table
      const { data: regRows, error } = await (supabase as any).from("webinar_registrations").insert([
        {
          full_name: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          batch_code: form.batchCode,
          source: "meta_landing",
          status: "registered",
          consent_email: form.consent,
          utm_json: {
            utm_source: new URL(window.location.href).searchParams.get("utm_source"),
            utm_medium: new URL(window.location.href).searchParams.get("utm_medium"),
            utm_campaign: new URL(window.location.href).searchParams.get("utm_campaign"),
          },
        },
      ]).select("id");
      if (error) {
        console.warn("webinar_registrations insert skipped:", error.message);
      } else {
        const regId = regRows?.[0]?.id as string | undefined;
        if (regId) {
          await supabase.functions.invoke("webinar-email-automation", {
            body: {
              action: "registration_confirmation",
              registrationId: regId,
            },
          });
        }
      }

      await trackFunnelEvent("webinar_register", {
        batch_code: form.batchCode,
        source_page: "signup-webinar-landing",
      });
      await trackFunnelEvent("batch_select", {
        batch_code: form.batchCode,
        source_page: "signup-webinar-landing",
      });

      toast.success("Seat reserved. Complete signup to unlock 2-day access.");
      handlePrimarySignup();
    } catch (err) {
      console.error(err);
      toast.error("Could not reserve your seat. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const faqItems = [
    {
      q: "Is this really free?",
      a: "Yes. Webinar access is free. Platform access is limited to a 2-day trial with daily usage caps.",
    },
    {
      q: "Will I be charged automatically after 2 days?",
      a: "No auto-charge is applied by default. You can choose a paid plan only if you decide to continue.",
    },
    {
      q: "Do I need coding experience to attend?",
      a: "No coding is required. The sessions are designed for traders who want practical automation workflows.",
    },
    {
      q: "Will I get reminders for each webinar session?",
      a: "Yes. You will receive registration confirmation and pre-session reminder emails.",
    },
    {
      q: "Does trial include live auto trading?",
      a: "No. Live auto execution is disabled in trial mode. You can still test and validate with limited daily credits.",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>2-Day Platform Access + Free Live Trading Webinar</title>
        <meta
          name="description"
          content="Sign up for 2-day limited platform access with daily credits and reserve your live webinar batch."
        />
      </Helmet>

      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <p className="font-semibold tracking-wide text-zinc-100">
            TradingSmart<span className="text-teal-400">.ai</span>
          </p>
          <Button
            onClick={handlePrimarySignup}
            size="sm"
            className="bg-teal-500 px-4 font-bold text-black hover:bg-teal-400"
          >
            Start 2-Day Access
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-zinc-800 bg-gradient-to-b from-zinc-950 via-black to-black">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_top,rgba(45,212,191,0.15),transparent_55%)]" />
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <Badge className="mb-6 border-teal-500/40 bg-teal-500/15 text-teal-300">
            Meta Campaign Offer - Traders & Algo Interested
          </Badge>
          <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-6xl">
            Stop{" "}
            <span className="text-zinc-500 line-through decoration-rose-500 decoration-2">
              manual trading
            </span>
            . Start{" "}
            <span className="text-teal-400">2-day limited platform access</span>.
          </h1>
          <p className="mt-5 max-w-3xl text-zinc-300 md:text-lg">
            Use credits for backtesting, AI analysis, and signal scans. Reserve a
            free live webinar batch to learn practical stock-market workflows.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handlePrimarySignup}
              className="h-12 bg-teal-500 px-8 font-bold text-black hover:bg-teal-400"
            >
              Start 2-Day Limited Access
            </Button>
            <Button
              variant="outline"
              onClick={scrollToLeadForm}
              className="h-12 border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
            >
              Reserve Webinar Batch
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-4 text-xs text-zinc-400">
            <div className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              No auto-execution in trial
            </div>
            <div className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Transparent limits
            </div>
            <div className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-emerald-400" />
              48-hour access window
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-800 bg-zinc-950/40">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-4 text-xs md:grid-cols-3 md:text-sm">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 font-medium text-zinc-200">
            <span className="text-teal-400">Limited slots:</span> Weekly batches
            run with fixed timings.
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 font-medium text-zinc-200">
            <span className="text-teal-400">3 sessions:</span> Each batch has 3
            sessions x 1 hour.
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 font-medium text-zinc-200">
            <span className="text-teal-400">Action first:</span> Signup + trial
            before webinar.
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl font-bold md:text-3xl">2-Day Access Includes</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="border-zinc-800 bg-zinc-950/50">
            <CardHeader>
              <CardTitle className="text-lg">Daily Usage Limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-300">
              <p>Daily credits: {DEFAULT_TRIAL_LIMITS.dailyCredits}</p>
              <p>Backtests/day: {DEFAULT_TRIAL_LIMITS.backtestsPerDay}</p>
              <p>AI analysis/day: {DEFAULT_TRIAL_LIMITS.aiAnalysisPerDay}</p>
              <p>Signal scans/day: {DEFAULT_TRIAL_LIMITS.scansPerDay}</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-950/50">
            <CardHeader>
              <CardTitle className="text-lg">Important Trial Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-300">
              <p>Trial expires 48 hours from signup.</p>
              <p>No live auto-execution in trial mode.</p>
              <p>Unused daily credits do not carry forward.</p>
              <p>Webinar is free and optional after signup.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="batches" className="border-y border-zinc-800 bg-zinc-950/40">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="mb-8 flex items-center gap-2">
            <AlarmClock className="h-5 w-5 text-teal-400" />
            <h2 className="text-2xl font-bold md:text-3xl">Training Batch Schedule</h2>
          </div>
          <p className="max-w-3xl text-sm text-zinc-400 md:text-base">
            We run 3 weekly batches. Choose the slot that fits your schedule and
            reserve once. The same Zoom link will be shared for all sessions in your batch.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {WEBINAR_BATCH_DEFINITIONS.map((batch) => (
              <Card
                key={batch.code}
                className="border-zinc-800 bg-zinc-950/60 transition hover:-translate-y-0.5 hover:border-teal-500/30"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-white">{batch.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-zinc-300">
                  {batch.sessionsLabel.map((slot) => (
                    <div key={slot} className="rounded-md bg-zinc-900/50 px-3 py-2">
                      {slot}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="reserve-form" className="border-t border-zinc-800 bg-zinc-950/40">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
          <h2 className="text-2xl font-bold md:text-3xl">
            Reserve your webinar batch
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Pick one batch. You will receive email confirmation and reminders.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardContent className="pt-5 text-sm text-zinc-300">
                <p className="font-semibold text-white">Step 1</p>
                Submit this form
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardContent className="pt-5 text-sm text-zinc-300">
                <p className="font-semibold text-white">Step 2</p>
                Get webinar confirmation by email
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardContent className="pt-5 text-sm text-zinc-300">
                <p className="font-semibold text-white">Step 3</p>
                Signup and start your 48-hour trial
              </CardContent>
            </Card>
          </div>
          <Card className="mt-6 border-zinc-800 bg-black/60">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <Label htmlFor="lead-name">Full Name</Label>
                <Input
                  id="lead-name"
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  className="border-zinc-700 bg-zinc-950"
                  placeholder="Your full name"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lead-email">Email</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="border-zinc-700 bg-zinc-950"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-phone">WhatsApp Number</Label>
                  <Input
                    id="lead-phone"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="border-zinc-700 bg-zinc-950"
                    placeholder="+91..."
                  />
                </div>
              </div>
              <Separator className="bg-zinc-800" />
              <div className="space-y-3">
                <Label>Choose Batch</Label>
                <RadioGroup
                  value={form.batchCode}
                  onValueChange={(v) => setForm((p) => ({ ...p, batchCode: v }))}
                >
                  {WEBINAR_BATCH_DEFINITIONS.map((batch) => (
                    <label
                      key={batch.code}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 p-3 hover:border-teal-500/40"
                    >
                      <RadioGroupItem value={batch.code} className="mt-1" />
                      <div>
                        <p className="font-semibold text-white">{batch.name}</p>
                        <p className="text-xs text-zinc-400">{batch.tagline}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="lead-consent"
                  checked={form.consent}
                  onCheckedChange={(v) =>
                    setForm((p) => ({ ...p, consent: v === true }))
                  }
                />
                <Label htmlFor="lead-consent" className="text-sm text-zinc-300">
                  I agree to receive webinar reminders and product communication on email.
                </Label>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={reserveSeat}
                  disabled={submitting}
                  className="h-11 flex-1 bg-teal-500 font-bold text-black hover:bg-teal-400"
                >
                  {submitting ? "Reserving..." : "Reserve My Seat + Continue Signup"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePrimarySignup}
                  className="h-11 flex-1 border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
                >
                  Skip for now, signup directly
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-teal-400" />
          <h2 className="text-2xl font-bold md:text-3xl">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-3">
          {faqItems.map((item, idx) => (
            <Card
              key={item.q}
              className={`border-zinc-800 bg-zinc-950/60 transition ${
                openFaq === idx ? "border-teal-500/30" : ""
              }`}
            >
              <CardContent className="p-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                  onClick={() => setOpenFaq((prev) => (prev === idx ? null : idx))}
                >
                  <span className="font-medium text-zinc-100">{item.q}</span>
                  <span className="text-teal-400">{openFaq === idx ? "-" : "+"}</span>
                </button>
                {openFaq === idx && (
                  <div className="border-t border-zinc-800 px-5 py-4 text-sm text-zinc-300">
                    {item.a}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-800 bg-zinc-950/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 text-center">
          <h3 className="text-2xl font-bold md:text-3xl">
            Ready to test the platform with guided training?
          </h3>
          <p className="max-w-2xl text-zinc-400">
            Join your batch, get limited 2-day platform access, and see how to move
            from manual workflow to structured execution.
          </p>
          <Button
            onClick={handlePrimarySignup}
            className="h-12 bg-teal-500 px-8 font-bold text-black hover:bg-teal-400"
          >
            <Zap className="mr-2 h-4 w-4" />
            Start 2-Day Access
          </Button>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-black/90 p-3 backdrop-blur md:hidden">
        <Button
          onClick={handlePrimarySignup}
          className="h-11 w-full bg-teal-500 font-bold text-black hover:bg-teal-400"
        >
          Start 2-Day Access
        </Button>
      </div>
    </div>
  );
}
