import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { symbol, from, marketMeta } = await req.json();

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

    return new Response(JSON.stringify({
      symbol,
      summary,
      dataSource,
      marketData: {
        candleCount: marketData.candleCount,
        source: marketData.source,
        interval: dataSource.match(/\(([^)]+)\)/)?.[1] || 'unknown'
      }
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