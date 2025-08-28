import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OHLCVRequest {
  symbol: string;
  interval: string;
  from?: number; // timestamp
  to?: number; // timestamp
}

interface OHLCVCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface OHLCVResponse {
  symbol: string;
  interval: string;
  data: OHLCVCandle[];
  provider: string;
}

// Detect asset type from symbol
function detectAssetType(symbol: string): 'forex' | 'crypto' | 'stock' {
  const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|OANDA|BINANCE):/i, '').trim();
  
  // Forex patterns (pair format)
  if (/^[A-Z]{3}[_/][A-Z]{3}$/.test(cleanSymbol) || 
      /^[A-Z]{6}$/.test(cleanSymbol) ||
      symbol.toUpperCase().includes('OANDA:')) {
    return 'forex';
  }
  
  // Crypto patterns
  if (cleanSymbol.includes('USDT') || 
      cleanSymbol.includes('BTC') || 
      cleanSymbol.includes('ETH') ||
      symbol.toUpperCase().includes('BINANCE:')) {
    return 'crypto';
  }
  
  return 'stock';
}

// Normalize forex symbol for different providers
function normalizeForexSymbol(symbol: string): { 
  forexRateAPI: string, 
  twelveData: string, 
  finnhub: string,
  alphaVantage: string 
} {
  const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|OANDA|BINANCE):/i, '').trim();
  
  let base: string, quote: string;
  
  if (cleanSymbol.includes('_')) {
    [base, quote] = cleanSymbol.split('_');
  } else if (cleanSymbol.includes('/')) {
    [base, quote] = cleanSymbol.split('/');
  } else if (cleanSymbol.length === 6) {
    base = cleanSymbol.slice(0, 3);
    quote = cleanSymbol.slice(3);
  } else {
    return {
      forexRateAPI: cleanSymbol,
      twelveData: cleanSymbol,
      finnhub: cleanSymbol,
      alphaVantage: cleanSymbol
    };
  }
  
  return {
    forexRateAPI: `${base}${quote}`,
    twelveData: `${base}/${quote}`,
    finnhub: `OANDA:${base}_${quote}`,
    alphaVantage: `${base}${quote}`
  };
}

// Convert interval to different provider formats
function getProviderInterval(interval: string): {
  twelveData: string,
  finnhub: string,
  alphaVantage: string
} {
  const mapping: Record<string, { twelveData: string, finnhub: string, alphaVantage: string }> = {
    '1': { twelveData: '1min', finnhub: '1', alphaVantage: '1min' },
    '5': { twelveData: '5min', finnhub: '5', alphaVantage: '5min' },
    '15': { twelveData: '15min', finnhub: '15', alphaVantage: '15min' },
    '60': { twelveData: '1h', finnhub: '60', alphaVantage: '60min' },
    '240': { twelveData: '4h', finnhub: '240', alphaVantage: '4h' },
    'D': { twelveData: '1day', finnhub: 'D', alphaVantage: 'daily' },
    'W': { twelveData: '1week', finnhub: 'W', alphaVantage: 'weekly' }
  };
  
  return mapping[interval] || mapping['D'];
}

// Fetch from Twelve Data
async function fetchTwelveData(symbol: string, interval: string, from?: number, to?: number): Promise<OHLCVCandle[]> {
  const apiKey = Deno.env.get('TWELVEDATA_API_KEY');
  if (!apiKey) throw new Error('Twelve Data API key not configured');
  
  const assetType = detectAssetType(symbol);
  let querySymbol = symbol;
  
  if (assetType === 'forex') {
    const normalized = normalizeForexSymbol(symbol);
    querySymbol = normalized.twelveData;
  }
  
  const providerInterval = getProviderInterval(interval);
  
  let url = `https://api.twelvedata.com/time_series?symbol=${querySymbol}&interval=${providerInterval.twelveData}&apikey=${apiKey}&format=JSON&outputsize=300`;
  
  if (from) {
    url += `&start_date=${new Date(from * 1000).toISOString().split('T')[0]}`;
  }
  if (to) {
    url += `&end_date=${new Date(to * 1000).toISOString().split('T')[0]}`;
  }
  
  console.log(`🔄 Twelve Data OHLCV: ${url}`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status === 'error' || !data.values) {
    throw new Error(`Twelve Data error: ${data.message || 'No data'}`);
  }
  
  return data.values.map((candle: any) => ({
    time: Math.floor(new Date(candle.datetime).getTime() / 1000),
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume) || 0
  })).reverse(); // Twelve Data returns newest first, we want oldest first
}

// Fetch from Finnhub
async function fetchFinnhub(symbol: string, interval: string, from?: number, to?: number): Promise<OHLCVCandle[]> {
  const apiKey = Deno.env.get('FINNHUB_API_KEY');
  if (!apiKey) throw new Error('Finnhub API key not configured');
  
  const assetType = detectAssetType(symbol);
  let querySymbol = symbol;
  
  if (assetType === 'forex') {
    const normalized = normalizeForexSymbol(symbol);
    querySymbol = normalized.finnhub;
  }
  
  const providerInterval = getProviderInterval(interval);
  const now = Math.floor(Date.now() / 1000);
  const fromTime = from || (now - 30 * 24 * 60 * 60); // 30 days ago if not specified
  const toTime = to || now;
  
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${querySymbol}&resolution=${providerInterval.finnhub}&from=${fromTime}&to=${toTime}&token=${apiKey}`;
  
  console.log(`🔄 Finnhub OHLCV: ${url}`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.s !== 'ok' || !data.t) {
    throw new Error(`Finnhub error: ${data.s}`);
  }
  
  return data.t.map((timestamp: number, index: number) => ({
    time: timestamp,
    open: data.o[index],
    high: data.h[index],
    low: data.l[index],
    close: data.c[index],
    volume: data.v[index] || 0
  }));
}

// Fetch from Alpha Vantage
async function fetchAlphaVantage(symbol: string, interval: string): Promise<OHLCVCandle[]> {
  const apiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
  if (!apiKey) throw new Error('Alpha Vantage API key not configured');
  
  const assetType = detectAssetType(symbol);
  let querySymbol = symbol;
  let functionName = 'TIME_SERIES_DAILY';
  
  if (assetType === 'forex') {
    const normalized = normalizeForexSymbol(symbol);
    querySymbol = normalized.alphaVantage;
    functionName = 'FX_DAILY';
  }
  
  // Map intervals to Alpha Vantage functions
  const providerInterval = getProviderInterval(interval);
  if (providerInterval.alphaVantage.includes('min')) {
    functionName = assetType === 'forex' ? 'FX_INTRADAY' : 'TIME_SERIES_INTRADAY';
  } else if (providerInterval.alphaVantage === 'weekly') {
    functionName = assetType === 'forex' ? 'FX_WEEKLY' : 'TIME_SERIES_WEEKLY';
  }
  
  let url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${querySymbol}&apikey=${apiKey}`;
  
  if (functionName.includes('INTRADAY')) {
    url += `&interval=${providerInterval.alphaVantage}`;
  }
  
  console.log(`🔄 Alpha Vantage OHLCV: ${url}`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  // Find the time series data key
  const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series') || key.includes('FX'));
  
  if (!timeSeriesKey || !data[timeSeriesKey]) {
    throw new Error(`Alpha Vantage error: ${data['Error Message'] || data['Information'] || 'No data'}`);
  }
  
  const timeSeries = data[timeSeriesKey];
  
  return Object.entries(timeSeries).map(([datetime, values]: [string, any]) => ({
    time: Math.floor(new Date(datetime).getTime() / 1000),
    open: parseFloat(values['1. open'] || values['1a. open (USD)']),
    high: parseFloat(values['2. high'] || values['2a. high (USD)']),
    low: parseFloat(values['3. low'] || values['3a. low (USD)']),
    close: parseFloat(values['4. close'] || values['4a. close (USD)']),
    volume: parseFloat(values['5. volume'] || '0')
  })).sort((a, b) => a.time - b.time); // Sort by time ascending
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, interval, from, to }: OHLCVRequest = await req.json();
    
    if (!symbol || !interval) {
      return new Response(
        JSON.stringify({ error: 'Symbol and interval are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 OHLCV Request: ${symbol}, ${interval}, from: ${from}, to: ${to}`);
    
    const assetType = detectAssetType(symbol);
    console.log(`🔍 Asset type detected: ${assetType} for symbol ${symbol}`);
    
    let data: OHLCVCandle[] = [];
    let provider = '';
    
    // Try providers in order based on asset type
    const providers = assetType === 'forex' 
      ? ['twelveData', 'alphaVantage', 'finnhub']
      : ['finnhub', 'alphaVantage', 'twelveData'];
    
    for (const providerName of providers) {
      try {
        console.log(`🔄 Trying ${providerName} for ${symbol}...`);
        
        if (providerName === 'twelveData') {
          data = await fetchTwelveData(symbol, interval, from, to);
          provider = 'Twelve Data';
        } else if (providerName === 'finnhub') {
          data = await fetchFinnhub(symbol, interval, from, to);
          provider = 'Finnhub';
        } else if (providerName === 'alphaVantage') {
          data = await fetchAlphaVantage(symbol, interval);
          provider = 'Alpha Vantage';
        }
        
        if (data.length > 0) {
          console.log(`✅ Success with ${provider}: ${data.length} candles`);
          break;
        }
      } catch (error) {
        console.log(`❌ ${providerName} failed: ${error.message}`);
        continue;
      }
    }
    
    if (data.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data available from any provider' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const response: OHLCVResponse = {
      symbol,
      interval,
      data,
      provider
    };
    
    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in OHLCV function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});