import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const US_INDEX_DEFS = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "NASDAQ" },
  { symbol: "^DJI", name: "DOW" },
];

const IN_INDEX_DEFS = [
  { symbol: "^NSEI", name: "Nifty 50" },
  { symbol: "^BSESN", name: "Sensex" },
  { symbol: "^NSEBANK", name: "Bank Nifty" },
];

const CRYPTO_BENCH_DEFS = [
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "ETH-USD", name: "Ethereum" },
  { symbol: "SOL-USD", name: "Solana" },
];

const FOREX_BENCH_DEFS = [
  { symbol: "DX-Y.NYB", name: "US Dollar Index" },
  { symbol: "EURUSD=X", name: "EUR/USD" },
  { symbol: "GBPUSD=X", name: "GBP/USD" },
];

const FX_CCY = new Set([
  "USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNH", "SGD", "HKD", "NOK", "SEK", "TRY", "ZAR", "MXN", "INR",
  "XAU", "XAG",
]);

function isIndianEquitySymbol(symbol?: string | null): boolean {
  if (!symbol) return false;
  const u = symbol.trim().toUpperCase();
  return (
    u.endsWith(".NS") ||
    u.endsWith(".BO") ||
    u.includes("NSE:") ||
    u.includes("BSE:") ||
    u.includes(":NS") ||
    u.includes(":BO")
  );
}

/** EUR-USD is FX; BTC-USD is crypto */
function isCryptoSymbol(symbol: string): boolean {
  if (!symbol || isIndianEquitySymbol(symbol)) return false;
  const u = symbol.toUpperCase();
  if (/=X$/i.test(symbol)) return false;
  const compact = u.replace(/[^A-Z0-9]/g, "");
  if (/^(BTC|ETH|SOL|XRP|DOGE|ADA|AVAX|DOT|LINK|LTC|BNB|MATIC|POL|TON|SHIB|TRX|BCH|ATOM|NEAR|APT|SUI|PEPE|WIF)(USD|USDT|USDC)$/i.test(compact)) {
    return true;
  }
  const m = symbol.match(/^([A-Z0-9]+)-(USD|USDT|USDC|BUSD)$/i);
  if (!m) return false;
  const base = m[1].toUpperCase();
  if (FX_CCY.has(base)) return false;
  return true;
}

function isForexSymbol(symbol: string): boolean {
  if (!symbol || isIndianEquitySymbol(symbol)) return false;
  if (isCryptoSymbol(symbol)) return false;
  if (/=X$/i.test(symbol)) return true;
  const letters = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length === 6) {
    const a = letters.slice(0, 3);
    const b = letters.slice(3, 6);
    if (FX_CCY.has(a) && FX_CCY.has(b)) return true;
  }
  const dash = symbol.toUpperCase().match(/^([A-Z]{3})-([A-Z]{3})$/);
  if (dash && FX_CCY.has(dash[1]) && FX_CCY.has(dash[2])) return true;
  return false;
}

type AssetClass = "US" | "IN" | "CRYPTO" | "FOREX";

function detectAssetClass(symbol?: string | null): AssetClass {
  if (!symbol) return "US";
  if (isIndianEquitySymbol(symbol)) return "IN";
  if (isForexSymbol(symbol)) return "FOREX";
  if (isCryptoSymbol(symbol)) return "CRYPTO";
  return "US";
}

/** Synthetic “vol/stress” from average absolute 1d % move of benchmark row (crypto/FX move faster than VIX scale). */
function stressFromIndices(
  indices: Array<{ changePercent?: number }>,
  kind: "CRYPTO" | "FOREX",
): { value: number; status: string } {
  const n = indices.length || 1;
  const avgAbs =
    indices.reduce((s, i) => s + Math.abs(i.changePercent ?? 0), 0) / n;
  const scaled =
    kind === "CRYPTO"
      ? Math.min(55, avgAbs * 14)
      : Math.min(55, avgAbs * 120);
  let status = "normal";
  if (scaled < 12) status = "low";
  else if (scaled < 22) status = "normal";
  else if (scaled < 38) status = "elevated";
  else status = "high";
  return { value: Math.round(scaled * 100) / 100, status };
}

async function fetchIndexRow(index: { symbol: string; name: string }) {
  try {
    const enc = encodeURIComponent(index.symbol);
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=5d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) throw new Error(`${index.name} fetch failed`);

    const data = await response.json();
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const price =
      meta?.regularMarketPrice ??
      meta?.regularMarketPreviousClose ??
      meta?.previousClose ??
      0;

    let prevClose =
      meta?.chartPreviousClose ??
      meta?.previousClose ??
      meta?.regularMarketPreviousClose ??
      null;

    const closes = result?.indicators?.quote?.[0]?.close as number[] | undefined;
    if ((prevClose == null || prevClose === 0) && closes?.length) {
      const valid = closes.filter((c) => c != null && !Number.isNaN(c) && c > 0);
      if (valid.length >= 2) {
        prevClose = valid[valid.length - 2];
      } else if (valid.length === 1) {
        prevClose = valid[0];
      }
    }

    if (prevClose == null || prevClose === 0) {
      prevClose = price;
    }

    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      name: index.name,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
    };
  } catch (error) {
    console.error(`${index.name} fetch error:`, error);
    return {
      name: index.name,
      price: 0,
      change: 0,
      changePercent: 0,
    };
  }
}

async function fetchMarketIndicesFor(
  defs: { symbol: string; name: string }[],
): Promise<
  Array<{
    name: string;
    price: number;
    change: number;
    changePercent: number;
  }>
> {
  return Promise.all(defs.map((d) => fetchIndexRow(d)));
}

/** US VIX (^VIX) or India VIX (^INDIAVIX) */
async function fetchVolGauge(yahooSymbol: string): Promise<{ value: number; status: string }> {
  try {
    const enc = encodeURIComponent(yahooSymbol);
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=5d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) throw new Error("Vol gauge fetch failed");

    const data = await response.json();
    const meta = data.chart?.result?.[0]?.meta;
    const vix =
      meta?.regularMarketPrice ??
      meta?.regularMarketPreviousClose ??
      meta?.previousClose ??
      20;

    let status = "normal";
    if (vix < 15) status = "low";
    else if (vix < 20) status = "normal";
    else if (vix < 30) status = "elevated";
    else status = "high";

    return { value: Math.round(vix * 100) / 100, status };
  } catch (error) {
    console.error("Vol gauge fetch error:", error);
    return { value: 20, status: "normal" };
  }
}

async function fetchIndiaVol(): Promise<{ value: number; status: string }> {
  const primary = await fetchVolGauge("^INDIAVIX");
  if (primary.value > 0) return primary;
  return fetchVolGauge("INDIAVIX.NS");
}

function calculateMarketSentiment(
  indices: Array<{ name: string; changePercent?: number }>,
  vol: number,
  asset: AssetClass,
): {
  sentiment: "bullish" | "bearish" | "neutral";
  score: number;
  description: string;
  detail: string;
} {
  const avgChange = indices.length
    ? indices.reduce((sum, idx) => sum + (idx.changePercent || 0), 0) / indices.length
    : 0;

  let sentimentScore = avgChange;
  if (asset === "US" || asset === "IN") {
    if (vol > 25) sentimentScore -= 1.2;
    if (vol > 30) sentimentScore -= 0.8;
    if (vol < 15) sentimentScore += 0.8;
  } else {
    if (vol > 32) sentimentScore -= 1.0;
    if (vol > 42) sentimentScore -= 0.8;
    if (vol < 14) sentimentScore += 0.5;
  }

  let sentiment: "bullish" | "bearish" | "neutral";
  let description: string;
  let detail: string;

  const idxLine = indices
    .map(
      (i) =>
        `${i.name} ${(i.changePercent ?? 0) >= 0 ? "+" : ""}${(i.changePercent ?? 0).toFixed(2)}%`,
    )
    .join("; ");

  const volName =
    asset === "IN"
      ? "India VIX"
      : asset === "CRYPTO"
        ? "crypto tape stress (scaled from majors)"
        : asset === "FOREX"
          ? "FX tape stress (scaled from majors)"
          : "VIX";
  const bench =
    asset === "IN"
      ? "Nifty/Sensex/Bank Nifty"
      : asset === "CRYPTO"
        ? "Bitcoin/Ethereum/Solana"
        : asset === "FOREX"
          ? "Dollar index and cable majors"
          : "S&P/Nasdaq/Dow";

  if (sentimentScore > 0.35) {
    sentiment = "bullish";
    description =
      asset === "IN"
        ? "Indian benchmarks are up on balance versus their reference close."
        : asset === "CRYPTO"
          ? "Large-cap crypto is up on balance versus the reference close."
          : asset === "FOREX"
            ? "FX majors firm versus the reference close on average."
            : "US benchmarks are up on balance versus their reference close.";
    detail =
      asset === "CRYPTO"
        ? `Crypto majors (${bench}) average about ${avgChange.toFixed(2)}% vs reference (${idxLine}). ${volName} reads ${vol}. This card tracks crypto benchmarks only, not stock indices or single-country equity tape.`
        : asset === "FOREX"
          ? `FX benchmarks (${bench}) average about ${avgChange.toFixed(2)}% vs reference (${idxLine}). ${volName} reads ${vol}. This card tracks major FX and DXY context only, not US or Indian stock markets.`
          : `Tape looks constructive for this asset class: average move across ${bench} is about ${avgChange.toFixed(2)}% (${idxLine}). ${volName} reads ${vol}. Macro backdrop only; your symbol can still diverge.`;
  } else if (sentimentScore < -0.35) {
    sentiment = "bearish";
    description =
      asset === "IN"
        ? "Indian benchmarks are softer on balance; cautious tone."
        : asset === "CRYPTO"
          ? "Large-cap crypto is softer on balance; risk-off lean in majors."
          : asset === "FOREX"
            ? "FX benchmarks skew defensive versus the reference close."
            : "US benchmarks are down on balance; risk-off tone.";
    detail = `Pressure in ${bench}: average move near ${avgChange.toFixed(2)}% (${idxLine}). ${volName} at ${vol} usually lines up with wider intraday ranges. Your specific ticker can still ignore this if it has its own catalyst.`;
  } else {
    sentiment = "neutral";
    description =
      asset === "CRYPTO"
        ? "Crypto majors mixed; no clean one-way lean."
        : asset === "FOREX"
          ? "FX majors mixed; no clean one-way lean."
          : "Mixed or flat benchmark moves; no strong broad directional edge.";
    detail = `Benchmarks are near unchanged on average (${avgChange.toFixed(2)}%; ${idxLine}). If prints look stuck at 0.00%, quotes may be between sessions or delayed. ${volName} ${vol} suggests ${
      vol >= 22 ? "elevated" : "moderate"
    } stress for this asset class. Use your symbol’s own setup, not only this strip.`;
  }

  return { sentiment, score: Math.round(sentimentScore * 100) / 100, description, detail };
}

function generateTradingRecommendation(
  sentiment: { sentiment: string; description: string },
  vol: number,
  asset: AssetClass,
): {
  recommendation: "favorable" | "caution" | "avoid";
  message: string;
  detail: string;
} {
  const region =
    asset === "IN"
      ? "Indian equity"
      : asset === "CRYPTO"
        ? "crypto"
        : asset === "FOREX"
          ? "FX"
          : "US equity";

  const volHot = asset === "CRYPTO" || asset === "FOREX" ? vol > 42 : vol > 30;
  const volCalm = asset === "CRYPTO" || asset === "FOREX" ? vol < 18 : vol < 20;
  const volElevated = asset === "CRYPTO" || asset === "FOREX" ? vol > 24 : vol > 20;

  if (volHot) {
    return {
      recommendation: "avoid",
      message: "High volatility detected. Consider waiting for stabilization.",
      detail:
        asset === "US" || asset === "IN"
          ? `${region} vol gauge is hot (${vol}). That punishes oversized leverage and very tight stops. Pair this with your symbol; some names still trend in stress.`
          : `${region} tape stress is elevated (${vol} on our scaled read). Spreads and gaps matter; size down until the tape calms.`,
    };
  }

  if (sentiment.sentiment === "bullish" && volCalm) {
    return {
      recommendation: "favorable",
      message: "Constructive backdrop for this asset class.",
      detail: `Calmer ${region} context with stress under control (${vol}). ${sentiment.description} Favorable backdrop is not the same as risk free.`,
    };
  }

  if (sentiment.sentiment === "bearish" && volElevated) {
    return {
      recommendation: "caution",
      message: "Elevated risk for this asset class.",
      detail: `Softer benchmarks plus stress ${vol} argue for defensive sizing or patience. This strip matches ${region} only; your symbol analysis can still disagree.`,
    };
  }

  return {
    recommendation: "caution",
    message: "Mixed signals. Use careful sizing.",
    detail: `No clean risk-on or risk-off label for ${region} right now. Wait for confirmation rather than forcing size. Refresh if quotes looked stale at 0.00%.`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let bodySymbol: string | undefined;
    try {
      const b = await req.json();
      bodySymbol = typeof b?.symbol === "string" ? b.symbol : undefined;
    } catch {
      bodySymbol = undefined;
    }

    const asset = detectAssetClass(bodySymbol);
    console.log(`🌍 Fetching market conditions (${asset})…`);

    let indices: Awaited<ReturnType<typeof fetchMarketIndicesFor>>;
    let vixData: { value: number; status: string };

    if (asset === "IN") {
      [vixData, indices] = await Promise.all([
        fetchIndiaVol(),
        fetchMarketIndicesFor(IN_INDEX_DEFS),
      ]);
    } else if (asset === "US") {
      [vixData, indices] = await Promise.all([
        fetchVolGauge("^VIX"),
        fetchMarketIndicesFor(US_INDEX_DEFS),
      ]);
    } else if (asset === "CRYPTO") {
      indices = await fetchMarketIndicesFor(CRYPTO_BENCH_DEFS);
      vixData = stressFromIndices(indices, "CRYPTO");
    } else {
      indices = await fetchMarketIndicesFor(FOREX_BENCH_DEFS);
      vixData = stressFromIndices(indices, "FOREX");
    }

    const marketSentiment = calculateMarketSentiment(indices, vixData.value, asset);
    const tradingRecommendation = generateTradingRecommendation(marketSentiment, vixData.value, asset);
    const isSafeToTrade = tradingRecommendation.recommendation === "favorable";

    const vixLabel =
      asset === "IN"
        ? "India VIX"
        : asset === "CRYPTO"
          ? "Crypto tape stress (majors)"
          : asset === "FOREX"
            ? "FX tape stress (majors)"
            : "US VIX (CBOE)";
    const vixDetail =
      asset === "IN"
        ? `India VIX measures expected near term volatility on the Nifty option surface, not direction. At ${vixData.value}, conditions read as ${vixData.status}. Use it to scale size and stop width, not as a timing oracle.`
        : asset === "CRYPTO"
          ? `This score scales from Bitcoin, Ethereum, and Solana 1d moves (average absolute % change), not US VIX. At ${vixData.value}, conditions read as ${vixData.status}. Crypto gaps on headlines; treat as backdrop for your coin.`
          : asset === "FOREX"
            ? `This score scales from DXY, EUR/USD, and GBP/USD 1d moves (average absolute % change). At ${vixData.value}, conditions read as ${vixData.status}. It is macro FX tone, not your exact pair’s pip risk.`
            : `VIX reflects expected S&P 500 volatility from options, not stock direction. At ${vixData.value}, conditions read as ${vixData.status}. Use it to scale position size and stop width, not as a buy or sell timer by itself.`;

    const response = {
      timestamp: new Date().toISOString(),
      market: asset,
      symbolContext: bodySymbol ?? null,

      vix: {
        label: vixLabel,
        value: vixData.value,
        status: vixData.status,
        interpretation:
          vixData.status === "low"
            ? "Low fear - Market calm"
            : vixData.status === "normal"
              ? "Normal volatility"
              : vixData.status === "elevated"
                ? "Elevated fear"
                : "High fear - Market stressed",
        detail: vixDetail,
      },

      indices,

      sentiment: {
        overall: marketSentiment.sentiment,
        score: marketSentiment.score,
        description: marketSentiment.description,
        detail: marketSentiment.detail,
        emoji:
          marketSentiment.sentiment === "bullish" ? "📈" : marketSentiment.sentiment === "bearish" ? "📉" : "➡️",
      },

      recommendation: {
        level: tradingRecommendation.recommendation,
        message: tradingRecommendation.message,
        detail: tradingRecommendation.detail,
        isSafeToTrade,
      },

      newsImpact: {
        score: "medium",
        description: "Macro headline dial for this dashboard strip",
        detail:
          "Placeholder macro dial on this card. For your symbol, use Recent Headlines (NewsData, MarketAux, Finnhub, Yahoo, Google RSS when configured).",
      },
    };

    console.log("✅ Market conditions fetched:", {
      market: response.market,
      sentiment: response.sentiment.overall,
      vix: response.vix.value,
      safe: response.recommendation.isSafeToTrade,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching market conditions:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: "Internal server error", details: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
