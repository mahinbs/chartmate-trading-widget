import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
    TrendingUp, TrendingDown, Bot, Activity, ShieldAlert, Wallet,
    BarChart3, RefreshCw, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─────────────────────────── MOCK DATA ───────────────────────────

const equityCurveData: Record<string, { date: string; equity: number }[]> = {
    "1W": [
        { date: "Mar 5", equity: 482000 },
        { date: "Mar 6", equity: 485300 },
        { date: "Mar 7", equity: 483100 },
        { date: "Mar 8", equity: 489200 },
        { date: "Mar 9", equity: 487000 },
        { date: "Mar 10", equity: 492500 },
        { date: "Mar 11", equity: 497800 },
    ],
    "1M": [
        { date: "Feb 10", equity: 450000 }, { date: "Feb 15", equity: 453000 },
        { date: "Feb 20", equity: 461000 }, { date: "Feb 25", equity: 459000 },
        { date: "Mar 1", equity: 467500 }, { date: "Mar 5", equity: 482000 },
        { date: "Mar 11", equity: 497800 },
    ],
    "3M": [
        { date: "Dec", equity: 390000 }, { date: "Jan", equity: 415000 },
        { date: "Feb", equity: 455000 }, { date: "Mar", equity: 497800 },
    ],
    "YTD": [
        { date: "Jan", equity: 400000 }, { date: "Feb", equity: 435000 },
        { date: "Mar", equity: 497800 },
    ],
};

const tradeLogs = [
    { time: "10:12", asset: "TATA MOTORS", type: "BUY", entry: "₹812", size: 50, pnl: 900 },
    { time: "11:43", asset: "RELIANCE", type: "SELL", entry: "₹2,540", size: 20, pnl: -350 },
    { time: "12:20", asset: "INFY", type: "BUY", entry: "₹1,455", size: 40, pnl: 620 },
    { time: "13:05", asset: "HDFC BANK", type: "BUY", entry: "₹1,720", size: 30, pnl: -180 },
    { time: "13:55", asset: "NIFTY 50", type: "SELL", entry: "₹22,340", size: 5, pnl: 1250 },
    { time: "14:30", asset: "TCS", type: "BUY", entry: "₹3,890", size: 15, pnl: 430 },
    { time: "15:02", asset: "WIPRO", type: "SELL", entry: "₹485", size: 100, pnl: -220 },
];

const kpiCards = [
    { label: "Total Capital", value: "₹4,97,800", icon: Wallet, change: "+₹15,300", positive: true },
    { label: "Today P&L", value: "+₹3,450", icon: TrendingUp, change: "+0.7%", positive: true },
    { label: "Win Rate", value: "66%", icon: Activity, change: "+2% vs last week", positive: true },
    { label: "Active Bots", value: "3", icon: Bot, change: "Running", positive: true },
    { label: "Total Trades", value: "147", icon: BarChart3, change: "Today: 7", positive: true },
    { label: "Max Drawdown", value: "5.4%", icon: ShieldAlert, change: "-0.3% vs last month", positive: true },
];

const riskMetrics = [
    { label: "Sharpe Ratio", value: "1.82", color: "text-emerald-400" },
    { label: "Sortino Ratio", value: "2.14", color: "text-teal-400" },
    { label: "Max Drawdown", value: "5.4%", color: "text-amber-400" },
    { label: "Risk Per Trade", value: "1.8%", color: "text-blue-400" },
    { label: "Exposure", value: "62%", color: "text-purple-400" },
    { label: "Portfolio Volatility", value: "9%", color: "text-pink-400" },
];

const AI_PROBABILITY = 72;

// ─────────────────────────── COMPONENTS ───────────────────────────

const KpiCard = ({
    label, value, icon: Icon, change, positive,
}: { label: string; value: string; icon: React.ElementType; change: string; positive: boolean }) => (
    <Card className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors group">
        <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">{label}</span>
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
                    <Icon className="h-4 w-4 text-teal-400" />
                </div>
            </div>
            <p className="text-2xl lg:text-3xl font-black text-white tracking-tight mb-1">{value}</p>
            <p className={`text-xs font-medium ${positive ? "text-emerald-400" : "text-red-400"}`}>{change}</p>
        </CardContent>
    </Card>
);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 shadow-xl">
                <p className="text-xs text-zinc-400 mb-1">{label}</p>
                <p className="text-teal-400 font-bold">₹{Number(payload[0].value).toLocaleString("en-IN")}</p>
            </div>
        );
    }
    return null;
};

// ─────────────────────────── MAIN PAGE ───────────────────────────

export default function TradingDashboardPage() {
    const [equityRange, setEquityRange] = useState<string>("1W");
    const [tradeFilter, setTradeFilter] = useState({ asset: "all", type: "all", pnl: "all" });

    const filteredTrades = tradeLogs.filter((t) => {
        if (tradeFilter.asset !== "all" && t.asset !== tradeFilter.asset) return false;
        if (tradeFilter.type !== "all" && t.type !== tradeFilter.type) return false;
        if (tradeFilter.pnl === "profit" && t.pnl <= 0) return false;
        if (tradeFilter.pnl === "loss" && t.pnl >= 0) return false;
        return true;
    });

    const confidenceColor = AI_PROBABILITY >= 70 ? "text-emerald-400" : AI_PROBABILITY >= 50 ? "text-amber-400" : "text-red-400";
    const confidenceLabel = AI_PROBABILITY >= 70 ? "HIGH CONFIDENCE" : AI_PROBABILITY >= 50 ? "MODERATE" : "LOW CONFIDENCE";
    const confidenceBg = AI_PROBABILITY >= 70 ? "bg-emerald-500" : AI_PROBABILITY >= 50 ? "bg-amber-500" : "bg-red-500";

    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans">
            <Helmet>
                <title>Algo Trading Dashboard | TradingSmart.ai</title>
                <meta name="description" content="Algorithmic Trading Dashboard — monitor your AI trading performance, risk analytics, and strategy health in real-time." />
            </Helmet>

            {/* ── HEADER ── */}
            <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/90 backdrop-blur-xl">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-bold text-white tracking-tight">Algo Trading Dashboard</h1>
                        <p className="text-xs text-zinc-500 mt-0.5">Live Strategy Monitor · Mar 11, 2026</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="hidden sm:flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Market Open
                        </span>
                        <Button variant="outline" size="sm" className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5" /> Refresh
                        </Button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 space-y-8 max-w-[1400px]">

                {/* ── SECTION 1: KPI CARDS ── */}
                <section>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
                        {kpiCards.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
                    </div>
                </section>

                {/* ── SECTION 2: AI CONFIDENCE + STRATEGY HEALTH ── */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* AI Confidence Meter */}
                    <Card className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-semibold text-zinc-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
                                AI Trade Probability
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center pt-4 pb-8">
                            {/* Circular gauge */}
                            <div className="relative w-44 h-44 mb-6">
                                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                                    <circle cx="60" cy="60" r="50" stroke="#27272a" strokeWidth="10" fill="none" />
                                    <circle
                                        cx="60" cy="60" r="50" stroke="url(#tealGradient)" strokeWidth="10" fill="none"
                                        strokeDasharray={`${(AI_PROBABILITY / 100) * 314} 314`}
                                        strokeLinecap="round"
                                    />
                                    <defs>
                                        <linearGradient id="tealGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#14b8a6" />
                                            <stop offset="100%" stopColor="#34d399" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className={`text-4xl font-black ${confidenceColor}`}>{AI_PROBABILITY}%</span>
                                    <span className="text-xs text-zinc-500 mt-1">probability</span>
                                </div>
                            </div>
                            <Badge className={`${confidenceBg} text-black font-bold tracking-widest text-xs px-4 py-1.5 rounded-full mb-4`}>
                                {confidenceLabel}
                            </Badge>
                            <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden mt-2">
                                <div className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-700"
                                    style={{ width: `${AI_PROBABILITY}%` }}
                                ></div>
                            </div>
                            <div className="flex w-full justify-between text-[11px] text-zinc-600 mt-1.5 px-1">
                                <span>0%</span><span>50%</span><span>100%</span>
                            </div>
                            <p className="text-xs text-zinc-500 text-center mt-4 leading-relaxed">
                                Based on multi-indicator sentiment, RSI, VWAP, and volume confluence. Signal direction: <strong className="text-teal-400">LONG</strong>.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Strategy Health Panel */}
                    <Card className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-semibold text-zinc-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                Strategy Health
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2 space-y-5">
                            {/* Status badge */}
                            <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                                <span className="text-sm font-semibold text-zinc-300">Overall Status</span>
                                <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <span className="text-emerald-400 text-sm font-bold tracking-widest">GOOD</span>
                                </div>
                            </div>

                            {/* Metric rows */}
                            {[
                                { label: "Win Rate (Last 30 Days)", value: "66%", color: "text-emerald-400", bar: 66 },
                                { label: "Profit Factor", value: "1.8×", color: "text-teal-400", bar: 72 },
                                { label: "Avg. Trades / Day", value: "12", color: "text-blue-400", bar: 60 },
                                { label: "Strategy Uptime", value: "99.7%", color: "text-purple-400", bar: 99.7 },
                            ].map((m) => (
                                <div key={m.label}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs text-zinc-500">{m.label}</span>
                                        <span className={`text-sm font-bold ${m.color}`}>{m.value}</span>
                                    </div>
                                    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                        <div className={`h-1.5 rounded-full transition-all duration-700 ${m.color === "text-emerald-400" ? "bg-emerald-500" :
                                                m.color === "text-teal-400" ? "bg-teal-500" :
                                                    m.color === "text-blue-400" ? "bg-blue-500" : "bg-purple-500"
                                            }`} style={{ width: `${Math.min(m.bar, 100)}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>

                {/* ── SECTION 3: EQUITY CURVE CHART ── */}
                <section>
                    <Card className="bg-zinc-950 border border-zinc-800">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <CardTitle className="text-base font-semibold text-zinc-300 flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-teal-400" />
                                    Portfolio Performance — Equity Curve
                                </CardTitle>
                                <div className="flex items-center gap-1.5">
                                    {["1W", "1M", "3M", "YTD"].map((r) => (
                                        <button
                                            key={r}
                                            onClick={() => setEquityRange(r)}
                                            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${equityRange === r
                                                    ? "bg-teal-500 text-black"
                                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                                                }`}
                                        >{r}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-baseline gap-3 mt-3">
                                <span className="text-3xl font-black text-white">₹4,97,800</span>
                                <span className="text-sm text-emerald-400 font-semibold">+₹97,800 (+24.4%) all time</span>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-2 pb-4">
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={equityCurveData[equityRange]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis
                                        tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false}
                                        tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                                        width={55}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone" dataKey="equity" stroke="#14b8a6" strokeWidth={2.5}
                                        fill="url(#equityGradient)" dot={false} activeDot={{ r: 5, fill: "#14b8a6", strokeWidth: 0 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </section>

                {/* ── SECTION 4: RISK ANALYTICS ── */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <ShieldAlert className="h-4 w-4 text-zinc-400" />
                        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">Risk Analytics</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
                        {riskMetrics.map((m) => (
                            <div
                                key={m.label}
                                className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors"
                            >
                                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-medium leading-tight">{m.label}</p>
                                <p className={`text-2xl font-black ${m.color}`}>{m.value}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── SECTION 5: TRADE LOG ── */}
                <section>
                    <Card className="bg-zinc-950 border border-zinc-800">
                        <CardHeader className="pb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <CardTitle className="text-base font-semibold text-zinc-300 flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-teal-400" />
                                    Recent Trade Log
                                    <Badge className="bg-zinc-800 text-zinc-400 font-semibold ml-1">{filteredTrades.length} trades</Badge>
                                </CardTitle>
                                {/* Filters */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Select onValueChange={(v) => setTradeFilter((f) => ({ ...f, type: v }))}>
                                        <SelectTrigger className="h-8 text-xs w-28 bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                                            <SelectValue placeholder="All Types" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
                                            <SelectItem value="all">All Types</SelectItem>
                                            <SelectItem value="BUY">Buy</SelectItem>
                                            <SelectItem value="SELL">Sell</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select onValueChange={(v) => setTradeFilter((f) => ({ ...f, pnl: v }))}>
                                        <SelectTrigger className="h-8 text-xs w-28 bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                                            <SelectValue placeholder="All P&L" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
                                            <SelectItem value="all">All P&L</SelectItem>
                                            <SelectItem value="profit">Profit</SelectItem>
                                            <SelectItem value="loss">Loss</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="overflow-x-auto p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-zinc-800 hover:bg-transparent">
                                        {["Time", "Asset", "Type", "Entry Price", "Position Size", "P&L"].map((h) => (
                                            <TableHead key={h} className="text-zinc-500 text-xs uppercase tracking-widest font-semibold">{h}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTrades.map((t, i) => (
                                        <TableRow
                                            key={i}
                                            className="border-zinc-800/50 hover:bg-zinc-900/60 transition-colors cursor-pointer"
                                        >
                                            <TableCell className="text-zinc-400 text-sm font-mono">{t.time}</TableCell>
                                            <TableCell className="text-white font-semibold text-sm">{t.asset}</TableCell>
                                            <TableCell>
                                                <Badge className={`text-xs font-bold px-2.5 py-1 ${t.type === "BUY"
                                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                                                    }`}>
                                                    {t.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-zinc-300 text-sm font-mono">{t.entry}</TableCell>
                                            <TableCell className="text-zinc-400 text-sm">{t.size} units</TableCell>
                                            <TableCell className={`text-sm font-bold flex items-center gap-1 ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                                {t.pnl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                                {t.pnl >= 0 ? "+" : ""}₹{Math.abs(t.pnl).toLocaleString("en-IN")}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {filteredTrades.length === 0 && (
                                <p className="text-center text-zinc-500 text-sm py-12">No trades match the current filters.</p>
                            )}
                        </CardContent>
                    </Card>
                </section>

            </main>
        </div>
    );
}
