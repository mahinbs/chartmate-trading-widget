import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Mail, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SUPPORT_EMAIL = "support@tradingsmart.ai";
const WHATSAPP_NUMBER = "919632953355";
const WHATSAPP_DISPLAY = "+91 96329 53355";

type LocationState = {
  source?: string;
  name?: string;
};

const ScheduleCallThankYouPage = () => {
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const { user } = useAuth();
  const firstName = state.name?.split(/\s+/)[0]?.trim() || "";

  const [email, setEmail] = useState(user?.email ?? "");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user?.email]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSubscribing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types
      const { error } = await (supabase as any).from("contact_submissions").insert([
        {
          name: firstName || "Newsletter subscriber",
          email: trimmed,
          phone: "",
          description: "[newsletter] Subscribed from /thank-you page",
        },
      ]);
      if (error) throw error;
      setSubscribed(true);
      toast.success("Subscribed — we'll keep you posted.");
    } catch (err) {
      console.error("Newsletter subscribe failed:", err);
      toast.error("Couldn't subscribe right now. Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Thank you | TradingSmart.AI</title>
        <meta
          name="description"
          content="Your call request is in — our team will be in touch soon."
        />
      </Helmet>

      <div className="relative min-h-screen overflow-hidden bg-[#020817] px-4 py-16 text-slate-100">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.12),transparent_35%),radial-gradient(circle_at_85%_25%,rgba(14,165,233,0.10),transparent_30%),radial-gradient(circle_at_55%_90%,rgba(99,102,241,0.08),transparent_35%)]" />
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="absolute -right-24 top-1/3 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="absolute bottom-16 left-1/4 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        <Link
          to="/"
          className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-md transition-colors hover:border-teal-300/40 hover:bg-teal-500/10 hover:text-teal-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>

        <div className="relative z-10 mx-auto mt-12 max-w-2xl">
          <div className="rounded-3xl border border-teal-300/20 bg-[linear-gradient(180deg,rgba(17,27,48,0.96),rgba(10,15,28,0.96))] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-12">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="absolute inset-0 -m-3 rounded-full bg-teal-500/20 blur-2xl" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-teal-400/40 bg-teal-500/10">
                  <CheckCircle2 className="h-10 w-10 text-teal-300" strokeWidth={2} />
                </div>
              </div>

              <h1 className="mt-8 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {firstName ? `You're all set, ${firstName}.` : "You're all set."}
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400 sm:text-base">
                We received your request and one of our engineers will reach out
                shortly to lock in a time. In the meantime, the best trade you
                can make is the one where you stop babysitting charts — we'll
                handle the rest.
              </p>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-teal-300/40 hover:bg-teal-500/10"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
                  <Mail className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    Email us
                  </span>
                  <span className="block truncate text-sm font-semibold text-white group-hover:text-teal-200">
                    {SUPPORT_EMAIL}
                  </span>
                </span>
              </a>

              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hi%2C%20I%20just%20requested%20a%20call%20on%20TradingSmart.AI`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/10"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    WhatsApp
                  </span>
                  <span className="block truncate text-sm font-semibold text-white group-hover:text-emerald-200">
                    {WHATSAPP_DISPLAY}
                  </span>
                </span>
              </a>
            </div>

            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Stay in the loop
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                Get TradingSmart updates by email
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Product releases, market notes, and invite-only strategy drops.
                No spam, one-click unsubscribe.
              </p>

              {subscribed ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  You're on the list — look for our next update in your inbox.
                </div>
              ) : (
                <form
                  onSubmit={handleSubscribe}
                  className="mt-4 flex flex-col gap-2 sm:flex-row"
                >
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={subscribing}
                    className="flex-1 border-white/10 bg-white/[0.03] text-white placeholder:text-slate-500 focus-visible:border-teal-400/50 focus-visible:ring-teal-400/20"
                  />
                  <Button
                    type="submit"
                    disabled={subscribing}
                    className="bg-gradient-to-r from-teal-500 to-sky-500 font-semibold text-white hover:from-teal-400 hover:to-sky-400"
                  >
                    {subscribing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Subscribing
                      </>
                    ) : (
                      "Subscribe to email"
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            Didn't mean to land here? <Link to="/" className="text-teal-300 hover:text-teal-200">Head back home</Link>.
          </p>
        </div>
      </div>
    </>
  );
};

export default ScheduleCallThankYouPage;
