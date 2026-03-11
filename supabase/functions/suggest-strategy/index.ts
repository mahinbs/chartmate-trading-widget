/**
 * suggest-strategy — Supabase Edge Function
 *
 * Data routing:
 *   US stocks / crypto / forex → TwelveData (primary) → Alpha Vantage (fallback)
 *   Indian stocks              → Yahoo Finance candles (computed indicators)
 *
 * AI: Gemini 3.1 Pro Preview (latest)
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// ─── Symbol normalisers ───────────────────────────────────────────────────────

function isIndianSymbol(raw: string) {
  return /\.(NS|BO)$/i.test(raw);
}
function isForexSymbol(raw: string) {
  return /=X$/i.test(raw) || /^[A-Z]{6}$/.test(raw.toUpperCase());
}
function isCryptoSymbol(raw: string) {
  return /-USD$|-USDT$|-BTC$/i.test(raw) || /=F$/i.test(raw);
}

// Convert raw symbol → TwelveData format
function toTDSymbol(raw: string): string {
  if (isCryptoSymbol(raw)) return raw.replace(/-/g, '/').replace(/=F$/, '').replace('USDT', 'USD');
  if (isForexSymbol(raw)) {
    const s = raw.replace('=X', '');
    return s.length === 6 ? `${s.slice(0, 3)}/${s.slice(3)}` : s;
  }
  return raw.replace(/\.(NS|BO|L|AX|TO|DE)$/i, '').toUpperCase();
}

// ─── TwelveData helpers ───────────────────────────────────────────────────────

async function tdQuote(tdSym: string, key: string) {
  const r = await fetch(
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(tdSym)}&apikey=${key}`,
    { signal: AbortSignal.timeout(10000) },
  );
  const d = await r.json();
  if (!d?.close || parseFloat(d.close) <= 0) return null;
  return {
    price:     parseFloat(d.close),
    change:    parseFloat(d.change ?? '0'),
    changePct: parseFloat(d.percent_change ?? '0'),
    volume:    parseFloat(d.volume ?? '0'),
    high:      parseFloat(d.high ?? d.close),
    low:       parseFloat(d.low  ?? d.close),
    prevClose: parseFloat(d.previous_close ?? d.close),
  };
}

async function tdRSI(tdSym: string, key: string): Promise<number | null> {
  const r = await fetch(
    `https://api.twelvedata.com/rsi?symbol=${encodeURIComponent(tdSym)}&interval=1day&outputsize=1&apikey=${key}`,
    { signal: AbortSignal.timeout(10000) },
  );
  const d = await r.json();
  const v = d?.values?.[0]?.rsi;
  return v ? parseFloat(v) : null;
}

async function tdMACD(tdSym: string, key: string) {
  const r = await fetch(
    `https://api.twelvedata.com/macd?symbol=${encodeURIComponent(tdSym)}&interval=1day&outputsize=1&apikey=${key}`,
    { signal: AbortSignal.timeout(10000) },
  );
  const d = await r.json();
  const v = d?.values?.[0];
  if (!v) return null;
  return {
    macd:   parseFloat(v.macd ?? '0'),
    signal: parseFloat(v.macd_signal ?? '0'),
    hist:   parseFloat(v.macd_hist ?? '0'),
  };
}

async function tdBBands(tdSym: string, key: string) {
  const r = await fetch(
    `https://api.twelvedata.com/bbands?symbol=${encodeURIComponent(tdSym)}&interval=1day&outputsize=1&apikey=${key}`,
    { signal: AbortSignal.timeout(10000) },
  );
  const d = await r.json();
  const v = d?.values?.[0];
  if (!v) return null;
  return {
    upper:  parseFloat(v.upper_band),
    middle: parseFloat(v.middle_band),
    lower:  parseFloat(v.lower_band),
  };
}

async function tdStats(tdSym: string, key: string) {
  try {
    const r = await fetch(
      `https://api.twelvedata.com/statistics?symbol=${encodeURIComponent(tdSym)}&apikey=${key}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const d = await r.json();
    return {
      avgVol10d: d?.statistics?.stock_statistics?.average_volume_10d_calc ?? null,
      avgVol3m:  d?.statistics?.stock_statistics?.average_volume_3m_calc  ?? null,
      float:     d?.statistics?.stock_statistics?.shares_float            ?? null,
      pe:        d?.statistics?.valuations_metrics?.trailing_pe            ?? null,
      eps:       d?.statistics?.financials?.income_statement?.basic_eps_ttm ?? null,
    };
  } catch { return null; }
}

// ─── Alpha Vantage fallback helpers ──────────────────────────────────────────

async function avQuote(symbol: string, key: string) {
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
      { signal: AbortSignal.timeout(12000) },
    );
    const d = await r.json();
    const q = d?.["Global Quote"];
    if (!q || !q["05. price"]) return null;
    return {
      price:     Number(q["05. price"]),
      change:    Number(q["09. change"] || 0),
      changePct: Number(String(q["10. change percent"] || "0").replace("%", "")) || 0,
      volume:    Number(q["06. volume"] || 0),
      high:      Number(q["03. high"] || 0),
      low:       Number(q["04. low"]  || 0),
      prevClose: Number(q["08. previous close"] || 0),
    };
  } catch { return null; }
}

async function avRSI(symbol: string, key: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=RSI&symbol=${encodeURIComponent(symbol)}&interval=daily&time_period=14&series_type=close&apikey=${key}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const d = await r.json();
    const entries = Object.entries(d?.["Technical Analysis: RSI"] || {}).sort((a, b) => b[0].localeCompare(a[0]));
    return entries.length ? Number((entries[0][1] as any)?.RSI ?? null) : null;
  } catch { return null; }
}

async function avMACD(symbol: string, key: string) {
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=MACD&symbol=${encodeURIComponent(symbol)}&interval=daily&series_type=close&apikey=${key}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const d = await r.json();
    const entries = Object.entries(d?.["Technical Analysis: MACD"] || {}).sort((a, b) => b[0].localeCompare(a[0]));
    if (!entries.length) return null;
    const l = entries[0][1] as any;
    return { macd: Number(l?.MACD ?? 0), signal: Number(l?.MACD_Signal ?? 0), hist: Number(l?.MACD_Hist ?? 0) };
  } catch { return null; }
}

async function avNews(symbol: string, key: string): Promise<string> {
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&apikey=${key}&limit=10`,
      { signal: AbortSignal.timeout(12000) },
    );
    const d = await r.json();
    const feed: any[] = d?.feed || [];
    if (!feed.length) return "No recent news.";
    return feed.slice(0, 5).map((n: any) => {
      const s = n.overall_sentiment_score ?? 0;
      const lbl = s > 0.2 ? "BULLISH" : s < -0.2 ? "BEARISH" : "NEUTRAL";
      return `• [${lbl}] ${(n.title ?? "").slice(0, 120)}`;
    }).join("\n");
  } catch { return "News unavailable."; }
}

// ─── Gemini 3.1 ───────────────────────────────────────────────────────────────

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 4000,
        temperature: 0.15,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gemini 3.1 error: ${response.status} — ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const tdKey     = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
    const alphaKey  = Deno.env.get("ALPHA_VANTAGE_API_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "Gemini API key not configured" }), { status: 503, headers: JSON_HEADERS });
    }

    const body           = await req.json().catch(() => ({}));
    const rawSymbol      = (body?.symbol ?? "AAPL") as string;
    const action         = (body?.action  ?? "BUY") as string;
    const investment     = Number(body?.investment ?? 10000);
    const timeframe      = (body?.timeframe ?? "1d") as string;

    const isIndian  = isIndianSymbol(rawSymbol);
    const isCrypto  = isCryptoSymbol(rawSymbol);
    const isForex   = isForexSymbol(rawSymbol);
    const isUs      = !isIndian && !isCrypto && !isForex;
    const tdSymbol  = toTDSymbol(rawSymbol);

    // Normalised symbol for AV (strip suffixes)
    const avSymbol = rawSymbol.replace(/\.(NS|BO)$/i, "").replace(/-USD$/i, "USD").replace(/=X$/i, "").toUpperCase();

    let quote: any = null;
    let rsi: number | null = null;
    let macd: any = null;
    let bbands: any = null;
    let stats: any = null;
    let newsText = "News unavailable.";
    let dataSource = "computed";

    // ── TwelveData PRIMARY (US stocks, crypto, forex) ─────────────────────────
    if ((isUs || isCrypto || isForex) && tdKey) {
      try {
        console.log(`📊 suggest-strategy: TwelveData for ${tdSymbol}`);
        [quote, rsi, macd, bbands, stats] = await Promise.all([
          tdQuote(tdSymbol, tdKey),
          tdRSI(tdSymbol, tdKey),
          tdMACD(tdSymbol, tdKey),
          tdBBands(tdSymbol, tdKey),
          tdStats(tdSymbol, tdKey),
        ]);
        if (quote) {
          dataSource = "TwelveData";
          console.log(`✅ TwelveData data for ${tdSymbol}: price=${quote.price}, RSI=${rsi}`);
        }
      } catch (e: any) {
        console.log(`⚠️ TwelveData failed for ${tdSymbol}: ${e.message}`);
      }
    }

    // ── Alpha Vantage FALLBACK (US stocks if TwelveData failed) ──────────────
    if (!quote && isUs && alphaKey) {
      try {
        console.log(`↩️ Alpha Vantage fallback for ${avSymbol}`);
        [quote, rsi, macd, newsText] = await Promise.all([
          avQuote(avSymbol, alphaKey),
          avRSI(avSymbol, alphaKey),
          avMACD(avSymbol, alphaKey),
          avNews(avSymbol, alphaKey),
        ]);
        if (quote) dataSource = "Alpha Vantage";
      } catch { /* keep nulls */ }
    }

    // ── Alpha Vantage news sentiment for US stocks (even if TD gave price data)
    if (isUs && alphaKey && dataSource === "TwelveData") {
      newsText = await avNews(avSymbol, alphaKey).catch(() => "News unavailable.");
    }

    // ── Build market data context for Gemini ─────────────────────────────────
    const priceCtx = quote
      ? `Price: ${quote.price.toFixed(4)}, Change: ${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%, Day range: ${quote.low.toFixed(4)}–${quote.high.toFixed(4)}, Volume: ${(quote.volume / 1000).toFixed(0)}K (source: ${dataSource})`
      : `Live price unavailable — working from internal estimates.`;

    const rsiCtx = rsi != null
      ? `RSI(14): ${rsi.toFixed(1)} — ${rsi > 70 ? "OVERBOUGHT" : rsi < 30 ? "OVERSOLD" : "NEUTRAL"}`
      : "RSI: unavailable";

    const macdCtx = macd
      ? `MACD: ${macd.macd.toFixed(4)}, Signal: ${macd.signal.toFixed(4)}, Histogram: ${macd.hist.toFixed(4)} — ${macd.hist > 0 ? "BULLISH momentum" : "BEARISH momentum"}`
      : "MACD: unavailable";

    const bbandsCtx = bbands
      ? `Bollinger Bands: Upper=${bbands.upper.toFixed(4)} Middle=${bbands.middle.toFixed(4)} Lower=${bbands.lower.toFixed(4)} — price is ${quote?.price ? (quote.price > bbands.upper ? "ABOVE upper (overbought zone)" : quote.price < bbands.lower ? "BELOW lower (oversold zone)" : "INSIDE bands (normal)") : "unknown position"}`
      : "Bollinger Bands: unavailable";

    const statsCtx = stats
      ? `AvgVol10d: ${stats.avgVol10d ?? "N/A"}, AvgVol3m: ${stats.avgVol3m ?? "N/A"}, Float: ${stats.float ?? "N/A"}, P/E: ${stats.pe ?? "N/A"}, EPS: ${stats.eps ?? "N/A"}`
      : "Extended statistics: unavailable";

    const assetTypeCtx = isIndian ? "Indian stock (NSE/BSE)" : isCrypto ? "Cryptocurrency" : isForex ? "Forex pair" : "US stock";

    // ── Gemini 3.1 prompt ─────────────────────────────────────────────────────
    const prompt = `You are an elite institutional quantitative strategist powered by Gemini 3.1. A trader wants to place a ${action} order on **${rawSymbol}** (${assetTypeCtx}) with an investment of **${investment.toFixed(0)}** for a **${timeframe}** timeframe.

Your job: analyse current world market conditions, all technical indicators, volume data, news sentiment, and global macro context for ${rawSymbol}, then rank all 11 trading strategies from BEST to WORST for this specific order right now.

## LIVE MARKET DATA for ${rawSymbol} (via ${dataSource})
${priceCtx}
${rsiCtx}
${macdCtx}
${bbandsCtx}

## VOLUME & STATISTICS
${statsCtx}
Current volume vs avg: ${quote?.volume && stats?.avgVol10d ? (quote.volume / parseFloat(stats.avgVol10d) * 100).toFixed(0) + "% of 10d avg" : "N/A"}

## RECENT NEWS SENTIMENT
${newsText}

## STRATEGIES TO RANK (ALL 11)
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
1. Current market regime for ${rawSymbol}: trending / ranging / high-volatility / news-driven / consolidating
2. Global macro context: interest rates, sector rotation, overall market sentiment right now
3. Why each strategy succeeds or fails in this exact context
4. AI probability score (0–100): how likely this strategy leads to profit for a ${action} trade right now
5. Verdict: great | good | neutral | poor | avoid
6. Risk warning if applicable

## OUTPUT FORMAT — STRICT JSON ONLY
{
  "marketContext": {
    "regime": "trending_bullish | trending_bearish | ranging | high_volatility | news_driven | consolidating",
    "summary": "2-3 sentence plain English summary of current market conditions for this asset",
    "globalMacro": "1 sentence on relevant global macro factors",
    "newsSentiment": "bullish | bearish | neutral",
    "riskWarnings": ["string"]
  },
  "topPick": {
    "strategy": "strategy_value",
    "reason": "2-3 sentences on why this is best RIGHT NOW"
  },
  "ranked": [
    {
      "strategy": "strategy_value",
      "label": "Human label",
      "probabilityScore": 0,
      "verdict": "great|good|neutral|poor|avoid",
      "whyNow": "1-2 sentences specific to current conditions",
      "riskWarning": ""
    }
  ]
}`;

    // ── Call Gemini 3.1 ───────────────────────────────────────────────────────
    try {
      const rawText = await callGemini(prompt, geminiKey);
      const parsed = JSON.parse(rawText);
      return new Response(JSON.stringify({
        symbol: rawSymbol, action, investment, timeframe,
        dataSource,
        marketContext: parsed?.marketContext ?? null,
        topPick:       parsed?.topPick       ?? null,
        ranked:        parsed?.ranked        ?? [],
        fetchedAt:     new Date().toISOString(),
      }), { status: 200, headers: JSON_HEADERS });
    } catch (err) {
      console.error("suggest-strategy Gemini error:", err);
      return new Response(JSON.stringify({
        symbol: rawSymbol, action, investment, timeframe, dataSource,
        marketContext: null, topPick: null, ranked: [],
        aiError: err instanceof Error ? err.message : "AI analysis failed",
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
