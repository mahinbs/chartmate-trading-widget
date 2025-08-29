import { corsHeaders } from '../_shared/cors.ts';

interface NewsRequest {
  symbol: string;
  from?: string;
  to?: string;
  limit?: number;
}

interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string;
}

interface NewsAnalysis {
  summary: string;
  sentiment: {
    score: number; // -1 to 1
    label: string; // Positive, Negative, Neutral
  };
  keyDrivers: string[];
  risks: string[];
  opportunities: string[];
  notableHeadlines: string[];
}

interface NewsResponse {
  symbol: string;
  query: string;
  from: string;
  to: string;
  dataSource: string;
  articles: NewsArticle[];
  analysis: NewsAnalysis;
}

function normalizeSymbolForQuery(symbol: string): string {
  // Handle forex pairs
  if (symbol.includes('=X') || symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('JPY')) {
    const cleanSymbol = symbol.replace('=X', '').replace('/', ' ').replace('_', ' ');
    return `${cleanSymbol} forex when:7d`;
  }
  
  // Handle crypto
  if (['BTC', 'ETH', 'ADA', 'DOT', 'SOL', 'DOGE', 'XRP', 'LTC'].some(crypto => symbol.includes(crypto))) {
    const cryptoName = symbol.replace(/USD$|=X$/, '');
    return `${cryptoName} crypto when:7d`;
  }
  
  // Handle indices
  if (symbol.includes('SPX') || symbol.includes('SPY')) {
    return `S&P 500 index when:7d`;
  }
  if (symbol.includes('GOLD')) {
    return `Gold futures when:7d`;
  }
  
  // Default to stock
  return `${symbol} stock when:7d`;
}

async function fetchGoogleNewsRSS(query: string, limit: number = 8): Promise<NewsArticle[]> {
  const encodedQuery = encodeURIComponent(query);
  const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
  
  console.log(`Fetching Google News RSS for query: "${query}"`);
  console.log(`RSS URL: ${rssUrl}`);
  
  try {
    const response = await fetch(rssUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    console.log(`RSS fetch successful, response length: ${xmlText.length}`);
    
    // Parse RSS XML
    const articles: NewsArticle[] = [];
    const items = xmlText.match(/<item>(.*?)<\/item>/gs) || [];
    
    console.log(`Found ${items.length} RSS items`);
    
    for (let i = 0; i < Math.min(items.length, limit); i++) {
      const item = items[i];
      
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const sourceMatch = item.match(/<source.*?>(.*?)<\/source>/);
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
      
      if (titleMatch && linkMatch) {
        articles.push({
          title: titleMatch[1].trim(),
          url: linkMatch[1].trim(),
          source: sourceMatch?.[1]?.trim() || 'Google News',
          publishedAt: pubDateMatch?.[1]?.trim() || new Date().toISOString(),
          description: descMatch?.[1]?.trim()
        });
      }
    }
    
    console.log(`Parsed ${articles.length} articles successfully`);
    return articles;
    
  } catch (error) {
    console.error('Error fetching Google News RSS:', error);
    return [];
  }
}

async function generateNewsAnalysis(symbol: string, articles: NewsArticle[]): Promise<NewsAnalysis> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    throw new Error('Gemini API key not configured');
  }
  
  if (articles.length === 0) {
    return {
      summary: `No recent news found for ${symbol} in the analyzed period.`,
      sentiment: { score: 0, label: 'Neutral' },
      keyDrivers: [],
      risks: [],
      opportunities: [],
      notableHeadlines: []
    };
  }
  
  const headlines = articles.map(a => `"${a.title}" - ${a.source}`).join('\n');
  
  const prompt = `Analyze these recent news headlines for ${symbol} and provide a JSON response with the following structure:

{
  "summary": "Brief 2-3 sentence summary of the key themes and developments",
  "sentiment": {
    "score": number between -1 (very negative) and 1 (very positive),
    "label": "Positive" | "Negative" | "Neutral"
  },
  "keyDrivers": ["3-5 main positive factors mentioned in news"],
  "risks": ["3-5 main concerns or negative factors"],
  "opportunities": ["2-4 potential opportunities or catalysts"],
  "notableHeadlines": ["2-3 most important headline titles"]
}

News Headlines:
${headlines}

Respond ONLY with valid JSON, no additional text.`;

  try {
    console.log('Generating AI analysis with Gemini...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
    
    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      throw new Error('No response from Gemini API');
    }
    
    console.log('Raw Gemini response:', generatedText);
    
    // Clean and parse JSON
    let cleanedResponse = generatedText.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const analysis = JSON.parse(cleanedResponse);
    console.log('Parsed analysis:', analysis);
    
    return analysis;
    
  } catch (error) {
    console.error('Error generating news analysis:', error);
    
    // Fallback analysis
    return {
      summary: `Recent news coverage for ${symbol} includes ${articles.length} articles from various sources.`,
      sentiment: { score: 0, label: 'Neutral' },
      keyDrivers: ['Market activity', 'Industry developments'],
      risks: ['Market volatility', 'External factors'],
      opportunities: ['Potential growth', 'Market opportunities'],
      notableHeadlines: articles.slice(0, 3).map(a => a.title)
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { symbol, from, to, limit = 8 }: NewsRequest = await req.json();
    
    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Analyzing news for symbol: ${symbol}, limit: ${limit}`);
    
    // Generate query for Google News
    const query = normalizeSymbolForQuery(symbol);
    console.log(`Generated query: "${query}"`);
    
    // Fetch news articles
    const articles = await fetchGoogleNewsRSS(query, limit);
    console.log(`Fetched ${articles.length} articles`);
    
    // Generate AI analysis
    const analysis = await generateNewsAnalysis(symbol, articles);
    
    // Prepare response
    const response: NewsResponse = {
      symbol,
      query,
      from: from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      to: to || new Date().toISOString(),
      dataSource: 'Google News (RSS)',
      articles,
      analysis
    };
    
    console.log(`Analysis complete for ${symbol}: ${articles.length} articles, sentiment: ${analysis.sentiment.label}`);
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in analyze-news-google function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});