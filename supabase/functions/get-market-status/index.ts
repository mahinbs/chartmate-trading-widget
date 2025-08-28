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
    const { symbol } = await req.json();

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Symbol is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Getting market status for symbol: ${symbol}`);

    // Fetch market data from Yahoo Finance
    const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    const quote = data.quoteResponse?.result?.[0];

    if (!quote) {
      return new Response(JSON.stringify({ 
        error: 'Symbol not found',
        symbol 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Exchange hours mapping
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
      exchange = 'Unknown',
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
      regularHours = exchangeHours[exchange] || 'Regular hours vary by venue';
      
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

    const result = {
      symbol: returnSymbol,
      exchange,
      exchangeTimezoneName,
      marketState: status,
      quoteType,
      label,
      regularHours,
      timestamp: new Date().toISOString()
    };

    console.log(`Market status result for ${symbol}:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-market-status function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      symbol: 'unknown'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});