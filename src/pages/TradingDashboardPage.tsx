import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Navigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Bot,
  Activity,
  ShieldAlert,
  Wallet,
  BarChart3,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";

// ─────────────────────────── FORM OPTIONS ───────────────────────────

const TRADE_TYPES = [
  { value: "crypto", label: "Crypto" },
  { value: "forex", label: "Forex" },
  { value: "stocks", label: "Stocks" },
  { value: "commodities", label: "Commodities" },
  { value: "indices", label: "Indices" },
];

const TRADING_EXPERIENCE = [
  { value: "beginner", label: "Beginner", desc: "Less than 1 year" },
  { value: "intermediate", label: "Intermediate", desc: "1–3 years" },
  { value: "advanced", label: "Advanced", desc: "3–5 years" },
  { value: "expert", label: "Expert", desc: "5+ years" },
];

const PREFERRED_TIMEFRAME = [
  { value: "intraday", label: "Intraday", desc: "Same-day trades" },
  { value: "swing", label: "Swing", desc: "2–10 days" },
  { value: "position", label: "Position", desc: "Weeks to months" },
];

const TRADING_SESSIONS = [
  { value: "asian", label: "Asian Session" },
  { value: "european", label: "European Session" },
  { value: "us", label: "US Session" },
  { value: "all", label: "24/7" },
];

const CURRENCIES = [
  { value: "INR", label: "INR (₹)" },
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
];

const RISK_TOLERANCE = [
  { value: "conservative", label: "Conservative", desc: "Low risk, steady returns" },
  { value: "moderate", label: "Moderate", desc: "Balanced risk/reward" },
  { value: "aggressive", label: "Aggressive", desc: "Higher risk tolerance" },
];

const LEVERAGE_PREFERENCE = [
  { value: "none", label: "No leverage" },
  { value: "low", label: "Low (1–2×)" },
  { value: "medium", label: "Medium (2–5×)" },
  { value: "high", label: "High (5×+)" },
];

const TRADING_GOALS = [
  { value: "growth", label: "Capital Growth" },
  { value: "income", label: "Regular Income" },
  { value: "both", label: "Both" },
];

const TRADING_FREQUENCY = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

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
    { date: "Feb 10", equity: 450000 },
    { date: "Feb 15", equity: 453000 },
    { date: "Feb 20", equity: 461000 },
    { date: "Feb 25", equity: 459000 },
    { date: "Mar 1", equity: 467500 },
    { date: "Mar 5", equity: 482000 },
    { date: "Mar 11", equity: 497800 },
  ],
  "3M": [
    { date: "Dec", equity: 390000 },
    { date: "Jan", equity: 415000 },
    { date: "Feb", equity: 455000 },
    { date: "Mar", equity: 497800 },
  ],
  YTD: [
    { date: "Jan", equity: 400000 },
    { date: "Feb", equity: 435000 },
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

const STORAGE_KEY_PREFIX = "trading_dashboard_onboarding_submitted_";

// ─────────────────────────── FORM TYPES ───────────────────────────

interface OnboardingFormData {
  strategy: string;
  customStrategy: string;
  tradeType: string;
  tradingExperience: string;
  preferredTimeframe: string;
  tradingSession: string;
  investmentAmount: string;
  currency: string;
  profitMargin: string;
  stopLoss: string;
  maxDrawdown: string;
  riskTolerance: string;
  leveragePreference: string;
  tradingGoal: string;
  tradingFrequency: string;
  phoneNumber: string;
  additionalNotes: string;
  acknowledgement: boolean;
}

const initialFormData: OnboardingFormData = {
  strategy: "",
  customStrategy: "",
  tradeType: "",
  tradingExperience: "",
  preferredTimeframe: "",
  tradingSession: "",
  investmentAmount: "",
  currency: "INR",
  profitMargin: "",
  stopLoss: "",
  maxDrawdown: "",
  riskTolerance: "",
  leveragePreference: "",
  tradingGoal: "",
  tradingFrequency: "",
  phoneNumber: "",
  additionalNotes: "",
  acknowledgement: false,
};

// ─────────────────────────── COMPONENTS ───────────────────────────

const KpiCard = ({
  label,
  value,
  icon: Icon,
  change,
  positive,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  change: string;
  positive: boolean;
}) => (
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

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
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

// ─────────────────────────── FORM SECTION HEADER ───────────────────────────

function FormSection({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-teal-400 uppercase tracking-widest">{title}</h3>
      {description && <p className="text-xs text-zinc-500">{description}</p>}
    </div>
  );
}

// ─────────────────────────── ONBOARDING FORM ───────────────────────────

function OnboardingForm({
  formData,
  setFormData,
  onSubmit,
  isSubmitting,
}: {
  formData: OnboardingFormData;
  setFormData: React.Dispatch<React.SetStateAction<OnboardingFormData>>;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof OnboardingFormData, string>>>({});

  const validate = (): boolean => {
    const next: Partial<Record<keyof OnboardingFormData, string>> = {};
    if (!formData.strategy && !formData.customStrategy) {
      next.strategy = "Please select a strategy or enter a custom one.";
    }
    if (formData.strategy === "custom" && !formData.customStrategy.trim()) {
      next.customStrategy = "Please enter your custom strategy.";
    }
    if (!formData.tradeType) next.tradeType = "Please select a trade type.";
    if (!formData.tradingExperience) next.tradingExperience = "Please select your experience level.";
    if (!formData.preferredTimeframe) next.preferredTimeframe = "Please select preferred timeframe.";
    if (!formData.tradingSession) next.tradingSession = "Please select trading session.";
    if (!formData.investmentAmount.trim()) next.investmentAmount = "Investment amount is required.";
    if (!formData.profitMargin.trim()) next.profitMargin = "Target profit margin is required.";
    if (!formData.stopLoss.trim()) next.stopLoss = "Stop loss is required.";
    if (!formData.riskTolerance) next.riskTolerance = "Please select risk tolerance.";
    if (!formData.leveragePreference) next.leveragePreference = "Please select leverage preference.";
    if (!formData.tradingGoal) next.tradingGoal = "Please select trading goal.";
    if (!formData.tradingFrequency) next.tradingFrequency = "Please select trading frequency.";
    if (!formData.phoneNumber.trim()) next.phoneNumber = "Phone number is required.";
    if (!formData.acknowledgement) next.acknowledgement = "You must acknowledge the terms.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit();
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans flex items-center justify-center p-4 py-8">
      <Helmet>
        <title>Algo Trade Setup | TradingSmart.ai</title>
        <meta name="description" content="Complete your trading profile to get started with Algo Trading." />
      </Helmet>
      <Card className="w-full max-w-3xl bg-zinc-950 border border-zinc-800">
        <CardHeader>
          <CardTitle className="text-2xl text-white">Algo Trade Setup</CardTitle>
          <p className="text-sm text-zinc-400 mt-1">
            Complete your trading profile so we can configure your algo trading dashboard and match strategies to your goals.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="min-h-[60vh] pr-4">
              <div className="space-y-6">
                {/* ── Strategy & Trading Style ── */}
                <div className="space-y-4">
                  <FormSection title="Strategy & Trading Style" description="Choose how you want to trade" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="strategy" className="text-zinc-300">Strategy</Label>
                      <Select value={formData.strategy} onValueChange={(v) => setFormData((prev) => ({ ...prev, strategy: v }))}>
                        <SelectTrigger id="strategy" className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select a strategy" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {STRATEGIES.map((s) => (
                            <SelectItem key={s.value} value={s.value} className="text-zinc-200">
                              {s.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom" className="text-zinc-200">Custom Strategy</SelectItem>
                        </SelectContent>
                      </Select>
                      {formData.strategy === "custom" && (
                        <Input
                          placeholder="Describe your custom strategy"
                          value={formData.customStrategy}
                          onChange={(e) => setFormData((prev) => ({ ...prev, customStrategy: e.target.value }))}
                          className="mt-2 bg-zinc-900 border-zinc-700"
                        />
                      )}
                      {errors.strategy && <p className="text-xs text-red-400">{errors.strategy}</p>}
                      {errors.customStrategy && <p className="text-xs text-red-400">{errors.customStrategy}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300">Trading Experience</Label>
                      <Select value={formData.tradingExperience} onValueChange={(v) => setFormData((prev) => ({ ...prev, tradingExperience: v }))}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select experience" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {TRADING_EXPERIENCE.map((e) => (
                            <SelectItem key={e.value} value={e.value} className="text-zinc-200">
                              {e.label} — {e.desc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.tradingExperience && <p className="text-xs text-red-400">{errors.tradingExperience}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300">Preferred Timeframe</Label>
                      <Select value={formData.preferredTimeframe} onValueChange={(v) => setFormData((prev) => ({ ...prev, preferredTimeframe: v }))}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select timeframe" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {PREFERRED_TIMEFRAME.map((t) => (
                            <SelectItem key={t.value} value={t.value} className="text-zinc-200">
                              {t.label} — {t.desc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.preferredTimeframe && <p className="text-xs text-red-400">{errors.preferredTimeframe}</p>}
                    </div>
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                {/* ── Market Preferences ── */}
                <div className="space-y-4">
                  <FormSection title="Market Preferences" description="What markets do you trade?" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-zinc-300">Trade Type</Label>
                      <Select value={formData.tradeType} onValueChange={(v) => setFormData((prev) => ({ ...prev, tradeType: v }))}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select trade type" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {TRADE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value} className="text-zinc-200">{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.tradeType && <p className="text-xs text-red-400">{errors.tradeType}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300">Preferred Trading Session</Label>
                      <Select value={formData.tradingSession} onValueChange={(v) => setFormData((prev) => ({ ...prev, tradingSession: v }))}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select session" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {TRADING_SESSIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value} className="text-zinc-200">{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.tradingSession && <p className="text-xs text-red-400">{errors.tradingSession}</p>}
                    </div>
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                {/* ── Capital & Risk Parameters ── */}
                <div className="space-y-4">
                  <FormSection title="Capital & Risk Parameters" description="Define your capital and risk limits" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="investmentAmount" className="text-zinc-300">Investment Amount</Label>
                      <div className="flex gap-2">
                        <Select value={formData.currency} onValueChange={(v) => setFormData((prev) => ({ ...prev, currency: v }))}>
                          <SelectTrigger className="w-24 bg-zinc-900 border-zinc-700 text-zinc-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700">
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c.value} value={c.value} className="text-zinc-200">{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          id="investmentAmount"
                          type="text"
                          placeholder="e.g. 50,000"
                          value={formData.investmentAmount}
                          onChange={(e) => setFormData((prev) => ({ ...prev, investmentAmount: e.target.value }))}
                          className="flex-1 bg-zinc-900 border-zinc-700"
                        />
                      </div>
                      {errors.investmentAmount && <p className="text-xs text-red-400">{errors.investmentAmount}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profitMargin" className="text-zinc-300">Target Profit Margin (%)</Label>
                      <Input
                        id="profitMargin"
                        type="text"
                        placeholder="e.g. 10"
                        value={formData.profitMargin}
                        onChange={(e) => setFormData((prev) => ({ ...prev, profitMargin: e.target.value }))}
                        className="bg-zinc-900 border-zinc-700"
                      />
                      {errors.profitMargin && <p className="text-xs text-red-400">{errors.profitMargin}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stopLoss" className="text-zinc-300">Stop Loss (%)</Label>
                      <Input
                        id="stopLoss"
                        type="text"
                        placeholder="e.g. 5"
                        value={formData.stopLoss}
                        onChange={(e) => setFormData((prev) => ({ ...prev, stopLoss: e.target.value }))}
                        className="bg-zinc-900 border-zinc-700"
                      />
                      {errors.stopLoss && <p className="text-xs text-red-400">{errors.stopLoss}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxDrawdown" className="text-zinc-300">Max Drawdown Tolerance (%)</Label>
                      <Input
                        id="maxDrawdown"
                        type="text"
                        placeholder="e.g. 15 (optional)"
                        value={formData.maxDrawdown}
                        onChange={(e) => setFormData((prev) => ({ ...prev, maxDrawdown: e.target.value }))}
                        className="bg-zinc-900 border-zinc-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300">Risk Tolerance</Label>
                      <Select value={formData.riskTolerance} onValueChange={(v) => setFormData((prev) => ({ ...prev, riskTolerance: v }))}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select risk level" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {RISK_TOLERANCE.map((r) => (
                            <SelectItem key={r.value} value={r.value} className="text-zinc-200">
                              {r.label} — {r.desc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.riskTolerance && <p className="text-xs text-red-400">{errors.riskTolerance}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300">Leverage Preference</Label>
                      <Select value={formData.leveragePreference} onValueChange={(v) => setFormData((prev) => ({ ...prev, leveragePreference: v }))}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select leverage" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {LEVERAGE_PREFERENCE.map((l) => (
                            <SelectItem key={l.value} value={l.value} className="text-zinc-200">{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.leveragePreference && <p className="text-xs text-red-400">{errors.leveragePreference}</p>}
                    </div>
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                {/* ── Trading Goals ── */}
                <div className="space-y-4">
                  <FormSection title="Trading Goals" description="What do you want to achieve?" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-zinc-300">Primary Goal</Label>
                      <Select value={formData.tradingGoal} onValueChange={(v) => setFormData((prev) => ({ ...prev, tradingGoal: v }))}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select goal" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {TRADING_GOALS.map((g) => (
                            <SelectItem key={g.value} value={g.value} className="text-zinc-200">{g.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.tradingGoal && <p className="text-xs text-red-400">{errors.tradingGoal}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300">Trading Frequency</Label>
                      <Select value={formData.tradingFrequency} onValueChange={(v) => setFormData((prev) => ({ ...prev, tradingFrequency: v }))}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {TRADING_FREQUENCY.map((f) => (
                            <SelectItem key={f.value} value={f.value} className="text-zinc-200">{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.tradingFrequency && <p className="text-xs text-red-400">{errors.tradingFrequency}</p>}
                    </div>
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                {/* ── Contact & Notes ── */}
                <div className="space-y-4">
                  <FormSection title="Contact & Notes" description="How can we reach you?" />
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber" className="text-zinc-300">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                      className="bg-zinc-900 border-zinc-700"
                    />
                    {errors.phoneNumber && <p className="text-xs text-red-400">{errors.phoneNumber}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="additionalNotes" className="text-zinc-300">Additional Notes (optional)</Label>
                    <Textarea
                      id="additionalNotes"
                      placeholder="Any specific requirements, instruments, or preferences..."
                      value={formData.additionalNotes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, additionalNotes: e.target.value }))}
                      className="min-h-[80px] bg-zinc-900 border-zinc-700 resize-none"
                    />
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                {/* ── Acknowledgements ── */}
                <div className="space-y-4">
                  <FormSection title="Acknowledgements" />
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="acknowledgement"
                      checked={formData.acknowledgement}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, acknowledgement: checked === true }))
                      }
                      className="mt-0.5 border-zinc-600 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="acknowledgement" className="text-sm text-zinc-400 font-normal cursor-pointer">
                        I acknowledge that trading involves substantial risk of loss. Past performance does not guarantee future results.
                        I am solely responsible for my trading decisions and understand that algorithmic trading may not be suitable for everyone.
                      </Label>
                      {errors.acknowledgement && <p className="text-xs text-red-400">{errors.acknowledgement}</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-zinc-800">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-teal-500 hover:bg-teal-400 text-black font-semibold py-6"
              >
                {isSubmitting ? "Submitting…" : "Submit & Continue to Dashboard"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────── THANK YOU POPUP ───────────────────────────

function ThankYouPopup({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onOpenChange(false), 3000);
    return () => clearTimeout(t);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-center sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-teal-400">
            <CheckCircle2 className="h-8 w-8" />
            Thank You!
          </DialogTitle>
        </DialogHeader>
        <p className="text-zinc-300 py-4">
          Your preferences have been saved. Redirecting to your dashboard…
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── DASHBOARD CONTENT ───────────────────────────

function DashboardContent() {
  const [equityRange, setEquityRange] = useState<string>("1W");
  const [tradeFilter, setTradeFilter] = useState({ asset: "all", type: "all", pnl: "all" });

  const filteredTrades = tradeLogs.filter((t) => {
    if (tradeFilter.asset !== "all" && t.asset !== tradeFilter.asset) return false;
    if (tradeFilter.type !== "all" && t.type !== tradeFilter.type) return false;
    if (tradeFilter.pnl === "profit" && t.pnl <= 0) return false;
    if (tradeFilter.pnl === "loss" && t.pnl >= 0) return false;
    return true;
  });

  const confidenceColor =
    AI_PROBABILITY >= 70 ? "text-emerald-400" : AI_PROBABILITY >= 50 ? "text-amber-400" : "text-red-400";
  const confidenceLabel =
    AI_PROBABILITY >= 70 ? "HIGH CONFIDENCE" : AI_PROBABILITY >= 50 ? "MODERATE" : "LOW CONFIDENCE";
  const confidenceBg =
    AI_PROBABILITY >= 70 ? "bg-emerald-500" : AI_PROBABILITY >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans">
      <Helmet>
        <title>Algo Trading Dashboard | TradingSmart.ai</title>
        <meta
          name="description"
          content="Algorithmic Trading Dashboard — monitor your AI trading performance, risk analytics, and strategy health in real-time."
        />
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
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8 max-w-[1400px]">
        {/* ── SECTION 1: KPI CARDS ── */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpiCards.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </div>
        </section>

        {/* ── SECTION 2: AI CONFIDENCE + STRATEGY HEALTH ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-zinc-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
                AI Trade Probability
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center pt-4 pb-8">
              <div className="relative w-44 h-44 mb-6">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="50" stroke="#27272a" strokeWidth="10" fill="none" />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    stroke="url(#tealGradient)"
                    strokeWidth="10"
                    fill="none"
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
              <Badge
                className={`${confidenceBg} text-black font-bold tracking-widest text-xs px-4 py-1.5 rounded-full mb-4`}
              >
                {confidenceLabel}
              </Badge>
              <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden mt-2">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-700"
                  style={{ width: `${AI_PROBABILITY}%` }}
                ></div>
              </div>
              <div className="flex w-full justify-between text-[11px] text-zinc-600 mt-1.5 px-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <p className="text-xs text-zinc-500 text-center mt-4 leading-relaxed">
                Based on multi-indicator sentiment, RSI, VWAP, and volume confluence. Signal direction:{" "}
                <strong className="text-teal-400">LONG</strong>.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-zinc-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Strategy Health
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 space-y-5">
              <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                <span className="text-sm font-semibold text-zinc-300">Overall Status</span>
                <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-emerald-400 text-sm font-bold tracking-widest">GOOD</span>
                </div>
              </div>
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
                    <div
                      className={`h-1.5 rounded-full transition-all duration-700 ${
                        m.color === "text-emerald-400"
                          ? "bg-emerald-500"
                          : m.color === "text-teal-400"
                            ? "bg-teal-500"
                            : m.color === "text-blue-400"
                              ? "bg-blue-500"
                              : "bg-purple-500"
                      }`}
                      style={{ width: `${Math.min(m.bar, 100)}%` }}
                    ></div>
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
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                        equityRange === r ? "bg-teal-500 text-black" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {r}
                    </button>
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
                <AreaChart
                  data={equityCurveData[equityRange]}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#52525b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#14b8a6"
                    strokeWidth={2.5}
                    fill="url(#equityGradient)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#14b8a6", strokeWidth: 0 }}
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
                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-medium leading-tight">
                  {m.label}
                </p>
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
                  <Badge className="bg-zinc-800 text-zinc-400 font-semibold ml-1">
                    {filteredTrades.length} trades
                  </Badge>
                </CardTitle>
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
                      <TableHead key={h} className="text-zinc-500 text-xs uppercase tracking-widest font-semibold">
                        {h}
                      </TableHead>
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
                        <Badge
                          className={`text-xs font-bold px-2.5 py-1 ${
                            t.type === "BUY"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {t.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-300 text-sm font-mono">{t.entry}</TableCell>
                      <TableCell className="text-zinc-400 text-sm">{t.size} units</TableCell>
                      <TableCell
                        className={`text-sm font-bold flex items-center gap-1 ${
                          t.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {t.pnl >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
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

// ─────────────────────────── MAIN PAGE ───────────────────────────

export default function TradingDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [formSubmitted, setFormSubmitted] = useState<boolean | null>(null);
  const [formData, setFormData] = useState<OnboardingFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const key = `${STORAGE_KEY_PREFIX}${user.id}`;
    const submitted = localStorage.getItem(key) === "true";
    setFormSubmitted(submitted);
  }, [user?.id]);

  const handleFormSubmit = () => {
    if (!user?.id) return;
    setIsSubmitting(true);
    // Simulate API call / persistence — you can replace with Supabase insert
    setTimeout(() => {
      const key = `${STORAGE_KEY_PREFIX}${user.id}`;
      localStorage.setItem(key, "true");
      setIsSubmitting(false);
      setShowThankYou(true);
      setFormSubmitted(true);
    }, 500);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (formSubmitted === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading…</div>
      </div>
    );
  }

  if (!formSubmitted) {
    return (
      <>
        <OnboardingForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleFormSubmit}
          isSubmitting={isSubmitting}
        />
        <ThankYouPopup open={showThankYou} onOpenChange={setShowThankYou} />
      </>
    );
  }

  return (
    <>
      <ThankYouPopup open={showThankYou} onOpenChange={setShowThankYou} />
      <DashboardContent />
    </>
  );
}
