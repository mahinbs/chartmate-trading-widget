import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, interval = "1d", range = "3mo" } = await req.json();

    if (!symbol) {
      return new Response(JSON.stringify({ error: "symbol required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VALID_INTERVALS = ["1m","2m","5m","15m","30m","60m","1h","1d","5d","1wk","1mo","3mo"];
    const VALID_RANGES    = ["1d","5d","1mo","3mo","6mo","1y","2y","5y","10y","ytd","max"];
    const safeInterval = VALID_INTERVALS.includes(interval) ? interval : "1d";
    const safeRange    = VALID_RANGES.includes(range) ? range : "3mo";

    // Intraday intervals need their full Unix timestamp preserved,
    // otherwise all candles collapse to the same date string.
    const INTRADAY = new Set(["1m","2m","5m","15m","30m","60m","90m","1h"]);
    const isIntraday = INTRADAY.has(safeInterval);

    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=${safeInterval}&range=${safeRange}&includePrePost=false`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}`);
    }

    const raw = await response.json();
    const result = raw?.chart?.result?.[0];

    if (!result) {
      return new Response(JSON.stringify({ error: "No data", candles: [], meta: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens:   number[] = quote.open   || [];
    const highs:   number[] = quote.high   || [];
    const lows:    number[] = quote.low    || [];
    const closes:  number[] = quote.close  || [];
    const volumes: number[] = quote.volume || [];
    const adjClose: number[] = result.indicators?.adjclose?.[0]?.adjclose || closes;

    const candles = timestamps.map((ts, i) => ({
      // Intraday → return raw Unix seconds (LWC UTCTimestamp) so each bar
      // keeps its exact minute/hour. Daily+ → "YYYY-MM-DD" business-day string.
      time: isIntraday
        ? ts
        : new Date(ts * 1000).toISOString().split("T")[0],
      open:     opens[i]   ?? null,
      high:     highs[i]   ?? null,
      low:      lows[i]    ?? null,
      close:    closes[i]  ?? null,
      volume:   volumes[i] ?? null,
      adjClose: adjClose[i] ?? closes[i] ?? null,
    })).filter((c) => c.close !== null);

    const meta = {
      symbol:             result.meta?.symbol,
      currency:           result.meta?.currency,
      exchangeName:       result.meta?.exchangeName,
      instrumentType:     result.meta?.instrumentType,
      regularMarketPrice: result.meta?.regularMarketPrice,
      previousClose:      result.meta?.previousClose ?? result.meta?.chartPreviousClose,
      regularMarketTime:  result.meta?.regularMarketTime,
      timezone:           result.meta?.timezone,
    };

    return new Response(JSON.stringify({ candles, meta }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("get-chart-data error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error", candles: [], meta: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
