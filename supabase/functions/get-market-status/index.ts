import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, exchange, type } = await req.json();

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Symbol is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Getting market status for symbol: ${symbol}, exchange: ${exchange}, type: ${type}`);

    // Function to create fallback status based on asset type and exchange
    const createFallbackStatus = (symbol: string, exchange?: string, type?: string) => {
      const exchangeHours: Record<string, string> = {
        'NYSE': '9:30 AM – 4:00 PM ET',
        'NMS': '9:30 AM – 4:00 PM ET', // NASDAQ
        'LSE': '8:00 AM – 4:30 PM GMT',
        'NSE': '9:15 AM – 3:30 PM IST',
        'BSE': '9:15 AM – 3:30 PM IST',
        'HKEX': '9:30 AM – 4:00 PM HKT',
        'TSE': '9:00 AM – 3:00 PM JST',
        'JPX': '9:00 AM – 3:00 PM JST',
      };

      // Handle crypto
      if (type === 'cryptocurrency' || symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('-USD')) {
        return {
          symbol,
          exchange: exchange || 'Crypto Exchange',
          exchangeTimezoneName: 'UTC',
          marketState: 'LIVE_24_7',
          quoteType: 'CRYPTOCURRENCY',
          label: 'Live 24/7',
          regularHours: 'Always trading',
          timestamp: new Date().toISOString()
        };
      }

      // Handle forex
      if (type === 'currency' || symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('=X')) {
        return {
          symbol,
          exchange: exchange || 'Forex Market',
          exchangeTimezoneName: 'UTC',
          marketState: 'LIVE_24_5',
          quoteType: 'CURRENCY',
          label: 'Live 24/5',
          regularHours: 'Sunday 5 PM – Friday 5 PM ET',
          timestamp: new Date().toISOString()
        };
      }

      // Handle stocks - determine market status based on current time and exchange
      const now = new Date();
      const exchangeTimezone = exchange === 'LSE' ? 'Europe/London' : 
                              exchange === 'NSE' || exchange === 'BSE' ? 'Asia/Kolkata' :
                              exchange === 'HKEX' ? 'Asia/Hong_Kong' :
                              exchange === 'TSE' || exchange === 'JPX' ? 'Asia/Tokyo' :
                              'America/New_York'; // Default to US

      const regularHours = exchangeHours[exchange || 'NYSE'] || 'Regular hours vary by venue';
      
      // Simple fallback - assume market is closed for safety
      return {
        symbol,
        exchange: exchange || 'Unknown',
        exchangeTimezoneName: exchangeTimezone,
        marketState: 'CLOSED',
        quoteType: 'EQUITY',
        label: 'Market is closed',
        regularHours,
        timestamp: new Date().toISOString()
      };
    };

    let result;

    try {
      // Try to fetch from Yahoo Finance
      const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const quote = data.quoteResponse?.result?.[0];

        if (quote) {
          // Yahoo Finance data available - use it
          const exchangeHours: Record<string, string> = {
            'NYSE': '9:30 AM – 4:00 PM ET',
            'NMS': '9:30 AM – 4:00 PM ET', // NASDAQ
            'LSE': '8:00 AM – 4:30 PM GMT',
            'NSE': '9:15 AM – 3:30 PM IST',
            'BSE': '9:15 AM – 3:30 PM IST',
            'HKEX': '9:30 AM – 4:00 PM HKT',
            'TSE': '9:00 AM – 3:00 PM JST',
            'JPX': '9:00 AM – 3:00 PM JST',
          };

          const {
            symbol: returnSymbol,
            exchange: yahooExchange = exchange || 'Unknown',
            exchangeTimezoneName = 'UTC',
            marketState = 'CLOSED',
            quoteType = 'EQUITY'
          } = quote;

          // Handle different asset types
          let status: string;
          let label: string;
          let regularHours: string;

          if (quoteType === 'CRYPTOCURRENCY') {
            status = 'LIVE_24_7';
            label = 'Live 24/7';
            regularHours = 'Always trading';
          } else if (quoteType === 'CURRENCY' || quoteType === 'FOREX') {
            status = 'LIVE_24_5';
            label = 'Live 24/5';
            regularHours = 'Sunday 5 PM – Friday 5 PM ET';
          } else {
            // Stock/equity
            status = marketState;
            regularHours = exchangeHours[yahooExchange] || 'Regular hours vary by venue';
            
            switch (marketState) {
              case 'REGULAR':
                label = 'Market is open (regular session)';
                break;
              case 'PRE':
                label = 'Pre-market is active';
                break;
              case 'POST':
                label = 'After-hours session is active';
                break;
              case 'CLOSED':
                label = 'Market is closed';
                break;
              default:
                label = 'Market status unknown';
            }
          }

          result = {
            symbol: returnSymbol,
            exchange: yahooExchange,
            exchangeTimezoneName,
            marketState: status,
            quoteType,
            label,
            regularHours,
            timestamp: new Date().toISOString()
          };
        } else {
          // No quote data - use fallback
          console.log('No quote data from Yahoo Finance, using fallback');
          result = createFallbackStatus(symbol, exchange, type);
        }
      } else {
        // Yahoo Finance API error - use fallback
        console.log(`Yahoo Finance API error: ${response.status}, using fallback`);
        result = createFallbackStatus(symbol, exchange, type);
      }
    } catch (yahooError) {
      // Yahoo Finance request failed - use fallback
      console.log('Yahoo Finance request failed, using fallback:', yahooError.message);
      result = createFallbackStatus(symbol, exchange, type);
    }

    console.log(`Market status result for ${symbol}:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-market-status function:', error);
    
    // Even if there's an unexpected error, return a basic fallback response
    const fallbackResult = {
      symbol: 'unknown',
      exchange: 'Unknown',
      exchangeTimezoneName: 'UTC',
      marketState: 'CLOSED',
      quoteType: 'EQUITY',
      label: 'Market status unavailable',
      regularHours: 'Regular hours vary by venue',
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(fallbackResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});