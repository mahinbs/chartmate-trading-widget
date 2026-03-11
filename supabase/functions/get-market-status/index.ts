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

    // Function to calculate market hours and status
    const calculateMarketHours = (exchange: string, timezone: string, quoteType: string) => {
      const now = new Date();
      
      // Market open/close times in 24h format [hour, minute]
      const marketHours: Record<string, { open: [number, number]; close: [number, number] }> = {
        'NYSE': { open: [9, 30], close: [16, 0] },
        'NMS': { open: [9, 30], close: [16, 0] }, // NASDAQ
        'LSE': { open: [8, 0], close: [16, 30] },
        'NSE': { open: [9, 15], close: [15, 30] },
        'BSE': { open: [9, 15], close: [15, 30] },
        'HKEX': { open: [9, 30], close: [16, 0] },
        'TSE': { open: [9, 0], close: [15, 0] },
        'JPX': { open: [9, 0], close: [15, 0] },
      };

      const hours = marketHours[exchange] || marketHours['NYSE']; // Default to NYSE

      // For timezone-aware calculations, we'll use simplified logic
      // In production, you'd want a proper timezone library
      const timezoneOffsets: Record<string, number> = {
        'America/New_York': -5, // EST (adjust for DST as needed)
        'Europe/London': 0, // GMT
        'Asia/Kolkata': 5.5,
        'Asia/Hong_Kong': 8,
        'Asia/Tokyo': 9,
      };

      const offset = timezoneOffsets[timezone] || timezoneOffsets['America/New_York'];
      
      // Create today's market open/close times in UTC
      const todayUTC = new Date(now.toISOString().split('T')[0] + 'T00:00:00.000Z');
      const todayOpen = new Date(todayUTC.getTime() + (hours.open[0] - offset) * 60 * 60 * 1000 + hours.open[1] * 60 * 1000);
      const todayClose = new Date(todayUTC.getTime() + (hours.close[0] - offset) * 60 * 60 * 1000 + hours.close[1] * 60 * 1000);

      // Check if market is currently open (simplified - doesn't account for holidays)
      const isRegularOpen = now >= todayOpen && now <= todayClose;

      // Calculate next regular open
      let nextRegularOpen = todayOpen;
      if (now >= todayClose) {
        // Market closed for today, next open is tomorrow
        nextRegularOpen = new Date(todayOpen.getTime() + 24 * 60 * 60 * 1000);
      } else if (now < todayOpen) {
        // Market hasn't opened today yet
        nextRegularOpen = todayOpen;
      } else {
        // Market is currently open, next open is tomorrow
        nextRegularOpen = new Date(todayOpen.getTime() + 24 * 60 * 60 * 1000);
      }

      return {
        isRegularOpen,
        nextRegularOpen: nextRegularOpen.toISOString(),
        todayRegularOpen: todayOpen.toISOString(),
        todayRegularClose: todayClose.toISOString(),
      };
    };

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
          isRegularOpen: true,
          nextRegularOpen: new Date().toISOString(),
          todayRegularOpen: new Date().toISOString(),
          todayRegularClose: new Date().toISOString(),
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
          isRegularOpen: true,
          nextRegularOpen: new Date().toISOString(),
          todayRegularOpen: new Date().toISOString(),
          todayRegularClose: new Date().toISOString(),
          timestamp: new Date().toISOString()
        };
      }

      // Handle stocks - determine market status based on current time and exchange
      const exchangeTimezone = exchange === 'LSE' ? 'Europe/London' : 
                              exchange === 'NSE' || exchange === 'BSE' ? 'Asia/Kolkata' :
                              exchange === 'HKEX' ? 'Asia/Hong_Kong' :
                              exchange === 'TSE' || exchange === 'JPX' ? 'Asia/Tokyo' :
                              'America/New_York'; // Default to US

      const regularHours = exchangeHours[exchange || 'NYSE'] || 'Regular hours vary by venue';
      const marketHours = calculateMarketHours(exchange || 'NYSE', exchangeTimezone, 'EQUITY');
      
      return {
        symbol,
        exchange: exchange || 'Unknown',
        exchangeTimezoneName: exchangeTimezone,
        marketState: marketHours.isRegularOpen ? 'REGULAR' : 'CLOSED',
        quoteType: 'EQUITY',
        label: marketHours.isRegularOpen ? 'Market is open' : 'Market is closed',
        regularHours,
        ...marketHours,
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
            marketState = 'CLOSED',
            quoteType = 'EQUITY'
          } = quote;

          // Determine the correct timezone — Yahoo sometimes returns America/New_York
          // for Indian exchanges (Bombay/BSE/NSE). Always override to IST for those.
          const INDIAN_EXCHANGES = ['NSE', 'BSE', 'Bombay', 'BOM', 'CNX', 'INDNSE', 'INDBOM'];
          const isIndianExchange =
            INDIAN_EXCHANGES.includes(yahooExchange) ||
            symbol.endsWith('.NS') || symbol.endsWith('.BO');
          const exchangeTimezoneName: string = isIndianExchange
            ? 'Asia/Kolkata'
            : (quote.exchangeTimezoneName || 'UTC');

          // Handle different asset types
          let status: string;
          let label: string;
          let regularHours: string;
          let marketHours: any = {};

          if (quoteType === 'CRYPTOCURRENCY') {
            status = 'LIVE_24_7';
            label = 'Live 24/7';
            regularHours = 'Always trading';
            marketHours = {
              isRegularOpen: true,
              nextRegularOpen: new Date().toISOString(),
              todayRegularOpen: new Date().toISOString(),
              todayRegularClose: new Date().toISOString(),
            };
          } else if (quoteType === 'CURRENCY' || quoteType === 'FOREX') {
            status = 'LIVE_24_5';
            label = 'Live 24/5';
            regularHours = 'Sunday 5 PM – Friday 5 PM ET';
            marketHours = {
              isRegularOpen: true,
              nextRegularOpen: new Date().toISOString(),
              todayRegularOpen: new Date().toISOString(),
              todayRegularClose: new Date().toISOString(),
            };
          } else {
            // Stock/equity
            status = marketState;
            regularHours = exchangeHours[yahooExchange] || 'Regular hours vary by venue';
            marketHours = calculateMarketHours(yahooExchange, exchangeTimezoneName, quoteType);
            
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
            ...marketHours,
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