/**
 * suggest-strategy — Supabase Edge Function
 *
 * Fetches live market data (price, RSI, MACD, volume, news sentiment) via Alpha Vantage,
 * then calls Gemini to rank all 11 trading strategies for the requested symbol.
 *
 * Returns:
 *   ranked[]  – strategies sorted best-first with AI probability score, verdict, reason
 *   marketContext – quick summary of current market regime for the symbol
 *   topPick   – single best strategy with full reasoning
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeSymbol(raw: string): string {
  return (raw || "")
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "")  // strip NSE/BSE suffix for Alpha Vantage
    .replace(/-USD$/i, "USD")    // BTC-USD → BTCUSD
    .replace(/=X$/i, "");        // GBPUSD=X → GBPUSD
}

async function fetchQuote(symbol: string, key: string) {
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
      { signal: AbortSignal.timeout(12000) },
    );
    const d = await r.json();
    const q = d?.["Global Quote"];
    if (!q || !q["05. price"]) return null;
    return {
      price:         Number(q["05. price"]),
      change:        Number(q["09. change"] || 0),
      changePct:     Number(String(q["10. change percent"] || "0").replace("%", "")) || 0,
      volume:        Number(q["06. volume"] || 0),
      high:          Number(q["03. high"] || 0),
      low:           Number(q["04. low"] || 0),
      prevClose:     Number(q["08. previous close"] || 0),
    };
  } catch { return null; }
}

async function fetchRSI(symbol: string, key: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=RSI&symbol=${encodeURIComponent(symbol)}&interval=daily&time_period=14&series_type=close&apikey=${key}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const d = await r.json();
    const entries = Object.entries(d?.["Technical Analysis: RSI"] || {});
    if (!entries.length) return null;
    entries.sort((a, b) => b[0].localeCompare(a[0]));
    return Number((entries[0][1] as any)?.RSI ?? null);
  } catch { return null; }
}

async function fetchMACD(symbol: string, key: string) {
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=MACD&symbol=${encodeURIComponent(symbol)}&interval=daily&series_type=close&apikey=${key}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const d = await r.json();
    const entries = Object.entries(d?.["Technical Analysis: MACD"] || {});
    if (!entries.length) return null;
    entries.sort((a, b) => b[0].localeCompare(a[0]));
    const latest = entries[0][1] as any;
    return {
      macd:   Number(latest?.MACD ?? 0),
      signal: Number(latest?.MACD_Signal ?? 0),
      hist:   Number(latest?.MACD_Hist ?? 0),
    };
  } catch { return null; }
}

async function fetchNewsSentiment(symbol: string, key: string): Promise<string> {
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&apikey=${key}&limit=10`,
      { signal: AbortSignal.timeout(12000) },
    );
    const d = await r.json();
    const feed: any[] = d?.feed || [];
    if (!feed.length) return "No recent news available.";
    return feed
      .slice(0, 5)
      .map((n: any) => {
        const score = n.overall_sentiment_score ?? 0;
        const label = score > 0.2 ? "BULLISH" : score < -0.2 ? "BEARISH" : "NEUTRAL";
        return `• [${label}] ${n.title?.slice(0, 120) || "No title"}`;
      })
      .join("\n");
  } catch {
    return "News data unavailable.";
  }
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  // Use the same stable model + API style as the existing predict-movement function
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 4000,
        temperature: 0.2,
        // Ask Gemini to return strict JSON so parsing is stable
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("Gemini API error in suggest-strategy:", response.status, text);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    throw new Error("Gemini returned empty response");
  }
  return text;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const alphaKey  = Deno.env.get("ALPHA_VANTAGE_API_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "Gemini API key not configured" }), { status: 503, headers: JSON_HEADERS });
    }

    const body = await req.json().catch(() => ({}));
    const rawSymbol: string  = body?.symbol ?? "AAPL";
    const action: string     = body?.action ?? "BUY";      // BUY | SELL
    const investment: number = Number(body?.investment ?? 10000);
    const timeframe: string  = body?.timeframe ?? "1d";

    const symbol = normalizeSymbol(rawSymbol);

    // ── 1. Fetch market data in parallel ─────────────────────────────────────
    const [quote, rsi, macd, news] = await Promise.all([
      alphaKey ? fetchQuote(symbol, alphaKey)         : Promise.resolve(null),
      alphaKey ? fetchRSI(symbol, alphaKey)           : Promise.resolve(null),
      alphaKey ? fetchMACD(symbol, alphaKey)          : Promise.resolve(null),
      alphaKey ? fetchNewsSentiment(symbol, alphaKey) : Promise.resolve("No API key for news."),
    ]);

    const priceContext = quote
      ? `Current price: ${quote.price.toFixed(2)}, Change: ${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%, Day range: ${quote.low.toFixed(2)}–${quote.high.toFixed(2)}, Volume: ${(quote.volume / 1000).toFixed(0)}K`
      : "Live price data unavailable (Alpha Vantage key missing).";

    const rsiContext = rsi != null
      ? `RSI(14): ${rsi.toFixed(1)} — ${rsi > 70 ? "OVERBOUGHT (potential reversal or pullback)" : rsi < 30 ? "OVERSOLD (potential bounce or continuation down)" : "NEUTRAL zone"}`
      : "RSI unavailable.";

    const macdContext = macd
      ? `MACD: ${macd.macd.toFixed(3)}, Signal: ${macd.signal.toFixed(3)}, Histogram: ${macd.hist.toFixed(3)} — ${macd.hist > 0 ? "BULLISH momentum" : "BEARISH momentum"}`
      : "MACD unavailable.";

    // ── 2. Build Gemini prompt ────────────────────────────────────────────────
    const prompt = `You are an elite institutional quantitative strategist. A trader wants to place a ${action} order on **${rawSymbol}** with an investment of **${investment.toFixed(0)}** for a **${timeframe}** timeframe.

Your job: analyse current world market conditions, technical indicators, news sentiment, and global macro context for ${rawSymbol}, then rank all 11 trading strategies from BEST to WORST for this specific order right now.

## LIVE MARKET DATA for ${rawSymbol}
${priceContext}
${rsiContext}
${macdContext}

## RECENT NEWS SENTIMENT (Alpha Vantage)
${news}

## STRATEGIES TO RANK (rank all 11)
1. trend_following
2. breakout_breakdown
3. mean_reversion
4. momentum
5. scalping
6. swing_trading
7. range_trading
8. news_based
9. options_buying
10. options_selling
11. pairs_trading

## YOUR ANALYSIS MUST COVER
1. **Current market regime** for ${rawSymbol}: trending / ranging / high-volatility / news-driven / consolidating
2. **Global macro context**: interest rates, sector rotation, overall market sentiment right now
3. **Why each strategy succeeds or fails** in this exact context
4. **AI probability score** (0–100): how likely this strategy leads to a profit for a ${action} trade at this moment
5. **Verdict**: great | good | neutral | poor | avoid
6. **Risk warning** if applicable (e.g. overbought, earnings risk, low liquidity)

## OUTPUT FORMAT — STRICT JSON ONLY
Return ONLY valid JSON, no markdown, no extra text:
{
  "marketContext": {
    "regime": "trending_bullish | trending_bearish | ranging | high_volatility | news_driven | consolidating",
    "summary": "2-3 sentence plain English summary of current market conditions for this asset",
    "globalMacro": "1 sentence on relevant global macro factors",
    "newsSentiment": "bullish | bearish | neutral",
    "riskWarnings": ["string", ...]
  },
  "topPick": {
    "strategy": "strategy_value",
    "reason": "2-3 sentences on why this is best RIGHT NOW"
  },
  "ranked": [
    {
      "strategy": "strategy_value",
      "label": "Human label",
      "probabilityScore": 0-100,
      "verdict": "great|good|neutral|poor|avoid",
      "whyNow": "1-2 sentences specific to current conditions",
      "riskWarning": "optional warning or empty string"
    }
  ]
}`;

    // ── 3. Call Gemini ────────────────────────────────────────────────────────
    try {
      const rawText = await callGemini(prompt, geminiKey);
      const parsed = JSON.parse(rawText);

      return new Response(JSON.stringify({
        symbol: rawSymbol,
        action,
        investment,
        timeframe,
        marketContext:  parsed?.marketContext  ?? null,
        topPick:        parsed?.topPick        ?? null,
        ranked:         parsed?.ranked         ?? [],
        fetchedAt:      new Date().toISOString(),
      }), { status: 200, headers: JSON_HEADERS });
    } catch (err) {
      // Treat Gemini timeouts / errors as SOFT failures: return 200 with aiError
      console.error("suggest-strategy Gemini error:", err);
      return new Response(JSON.stringify({
        symbol: rawSymbol,
        action,
        investment,
        timeframe,
        marketContext: null,
        topPick: null,
        ranked: [],
        aiError: err instanceof Error ? err.message : "AI analysis timed out",
        fetchedAt: new Date().toISOString(),
      }), { status: 200, headers: JSON_HEADERS });
    }

  } catch (err: any) {
    console.error("suggest-strategy error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
