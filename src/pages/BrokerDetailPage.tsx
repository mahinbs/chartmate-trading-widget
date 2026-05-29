import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Layers,
  ListChecks,
  Plug,
  ServerCog,
  Workflow,
} from "lucide-react";
import AiPredictionHeader from "@/components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "@/components/landingpage/mainlandingpage/AiPredictionFooter";
import { brokerLogoUrl, SUPPORTED_BROKERS } from "@/constants/supportedBrokers";
import {
  BROKER_COMPARISON,
  EXECUTION_FLOW,
  RECOMMENDED_ARCHITECTURE,
  getBrokerDetail,
  type BrokerDetail,
} from "@/constants/brokerDetails";

function DetailLogo({ detail }: { detail: BrokerDetail }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-black text-white shrink-0"
        style={{ backgroundColor: detail.color }}
        aria-hidden
      >
        {detail.name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
      <img
        src={brokerLogoUrl(detail.domain)}
        alt={`${detail.name} logo`}
        width={40}
        height={40}
        className="w-10 h-10 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
          <Icon className="w-4 h-4" />
        </span>
        <h2 className="text-white font-bold text-xl md:text-2xl font-syne">{title}</h2>
      </div>
      {subtitle ? <p className="text-zinc-400 text-sm mt-2 max-w-2xl">{subtitle}</p> : null}
    </div>
  );
}

export default function BrokerDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const detail = getBrokerDetail(slug);

  if (!detail) {
    return <Navigate to="/supported-brokers" replace />;
  }

  const brokerMeta = SUPPORTED_BROKERS.find((b) => b.detailSlug === detail.slug);
  const isNative = Boolean(brokerMeta?.integrated);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
      <Helmet>
        <title>{`${detail.name} algo trading integration | ChartMate.ai`}</title>
        <meta
          name="description"
          content={`Connect ${detail.name} to ChartMate for automated trading via MT4, MT5, TradingView webhooks and Python. Platforms, connection requirements and integration methods.`}
        />
      </Helmet>
      <AiPredictionHeader />

      <main className="pt-28 md:pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-5xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-zinc-500 mb-8">
            <Link to="/supported-brokers" className="inline-flex items-center gap-1 hover:text-teal-400 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Supported brokers
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-zinc-300">{detail.name}</span>
          </nav>

          {/* Hero */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-teal-500/[0.07] via-white/[0.02] to-transparent p-7 md:p-10 mb-14"
          >
            <div
              className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-30"
              style={{ backgroundColor: detail.color }}
              aria-hidden
            />
            <div className="relative flex flex-col md:flex-row md:items-center gap-5">
              <DetailLogo detail={detail} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {isNative ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-300 bg-teal-500/10 border border-teal-500/20 rounded-full px-2.5 py-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Native integration
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-300 bg-white/[0.04] border border-white/10 rounded-full px-2.5 py-0.5">
                      <Plug className="w-3 h-3" /> Supported
                    </span>
                  )}
                  <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Forex &amp; CFD</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-white font-syne tracking-tight">{detail.name}</h1>
                <p className="mt-2 text-teal-300/90 text-sm md:text-base font-semibold">{detail.tagline}</p>
              </div>
            </div>
            <p className="relative mt-6 text-zinc-300 text-sm md:text-base leading-relaxed max-w-3xl">{detail.intro}</p>
            <div className="relative flex flex-col sm:flex-row gap-3 mt-7">
              <Link
                to="/contact-us"
                className="inline-flex items-center justify-center px-7 py-3 bg-teal-500 text-black font-bold rounded-full hover:bg-teal-400 transition-colors text-sm font-syne"
              >
                Connect {detail.name}
              </Link>
              <a
                href={`${detail.website}?utm_source=chartmate`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-7 py-3 border border-white/15 text-zinc-200 font-bold rounded-full hover:border-teal-500/40 hover:text-white transition-colors text-sm font-syne"
              >
                Visit {detail.name} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </motion.section>

          {/* Supported platforms */}
          <section className="mb-14">
            <SectionHeading icon={Layers} title="Supported platforms" />
            <div className="flex flex-wrap gap-2.5">
              {detail.platforms.map((p) => (
                <span
                  key={p}
                  className="rounded-full bg-white/[0.03] border border-white/[0.08] px-4 py-2 text-sm text-zinc-200"
                >
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* What can be automated */}
          <section className="mb-14">
            <SectionHeading icon={ListChecks} title="What can be automated?" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {detail.automations.map((a) => (
                <div
                  key={a}
                  className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] px-4 py-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span className="text-sm text-zinc-200">{a}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Connection requirements */}
          <section className="mb-14">
            <SectionHeading icon={ServerCog} title="Connection requirements" />
            <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
              <table className="w-full text-sm">
                <tbody>
                  {detail.requirements.map((r, i) => (
                    <tr key={r.requirement} className={i % 2 ? "bg-white/[0.015]" : "bg-transparent"}>
                      <td className="px-4 md:px-5 py-3 font-semibold text-white align-top w-1/3 border-b border-white/[0.05]">
                        {r.requirement}
                      </td>
                      <td className="px-4 md:px-5 py-3 text-zinc-300 border-b border-white/[0.05]">{r.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Integration methods */}
          <section className="mb-14">
            <SectionHeading icon={Plug} title="Common integration methods" />
            <div className="grid sm:grid-cols-2 gap-4">
              {detail.methods.map((m) => (
                <div
                  key={m.title}
                  className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 hover:border-teal-500/25 transition-colors"
                >
                  <h3 className="text-white font-bold text-sm mb-3 font-syne">{m.title}</h3>
                  <ul className="space-y-2">
                    {m.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2 text-sm text-zinc-300">
                        <ChevronRight className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Execution flow */}
          <section className="mb-14">
            <SectionHeading icon={Workflow} title="Execution flow" subtitle="How a signal travels from your strategy to a live order." />
            <div className="flex flex-wrap items-center gap-2">
              {EXECUTION_FLOW.map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-xs md:text-sm text-zinc-200">
                    {step}
                  </span>
                  {i < EXECUTION_FLOW.length - 1 ? <ChevronRight className="w-4 h-4 text-teal-500/70" /> : null}
                </div>
              ))}
            </div>
          </section>

          {/* Comparison */}
          <section className="mb-14">
            <SectionHeading
              icon={ListChecks}
              title="Exness vs Vantage"
              subtitle="Both brokers run on MetaTrader, so the same ChartMate execution engine drives either one."
            />
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="bg-white/[0.03]">
                    <th className="px-4 md:px-5 py-3 text-left font-semibold text-zinc-400">Feature</th>
                    <th className="px-4 md:px-5 py-3 text-left font-semibold text-white">Exness</th>
                    <th className="px-4 md:px-5 py-3 text-left font-semibold text-white">Vantage Markets</th>
                  </tr>
                </thead>
                <tbody>
                  {BROKER_COMPARISON.map((row, i) => (
                    <tr key={row.feature} className={i % 2 ? "bg-white/[0.015]" : "bg-transparent"}>
                      <td className="px-4 md:px-5 py-3 text-zinc-300 border-t border-white/[0.05]">{row.feature}</td>
                      <td className="px-4 md:px-5 py-3 text-zinc-200 border-t border-white/[0.05]">{row.exness}</td>
                      <td className="px-4 md:px-5 py-3 text-zinc-200 border-t border-white/[0.05]">{row.vantage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Info required */}
          <section className="mb-14">
            <SectionHeading
              icon={ListChecks}
              title={`Information required to connect ${detail.name}`}
              subtitle="Share these details and our team wires the broker into your ChartMate workspace."
            />
            <div className="grid sm:grid-cols-2 gap-3">
              {detail.infoRequired.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] px-4 py-3"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                  <span className="text-sm text-zinc-200">{item}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Recommended architecture */}
          <section className="mb-14">
            <SectionHeading icon={Workflow} title="Recommended architecture" />
            <div className="grid md:grid-cols-3 gap-4">
              {RECOMMENDED_ARCHITECTURE.map((t) => (
                <div key={t.tier} className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5">
                  <h3 className="text-teal-300 font-bold text-sm mb-2 font-syne">{t.tier}</h3>
                  <p className="text-sm text-zinc-300 leading-relaxed">{t.flow}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="p-8 rounded-2xl bg-gradient-to-br from-teal-500/[0.08] to-transparent border border-teal-500/20 text-center">
            <h3 className="text-white font-bold text-xl md:text-2xl font-syne mb-2">
              Automate {detail.name} with ChartMate
            </h3>
            <p className="text-zinc-300 text-sm max-w-2xl mx-auto mb-6">
              Run TradingView alerts, Python strategies or AI signals straight into your {detail.name} account through one
              execution engine.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/contact-us"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-teal-500 text-black font-bold rounded-full hover:bg-teal-400 transition-colors text-sm font-syne"
              >
                Talk to our team
              </Link>
              <Link
                to="/supported-brokers"
                className="inline-flex items-center justify-center px-8 py-3.5 border border-teal-500/40 text-teal-400 font-bold rounded-full hover:bg-teal-500/10 transition-colors text-sm font-syne"
              >
                All supported brokers
              </Link>
            </div>
          </div>
        </div>
      </main>

      <AiPredictionFooter />
    </div>
  );
}
