import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchGeminiGroundedNewsItems } from "../_shared/geminiGroundedNews.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsItem {
  time: string;
  source: string;
  headline: string;
  sentiment_score: number;
  novelty: string;
  relevance: string;
  /** Publisher URL when the upstream API provides one */
  url?: string;
}

function stripExchangeSuffix(sym: string): string {
  return sym
    .replace(/\.(NS|BO|NSE|BSE)$/i, "")
    .replace(/^NSE:/i, "")
    .replace(/^BSE:/i, "")
    .trim();
}

function searchQueryForNews(symbol: string): string {
  const base = stripExchangeSuffix(symbol).replace(/\./g, " ");
  return `${base} stock OR ${base} shares OR ${base} company`;
}

async function fetchFinnhubNews(symbol: string): Promise<NewsItem[]> {
  const token = Deno.env.get("FINNHUB_API_KEY");
  if (!token) return [];
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 14);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const url =
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .slice(0, 15)
      .map((item: Record<string, unknown>) => ({
        time: item.datetime
          ? new Date((item.datetime as number) * 1000).toISOString()
          : new Date().toISOString(),
        source: (item.source as string) || "Finnhub",
        headline: (item.headline as string) || (item.summary as string) || "",
        sentiment_score: typeof item.sentiment === "number" ? (item.sentiment as number) : 0,
        novelty: "Company news",
        relevance: "1.0",
        url:
          typeof item.url === "string" && (item.url as string).startsWith("http")
            ? (item.url as string)
            : undefined,
      }))
      .filter((n: NewsItem) => n.headline.length > 5);
  } catch (e) {
    console.error("Finnhub news error:", e);
    return [];
  }
}

async function fetchNewsDataSymbol(symbol: string): Promise<NewsItem[]> {
  const key = Deno.env.get("NEWSDATA_API_KEY");
  if (!key) return [];
  const q = stripExchangeSuffix(symbol);
  try {
    const url =
      `https://newsdata.io/api/1/news?apikey=${key}&q=${encodeURIComponent(q)}&language=en&size=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "success" || !Array.isArray(data.results)) return [];
    return data.results.map((article: Record<string, unknown>) => ({
      time: article.pubDate
        ? new Date(article.pubDate as string).toISOString()
        : new Date().toISOString(),
      source: (article.source_id as string) || "NewsData.io",
      headline: (article.title as string) || "",
      sentiment_score: 0,
      novelty: Array.isArray(article.category) ? String(article.category[0]) : "News",
      relevance: "0.9",
      url:
        typeof article.link === "string" && (article.link as string).startsWith("http")
          ? (article.link as string)
          : undefined,
    }));
  } catch (e) {
    console.error("NewsData error:", e);
    return [];
  }
}

async function fetchMarketAuxSymbol(symbol: string): Promise<NewsItem[]> {
  const key = Deno.env.get("MARKETAUX_API_KEY") || Deno.env.get("MARKET_AUX_API");
  if (!key) return [];
  const clean = stripExchangeSuffix(symbol);
  try {
    const url =
      `https://api.marketaux.com/v1/news/all?symbols=${encodeURIComponent(clean)}&api_token=${key}&limit=12&language=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = data.data || [];
    return rows.map((article: Record<string, unknown>) => ({
      time: (article.published_at as string) || new Date().toISOString(),
      source: (article.source as string) || "MarketAux",
      headline: (article.title as string) || "",
      sentiment_score:
        typeof article.sentiment === "number" && (article.sentiment as number) !== 0
          ? (article.sentiment as number)
          : typeof article.sentiment_score === "number"
            ? (article.sentiment_score as number)
            : 0,
      novelty: "Markets",
      relevance: "0.95",
      url:
        typeof article.url === "string" && (article.url as string).startsWith("http")
          ? (article.url as string)
          : undefined,
    }));
  } catch (e) {
    console.error("MarketAux error:", e);
    return [];
  }
}

function decodeXmlText(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

async function fetchGoogleNewsRSS(symbol: string): Promise<NewsItem[]> {
  try {
    const indian = /\.(NS|BO)$/i.test(symbol) || /NSE:|BSE:/i.test(symbol);
    const q = encodeURIComponent(searchQueryForNews(symbol));
    const gl = indian ? "IN" : "US";
    const ceid = indian ? "IN:en" : "US:en";
    const url = `https://news.google.com/rss/search?q=${q}&hl=en&gl=${gl}&ceid=${ceid}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: NewsItem[] = [];
    const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml))) {
      const block = m[1];
      const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkM = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const pubM = block.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i);
      const title = titleM ? decodeXmlText(titleM[1]) : "";
      const link = linkM ? decodeXmlText(linkM[1]) : "";
      const pub = pubM ? pubM[1].trim() : "";
      if (!title || !link) continue;
      out.push({
        time: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        source: "Google News (RSS)",
        headline: title,
        sentiment_score: 0,
        novelty: "Search",
        relevance: "0.7",
        url: link.startsWith("http") ? link : undefined,
      });
      if (out.length >= 12) break;
    }
    return out;
  } catch (e) {
    console.error("Google RSS error:", e);
    return [];
  }
}

// Enhanced news fetching: real APIs first, Google RSS if empty (no synthetic headlines)
async function fetchEnhancedNewsData(symbol: string): Promise<NewsItem[]> {
  const newsItems: NewsItem[] = [];

  try {
    const geminiNews = await fetchGeminiGroundedNewsItems(symbol, 8);
    if (geminiNews.length) {
      newsItems.push(...geminiNews);
      console.log(`Gemini Search: ${geminiNews.length} grounded items for ${symbol}`);
    }

    const finn = await fetchFinnhubNews(symbol);
    if (finn.length) {
      newsItems.push(...finn);
      console.log(`Finnhub: ${finn.length} for ${symbol}`);
    }

    const nd = await fetchNewsDataSymbol(symbol);
    if (nd.length) {
      newsItems.push(...nd);
      console.log(`NewsData: ${nd.length} for ${symbol}`);
    }

    const mx = await fetchMarketAuxSymbol(symbol);
    if (mx.length) {
      newsItems.push(...mx);
      console.log(`MarketAux: ${mx.length} for ${symbol}`);
    }

    const alphaVantageNews = await fetchAlphaVantageNews(symbol);
    if (alphaVantageNews.length > 0) {
      newsItems.push(...alphaVantageNews);
      console.log(`Alpha Vantage: ${alphaVantageNews.length} news items for ${symbol}`);
    }

    const yahooNews = await fetchYahooFinanceNews(symbol);
    if (yahooNews.length > 0) {
      newsItems.push(...yahooNews);
      console.log(`Yahoo Finance: ${yahooNews.length} news items for ${symbol}`);
    }

    const marketWatchNews = await fetchMarketWatchNews(symbol);
    if (marketWatchNews.length > 0) {
      newsItems.push(...marketWatchNews);
      console.log(`MarketWatch: ${marketWatchNews.length} news items for ${symbol}`);
    }

    let uniqueNews = removeDuplicateNews(newsItems);
    if (uniqueNews.length === 0) {
      const rss = await fetchGoogleNewsRSS(symbol);
      uniqueNews = removeDuplicateNews(rss);
      console.log(`Google RSS only: ${uniqueNews.length} for ${symbol}`);
    }

    const sortedNews = uniqueNews.sort((a, b) => {
      const au = a.url?.startsWith("http") ? 1 : 0;
      const bu = b.url?.startsWith("http") ? 1 : 0;
      if (au !== bu) return bu - au;
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });
    console.log(`Total unique news items for ${symbol}: ${sortedNews.length}`);
    return sortedNews.slice(0, 20);
  } catch (error) {
    console.error("Error in enhanced news fetching:", error);
    const rss = await fetchGoogleNewsRSS(symbol);
    return rss
      .sort((a, b) => {
        const au = a.url?.startsWith("http") ? 1 : 0;
        const bu = b.url?.startsWith("http") ? 1 : 0;
        if (au !== bu) return bu - au;
        return new Date(b.time).getTime() - new Date(a.time).getTime();
      })
      .slice(0, 20);
  }
}

// Alpha Vantage news
async function fetchAlphaVantageNews(symbol: string): Promise<NewsItem[]> {
  try {
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    if (!alphaVantageKey) {
      return [];
    }

    const tickers = [symbol];
    const u = symbol.toUpperCase();
    const base = stripExchangeSuffix(symbol);
    if (u.endsWith('.NS')) tickers.push(`${base}.NSE`);
    if (u.endsWith('.BO')) tickers.push(`${base}.BSE`);

    const mapFeed = (data: { feed?: unknown[] }) => {
      if (!data.feed || !Array.isArray(data.feed)) return [] as NewsItem[];
      return data.feed.slice(0, 10).map((item: Record<string, unknown>) => ({
        time: (item.time_published as string) || new Date().toISOString(),
        source: (item.source as string) || 'Alpha Vantage',
        headline: (item.title as string) || '',
        sentiment_score: parseFloat(String(item.overall_sentiment_score)) || 0,
        novelty: (item.topics as { topic?: string }[])?.[0]?.topic || 'General',
        relevance: String((item.ticker_sentiment as { relevance_score?: string }[])?.[0]?.relevance_score ?? '0.0'),
        url: typeof item.url === 'string' && (item.url as string).startsWith('http') ? (item.url as string) : undefined,
      }));
    };

    const out: NewsItem[] = [];
    for (const t of [...new Set(tickers)]) {
      const response = await fetch(
        `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(t)}&apikey=${alphaVantageKey}&limit=20`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!response.ok) continue;
      const data = await response.json();
      out.push(...mapFeed(data));
      if (out.length >= 8) break;
    }
    return out;
  } catch (error) {
    console.error('Alpha Vantage news error:', error);
    return [];
  }
}

// Yahoo Finance News
async function fetchYahooFinanceNews(symbol: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d&includePrePost=false&events=news`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    
    if (data.chart?.result?.[0]?.news) {
      return data.chart.result[0].news.map((item: any) => {
        const link =
          typeof item.link === 'string'
            ? item.link
            : typeof item.clickThroughUrl === 'string'
              ? item.clickThroughUrl
              : undefined;
        const url = link?.startsWith('http') ? link : undefined;
        return {
          time: new Date(item.providerPublishTime * 1000).toISOString(),
          source: item.publisher || 'Yahoo Finance',
          headline: item.title || '',
          sentiment_score: 0,
          novelty: 'Market News',
          relevance: '1.0',
          url,
        };
      });
    }
    
    return [];
  } catch (error) {
    console.error('Yahoo Finance news error:', error);
    return [];
  }
}

// MarketWatch News
async function fetchMarketWatchNews(symbol: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(
      `https://www.marketwatch.com/investing/stock/${symbol.toLowerCase()}/news`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    
    const headlineMatches = html.match(/<h3[^>]*>([^<]+)<\/h3>/g);
    if (headlineMatches) {
      return headlineMatches.slice(0, 5).map((match: string) => {
        const headline = match.replace(/<[^>]*>/g, '').trim();
        return {
          time: new Date().toISOString(),
          source: 'MarketWatch',
          headline: headline,
          sentiment_score: 0,
          novelty: 'Market News',
          relevance: '0.8'
        };
      });
    }
    
    return [];
  } catch (error) {
    console.error('MarketWatch news error:', error);
    return [];
  }
}

// Remove duplicate news items
function removeDuplicateNews(newsItems: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return newsItems.filter((item) => {
    const key =
      item.url && item.url.startsWith("http")
        ? item.url
        : `${item.headline.toLowerCase().slice(0, 50)}-${item.source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Serve the news analysis endpoint
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol } = await req.json();
    
    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching enhanced news for ${symbol}`);
    
    const newsData = await fetchEnhancedNewsData(symbol);
    
    // Calculate overall sentiment
    const overallSentiment = newsData.length > 0 
      ? newsData.reduce((sum, item) => sum + item.sentiment_score, 0) / newsData.length
      : 0;
    
    // Categorize news by sentiment
    const positiveNews = newsData.filter(item => item.sentiment_score > 0.3);
    const negativeNews = newsData.filter(item => item.sentiment_score < -0.3);
    const neutralNews = newsData.filter(item => item.sentiment_score >= -0.3 && item.sentiment_score <= 0.3);
    
    const withUrl = newsData.filter((n) => n.url && n.url.startsWith("http")).length;
    const geminiRows = newsData.filter((n) => (n.source || "").includes("Gemini Search")).length;
    const summaryLines =
      newsData.length > 0
        ? [
            `Parsed ${newsData.length} headline(s) for ${symbol}: ${positiveNews.length} scored positive, ${negativeNews.length} negative, ${neutralNews.length} neutral.`,
            `Aggregate tone is ${overallSentiment > 0.05 ? "slightly positive" : overallSentiment < -0.05 ? "slightly negative" : "near neutral"} (${overallSentiment.toFixed(2)} on a rough -1 to +1 scale).`,
            geminiRows > 0
              ? `${geminiRows} row(s) used Gemini with Google Search grounding (real URLs when the API returns citation chunks).`
              : "",
            withUrl > 0
              ? `${withUrl} item(s) open to a publisher page in a new tab.`
              : "Few or no direct URLs in this batch. Set GEMINI_API_KEY for search-grounded links, or add NewsData, MarketAux, or Finnhub.",
            "News shapes sentiment in the model; it does not replace chart or liquidity risk.",
          ]
            .filter(Boolean)
            .join(" ")
        : "No recent news found";

    const result = {
      symbol,
      totalNews: newsData.length,
      overallSentiment: Math.round(overallSentiment * 100) / 100,
      sentimentBreakdown: {
        positive: positiveNews.length,
        negative: negativeNews.length,
        neutral: neutralNews.length
      },
      newsItems: newsData,
      sources: [...new Set(newsData.map(item => item.source))],
      lastUpdated: new Date().toISOString(),
      analysis: {
        summary: summaryLines,
        confidence: newsData.length >= 5 ? 'high' : newsData.length >= 2 ? 'medium' : 'low',
        coverage: newsData.length > 0 ? 'comprehensive' : 'limited'
      }
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in news analysis:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to analyze news',
        message: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});