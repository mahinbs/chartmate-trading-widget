import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { q } = await req.json();
    
    if (!q || q.length < 1) {
      return new Response(
        JSON.stringify({ error: 'Query parameter "q" is required and must be at least 1 character' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Searching for symbols: "${q}"`);

    // Search both US and Indian markets for comprehensive results
    const searchPromises = [
      fetchYahooSearch(q, 'US'),
      fetchYahooSearch(q, 'IN')
    ];

    const results = await Promise.allSettled(searchPromises);
    let allSymbols: any[] = [];

    // Merge results from both regions
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        console.log(`Region ${index === 0 ? 'US' : 'IN'} returned ${result.value.length} results`);
        allSymbols = allSymbols.concat(result.value);
      } else {
        console.warn(`Region ${index === 0 ? 'US' : 'IN'} search failed:`, result.status === 'rejected' ? result.reason : 'No data');
      }
    });

    // Remove duplicates based on symbol
    const uniqueSymbols = allSymbols.filter((symbol, index, arr) => 
      arr.findIndex(s => s.full_symbol === symbol.full_symbol) === index
    );

    // Sort by relevance (exact matches first, then by score if available)
    uniqueSymbols.sort((a, b) => {
      const aExact = a.symbol.toLowerCase() === q.toLowerCase() ? 0 : 1;
      const bExact = b.symbol.toLowerCase() === q.toLowerCase() ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      
      // Then by score if available
      const aScore = a.score || 0;
      const bScore = b.score || 0;
      return bScore - aScore;
    });

    console.log(`Returning ${uniqueSymbols.length} unique symbols`);

    return new Response(
      JSON.stringify(uniqueSymbols.slice(0, 20)), // Limit to 20 results
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in search-symbols function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function fetchYahooSearch(query: string, region: string = 'US'): Promise<any[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-${region}&region=${region}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query&multiQuoteQueryId=multi_quote_single_token_query&enableCb=true&enableNavLinks=true&enableEnhancedTrivialQuery=true`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }

    const data = await response.json();
    const quotes = data.quotes || [];

    return quotes.map((quote: any) => {
      const symbol = quote.symbol || '';
      const displaySymbol = getDisplaySymbol(symbol);
      const type = mapQuoteTypeToCategory(quote.quoteType);
      
      return {
        symbol: displaySymbol,
        description: quote.shortname || quote.longname || symbol,
        exchange: quote.exchDisp || quote.exchange || '',
        type: type,
        full_symbol: symbol,
        score: quote.score || 0
      };
    }).filter(item => item.symbol && item.full_symbol);

  } catch (error) {
    console.error(`Error fetching from Yahoo Finance (${region}):`, error);
    return [];
  }
}

function getDisplaySymbol(fullSymbol: string): string {
  // Remove Yahoo-specific suffixes for display
  return fullSymbol
    .replace(/\.(NS|BO)$/, '') // Indian exchanges
    .replace(/=X$/, '') // Forex
    .replace(/\^/, '') // Indices
    .replace(/-USD$/, '') // Crypto
    .replace(/=F$/, ''); // Futures
}

function mapQuoteTypeToCategory(quoteType: string): string {
  switch (quoteType?.toUpperCase()) {
    case 'EQUITY':
      return 'stock';
    case 'CURRENCY':
      return 'forex';
    case 'CRYPTOCURRENCY':
      return 'crypto';
    case 'FUTURE':
    case 'COMMODITY':
      return 'commodity';
    case 'INDEX':
      return 'index';
    case 'ETF':
    case 'MUTUALFUND':
      return 'etf';
    default:
      return 'stock'; // Default fallback
  }
}