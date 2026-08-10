import { Plus, Link2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Trading Accounts strip — UI only (hardcoded demo brokers). Shows the
 * connected-brokers experience on the dummy/preview dashboard. Wire the
 * `ACCOUNTS` list to real broker data later.
 */

interface DemoAccount {
  name: string;
  accent: string; // brand colour for the logo chip + card glow
  id: string;
  type: string; // EQUITY / OPTIONS / REAL · MTS / EVAL · LIVE …
  balance: string;
  pnl: string;
  pnlUp: boolean;
  live?: boolean;
}

const ACCOUNTS: DemoAccount[] = [
  { name: "Zerodha", accent: "#387ED1", id: "XX1234", type: "EQUITY", balance: "₹24,58,320.45", pnl: "+2.45%", pnlUp: true, live: true },
  { name: "Exness", accent: "#F9B22C", id: "55678910", type: "REAL · MTS", balance: "$8,450.75", pnl: "+1.32%", pnlUp: true },
  { name: "Funding Friday", accent: "#7C5CFF", id: "FF123456", type: "EVAL · LIVE", balance: "$52,341.20", pnl: "+3.21%", pnlUp: true },
  { name: "Delta Exchange", accent: "#22C55E", id: "DE789012", type: "OPTIONS", balance: "₹6,75,430.80", pnl: "-0.85%", pnlUp: false },
  { name: "Upstox", accent: "#8257E6", id: "UP456789", type: "EQUITY", balance: "₹12,34,567.90", pnl: "+1.78%", pnlUp: true },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function TradingAccountsSection() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wide text-white">
            Trading Accounts
          </h2>
          <p className="text-sm text-zinc-500">All your connected brokers &amp; accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2 bg-teal-500 hover:bg-teal-400 text-black font-semibold">
            <Plus className="h-4 w-4" /> Add Account
          </Button>
          <Button size="sm" variant="outline" className="gap-2 border-zinc-700 text-zinc-300">
            <Link2 className="h-4 w-4" /> Manage
          </Button>
        </div>
      </div>

      {/* Cards — horizontal scroll on small screens */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {ACCOUNTS.map((a) => (
          <div
            key={a.name}
            className="relative shrink-0 w-[268px] rounded-2xl border bg-zinc-900/50 p-5 overflow-hidden"
            style={{ borderColor: `${a.accent}44` }}
          >
            {/* subtle brand glow */}
            <div
              className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl opacity-20"
              style={{ backgroundColor: a.accent }}
            />

            {/* logo + name + LIVE */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: a.accent }}
                >
                  {initials(a.name)}
                </div>
                <span className="text-base font-semibold text-white">{a.name}</span>
              </div>
              {a.live && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
                </span>
              )}
            </div>

            {/* account id + type badge */}
            <div className="mt-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-200 uppercase">{a.name}</div>
                <div className="text-xs text-zinc-500">{a.id}</div>
              </div>
              <span
                className="text-[10px] font-bold rounded-md px-2 py-1 border"
                style={{ color: a.accent, borderColor: `${a.accent}55`, backgroundColor: `${a.accent}18` }}
              >
                {a.type}
              </span>
            </div>

            {/* balance + day p&l */}
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Balance</div>
                <div className="text-lg font-bold text-white">{a.balance}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Day P&amp;L</div>
                <div
                  className={`flex items-center justify-end gap-0.5 text-sm font-semibold ${
                    a.pnlUp ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {a.pnlUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {a.pnl}
                </div>
              </div>
            </div>

            {/* status */}
            <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
              <span className="text-xs text-zinc-500">Status</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                CONNECTED <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            </div>

            {/* view account */}
            <Button
              variant="outline"
              className="mt-4 w-full border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              View Account
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
