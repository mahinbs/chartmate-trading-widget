import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  X, Send, Phone, ChevronDown, Bot, User, MessageSquare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ── Platform knowledge base ────────────────────────────────────────────────────

const WHATSAPP_NUMBER = "919632953355";
const PHONE_NUMBER = "+91 96329 53355";

// Compact chatbot icon: single bubble + dots + sparkle, crisp at small sizes
function ChatbotLogo({ className, size = 24 }: { className?: string; size?: number }) {
  const s = size;
  const uid = `chatbot-logo-${s}`;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-bubble`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="white" stopOpacity="0.98" />
          <stop offset="100%" stopColor="white" stopOpacity="0.88" />
        </linearGradient>
      </defs>
      <path
        d="M4 8a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-8l-4 3v-3H8a4 4 0 0 1-4-4V8z"
        fill={`url(#${uid}-bubble)`}
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="16" r="1.8" fill="hsl(var(--primary))" />
      <circle cx="16" cy="16" r="1.8" fill="hsl(var(--primary))" />
      <circle cx="21" cy="16" r="1.8" fill="hsl(var(--primary))" />
      <path
        d="M26 6l.8 1.5 1.6.2-1.2 1.1.3 1.5-1.5-.7-1.5.7.3-1.5-1.2-1.1 1.6-.2L26 6z"
        fill="white"
        stroke="hsl(var(--primary))"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface FAQ {
  keywords: string[];
  question: string;   // display label for quick-reply chip
  answer: string;
}

const FAQS: FAQ[] = [
  {
    keywords: ["what is", "about", "platform", "chartmate", "this app", "this tool", "what does", "explain platform", "tell me about", "what is chartmate", "overview", "intro"],
    question: "What is this platform?",
    answer: `**ChartMate** is an AI-powered trading intelligence platform that helps you make smarter trading decisions.

Here's what it does:
• 🤖 **AI Predictions** — our AI engine analyses live price, RSI, MACD, news & global macro to predict BUY / SELL / HOLD signals with probability scores.
• 📊 **Strategy Selection** — AI ranks 11 real trading strategies (Trend Following, Swing Trading, Scalping etc.) for current market conditions.
• 🧪 **Backtesting** — Before any order, the platform backtests the chosen strategy on 100+ days of real OHLCV data.
• 🧾 **Paper Trading** — Simulate trades risk-free with virtual money to test strategies without real capital.
• 📅 **Daily Analysis** — Admins publish expert market predictions visible to all users.
• 📈 **Trade Tracking** — Monitor open positions with live P&L, stop-loss and target tracking.`,
  },
  {
    keywords: ["ai", "prediction", "predict", "how does ai", "gemini", "signal", "buy sell hold", "forecast"],
    question: "How does AI prediction work?",
    answer: `The AI prediction pipeline runs in **7 steps** every time you analyse a stock or crypto:

1. **Fetch Market Data** — Live price, volume, change from real-time feeds.
2. **Historical Analysis** — Full-year OHLCV candles, fundamentals & earnings data.
3. **Technical Indicators** — RSI, MACD, Bollinger Bands, SMA, ATR, regime detection.
4. **News & Sentiment** — Market news, macro events, sector correlation.
5. **AI Processing** — the underlying model generates multi-horizon forecasts (15m to 1W) with positioning guidance.
6. **Risk Assessment** — Risk grade (A–D), stop-loss, take-profit targets.
7. **Full Report** — Expected ROI scenarios (Best / Likely / Worst), key support/resistance levels, and insights.

The result is a **BUY / SELL / HOLD signal** with a confidence probability score (0–100%).`,
  },
  {
    keywords: ["strategy", "strategies", "trend following", "swing trading", "scalping", "momentum", "how to choose", "which strategy"],
    question: "What strategies are available?",
    answer: `The platform supports **11 professional trading strategies** used by real traders:

| Strategy | Best For |
|---|---|
| 🔥 **Trend Following** | Bull/bear trending markets |
| 💥 **Breakout & Breakdown** | Key support/resistance levels |
| 🔄 **Mean Reversion** | Oversold/overbought extremes |
| ⚡ **Momentum** | Short-term momentum bursts |
| ⚡ **Scalping** | Intraday, tight spreads |
| 📈 **Swing Trading** | 2–10 day swings |
| 📊 **Range Trading** | Sideways/ranging markets |
| 📰 **News / Event Based** | Earnings, macro events |
| 📋 **Options Buying** | Leveraged directional bets |
| 💰 **Options Selling** | Premium collection, range markets |
| 🔗 **Pairs Trading** | Market-neutral correlation plays |

**AI ranks all strategies** for the current market regime and picks the best one automatically.`,
  },
  {
    keywords: ["backtest", "backtesting", "historical", "validate", "conditions met", "strategy achieved"],
    question: "What is Backtesting?",
    answer: `**Backtesting** validates whether a strategy's conditions are *currently met* in the market using real historical data.

**How it works:**
• The platform runs 100+ days of real OHLCV (Open/High/Low/Close/Volume) data through the strategy rules.
• It simulates entries and exits based on technical signals (RSI thresholds, SMA crossovers, breakout levels etc.)
• It checks whether those same conditions exist in the **current market** right now.

**You see:**
• ✅ "Strategy Conditions Met" or ❌ "Conditions NOT Met"
• Win rate, avg return per trade, max drawdown, profit factor
• Current RSI, SMA20, price vs key levels

**Important:** If conditions are NOT met, the platform **blocks the real order** to protect your capital. You can still Paper Trade.`,
  },
  {
    keywords: ["paper trade", "paper trading", "simulate", "virtual", "no money", "risk free", "test strategy"],
    question: "What is Paper Trading?",
    answer: `**Paper Trading** is a risk-free simulation mode where you trade with **virtual money** — no real capital at stake.

**How it works:**
• Click "🧪 Paper Trade" on the prediction page.
• All AI gates and backtest conditions are **bypassed** — you can pick any strategy freely.
• The trade is tracked just like a real trade so you can monitor P&L, strategy performance and outcomes.
• Paper trades are marked with a 🧪 badge in your Active Trades list.

**Why use it?**
• Test strategies in live market conditions without risking money.
• Learn how different strategies perform on different assets.
• Build confidence before committing real capital.
• Great for beginners learning how the platform works.`,
  },
  {
    keywords: ["daily analysis", "market picks", "daily board", "admin prediction", "daily shares"],
    question: "What is Daily Analysis?",
    answer: `**Daily Analysis** (also called Market Picks) is a page where **expert AI-driven predictions are published daily** and visible to all users.

**How it works:**
• The admin runs the full AI analysis pipeline (same depth as regular users).
• Results are reviewed and published to the Daily Board.
• All users can see the predictions at **/market-picks**.

**What each card shows:**
• 📌 Symbol & current price with % change
• 🎯 Action signal: BUY / SELL / HOLD
• 📊 Probability of prediction being achieved (%)
• 📉 Expected ROI: Best case / Likely / Worst case
• 🧠 AI rationale and reasoning
• 🌍 Current market conditions (regime, sentiment, volatility)
• 🔑 Key drivers and risk flags
• ⏱ Expiry time (auto-refreshes when expired)`,
  },
  {
    keywords: ["active trades", "track", "tracking", "open position", "pnl", "profit loss", "monitor"],
    question: "How do I track active trades?",
    answer: `The **Active Trades** section lets you monitor all your open positions in real time.

**What you see per trade:**
• Symbol, entry price, current price, and live P&L
• Stop-loss and take-profit levels
• Strategy being used
• Time elapsed since entry
• 🧪 Paper Trade badge (if simulated)

**Trade outcomes are automatically tracked:**
• ✅ Target Hit — price reached your take-profit
• 🛑 Stopped Out — price hit your stop-loss
• ❌ Cancelled — manually closed

**Accessing it:**
Go to **/active-trades** from the Home page, or the navigation menu.`,
  },
  {
    keywords: ["probability", "confidence", "score", "percentage", "accuracy", "how accurate"],
    question: "What is the probability score?",
    answer: `The **Probability Score** (0–100%) tells you how likely the AI's prediction is to be correct given current market conditions.

**How to interpret it:**
• 🟢 **70–100%** — High confidence. Strong signal with multiple confirming indicators.
• 🟡 **50–69%** — Moderate confidence. Some indicators align, but market is mixed.
• 🔴 **0–49%** — Low confidence. Conflicting signals; consider Paper Trading first.

**What it's based on:**
• Technical indicator alignment (RSI, MACD, trend strength)
• News sentiment score
• Global macro alignment
• Historical backtest win rate for this strategy
• The AI model's multi-horizon forecast consensus

A higher score doesn't guarantee profit — always manage risk with stop-losses.`,
  },
  {
    keywords: ["roi", "return", "best case", "worst case", "likely", "capital scenario", "investment planning"],
    question: "What are Capital Scenarios?",
    answer: `**Capital Scenarios** show how the AI's predicted move translates to real dollar returns across different investment sizes.

**Three scenarios shown:**
• 💚 **Best Case** — If the asset moves in the most favourable direction with full confidence.
• 💙 **Likely Case** — The central expected return based on AI's confidence and volatility.
• 🔴 **Worst Case** — The downside if the prediction is wrong.
• ⛔ **Max Loss** — Your maximum loss at the configured stop-loss % (e.g. 5%).

**Investment tiers shown:**
• Small Investor: $10,000
• Medium Investor: $100,000
• Large Investor: $1,000,000

**Fractional shares** are supported — you can invest any amount, even less than 1 full share (like 0.001 BTC).`,
  },
  {
    keywords: ["buy sell hold", "signal", "action", "what does hold mean", "what does buy mean", "what does sell mean"],
    question: "What do BUY / SELL / HOLD mean?",
    answer: `The AI issues one of three **action signals** based on its analysis:

**🟢 BUY**
AI sees bullish momentum, positive indicators and upside potential. Consider entering a long position.

**🔴 SELL**
AI sees bearish pressure, downside risk or overvaluation. Consider short or exit position.

**🟡 HOLD**
Market conditions are unclear, mixed, or sideways. AI doesn't have strong conviction in either direction. Best to wait or use Paper Trade to test.

**Important:** Even with a BUY/SELL signal, **strategy conditions must be met** (confirmed by backtest) before the platform allows a real order. If conditions aren't met, only Paper Trade is available.`,
  },
  {
    keywords: ["predictions page", "chart", "graph", "tradingview", "live chart", "stock chart"],
    question: "How does the chart work?",
    answer: `The **Predictions Page** has a live **TradingView chart** that automatically syncs to the stock or crypto you're analysing.

**How it works:**
• When you type or search for a symbol (e.g. BTC-USD, AAPL, RELIANCE), the chart **automatically updates** to show that symbol.
• Supports stocks (NSE, NYSE, NASDAQ), crypto, forex, and commodities.
• Full TradingView functionality: zoom, indicators, drawing tools, timeframes.

**Symbol formats:**
• Indian stocks: RELIANCE, HDFCBANK, etc.
• US stocks: AAPL, TSLA, NVDA
• Crypto: BTC-USD, ETH-USD
• Forex: EURUSD, USDINR`,
  },
  {
    keywords: ["admin", "admin panel", "daily board", "publish", "manage", "re-predict", "delete"],
    question: "How does the Admin panel work?",
    answer: `The **Admin Panel** (/admin) is available to admins only and has two tabs:

**👥 List of Users**
View all registered users on the platform.

**📅 Daily Shares (Predictions Board)**
Admins run the full AI analysis pipeline (same as regular users) and publish it to the Daily Board.

**Workflow:**
1. Search for a symbol (e.g. BTC, NIFTY, AAPL)
2. Set investment amount & timeframe
3. Click "Run AI Analysis" → full in-depth AI analysis runs
4. Review the complete analysis (same as what users see)
5. Click "Publish to Daily Board" → visible to all users on Market Picks page

**Board management:**
• 🔄 **Re-predict** — Re-run AI analysis for an existing row
• 🗑️ **Delete** — Remove a prediction from the board
• Expired predictions **auto-refresh** when admin is on the page`,
  },
  {
    keywords: ["how to start", "get started", "new user", "sign up", "login", "begin", "first time"],
    question: "How do I get started?",
    answer: `Getting started with ChartMate is simple! Here's the flow:

**Step 1:** Sign up or log in at **/auth**

**Step 2:** Go to the **Home page** — your dashboard overview

**Step 3:** Click **"Predict & Trade"** or go to **/predict**
• Search for any stock or crypto (e.g. RELIANCE, BTC-USD, AAPL)
• Set your investment amount and timeframe
• Click **"Run AI Analysis"**

**Step 4:** Review the full AI analysis:
• Action signal (BUY/SELL/HOLD)
• Capital scenarios, key levels, AI rationale

**Step 5:** Pick a strategy:
• AI recommends the best strategy for current conditions
• Backtest validates if conditions are met
• Place a **Paper Trade** first to test risk-free

**Step 6:** Monitor your trades in **Active Trades** (/active-trades)

💡 Tip: Start with Paper Trades to learn the platform before using real money!`,
  },
  {
    keywords: ["real", "actual", "live", "genuine", "real data", "real time", "is it real", "accurate", "reliable", "trust", "legit"],
    question: "Is the platform real?",
    answer: `Yes — **ChartMate is as real as it gets**. Here’s what’s actually running under the hood:

• **Live market data** — Real-time price, volume, and change from connected data feeds (e.g. Alpha Vantage, Yahoo Finance).
• **Real AI** — a production-grade large language model runs the full analysis (technical indicators, news, macro, multi-horizon forecasts). No fake or placeholder logic.
• **Real backtesting** — 100+ days of real OHLCV history are run through strategy rules; you see actual win rate, drawdown, profit factor.
• **Real strategies** — The 11 strategies (Trend Following, Swing, Scalping, etc.) are the same concepts used by professional traders.
• **Real tracking** — Trades you place (or paper-trade) are stored and tracked with live P&L.

So yes: the platform is real, in detail, and built for real trading decisions. For anything else, you can always reach out to us.`,
  },
  {
    keywords: ["contact", "support", "help", "whatsapp", "call", "phone", "reach", "talk to someone", "human", "speak to", "number", "customer", "agent", "more help", "still need"],
    question: "Contact Support",
    answer: `If you have more questions or need help in person, our team is here for you.

📞 **Call or WhatsApp:** ${PHONE_NUMBER}

Reach out for:
• Platform setup & onboarding
• Technical issues or bugs
• Questions about strategies & AI signals
• Billing or account queries

We’ll get back to you and answer everything properly.`,
  },
];

const QUICK_REPLIES = [
  { label: "What is ChartMate?", keywords: ["what is this platform"] },
  { label: "Is it real?", keywords: ["is it real"] },
  { label: "🤖 How AI works", keywords: ["ai", "prediction"] },
  { label: "📊 Strategies", keywords: ["strategy"] },
  { label: "🧪 Paper Trade", keywords: ["paper trade"] },
  { label: "📈 Backtesting", keywords: ["backtest"] },
  { label: "📅 Daily Analysis", keywords: ["daily analysis"] },
  { label: "🚀 Get Started", keywords: ["how to start"] },
  { label: "📞 Contact", keywords: ["contact"] },
];

// Human-like opening phrases so the bot feels natural
const HUMAN_INTROS = [
  "Great question! ",
  "Sure thing — here's the full picture: ",
  "Good one! ",
  "Here’s how it works: ",
  "Happy to explain: ",
  "In short: ",
  "Here’s the deal: ",
  "Let me break that down for you: ",
];
function pickIntro(): string {
  return HUMAN_INTROS[Math.floor(Math.random() * HUMAN_INTROS.length)];
}

// ── Message types ──────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "bot" | "user";
  text: string;
  isContact?: boolean;
}

function matchFAQ(input: string): FAQ | null {
  const lower = input.toLowerCase().trim();
  if (!lower) return null;
  let best: FAQ | null = null;
  let bestScore = 0;
  for (const faq of FAQS) {
    let score = 0;
    for (const kw of faq.keywords) {
      if (lower.includes(kw)) score += kw.split(" ").length + 1;
    }
    // Single-word or very short query: require at least one match
    if (score > bestScore) { bestScore = score; best = faq; }
  }
  return bestScore > 0 ? best : null;
}

// Clean AI answer: remove double dashes and extra asterisks so it looks like real prose
function cleanAnswerText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    // Convert leading \"* \" bullets into \"• \" first
    .replace(/^\s*\*\s+/gm, "• ")
    .replace(/\n\s*\*\s+/g, "\n• ")
    // Inline bullets after a sentence: \". • \" -> line break + bullet
    .replace(/([.!?])\s*•\s+/g, "$1\n• ")
    .replace(/\s*--\s*/g, " ")
    .replace(/•\s*\*\s*/g, "• ")
    // Remove single-asterisk emphasis like *text*
    .replace(/\*([^*\n]+)\*/g, "$1")
    // Strip any remaining stray asterisks
    .replace(/\*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Simple markdown-to-JSX renderer (bold, bullets, line breaks)
function MarkdownText({ text }: { text: string }) {
  const cleaned = cleanAnswerText(text);
  const lines = cleaned.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        // Bold: **text** only (no lone asterisk)
        const parts = trimmed.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**")
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : p
        );
        // Bullet: line starts with • or * (render one •, no extra asterisk)
        if (trimmed.startsWith("•") || trimmed.startsWith("*")) {
          const rest = trimmed.replace(/^[•*]\s*/, "");
          const bulletParts = rest.split(/(\*\*[^*]+\*\*)/g).map((p, k) =>
            p.startsWith("**") && p.endsWith("**") ? <strong key={k}>{p.slice(2, -2)}</strong> : p
          );
          return (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 mt-0.5">•</span>
              <span>{bulletParts}</span>
            </div>
          );
        }
        // Table row
        if (trimmed.startsWith("|")) {
          const cells = line.split("|").filter(c => c.trim() && c.trim() !== "---");
          if (!cells.length) return null;
          return (
            <div key={i} className="flex gap-2 text-xs">
              {cells.map((c, j) => <span key={j} className={j === 0 ? "font-medium w-40 shrink-0" : "text-muted-foreground"}>{c.trim()}</span>)}
            </div>
          );
        }
        return <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

// Show chatbot only on landing pages and admin pages
const CHATBOT_PATHS = [
  "/",
  "/rsb-fintech-founder",
  "/dsn-fintech-founder",
  "/contact-us",
];
function useShowChatbot(): boolean {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin")) return true;
  return CHATBOT_PATHS.includes(pathname);
}

export function PlatformChatbot() {
  const showChatbot = useShowChatbot();
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [typing, setTyping]       = useState(false);
  const [hasNotif, setHasNotif]   = useState(true);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  const WELCOME: Message = {
    id: "welcome",
    role: "bot",
    text: `Hi there! 👋 I'm **Tradingsmart Bot** — your support assistant. I can help with anything about the platform: AI predictions, strategies, paper trading, daily analysis, backtesting, and more. Ask me in your own words and I'll answer properly!`,
  };

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([WELCOME]);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setHasNotif(false);
    const userMsg: Message = { id: Date.now().toString(), role: "user", text: text.trim() };
    const historyPayload = [...messages, userMsg].slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    const addBotReply = (answer: string, isContact: boolean) => {
      setTyping(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "bot" as const,
        text: answer,
        isContact,
      }]);
    };

    const minDelay = new Promise<void>(r => setTimeout(r, 400));

    try {
      const [_, result] = await Promise.all([
        minDelay,
        supabase.functions.invoke("chatbot-answer", { body: { message: text.trim(), history: historyPayload } }),
      ]);
      const { data, error } = result;
      if (!error && data?.answer) {
        addBotReply(data.answer, !!data.suggestContact);
        return;
      }
    } catch (_) {
      // fall through to local fallback
    }

    // Fallback: local FAQ (offline or edge function failed)
    await new Promise(r => setTimeout(r, 300));
    const faq = matchFAQ(text);
    const isContactTopic = faq?.keywords.includes("contact");
    if (faq) {
      const intro = isContactTopic ? "" : pickIntro();
      addBotReply(intro + faq.answer, isContactTopic);
    } else {
      addBotReply(
        `I only answer questions about the ChartMate platform. For anything else, please reach out — we’ll help you properly.\n\n📞 **Call or WhatsApp:** ${PHONE_NUMBER}`,
        true
      );
    }
  }, []);

  if (!showChatbot) return null;

  return (
    <>
      {/* ── Floating trigger: bottom-right ─────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-1.5">
        {!open && hasNotif && (
          <div className="animate-bounce bg-background/95 border border-border shadow-md rounded-xl px-2.5 py-1.5 text-xs font-medium max-w-[180px] text-center backdrop-blur-sm">
            Ask me anything about the platform
          </div>
        )}
        <button
          onClick={() => { setOpen(v => !v); setHasNotif(false); }}
          className={cn(
            "relative h-11 w-11 rounded-xl shadow-lg flex items-center justify-center transition-all duration-300 overflow-hidden",
            "bg-gradient-to-br from-primary via-primary to-primary/80 hover:scale-105 hover:shadow-xl text-primary-foreground",
            open && "rotate-90"
          )}
          aria-label="Open platform chatbot"
        >
          {open ? (
            <X className="h-5 w-5 shrink-0" />
          ) : (
            <ChatbotLogo size={22} className="shrink-0 drop-shadow-sm" />
          )}
          {hasNotif && !open && (
            <span className="absolute top-0.5 right-0.5 h-2 w-2 bg-amber-400 rounded-full border border-background animate-pulse" />
          )}
        </button>
      </div>

      {/* ── Chat window: bottom-right, above the button ────────────────────── */}
      <div className={cn(
        "fixed bottom-20 right-5 z-50 w-[380px] max-w-[calc(100vw-24px)] flex flex-col rounded-2xl shadow-2xl border bg-background transition-all duration-300 origin-bottom-right",
        open ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
      )} style={{ maxHeight: "calc(100vh - 130px)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-2xl shrink-0">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            <ChatbotLogo size={22} className="[--primary:hsl(var(--primary))]" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Tradingsmart Bot</p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-xs text-muted-foreground">Your trading support assistant</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
          {messages.map(msg => (
            <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              {/* Avatar */}
              <div className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                msg.role === "bot" ? "bg-primary/15" : "bg-secondary"
              )}>
                {msg.role === "bot"
                  ? <Bot className="h-4 w-4 text-primary" />
                  : <User className="h-4 w-4 text-muted-foreground" />
                }
              </div>

              {/* Bubble */}
              <div className={cn(
                "max-w-[82%] rounded-2xl px-3 py-2.5 shadow-sm",
                msg.role === "bot"
                  ? "bg-muted/60 rounded-tl-sm text-foreground"
                  : "bg-primary text-primary-foreground rounded-tr-sm"
              )}>
                {msg.role === "bot"
                  ? <MarkdownText text={msg.text} />
                  : <p className="text-sm">{msg.text}</p>
                }

                {/* Contact CTA in bot message */}
                {msg.isContact && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <a
                      href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hi%2C%20I%20need%20help%20with%20ChartMate`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-3 transition-colors"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Chat on WhatsApp
                    </a>
                    <a
                      href={`tel:${PHONE_NUMBER.replace(/\s/g, "")}`}
                      className="flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted text-xs font-medium py-2 px-3 transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Call {PHONE_NUMBER}
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {typing && (
            <div className="flex gap-2 items-end">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted/60 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                <div className="flex gap-1 items-center h-5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        {messages.length <= 2 && !typing && (
          <div className="px-3 pb-2 shrink-0">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Quick topics:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map((qr) => (
                <button
                  key={qr.label}
                  onClick={() => sendMessage(qr.keywords[0])}
                  className="text-xs rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/15 text-primary font-medium px-2.5 py-1 transition-colors"
                >
                  {qr.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 shrink-0 border-t pt-2.5">
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about the platform…"
              className="flex-1 text-sm bg-muted/50 border border-border rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-muted-foreground"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || typing}
              className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-all hover:scale-105 disabled:hover:scale-100 shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-1.5">
            Platform questions only • For urgent help: {PHONE_NUMBER}
          </p>
        </div>
      </div>
    </>
  );
}
