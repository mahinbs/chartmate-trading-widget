/**
 * Gemini generateContent with Google Search grounding → news rows with real URLs.
 * Uses GEMINI_API_KEY. Model must support the google_search tool (see ai.google.dev).
 */

export type GroundedNewsRow = {
  time: string;
  source: string;
  headline: string;
  sentiment_score: number;
  novelty: string;
  relevance: string;
  url?: string;
};

function seedHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function searchBlurbForSymbol(symbol: string): string {
  const u = symbol.toUpperCase();
  if (u.endsWith(".NS") || u.endsWith(".BO")) {
    const base = u.replace(/\.(NS|BO)$/i, "").replace(/[^A-Z0-9]/g, " ");
    return `Indian listed company ${base} (NSE/BSE ticker ${symbol}). Search English and Indian business press.`;
  }
  if (/-(USD|USDT|USDC)$/i.test(symbol) || /(BTC|ETH|SOL|XRP)/i.test(symbol)) {
    return `Cryptocurrency / digital asset ${symbol}. Search crypto and mainstream finance outlets.`;
  }
  if (/=X$/i.test(symbol) || /^[A-Z]{6}$/.test(u.replace(/[^A-Z]/g, ""))) {
    return `Foreign exchange pair or instrument ${symbol}. Search FX and macro news that would move this market.`;
  }
  return `US or global listed instrument ${symbol}. Search reputable financial news.`;
}

/** Prefer gemini-2.5-flash for search grounding (fast, documented support). */
const GROUNDING_MODEL = "gemini-2.5-flash";

export async function fetchGeminiGroundedNewsItems(symbol: string, limit = 8): Promise<GroundedNewsRow[]> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return [];

  const focus = searchBlurbForSymbol(symbol);
  const prompt =
    `Use Google Search. Find up to ${limit} distinct, recent (last 14 days) news stories that materially relate to: ${focus}\n` +
    `Requirements: only include stories you can attribute to a real publisher page. Prefer primary sources (Reuters, Bloomberg, company IR, exchange filings, Economic Times, Moneycontrol for India, CoinDesk for crypto, etc.).\n` +
    `In your answer, write 2 short sentences summarizing the overall tone, then the rest must be grounded in what you found.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GROUNDING_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        }),
      },
    );

    if (!res.ok) {
      console.error("Gemini grounded news HTTP", res.status, await res.text());
      return [];
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const meta = candidate?.groundingMetadata ?? candidate?.grounding_metadata;
    const chunks: Array<{ web?: { uri?: string; title?: string } }> =
      meta?.groundingChunks ?? meta?.grounding_chunks ?? [];
    const supports: Array<{
      segment?: { text?: string };
      groundingChunkIndices?: number[];
      grounding_chunk_indices?: number[];
    }> = meta?.groundingSupports ?? meta?.grounding_supports ?? [];

    const byUri = new Map<string, { uri: string; source: string; headline: string }>();

    for (const sup of supports) {
      const text = (sup.segment?.text || "").trim().replace(/\s+/g, " ");
      if (text.length < 24) continue;
      const idxs = sup.groundingChunkIndices ?? sup.grounding_chunk_indices ?? [];
      for (const idx of idxs) {
        const w = chunks[idx]?.web;
        const uri = w?.uri;
        if (!uri || !uri.startsWith("http")) continue;
        const domain = (w.title || "").replace(/^www\./i, "") || "News";
        const headline = text.length > 180 ? `${text.slice(0, 177)}…` : text;
        const prev = byUri.get(uri);
        if (!prev || headline.length > prev.headline.length) {
          byUri.set(uri, { uri, source: domain, headline });
        }
      }
    }

    if (byUri.size === 0) {
      for (const ch of chunks) {
        const w = ch.web;
        const uri = w?.uri;
        if (!uri || !uri.startsWith("http")) continue;
        const domain = (w.title || "News").replace(/^www\./i, "");
        const headline = `Story indexed from ${domain}`;
        if (!byUri.has(uri)) byUri.set(uri, { uri, source: domain, headline });
      }
    }

    const h = seedHash(symbol);
    const out: GroundedNewsRow[] = [...byUri.values()].map((row, i) => ({
      time: new Date(Date.now() - (i * 37 + (h % 120)) * 60 * 1000).toISOString(),
      source: `Gemini Search · ${row.source}`,
      headline: row.headline,
      sentiment_score: 0,
      novelty: "Grounded web",
      relevance: "1",
      url: row.uri,
    }));

    return out.slice(0, limit);
  } catch (e) {
    console.error("fetchGeminiGroundedNewsItems:", e);
    return [];
  }
}
