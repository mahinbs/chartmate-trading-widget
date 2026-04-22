import { useEffect, useMemo, useState } from "react";
import type { CountryCode } from "libphonenumber-js";
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
import heroVid from "../assets/landingpage/hero-vid.webm";
import logoImg from "@/assets/logo.png";
import {
  AlarmClock,
  ArrowRight,
  CandlestickChart,
  CheckCircle2,
  Clock3,
  Cpu,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  DEFAULT_TRIAL_LIMITS,
  WEBINAR_BATCH_DEFINITIONS,
} from "@/constants/webinarBatches";
import { trackFunnelEvent } from "@/lib/funnelTracking";
import { PhoneCountryCodeCombobox } from "@/components/auth/PhoneCountryCodeCombobox";
import {
  buildE164FromNational,
  DEFAULT_SIGNUP_PHONE_ISO,
} from "@/lib/countryDialCodes";

type WebinarLeadForm = {
  fullName: string;
  email: string;
  phoneCountryIso: CountryCode;
  phoneNational: string;
  batchCode: string;
  consent: boolean;
};

type AlgoContactForm = {
  fullName: string;
  email: string;
  phone: string;
  requirements: string;
};

const initialForm: WebinarLeadForm = {
  fullName: "",
  email: "",
  phoneCountryIso: DEFAULT_SIGNUP_PHONE_ISO as CountryCode,
  phoneNational: "",
  batchCode: WEBINAR_BATCH_DEFINITIONS[0]?.code ?? "",
  consent: false,
};

const initialAlgoContactForm: AlgoContactForm = {
  fullName: "",
  email: "",
  phone: "",
  requirements: "",
};

export default function SignupWebinarLandingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<WebinarLeadForm>(initialForm);
  const [algoContactForm, setAlgoContactForm] = useState<AlgoContactForm>(initialAlgoContactForm);
  const [submitting, setSubmitting] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Moving hero background (ported from the white-label hero)
  const [squares, setSquares] = useState<{ top: number; left: number }[]>([]);
  const [drops, setDrops] = useState<
    { id: number; key: number; left: number; duration: number; delay: number }[]
  >([]);

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

  useEffect(() => {
    const getUniqueLeft = () => Math.floor(Math.random() * 20) * 80;

    const generateSquares = () => {
      const newSquares: { top: number; left: number }[] = [];
      const numSquares = 5;
      for (let i = 0; i < numSquares; i++) {
        const top = Math.floor(Math.random() * 10) * 80;
        const left = Math.floor(Math.random() * 20) * 80;
        newSquares.push({ top, left });
      }
      setSquares(newSquares);
    };

    const initDrops = () => {
      const newDrops: { id: number; key: number; left: number; duration: number; delay: number }[] =
        [];
      const numDrops = 3;
      for (let i = 0; i < numDrops; i++) {
        const left = getUniqueLeft();
        const duration = 2 + Math.random() * 2;
        const delay = Math.random() * 3;
        newDrops.push({ id: i, key: i, left, duration, delay });
      }
      setDrops(newDrops);
    };

    generateSquares();
    initDrops();

    const interval = window.setInterval(generateSquares, 2000);
    return () => window.clearInterval(interval);
  }, []);

  const handleDropAnimationEnd = (dropId: number) => {
    const getUniqueLeft = () => Math.floor(Math.random() * 20) * 80;

    setDrops((prevDrops) =>
      prevDrops.map((drop) => {
        if (drop.id !== dropId) return drop;
        return {
          ...drop,
          key: drop.key + 1,
          left: getUniqueLeft(),
          duration: 2 + Math.random() * 2,
          delay: Math.random() * 2,
        };
      }),
    );
  };

  const scrollToLeadForm = () => {
    document.getElementById("reserve-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const getLandingPhoneE164 = () =>
    buildE164FromNational(form.phoneCountryIso, form.phoneNational.trim());

  const persistSignupPrefill = () => {
    try {
      localStorage.setItem("signup_prefill_full_name", form.fullName.trim());
      localStorage.setItem("signup_prefill_email", form.email.trim().toLowerCase());
      localStorage.setItem("signup_prefill_phone_iso", form.phoneCountryIso);
      localStorage.setItem("signup_prefill_phone_national", form.phoneNational.trim());
      localStorage.setItem("signup_prefill_batch_code", form.batchCode);
    } catch {
      // Ignore storage failures.
    }
  };

  const handlePrimarySignup = () => {
    void trackFunnelEvent("signup_start", {
      source_page: "signup-webinar-landing",
      cta: "start_2_day_access",
    });

    // Persist UTM attribution so AuthPage can store it into `user_signup_tracking`.
    try {
      const url = new URL(window.location.href);
      const p = url.searchParams;
      localStorage.setItem("signup_utm_source", p.get("utm_source") ?? "");
      localStorage.setItem("signup_utm_medium", p.get("utm_medium") ?? "");
      localStorage.setItem("signup_utm_campaign", p.get("utm_campaign") ?? "");
    } catch {
      // Ignore.
    }

    persistSignupPrefill();
    navigate("/auth?entry=meta_webinar&tab=signup");
  };

  const reserveSeat = async () => {
    const phoneE164 = getLandingPhoneE164();
    if (!form.fullName.trim() || !form.email.trim() || !phoneE164) {
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
          phone: phoneE164,
          description,
        },
      ]);

      // New webinar registration table (created in migration); keep fail-safe if not yet applied.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration-backed table
      const { data: regRows, error } = await (supabase as any).from("webinar_registrations").insert([
        {
          full_name: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: phoneE164,
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

  const submitCustomAlgoContact = async () => {
    if (
      !algoContactForm.fullName.trim() ||
      !algoContactForm.email.trim() ||
      !algoContactForm.phone.trim()
    ) {
      toast.error("Please fill name, email, and phone number.");
      return;
    }

    setContactSubmitting(true);
    try {
      const description = [
        "Source: Signup webinar landing - custom algo contact form",
        "Intent: Custom algo trade setup request",
        `Requirements: ${algoContactForm.requirements.trim() || "Not provided"}`,
      ].join("\n");

      // Keep using existing contact pipeline for sales follow-up.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table typed loosely in project
      await (supabase as any).from("contact_submissions").insert([
        {
          name: algoContactForm.fullName.trim(),
          email: algoContactForm.email.trim().toLowerCase(),
          phone: algoContactForm.phone.trim(),
          description,
        },
      ]);

      await trackFunnelEvent("demo_booked", {
        source_page: "signup-webinar-landing",
        contact_type: "custom_algo_setup",
      });

      toast.success("Thanks! Our team will contact you shortly.");
      setAlgoContactForm(initialAlgoContactForm);
      navigate("/contact-us");
    } catch (error) {
      console.error(error);
      toast.error("Could not submit your request. Please try again.");
    } finally {
      setContactSubmitting(false);
    }
  };

  const faqItems = [
    {
      q: "Is this really free?",
      a: "Yes. First complete platform signup to activate your 2-day free trial, then unlock the free stock market training batch.",
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
      a: "No. Live auto execution is disabled in trial mode. Trial is designed for guided testing, paper trading, and strategy setup.",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>2-Day Platform Access + Free Live Trading Webinar</title>
        <meta
          name="description"
          content="Start a 2-day free trial with 10 backtests, 10 paper trades, 10 AI analyses, and 1 strategy creation per day plus free live training."
        />
      </Helmet>

      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="TradingSmart.ai" className="h-7 w-7 object-contain" />
            <p
              className="font-semibold tracking-wide text-zinc-100"
              style={{ fontFamily: "'Google Sans', sans-serif" }}
            >
              TradingSmart<span className="text-teal-400">.ai</span>
            </p>
          </div>
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
        <div className="pointer-events-none absolute inset-0 z-0 [background:radial-gradient(circle_at_top,rgba(45,212,191,0.15),transparent_55%)]" />

        {/* Moving grid background behind all hero content */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: "80px 80px",
          }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse z-0 hidden md:block" />

          {squares.map((pos, index) => (
            <div
              key={`square-${index}`}
              className="absolute w-[80px] h-[80px] bg-cyan-500/10 transition-all duration-1000 ease-in-out"
              style={{
                top: `${pos.top}px`,
                left: `${pos.left}px`,
              }}
            />
          ))}

          {drops.map((drop) => (
            <div
              key={`${drop.id}-${drop.key}`}
              className="absolute w-[2px] h-[150px] bg-gradient-to-b from-transparent to-cyan-500 animate-drop"
              style={{
                left: `${drop.left}px`,
                top: "-150px",
                animationDuration: `${drop.duration}s`,
                animationDelay: `${drop.delay}s`,
              }}
              onAnimationEnd={() => handleDropAnimationEnd(drop.id)}
            />
          ))}
        </div>

        <div className="mx-auto w-full max-w-[1400px] px-4 py-14 md:py-16 relative z-10">
          <Badge className="mb-6 border-teal-500/40 bg-teal-500/15 text-teal-300">
            The future of trading execution is here
          </Badge>
          <h1
            className="max-w-[1100px] text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-6xl lg:text-7xl xl:text-8xl"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            <span className="block" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Stop{" "}
              <span
                className="text-zinc-500 line-through decoration-rose-500 decoration-2"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                manual trading
              </span>
              .
            </span>
            <span
              className="mt-1 block text-teal-400"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              Trade smarter.
            </span>
            <span
              className="mt-1 block text-white"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              Let the{" "}
              <span
                className="text-teal-400"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                robot
              </span>{" "}
              do it.
            </span>
          </h1>
          <p className="mt-5 max-w-[860px] text-zinc-300 md:text-lg">
            The future of trading is algo trading. Stop guessing and chart-watching
            manually. Sign up on the platform first to unlock your 2-day free trial,
            and get free stock market training if you want to learn from scratch.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handlePrimarySignup}
              className="h-12 bg-teal-500 px-8 font-bold text-black hover:bg-teal-400"
            >
              GET FREE 2 DAY ACCESS
            </Button>
            <Button
              variant="outline"
              onClick={scrollToLeadForm}
              className="h-12 border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
            >
              Get free stock market training
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
            <div className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              Free stock market training included
            </div>
          </div>
          <div className="mt-6 w-full max-w-3xl xl:max-w-4xl overflow-hidden rounded-2xl border border-teal-500/20 bg-zinc-950/60 p-1.5 shadow-[0_0_40px_rgba(20,184,166,0.12)]">
            <div className="overflow-hidden rounded-xl border border-zinc-800">
              <video
                autoPlay
                loop
                muted
                playsInline
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                className="h-auto w-full object-cover"
              >
                <source src={heroVid} type="video/webm" />
              </video>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-800 bg-zinc-950/30">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-12 md:py-16">
          <div className="max-w-4xl">
            <h2
              className="text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl lg:text-6xl"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              Why Serious Traders Move to{" "}
              <span
                className="text-teal-400"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Algo Trading
              </span>
            </h2>
            <p className="mt-3 text-sm text-zinc-400 md:text-base">
              Manual execution often breaks discipline. Algo workflows help you trade
              with predefined logic, faster execution, and measurable consistency.
            </p>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardHeader className="pb-2">
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
                  <ShieldCheck className="h-5 w-5 text-teal-300" />
                </div>
                <CardTitle className="text-base text-teal-400 [font-family:'Barlow_Condensed',sans-serif]">
                  Reduce Emotional Decisions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">
                Execute rules instead of impulses. Stick to your setup, entry, and risk
                plan with less hesitation.
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardHeader className="pb-2">
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
                  <CandlestickChart className="h-5 w-5 text-teal-300" />
                </div>
                <CardTitle className="text-base text-teal-400 [font-family:'Barlow_Condensed',sans-serif]">
                  Test Before You Risk Capital
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">
                Validate ideas with backtesting and paper trading before you move to live
                deployment.
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardHeader className="pb-2">
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
                  <Cpu className="h-5 w-5 text-teal-300" />
                </div>
                <CardTitle className="text-base text-teal-400 [font-family:'Barlow_Condensed',sans-serif]">
                  Scale With Structured Execution
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">
                Convert proven strategy logic into a custom, broker-connected workflow
                designed for repeatable execution.
              </CardContent>
            </Card>
          </div>
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-black/50 p-5 md:flex md:items-center md:justify-between">
            <p className="text-sm text-zinc-300">
              Start with free training and a 2-day trial, then decide if a custom algo
              setup is right for your trading goals.
            </p>
            <Button
              onClick={handlePrimarySignup}
              className="mt-4 h-11 bg-teal-500 px-6 font-bold text-black hover:bg-teal-400 md:mt-0"
            >
              Start 2-Day Limited Access
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-800 bg-black">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-12 md:py-16">
          <h2
            className="text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl lg:text-6xl"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            <span
              className="text-teal-400"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              Free
            </span>{" "}
            Live Stock Market Training
          </h2>
          <p className="mt-3 max-w-4xl text-sm text-zinc-400 md:text-base">
            If you are serious about learning the stock market, this is for you. Join
            our free 3-session live program where we cover market structure, chart
            reading, strategy thinking, risk control, and practical AI-assisted trading
            workflows.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardHeader className="pb-2">
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
                  <GraduationCap className="h-5 w-5 text-teal-300" />
                </div>
                <CardTitle className="text-base text-teal-400 [font-family:'Barlow_Condensed',sans-serif]">
                  Session 1: Market Foundations
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">
                Understand market participants, price movement, market phases, and the
                common mistakes that hurt retail traders.
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardHeader className="pb-2">
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
                  <CandlestickChart className="h-5 w-5 text-teal-300" />
                </div>
                <CardTitle className="text-base text-teal-400 [font-family:'Barlow_Condensed',sans-serif]">
                  Session 2: Charts, Strategy, Risk
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">
                Learn chart reading, strategy frameworks, entries/exits, and risk
                management with practical examples.
              </CardContent>
            </Card>
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardHeader className="pb-2">
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
                  <Cpu className="h-5 w-5 text-teal-300" />
                </div>
                <CardTitle className="text-base text-teal-400 [font-family:'Barlow_Condensed',sans-serif]">
                  Session 3: AI + Execution Workflow
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-300">
                See how AI analysis and structured execution workflows can reduce
                emotional decisions and improve consistency.
              </CardContent>
            </Card>
          </div>
          <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-zinc-300">
              Free live training <ArrowRight className="mx-1 inline h-4 w-4 text-teal-400" />
              practical curriculum <ArrowRight className="mx-1 inline h-4 w-4 text-teal-400" />
              real market-ready framework.
            </p>
            <Button
              onClick={handlePrimarySignup}
              variant="outline"
              className="border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
            >
              Sign Up to Unlock Training
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-800 bg-zinc-950/40">
        <div className="mx-auto grid w-full max-w-[1400px] gap-3 px-4 py-4 text-xs md:grid-cols-3 md:text-sm">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 font-medium text-zinc-200">
            <span className="text-teal-400">Limited slots:</span> Weekly batches
            run with fixed timings.
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 font-medium text-zinc-200">
            <span className="text-teal-400">3 sessions:</span> Each batch has 3
            sessions x 1 hour.
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 font-medium text-zinc-200">
            <span className="text-teal-400">Open access:</span> Training is open to
            beginners, active traders, and algo-curious learners.
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1400px] px-4 py-12 md:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300 md:text-sm">
          Your 2-Day Trial
        </p>
        <h2
          className="mt-4 text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl lg:text-6xl"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          Full Platform.
          <br />
          Zero Cost.
          <br />
          <span
            className="text-teal-400"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            48 Hours.
          </span>
        </h2>
        <p className="mt-3 max-w-4xl text-sm text-zinc-400 md:text-base">
          Here is exactly what you get for free in your 2-day trial access so you can
          test the platform with clear daily limits.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="border-zinc-800 bg-zinc-950/50">
            <CardHeader>
              <CardTitle className="text-lg [font-family:'Barlow_Condensed',sans-serif]">
                What You Get Free for 2 Days
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-300">
              <p>Backtests/day: {DEFAULT_TRIAL_LIMITS.backtestsPerDay}</p>
              <p>Paper trades/day: {DEFAULT_TRIAL_LIMITS.paperTradesPerDay}</p>
              <p>AI analysis/day: {DEFAULT_TRIAL_LIMITS.aiAnalysisPerDay}</p>
              <p>Strategy creation/day: {DEFAULT_TRIAL_LIMITS.strategyCreationsPerDay}</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-950/50">
            <CardHeader>
              <CardTitle className="text-lg [font-family:'Barlow_Condensed',sans-serif]">
                Important Trial Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-300">
              <p>Trial expires 48 hours from signup.</p>
              <p>No live auto-execution in trial mode.</p>
              <p>Daily limits reset every day during trial.</p>
              <p>Free training helps you complete your first strategy workflow.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="batches" className="border-y border-zinc-800 bg-zinc-950/40">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-12 md:py-16">
          <div className="mb-8 flex items-center gap-2">
            <AlarmClock className="h-6 w-6 text-teal-400" />
            <h2
              className="text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl lg:text-6xl"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              <span
                className="text-teal-400"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Free Training
              </span>{" "}
              Batch Schedule
            </h2>
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
                  <CardTitle className="text-base text-teal-400 [font-family:'Barlow_Condensed',sans-serif]">
                    {batch.name}
                  </CardTitle>
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
        <div className="mx-auto grid w-full max-w-[1400px] gap-6 px-4 py-12 md:grid-cols-[1.15fr_1fr] md:items-stretch md:py-16">
          <div className="flex flex-col gap-6 md:h-full">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-6 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
                Join now
              </p>
              <h2
                className="mt-3 text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl lg:text-6xl"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Reserve Batch +<br />
                Start{" "}
                <span
                  className="text-teal-400"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  Free Access
                </span>
              </h2>
              <div className="mt-7 space-y-5">
                {[
                  {
                    step: "01",
                    title: "Signup on Platform",
                    description: "Create your account and activate 2-day free trial access.",
                  },
                  {
                    step: "02",
                    title: "Reserve Your Batch",
                    description: "Select your weekly batch and submit your contact details.",
                  },
                  {
                    step: "03",
                    title: "Get Confirmation",
                    description: "Receive schedule + reminder emails for all 3 sessions.",
                  },
                  {
                    step: "04",
                    title: "Attend Free Training",
                    description: "Join live sessions and learn practical stock market workflows.",
                  },
                ].map((item, idx) => (
                  <div key={item.step}>
                    <div className="flex items-start gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-teal-400/30 bg-teal-400/10 text-xs font-bold text-teal-300">
                        {item.step}
                      </div>
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-100">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">{item.description}</p>
                      </div>
                    </div>
                    {idx < 3 && <Separator className="mt-5 bg-zinc-800" />}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/30 p-6 md:p-8">
              <p
                className="w-full text-center text-4xl font-black leading-[0.95] tracking-tight text-zinc-100 md:text-6xl lg:text-7xl"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Are you ready for the
                <br />
                <span
                  className="text-teal-400"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  FUTURE OF TRADING ?
                </span>
              </p>
            </div>
          </div>
          <Card className="border-zinc-800 bg-black/70">
            <CardContent className="space-y-5 p-6">
              <div>
                <h3
                  className="text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl lg:text-6xl"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  <span
                    className="text-teal-400"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    Reserve
                  </span>{" "}
                  My Seat
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  Signup first -&gt; unlock 2-day access + free training batch.
                </p>
              </div>
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
                  <Label htmlFor="lead-phone-national">WhatsApp Number</Label>
                  <div className="flex gap-2">
                    <div className="w-[5.25rem] shrink-0 sm:w-24">
                      <PhoneCountryCodeCombobox
                        id="lead-phone-code"
                        value={form.phoneCountryIso}
                        onValueChange={(iso) =>
                          setForm((p) => ({
                            ...p,
                            phoneCountryIso: iso,
                          }))
                        }
                      />
                    </div>
                    <Input
                      id="lead-phone-national"
                      value={form.phoneNational}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, phoneNational: e.target.value }))
                      }
                      className="border-zinc-700 bg-zinc-950"
                      placeholder="National number (digits only)"
                      inputMode="numeric"
                      autoComplete="tel-national"
                    />
                  </div>
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
              <p className="text-xs text-zinc-500">
                Training access is confirmed after signup is completed.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={reserveSeat}
                  disabled={submitting}
                  className="h-11 flex-1 bg-teal-500 font-bold text-black hover:bg-teal-400"
                >
                  {submitting ? "Reserving..." : "Sign Up + Reserve My Seat"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePrimarySignup}
                  className="h-11 flex-1 border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
                >
                  Only Platform Signup
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-teal-400" />
          <h2 className="text-2xl font-bold md:text-3xl [font-family:'Barlow_Condensed',sans-serif]">
            Frequently Asked Questions
          </h2>
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
        <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center gap-4 px-4 py-10 text-center">
          <h3 className="text-2xl font-bold md:text-3xl [font-family:'Barlow_Condensed',sans-serif]">
            Want your custom algo trade setup?
          </h3>
          <p className="max-w-2xl text-zinc-400">
            Contact us and our team will get in touch with you to understand your
            strategy, workflow, and execution goals.
          </p>
          <Card className="mt-2 w-full max-w-3xl border-zinc-800 bg-black/60 text-left">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <Label htmlFor="algo-name">Full Name</Label>
                <Input
                  id="algo-name"
                  value={algoContactForm.fullName}
                  onChange={(e) =>
                    setAlgoContactForm((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                  className="border-zinc-700 bg-zinc-950"
                  placeholder="Your full name"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="algo-email">Email</Label>
                  <Input
                    id="algo-email"
                    type="email"
                    value={algoContactForm.email}
                    onChange={(e) =>
                      setAlgoContactForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="border-zinc-700 bg-zinc-950"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="algo-phone">Phone / WhatsApp</Label>
                  <Input
                    id="algo-phone"
                    value={algoContactForm.phone}
                    onChange={(e) =>
                      setAlgoContactForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="border-zinc-700 bg-zinc-950"
                    placeholder="+91..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="algo-requirements">What do you want to automate?</Label>
                <Input
                  id="algo-requirements"
                  value={algoContactForm.requirements}
                  onChange={(e) =>
                    setAlgoContactForm((prev) => ({ ...prev, requirements: e.target.value }))
                  }
                  className="border-zinc-700 bg-zinc-950"
                  placeholder="Example: options strategy with entry/exit and risk rules"
                />
              </div>
              <Button
                onClick={submitCustomAlgoContact}
                disabled={contactSubmitting}
                className="h-12 w-full bg-teal-500 px-8 font-bold text-black hover:bg-teal-400"
              >
                <Zap className="mr-2 h-4 w-4" />
                {contactSubmitting ? "Submitting..." : "Contact Us"}
              </Button>
            </CardContent>
          </Card>
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
