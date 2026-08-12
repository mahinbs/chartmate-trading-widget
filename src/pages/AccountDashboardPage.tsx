import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Bot,
  Radio,
  Terminal,
  Activity,
  Wallet,
  Gauge,
  Zap,
  Cpu,
} from "lucide-react";
import {
  accountBySlug,
  fmt,
  initials,
  posPnl,
  type PosRow,
} from "@/lib/demoAccounts";

interface Fill {
  id: number;
  t: string;
  side: "BUY" | "SELL";
  sym: string;
  qty: number;
  price: number;
}
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export default function AccountDashboardPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const account = accountBySlug(slug);

  const [positions, setPositions] = useState<PosRow[]>(account?.positions ?? []);
  const [fills, setFills] = useState<Fill[]>([]);
  const [realized, setRealized] = useState(account?.realizedToday ?? 0);
  const [trades, setTrades] = useState(38);
  const [equity, setEquity] = useState<number[]>(() =>
    Array.from({ length: 44 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3) * 2),
  );
  const fillId = useRef(1);

  const accent = account?.accent ?? "#2dd4bf";
  const cur = account?.cur ?? "₹";
  const feedSyms = account?.feedSyms ?? [];

  // price / equity tick
  useEffect(() => {
    if (!account) return;
    const t = setInterval(() => {
      setPositions((prev) =>
        prev.map((p) => {
          const vol = Math.max(p.ltp * 0.0013, 0.0004);
          const next = Math.max(0.0001, p.ltp + (Math.random() - 0.47) * vol * 2);
          return { ...p, ltp: +next.toFixed(p.ltp > 100 ? 2 : 4) };
        }),
      );
      setEquity((prev) => [...prev.slice(1), Math.max(90, prev[prev.length - 1] + (Math.random() - 0.42) * 1.3)]);
    }, 1200);
    return () => clearInterval(t);
  }, [account]);

  // execution feed
  useEffect(() => {
    if (!account || feedSyms.length === 0) return;
    const t = setInterval(() => {
      const sym = feedSyms[Math.floor(Math.random() * feedSyms.length)];
      const side: "BUY" | "SELL" = Math.random() > 0.5 ? "BUY" : "SELL";
      const crypto = sym.includes("BTC") || sym.includes("ETH");
      const f: Fill = {
        id: fillId.current++,
        t: now(),
        side,
        sym,
        qty: crypto ? +(Math.random() * 0.4).toFixed(3) : Math.floor(30 + Math.random() * 120),
        price: crypto ? +(60000 + Math.random() * 3000).toFixed(2) : +(80 + Math.random() * 500).toFixed(2),
      };
      setFills((prev) => [f, ...prev].slice(0, 8));
      setTrades((n) => n + 1);
      setRealized((r) => r + (Math.random() - 0.35) * 500);
    }, 3000);
    return () => clearInterval(t);
  }, [account, feedSyms]);

  if (!account) return <Navigate to="/home" replace />;

  const openPnl = positions.reduce((s, p) => s + posPnl(p), 0);
  const todayPnl = realized + openPnl;

  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const span = max - min || 1;
  const pts = equity.map((v, i) => `${(i / (equity.length - 1)) * 100},${100 - ((v - min) / span) * 100}`).join(" ");

  const stats = [
    { icon: Wallet, label: "Balance", value: account.balance },
    { icon: Zap, label: "Today's P&L", value: `${todayPnl < 0 ? "-" : "+"}${cur}${fmt(Math.abs(todayPnl))}`, up: todayPnl >= 0 },
    { icon: Bot, label: "Active Bots", value: String(account.bots.length) },
    { icon: Activity, label: "Open Positions", value: String(positions.length) },
    { icon: Gauge, label: "Win Rate", value: account.winRate },
  ];

  return (
    <DashboardShellLayout>
      <div className="relative">
        {/* backdrop */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.3]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
              backgroundSize: "42px 42px",
              maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
            }}
          />
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full blur-[120px] opacity-20" style={{ backgroundColor: accent }} />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-4 py-6 space-y-6">
          {/* back + header */}
          <button onClick={() => navigate("/home")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to command center
          </button>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: accent, boxShadow: `0 0 22px -4px ${accent}` }}>
                {initials(account.name)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  {account.name}
                  <span className="text-[10px] font-bold rounded-md px-2 py-0.5 border" style={{ color: accent, borderColor: `${accent}55`, backgroundColor: `${accent}18` }}>{account.type}</span>
                </h1>
                <p className="text-sm text-zinc-500 font-mono flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-teal-400" /> {account.id} · {account.bots.length} bots executing live
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> CONNECTED · LIVE
            </span>
          </div>

          {/* stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e17]/70 backdrop-blur p-4">
                <div className="pointer-events-none absolute -top-8 -right-8 h-20 w-20 rounded-full blur-2xl opacity-20" style={{ backgroundColor: accent }} />
                <s.icon className="h-4 w-4" style={{ color: accent }} />
                <div className={`mt-2 text-xl font-mono font-bold truncate ${s.up === undefined ? "text-white" : s.up ? "text-emerald-400" : "text-red-400"}`}>{s.value}</div>
                <div className="text-[11px] text-zinc-500 uppercase tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>

          {/* equity */}
          <div className="rounded-2xl border border-white/10 bg-[#0a0e17]/70 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Equity curve · intraday</span>
              <span className={`text-xs font-mono font-semibold ${openPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>open {openPnl >= 0 ? "+" : "-"}{cur}{fmt(Math.abs(openPnl))}</span>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-20">
              <defs>
                <linearGradient id="aeqf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,100 ${pts} 100,100`} fill="url(#aeqf)" />
              <polyline points={pts} fill="none" stroke={accent} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>

          {/* bots */}
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500 mb-2 flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" /> Bots running on this account
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {account.bots.map((b) => (
                <div key={b.name} className="flex items-center gap-3 rounded-2xl border bg-[#0a0e17]/70 p-4" style={{ borderColor: `${accent}2e` }}>
                  <span className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}22` }}>
                    <Bot className="h-4.5 w-4.5" style={{ color: accent }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{b.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{b.sym} · {b.strat}</div>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> RUNNING
                  </span>
                  <div className={`text-sm font-mono font-bold w-20 text-right shrink-0 ${b.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {b.pnl >= 0 ? "+" : "-"}{cur}{fmt(Math.abs(b.pnl))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* positions + feed */}
          <div className="grid lg:grid-cols-5 gap-3">
            <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-[#0a0e17]/70 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-teal-400" /> Open Positions · {positions.length}
              </div>
              <div className="divide-y divide-white/5">
                {positions.map((p) => {
                  const pnl = posPnl(p);
                  return (
                    <div key={p.sym} className="flex items-center gap-3 px-4 py-3">
                      <span className="h-6 w-1 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{p.sym}</div>
                        <div className="text-[11px] text-zinc-500">
                          <span className={p.side === "BUY" ? "text-emerald-400" : "text-red-400"}>{p.side}</span> {p.qty} @ {fmt(p.entry, p.entry > 100 ? 2 : 4)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-mono text-zinc-200 tabular-nums">{fmt(p.ltp, p.ltp > 100 ? 2 : 4)}</div>
                        <div className="text-[10px] text-zinc-600">LTP</div>
                      </div>
                      <div className="text-right w-24 shrink-0">
                        <div className={`text-sm font-mono font-semibold tabular-nums ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pnl >= 0 ? "+" : "-"}{cur}{fmt(Math.abs(pnl), 0)}</div>
                        <div className="text-[10px] text-zinc-600">P&amp;L</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#05070d] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-teal-400" /> Execution Feed
              </div>
              <div className="p-3 space-y-1.5 font-mono text-[11px] min-h-[200px]">
                {fills.length === 0 && <div className="text-zinc-600">waiting for signals…</div>}
                {fills.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                    <span className="text-zinc-600">{f.t}</span>
                    <span className={`font-bold ${f.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{f.side}</span>
                    <span className="text-zinc-200">{f.sym}</span>
                    <span className="text-zinc-500">×{f.qty}</span>
                    <span className="text-zinc-400 ml-auto">@{fmt(f.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* actions */}
          <div className="flex gap-3">
            <Button className="flex-1 bg-teal-500 hover:bg-teal-400 text-black font-bold" onClick={() => toast.success(`Opening ${account.name} trade panel…`)}>Trade</Button>
            <Button variant="outline" className="flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => toast(`${account.name} disconnected (demo).`)}>Disconnect</Button>
          </div>
        </div>
      </div>
    </DashboardShellLayout>
  );
}
