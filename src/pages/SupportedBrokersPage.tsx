import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, CheckCircle2, Plug } from "lucide-react";
import AiPredictionHeader from "@/components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "@/components/landingpage/mainlandingpage/AiPredictionFooter";
import {
  SUPPORTED_BROKERS,
  BROKER_CATEGORIES,
  brokerLogoUrl,
  type BrokerCategory,
  type SupportedBroker,
} from "@/constants/supportedBrokers";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
};

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

function BrokerCard({ broker }: { broker: SupportedBroker }) {
  return (
    <motion.div
      variants={fadeUp}
      className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-teal-500/25 transition-colors flex flex-col"
    >
      <div className="flex items-start gap-3 mb-3">
        <BrokerLogo broker={broker} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold text-sm truncate">{broker.name}</h3>
          </div>
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
      <p className="text-zinc-400 text-xs font-light leading-relaxed">{broker.description}</p>
    </motion.div>
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

      <main className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Hero */}
          <motion.div initial="hidden" animate="visible" variants={stagger} className="mb-10 text-center md:text-left">
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 text-[11px] text-zinc-500 tracking-[0.3em] uppercase font-medium mb-4"
            >
              INTEGRATIONS
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="text-3xl md:text-5xl font-black text-white font-syne tracking-tight max-w-4xl"
            >
              {total}+ supported brokers &amp; exchanges
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-4 text-white text-base md:text-lg font-semibold max-w-3xl">
              Trade Indian stocks &amp; F&amp;O, global equities, crypto, forex and futures — all from one ChartMate workspace.
            </motion.p>
            <motion.p variants={fadeUp} className="mt-4 text-zinc-400 text-sm md:text-base max-w-3xl leading-relaxed">
              {integratedCount}+ brokers connect natively today with one-click OAuth or a single API token. The rest are
              part of our broader supported universe, reachable through the OpenAlgo bridge or added on request.
            </motion.p>

            {/* Stat row */}
            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 mt-6 justify-center md:justify-start">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2">
                <span className="text-teal-400 font-bold text-lg">{total}+</span>
                <span className="text-zinc-400 text-xs ml-2">brokers &amp; exchanges</span>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2">
                <span className="text-teal-400 font-bold text-lg">{integratedCount}+</span>
                <span className="text-zinc-400 text-xs ml-2">native integrations</span>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-2">
                <span className="text-teal-400 font-bold text-lg">{BROKER_CATEGORIES.length}</span>
                <span className="text-zinc-400 text-xs ml-2">asset classes</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Controls */}
          <div className="sticky top-[60px] z-20 -mx-4 px-4 py-3 bg-black/80 backdrop-blur-xl border-y border-white/[0.06] mb-8">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search brokers — e.g. Zerodha, Binance, OANDA…"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-full pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/40"
              />
            </div>
            <div className="flex flex-wrap gap-2">
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
          </div>

          {/* Results */}
          {grouped.length === 0 ? (
            <p className="text-zinc-500 text-sm py-16 text-center">
              No brokers match “{query}”. Try a different name or clear the search.
            </p>
          ) : (
            grouped.map((group) => (
              <section key={group.category} className="mb-12">
                <div className="flex items-baseline gap-3 mb-5">
                  <h2 className="text-white font-bold text-lg font-syne">{group.category}</h2>
                  <span className="text-zinc-500 text-xs">{group.brokers.length}</span>
                </div>
                <motion.div
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-40px" }}
                  variants={stagger}
                  className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {group.brokers.map((broker) => (
                    <BrokerCard key={`${broker.name}-${broker.domain}`} broker={broker} />
                  ))}
                </motion.div>
              </section>
            ))
          )}

          {/* CTA */}
          <div className="mt-8 p-8 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-center md:text-left">
            <h3 className="text-white font-bold text-xl font-syne mb-2">Don&apos;t see your broker?</h3>
            <p className="text-zinc-400 text-sm max-w-2xl mb-6">
              Our team adds new broker and exchange connections on request. Tell us who you trade with and we&apos;ll wire
              it into your ChartMate workspace.
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
        </div>
      </main>

      <AiPredictionFooter />
    </div>
  );
}
