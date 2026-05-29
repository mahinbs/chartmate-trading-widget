import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, CheckCircle2, Plug, ArrowRight, X } from "lucide-react";
import AiPredictionHeader from "@/components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "@/components/landingpage/mainlandingpage/AiPredictionFooter";
import {
  SUPPORTED_BROKERS,
  BROKER_CATEGORIES,
  brokerLogoUrl,
  type BrokerCategory,
  type SupportedBroker,
} from "@/constants/supportedBrokers";

const initials = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function BrokerLogo({ broker }: { broker: SupportedBroker }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: broker.color }}
        aria-hidden
      >
        {initials(broker.name)}
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
      <img
        src={brokerLogoUrl(broker.domain)}
        alt={`${broker.name} logo`}
        loading="lazy"
        width={24}
        height={24}
        className="w-6 h-6 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function BrokerCardInner({ broker }: { broker: SupportedBroker }) {
  return (
    <>
      <div className="flex items-start gap-3 mb-3">
        <BrokerLogo broker={broker} />
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-semibold text-sm truncate">{broker.name}</h3>
          {broker.integrated ? (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-teal-300 bg-teal-500/10 border border-teal-500/20 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-3 h-3" /> Native integration
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 bg-white/[0.04] border border-white/10 rounded-full px-2 py-0.5">
              <Plug className="w-3 h-3" /> Supported
            </span>
          )}
        </div>
      </div>
      <p className="text-zinc-400 text-xs font-light leading-relaxed flex-1">{broker.description}</p>
      {broker.detailSlug ? (
        <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-400 group-hover:gap-1.5 transition-all">
          Integration guide <ArrowRight className="w-3 h-3" />
        </span>
      ) : null}
    </>
  );
}

function BrokerCard({ broker }: { broker: SupportedBroker }) {
  const base =
    "p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] transition-colors flex flex-col h-full";
  if (broker.detailSlug) {
    return (
      <Link
        to={`/supported-brokers/${broker.detailSlug}`}
        className={`${base} group hover:border-teal-500/40 hover:bg-teal-500/[0.03]`}
      >
        <BrokerCardInner broker={broker} />
      </Link>
    );
  }
  return (
    <div className={`${base} hover:border-teal-500/25`}>
      <BrokerCardInner broker={broker} />
    </div>
  );
}

export default function SupportedBrokersPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<BrokerCategory | "All">("All");

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

  const total = SUPPORTED_BROKERS.length;
  const integratedCount = SUPPORTED_BROKERS.filter((b) => b.integrated).length;
  const isFiltering = q.length > 0 || active !== "All";

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
      <Helmet>
        <title>Supported brokers & exchanges | ChartMate.ai</title>
        <meta
          name="description"
          content={`Connect ChartMate to ${total}+ brokers and exchanges across Indian stocks & F&O, global equities, crypto, forex/CFD and futures. ${integratedCount}+ native one-click integrations.`}
        />
      </Helmet>
      <AiPredictionHeader />

      <main className="pt-28 md:pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Hero */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-teal-500/[0.08] via-white/[0.02] to-transparent p-7 md:p-12 mb-8"
          >
            <div
              className="pointer-events-none absolute -top-28 -right-20 w-80 h-80 rounded-full bg-teal-500/20 blur-3xl"
              aria-hidden
            />
            <div className="relative">
              <span className="inline-flex items-center gap-2 text-[11px] text-teal-300/80 tracking-[0.3em] uppercase font-medium mb-4">
                Integrations
              </span>
              <h1 className="text-3xl md:text-5xl font-black text-white font-syne tracking-tight max-w-4xl">
                {total}+ supported brokers &amp; exchanges
              </h1>
              <p className="mt-4 text-zinc-300 text-sm md:text-lg max-w-3xl leading-relaxed">
                Trade Indian stocks &amp; F&amp;O, global equities, crypto, forex and futures — all from one ChartMate
                workspace. {integratedCount}+ brokers connect natively with one-click OAuth or a single API token; the
                rest are reachable through the OpenAlgo bridge or added on request.
              </p>

              {/* Search — primary action, inside hero */}
              <div className="relative mt-7 max-w-2xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search brokers — e.g. Zerodha, Binance, Exness, OANDA…"
                  aria-label="Search brokers"
                  className="w-full bg-black/40 border border-white/[0.12] rounded-2xl pl-12 pr-12 py-4 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-shadow"
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

              {/* Stat row */}
              <div className="flex flex-wrap gap-3 mt-6">
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2">
                  <span className="text-teal-400 font-bold text-lg">{total}+</span>
                  <span className="text-zinc-400 text-xs ml-2">brokers &amp; exchanges</span>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2">
                  <span className="text-teal-400 font-bold text-lg">{integratedCount}+</span>
                  <span className="text-zinc-400 text-xs ml-2">native integrations</span>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2">
                  <span className="text-teal-400 font-bold text-lg">{BROKER_CATEGORIES.length}</span>
                  <span className="text-zinc-400 text-xs ml-2">asset classes</span>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Category filter — sticky */}
          <div className="sticky top-[56px] z-20 -mx-4 px-4 py-3 bg-black/85 backdrop-blur-xl border-b border-white/[0.06] mb-8">
            <div className="flex flex-wrap items-center gap-2">
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
              <span className="ml-auto text-xs text-zinc-500">
                {filtered.length} {filtered.length === 1 ? "result" : "results"}
              </span>
            </div>
          </div>

          {/* Results */}
          {grouped.length === 0 ? (
            <div className="py-20 text-center">
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
              <section key={group.category} className="mb-12">
                <div className="flex items-baseline gap-3 mb-5">
                  <h2 className="text-white font-bold text-lg font-syne">{group.category}</h2>
                  <span className="text-zinc-500 text-xs">{group.brokers.length}</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.brokers.map((broker) => (
                    <BrokerCard key={`${broker.name}-${broker.domain}`} broker={broker} />
                  ))}
                </div>
              </section>
            ))
          )}

          {/* CTA */}
          {!isFiltering || grouped.length > 0 ? (
            <div className="mt-8 p-8 rounded-2xl bg-gradient-to-br from-teal-500/[0.07] to-transparent border border-teal-500/15 text-center md:text-left">
              <h3 className="text-white font-bold text-xl font-syne mb-2">Don&apos;t see your broker?</h3>
              <p className="text-zinc-400 text-sm max-w-2xl mb-6">
                Our team adds new broker and exchange connections on request. Tell us who you trade with and we&apos;ll
                wire it into your ChartMate workspace.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                <Link
                  to="/contact-us"
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-teal-500 text-black font-bold rounded-full hover:bg-teal-400 transition-colors text-sm font-syne"
                >
                  Request a broker
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center px-8 py-3.5 border border-teal-500/40 text-teal-400 font-bold rounded-full hover:bg-teal-500/10 transition-colors text-sm font-syne"
                >
                  View pricing
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <AiPredictionFooter />
    </div>
  );
}
