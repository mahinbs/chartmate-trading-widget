import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Cpu,
  Gauge,
  Zap,
  Terminal,
} from "lucide-react";

/**
 * Live Algo Trading section — UI only. Simulates bots actively trading a real
 * account: running bots, open positions with ticking LTP/P&L, a live execution
 * feed and headline stats. All values are mocked and animated client-side;
 * swap the state seeds + intervals for real broker/engine data later.
 */

const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const inr = (n: number) => (n < 0 ? "-₹" : "₹") + fmt(Math.abs(n));

interface Pos {
  bot: string;
  accent: string;
  sym: string;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  ltp: number;
}
interface Fill {
  id: number;
  t: string;
  bot: string;
  accent: string;
  side: "BUY" | "SELL";
  sym: string;
  qty: number;
  price: number;
}

const BOTS = [
  { name: "Momentum Scalper", sym: "NIFTY", strat: "EMA 9/21 · VWAP", accent: "#2dd4bf" },
  { name: "Theta Engine", sym: "BANKNIFTY", strat: "Iron Condor · Δ-neutral", accent: "#8b5cf6" },
  { name: "BTC Trend Rider", sym: "BTCUSDT", strat: "Supertrend · ADX", accent: "#f7931a" },
  { name: "Gold Reversal", sym: "XAUUSD", strat: "RSI · Bollinger", accent: "#eab308" },
];

const INIT_POS: Pos[] = [
  { bot: "Momentum Scalper", accent: "#2dd4bf", sym: "NIFTY 24500 CE", side: "BUY", qty: 150, entry: 182.4, ltp: 187.6 },
  { bot: "Theta Engine", accent: "#8b5cf6", sym: "BANKNIFTY 52000 PE", side: "SELL", qty: 90, entry: 410.2, ltp: 398.7 },
  { bot: "BTC Trend Rider", accent: "#f7931a", sym: "BTCUSDT", side: "BUY", qty: 0.35, entry: 61240, ltp: 61890 },
  { bot: "Gold Reversal", accent: "#eab308", sym: "XAUUSD", side: "BUY", qty: 12, entry: 2412.5, ltp: 2418.9 },
];

const posPnl = (p: Pos) => (p.ltp - p.entry) * p.qty * (p.side === "BUY" ? 1 : -1);
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export default function LiveAlgoTradingSection() {
  const [positions, setPositions] = useState<Pos[]>(INIT_POS);
  const [fills, setFills] = useState<Fill[]>([]);
  const [realized, setRealized] = useState(18432.5);
  const [trades, setTrades] = useState(47);
  const [equity, setEquity] = useState<number[]>(() =>
    Array.from({ length: 40 }, (_, i) => 100 + i * 0.6 + Math.sin(i / 3) * 2),
  );
  const fillId = useRef(1);

  // Tick prices + equity every ~1.2s
  useEffect(() => {
    const t = setInterval(() => {
      setPositions((prev) =>
        prev.map((p) => {
          const vol = p.ltp * 0.0015;
          const next = Math.max(0.1, p.ltp + (Math.random() - 0.48) * vol * 2);
          return { ...p, ltp: +next.toFixed(p.ltp > 1000 ? 1 : 2) };
        }),
      );
      setEquity((prev) => {
        const last = prev[prev.length - 1];
        return [...prev.slice(1), Math.max(90, last + (Math.random() - 0.42) * 1.4)];
      });
    }, 1200);
    return () => clearInterval(t);
  }, []);

  // New execution every ~3.2s
  useEffect(() => {
    const t = setInterval(() => {
      const b = BOTS[Math.floor(Math.random() * BOTS.length)];
      const side: "BUY" | "SELL" = Math.random() > 0.5 ? "BUY" : "SELL";
      const price = b.sym === "BTCUSDT" ? 60000 + Math.random() * 3000 : 100 + Math.random() * 500;
      const f: Fill = {
        id: fillId.current++,
        t: now(),
        bot: b.name,
        accent: b.accent,
        side,
        sym: b.sym,
        qty: b.sym === "BTCUSDT" ? +(Math.random() * 0.4).toFixed(3) : Math.floor(30 + Math.random() * 120),
        price: +price.toFixed(2),
      };
      setFills((prev) => [f, ...prev].slice(0, 7));
      setTrades((n) => n + 1);
      setRealized((r) => r + (Math.random() - 0.35) * 600);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  const openPnl = positions.reduce((s, p) => s + posPnl(p), 0);
  const todayPnl = realized + openPnl;

  const stats = [
    { icon: Zap, label: "Today's P&L", value: inr(todayPnl), up: todayPnl >= 0, big: true },
    { icon: Bot, label: "Active Bots", value: "4", sub: "running" },
    { icon: Activity, label: "Trades Today", value: String(trades), sub: "auto-executed" },
    { icon: Gauge, label: "Win Rate", value: "68.4%", sub: "last 30d" },
  ];

  // equity sparkline path
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const span = max - min || 1;
  const pts = equity
    .map((v, i) => `${(i / (equity.length - 1)) * 100},${100 - ((v - min) / span) * 100}`)
    .join(" ");

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-bold uppercase tracking-[0.15em] text-white flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-400 animate-pulse" /> Live Algo Engine
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> ACTIVE
          </span>
        </h2>
        <span className="text-xs text-zinc-500 font-mono flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-teal-400" /> 4 bots · execution live · session {now()}
        </span>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e17]/70 backdrop-blur p-4">
            <div className="pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-teal-500/10 blur-2xl" />
            <s.icon className="h-4 w-4 text-teal-400" />
            <div className={`mt-2 font-mono font-bold ${s.big ? "text-2xl" : "text-2xl"} ${s.up === undefined ? "text-white" : s.up ? "text-emerald-400" : "text-red-400"}`}>
              {s.value}
            </div>
            <div className="text-xs text-zinc-500">{s.label}{s.sub ? ` · ${s.sub}` : ""}</div>
          </div>
        ))}
      </div>

      {/* equity strip */}
      <div className="rounded-2xl border border-white/10 bg-[#0a0e17]/70 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Equity curve · intraday</span>
          <span className={`text-xs font-mono font-semibold ${openPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            open {openPnl >= 0 ? "+" : ""}{inr(openPnl)}
          </span>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-16">
          <defs>
            <linearGradient id="eqf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${pts} 100,100`} fill="url(#eqf)" />
          <polyline points={pts} fill="none" stroke="#2dd4bf" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      {/* bots */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BOTS.map((b, i) => {
          const p = positions[i];
          const pnl = p ? posPnl(p) : 0;
          return (
            <div key={b.name} className="rounded-2xl border bg-[#0a0e17]/70 p-4" style={{ borderColor: `${b.accent}33` }}>
              <div className="flex items-center justify-between">
                <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${b.accent}22` }}>
                  <Bot className="h-4 w-4" style={{ color: b.accent }} />
                </span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> RUNNING
                </span>
              </div>
              <div className="mt-2.5 text-sm font-semibold text-white truncate">{b.name}</div>
              <div className="text-[11px] text-zinc-500 truncate">{b.sym} · {b.strat}</div>
              <div className={`mt-2 text-sm font-mono font-bold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {pnl >= 0 ? "+" : ""}{inr(pnl)}
              </div>
            </div>
          );
        })}
      </div>

      {/* positions + feed */}
      <div className="grid lg:grid-cols-5 gap-3">
        {/* positions */}
        <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-[#0a0e17]/70 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-teal-400" /> Open Positions · {positions.length}
          </div>
          <div className="divide-y divide-white/5">
            {positions.map((p) => {
              const pnl = posPnl(p);
              return (
                <div key={p.sym} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="h-6 w-1 rounded-full" style={{ backgroundColor: p.accent }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{p.sym}</div>
                    <div className="text-[11px] text-zinc-500">
                      <span className={p.side === "BUY" ? "text-emerald-400" : "text-red-400"}>{p.side}</span> {p.qty} @ {fmt(p.entry)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-zinc-200 tabular-nums">{fmt(p.ltp)}</div>
                    <div className="text-[10px] text-zinc-600">LTP</div>
                  </div>
                  <div className="text-right w-24">
                    <div className={`text-sm font-mono font-semibold tabular-nums ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {pnl >= 0 ? "+" : ""}{fmt(pnl, 0)}
                    </div>
                    <div className="text-[10px] text-zinc-600">P&amp;L</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* execution feed */}
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#05070d] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-teal-400" /> Execution Feed
          </div>
          <div className="p-3 space-y-1.5 font-mono text-[11px] min-h-[180px]">
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
    </div>
  );
}
