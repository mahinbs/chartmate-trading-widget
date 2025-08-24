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
  // Detect forex pairs (6-letter alphabetic symbols like EURUSD)
  const isForexPair = /^[A-Z]{6}$/.test(symbol) || symbol.includes('/');
  
  if (isForexPair) {
    return await fetchForexData(symbol);
  }

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

async function fetchForexData(symbol: string): Promise<StockData> {
  const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
  
  if (!alphaVantageApiKey) {
    throw new Error('Alpha Vantage API key not configured');
  }

  try {
    // Normalize symbol (remove slashes, etc.)
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    
    // Extract currencies (first 3 and last 3 characters)
    const fromCurrency = normalizedSymbol.slice(0, 3);
    const toCurrency = normalizedSymbol.slice(3, 6);
    
    console.log(`Forex fallback via Alpha Vantage for ${symbol} (${fromCurrency}/${toCurrency})`);

    const response = await fetch(
      `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=${toCurrency}&apikey=${alphaVantageApiKey}`
    );

    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data['Realtime Currency Exchange Rate']) {
      throw new Error(`No forex data found for symbol: ${symbol}`);
    }

    const rate = parseFloat(data['Realtime Currency Exchange Rate']['5. Exchange Rate']);
    
    if (isNaN(rate)) {
      throw new Error(`Invalid exchange rate for symbol: ${symbol}`);
    }

    // Return forex data in StockData format
    return {
      currentPrice: rate,
      openPrice: rate,
      highPrice: rate,
      lowPrice: rate,
      previousClose: rate,
      change: 0,
      changePercent: 0
    };
  } catch (error) {
    console.error(`Error fetching forex data for ${symbol}:`, error);
    throw error;
  }
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

  const structuredPrompt = `Analyze ${symbol} stock and respond with ONLY valid JSON in this exact format:
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

Current data for ${symbol}:
- Price: $${stockData.currentPrice}
- Open: $${stockData.openPrice} 
- High: $${stockData.highPrice}
- Low: $${stockData.lowPrice}
- Previous Close: $${stockData.previousClose}
- Change: ${stockData.changePercent}%
- Investment: $${investment}
- Timeframe: ${timeframe}

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