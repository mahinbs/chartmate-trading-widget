import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REGIONAL_RSS = [
  "https://www.moneycontrol.com/rss/MCtopnews.xml",
  "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  "https://news.google.com/rss/search?q=nifty+50&hl=en-IN&gl=IN&ceid=IN:en"
];

const GLOBAL_RSS = [
  "https://news.google.com/rss/search?q=stock+market&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=nasdaq+sp500&hl=en-US&gl=US&ceid=US:en"
];

const MARKET_KEYWORDS = [
  "stock", "NSE", "BSE", "Nifty", "Sensex", "NASDAQ", "S&P 500", "IPO", 
  "earnings", "dividend", "buyback", "stock split", "broker upgrade", 
  "inflation", "federal reserve", "oil prices", "war", "sanctions",
  "Nifty 50", "NIFTY", "bank nifty", "fin nifty", "midcap nifty"
];

const GLOBAL_KEYWORDS = [
  "fed", "federal reserve", "us stock", "wall street", "dow jones", "nasdaq", "s&p 500", 
  "dollar", "iran", "israel", "war", "sanctions", "oil prices", "brent", "global markets",
  "white house", "middle east", "ukraine", "russia"
];

const REGIONAL_KEYWORDS = [
  "nifty", "sensex", "nifty 50", "nse", "bse", "rbi", "rupee", "inr", "sebi", 
  "reliance", "hdfc", "infosys", "tcs", "adani", "modi", "finmin", "gst"
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

    // 1. Fetch from RSS Feeds
    console.log("Starting RSS ingestion...");
    for (const url of REGIONAL_RSS) {
      const items = await fetchRSS(url, 'IN');
      console.log(`Fetched ${items.length} items from Regional RSS: ${url}`);
      allNews.push(...items);
    }
    for (const url of GLOBAL_RSS) {
      const items = await fetchRSS(url, 'GLOBAL');
      console.log(`Fetched ${items.length} items from Global RSS: ${url}`);
      allNews.push(...items);
    }

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
      
      const source = url.includes('moneycontrol') ? 'Moneycontrol' : 
                     url.includes('economictimes') ? 'Economic Times' : 'Google News';

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

async function fetchNewsDataIO(apiKey: string): Promise<NewsItem[]> {
  try {
    const queries = ["NSE OR Nifty OR Sensex OR IPO", "stock OR nasdaq OR federal reserve"];
    const results: NewsItem[] = [];

    for (const q of queries) {
      const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&q=${encodeURIComponent(q)}&category=business&size=50`;
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const data = await response.json();
      if (data.status === "success" && data.results) {
        for (const article of data.results) {
          results.push({
            title: article.title,
            summary: article.description || article.content || "",
            url: article.link,
            source: article.source_id || "NewsData",
            region: q.includes("NSE") ? 'IN' : 'GLOBAL',
            published_at: new Date(article.pubDate).toISOString(),
            image_url: article.image_url,
            category: 'Market News',
            impact_score: 0
          });
        }
      }
    }
    return results;
  } catch (e) {
    console.error("Error fetching NewsData:", e);
    return [];
  }
}

async function fetchMarketaux(apiKey: string): Promise<NewsItem[]> {
  try {
    const url = `https://api.marketaux.com/v1/news/all?api_token=${apiKey}&q=stock OR IPO OR earnings&countries=in,us&language=en`;
    const res = await fetch(url);
    if (!res.ok) return [];
    
    const data = await res.json();
    return (data.data || []).map((article: any) => ({
      title: article.title,
      summary: article.description || "",
      url: article.url,
      source: article.source || "Marketaux",
      image_url: article.image_url,
      region: article.entities?.some((e: any) => e.country === 'in') ? 'IN' : 'GLOBAL',
      published_at: article.published_at || new Date().toISOString(),
      sentiment: article.sentiment,
      affected_symbols: article.entities?.map((e: any) => e.symbol).filter(Boolean),
      category: 'Market News',
      impact_score: 0
    }));
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
  
  const isGlobal = GLOBAL_KEYWORDS.some(k => text.includes(k));
  const isIndian = REGIONAL_KEYWORDS.some(k => text.includes(k));
  
  // If explicitly global keywords found and no strong Indian context, mark as GLOBAL
  if (isGlobal && !isIndian) return 'GLOBAL';
  // If strongly Indian, mark as IN
  if (isIndian) return 'IN';
  
  // Fallback to source-defined region
  return sourceRegion;
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
