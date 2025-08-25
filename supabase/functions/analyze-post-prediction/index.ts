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
    const { symbol, from } = await req.json();
    
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromTime = new Date(from);
    const toTime = new Date();

    console.log(`Analyzing ${symbol} from ${fromTime.toISOString()} to ${toTime.toISOString()}`);

    // Fetch market data
    let marketData = null;
    const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
    const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');

    try {
      // Try Finnhub first
      if (finnhubApiKey) {
        console.log('Fetching market data from Finnhub...');
        const fromTimestamp = Math.floor(fromTime.getTime() / 1000);
        const toTimestamp = Math.floor(toTime.getTime() / 1000);
        
        const finnhubResponse = await fetch(
          `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${fromTimestamp}&to=${toTimestamp}&token=${finnhubApiKey}`
        );
        
        if (finnhubResponse.ok) {
          const data = await finnhubResponse.json();
          if (data.s === 'ok' && data.c && data.c.length > 0) {
            marketData = {
              source: 'Finnhub',
              open: data.o[0],
              close: data.c[data.c.length - 1],
              high: Math.max(...data.h),
              low: Math.min(...data.l),
              volume: data.v.reduce((a, b) => a + b, 0),
              prices: data.c
            };
            console.log('Successfully fetched data from Finnhub');
          }
        }
      }

      // Fallback to Alpha Vantage if Finnhub failed
      if (!marketData && alphaVantageApiKey) {
        console.log('Trying Alpha Vantage as fallback...');
        const avResponse = await fetch(
          `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${alphaVantageApiKey}`
        );
        
        if (avResponse.ok) {
          const data = await avResponse.json();
          const timeSeries = data['Time Series (Daily)'];
          
          if (timeSeries) {
            const dates = Object.keys(timeSeries).sort();
            const relevantDates = dates.filter(date => {
              const d = new Date(date);
              return d >= fromTime && d <= toTime;
            });
            
            if (relevantDates.length > 0) {
              const firstDate = relevantDates[0];
              const lastDate = relevantDates[relevantDates.length - 1];
              
              marketData = {
                source: 'Alpha Vantage',
                open: parseFloat(timeSeries[firstDate]['1. open']),
                close: parseFloat(timeSeries[lastDate]['4. close']),
                high: Math.max(...relevantDates.map(d => parseFloat(timeSeries[d]['2. high']))),
                low: Math.min(...relevantDates.map(d => parseFloat(timeSeries[d]['3. low']))),
                volume: relevantDates.reduce((sum, d) => sum + parseInt(timeSeries[d]['5. volume']), 0),
                prices: relevantDates.map(d => parseFloat(timeSeries[d]['4. close']))
              };
              console.log('Successfully fetched data from Alpha Vantage');
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
    }

    // Compute metrics if we have market data
    let metricsText = '';
    if (marketData) {
      const priceChange = marketData.close - marketData.open;
      const priceChangePercent = ((priceChange / marketData.open) * 100).toFixed(2);
      const range = marketData.high - marketData.low;
      const rangePercent = ((range / marketData.open) * 100).toFixed(2);
      
      // Calculate volatility (standard deviation of price changes)
      let volatility = 0;
      if (marketData.prices.length > 1) {
        const returns = [];
        for (let i = 1; i < marketData.prices.length; i++) {
          returns.push((marketData.prices[i] - marketData.prices[i-1]) / marketData.prices[i-1]);
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        volatility = (Math.sqrt(variance) * 100).toFixed(2);
      }

      metricsText = `
MARKET DATA ANALYSIS (${marketData.source}):
- Price: ${marketData.open.toFixed(4)} → ${marketData.close.toFixed(4)} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent}%)
- Range: ${marketData.low.toFixed(4)} - ${marketData.high.toFixed(4)} (${rangePercent}% range)
- Volatility: ${volatility}%
- Volume: ${marketData.volume.toLocaleString()}
`;
    } else {
      metricsText = 'Note: Market data unavailable for this analysis period.';
    }

    // Generate AI summary using Gemini with web search and market data
    let aiSummary = '';
    try {
      // Format symbol for better search (e.g., EURUSD -> EUR/USD)
      const searchSymbol = symbol.length === 6 && symbol.match(/^[A-Z]{6}$/) 
        ? `${symbol.slice(0,3)}/${symbol.slice(3)}` 
        : symbol;

      const analysisPrompt = `Analyze ${searchSymbol} (${symbol}) from ${fromTime.toISOString()} to ${toTime.toISOString()}.

${metricsText}

Use Google Search to find news and catalysts that explain these movements. Provide EXACTLY this format:

• [Brief bullet about the price movement/trend with specific numbers]
• [Brief bullet about key news/events that drove the movement]  
• [Brief bullet about market catalysts or reactions]

Sources: [Include 1-3 relevant URLs]

Keep each bullet under 25 words. Focus on what caused the price action.`;

      const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + geminiApiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: analysisPrompt }]
          }],
          tools: [{
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: "MODE_DYNAMIC",
                dynamicThreshold: 0.7
              }
            }
          }]
        })
      });

      const geminiData = await geminiResponse.json();
      console.log('Gemini response:', JSON.stringify(geminiData, null, 2));
      
      if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
        aiSummary = geminiData.candidates[0].content.parts[0].text.trim();
        
        // Light cleanup of common disclaimer phrases
        aiSummary = aiSummary
          .replace(/Please note that.*?\.?\s*/gi, '')
          .replace(/It's important to.*?\.?\s*/gi, '')
          .replace(/Disclaimer:.*?\.?\s*/gi, '')
          .replace(/\*\*Disclaimer\*\*:.*?\.?\s*/gi, '')
          .trim();
          
      } else if (geminiData.error) {
        console.error('Gemini API error response:', geminiData.error);
        if (geminiData.error.message?.includes('grounding')) {
          aiSummary = 'Google Search is not enabled for this API key. Please enable Google Search (grounding) in your Gemini API settings.';
        } else {
          aiSummary = `API Error: ${geminiData.error.message || 'Unknown error'}`;
        }
      } else {
        aiSummary = 'Unable to generate analysis at this time.';
      }
    } catch (error) {
      console.error('Gemini API error:', error);
      aiSummary = 'AI analysis temporarily unavailable.';
    }

    const response = {
      symbol,
      from: fromTime.toISOString(),
      to: toTime.toISOString(),
      ai: {
        summary: aiSummary
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-post-prediction function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});