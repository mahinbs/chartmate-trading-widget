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
    const { symbol, from, timeframe, priceTargetMin, priceTargetMax } = await req.json();
    
    const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!finnhubApiKey) {
      return new Response(JSON.stringify({ error: 'Finnhub API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromTime = new Date(from);
    const toTime = new Date();
    
    // Convert to Unix timestamps
    const fromTimestamp = Math.floor(fromTime.getTime() / 1000);
    const toTimestamp = Math.floor(toTime.getTime() / 1000);

    // Determine resolution based on timeframe
    const timeframeMins = {
      '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080
    };
    const minutes = timeframeMins[timeframe as keyof typeof timeframeMins] || 60;
    const resolution = minutes <= 60 ? '5' : minutes <= 1440 ? '60' : 'D';

    // Map symbol for forex if needed
    const mappedSymbol = symbol.startsWith('EUR') || symbol.startsWith('USD') || symbol.startsWith('GBP') || symbol.startsWith('JPY')
      ? `OANDA:${symbol}` : symbol;

    console.log(`Fetching data for ${mappedSymbol} from ${fromTime.toISOString()} to ${toTime.toISOString()}`);

    // Fetch candle data from Finnhub
    const candleUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${mappedSymbol}&resolution=${resolution}&from=${fromTimestamp}&to=${toTimestamp}&token=${finnhubApiKey}`;
    
    const candleResponse = await fetch(candleUrl);
    const candleData = await candleResponse.json();

    if (candleData.s !== 'ok' || !candleData.c || candleData.c.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Insufficient market data available for analysis period',
        from: fromTime.toISOString(),
        to: toTime.toISOString(),
        symbol: mappedSymbol
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate analytics
    const closePrices = candleData.c;
    const highPrices = candleData.h;
    const lowPrices = candleData.l;
    const openPrices = candleData.o;
    
    const startPrice = closePrices[0];
    const endPrice = closePrices[closePrices.length - 1];
    const changeAbs = endPrice - startPrice;
    const changePct = (changeAbs / startPrice) * 100;
    
    const high = Math.max(...highPrices);
    const low = Math.min(...lowPrices);
    
    // Count up vs down candles
    let upCandles = 0;
    let downCandles = 0;
    for (let i = 0; i < closePrices.length; i++) {
      if (closePrices[i] > openPrices[i]) upCandles++;
      else if (closePrices[i] < openPrices[i]) downCandles++;
    }

    // Check if targets were hit
    let hitMinTarget = null;
    let hitMaxTarget = null;
    if (priceTargetMin !== undefined && priceTargetMin !== null) {
      hitMinTarget = low <= priceTargetMin;
    }
    if (priceTargetMax !== undefined && priceTargetMax !== null) {
      hitMaxTarget = high >= priceTargetMax;
    }

    // Generate AI summary
    let aiSummary = '';
    if (geminiApiKey) {
      try {
        const analysisPrompt = `Analyze this stock movement in 2-3 short bullet points:
Symbol: ${symbol}
Period: ${timeframe} prediction from ${fromTime.toLocaleDateString()}
Price moved ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% (${startPrice.toFixed(2)} → ${endPrice.toFixed(2)})
High: ${high.toFixed(2)}, Low: ${low.toFixed(2)}
${upCandles} up candles, ${downCandles} down candles
${hitMinTarget !== null ? `Min target ${priceTargetMin}: ${hitMinTarget ? 'HIT' : 'not reached'}` : ''}
${hitMaxTarget !== null ? `Max target ${priceTargetMax}: ${hitMaxTarget ? 'HIT' : 'not reached'}` : ''}

Keep it concise and trader-friendly.`;

        const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + geminiApiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: analysisPrompt }]
            }]
          })
        });

        const geminiData = await geminiResponse.json();
        if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
          aiSummary = geminiData.candidates[0].content.parts[0].text.trim();
        }
      } catch (error) {
        console.error('Gemini API error:', error);
        aiSummary = 'AI analysis temporarily unavailable.';
      }
    } else {
      // Fallback summary without AI
      const direction = changePct > 0 ? 'rose' : 'fell';
      const magnitude = Math.abs(changePct) > 2 ? 'significantly' : 'modestly';
      aiSummary = `Price ${direction} ${magnitude} by ${Math.abs(changePct).toFixed(1)}% since prediction. ${upCandles > downCandles ? 'Bullish momentum dominated.' : downCandles > upCandles ? 'Bearish pressure prevailed.' : 'Mixed price action.'}`;
    }

    const response = {
      from: fromTime.toISOString(),
      to: toTime.toISOString(),
      startPrice,
      endPrice,
      changeAbs,
      changePct,
      high,
      low,
      upCandles,
      downCandles,
      hitMinTarget,
      hitMaxTarget,
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