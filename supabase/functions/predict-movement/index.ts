import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PredictionRequest {
  symbol: string;
  investment: number;
  timeframe: string;
}

interface StockData {
  currentPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
}

async function fetchRealStockData(symbol: string): Promise<StockData> {
  const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
  
  if (!finnhubApiKey) {
    throw new Error('Finnhub API key not configured');
  }

  try {
    // Get current quote from Finnhub
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`
    );

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.c) {
      throw new Error(`No data found for symbol: ${symbol}`);
    }

    // Extract real stock data
    return {
      currentPrice: data.c, // Current price
      openPrice: data.o,    // Open price
      highPrice: data.h,    // High price
      lowPrice: data.l,     // Low price
      previousClose: data.pc, // Previous close
      change: data.d,       // Change
      changePercent: data.dp // Change percent
    };
  } catch (error) {
    console.error('Error fetching real stock data:', error);
    throw error;
  }
}

async function getGeminiAnalysis(
  symbol: string,
  investment: number,
  timeframe: string,
  stockData: StockData
): Promise<string> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    throw new Error('Gemini API key not configured');
  }

  const prompt = `I need a stock analysis for ${symbol}.

Current real-time data:
- Current Price: $${stockData.currentPrice.toFixed(2)}
- Open: $${stockData.openPrice.toFixed(2)}
- High: $${stockData.highPrice.toFixed(2)}
- Low: $${stockData.lowPrice.toFixed(2)}
- Previous Close: $${stockData.previousClose.toFixed(2)}
- Change: $${stockData.change.toFixed(2)} (${stockData.changePercent.toFixed(2)}%)

Investment Amount: $${investment}
Timeframe: ${timeframe}

Please provide a comprehensive analysis including:
1. Current market sentiment and price action analysis
2. Technical outlook and key levels to watch
3. Potential risks and opportunities
4. Your recommendation (bullish/bearish/neutral) with confidence level
5. Specific guidance for this ${timeframe} timeframe

Give me the same quality analysis you would provide if I asked this question directly.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are a professional financial analyst. Provide thorough, insightful, and practical stock analysis.\n\n${prompt}`
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.7,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error: ${response.status} - ${errorText}`);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}


serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, investment, timeframe }: PredictionRequest = await req.json();

    console.log(`Getting Gemini analysis for ${symbol}, investment: $${investment}, timeframe: ${timeframe}`);

    // Fetch real stock data
    const stockData = await fetchRealStockData(symbol);
    console.log('Real stock data fetched:', stockData);

    // Get Gemini analysis
    const analysis = await getGeminiAnalysis(symbol, investment, timeframe, stockData);
    console.log('Gemini analysis completed');

    const result = {
      symbol,
      currentPrice: stockData.currentPrice,
      change: stockData.change,
      changePercent: stockData.changePercent,
      timeframe,
      analysis,
      stockData
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in predict-movement function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate analysis',
        message: error.message 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});