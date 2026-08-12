import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Link2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ACCOUNTS, initials } from "@/lib/demoAccounts";

const CONNECTABLE = [
  { name: "Zerodha", accent: "#387ED1" }, { name: "Upstox", accent: "#8257E6" },
  { name: "Angel One", accent: "#E8462B" }, { name: "Fyers", accent: "#1E88E5" },
  { name: "Dhan", accent: "#1FB6A6" }, { name: "Delta Exchange", accent: "#22C55E" },
  { name: "Exness", accent: "#F9B22C" }, { name: "Binance", accent: "#F0B90B" },
];

/**
 * Trading Accounts strip — UI only. Each card opens that account's dedicated
 * dashboard at /account/:slug. Add Account / Manage are mocked with dialogs.
 */
export default function TradingAccountsSection() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-[0.15em] text-white">Trading Accounts</h2>
          <p className="text-sm text-zinc-500">All your connected brokers &amp; accounts · open one for its live dashboard</p>
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

      {/* Cards — whole card navigates to the account dashboard */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {ACCOUNTS.map((a) => (
          <button
            key={a.slug}
            onClick={() => navigate(`/account/${a.slug}`)}
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
              Open Dashboard
            </div>
          </button>
        ))}
      </div>

      {/* Add Account */}
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

      {/* Manage */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="bg-[#0a0e17] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage accounts</DialogTitle>
            <DialogDescription>Open, pause or remove connected brokers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {ACCOUNTS.map((a) => (
              <div key={a.slug} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: a.accent }}>{initials(a.name)}</span>
                  <div>
                    <div className="text-sm font-semibold">{a.name}</div>
                    <div className="text-xs text-zinc-500 font-mono">{a.id}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => { setManageOpen(false); navigate(`/account/${a.slug}`); }}>Open</Button>
                  <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => toast(`${a.name} removed (demo).`)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
