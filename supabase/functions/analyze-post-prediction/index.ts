import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to detect asset type and normalize symbols
function detectAssetType(symbol: string) {
  const forexPairs = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNY', 'INR', 'KRW', 'THB', 'MYR', 'IDR', 'PHP'];
  
  // Check if it's forex (6 uppercase letters or contains /)
  if (symbol.includes('/')) {
    return { type: 'forex', normalizedSymbol: symbol };
  }
  
  if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
    const base = symbol.slice(0, 3);
    const quote = symbol.slice(3);
    if (forexPairs.includes(base) && forexPairs.includes(quote)) {
      return { type: 'forex', normalizedSymbol: `${base}/${quote}` };
    }
  }
  
  return { type: 'stock', normalizedSymbol: symbol };
}

// Helper function to get Finnhub forex symbol
function getFinnhubForexSymbol(normalizedSymbol: string) {
  const [base, quote] = normalizedSymbol.split('/');
  return `OANDA:${base}_${quote}`;
}

// Helper function to determine resolution based on time span
function getResolution(spanMinutes: number) {
  if (spanMinutes <= 90) return '1';
  if (spanMinutes <= 360) return '5';
  if (spanMinutes <= 1440) return '15';
  if (spanMinutes <= 10080) return '60';
  return 'D';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, from } = await req.json();
    
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
    const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromTime = new Date(from);
    const toTime = new Date();
    const spanMinutes = (toTime.getTime() - fromTime.getTime()) / 60000;

    console.log(`Analyzing ${symbol} from ${fromTime.toISOString()} to ${toTime.toISOString()}`);

    // Detect asset type and normalize symbol
    const { type: assetType, normalizedSymbol } = detectAssetType(symbol);
    console.log(`Detected asset type: ${assetType}, normalized symbol: ${normalizedSymbol}`);

    // Get appropriate resolution
    const resolution = getResolution(spanMinutes);
    console.log(`Using resolution: ${resolution} for span: ${spanMinutes.toFixed(1)} minutes`);

    // Fetch market data
    let marketData = null;
    const fromTimestamp = Math.floor(fromTime.getTime() / 1000);
    const toTimestamp = Math.floor(toTime.getTime() / 1000);

    try {
      // Try Finnhub first
      if (finnhubApiKey) {
        console.log('Fetching market data from Finnhub...');
        
        let finnhubSymbol = symbol;
        let endpoint = 'stock/candle';
        
        if (assetType === 'forex') {
          finnhubSymbol = getFinnhubForexSymbol(normalizedSymbol);
          endpoint = 'forex/candle';
        }
        
        console.log(`Using Finnhub endpoint: ${endpoint}, symbol: ${finnhubSymbol}`);
        
        const finnhubResponse = await fetch(
          `https://finnhub.io/api/v1/${endpoint}?symbol=${finnhubSymbol}&resolution=${resolution}&from=${fromTimestamp}&to=${toTimestamp}&token=${finnhubApiKey}`
        );
        
        if (finnhubResponse.ok) {
          const data = await finnhubResponse.json();
          console.log(`Finnhub response status: ${data.s}, candles: ${data.c?.length || 0}`);
          
          if (data.s === 'ok' && data.c && data.c.length > 0) {
            marketData = {
              source: `Finnhub ${endpoint}`,
              open: data.o[0],
              close: data.c[data.c.length - 1],
              high: Math.max(...data.h),
              low: Math.min(...data.l),
              volume: data.v?.reduce((a, b) => a + b, 0) || 0,
              prices: data.c,
              candleCount: data.c.length
            };
            console.log('Successfully fetched data from Finnhub');
          }
        }
      }

      // Fallback to Alpha Vantage if Finnhub failed
      if (!marketData && alphaVantageApiKey) {
        console.log('Trying Alpha Vantage as fallback...');
        
        let avFunction = 'TIME_SERIES_DAILY';
        let avSymbol = symbol;
        
        if (assetType === 'forex') {
          avFunction = 'FX_INTRADAY';
          const [base, quote] = normalizedSymbol.split('/');
          
          // Map resolution to Alpha Vantage interval
          const interval = resolution === '1' ? '5min' : 
                          resolution === '5' ? '5min' : 
                          resolution === '15' ? '15min' : 
                          resolution === '60' ? '60min' : '5min';
          
          const avResponse = await fetch(
            `https://www.alphavantage.co/query?function=${avFunction}&from_symbol=${base}&to_symbol=${quote}&interval=${interval}&apikey=${alphaVantageApiKey}`
          );
          
          if (avResponse.ok) {
            const data = await avResponse.json();
            const timeSeries = data[`Time Series FX (${interval})`];
            
            if (timeSeries) {
              const timestamps = Object.keys(timeSeries).sort();
              const relevantTimestamps = timestamps.filter(ts => {
                const d = new Date(ts);
                return d >= fromTime && d <= toTime;
              });
              
              if (relevantTimestamps.length > 0) {
                const firstTs = relevantTimestamps[0];
                const lastTs = relevantTimestamps[relevantTimestamps.length - 1];
                
                marketData = {
                  source: `Alpha Vantage FX ${interval}`,
                  open: parseFloat(timeSeries[firstTs]['1. open']),
                  close: parseFloat(timeSeries[lastTs]['4. close']),
                  high: Math.max(...relevantTimestamps.map(ts => parseFloat(timeSeries[ts]['2. high']))),
                  low: Math.min(...relevantTimestamps.map(ts => parseFloat(timeSeries[ts]['3. low']))),
                  volume: 0, // Forex doesn't have volume
                  prices: relevantTimestamps.map(ts => parseFloat(timeSeries[ts]['4. close'])),
                  candleCount: relevantTimestamps.length
                };
                console.log('Successfully fetched forex data from Alpha Vantage');
              }
            }
          }
        } else {
          // Stock fallback
          const interval = resolution === 'D' ? 'daily' : 
                          resolution === '60' ? '60min' : 
                          resolution === '15' ? '15min' : 
                          resolution === '5' ? '5min' : '1min';
          
          const stockFunction = interval === 'daily' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
          let url = `https://www.alphavantage.co/query?function=${stockFunction}&symbol=${avSymbol}&apikey=${alphaVantageApiKey}`;
          
          if (stockFunction === 'TIME_SERIES_INTRADAY') {
            url += `&interval=${interval}`;
          }
          
          const avResponse = await fetch(url);
          
          if (avResponse.ok) {
            const data = await avResponse.json();
            const timeSeriesKey = stockFunction === 'TIME_SERIES_DAILY' ? 'Time Series (Daily)' : `Time Series (${interval})`;
            const timeSeries = data[timeSeriesKey];
            
            if (timeSeries) {
              const timestamps = Object.keys(timeSeries).sort();
              const relevantTimestamps = timestamps.filter(ts => {
                const d = new Date(ts);
                return d >= fromTime && d <= toTime;
              });
              
              if (relevantTimestamps.length > 0) {
                const firstTs = relevantTimestamps[0];
                const lastTs = relevantTimestamps[relevantTimestamps.length - 1];
                
                marketData = {
                  source: `Alpha Vantage ${timeSeriesKey}`,
                  open: parseFloat(timeSeries[firstTs]['1. open']),
                  close: parseFloat(timeSeries[lastTs]['4. close']),
                  high: Math.max(...relevantTimestamps.map(ts => parseFloat(timeSeries[ts]['2. high']))),
                  low: Math.min(...relevantTimestamps.map(ts => parseFloat(timeSeries[ts]['3. low']))),
                  volume: relevantTimestamps.reduce((sum, ts) => sum + parseInt(timeSeries[ts]['5. volume'] || '0'), 0),
                  prices: relevantTimestamps.map(ts => parseFloat(timeSeries[ts]['4. close'])),
                  candleCount: relevantTimestamps.length
                };
                console.log('Successfully fetched stock data from Alpha Vantage');
              }
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

      const volumeText = marketData.volume > 0 ? `- Volume: ${marketData.volume.toLocaleString()}` : '';
      
      metricsText = `
MARKET DATA (${marketData.source}, ${marketData.candleCount} candles):
- Price: ${marketData.open.toFixed(4)} → ${marketData.close.toFixed(4)} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent}%)
- Range: ${marketData.low.toFixed(4)} - ${marketData.high.toFixed(4)} (${rangePercent}% range)
- Volatility: ${volatility}%
${volumeText}
Time window: ${spanMinutes.toFixed(0)} minutes (${resolution} resolution)
`;
    } else {
      metricsText = `Note: Market data unavailable for ${normalizedSymbol} during ${spanMinutes.toFixed(0)}-minute window.`;
    }

    // Generate AI summary using Gemini with web search and market data
    let aiSummary = '';
    try {
      const analysisPrompt = `Analyze ${normalizedSymbol} price action from ${fromTime.toISOString().split('T')[0]} ${fromTime.toISOString().split('T')[1].split('.')[0]} to ${toTime.toISOString().split('T')[0]} ${toTime.toISOString().split('T')[1].split('.')[0]} UTC.

${metricsText}

Use Google Search to find news/catalysts during this exact timeframe. Provide EXACTLY this format:

• ${normalizedSymbol} moved ${marketData ? ((marketData.close - marketData.open) >= 0 ? 'up' : 'down') : '[direction]'} [specific % and price levels]
• [Key news/event that drove the movement, or "No clear catalyst found"]
• [Market reaction/flow details or broader context]

Sources: [Include 1-3 credible financial news URLs]

Each bullet must be under 25 words. Focus on factual price action and verifiable catalysts.${assetType === 'forex' ? ' Consider central bank comments, economic data, yield changes, risk sentiment.' : ' Consider earnings, guidance, sector news, analyst updates.'}`;

      console.log('Sending analysis prompt to Gemini with Google Search enabled');

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