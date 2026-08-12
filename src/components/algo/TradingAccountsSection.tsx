import { useEffect, useState } from "react";
import {
  Plus,
  Link2,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
  Activity,
  Wallet,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * Trading Accounts strip — UI only. Each card opens a per-account "bot trading
 * details" dialog: the bots running on that account, their live-ticking
 * positions and P&L. All data is mocked/animated client-side; wire ACCOUNTS +
 * the per-account bots/positions to real broker data later.
 */

interface BotRow {
  name: string;
  strat: string;
  sym: string;
  pnl: number;
}
interface PosRow {
  sym: string;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  ltp: number;
}
interface DemoAccount {
  name: string;
  accent: string;
  id: string;
  type: string;
  cur: "₹" | "$";
  balance: string;
  pnl: string;
  pnlUp: boolean;
  live?: boolean;
  bots: BotRow[];
  positions: PosRow[];
}

const ACCOUNTS: DemoAccount[] = [
  {
    name: "Zerodha", accent: "#387ED1", id: "XX1234", type: "EQUITY", cur: "₹",
    balance: "₹24,58,320.45", pnl: "+2.45%", pnlUp: true, live: true,
    bots: [
      { name: "Momentum Scalper", strat: "EMA 9/21 · VWAP", sym: "NIFTY", pnl: 1008 },
      { name: "Theta Engine", strat: "Iron Condor · Δ-neutral", sym: "BANKNIFTY", pnl: 1240 },
    ],
    positions: [
      { sym: "NIFTY 24500 CE", side: "BUY", qty: 150, entry: 182.4, ltp: 189.1 },
      { sym: "BANKNIFTY 52000 PE", side: "SELL", qty: 90, entry: 410.2, ltp: 396.4 },
      { sym: "RELIANCE", side: "BUY", qty: 50, entry: 2890, ltp: 2912 },
    ],
  },
  {
    name: "Exness", accent: "#F9B22C", id: "55678910", type: "REAL · MTS", cur: "$",
    balance: "$8,450.75", pnl: "+1.32%", pnlUp: true,
    bots: [
      { name: "FX Trend Rider", strat: "Supertrend · ADX", sym: "EURUSD", pnl: 82.4 },
      { name: "Gold Reversal", strat: "RSI · Bollinger", sym: "XAUUSD", pnl: 54.1 },
    ],
    positions: [
      { sym: "EURUSD", side: "BUY", qty: 0.5, entry: 1.0842, ltp: 1.0871 },
      { sym: "XAUUSD", side: "BUY", qty: 0.2, entry: 2412.5, ltp: 2418.9 },
      { sym: "GBPUSD", side: "SELL", qty: 0.3, entry: 1.274, ltp: 1.2722 },
    ],
  },
  {
    name: "Funding Friday", accent: "#7C5CFF", id: "FF123456", type: "EVAL · LIVE", cur: "$",
    balance: "$52,341.20", pnl: "+3.21%", pnlUp: true,
    bots: [
      { name: "Index Momentum", strat: "Opening Range Breakout", sym: "NAS100", pnl: 212 },
      { name: "London Breakout", strat: "Session breakout", sym: "EURUSD", pnl: 98 },
    ],
    positions: [
      { sym: "NAS100", side: "BUY", qty: 2, entry: 19840, ltp: 19902 },
      { sym: "EURUSD", side: "BUY", qty: 1, entry: 1.0842, ltp: 1.0868 },
    ],
  },
  {
    name: "Delta Exchange", accent: "#22C55E", id: "DE789012", type: "OPTIONS", cur: "₹",
    balance: "₹6,75,430.80", pnl: "-0.85%", pnlUp: false,
    bots: [
      { name: "BTC Trend Rider", strat: "Supertrend · ADX", sym: "BTCUSDT", pnl: 131.57 },
      { name: "ETH Theta", strat: "Short strangle", sym: "ETHUSDT", pnl: -42 },
    ],
    positions: [
      { sym: "BTCUSDT", side: "BUY", qty: 0.35, entry: 61240, ltp: 61615.9 },
      { sym: "ETH 3000 CE", side: "BUY", qty: 5, entry: 120, ltp: 134 },
    ],
  },
  {
    name: "Upstox", accent: "#8257E6", id: "UP456789", type: "EQUITY", cur: "₹",
    balance: "₹12,34,567.90", pnl: "+1.78%", pnlUp: true,
    bots: [
      { name: "Nifty Scalper", strat: "VWAP · Supertrend", sym: "NIFTY", pnl: 156 },
      { name: "Swing Bot", strat: "Breakout · RSI", sym: "TCS", pnl: 78 },
    ],
    positions: [
      { sym: "NIFTY 24400 PE", side: "SELL", qty: 75, entry: 95, ltp: 88 },
      { sym: "TCS", side: "BUY", qty: 20, entry: 4120, ltp: 4155 },
    ],
  },
];

const CONNECTABLE = [
  { name: "Zerodha", accent: "#387ED1" }, { name: "Upstox", accent: "#8257E6" },
  { name: "Angel One", accent: "#E8462B" }, { name: "Fyers", accent: "#1E88E5" },
  { name: "Dhan", accent: "#1FB6A6" }, { name: "Delta Exchange", accent: "#22C55E" },
  { name: "Exness", accent: "#F9B22C" }, { name: "Binance", accent: "#F0B90B" },
];

const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const fmt = (n: number, d = 2) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const posPnl = (p: PosRow) => (p.ltp - p.entry) * p.qty * (p.side === "BUY" ? 1 : -1);

/** Live-ticking per-account detail. Mounts only while the dialog is open. */
function AccountDetail({ account }: { account: DemoAccount }) {
  const [positions, setPositions] = useState<PosRow[]>(account.positions);
  useEffect(() => {
    const t = setInterval(() => {
      setPositions((prev) =>
        prev.map((p) => {
          const vol = Math.max(p.ltp * 0.0012, 0.0005);
          const next = Math.max(0.0001, p.ltp + (Math.random() - 0.47) * vol * 2);
          return { ...p, ltp: +next.toFixed(p.ltp > 100 ? 2 : 4) };
        }),
      );
    }, 1300);
    return () => clearInterval(t);
  }, []);

  const cur = account.cur;
  const openPnl = positions.reduce((s, p) => s + posPnl(p), 0);

  return (
    <div className="space-y-4">
      {/* summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Wallet, label: "Balance", value: account.balance },
          { icon: Bot, label: "Active Bots", value: String(account.bots.length) },
          { icon: Activity, label: "Open Pos.", value: String(positions.length) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <s.icon className="h-3.5 w-3.5 text-teal-400" />
            <div className="mt-1.5 text-base font-bold font-mono text-white truncate">{s.value}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* bots on this account */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500 mb-2 flex items-center gap-1.5">
          <Radio className="h-3 w-3 text-emerald-400 animate-pulse" /> Bots running on this account
        </div>
        <div className="space-y-2">
          {account.bots.map((b) => (
            <div key={b.name} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: `${account.accent}2e` }}>
              <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${account.accent}22` }}>
                <Bot className="h-4 w-4" style={{ color: account.accent }} />
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

      {/* live positions on this account */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500 mb-2 flex items-center justify-between">
          <span>Open positions</span>
          <span className={`font-mono ${openPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {openPnl >= 0 ? "+" : "-"}{cur}{fmt(Math.abs(openPnl), 0)}
          </span>
        </div>
        <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
          {positions.map((p) => {
            const pnl = posPnl(p);
            return (
              <div key={p.sym} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-6 w-1 rounded-full shrink-0" style={{ backgroundColor: account.accent }} />
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
                <div className="text-right w-20 shrink-0">
                  <div className={`text-sm font-mono font-semibold tabular-nums ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {pnl >= 0 ? "+" : "-"}{cur}{fmt(Math.abs(pnl), 0)}
                  </div>
                  <div className="text-[10px] text-zinc-600">P&amp;L</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button className="flex-1 bg-teal-500 hover:bg-teal-400 text-black font-semibold" onClick={() => toast.success(`Opening ${account.name} trade panel…`)}>Trade</Button>
        <Button variant="outline" className="flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => toast(`${account.name} disconnected (demo).`)}>Disconnect</Button>
      </div>
    </div>
  );
}

export default function TradingAccountsSection() {
  const [view, setView] = useState<DemoAccount | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-[0.15em] text-white">Trading Accounts</h2>
          <p className="text-sm text-zinc-500">All your connected brokers &amp; accounts · tap a card for live bot details</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2 bg-teal-500 hover:bg-teal-400 text-black font-semibold shadow-[0_0_20px_-4px_rgba(45,212,191,0.6)]">
            <Plus className="h-4 w-4" /> Add Account
          </Button>
          <Button size="sm" variant="outline" onClick={() => setManageOpen(true)} className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            <Link2 className="h-4 w-4" /> Manage
          </Button>
        </div>
      </div>

      {/* Cards — the whole card is clickable */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {ACCOUNTS.map((a) => (
          <button
            key={a.name}
            onClick={() => setView(a)}
            className="group relative shrink-0 w-[268px] text-left rounded-2xl border bg-[#0a0e17]/80 backdrop-blur p-5 overflow-hidden transition-all hover:-translate-y-0.5 cursor-pointer"
            style={{ borderColor: `${a.accent}40`, boxShadow: `0 0 0 1px ${a.accent}14, 0 8px 30px -12px ${a.accent}50` }}
          >
            <div className="pointer-events-none absolute -top-20 -right-20 h-44 w-44 rounded-full blur-3xl opacity-25 transition-opacity group-hover:opacity-40" style={{ backgroundColor: a.accent }} />
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: a.accent, boxShadow: `0 0 16px -2px ${a.accent}` }}>{initials(a.name)}</div>
                <span className="text-base font-semibold text-white">{a.name}</span>
              </div>
              {a.live && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
                </span>
              )}
            </div>
            <div className="relative mt-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-200 uppercase">{a.name}</div>
                <div className="text-xs text-zinc-500 font-mono">{a.id}</div>
              </div>
              <span className="text-[10px] font-bold rounded-md px-2 py-1 border" style={{ color: a.accent, borderColor: `${a.accent}55`, backgroundColor: `${a.accent}18` }}>{a.type}</span>
            </div>
            <div className="relative mt-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Balance</div>
                <div className="text-lg font-bold text-white font-mono">{a.balance}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Day P&amp;L</div>
                <div className={`flex items-center justify-end gap-0.5 text-sm font-semibold font-mono ${a.pnlUp ? "text-emerald-400" : "text-red-400"}`}>
                  {a.pnlUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {a.pnl}
                </div>
              </div>
            </div>
            <div className="relative mt-4 flex items-center justify-between border-t border-white/5 pt-3">
              <span className="text-xs text-zinc-500">Status</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                CONNECTED <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </span>
            </div>
            <div className="relative mt-4 w-full rounded-md border border-zinc-700 text-zinc-200 text-sm font-medium py-2 text-center group-hover:bg-white/5 group-hover:border-teal-500/40 transition-colors">
              View Account
            </div>
          </button>
        ))}
      </div>

      {/* ── Per-account bot-trading detail ─────────────────── */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="bg-[#0a0e17] border-white/10 text-white sm:max-w-lg max-h-[88vh] overflow-y-auto">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 flex-wrap">
                  <span className="h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: view.accent }}>{initials(view.name)}</span>
                  {view.name}
                  <span className="text-[10px] font-bold rounded-md px-2 py-0.5 border" style={{ color: view.accent, borderColor: `${view.accent}55`, backgroundColor: `${view.accent}18` }}>{view.type}</span>
                  {view.live && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE</span>
                  )}
                </DialogTitle>
                <DialogDescription className="font-mono">Account {view.id} · bots trading live</DialogDescription>
              </DialogHeader>
              <AccountDetail account={view} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Account ─────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#0a0e17] border-white/10 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect a broker</DialogTitle>
            <DialogDescription>Pick a broker to link. We'll open its secure OAuth flow.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CONNECTABLE.map((b) => (
              <button key={b.name} onClick={() => { toast.success(`Connecting to ${b.name}…`); setAddOpen(false); }} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col items-center gap-2 hover:border-white/30 hover:-translate-y-0.5 transition-all">
                <span className="h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: b.accent }}>{initials(b.name)}</span>
                <span className="text-xs text-zinc-300 text-center">{b.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Manage ──────────────────────────────────────────── */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="bg-[#0a0e17] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage accounts</DialogTitle>
            <DialogDescription>Enable, pause or remove connected brokers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {ACCOUNTS.map((a) => (
              <div key={a.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: a.accent }}>{initials(a.name)}</span>
                  <div>
                    <div className="text-sm font-semibold">{a.name}</div>
                    <div className="text-xs text-zinc-500 font-mono">{a.id}</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => toast(`${a.name} removed (demo).`)}>Remove</Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
