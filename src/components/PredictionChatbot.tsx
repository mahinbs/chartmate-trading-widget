import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X, Send, ChevronDown, Bot, User, MessageSquare, BrainCircuit,
  Activity, TrendingUp, TrendingDown, Minus, ExternalLink, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SymbolSearch, SymbolData } from "@/components/SymbolSearch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

// ─── FAQ Knowledge Base ────────────────────────────────────────────────────
const FAQS = [
  {
    keywords: ["what is", "about", "platform", "chartmate", "this app", "this tool", "what does", "overview", "intro"],
    answer: `**ChartMate** is an AI-powered trading intelligence platform that helps you make smarter trading decisions.\n\n• 🤖 **AI Predictions** — Analyses live price, RSI, MACD, news & macro to generate BUY/SELL/HOLD signals with probability scores.\n• 📊 **Strategy Selection** — Ranks 11 real trading strategies for current market conditions.\n• 🧪 **Backtesting** — Tests strategies on 100+ days of historical OHLCV data before any order.\n• 🧾 **Paper Trading** — Simulate trades risk-free with virtual money.\n• 📅 **Daily Analysis** — Expert market predictions published daily.\n• 📈 **Trade Tracking** — Monitor live P&L, stop-loss, and target tracking.`,
  },
  {
    keywords: ["ai", "prediction", "predict", "how does ai", "gemini", "signal", "buy sell hold", "forecast", "how does it work"],
    answer: `The AI prediction pipeline runs in **7 steps** every time you analyse a stock or crypto:\n\n1. **Fetch Market Data** — Live price, volume, and change.\n2. **Historical Analysis** — Full-year OHLCV candles, fundamentals & earnings data.\n3. **Technical Indicators** — RSI, MACD, Bollinger Bands, SMA, ATR, regime detection.\n4. **News & Sentiment** — Market news, macro events, sector correlation.\n5. **AI Processing** — Multi-horizon forecasts (15m to 1W) with positioning guidance.\n6. **Risk Assessment** — Risk grade, stop-loss, take-profit targets.\n7. **Full Report** — Expected ROI scenarios (Best/Likely/Worst), key support/resistance levels.\n\nThe result is a **BUY/SELL/HOLD signal** with a confidence probability score (0–100%).`,
  },
  {
    keywords: ["strategy", "backtesting", "backtest", "paper trade", "paper trading"],
    answer: `ChartMate supports **11 professional trading strategies** including:\n\n• Trend Following, Swing Trading, Scalping, Mean Reversion, Breakout\n• Momentum, Value Investing, Dollar-Cost Averaging, and more.\n\nEach strategy is **backtested against 100+ days** of real OHLCV data before a live order is placed, giving you data-backed confidence in every trade.`,
  },
  {
    keywords: ["subscription", "plan", "price", "cost", "premium", "free"],
    answer: `ChartMate offers different subscription tiers:\n\n• **Free Plan** — Basic features, limited predictions.\n• **Premium Plan** — Unlimited AI predictions, full strategy suite, portfolio tracking, live P&L.\n\nPremium subscribers also get access to advanced backtesting, leverage simulation, and priority support.`,
  },
  {
    keywords: ["rsi", "macd", "bollinger", "technical", "indicator", "analysis", "support", "resistance"],
    answer: `ChartMate uses a comprehensive suite of **technical indicators**:\n\n• **RSI** (Relative Strength Index) — Measures momentum; <30 is oversold, >70 is overbought.\n• **MACD** — Trend-following momentum indicator.\n• **Bollinger Bands** — Volatility bands, signals breakouts and squeezes.\n• **SMA/EMA** — Moving averages to identify trend direction.\n• **ATR** — Average True Range for volatility and stop-loss sizing.\n• **Support/Resistance** — Dynamic levels from historical price action.`,
  },
  {
    keywords: ["stop loss", "take profit", "risk management", "position size"],
    answer: `ChartMate automatically calculates **risk management parameters**:\n\n• **Stop Loss** — Based on your risk tolerance (2-3% conservative to 10%+ aggressive).\n• **Take Profit** — Based on risk-reward ratio (typically 2:1 or better).\n• **Position Size** — Calculated from your investment amount and entry price.\n\nFor leveraged trades, the platform dramatically increases risk warnings and tightens recommended stops.`,
  },
  {
    keywords: ["crypto", "bitcoin", "ethereum", "stock", "nse", "bse", "nasdaq", "nyse"],
    answer: `ChartMate supports **multiple asset classes and exchanges**:\n\n• **Indian Stocks** — NSE & BSE listed equities.\n• **US Stocks** — NYSE, NASDAQ listed stocks.\n• **Crypto** — Bitcoin (BTC), Ethereum (ETH), and major altcoins.\n• **Forex** — Major currency pairs.\n\nThe AI adapts its analysis model based on the asset type and exchange for more accurate region-specific predictions.`,
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "bot" | "user";
  text: string;
  component?: React.ReactNode;
}

type ChatStep =
  | "greeting"
  | "symbol"
  | "amount"
  | "risk_tolerance"
  | "trading_style"
  | "investment_goal"
  | "stop_loss"
  | "holding_period"
  | "analyzing"
  | "results"
  | "general";

interface PredState {
  symbol: SymbolData | null;
  amount: number | null;
  riskTolerance: "low" | "medium" | "high" | null;
  tradingStyle: string | null;
  investmentGoal: string | null;
  stopLoss: number | null;
  holdingPeriod: string | null;
}

interface PredictionChatbotProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

// ─── Helper ──────────────────────────────────────────────────────────────────
const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const formatCurr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

// ─── Component ───────────────────────────────────────────────────────────────
export function PredictionChatbot({ open, setOpen }: PredictionChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState<ChatStep>("general");
  const [predState, setPredState] = useState<PredState>({
    symbol: null, amount: null, riskTolerance: null,
    tradingStyle: null, investmentGoal: null, stopLoss: null, holdingPeriod: null,
  });
  const [result, setResult] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, typing, scrollToBottom]);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setPredState({ symbol: null, amount: null, riskTolerance: null, tradingStyle: null, investmentGoal: null, stopLoss: null, holdingPeriod: null });
    setResult(null);
    setStep("general");
    setTyping(false);
    setInput("");

    const t = setTimeout(() => {
      addBotMsg(
        "Hi! 👋 I'm your ChartMate AI Assistant. I can help with **stock & crypto predictions**, explain platform features, or answer any trading question.",
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="outline" size="sm"
            className="bg-primary/10 border-primary/20 hover:bg-primary/20 text-xs"
            onClick={() => startPrediction()}>
            <BrainCircuit className="h-3 w-3 mr-1.5" /> Start AI Prediction
          </Button>
          <Button variant="outline" size="sm"
            className="bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 text-xs"
            onClick={() => sendUserMsg("What is ChartMate?")}>
            <Activity className="h-3 w-3 mr-1.5" /> About Platform
          </Button>
        </div>
      );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Message helpers ──────────────────────────────────────────────────────
  const addBotMsg = (text: string, component?: React.ReactNode) => {
    setMessages(prev => [...prev, { id: uid("bot"), role: "bot", text, component }]);
  };

  const addUserMsg = (text: string) => {
    setMessages(prev => [...prev, { id: uid("usr"), role: "user", text }]);
  };

  // ─── Prediction start ─────────────────────────────────────────────────────
  const startPrediction = () => {
    addUserMsg("I want an AI Prediction");
    addBotMsg("Great! I'll guide you through a quick analysis. **Which stock or crypto** would you like to analyze?");
    setStep("symbol");
  };

  // ─── Symbol selected ──────────────────────────────────────────────────────
  const handleSymbolSelect = (sym: SymbolData) => {
    setPredState(prev => ({ ...prev, symbol: sym }));
    addUserMsg(`Selected: ${sym.symbol}${sym.exchange ? ` (${sym.exchange})` : ""}`);
    addBotMsg(`Nice! **How much are you planning to invest in ${sym.symbol}?** (Enter amount in INR/USD)`);
    setStep("amount");
  };

  // ─── Step handlers ────────────────────────────────────────────────────────
  const handleAmount = (text: string) => {
    const amt = parseFloat(text.replace(/[^0-9.]/g, ""));
    if (isNaN(amt) || amt <= 0) {
      addBotMsg("Please enter a valid positive number for the investment amount.");
      return;
    }
    setPredState(prev => ({ ...prev, amount: amt }));
    addUserMsg(formatCurr(amt));
    addBotMsg("What is your **risk tolerance** for this trade?", (
      <div className="flex flex-wrap gap-2 mt-2">
        {(["low", "medium", "high"] as const).map(r => (
          <Button key={r} variant="outline" size="sm"
            className="text-xs" onClick={() => handleRisk(r)}>
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </Button>
        ))}
      </div>
    ));
    setStep("risk_tolerance");
  };

  const handleRisk = (r: "low" | "medium" | "high") => {
    setPredState(prev => ({ ...prev, riskTolerance: r }));
    addUserMsg(r.charAt(0).toUpperCase() + r.slice(1));
    addBotMsg("What is your preferred **trading style**?", (
      <div className="flex flex-wrap gap-2 mt-2">
        {["Scalping", "Day Trading", "Swing Trading", "Position Trading", "Long Term"].map(s => (
          <Button key={s} variant="outline" size="sm"
            className="text-xs" onClick={() => handleStyle(s)}>
            {s}
          </Button>
        ))}
      </div>
    ));
    setStep("trading_style");
  };

  const handleStyle = (s: string) => {
    setPredState(prev => ({ ...prev, tradingStyle: s }));
    addUserMsg(s);
    addBotMsg("What is your main **investment goal**?", (
      <div className="flex flex-wrap gap-2 mt-2">
        {["Wealth Creation", "Passive Income", "Capital Protection", "Speculation"].map(g => (
          <Button key={g} variant="outline" size="sm"
            className="text-xs" onClick={() => handleGoal(g)}>
            {g}
          </Button>
        ))}
      </div>
    ));
    setStep("investment_goal");
  };

  const handleGoal = (g: string) => {
    setPredState(prev => ({ ...prev, investmentGoal: g }));
    addUserMsg(g);
    addBotMsg("What is your preferred **stop-loss level**?", (
      <div className="flex flex-wrap gap-2 mt-2">
        {[["Conservative (2-3%)", 2.5], ["Moderate (5%)", 5], ["Aggressive (10%+)", 10]].map(([label, val]) => (
          <Button key={label as string} variant="outline" size="sm"
            className="text-xs" onClick={() => handleStopLoss(label as string, val as number)}>
            {label as string}
          </Button>
        ))}
      </div>
    ));
    setStep("stop_loss");
  };

  const handleStopLoss = (label: string, val: number) => {
    setPredState(prev => ({ ...prev, stopLoss: val }));
    addUserMsg(label);
    addBotMsg("How long do you plan to **hold this position**?", (
      <div className="flex flex-wrap gap-2 mt-2">
        {["1 Day", "1 Week", "1 Month", "3 Months", "1 Year+"].map(h => (
          <Button key={h} variant="outline" size="sm"
            className="text-xs" onClick={() => handleHold(h)}>
            {h}
          </Button>
        ))}
      </div>
    ));
    setStep("holding_period");
  };

  const handleHold = (h: string) => {
    const finalState = { ...predState, holdingPeriod: h };
    setPredState(finalState);
    addUserMsg(h);
    addBotMsg(`🔍 Running full AI analysis for **${predState.symbol?.symbol}**... This takes about 15–30 seconds.`);
    runPrediction(finalState);
  };

  // ─── CORE prediction call — mirrors PredictPage exactly ──────────────────
  const runPrediction = async (state: PredState) => {
    setStep("analyzing");
    setTyping(true);
    setResult(null);

    // Map chatbot labels → Edge Function enums (same as PredictPage userProfile)
    const styleMap: Record<string, string> = {
      "Scalping": "scalping",
      "Day Trading": "day_trading",
      "Swing Trading": "swing_trading",
      "Position Trading": "position_trading",
      "Long Term": "long_term",
    };
    const goalMap: Record<string, string> = {
      "Wealth Creation": "growth",
      "Passive Income": "income",
      "Capital Protection": "hedging",
      "Speculation": "speculation",
    };

    // ✅ PredictPage strips exchange prefix: symbol.split(':')[1] || symbol
    const rawSymbol = state.symbol?.symbol || "";
    const cleanedSymbol = rawSymbol.includes(":") ? rawSymbol.split(":")[1] : rawSymbol;

    // Timeframe: 1h default (matches PredictPage default)
    const timeframe = "1h";
    const primaryHorizon = 60;

    // Payload mirrors PredictPage's handlePredict() exactly
    const payload = {
      symbol: cleanedSymbol,
      investment: state.amount ?? 1000,
      timeframe,
      horizons: [primaryHorizon, 240, 1440, 10080],
      // user profile — spread like PredictPage does ...userProfile
      riskTolerance: state.riskTolerance ?? "medium",
      tradingStyle: styleMap[state.tradingStyle ?? ""] ?? "swing_trading",
      investmentGoal: goalMap[state.investmentGoal ?? ""] ?? "growth",
      stopLossPercentage: state.stopLoss ?? 5,
      targetProfitPercentage: 15,
      userHoldingPeriod: state.holdingPeriod?.toLowerCase() ?? "1 week",
      marginType: "cash",
      leverage: 1,
    };

    console.log("🚀 Chatbot → predict-movement payload:", payload);

    try {
      const { data, error } = await supabase.functions.invoke("predict-movement", { body: payload });

      if (error) {
        console.error("❌ Edge Function error:", error);
        throw new Error(error.message || "Edge Function returned an error");
      }
      if (!data) throw new Error("No data returned from Edge Function");

      console.log("✅ Chatbot prediction success:", data);
      setResult(data);
      setStep("results");
      addBotMsg("✅ Analysis complete! Here's what the AI found:");
    } catch (err: any) {
      console.error("🧨 Chatbot prediction failed:", err);
      const msg = err.message ?? "Unknown error";
      addBotMsg(`❌ Analysis failed: ${msg}\n\nTry asking me to run the prediction again, or visit the full **/predict** page.`);
      setStep("general");
      toast.error(`Prediction failed: ${msg}`);
    } finally {
      setTyping(false);
    }
  };

  // ─── General Q&A ─────────────────────────────────────────────────────────
  const sendUserMsg = async (text: string) => {
    addUserMsg(text);
    const lower = text.toLowerCase();

    // Keyword routing to prediction
    if (
      lower.includes("predict") || lower.includes("analyze") ||
      lower.includes("analysis") || lower.includes("forecast") ||
      lower.includes("buy") || lower.includes("sell") || lower.includes("signal")
    ) {
      addBotMsg("I can help with that! **Which stock or crypto** should we analyze?");
      setStep("symbol");
      return;
    }

    // Local FAQ match
    const faq = FAQS.find(f => f.keywords.some(k => lower.includes(k)));
    if (faq) {
      addBotMsg(faq.answer);
      return;
    }

    // AI-powered fallback
    setTyping(true);
    try {
      const { data } = await supabase.functions.invoke("chatbot-answer", {
        body: { message: text, history: messages.slice(-6).map(m => ({ role: m.role, text: m.text })) },
      });
      if (data?.answer) {
        addBotMsg(data.answer);
      } else {
        addBotMsg("I can help with platform questions, trading concepts, and AI predictions. Try asking 'How do predictions work?' or tap **Start AI Prediction**.");
      }
    } catch {
      addBotMsg("I can help with platform questions and trading analysis. Ask me anything or tap **Start AI Prediction** to begin!");
    } finally {
      setTyping(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    setInput("");

    if (step === "symbol") return; // handled by SymbolSearch component
    if (step === "amount") { handleAmount(text); return; }

    // ignore text input during multi-choice steps
    if (["risk_tolerance", "trading_style", "investment_goal", "stop_loss", "holding_period", "analyzing"].includes(step)) return;

    await sendUserMsg(text);
  };

  // ─── Result card ─────────────────────────────────────────────────────────
  const renderResult = () => {
    if (!result) return null;
    const signal = result.geminiForecast?.action_signal?.action || result.recommendation?.toUpperCase() || "N/A";
    const confidence = result.geminiForecast?.action_signal?.confidence ?? result.confidence ?? 0;
    const forecast0 = result.geminiForecast?.forecasts?.[0];
    const direction = forecast0?.direction ?? "sideways";
    const riskGrade = result.geminiForecast?.risk_grade || "N/A";
    const roi = result.geminiForecast?.expected_roi;
    const bias = result.geminiForecast?.positioning_guidance?.notes;
    const currentPrice = result.currentPrice;

    // ── ROI fallback: estimate from confidence + volatility when Gemini returns null ──
    const rawExpectedBp = forecast0?.expected_return_bp;
    const volatilityPercent = currentPrice
      ? Math.abs(result.stockData?.highPrice - result.stockData?.lowPrice) / currentPrice * 100
      : 2;
    const safeVol = Math.max(volatilityPercent || 2, 0.5);
    const safeConf = Math.max(confidence || 50, 10);

    const roiBest: number | null = (roi?.best_case != null) ? roi.best_case
      : rawExpectedBp != null ? parseFloat(((rawExpectedBp / 100) * (1 + safeConf / 100 * 0.5)).toFixed(2))
        : parseFloat((safeVol * (safeConf / 100) * 1.5).toFixed(2));

    const roiLikely: number | null = (roi?.likely_case != null) ? roi.likely_case
      : rawExpectedBp != null ? parseFloat((rawExpectedBp / 100).toFixed(2))
        : parseFloat((safeVol * (safeConf / 100) * 0.8).toFixed(2));

    const roiWorst: number | null = (roi?.worst_case != null) ? roi.worst_case
      : parseFloat((-safeVol * (1 - safeConf / 100) * 1.5).toFixed(2));

    const fmt = (v: number | null, prefix = "+") => {
      if (v == null) return "—";
      const sign = v < 0 ? "" : prefix;
      return `${sign}${v.toFixed(2)}%`;
    };

    const signalColor =
      signal === "BUY" ? "text-green-400" :
        signal === "SELL" ? "text-red-400" : "text-yellow-400";

    const DirectionIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
    const directionColor = direction === "up" ? "text-green-400" : direction === "down" ? "text-red-400" : "text-yellow-400";

    return (
      <div className="pl-11 pr-2 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* Header card */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
          {/* Symbol + price */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Asset</p>
              <p className="font-bold text-sm">{result.symbol}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Price</p>
              <p className="font-bold text-sm">{currentPrice ? `₹${currentPrice.toLocaleString("en-IN")}` : "N/A"}</p>
            </div>
          </div>

          {/* Signal + Confidence */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">AI Signal</p>
              <p className={cn("text-2xl font-black tracking-tight", signalColor)}>{signal}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Confidence</p>
              <p className="text-2xl font-black text-primary">{confidence}%</p>
            </div>
          </div>

          {/* Direction + Risk Grade */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Direction</p>
              <div className={cn("flex items-center gap-1 font-semibold text-sm", directionColor)}>
                <DirectionIcon className="h-4 w-4" />
                {direction.charAt(0).toUpperCase() + direction.slice(1)}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Grade</p>
              <p className={cn("font-bold text-sm",
                riskGrade === "LOW" ? "text-green-400" :
                  riskGrade === "MEDIUM" ? "text-yellow-400" :
                    riskGrade === "HIGH" ? "text-orange-400" : "text-red-400"
              )}>{riskGrade}</p>
            </div>
          </div>

          {/* Expected ROI */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase">Best Case</p>
              <p className={cn("text-xs font-semibold", roiBest != null && roiBest >= 0 ? "text-green-400" : "text-red-400")}>
                {fmt(roiBest)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Likely</p>
              <p className={cn("text-xs font-semibold", roiLikely != null && roiLikely >= 0 ? "text-primary" : "text-red-400")}>
                {fmt(roiLikely)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-muted-foreground uppercase">Worst Case</p>
              <p className="text-xs font-semibold text-red-400">{fmt(roiWorst)}</p>
            </div>
          </div>

          {/* AI Rationale snippet */}
          {bias && (
            <p className="text-[10px] text-muted-foreground italic leading-relaxed border-t border-white/5 pt-2">
              "{bias.length > 120 ? bias.substring(0, 120) + "…" : bias}"
            </p>
          )}

          <Button
            className="w-full h-8 text-xs bg-primary hover:bg-primary/90 mt-1 gap-1.5"
            onClick={() => { setOpen(false); navigate("/predict"); }}>
            <ExternalLink className="h-3 w-3" /> View Full Detailed Analysis
          </Button>
        </div>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating Trigger */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {!open && (
          <div className="absolute -top-12 right-0 bg-background/80 backdrop-blur-md border border-primary/20 px-3 py-1.5 rounded-xl shadow-xl shadow-primary/10 animate-bounce">
            <p className="text-[10px] font-medium whitespace-nowrap text-primary">Ask ChartMate AI ✨</p>
            <div className="absolute -bottom-1 right-5 w-2 h-2 bg-background/80 border-r border-b border-primary/20 rotate-45" />
          </div>
        )}

        {/* Outer animated rings — only visible when closed */}
        <div className="relative">
          {!open && (
            <>
              {/* Slow rotating orbit ring */}
              <span className="absolute inset-0 rounded-full border border-primary/30 animate-[spin_4s_linear_infinite]"
                style={{ margin: "-6px" }} />
              {/* Fast pulse ring */}
              <span className="absolute inset-0 rounded-full border border-primary/20 animate-ping"
                style={{ margin: "-4px", animationDuration: "2s" }} />
              {/* Glow halo */}
              <span className="absolute inset-0 rounded-full bg-primary/10 blur-lg animate-pulse"
                style={{ margin: "-8px" }} />
            </>
          )}

          <button
            onClick={() => setOpen(!open)}
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center relative overflow-hidden transition-all duration-500",
              "bg-gradient-to-br from-teal-400 via-primary to-teal-600",
              "shadow-[0_0_24px_rgba(20,184,166,0.5),0_0_48px_rgba(20,184,166,0.2)]",
              "hover:shadow-[0_0_32px_rgba(20,184,166,0.7),0_0_64px_rgba(20,184,166,0.3)]",
              "hover:scale-110 active:scale-95",
              open && "rotate-[135deg] shadow-[0_0_16px_rgba(20,184,166,0.3)]"
            )}
          >
            {/* Inner shimmer sweep */}
            {!open && (
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-[shimmer_2.5s_ease-in-out_infinite]" />
            )}
            {/* Radial depth layer */}
            <span className="absolute inset-0 rounded-full bg-gradient-to-t from-black/20 to-white/10" />

            {open
              ? <X className="h-6 w-6 text-white relative z-10 transition-transform duration-300" />
              : <MessageSquare className="h-6 w-6 text-white relative z-10 drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
            }
          </button>
        </div>
      </div>

      {/* Chat Window */}
      <div className={cn(
        "fixed bottom-24 right-5 z-50 w-[420px] max-w-[calc(100vw-2rem)] bg-background/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col transition-all duration-500 origin-bottom-right",
        open ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-10 pointer-events-none"
      )} style={{ height: "620px", maxHeight: "calc(100vh - 10rem)" }}>

        {/* Header */}
        <div className="p-4 border-b bg-primary/5 flex items-center justify-between rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg shadow-inner">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm tracking-tight">ChartMate Assistant</p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Online & Ready</p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="hover:bg-white/5 rounded-full">
            <ChevronDown className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-5">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                  msg.role === "bot" ? "bg-primary/10 border border-primary/20" : "bg-muted border border-white/5"
                )}>
                  {msg.role === "bot" ? <Bot className="h-4 w-4 text-primary" /> : <User className="h-4 w-4" />}
                </div>
                <div className="flex flex-col gap-2 max-w-[85%]">
                  <div className={cn(
                    "rounded-2xl px-4 py-3 text-sm shadow-md",
                    msg.role === "bot"
                      ? "bg-muted/40 backdrop-blur-sm rounded-tl-sm border border-white/5"
                      : "bg-primary text-primary-foreground rounded-tr-sm shadow-primary/20"
                  )}>
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                  </div>
                  {msg.component && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">{msg.component}</div>
                  )}
                </div>
              </div>
            ))}

            {/* Symbol Search */}
            {step === "symbol" && !predState.symbol && (
              <div className="pl-11 pr-2 animate-in fade-in zoom-in-95 duration-500">
                <div className="bg-muted/30 p-3 rounded-xl border border-white/5 space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Select Target Asset</p>
                  <SymbolSearch
                    value=""
                    onValueChange={() => { }}
                    onSelectSymbol={handleSymbolSelect}
                    placeholder="Search stock or crypto..."
                  />
                </div>
              </div>
            )}

            {/* Analyzing loader */}
            {step === "analyzing" && (
              <div className="pl-11 pr-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex flex-col items-center gap-4 text-center">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    <BrainCircuit className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary">AI is Analyzing…</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Fetching market data, news & running multi-horizon forecast</p>
                  </div>
                  <div className="w-full bg-muted/50 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full animate-[progress_2s_ease-in-out_infinite]" style={{ animation: "progress 2s ease-in-out infinite" }} />
                  </div>
                </div>
              </div>
            )}

            {/* Results */}
            {step === "results" && result && renderResult()}

            {/* Typing indicator */}
            {typing && step !== "analyzing" && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" />
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input bar */}
        <div className="p-4 border-t shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSendMessage(input)}
              placeholder={
                step === "symbol" ? "Search above or type a symbol..." :
                  step === "amount" ? "Enter investment amount..." :
                    step === "analyzing" ? "Analyzing, please wait..." :
                      "Ask anything about trading or ChartMate..."
              }
              disabled={["risk_tolerance", "trading_style", "investment_goal", "stop_loss", "holding_period", "analyzing"].includes(step)}
              className="flex-1 bg-muted/30 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40"
            />
            <Button
              size="icon"
              onClick={() => handleSendMessage(input)}
              disabled={!input.trim() || typing || ["analyzing", "risk_tolerance", "trading_style", "investment_goal", "stop_loss", "holding_period"].includes(step)}>
              {typing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
