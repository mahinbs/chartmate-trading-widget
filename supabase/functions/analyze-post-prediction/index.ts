import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { corsHeaders } from '../_shared/cors.ts';

// Yahoo Finance symbol normalization (duplicated from predict-movement)
function normalizeToYahooSymbol(raw: string): { yahooSymbol: string; assetType: 'stock' | 'forex' | 'crypto' | 'index' | 'commodity' } {
  // Strip exchange prefixes
  const cleanSymbol = raw.replace(/^(NASDAQ|NYSE|BINANCE|OANDA|SP|DJ|COMEX|NYMEX):/, '');
  
  // Stocks mapping
  if (/^[A-Z]{1,5}$/.test(cleanSymbol)) {
    // Indian stocks get .NS suffix
    if (raw.includes('NSE:')) {
      return { yahooSymbol: `${cleanSymbol}.NS`, assetType: 'stock' };
    }
    return { yahooSymbol: cleanSymbol, assetType: 'stock' };
  }
  
  // Forex mapping
  const forexPairs = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
  
  // Handle EUR_USD, EUR/USD, EURUSD formats
  let forexBase = '', forexQuote = '';
  if (cleanSymbol.includes('_')) {
    [forexBase, forexQuote] = cleanSymbol.split('_');
  } else if (cleanSymbol.includes('/')) {
    [forexBase, forexQuote] = cleanSymbol.split('/');
  } else if (cleanSymbol.length === 6 && /^[A-Z]{6}$/.test(cleanSymbol)) {
    forexBase = cleanSymbol.slice(0, 3);
    forexQuote = cleanSymbol.slice(3);
  }
  
  if (forexPairs.includes(forexBase) && forexPairs.includes(forexQuote)) {
    return { yahooSymbol: `${forexBase}${forexQuote}=X`, assetType: 'forex' };
  }
  
  // Crypto mapping
  const cryptoMap: Record<string, string> = {
    'BTCUSDT': 'BTC-USD',
    'BTCUSD': 'BTC-USD',
    'ETHUSDT': 'ETH-USD',
    'ETHUSD': 'ETH-USD',
    'SOLUSDT': 'SOL-USD',
    'SOLUSD': 'SOL-USD',
    'ADAUSDT': 'ADA-USD',
    'ADAUSD': 'ADA-USD',
  };
  
  if (cryptoMap[cleanSymbol]) {
    return { yahooSymbol: cryptoMap[cleanSymbol], assetType: 'crypto' };
  }
  
  // Index mapping
  const indexMap: Record<string, string> = {
    'SPX': '^GSPC',
    'DJI': '^DJI',
    'NDX': '^NDX',
  };
  
  if (indexMap[cleanSymbol]) {
    return { yahooSymbol: indexMap[cleanSymbol], assetType: 'index' };
  }
  
  // Commodity mapping
  const commodityMap: Record<string, string> = {
    'GOLD': 'GC=F',
    'GC1!': 'GC=F',
    'SILVER': 'SI=F',
    'SI1!': 'SI=F',
    'OIL': 'CL=F',
    'CL1!': 'CL=F',
  };
  
  if (commodityMap[cleanSymbol]) {
    return { yahooSymbol: commodityMap[cleanSymbol], assetType: 'commodity' };
  }
  
  // Default to stock
  return { yahooSymbol: cleanSymbol, assetType: 'stock' };
}

// Fetch chart data from Yahoo Finance using period1/period2
async function fetchYahooChartWithPeriod(params: { yahooSymbol: string; period1: number; period2: number; interval: string }): Promise<any[]> {
  const { yahooSymbol, period1, period2, interval } = params;
  console.log(`🟡 Fetching Yahoo chart: ${yahooSymbol}, interval: ${interval}, period1: ${period1}, period2: ${period2}`);
  
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${period1}&period2=${period2}&interval=${interval}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(15000)
    }
  );
  
  if (!response.ok) {
    throw new Error(`Yahoo chart HTTP ${response.status}: ${await response.text()}`);
  }
  
  const data = await response.json();
  
  if (!data.chart?.result?.[0]) {
    throw new Error('No chart data found in Yahoo response');
  }
  
  const result = data.chart.result[0];
  const timestamps = result.timestamp || [];
  const indicators = result.indicators?.quote?.[0];
  
  if (!indicators || !timestamps.length) {
    throw new Error('No price data in Yahoo chart response');
  }
  
  const candles: any[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (indicators.open?.[i] !== null && indicators.close?.[i] !== null) {
      candles.push({
        timestamp: timestamps[i] * 1000,
        open: indicators.open[i] || 0,
        high: indicators.high[i] || 0,
        low: indicators.low[i] || 0,
        close: indicators.close[i] || 0,
        volume: indicators.volume?.[i] || 0
      });
    }
  }
  
  console.log(`✅ Yahoo chart success: ${candles.length} candles for ${yahooSymbol}`);
  return candles;
}

// Generate fallback summary with realistic context
function generateFallbackSummary(marketData: any, displaySymbol: string, dataSourceInfo: string = '') {
  if (!marketData || !marketData.candles || marketData.candles.length === 0) {
    return `• No market data available for ${displaySymbol} in the specified timeframe.\n• Unable to provide analysis without price data.${dataSourceInfo ? `\n\nData: ${dataSourceInfo}` : ''}`;
  }

  const candles = marketData.candles;
  const open = candles[0].open;
  const close = candles[candles.length - 1].close;
  const high = Math.max(...candles.map((c: any) => c.high));
  const low = Math.min(...candles.map((c: any) => c.low));
  
  const priceChange = close - open;
  const priceChangePercent = ((priceChange / open) * 100).toFixed(2);
  const direction = priceChange >= 0 ? 'up' : 'down';
  const sign = priceChange >= 0 ? '+' : '';

  const dataSuffix = dataSourceInfo ? `\n\nData: ${dataSourceInfo}` : '';

  return `• ${displaySymbol} moved ${direction} by ${sign}${priceChangePercent}% from ${open.toFixed(6)} to ${close.toFixed(6)}.\n• High: ${high.toFixed(6)}, Low: ${low.toFixed(6)}\n• Total candles analyzed: ${candles.length}${dataSuffix}`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, from, to, expected, marketMeta } = await req.json();

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromTime = new Date(from);
    const toTime = to ? new Date(to) : new Date();

    console.log(`Analyzing ${symbol} from ${fromTime.toISOString()} to ${toTime.toISOString()}`);

    // Normalize symbol to Yahoo format
    const { yahooSymbol, assetType } = normalizeToYahooSymbol(symbol);
    console.log(`Mapped ${symbol} → ${yahooSymbol} (${assetType})`);

    // Use period1/period2 for precise time range
    const period1 = Math.floor((fromTime.getTime() - 5 * 60 * 1000) / 1000); // 5 min padding
    const period2 = Math.floor((toTime.getTime() - 60 * 1000) / 1000); // 1 min gap from now

    // Try different intervals until we get data
    const intervalSequence = ['1m', '2m', '5m', '15m', '30m', '60m', '1d'];
    let marketData = null;
    let dataSource = '';
    let triedIntervals: string[] = [];

    for (const interval of intervalSequence) {
      try {
        console.log(`🔄 Trying Yahoo with interval: ${interval}`);
        const candles = await fetchYahooChartWithPeriod({ 
          yahooSymbol, 
          period1, 
          period2, 
          interval 
        });
        
        if (candles.length > 0) {
          marketData = {
            source: `Yahoo Finance ${yahooSymbol} (${interval})`,
            candles,
            candleCount: candles.length
          };
          dataSource = `Yahoo Finance (${interval})`;
          console.log(`✅ Success with ${interval}: ${candles.length} candles`);
          break;
        } else {
          triedIntervals.push(`${interval} (no data)`);
        }
      } catch (error) {
        console.log(`❌ Failed with ${interval}:`, error.message);
        triedIntervals.push(`${interval} (error: ${error.message})`);
        continue;
      }
    }

    if (!marketData) {
      console.log(`⚠️ No data found for ${symbol} → ${yahooSymbol}. Tried: ${triedIntervals.join(', ')}`);
      return new Response(JSON.stringify({ 
        error: 'No market data available',
        tried: triedIntervals,
        summary: `No data available for ${symbol} in the specified timeframe.`,
        dataSource: 'Yahoo Finance (no data)'
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate summary from actual market data
    const summary = generateFallbackSummary(marketData, symbol, dataSource);

    // If we have expected values, calculate evaluation
    let evaluation = null;
    if (expected && marketData.candles.length > 0) {
      const candles = marketData.candles;
      const startPrice = candles[0].close;
      const endPrice = candles[candles.length - 1].close;
      const actualChangePercent = ((endPrice - startPrice) / startPrice) * 100;
      
      // Check price targets
      const hitTargetMax = expected.priceTargetMax ? candles.some((c: any) => c.high >= expected.priceTargetMax) : false;
      const hitTargetMin = expected.priceTargetMin ? candles.some((c: any) => c.low <= expected.priceTargetMin) : false;
      
      // Determine result based on direction and move percent
      let result: 'accurate' | 'partial' | 'failed' = 'failed';
      let reasoning = '';
      
      const threshold = expected.movePercent * 0.8; // 80% of predicted move for accuracy
      
      if (expected.direction === 'up') {
        if (actualChangePercent >= threshold) {
          result = 'accurate';
          reasoning = `Predicted upward move achieved: ${actualChangePercent.toFixed(2)}% vs target ${expected.movePercent}%`;
        } else if (actualChangePercent > 0) {
          result = 'partial';
          reasoning = `Moved up ${actualChangePercent.toFixed(2)}% but fell short of ${expected.movePercent}% target`;
        } else {
          result = 'failed';
          reasoning = `Moved down ${actualChangePercent.toFixed(2)}% instead of up ${expected.movePercent}%`;
        }
      } else if (expected.direction === 'down') {
        if (actualChangePercent <= -threshold) {
          result = 'accurate';
          reasoning = `Predicted downward move achieved: ${actualChangePercent.toFixed(2)}% vs target -${expected.movePercent}%`;
        } else if (actualChangePercent < 0) {
          result = 'partial';
          reasoning = `Moved down ${Math.abs(actualChangePercent).toFixed(2)}% but fell short of ${expected.movePercent}% target`;
        } else {
          result = 'failed';
          reasoning = `Moved up ${actualChangePercent.toFixed(2)}% instead of down ${expected.movePercent}%`;
        }
      } else if (expected.direction === 'neutral') {
        const absChange = Math.abs(actualChangePercent);
        if (absChange <= 0.5) {
          result = 'accurate';
          reasoning = `Stayed neutral with minimal movement: ${actualChangePercent.toFixed(2)}%`;
        } else if (absChange <= 1.0) {
          result = 'partial';
          reasoning = `Small movement of ${actualChangePercent.toFixed(2)}% close to neutral prediction`;
        } else {
          result = 'failed';
          reasoning = `Significant movement of ${actualChangePercent.toFixed(2)}% exceeded neutral prediction`;
        }
      }
      
      evaluation = {
        result,
        startPrice,
        endPrice,
        actualChangePercent,
        predictedDirection: expected.direction,
        predictedMovePercent: expected.movePercent,
        hitTargetMax,
        hitTargetMin,
        endTimeUsed: toTime.toISOString(),
        reasoning
      };
      
      console.log(`📊 Evaluation: ${result} - ${reasoning}`);
    }

    return new Response(JSON.stringify({
      symbol,
      summary,
      dataSource,
      marketData: {
        candleCount: marketData.candleCount,
        source: marketData.source,
        interval: dataSource.match(/\(([^)]+)\)/)?.[1] || 'unknown'
      },
      from: fromTime.toISOString(),
      to: toTime.toISOString(),
      evaluation
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-post-prediction function:', error);
    return new Response(JSON.stringify({
      error: 'Failed to analyze market data',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});