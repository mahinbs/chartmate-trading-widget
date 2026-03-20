/**
 * chatbot-answer — Market Intelligence Chatbot
 * Real-time prices via EODHD · News & sentiment via MarketAux · Analysis via Gemini
 * Also handles platform (TradingSmart) support questions.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// ── API Keys ─────────────────────────────────────────────────────────────────
const EODHD_KEY        = Deno.env.get("EODHD_API")              ?? "69bbe13da57f58.53248031";
const MARKETAUX_KEY    = Deno.env.get("MARKET_AUX_API")          ?? "TDwhJV5DIa1kdWadU0mPHBEVaE2yWJeeZpAWYl1b";
const GEMINI_KEY       = Deno.env.get("GEMINI_API_KEY")          ?? "";
const ALPHA_VANTAGE    = Deno.env.get("ALPHA_VANTAGE_API_KEY")   ?? "";
const FINNHUB_KEY      = Deno.env.get("FINNHUB_API_KEY")         ?? "";
const TWELVE_DATA_KEY  = Deno.env.get("TWELVE_DATA_API_KEY")     ?? "";
const GEMINI_MODEL     = "gemini-3.1-pro-preview";
const PHONE            = "+91 96329 53355";

// ── Symbol mapping: natural language → EODHD symbol ─────────────────────────
const SYMBOL_MAP: Record<string, string> = {
  // US Stocks
  "apple": "AAPL.US",           "aapl": "AAPL.US",
  "tesla": "TSLA.US",           "tsla": "TSLA.US",
  "nvidia": "NVDA.US",          "nvda": "NVDA.US",
  "google": "GOOGL.US",         "googl": "GOOGL.US",  "alphabet": "GOOGL.US",
  "microsoft": "MSFT.US",       "msft": "MSFT.US",
  "amazon": "AMZN.US",          "amzn": "AMZN.US",
  "meta": "META.US",            "facebook": "META.US",  "fb": "META.US",
  "netflix": "NFLX.US",         "nflx": "NFLX.US",
  "amd": "AMD.US",              "intel": "INTC.US",     "intc": "INTC.US",
  "palantir": "PLTR.US",        "pltr": "PLTR.US",
  "berkshire": "BRK-B.US",
  // Crypto
  "bitcoin": "BTC-USD.CC",      "btc": "BTC-USD.CC",
  "ethereum": "ETH-USD.CC",     "eth": "ETH-USD.CC",
  "solana": "SOL-USD.CC",       "sol": "SOL-USD.CC",
  "ripple": "XRP-USD.CC",       "xrp": "XRP-USD.CC",
  "dogecoin": "DOGE-USD.CC",    "doge": "DOGE-USD.CC",
  "bnb": "BNB-USD.CC",          "binance coin": "BNB-USD.CC",
  "cardano": "ADA-USD.CC",      "ada": "ADA-USD.CC",
  "polkadot": "DOT-USD.CC",     "dot": "DOT-USD.CC",
  "chainlink": "LINK-USD.CC",   "link": "LINK-USD.CC",
  // Indian Stocks
  "reliance": "RELIANCE.BSE",   "ril": "RELIANCE.BSE",
  "tcs": "TCS.BSE",             "tata consultancy": "TCS.BSE",
  "infosys": "INFY.BSE",        "infy": "INFY.BSE",
  "hdfc bank": "HDFCBANK.BSE",  "hdfcbank": "HDFCBANK.BSE",  "hdfc": "HDFCBANK.BSE",
  "icici bank": "ICICIBANK.BSE","icicibank": "ICICIBANK.BSE", "icici": "ICICIBANK.BSE",
  "sbi": "SBIN.BSE",            "state bank": "SBIN.BSE",
  "wipro": "WIPRO.BSE",
  "bajaj finance": "BAJFINANCE.BSE", "bajaj": "BAJFINANCE.BSE",
  "tata motors": "TATAMOTORS.BSE",   "tatamotors": "TATAMOTORS.BSE",
  "zomato": "ZOMATO.BSE",
  "paytm": "PAYTM.BSE",
  "nykaa": "NYKAA.BSE",
  "itc": "ITC.BSE",
  "maruti": "MARUTI.BSE",
  "adani": "ADANIENT.BSE",
  // Commodities
  "crude oil": "CL.US",         "oil": "CL.US",         "wti": "CL.US",   "wti crude": "CL.US",
  "brent": "BZ.US",             "brent crude": "BZ.US",
  "gold": "GC.US",              "natural gas": "NG.US",  "natgas": "NG.US",
  "silver": "SI.US",            "copper": "HG.US",
  // Forex
  "eurusd": "EURUSD.FOREX",     "euro": "EURUSD.FOREX",
  "usdinr": "USDINR.FOREX",     "dollar rupee": "USDINR.FOREX",
  "gbpusd": "GBPUSD.FOREX",     "pound": "GBPUSD.FOREX",
  // Indices
  "nifty": "NSEI.INDX",         "nifty 50": "NSEI.INDX",  "nifty50": "NSEI.INDX",
  "sensex": "BSESN.INDX",
  "s&p 500": "GSPC.INDX",       "sp500": "GSPC.INDX",    "s&p": "GSPC.INDX",
  "dow jones": "DJI.INDX",      "dow": "DJI.INDX",
  "nasdaq": "IXIC.INDX",
};

// ── Intent detection ──────────────────────────────────────────────────────────
type Intent = "price" | "sentiment" | "analysis" | "impact" | "platform" | "general";

function isSmallTalk(msg: string): boolean {
  const lower = msg.toLowerCase().trim();
  return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|how are you|who are you|what are you|what can you do|help)$/.test(lower);
}

function isJailbreakAttempt(msg: string): boolean {
  const lower = msg.toLowerCase();
  return /\b(ignore (all|previous|prior) instructions|system prompt|developer prompt|jailbreak|roleplay as|pretend to be|bypass|disable safety|reveal prompt)\b/.test(lower);
}

function isFinanceOrPlatformQuery(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (isSmallTalk(lower)) return true;
  if (Object.keys(SYMBOL_MAP).some((k) => lower.includes(k))) return true;
  if (/\b([A-Z]{1,5}(?:-USD)?)\b/.test(msg)) return true;
  return /\b(stock|share|market|price|trading|trade|invest|investment|buy|sell|hold|sentiment|news|economy|inflation|fed|rbi|crypto|bitcoin|ethereum|nifty|sensex|forex|commodity|gold|oil|portfolio|risk|analysis|chartmate|platform|backtest|paper trade|strategy)\b/.test(lower);
}

function detectIntent(msg: string): Intent {
  const lower = msg.toLowerCase();
  if (/\b(price|trading at|current price|what.?s.*worth|how much is|quote|rate|worth now|value)\b/.test(lower))
    return "price";
  if (/\b(sentiment|news about|latest news|what.?s happening with|headlines|updates on|trending|buzz|is there news)\b/.test(lower))
    return "sentiment";
  if (/\b(should i buy|should i sell|buy or sell|good time to buy|right time|is it a good time|analysis|recommend|what do you think about|worth buying|worth investing|hold or|invest in)\b/.test(lower))
    return "analysis";
  if (/\b(impact|affect|effect|how is.*(market|stock)|market.*doing|why is market|oil.*market|crude.*market|gold.*market|rate hike|fed|rbi|inflation|recession)\b/.test(lower))
    return "impact";
  if (/\b(chartmate|platform|backtest|paper trade|strategy|prediction|signal|active trade|market picks|daily analysis)\b/.test(lower))
    return "platform";
  return "general";
}

// ── Symbol extraction ─────────────────────────────────────────────────────────
function extractSymbol(msg: string): string | null {
  const lower = msg.toLowerCase();
  // Longest-match name lookup first
  const entries = Object.entries(SYMBOL_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [name, sym] of entries) {
    if (lower.includes(name)) return sym;
  }
  // Explicit ticker patterns: 1–5 uppercase letters, optionally with -USD
  const m = msg.match(/\b([A-Z]{1,5}(?:-USD)?)\b/);
  if (m) {
    const t = m[1];
    // Skip common English words
    if (!/^(I|A|AN|THE|IS|IT|IN|TO|DO|BE|ON|AT|BY|OR|AND|NOT|YES|NO|SO|IF|OK)$/.test(t)) {
      // Guess exchange
      if (["BTC","ETH","SOL","XRP","DOGE","BNB","ADA"].includes(t)) return `${t}-USD.CC`;
      return `${t}.US`;
    }
  }
  return null;
}

function inferSymbolFromHistory(history: Array<{ role?: string; text?: string }>): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const text = String(history[i]?.text ?? "");
    if (!text) continue;
    const sym = extractSymbol(text);
    if (sym) return sym;
  }
  return null;
}

// ── EODHD real-time price ─────────────────────────────────────────────────────
async function fetchEODHDPrice(symbol: string): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}?api_token=${EODHD_KEY}&fmt=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code && data?.close != null) return data;
    return null;
  } catch { return null; }
}

// ── EODHD historical (last 30 days for trend context) ────────────────────────
async function fetchEODHDHistory(symbol: string): Promise<unknown[]> {
  try {
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}?api_token=${EODHD_KEY}&period=d&fmt=json&order=d&limit=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.slice(0, 20) : [];
  } catch { return []; }
}

// ── MarketAux news + sentiment ────────────────────────────────────────────────
function cleanForMarketAux(sym: string): string {
  return sym.replace(/\.(US|BSE|NSE|CC|FOREX|INDX|COMM)$/i, "")
            .replace(/-USD$/, "")
            .replace(/-/g, "");
}

async function fetchMarketAuxNews(symbol: string): Promise<Record<string, unknown>[]> {
  try {
    const clean = cleanForMarketAux(symbol);
    const url = `https://api.marketaux.com/v1/news/all?symbols=${encodeURIComponent(clean)}&api_token=${MARKETAUX_KEY}&limit=6&language=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.data) ? data.data : [];
  } catch { return []; }
}

async function fetchGeneralMarketNews(): Promise<Record<string, unknown>[]> {
  try {
    const url = `https://api.marketaux.com/v1/news/all?api_token=${MARKETAUX_KEY}&limit=6&language=en&filter_entities=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.data) ? data.data : [];
  } catch { return []; }
}

// ── Alpha Vantage global quote (fallback) ─────────────────────────────────────
async function fetchAlphaVantageQuote(symbol: string): Promise<Record<string, unknown> | null> {
  if (!ALPHA_VANTAGE) return null;
  try {
    const clean = symbol.replace(/\.(US|BSE|NSE)$/i, "");
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${clean}&apikey=${ALPHA_VANTAGE}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const q = data?.["Global Quote"];
    if (q?.["05. price"]) return { price: q["05. price"], change: q["09. change"], changePct: q["10. change percent"] };
    return null;
  } catch { return null; }
}

// ── FinnHub quote (fallback) ──────────────────────────────────────────────────
async function fetchFinnHubQuote(symbol: string): Promise<Record<string, unknown> | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const clean = symbol.replace(/\.(US|BSE|NSE)$/i, "");
    const url = `https://finnhub.io/api/v1/quote?symbol=${clean}&token=${FINNHUB_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.c) return { price: data.c, change: data.d, changePct: data.dp, high: data.h, low: data.l, open: data.o, prevClose: data.pc };
    return null;
  } catch { return null; }
}

// ── Twelve Data quote (fallback) ──────────────────────────────────────────────
async function fetchTwelveDataQuote(symbol: string): Promise<Record<string, unknown> | null> {
  if (!TWELVE_DATA_KEY) return null;
  try {
    const clean = symbol.replace(/\.(US|BSE|NSE|CC|FOREX|INDX)$/i, "").replace(/-USD$/, "/USD");
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(clean)}&apikey=${TWELVE_DATA_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.price) return { price: data.price };
    return null;
  } catch { return null; }
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmt(n: unknown): string {
  const v = Number(n);
  if (isNaN(v)) return String(n ?? "N/A");
  return v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toFixed(2);
}

function sentimentLabel(score: unknown): string {
  const s = Number(score);
  if (isNaN(s)) return "NEUTRAL";
  if (s >= 0.25) return "POSITIVE 📈";
  if (s <= -0.25) return "NEGATIVE 📉";
  return "NEUTRAL ↔";
}

function sanitizeAnswerText(raw: string): string {
  return String(raw ?? "")
    .replace(/\r/g, "")
    .replace(/[—–]/g, " ")
    .replace(/\s*--\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const RISK_LINE = "⚠️ This is market analysis based on news and sentiment, not financial advice. Always manage your risk.";

function enforceRiskLine(answer: string, intent: Intent, msg: string): string {
  const isRecommendation = intent === "analysis" || /\b(should i buy|should i sell|buy or sell|recommend|hold)\b/i.test(msg);
  if (!isRecommendation) return answer;
  const withoutOldRisk = answer
    .replace(/\n?\s*⚠️[^.\n]*financial advice[^.\n]*(\.)?/gi, "")
    .trim();
  return `${withoutOldRisk}\n\n${RISK_LINE}`;
}

function toYahooSymbol(symbol: string): string | null {
  const map: Record<string, string> = {
    "CL.US": "CL=F",
    "BZ.US": "BZ=F",
    "GC.US": "GC=F",
    "SI.US": "SI=F",
    "HG.US": "HG=F",
    "NG.US": "NG=F",
    "BTC-USD.CC": "BTC-USD",
    "ETH-USD.CC": "ETH-USD",
    "SOL-USD.CC": "SOL-USD",
    "XRP-USD.CC": "XRP-USD",
    "DOGE-USD.CC": "DOGE-USD",
    "BNB-USD.CC": "BNB-USD",
    "ADA-USD.CC": "ADA-USD",
    "EURUSD.FOREX": "EURUSD=X",
    "GBPUSD.FOREX": "GBPUSD=X",
    "USDINR.FOREX": "USDINR=X",
    "NSEI.INDX": "^NSEI",
    "BSESN.INDX": "^BSESN",
    "GSPC.INDX": "^GSPC",
    "DJI.INDX": "^DJI",
    "IXIC.INDX": "^IXIC",
  };
  if (map[symbol]) return map[symbol];
  if (symbol.endsWith(".US")) return symbol.replace(".US", "");
  return null;
}

function isCommoditySymbol(symbol: string): boolean {
  return ["CL.US", "BZ.US", "GC.US", "SI.US", "HG.US", "NG.US"].includes(symbol);
}

async function fetchYahooQuote(symbol: string): Promise<Record<string, unknown> | null> {
  const ySymbol = toYahooSymbol(symbol);
  if (!ySymbol) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ySymbol)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const q = data?.quoteResponse?.result?.[0];
    if (!q || q.regularMarketPrice == null) return null;
    return {
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      open: q.regularMarketOpen,
      high: q.regularMarketDayHigh,
      low: q.regularMarketDayLow,
      prevClose: q.regularMarketPreviousClose,
      volume: q.regularMarketVolume,
      source: "yahoo",
    };
  } catch {
    return null;
  }
}

function buildPriceBlock(eod: Record<string, unknown> | null, altQuote: Record<string, unknown> | null, sym: string): string {
  const data = eod ?? altQuote;
  if (!data) return `(Live price for ${sym} unavailable — using training knowledge for estimates)`;
  const price = (data as Record<string, unknown>)?.close ?? (data as Record<string, unknown>)?.price;
  const chg   = (data as Record<string, unknown>)?.change;
  const chgP  = (data as Record<string, unknown>)?.change_p ?? (data as Record<string, unknown>)?.changePct;
  const open  = (data as Record<string, unknown>)?.open;
  const high  = (data as Record<string, unknown>)?.high;
  const low   = (data as Record<string, unknown>)?.low;
  const vol   = (data as Record<string, unknown>)?.volume;
  const source = eod ? "EODHD" : ((altQuote as Record<string, unknown>)?.source === "yahoo" ? "Yahoo Finance" : "fallback");

  let block = `LIVE PRICE — ${sym.replace(".US","").replace(".BSE","").replace(".CC","").replace("-USD","")} (source: ${source}):
• Price: $${fmt(price)}
• Change: ${chg != null ? (Number(chg) >= 0 ? "+" : "") + fmt(chg) : "N/A"} (${chgP != null ? fmt(chgP) + "%" : "N/A"})`;
  if (open) block += `\n• Open: $${fmt(open)}`;
  if (high) block += `  |  High: $${fmt(high)}`;
  if (low)  block += `  |  Low: $${fmt(low)}`;
  if (vol)  block += `\n• Volume: ${Number(vol).toLocaleString("en-US")}`;
  return block;
}

function buildNewsBlock(news: Record<string, unknown>[]): string {
  if (!news.length) return "(No recent news found)";
  const lines = news.slice(0, 5).map((n, i) => {
    const entities = Array.isArray(n.entities) ? n.entities as Record<string,unknown>[] : [];
    const score = entities[0]?.sentiment_score ?? null;
    const label = sentimentLabel(score);
    const src   = String(n.source ?? "");
    const date  = String(n.published_at ?? "").slice(0, 10);
    const snippet = String(n.description ?? n.snippet ?? "").slice(0, 120);
    return `${i+1}. [${label}] ${n.title}\n   ${snippet}${src ? ` — ${src}` : ""}${date ? ` (${date})` : ""}`;
  });
  return `RECENT NEWS & SENTIMENT:\n${lines.join("\n")}`;
}

function buildHistoryBlock(history: unknown[]): string {
  if (!history.length) return "";
  const recent = (history as Record<string,unknown>[]).slice(0, 10);
  const prices = recent.map(d => Number(d.close)).filter(v => !isNaN(v));
  if (!prices.length) return "";
  const newest = prices[0];
  const oldest = prices[prices.length - 1];
  const trend  = newest > oldest ? "uptrend ↑" : newest < oldest ? "downtrend ↓" : "sideways ↔";
  const swing  = ((Math.max(...prices) - Math.min(...prices)) / oldest * 100).toFixed(1);
  return `20-DAY PRICE TREND: ${trend} | Range swing: ${swing}% | From $${fmt(oldest)} → $${fmt(newest)}`;
}

// ── Platform knowledge base ───────────────────────────────────────────────────
const PLATFORM_KNOWLEDGE = `
TradingSmart is an AI-powered trading intelligence platform.
• AI Predictions: analyses live price, RSI, MACD, news & global macro → BUY/SELL/HOLD with probability score.
• 11 Strategies ranked for current market: Trend Following, Swing, Scalping, Mean Reversion, Breakout, Momentum, Range, News-based, Options Buying, Options Selling, Pairs Trading.
• Backtesting: validates strategy on 100+ days real OHLCV; shows win rate, drawdown, profit factor.
• Paper Trading: risk-free simulation with virtual money; all gates bypassed.
• Daily Analysis (/market-picks): admins publish AI predictions for all users to see.
• Active Trades: live P&L, stop-loss, take-profit tracking.
• Capital Scenarios: Best/Likely/Worst case ROI for $10k / $100k / $1M investors.
• Contact: ${PHONE}
`;

// ── Gemini prompt builder ─────────────────────────────────────────────────────
function buildPrompt(opts: {
  message: string;
  intent: Intent;
  symbol: string | null;
  priceBlock: string;
  newsBlock: string;
  trendBlock: string;
  historyText: string;
}): string {
  const { message, intent, symbol, priceBlock, newsBlock, trendBlock, historyText } = opts;

  const intentGuidance: Record<Intent, string> = {
    price: `User is asking for the current price/rate. Present the LIVE PRICE DATA clearly and naturally — like a trader reading a screen. If the price is up say it enthusiastically; if down, acknowledge it. Add a one-line context about what this means.`,

    sentiment: `User wants to know the news/sentiment around an asset. Summarise the key headlines and what the overall mood is — bullish, bearish, or mixed. Be like a market analyst who follows news closely. Give 2–3 key themes from the news.`,

    analysis: `User wants a buy/sell/hold recommendation. Analyse the situation like a seasoned trader: look at the price trend (up/down/sideways), the news sentiment (positive/negative), and any macro context. Give a clear recommendation — BUY / SELL / HOLD — with 3–4 solid reasons. Be direct; don't hedge too much. End with one risk warning.`,

    impact: `User is asking how a macro factor (oil price, Fed rates, inflation, etc.) is affecting the market. Walk them through the cause-effect chain clearly: e.g., rising oil → higher transport & input costs → margin pressure on companies → selling pressure on equities → but energy stocks benefit. Use the news data to make it real and current.`,

    platform: `User is asking about the TradingSmart platform. Answer using the PLATFORM KNOWLEDGE provided. Be helpful and concise.`,

    general: `User has a general finance/trading question. Answer intelligently using the available data and your knowledge. Be conversational and genuinely useful.`,
  };

  return `You are a sharp, friendly market intelligence assistant for the TradingSmart platform. You speak like a knowledgeable trader friend, not a corporate chatbot. You're direct, insightful, and human. You use real data (prices, news sentiment) to back up what you say.

YOUR TASK: ${intentGuidance[intent]}

PLATFORM KNOWLEDGE (for platform questions):
${PLATFORM_KNOWLEDGE}

${priceBlock ? `---\n${priceBlock}\n---` : ""}
${trendBlock ? `${trendBlock}\n---` : ""}
${newsBlock ? `${newsBlock}\n---` : ""}

CONVERSATION SO FAR:
${historyText}

USER'S MESSAGE:
"${message.replace(/"/g, '\\"')}"

SCOPE RULE (CRITICAL):
You ONLY answer questions about finance, markets, stocks, crypto, commodities, forex, economics, trading strategies, and the TradingSmart platform. If the user asks about anything unrelated (e.g. cooking, movies, sports, coding, relationships, weather, general knowledge), politely decline: "I'm a financial market assistant, so I can only help with stocks, crypto, market news, trading, and our TradingSmart platform. Try asking me about a stock price or market analysis!"

HOW TO RESPOND:
1. Sound human like a smart friend, not a bot. Use "I think", "honestly", "looks like", "the thing is" naturally.
2. If you have live price data, state it in the first sentence clearly (e.g., "Tesla is sitting at $185.40, down 1.2% today").
3. For analysis questions: give BUY / SELL / HOLD clearly, explain WHY in 3-4 reasons (use news + price trend), then add one risk note.
4. For sentiment questions: summarise 2-3 key news themes and overall mood (bullish/bearish/mixed).
5. For commodity impact (e.g., crude oil): explain the full cause-effect chain on different market sectors.
6. For platform questions: answer based on platform knowledge only.
7. Give complete, thorough answers. Do NOT cut off mid-sentence. Use 6-12 sentences for analysis questions. Use bullets for lists.
8. Never use double dashes (--) or em dashes. Never leave stray asterisks. Use **bold** for emphasis.
9. Understand typos and rephrasings naturally.
10. If live data was unavailable, be upfront ("I don't have live data right now, but based on recent trends...") and still give your best take.
11. Use conversation context for follow-up questions. If user says "why?", "what about now?", "and for tomorrow?", infer they mean the last discussed asset/topic unless they specify a new one.
12. ALWAYS end analysis/recommendation responses with: "⚠️ This is market analysis based on news and sentiment, not financial advice. Always manage your risk."
13. For BUY/SELL/HOLD analysis, after your recommendation add: "For a full in-depth technical analysis with backtesting, indicators and strategy matching, use our **Detailed Analysis** page."
14. For contact/support requests: mention ${PHONE}.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: JSON_HEADERS });
  }

  try {
    const body    = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body?.history)
      ? (body.history as Array<{ role?: string; text?: string }>)
      : [];
    const mode    = typeof body?.mode === "string" ? body.mode : "market";

    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message" }), { status: 400, headers: JSON_HEADERS });
    }

    if (isJailbreakAttempt(message)) {
      return new Response(JSON.stringify({
        answer: "I can only help with financial market analysis and the TradingSmart platform. Ask me about stock prices, market sentiment, or buy/sell/hold analysis.",
        suggestContact: false,
      }), { status: 200, headers: JSON_HEADERS });
    }

    if (isSmallTalk(message)) {
      return new Response(JSON.stringify({
        answer: "Hey! I'm doing great. I'm your financial market assistant and I can help with live prices, market news, sentiment, and buy/sell/hold analysis. Ask me any stock, crypto, or market question.",
        suggestContact: false,
      }), { status: 200, headers: JSON_HEADERS });
    }

    if (mode !== "platform" && !isFinanceOrPlatformQuery(message)) {
      return new Response(JSON.stringify({
        answer: "I'm a financial market assistant, so I can only help with stocks, crypto, market news, trading, and the TradingSmart platform. Try asking me about a stock price or market analysis.",
        suggestContact: false,
      }), { status: 200, headers: JSON_HEADERS });
    }

    // "platform" mode forces platform-only intent (for non-logged-in support chatbot)
    const intent: Intent = mode === "platform" ? "platform" : detectIntent(message);
    const explicitSymbol = mode === "platform" ? null : extractSymbol(message);
    const symbol = mode === "platform" ? null : (explicitSymbol ?? inferSymbolFromHistory(history));

    // ── Parallel data fetch ────────────────────────────────────────────────
    let eodPrice:   Record<string, unknown> | null = null;
    let altQuote:   Record<string, unknown> | null = null;
    let newsArr:    Record<string, unknown>[] = [];
    let historyArr: unknown[] = [];

    if (intent !== "platform" && symbol) {
      const [eodR, newsR, histR, fhR, avR, yR] = await Promise.allSettled([
        fetchEODHDPrice(symbol),
        fetchMarketAuxNews(symbol),
        fetchEODHDHistory(symbol),
        fetchFinnHubQuote(symbol),
        fetchAlphaVantageQuote(symbol),
        fetchYahooQuote(symbol),
      ]);

      eodPrice   = eodR.status   === "fulfilled" ? eodR.value   : null;
      newsArr    = newsR.status  === "fulfilled" ? newsR.value  : [];
      historyArr = histR.status  === "fulfilled" ? histR.value  : [];
      const fh   = fhR.status   === "fulfilled" ? fhR.value    : null;
      const av   = avR.status   === "fulfilled" ? avR.value    : null;
      const yq   = yR.status    === "fulfilled" ? yR.value     : null;
      altQuote   = eodPrice ? null : (yq ?? fh ?? av ?? null);
      if (isCommoditySymbol(symbol) && yq) {
        eodPrice = null;
        altQuote = yq;
      }

      // Twelve Data as last fallback
      if (!eodPrice && !altQuote && TWELVE_DATA_KEY) {
        altQuote = await fetchTwelveDataQuote(symbol);
      }

    } else if (intent === "impact") {
      const [oilR, newsR] = await Promise.allSettled([
        fetchEODHDPrice("CL.US"),
        fetchGeneralMarketNews(),
      ]);
      eodPrice = oilR.status  === "fulfilled" ? oilR.value  : null;
      newsArr  = newsR.status === "fulfilled" ? newsR.value : [];

    } else if (intent === "sentiment") {
      newsArr = symbol
        ? await fetchMarketAuxNews(symbol)
        : await fetchGeneralMarketNews();

    } else if (intent === "general") {
      newsArr = await fetchGeneralMarketNews();
    }

    // ── Build context blocks ───────────────────────────────────────────────
    const priceBlock = (intent === "price" || intent === "analysis" || intent === "impact")
      ? buildPriceBlock(eodPrice, altQuote, symbol ?? "asset")
      : "";
    const newsBlock  = buildNewsBlock(newsArr);
    const trendBlock = buildHistoryBlock(historyArr);

    const historyText = history.length
      ? history.slice(-16).map(h => `${h.role === "user" ? "User" : "Assistant"}: ${String(h.text ?? "").replace(/\n/g, " ")}`).join("\n")
      : "No previous messages.";

    // ── Gemini inference ───────────────────────────────────────────────────
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({
        answer: `AI analysis is temporarily offline. For market questions or platform support, please call or WhatsApp ${PHONE}.`,
        suggestContact: true,
      }), { status: 200, headers: JSON_HEADERS });
    }

    const prompt = buildPrompt({ message, intent, symbol, priceBlock, newsBlock, trendBlock, historyText });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 3000, temperature: 0.72 },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error", geminiRes.status, errText);
      return new Response(JSON.stringify({
        answer: "I'm having trouble connecting to my analysis engine right now. Please try again in a moment.",
        suggestContact: false,
      }), { status: 200, headers: JSON_HEADERS });
    }

    const geminiData = await geminiRes.json();
    let answer = sanitizeAnswerText(
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      || "I couldn't generate a response. Please try again."
    );
    answer = enforceRiskLine(answer, intent, message);

    const lowerMsg = message.toLowerCase();
    const suggestContact = intent === "platform" &&
      /\b(contact|support|human|call|whatsapp|phone|reach|speak)\b/i.test(lowerMsg);

    return new Response(JSON.stringify({ answer, suggestContact }), { status: 200, headers: JSON_HEADERS });

  } catch (e) {
    console.error("chatbot-answer error:", e);
    return new Response(JSON.stringify({
      answer: "Something went wrong on my end. Please try again!",
      suggestContact: false,
    }), { status: 200, headers: JSON_HEADERS });
  }
});
