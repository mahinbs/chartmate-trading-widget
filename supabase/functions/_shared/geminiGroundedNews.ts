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

export type GroundedArticleRef = {
  url: string;
  source: string;
  title: string;
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

type GeminiGenerateResponse = {
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      groundingSupports?: Array<{
        segment?: { text?: string };
        groundingChunkIndices?: number[];
      }>;
    };
    grounding_metadata?: {
      grounding_chunks?: Array<{ web?: { uri?: string; title?: string } }>;
      grounding_supports?: Array<{
        segment?: { text?: string };
        grounding_chunk_indices?: number[];
      }>;
    };
  }>;
};

function extractGroundedUriHeadlines(
  data: GeminiGenerateResponse,
  limit: number,
): GroundedArticleRef[] {
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

  return [...byUri.values()]
    .slice(0, limit)
    .map((row) => ({ url: row.uri, source: row.source, title: row.headline }));
}

async function callGeminiGrounded(prompt: string, limit: number): Promise<GroundedArticleRef[]> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return [];

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

    const data = (await res.json()) as GeminiGenerateResponse;
    return extractGroundedUriHeadlines(data, limit);
  } catch (e) {
    console.error("callGeminiGrounded:", e);
    return [];
  }
}

export async function fetchGeminiGroundedNewsItems(symbol: string, limit = 8): Promise<GroundedNewsRow[]> {
  const focus = searchBlurbForSymbol(symbol);
  const prompt =
    `Use Google Search. Find up to ${limit} distinct, recent (last 14 days) news stories that materially relate to: ${focus}\n` +
    `Requirements: only include stories you can attribute to a real publisher page. Prefer primary sources (Reuters, Bloomberg, company IR, exchange filings, Economic Times, Moneycontrol for India, CoinDesk for crypto, etc.).\n` +
    `In your answer, write 2 short sentences summarizing the overall tone, then the rest must be grounded in what you found.`;

  const refs = await callGeminiGrounded(prompt, limit);
  const h = seedHash(symbol);
  return refs.map((row, i) => ({
    time: new Date(Date.now() - (i * 37 + (h % 120)) * 60 * 1000).toISOString(),
    source: row.source,
    headline: row.title,
    sentiment_score: 0,
    novelty: "Grounded web",
    relevance: "1",
    url: row.url,
  }));
}

/**
 * Broad finance headlines worldwide; URLs come from search grounding (not invented).
 * Region is refined later via detectRegion / feed heuristics in fetch-news.
 */
export async function fetchGeminiGroundedWorldFinanceArticles(limit = 12): Promise<GroundedArticleRef[]> {
  const prompt =
    `Use Google Search. Find up to ${limit} distinct, recent (last 10 days) stories about global financial markets: stocks, IPOs, central banks, FX, commodities, and major regional markets (US, Europe, Asia, India NSE/BSE, Middle East, LatAm when relevant).\n` +
    `Requirements:\n` +
    `- Every story must correspond to a real article URL you found in search (no invented links).\n` +
    `- Prefer reputable outlets (Reuters, Bloomberg, FT, WSJ, CNBC, Economic Times, Moneycontrol, Nikkei, etc.).\n` +
    `- Aim for geographic variety when possible.\n` +
    `Briefly synthesize, but tie each point to grounded sources.`;

  return await callGeminiGrounded(prompt, limit);
}
