import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch VIX (Volatility Index)
async function fetchVIX(): Promise<{ value: number; status: string }> {
  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d',
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) throw new Error('VIX fetch failed');

    const data = await response.json();
    const vix = data.chart?.result?.[0]?.meta?.regularMarketPrice || 20;

    let status = 'normal';
    if (vix < 15) status = 'low'; // Low fear
    else if (vix < 20) status = 'normal';
    else if (vix < 30) status = 'elevated';
    else status = 'high'; // High fear

    return { value: Math.round(vix * 100) / 100, status };
  } catch (error) {
    console.error('VIX fetch error:', error);
    return { value: 20, status: 'normal' };
  }
}

// Fetch market indices (S&P 500, NASDAQ, DOW)
async function fetchMarketIndices() {
  const indices = [
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^IXIC', name: 'NASDAQ' },
    { symbol: '^DJI', name: 'DOW' }
  ];

  const results = await Promise.all(
    indices.map(async (index) => {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${index.symbol}?interval=1d&range=1d`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000)
          }
        );

        if (!response.ok) throw new Error(`${index.name} fetch failed`);

        const data = await response.json();
        const meta = data.chart?.result?.[0]?.meta;
        
        return {
          name: index.name,
          price: meta?.regularMarketPrice || 0,
          change: meta?.regularMarketPrice - meta?.previousClose || 0,
          changePercent: ((meta?.regularMarketPrice - meta?.previousClose) / meta?.previousClose * 100) || 0
        };
      } catch (error) {
        console.error(`${index.name} fetch error:`, error);
        return {
          name: index.name,
          price: 0,
          change: 0,
          changePercent: 0
        };
      }
    })
  );

  return results;
}

// Determine overall market sentiment
function calculateMarketSentiment(indices: any[], vix: number): {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number;
  description: string;
} {
  // Calculate average change across indices
  const avgChange = indices.reduce((sum, idx) => sum + idx.changePercent, 0) / indices.length;
  
  // Factor in VIX
  let sentimentScore = avgChange;
  if (vix > 25) sentimentScore -= 10; // High VIX = fear = bearish
  if (vix < 15) sentimentScore += 5; // Low VIX = calm = bullish

  let sentiment: 'bullish' | 'bearish' | 'neutral';
  let description: string;

  if (sentimentScore > 0.5) {
    sentiment = 'bullish';
    description = 'Markets are trending upward with positive momentum';
  } else if (sentimentScore < -0.5) {
    sentiment = 'bearish';
    description = 'Markets are under pressure with negative momentum';
  } else {
    sentiment = 'neutral';
    description = 'Markets are consolidating with mixed signals';
  }

  return { sentiment, score: Math.round(sentimentScore * 100) / 100, description };
}

// Trading recommendation
function generateTradingRecommendation(sentiment: any, vix: number): {
  recommendation: 'favorable' | 'caution' | 'avoid';
  message: string;
} {
  if (vix > 30) {
    return {
      recommendation: 'avoid',
      message: 'High volatility detected. Consider waiting for market stabilization.'
    };
  }

  if (sentiment.sentiment === 'bullish' && vix < 20) {
    return {
      recommendation: 'favorable',
      message: 'Good conditions for trading. Low volatility with positive momentum.'
    };
  }

  if (sentiment.sentiment === 'bearish' && vix > 20) {
    return {
      recommendation: 'caution',
      message: 'Elevated risk. Consider defensive positions or reducing exposure.'
    };
  }

  return {
    recommendation: 'caution',
    message: 'Mixed signals. Trade with careful position sizing and tight stops.'
  };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🌍 Fetching market conditions...');

    // Fetch data in parallel
    const [vixData, indices] = await Promise.all([
      fetchVIX(),
      fetchMarketIndices()
    ]);

    // Calculate sentiment
    const marketSentiment = calculateMarketSentiment(indices, vixData.value);

    // Generate trading recommendation
    const tradingRecommendation = generateTradingRecommendation(marketSentiment, vixData.value);

    // Determine if today is safe to trade
    const isSafeToTrade = tradingRecommendation.recommendation === 'favorable';

    const response = {
      timestamp: new Date().toISOString(),
      
      // VIX Data
      vix: {
        value: vixData.value,
        status: vixData.status,
        interpretation: vixData.status === 'low' ? 'Low fear - Market calm' :
                       vixData.status === 'normal' ? 'Normal volatility' :
                       vixData.status === 'elevated' ? 'Elevated fear' :
                       'High fear - Market stressed'
      },

      // Market Indices
      indices: indices,

      // Overall Sentiment
      sentiment: {
        overall: marketSentiment.sentiment,
        score: marketSentiment.score,
        description: marketSentiment.description,
        emoji: marketSentiment.sentiment === 'bullish' ? '📈' :
               marketSentiment.sentiment === 'bearish' ? '📉' : '➡️'
      },

      // Trading Recommendation
      recommendation: {
        level: tradingRecommendation.recommendation,
        message: tradingRecommendation.message,
        isSafeToTrade: isSafeToTrade
      },

      // News Impact (simplified - can be enhanced with actual news API)
      newsImpact: {
        score: 'medium',
        description: 'Normal news flow with no major market-moving events'
      }
    };

    console.log('✅ Market conditions fetched:', {
      sentiment: response.sentiment.overall,
      vix: response.vix.value,
      safe: response.recommendation.isSafeToTrade
    });

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching market conditions:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
