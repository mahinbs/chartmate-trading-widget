/**
 * Demo trading-account data — UI only. Shared by the Trading Accounts strip
 * and the per-account dashboard (/account/:slug). Replace with real broker
 * data later.
 */

export interface BotRow {
  name: string;
  strat: string;
  sym: string;
  pnl: number;
}
export interface PosRow {
  sym: string;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  ltp: number;
}
export interface DemoAccount {
  slug: string;
  name: string;
  accent: string;
  id: string;
  type: string;
  cur: "₹" | "$";
  balance: string;
  pnl: string;
  pnlUp: boolean;
  live?: boolean;
  realizedToday: number;
  winRate: string;
  bots: BotRow[];
  positions: PosRow[];
  feedSyms: string[];
}

export const ACCOUNTS: DemoAccount[] = [
  {
    slug: "zerodha", name: "Zerodha", accent: "#387ED1", id: "XX1234", type: "EQUITY", cur: "₹",
    balance: "₹24,58,320.45", pnl: "+2.45%", pnlUp: true, live: true, realizedToday: 12480, winRate: "71.2%",
    bots: [
      { name: "Momentum Scalper", strat: "EMA 9/21 · VWAP", sym: "NIFTY", pnl: 1008 },
      { name: "Theta Engine", strat: "Iron Condor · Δ-neutral", sym: "BANKNIFTY", pnl: 1240 },
    ],
    positions: [
      { sym: "NIFTY 24500 CE", side: "BUY", qty: 150, entry: 182.4, ltp: 189.1 },
      { sym: "BANKNIFTY 52000 PE", side: "SELL", qty: 90, entry: 410.2, ltp: 396.4 },
      { sym: "RELIANCE", side: "BUY", qty: 50, entry: 2890, ltp: 2912 },
    ],
    feedSyms: ["NIFTY", "BANKNIFTY", "RELIANCE", "HDFCBANK"],
  },
  {
    slug: "exness", name: "Exness", accent: "#F9B22C", id: "55678910", type: "REAL · MTS", cur: "$",
    balance: "$8,450.75", pnl: "+1.32%", pnlUp: true, realizedToday: 312.4, winRate: "64.8%",
    bots: [
      { name: "FX Trend Rider", strat: "Supertrend · ADX", sym: "EURUSD", pnl: 82.4 },
      { name: "Gold Reversal", strat: "RSI · Bollinger", sym: "XAUUSD", pnl: 54.1 },
    ],
    positions: [
      { sym: "EURUSD", side: "BUY", qty: 0.5, entry: 1.0842, ltp: 1.0871 },
      { sym: "XAUUSD", side: "BUY", qty: 0.2, entry: 2412.5, ltp: 2418.9 },
      { sym: "GBPUSD", side: "SELL", qty: 0.3, entry: 1.274, ltp: 1.2722 },
    ],
    feedSyms: ["EURUSD", "XAUUSD", "GBPUSD", "USDJPY"],
  },
  {
    slug: "funding-friday", name: "Funding Friday", accent: "#7C5CFF", id: "FF123456", type: "EVAL · LIVE", cur: "$",
    balance: "$52,341.20", pnl: "+3.21%", pnlUp: true, realizedToday: 1284, winRate: "69.5%",
    bots: [
      { name: "Index Momentum", strat: "Opening Range Breakout", sym: "NAS100", pnl: 212 },
      { name: "London Breakout", strat: "Session breakout", sym: "EURUSD", pnl: 98 },
    ],
    positions: [
      { sym: "NAS100", side: "BUY", qty: 2, entry: 19840, ltp: 19902 },
      { sym: "EURUSD", side: "BUY", qty: 1, entry: 1.0842, ltp: 1.0868 },
    ],
    feedSyms: ["NAS100", "US30", "EURUSD", "SPX500"],
  },
  {
    slug: "delta-exchange", name: "Delta Exchange", accent: "#22C55E", id: "DE789012", type: "OPTIONS", cur: "₹",
    balance: "₹6,75,430.80", pnl: "-0.85%", pnlUp: false, realizedToday: -1420, winRate: "58.1%",
    bots: [
      { name: "BTC Trend Rider", strat: "Supertrend · ADX", sym: "BTCUSDT", pnl: 131.57 },
      { name: "ETH Theta", strat: "Short strangle", sym: "ETHUSDT", pnl: -42 },
    ],
    positions: [
      { sym: "BTCUSDT", side: "BUY", qty: 0.35, entry: 61240, ltp: 61615.9 },
      { sym: "ETH 3000 CE", side: "BUY", qty: 5, entry: 120, ltp: 134 },
    ],
    feedSyms: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ETH 3000 CE"],
  },
  {
    slug: "upstox", name: "Upstox", accent: "#8257E6", id: "UP456789", type: "EQUITY", cur: "₹",
    balance: "₹12,34,567.90", pnl: "+1.78%", pnlUp: true, realizedToday: 6240, winRate: "66.9%",
    bots: [
      { name: "Nifty Scalper", strat: "VWAP · Supertrend", sym: "NIFTY", pnl: 156 },
      { name: "Swing Bot", strat: "Breakout · RSI", sym: "TCS", pnl: 78 },
    ],
    positions: [
      { sym: "NIFTY 24400 PE", side: "SELL", qty: 75, entry: 95, ltp: 88 },
      { sym: "TCS", side: "BUY", qty: 20, entry: 4120, ltp: 4155 },
    ],
    feedSyms: ["NIFTY", "TCS", "INFY", "ICICIBANK"],
  },
];

export const accountBySlug = (slug: string | undefined) =>
  ACCOUNTS.find((a) => a.slug === slug);

export const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export const posPnl = (p: PosRow) =>
  (p.ltp - p.entry) * p.qty * (p.side === "BUY" ? 1 : -1);
