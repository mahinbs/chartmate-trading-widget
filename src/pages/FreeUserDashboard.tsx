import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  Search,
  X,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import {
  SUPPORTED_BROKERS,
  BROKER_CATEGORIES,
  brokerLogoUrl,
  type BrokerCategory,
  type SupportedBroker,
} from "@/constants/supportedBrokers";
import { PRICING_PLANS, PRICING_PLANS_INR } from "@/constants/pricing";
import { useUserCurrency } from "@/hooks/useUserCurrency";
import { createCheckoutSession } from "@/services/stripeService";

/** Persisted so the post-payment onboarding form (/algo-setup) can pre-select it. */
export const SELECTED_BROKER_KEY = "algo_selected_broker";

const initials = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function BrokerLogo({ broker, size = 40 }: { broker: SupportedBroker; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (failed) {
    return (
      <div
        className="rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ ...box, backgroundColor: broker.color }}
        aria-hidden
      >
        {initials(broker.name)}
      </div>
    );
  }
  return (
    <div
      className="rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden"
      style={box}
    >
      <img
        src={brokerLogoUrl(broker.domain)}
        alt={`${broker.name} logo`}
        loading="lazy"
        width={size * 0.6}
        height={size * 0.6}
        className="object-contain"
        style={{ width: size * 0.6, height: size * 0.6 }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  const items = [
    { n: 1, label: "Choose broker" },
    { n: 2, label: "Plan & payment" },
  ];
  return (
    <div className="flex items-center gap-3">
      {items.map((it, i) => {
        const isActive = step === it.n;
        const isDone = step > it.n;
        return (
          <div key={it.n} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                  isActive
                    ? "bg-teal-500 text-black border-teal-400"
                    : isDone
                    ? "bg-teal-500/15 text-teal-300 border-teal-500/30"
                    : "bg-white/[0.04] text-zinc-400 border-white/10"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : it.n}
              </div>
              <span
                className={`text-xs font-medium ${isActive ? "text-white" : "text-zinc-400"}`}
              >
                {it.label}
              </span>
            </div>
            {i < items.length - 1 && <div className="h-px w-8 bg-white/10" />}
          </div>
        );
      })}
    </div>
  );
}

export default function FreeUserDashboard() {
  const { currency } = useUserCurrency();
  const isINR = currency === "INR";
  const plan = isINR ? PRICING_PLANS_INR[0] : PRICING_PLANS[0];

  const [selected, setSelected] = useState<SupportedBroker | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<BrokerCategory | "All">("All");
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return SUPPORTED_BROKERS.filter((b) => {
      const matchesCat = active === "All" || b.category === active;
      const matchesQuery =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [q, active]);

  const grouped = useMemo(() => {
    return BROKER_CATEGORIES.map((cat) => ({
      category: cat,
      brokers: filtered.filter((b) => b.category === cat),
    })).filter((g) => g.brokers.length > 0);
  }, [filtered]);

  const fmt = (n: number) =>
    isINR ? `₹${n.toLocaleString("en-IN")}` : `$${n.toLocaleString("en-US")}`;

  const handleCheckout = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      localStorage.setItem(SELECTED_BROKER_KEY, selected.name);
    } catch {
      /* ignore storage errors */
    }
    const origin = window.location.origin;
    const res = await createCheckoutSession({
      plan_id: "professionalPlan",
      currency: isINR ? "inr" : "usd",
      success_url: `${origin}/algo-setup?checkout=success`,
      cancel_url: `${origin}/home`,
    });
    if ("error" in res) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    window.location.href = res.url;
  };

  return (
    <DashboardShellLayout>
      <Helmet>
        <title>Algo Trading Engine | TradingSmart</title>
      </Helmet>

      <div className="mx-auto w-full max-w-5xl">
        {/* Intro */}
        <div className="rounded-2xl border border-teal-500/15 bg-gradient-to-br from-teal-500/[0.08] via-white/[0.02] to-transparent p-6 md:p-8 mb-6">
          <span className="inline-flex items-center gap-2 text-[11px] text-teal-300/80 tracking-[0.3em] uppercase font-medium mb-3">
            Algo Trading Engine
          </span>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Launch your automated strategy
          </h1>
          <p className="mt-2 text-zinc-400 text-sm md:text-base max-w-2xl leading-relaxed">
            Pick the broker you trade with, then activate the Algo Platform plan — one live
            strategy, deployed and managed for you. All charting and analysis stays on
            tradingsmart.ai.
          </p>
          <div className="mt-5">
            <Stepper step={selected ? 2 : 1} />
          </div>
        </div>

        {/* STEP 1 — Broker selection */}
        {!selected ? (
          <>
            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your broker — e.g. Zerodha, Binance, Exness…"
                aria-label="Search brokers"
                className="w-full bg-black/40 border border-white/[0.12] rounded-2xl pl-12 pr-12 py-3.5 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-shadow"
              />
              {query ? (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-6">
              {(["All", ...BROKER_CATEGORIES] as const).map((cat) => {
                const isActive = active === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActive(cat)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border ${
                      isActive
                        ? "bg-teal-500 text-black border-teal-400"
                        : "bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:border-teal-500/30 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {grouped.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-zinc-400 text-sm">
                  No brokers match “{query}”. Try a different name or clear the search.
                </p>
                <button
                  onClick={() => {
                    setQuery("");
                    setActive("All");
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 text-teal-400 text-sm font-semibold hover:text-teal-300"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              grouped.map((group) => (
                <section key={group.category} className="mb-8">
                  <div className="flex items-baseline gap-3 mb-4">
                    <h2 className="text-white font-bold text-base">{group.category}</h2>
                    <span className="text-zinc-500 text-xs">{group.brokers.length}</span>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.brokers.map((broker) => (
                      <button
                        key={`${broker.name}-${broker.domain}`}
                        onClick={() => setSelected(broker)}
                        className="text-left p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-teal-500/40 hover:bg-teal-500/[0.04] transition-colors flex items-center gap-3 group"
                      >
                        <BrokerLogo broker={broker} />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-white font-semibold text-sm truncate">
                            {broker.name}
                          </h3>
                          <p className="text-zinc-500 text-xs truncate">{broker.category}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-teal-400 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        ) : (
          /* STEP 2 — Plan & payment */
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
            {/* Selected broker summary */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
              <button
                onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1.5 text-zinc-400 text-sm hover:text-white transition-colors mb-5"
              >
                <ArrowLeft className="w-4 h-4" /> Change broker
              </button>
              <div className="flex items-center gap-4">
                <BrokerLogo broker={selected} size={56} />
                <div className="min-w-0">
                  <h3 className="text-white font-bold text-lg truncate">{selected.name}</h3>
                  <p className="text-zinc-500 text-xs">{selected.category}</p>
                </div>
              </div>
              <p className="text-zinc-400 text-sm font-light leading-relaxed mt-4">
                {selected.description}
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs text-teal-300 bg-teal-500/10 border border-teal-500/20 rounded-lg px-3 py-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                One broker, one live strategy — engineer-assisted go-live.
              </div>
            </div>

            {/* Pricing */}
            <div className="rounded-2xl border border-teal-500/40 bg-zinc-950/60 p-6 shadow-[0_0_40px_rgba(20,184,166,0.10)]">
              <div className="text-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">
                  Live execution
                </span>
                <h3 className="text-2xl font-black text-white mt-1">{plan.name}</h3>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Integration
                  </div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {fmt(plan.integrationFee)}
                  </div>
                  <div className="text-[11px] text-zinc-500">one-time</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Maintenance
                  </div>
                  <div className="mt-1 text-2xl font-bold text-teal-400">{fmt(plan.price)}</div>
                  <div className="text-[11px] text-zinc-500">/month</div>
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-zinc-500">
                Monthly fees begin after the first 30 days.
              </p>

              <ul className="mt-5 space-y-2.5 text-sm text-zinc-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-500/90 mt-0.5" aria-hidden />
                    <span className="leading-snug">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={handleCheckout}
                disabled={busy}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-teal-500 text-black font-bold rounded-full hover:bg-teal-400 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to payment…
                  </>
                ) : (
                  <>
                    Continue to secure payment <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
              <p className="mt-3 text-center text-[11px] text-zinc-500">
                After payment you'll complete a short KYC form so our team can provision your
                access.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardShellLayout>
  );
}
