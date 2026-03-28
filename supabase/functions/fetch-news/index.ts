import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";
import { fetchGeminiGroundedWorldFinanceArticles } from "../_shared/geminiGroundedNews.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * India-first RSS (Moneycontrol, ET markets, Google Nifty) — strong NSE/global overlap, real URLs.
 * Plus one Google finance RSS per ISO2 for other regions. NewsPage filters by user IP country.
 */
const INDIA_PRIORITY_RSS: { url: string; region: string }[] = [
  { url: "https://www.moneycontrol.com/rss/MCtopnews.xml", region: "IN" },
  { url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", region: "IN" },
  {
    url: "https://news.google.com/rss/search?q=nifty+50&hl=en-IN&gl=IN&ceid=IN:en",
    region: "IN",
  },
];

/**
const GOOGLE_FINANCE_RSS_Q = encodeURIComponent(
  "stock market OR IPO OR earnings OR finance OR shares OR forex",
);

function googleRegionalFinanceRssUrl(iso2: string): string {
  const gl = iso2.toUpperCase();
  return `https://news.google.com/rss/search?q=${GOOGLE_FINANCE_RSS_Q}&hl=en&gl=${gl}&ceid=${gl}:en`;
}

/** Exclude IN — covered by INDIA_PRIORITY_RSS (MC, ET, Nifty Google). */
const NEWS_RSS_ISO2_REGIONS = [
  "AE", "AU", "BR", "CA", "CH", "DE", "EG", "ES", "FR", "GB", "HK", "ID",
  "IT", "JP", "KR", "MX", "MY", "NG", "NL", "NZ", "PH", "PL", "SA",
  "SE", "SG", "TH", "TR", "TW", "US", "VN", "ZA",
] as const;

const REGIONAL_RSS_FEEDS: { url: string; region: string }[] = [
  ...INDIA_PRIORITY_RSS,
  ...NEWS_RSS_ISO2_REGIONS.map((region) => ({
    url: googleRegionalFinanceRssUrl(region),
    region,
  })),
];

/** Cross-border / macro — stored as GLOBAL (Regional tab uses user ISO2, not these). */
const GLOBAL_RSS = [
  `https://news.google.com/rss/search?q=${encodeURIComponent(
    "global markets OR IMF OR World Bank OR OPEC OR geopolitics OR central bank",
  )}&hl=en&gl=US&ceid=US:en`,
];

const MARKET_KEYWORDS = [
  "stock", "NSE", "BSE", "Nifty", "Sensex", "NASDAQ", "S&P 500", "IPO",
  "earnings", "dividend", "buyback", "stock split", "broker upgrade",
  "inflation", "federal reserve", "oil prices", "war", "sanctions",
  "Nifty 50", "NIFTY", "bank nifty", "fin nifty", "midcap nifty",
  "nikkei", "hang seng", "kospi", "ftse", "dax", "asx", "sgx", "set index",
  "thailand", "baht", "singapore", "ringgit", "klci", "bursa", "rupiah",
  "jakarta", "forex", "equities", "shares", "bond yield", "gdp",
];

const GLOBAL_KEYWORDS = [
  "fed", "federal reserve", "us stock", "wall street", "dow jones", "nasdaq", "s&p 500", 
  "dollar", "iran", "israel", "war", "sanctions", "oil prices", "brent", "global markets",
  "white house", "middle east", "ukraine", "russia"
];

const IN_KEYWORDS = [
  "nifty", "sensex", "nifty 50", "nse", "bse", "rbi", "rupee", "inr", "sebi",
  "reliance", "hdfc", "infosys", "tcs", "adani", "modi", "finmin", "gst",
  "india", "indian", "mumbai",
];

/** Text overrides when the story clearly belongs to a market (refine API/RSS default). */
const REGION_KEYWORD_HINTS: { code: string; keywords: string[] }[] = [
  {
    code: "TH",
    keywords: [
      "thailand",
      "thai ",
      " baht",
      "baht ",
      "set index",
      "the set",
      " bangkok",
      "ptt ",
      " scb ",
    ],
  },
  { code: "SG", keywords: ["singapore", "sgx", "sing dollar", "dbs bank", "temasek"] },
  { code: "MY", keywords: ["malaysia", "klci", "ringgit", "bursa malaysia"] },
  { code: "ID", keywords: ["indonesia", "jakarta", "rupiah", "idx composite"] },
  { code: "VN", keywords: ["vietnam", "ho chi minh", "vn index", "vnm"] },
  { code: "PH", keywords: ["philippines", "psei", "manila"] },
  { code: "HK", keywords: ["hong kong", "hang seng", " hsi ", "hkex"] },
  { code: "TW", keywords: ["taiwan", "taiex", "taipei"] },
  { code: "KR", keywords: ["south korea", "kospi", "kosdaq", " korea "] },
  { code: "JP", keywords: ["japan", "nikkei", "jpx", "tokyo stock", "topix"] },
  { code: "AU", keywords: ["australia", "asx", "australian dollar", "sydney stock"] },
  { code: "GB", keywords: ["ftse", "london stock", "uk gilt", "pound sterling", " ftse "] },
  { code: "DE", keywords: ["dax", "frankfurt", "germany", "deutsche"] },
  { code: "FR", keywords: ["cac 40", "paris stock", "euronext paris"] },
  { code: "CA", keywords: ["tsx", "toronto stock", "canada", "s&p/tsx"] },
  { code: "BR", keywords: ["bovespa", "brazil", "sao paulo stock"] },
  { code: "AE", keywords: ["dubai", "adf", "abu dhabi", "uae market"] },
  { code: "SA", keywords: ["tadawul", "saudi", "riyadh"] },
  { code: "ZA", keywords: ["johannesburg", "jse ", "south africa"] },
  { code: "IN", keywords: IN_KEYWORDS },
];

const INVALID_PATTERNS = [
  "/slideshow/",
  "/videoshow/",
  "/photo/",
  "/liveblog/",
  "/gallery/",
  "/audio/",
  "/video/"
];

function isCleanUrl(url: string): boolean {
  return !INVALID_PATTERNS.some(pattern => url.includes(pattern));
}

async function resolveUrl(url: string, hops = 3): Promise<{ finalUrl: string, html: string, ogImage?: string | null }> {
  let ogImage: string | null = null;
  if (!url.includes("news.google.com")) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const html = res.ok ? await res.text() : "";
      if (html) {
        const $ = cheerio.load(html);
        ogImage = $('meta[property="og:image"]').attr("content") || 
                  $('meta[name="twitter:image"]').attr("content") || null;
      }
      return { finalUrl: res.url, html, ogImage };
    } catch (e) {
      return { finalUrl: url, html: "", ogImage: null };
    }
  }
  
  let currentUrl = url;
  let html = "";
  
  for (let i = 0; i < hops; i++) {
    console.log(`Resolution Hop ${i+1}: ${currentUrl}`);
    try {
      const response = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        redirect: 'follow'
      });
      
      if (!response.ok) break;
      
      currentUrl = response.url;
      html = await response.text();
      
      const metaMatch = html.match(/<meta http-equiv="refresh" [^>]*url=(.*?)["']/i);
      const scriptMatch = html.match(/window\.location\.replace\(["'](.*?)["']\)/i);
      const splashMatch = html.includes('DotsSplashUi') || html.includes('Google News Redirect');
      
      const nextUrl = metaMatch?.[1] || scriptMatch?.[1];
      if (nextUrl && splashMatch) {
        currentUrl = nextUrl;
        if (!currentUrl.startsWith('http')) {
          const base = new URL(url);
          currentUrl = `${base.protocol}//${base.host}${currentUrl.startsWith('/') ? '' : '/'}${currentUrl}`;
        }
        continue;
      }
      if (html) {
        const $ = cheerio.load(html);
        ogImage = $('meta[property="og:image"]').attr("content") || 
                  $('meta[name="twitter:image"]').attr("content") || null;
      }
      break; 
    } catch (e) {
      console.error(`Fetch failed during resolution for ${currentUrl}:`, e);
      break;
    }
  }
  return { finalUrl: currentUrl, html, ogImage };
}

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  image_url: string | null;
  region: string; // ISO Country Code (e.g., 'IN') or 'GLOBAL'
  published_at: string;
  category: string;
  impact_score: number;
  sentiment?: string;
  affected_symbols?: string[];
  author?: string;
  full_content?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const allNews: NewsItem[] = [];

    // 1. Fetch from RSS Feeds (parallel — many regional feeds)
    console.log("Starting RSS ingestion...");
    const regionalBatches = await Promise.all(
      REGIONAL_RSS_FEEDS.map(async ({ url, region }) => {
        const items = await fetchRSS(url, region);
        console.log(`Fetched ${items.length} items from RSS [${region}]: ${url}`);
        return items;
      }),
    );
    for (const batch of regionalBatches) allNews.push(...batch);
    const globalBatches = await Promise.all(
      GLOBAL_RSS.map(async (url) => {
        const items = await fetchRSS(url, "GLOBAL");
        console.log(`Fetched ${items.length} items from Global RSS: ${url}`);
        return items;
      }),
    );
    for (const batch of globalBatches) allNews.push(...batch);

    // 2. Fetch from NewsData.io
    const newsDataKey = Deno.env.get('NEWSDATA_API_KEY');
    if (newsDataKey) {
      console.log("Fetching from NewsData.io...");
      const newsDataItems = await fetchNewsDataIO(newsDataKey);
      console.log(`Fetched ${newsDataItems.length} items from NewsData.io`);
      allNews.push(...newsDataItems);
    }

    // 3. Fetch from Marketaux
    const marketauxKey = Deno.env.get('MARKETAUX_API_KEY');
    if (marketauxKey) {
      console.log("Fetching from Marketaux...");
      const marketauxItems = await fetchMarketaux(marketauxKey);
      console.log(`Fetched ${marketauxItems.length} items from Marketaux`);
      allNews.push(...marketauxItems);
    }

    // 4. Gemini + Google Search grounding — real URLs only (no fabricated articles)
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey) {
      console.log("Fetching Gemini grounded world finance headlines...");
      const geminiRefs = await fetchGeminiGroundedWorldFinanceArticles(12);
      const geminiItems: NewsItem[] = geminiRefs.map((r) => ({
        title: r.title,
        summary: r.title.slice(0, 500),
        source: r.source,
        url: r.url,
        image_url: null,
        region: "GLOBAL",
        published_at: new Date().toISOString(),
        category: "Market News",
        impact_score: 0,
        author: "Gemini (Google Search)",
      }));
      console.log(`Fetched ${geminiItems.length} grounded items from Gemini`);
      allNews.push(...geminiItems);
    }

    console.log(`Total raw news items: ${allNews.length}`);

    // 5. Filtering and Deduplication
    const uniqueNewsMap = new Map<string, NewsItem>();
    for (const item of allNews) {
      if (!isCleanUrl(item.url)) continue;

      const matchesKeywords = MARKET_KEYWORDS.some(keyword => 
        item.title.toLowerCase().includes(keyword.toLowerCase()) || 
        item.summary.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!matchesKeywords) continue;

      // Rule-based classification & scoring (Fast)
      item.category = categorizeNews(item.title + " " + item.summary);
      item.impact_score = calculateImpactScore(item.category, item.title);
      
      // Intelligent Region Detection
      item.region = detectRegion(item.title, item.summary, item.region);

      if (!uniqueNewsMap.has(item.url)) {
        uniqueNewsMap.set(item.url, item);
      }
    }
    
    const uniqueNews = Array.from(uniqueNewsMap.values());
    console.log(`Unique items to process: ${uniqueNews.length}`);

    // 6. DB Check & Shallow Resolution
    const { data: existingUrls } = await supabaseClient
      .from('news')
      .select('url')
      .in('url', uniqueNews.map(n => n.url));
    
    const existingUrlSet = new Set((existingUrls || []).map(n => n.url));
    const newArticles = uniqueNews.filter(n => !existingUrlSet.has(n.url));
    
    console.log(`Processing ${newArticles.length} new articles.`);

    // Batch limit to prevent timeouts even with shallow resolution
    const BATCH_LIMIT = 20;
    const processBatch = newArticles.slice(0, BATCH_LIMIT);
    const finalItems = [];

    for (const item of processBatch) {
      try {
        // Just resolve URL and OG Image (no Gemini here)
        const resolved = await resolveUrl(item.url, 2); // Faster resolution
        item.url = resolved.finalUrl;
        if (resolved.ogImage) item.image_url = resolved.ogImage;
        finalItems.push(item);
      } catch (e) {
        console.error(`Resolution error for ${item.title}:`, e);
        finalItems.push(item);
      }
    }

    // 7. Store in DB
    if (finalItems.length > 0) {
      console.log(`Upserting ${finalItems.length} items to database...`);
      const { error: upsertError } = await supabaseClient
        .from('news')
        .upsert(
          finalItems.map(item => ({
            ...item,
            is_trending: item.impact_score >= 8
          })),
          { onConflict: 'url' }
        );

      if (upsertError) throw upsertError;
    }

    return new Response(JSON.stringify({ success: true, count: finalItems.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error("Edge Function error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchRSS(url: string, region: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    
    const items: NewsItem[] = [];
    const itemMatches = text.match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    for (const itemXml of itemMatches) {
      const title = decodeXML(itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || "");
      const link = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1] || "";
      const description = decodeXML(itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || "");
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || new Date().toISOString();
      
      const source = url.includes("moneycontrol")
        ? "Moneycontrol"
        : url.includes("economictimes")
          ? "Economic Times"
          : "Google News";

      if (!title || !link) continue;

      items.push({
        title: title.trim(),
        summary: description.trim().replace(/<[^>]*>?/gm, '').slice(0, 500),
        url: link.trim(),
        source,
        region,
        published_at: new Date(pubDate).toISOString(),
        image_url: null,
        category: 'Market News',
        impact_score: 0
      });
    }
    return items;
  } catch (e) {
    console.error(`Error fetching RSS ${url}:`, e);
    return [];
  }
}

/** NewsData.io often returns full country names (e.g. `australia`), not ISO2. */
const NEWSDATA_COUNTRY_TO_ISO2: Record<string, string> = {
  australia: "AU",
  india: "IN",
  thailand: "TH",
  singapore: "SG",
  japan: "JP",
  germany: "DE",
  malaysia: "MY",
  indonesia: "ID",
  philippines: "PH",
  vietnam: "VN",
  "hong kong": "HK",
  "south korea": "KR",
  korea: "KR",
  "united states": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  canada: "CA",
  france: "FR",
  brazil: "BR",
  mexico: "MX",
  "new zealand": "NZ",
  taiwan: "TW",
  china: "CN",
  "united arab emirates": "AE",
  "saudi arabia": "SA",
  "south africa": "ZA",
};

function newsDataRegionFromArticle(article: {
  country?: string[];
}): string | null {
  const c = article.country?.[0];
  if (typeof c !== "string") return null;
  const s = c.trim().toLowerCase();
  if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase();
  return NEWSDATA_COUNTRY_TO_ISO2[s] ?? null;
}

async function fetchNewsDataIO(apiKey: string): Promise<NewsItem[]> {
  try {
    const marketQ = encodeURIComponent("stock OR market OR finance OR IPO OR earnings");
    /** One request per country so rows get correct `region` (comma-country is unreliable on some plans). */
    const countryCodes = [
      "ae", "au", "br", "ca", "ch", "de", "eg", "es", "fr", "gb", "hk", "id",
      "in", "it", "jp", "kr", "mx", "my", "ng", "nl", "nz", "ph", "pl", "sa",
      "se", "sg", "th", "tr", "tw", "us", "vn", "za",
    ];
    const urls = countryCodes.map(
      (cc) =>
        `https://newsdata.io/api/1/latest?apikey=${apiKey}&country=${cc}&category=business&q=${marketQ}&language=en&size=25`,
    );
    // Broad theme queries without country (classify via detectRegion)
    urls.push(
      `https://newsdata.io/api/1/latest?apikey=${apiKey}&q=${encodeURIComponent("NASDAQ OR federal reserve OR S&P 500")}&category=business&language=en&size=40`,
    );

    const results: NewsItem[] = [];
    const responses = await Promise.all(urls.map((u) => fetch(u)));

    for (const response of responses) {
      if (!response.ok) continue;
      const data = await response.json();
      if (data.status !== "success" || !data.results) continue;

      for (const article of data.results) {
        const fromApi = newsDataRegionFromArticle(article);
        results.push({
          title: article.title,
          summary: article.description || article.content || "",
          url: article.link,
          source: article.source_id || "NewsData",
          region: fromApi ?? "GLOBAL",
          published_at: new Date(article.pubDate).toISOString(),
          image_url: article.image_url,
          category: "Market News",
          impact_score: 0,
        });
      }
    }
    return results;
  } catch (e) {
    console.error("Error fetching NewsData:", e);
    return [];
  }
}

async function fetchMarketaux(apiKey: string): Promise<NewsItem[]> {
  const countryRank = (c: string | undefined): string | null => {
    if (!c || typeof c !== "string") return null;
    const u = c.toLowerCase();
    if (u.length === 2) return u.toUpperCase();
    return null;
  };

  const mapArticle = (article: any): NewsItem => {
    const entityCountries = (article.entities || [])
      .map((e: any) => countryRank(e.country))
      .filter(Boolean) as string[];
    const primary = entityCountries[0] ?? "GLOBAL";
    return {
      title: article.title,
      summary: article.description || "",
      url: article.url,
      source: article.source || "Marketaux",
      image_url: article.image_url,
      region: primary,
      published_at: article.published_at || new Date().toISOString(),
      sentiment: article.sentiment,
      affected_symbols: article.entities?.map((e: any) => e.symbol).filter(Boolean),
      category: "Market News",
      impact_score: 0,
    };
  };

  try {
    const bases = [
      "ae,au,br,ca,ch,de,eg,es,fr,gb,hk,id,in,it,jp,kr",
      "mx,my,ng,nl,nz,ph,pl,sa,se,sg,th,tr,tw,us,vn,za",
    ];
    const resps = await Promise.all(
      bases.map((countries) =>
        fetch(
          `https://api.marketaux.com/v1/news/all?api_token=${apiKey}&q=stock OR IPO OR earnings&countries=${countries}&language=en`,
        ),
      ),
    );
    const out: NewsItem[] = [];
    for (const res of resps) {
      if (!res.ok) continue;
      const data = await res.json();
      for (const article of data.data || []) out.push(mapArticle(article));
    }
    return out;
  } catch (e) {
    console.error("Error fetching Marketaux:", e);
    return [];
  }
}

function decodeXML(str: string): string {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function categorizeNews(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('ipo') || t.includes('listing')) return 'IPO';
  if (t.includes('dividend') || t.includes('stock split') || t.includes('buyback')) return 'Corporate Action';
  if (t.includes('earnings') || t.includes('results') || t.includes('revenue') || t.includes('quarterly')) return 'Company Results';
  if (t.includes('upgrade') || t.includes('downgrade') || t.includes('brokerage')) return 'Broker News';
  if (t.includes('inflation') || t.includes('rbi') || t.includes('fed ') || t.includes('interest rate')) return 'Macro Economy';
  if (t.includes('war') || t.includes('sanctions') || t.includes('geopolitical')) return 'Geopolitical';
  return 'Market News';
}

function detectRegion(title: string, summary: string, sourceRegion: string): string {
  const text = (title + " " + summary).toLowerCase();
  const upperSource =
    sourceRegion.length === 2 ? sourceRegion.toUpperCase() : sourceRegion;

  for (const { code, keywords } of REGION_KEYWORD_HINTS) {
    if (keywords.some((k) => text.includes(k.toLowerCase()))) {
      return code;
    }
  }

  // Trust RSS/API country (gl= / NewsData / Marketaux) so each locale gets tagged rows automatically.
  if (/^[A-Z]{2}$/.test(upperSource) && upperSource !== "GLOBAL") {
    return upperSource;
  }

  const isGlobal = GLOBAL_KEYWORDS.some((k) => text.includes(k));
  if (isGlobal) return "GLOBAL";

  return "GLOBAL";
}

function calculateImpactScore(category: string, title: string): number {
  let score = 3;
  if (category === 'IPO') score = 10;
  if (category === 'Corporate Action') score = 8;
  if (category === 'Company Results') score = 8;
  if (category === 'Geopolitical') score = 9;
  if (category === 'Macro Economy') score = 9;
  if (category === 'Broker News') score = 6;
  
  const upperTitle = title.toUpperCase();
  if (upperTitle.includes('BREAKING') || upperTitle.includes('URGENT') || upperTitle.includes('CRASH') || upperTitle.includes('SURGE')) {
    score += 1;
  }
  return Math.min(score, 10);
}
