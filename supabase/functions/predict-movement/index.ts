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
    // Get current quote from Finnhub for all symbols
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`
    );

    if (!response.ok) {
      console.log(`Finnhub API error for ${symbol}: ${response.status}, using fallback data`);
      return getFallbackData(symbol);
    }

    const data = await response.json();
    
    if (!data.c || data.c === 0) {
      console.log(`No data found for ${symbol}, using fallback data`);
      return getFallbackData(symbol);
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
    console.error(`Error fetching data for ${symbol}:`, error);
    console.log(`Using fallback data for ${symbol}`);
    return getFallbackData(symbol);
  }
}

function getFallbackData(symbol: string): StockData {
  // Return minimal fallback data - Gemini will analyze based on symbol knowledge
  return {
    currentPrice: 1.0,
    openPrice: 1.0,
    highPrice: 1.0,
    lowPrice: 1.0,
    previousClose: 1.0,
    change: 0,
    changePercent: 0
  };
}

async function getGeminiAnalysis(
  symbol: string,
  investment: number,
  timeframe: string,
  stockData: StockData
): Promise<{ structuredData: any; analysis: string }> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    throw new Error('Gemini API key not configured');
  }

  const structuredPrompt = `Analyze ${symbol} and respond with ONLY valid JSON in this exact format:
{
  "recommendation": "bullish" | "bearish" | "neutral",
  "confidence": number between 0-100,
  "expectedMove": {
    "percent": number,
    "direction": "up" | "down" | "flat",
    "priceTarget": {
      "min": number,
      "max": number
    }
  },
  "timeframe": "${timeframe}",
  "patterns": ["array of chart patterns detected"],
  "keyLevels": {
    "support": [array of support price levels],
    "resistance": [array of resistance price levels]
  },
  "rationale": "brief explanation of decision",
  "risks": ["array of key risk factors"],
  "opportunities": ["array of opportunities"]
}

Symbol: ${symbol}
Investment: $${investment}
Timeframe: ${timeframe}

Note: Use your knowledge of ${symbol} to provide realistic price targets and levels even if current market data is limited. For forex pairs like EURUSD, provide appropriate decimal precision in price targets.

Respond with ONLY the JSON object, no other text.`;

  const analysisPrompt = `Provide detailed stock analysis for ${symbol}:

Current stock data:
- Price: $${stockData.currentPrice}
- Open: $${stockData.openPrice}
- High: $${stockData.highPrice}
- Low: $${stockData.lowPrice}
- Previous Close: $${stockData.previousClose}
- Change: $${stockData.change} (${stockData.changePercent}%)

Investment amount: $${investment}
Analysis timeframe: ${timeframe}

Provide comprehensive analysis covering:
1. Market sentiment and technical analysis
2. Risk assessment for this investment
3. Your recommendation with reasoning
4. Specific guidance for the ${timeframe} timeframe
5. Key factors to watch`;

  try {
    // First try to get structured data
    const structuredResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: structuredPrompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.3,
        }
      }),
    });

    // Then get detailed analysis
    const analysisResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: analysisPrompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.7,
        }
      }),
    });

    if (!structuredResponse.ok || !analysisResponse.ok) {
      throw new Error('API request failed');
    }

    const structuredData = await structuredResponse.json();
    const analysisData = await analysisResponse.json();
    
    const structuredText = structuredData.candidates[0].content.parts[0].text;
    const analysis = analysisData.candidates[0].content.parts[0].text;

    let parsedStructuredData = null;
    try {
      // Try to parse JSON from structured response
      const cleanedText = structuredText.replace(/```json\n?|\n?```/g, '').trim();
      parsedStructuredData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.log('Failed to parse structured data, using fallback');
      // Fallback - basic data extraction
      parsedStructuredData = {
        recommendation: "neutral",
        confidence: 50,
        timeframe: timeframe,
        patterns: [],
        keyLevels: { support: [], resistance: [] },
        rationale: "Analysis available in full text",
        risks: [],
        opportunities: []
      };
    }

    return {
      structuredData: parsedStructuredData,
      analysis: analysis
    };

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
    const { structuredData, analysis } = await getGeminiAnalysis(symbol, investment, timeframe, stockData);
    console.log('Gemini analysis completed');

    const result = {
      symbol,
      currentPrice: stockData.currentPrice,
      change: stockData.change,
      changePercent: stockData.changePercent,
      timeframe,
      analysis,
      stockData,
      ...structuredData
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