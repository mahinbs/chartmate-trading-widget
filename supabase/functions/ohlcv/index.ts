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

// Normalize stock symbol by removing exchange prefixes
function normalizeStockSymbol(symbol: string): string {
  return symbol.replace(/^(NASDAQ|NYSE|NYSEARCA|AMEX|BATS|CBOE|OTC):/i, '').trim();
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

// Convert interval to different provider formats with fallbacks
function getProviderInterval(interval: string, assetType: string): {
  twelveData: string,
  finnhub: string,
  alphaVantage: string
} {
  const mapping: Record<string, { twelveData: string, finnhub: string, alphaVantage: string }> = {
    '1': { twelveData: '1min', finnhub: '1', alphaVantage: '1min' },
    '5': { twelveData: '5min', finnhub: '5', alphaVantage: '5min' },
    '15': { twelveData: '15min', finnhub: '15', alphaVantage: '15min' },
    '60': { twelveData: '1h', finnhub: '60', alphaVantage: '60min' },
    '240': { twelveData: '4h', finnhub: '240', alphaVantage: '60min' }, // Alpha Vantage fallback
    'D': { twelveData: '1day', finnhub: 'D', alphaVantage: 'daily' },
    'W': { twelveData: '1week', finnhub: 'W', alphaVantage: 'weekly' }
  };
  
  // Handle unsupported intervals with fallbacks
  if (!mapping[interval]) {
    console.log(`⚠️ Unsupported interval ${interval}, falling back to daily`);
    return mapping['D'];
  }
  
  // For stocks, if 1min not supported by provider, use 5min
  if (interval === '1' && assetType === 'stock') {
    return {
      ...mapping[interval],
      alphaVantage: '5min' // Alpha Vantage often limits 1min access
    };
  }
  
  return mapping[interval];
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
  let endpoint = 'stock/candle';
  
  if (assetType === 'forex') {
    const normalized = normalizeForexSymbol(symbol);
    querySymbol = normalized.finnhub;
    endpoint = 'forex/candle';
  } else if (assetType === 'crypto') {
    // Keep original symbol if it has exchange prefix like BINANCE:
    querySymbol = symbol.includes(':') ? symbol : `BINANCE:${symbol}`;
    endpoint = 'crypto/candle';
  } else {
    // Stock: normalize by removing exchange prefixes
    querySymbol = normalizeStockSymbol(symbol);
  }
  
  const providerInterval = getProviderInterval(interval, assetType);
  const now = Math.floor(Date.now() / 1000);
  const fromTime = from || (now - 30 * 24 * 60 * 60); // 30 days ago if not specified
  const toTime = to || now;
  
  const url = `https://finnhub.io/api/v1/${endpoint}?symbol=${querySymbol}&resolution=${providerInterval.finnhub}&from=${fromTime}&to=${toTime}&token=${apiKey}`;
  
  console.log(`🔄 Finnhub OHLCV: ${url}`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.s !== 'ok' || !data.t) {
    throw new Error(`Finnhub error: ${data.s || 'undefined'}`);
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
    const [base, quote] = normalized.alphaVantage.length === 6 
      ? [normalized.alphaVantage.slice(0, 3), normalized.alphaVantage.slice(3)]
      : [normalized.alphaVantage.split('_')[0], normalized.alphaVantage.split('_')[1]];
    querySymbol = `${base}${quote}`;
    functionName = 'FX_DAILY';
  } else if (assetType === 'crypto') {
    // For crypto, extract base currency (e.g., BTC from BTCUSDT)
    const cleanSymbol = normalizeStockSymbol(symbol);
    if (cleanSymbol.includes('USDT')) {
      querySymbol = cleanSymbol.replace('USDT', '');
    } else if (cleanSymbol.includes('USD')) {
      querySymbol = cleanSymbol.replace('USD', '');
    } else {
      querySymbol = cleanSymbol;
    }
    functionName = 'DIGITAL_CURRENCY_DAILY';
  } else {
    // Stock: normalize by removing exchange prefixes
    querySymbol = normalizeStockSymbol(symbol);
  }
  
  // Map intervals to Alpha Vantage functions
  const providerInterval = getProviderInterval(interval, assetType);
  if (providerInterval.alphaVantage.includes('min')) {
    if (assetType === 'forex') {
      functionName = 'FX_INTRADAY';
    } else if (assetType === 'crypto') {
      // Alpha Vantage crypto only supports daily/weekly
      functionName = 'DIGITAL_CURRENCY_DAILY';
    } else {
      functionName = 'TIME_SERIES_INTRADAY';
    }
  } else if (providerInterval.alphaVantage === 'weekly') {
    if (assetType === 'forex') {
      functionName = 'FX_WEEKLY';
    } else if (assetType === 'crypto') {
      functionName = 'DIGITAL_CURRENCY_WEEKLY';
    } else {
      functionName = 'TIME_SERIES_WEEKLY';
    }
  }
  
  let url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${querySymbol}&apikey=${apiKey}`;
  
  if (functionName.includes('INTRADAY')) {
    url += `&interval=${providerInterval.alphaVantage}`;
  }
  
  if (functionName.includes('DIGITAL_CURRENCY')) {
    url += '&market=USD';
  }
  
  console.log(`🔄 Alpha Vantage OHLCV: ${url}`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  // Find the time series data key
  const timeSeriesKey = Object.keys(data).find(key => 
    key.includes('Time Series') || 
    key.includes('FX') || 
    key.includes('Digital Currency')
  );
  
  if (!timeSeriesKey || !data[timeSeriesKey]) {
    throw new Error(`Alpha Vantage error: ${data['Error Message'] || data['Information'] || 'No data'}`);
  }
  
  const timeSeries = data[timeSeriesKey];
  
  return Object.entries(timeSeries).map(([datetime, values]: [string, any]) => ({
    time: Math.floor(new Date(datetime).getTime() / 1000),
    open: parseFloat(values['1. open'] || values['1a. open (USD)'] || values['1b. open (USD)']),
    high: parseFloat(values['2. high'] || values['2a. high (USD)'] || values['2b. high (USD)']),
    low: parseFloat(values['3. low'] || values['3a. low (USD)'] || values['3b. low (USD)']),
    close: parseFloat(values['4. close'] || values['4a. close (USD)'] || values['4b. close (USD)']),
    volume: parseFloat(values['5. volume'] || values['6. volume'] || '0')
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
    const normalizedSymbol = assetType === 'stock' ? normalizeStockSymbol(symbol) : symbol;
    console.log(`🔍 Asset type detected: ${assetType} for symbol ${symbol}, normalized: ${normalizedSymbol}`);
    
    let data: OHLCVCandle[] = [];
    let provider = '';
    const providerErrors: Array<{provider: string, message: string, url?: string}> = [];
    
    // Try providers in order based on asset type
    const providers = assetType === 'stock' 
      ? ['finnhub', 'alphaVantage', 'twelveData']
      : assetType === 'forex'
      ? ['alphaVantage', 'finnhub', 'twelveData'] 
      : ['finnhub', 'alphaVantage', 'twelveData']; // crypto
    
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
        const errorMessage = error.message;
        console.log(`❌ ${providerName} failed: ${errorMessage}`);
        providerErrors.push({
          provider: providerName,
          message: errorMessage
        });
        continue;
      }
    }
    
    if (data.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No data available from any provider',
          providerErrors
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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