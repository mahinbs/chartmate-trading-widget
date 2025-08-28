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

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalIndicators {
  sma20: number;
  sma50: number;
  ema12: number;
  ema26: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  atr: number;
}

interface TechnicalContext {
  candles: Candle[];
  indicators: TechnicalIndicators;
  patterns: string[];
  supportLevels: number[];
  resistanceLevels: number[];
  volumeProfile: string;
  volatilityState: string;
  trendDirection: string;
}

interface MarketMeta {
  provider: string;
  symbol: string;
  resolution: string;
  needsInversion: boolean;
  assetType: string;
  requestedPair?: string;
  providerPair?: string;
}

async function fetchTwelveDataForex(symbol: string, timeframe: string): Promise<{ candles: Candle[]; meta: MarketMeta | null }> {
  const twelveDataApiKey = Deno.env.get('TWELVEDATA_API_KEY');
  
  if (!twelveDataApiKey) {
    console.log('Twelve Data API key not configured for forex');
    return { candles: [], meta: null };
  }

  try {
    const assetInfo = detectAssetType(symbol);
    if (assetInfo.type !== 'forex') {
      return { candles: [], meta: null };
    }

    // Map timeframe to Twelve Data interval
    const intervalMap: { [key: string]: string } = {
      '1h': '1h',
      '30m': '30min',
      '15m': '15min',
      '5m': '5min',
      '4h': '4h',
      '1d': '1day',
      '1w': '1week',
      '1m': '1month'
    };

    const interval = intervalMap[timeframe] || '1h';
    const outputsize = '100'; // Get 100 data points

    console.log(`Fetching forex data from Twelve Data for ${symbol} with interval ${interval}`);

    const response = await fetch(
      `https://api.twelvedata.com/time_series?symbol=${assetInfo.normalizedSymbol}&interval=${interval}&outputsize=${outputsize}&apikey=${twelveDataApiKey}`
    );

    if (!response.ok) {
      console.log(`Twelve Data API error for ${symbol}: ${response.status}`);
      return { candles: [], meta: null };
    }

    const data = await response.json();

    if (!data.values || data.values.length === 0) {
      console.log(`No forex data found for ${symbol} from Twelve Data`);
      return { candles: [], meta: null };
    }

    // Convert to candle format
    let candles: Candle[] = data.values.map((item: any) => ({
      timestamp: new Date(item.datetime).getTime(),
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseFloat(item.volume) || 0
    }));

    // Apply inversion if needed
    if (assetInfo.needsInversion) {
      candles = candles.map(c => ({
        ...c,
        open: 1 / c.close,
        close: 1 / c.open,
        high: 1 / c.low,
        low: 1 / c.high
      }));
      console.log(`Inverted forex data from ${assetInfo.providerPair} to ${assetInfo.requestedPair}`);
    }

    const meta: MarketMeta = {
      provider: 'Twelve Data',
      symbol: assetInfo.normalizedSymbol,
      resolution: interval,
      needsInversion: assetInfo.needsInversion || false,
      assetType: assetInfo.type,
      requestedPair: assetInfo.requestedPair,
      providerPair: assetInfo.providerPair
    };

    console.log(`Successfully fetched ${candles.length} forex candles from Twelve Data`);
    return { candles, meta };

  } catch (error) {
    console.error('Error fetching forex data from Twelve Data:', error);
    return { candles: [], meta: null };
  }
}

async function fetchHistoricalCandles(symbol: string, timeframe: string): Promise<{ candles: Candle[]; meta: MarketMeta | null }> {
  const assetInfo = detectAssetType(symbol);
  
  // For forex, prioritize Twelve Data
  if (assetInfo.type === 'forex') {
    const result = await fetchTwelveDataForex(symbol, timeframe);
    if (result.candles.length > 0) {
      return result;
    }
    console.log('Twelve Data failed for forex, falling back to Finnhub');
  }

  const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');

  if (!finnhubApiKey) {
    console.log('Finnhub API key not configured, returning empty candles');
    return { candles: [], meta: null };
  }

  try {
    // Use the same symbol detection logic from analyze-post-prediction
    function detectAssetType(symbol: string) {
      const forexPairs = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNY', 'INR', 'KRW', 'THB', 'MYR', 'IDR', 'PHP'];

      if (symbol.includes('/')) {
        const [base, quote] = symbol.split('/');
        return {
          type: 'forex',
          normalizedSymbol: symbol,
          requestedPair: symbol,
          providerPair: symbol,
          needsInversion: false
        };
      }

      if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
        const base = symbol.slice(0, 3);
        const quote = symbol.slice(3);
        if (forexPairs.includes(base) && forexPairs.includes(quote)) {
          const requestedPair = `${base}/${quote}`;

          let providerPair = requestedPair;
          let needsInversion = false;

          if ((base === 'JPY' && quote === 'USD') ||
            (base === 'EUR' && quote === 'USD') ||
            (base === 'GBP' && quote === 'USD')) {
            providerPair = `USD/${base}`;
            needsInversion = true;
          }

          return {
            type: 'forex',
            normalizedSymbol: providerPair,
            requestedPair,
            providerPair,
            needsInversion
          };
        }
      }

      return { type: 'stock', normalizedSymbol: symbol };
    }

    const assetInfo = detectAssetType(symbol);

    // Map common forex symbols to Finnhub format
    let finnhubSymbol = symbol;
    if (assetInfo.type === 'forex') {
      const [base, quote] = assetInfo.normalizedSymbol.split('/');
      finnhubSymbol = `OANDA:${base}_${quote}`;
    }

    // Map timeframe to resolution and calculate from/to timestamps
    const resolutionMap: { [key: string]: string } = {
      '1h': '60',
      '30m': '30',
      '15m': '15',
      '5m': '5',
      '4h': '240',
      '1d': 'D',
      '1w': 'W',
      '1m': 'M'
    };

    const resolution = resolutionMap[timeframe] || 'D';
    const to = Math.floor(Date.now() / 1000);
    const from = to - (100 * 24 * 60 * 60); // 100 days of data

    console.log(`Fetching candles for ${symbol} (mapped to ${finnhubSymbol}) with resolution ${resolution}`);

    const response = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${finnhubSymbol}&resolution=${resolution}&from=${from}&to=${to}&token=${finnhubApiKey}`
    );

    if (!response.ok) {
      console.log(`Finnhub candles API error for ${symbol}: ${response.status}`);
      return { candles: [], meta: null };
    }

    const data = await response.json();

    if (data.s !== 'ok' || !data.c || data.c.length === 0) {
      console.log(`No candle data found for ${symbol}`);
      return { candles: [], meta: null };
    }

    // Convert to candle format
    let candles: Candle[] = [];
    for (let i = 0; i < data.c.length; i++) {
      candles.push({
        timestamp: data.t[i] * 1000,
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i] || 0
      });
    }

    // Apply inversion if needed
    if (assetInfo.needsInversion) {
      candles = candles.map(c => ({
        ...c,
        open: 1 / c.close,
        close: 1 / c.open,
        high: 1 / c.low,
        low: 1 / c.high
      }));
      console.log(`Inverted candle data from ${assetInfo.providerPair} to ${assetInfo.requestedPair}`);
    }

    const meta: MarketMeta = {
      provider: 'Finnhub',
      symbol: finnhubSymbol,
      resolution,
      needsInversion: assetInfo.needsInversion || false,
      assetType: assetInfo.type,
      requestedPair: assetInfo.requestedPair,
      providerPair: assetInfo.providerPair
    };

    return { candles: candles.slice(-100), meta }; // Keep last 100 candles
  } catch (error) {
    console.error(`Error fetching candles for ${symbol}:`, error);
    return { candles: [], meta: null };
  }
}

// Asset type detection for smart provider routing
function detectAssetType(symbol: string): { type: 'forex' | 'crypto' | 'stock'; base?: string; quote?: string } {
  const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|BINANCE|OANDA):/, '');

  // Detect forex pairs
  const forexPairs = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
  if (cleanSymbol.length === 6 && /^[A-Z]{6}$/.test(cleanSymbol)) {
    const base = cleanSymbol.slice(0, 3);
    const quote = cleanSymbol.slice(3);
    if (forexPairs.includes(base) && forexPairs.includes(quote)) {
      return { type: 'forex', base, quote };
    }
  }

  // Detect crypto (comprehensive crypto detection)
  const cryptoTokens = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'UNI', 'LTC', 'XRP', 'DOGE', 'MATIC', 'AVAX'];
  const isCrypto = cryptoTokens.some(token => cleanSymbol.includes(token)) ||
    symbol.includes('BINANCE:') ||
    symbol.includes('COINBASE:') ||
    symbol.includes('KRAKEN:') ||
    cleanSymbol.includes('USDT') ||
    cleanSymbol.includes('USDC');

  if (isCrypto) {
    return { type: 'crypto' };
  }

  // Default to stock
  return { type: 'stock' };
}

// Enhanced symbol mapping based on asset type and provider capabilities
function getFinnhubSymbol(symbol: string): string[] {
  const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|BINANCE|OANDA):/, '');
  const assetInfo = detectAssetType(symbol);

  console.log(`🔍 Asset detected: ${assetInfo.type} for symbol ${cleanSymbol}`);

  // For forex, return empty array to skip Finnhub (free tier doesn't support forex well)
  if (assetInfo.type === 'forex') {
    console.log(`🔄 Forex detected (${cleanSymbol}). Skipping Finnhub, routing to Alpha Vantage.`);
    return [];
  }

  // For crypto, use Finnhub's supported crypto exchanges (these work well on free tier)
  if (assetInfo.type === 'crypto') {
    console.log(`₿ Crypto detected (${cleanSymbol}). Using Finnhub crypto exchanges.`);
    if (cleanSymbol.includes('BTC')) {
      return ['BINANCE:BTCUSDT', 'COINBASE:BTC-USD', 'KRAKEN:XBTUSD'];
    } else if (cleanSymbol.includes('ETH')) {
      return ['BINANCE:ETHUSDT', 'COINBASE:ETH-USD', 'KRAKEN:ETHUSD'];
    } else if (cleanSymbol.includes('ADA')) {
      return ['BINANCE:ADAUSDT', 'COINBASE:ADA-USD', 'KRAKEN:ADAUSD'];
    } else if (cleanSymbol.includes('SOL')) {
      return ['BINANCE:SOLUSDT', 'COINBASE:SOL-USD', 'KRAKEN:SOLUSD'];
    } else if (cleanSymbol.includes('DOT')) {
      return ['BINANCE:DOTUSDT', 'COINBASE:DOT-USD', 'KRAKEN:DOTUSD'];
    }
    // Fallback for other crypto
    return [cleanSymbol];
  }

  // For stocks, use multiple exchange formats (these work on free tier for quotes)
  console.log(`📈 Stock detected (${cleanSymbol}). Using stock exchanges.`);
  return [cleanSymbol, `NASDAQ:${cleanSymbol}`, `NYSE:${cleanSymbol}`];
}

// Enhanced Alpha Vantage implementation with rate limit handling
async function fetchAlphaVantageData(symbol: string): Promise<StockData> {
  const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');

  if (!alphaVantageApiKey) {
    throw new Error('Alpha Vantage API key not configured');
  }

  const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|BINANCE|OANDA):/, '');
  console.log(`🟡 Alpha Vantage: Processing ${cleanSymbol}`);

  try {
    const assetInfo = detectAssetType(symbol);

    if (assetInfo.type === 'forex') {
      const base = cleanSymbol.slice(0, 3);
      const quote = cleanSymbol.slice(3);
      console.log(`🟡 Alpha Vantage: Fetching forex ${base}/${quote}`);

      const forexResponse = await fetch(
        `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=${quote}&apikey=${alphaVantageApiKey}`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!forexResponse.ok) {
        throw new Error(`HTTP ${forexResponse.status}: ${await forexResponse.text()}`);
      }

      const forexData = await forexResponse.json();
      console.log(`🟡 Alpha Vantage Forex Response:`, JSON.stringify(forexData, null, 2));

      // Check for rate limit messages
      if (forexData.Note || forexData.Information) {
        const msg = forexData.Note || forexData.Information;
        console.error(`⚠️ Alpha Vantage Rate Limit: ${msg}`);
        throw new Error(`Rate limited: ${msg}`);
      }

      if (forexData['Error Message']) {
        console.error(`❌ Alpha Vantage Error: ${forexData['Error Message']}`);
        throw new Error(`API error: ${forexData['Error Message']}`);
      }

      const rate = forexData['Realtime Currency Exchange Rate'];
      if (rate && rate['5. Exchange Rate']) {
        const currentPrice = parseFloat(rate['5. Exchange Rate']);
        const bidPrice = parseFloat(rate['8. Bid Price'] || currentPrice);
        const askPrice = parseFloat(rate['9. Ask Price'] || currentPrice);

        console.log(`✅ Alpha Vantage Forex Success: ${base}/${quote} = ${currentPrice}`);

        return {
          currentPrice,
          openPrice: currentPrice,
          highPrice: askPrice,
          lowPrice: bidPrice,
          previousClose: currentPrice,
          change: 0,
          changePercent: 0
        };
      } else {
        throw new Error('No exchange rate data in Alpha Vantage response');
      }
    } else if (assetInfo.type === 'crypto') {
      // Handle crypto symbols - use different function for digital currencies
      console.log(`🟡 Alpha Vantage: Fetching crypto ${cleanSymbol}`);

      // Extract crypto symbol (BTC from BTCUSD, ETH from ETHUSD, etc.)
      let cryptoSymbol = cleanSymbol;
      if (cleanSymbol.includes('USD')) {
        cryptoSymbol = cleanSymbol.replace('USD', '').replace('USDT', '');
      }

      const cryptoResponse = await fetch(
        `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${cryptoSymbol}&to_currency=USD&apikey=${alphaVantageApiKey}`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!cryptoResponse.ok) {
        throw new Error(`HTTP ${cryptoResponse.status}: ${await cryptoResponse.text()}`);
      }

      const cryptoData = await cryptoResponse.json();
      console.log(`🟡 Alpha Vantage Crypto Response:`, JSON.stringify(cryptoData, null, 2));

      // Check for rate limit messages
      if (cryptoData.Note || cryptoData.Information) {
        const msg = cryptoData.Note || cryptoData.Information;
        console.error(`⚠️ Alpha Vantage Rate Limit: ${msg}`);
        throw new Error(`Rate limited: ${msg}`);
      }

      if (cryptoData['Error Message']) {
        console.error(`❌ Alpha Vantage Error: ${cryptoData['Error Message']}`);
        throw new Error(`API error: ${cryptoData['Error Message']}`);
      }

      const rate = cryptoData['Realtime Currency Exchange Rate'];
      if (rate && rate['5. Exchange Rate']) {
        const currentPrice = parseFloat(rate['5. Exchange Rate']);
        console.log(`✅ Alpha Vantage Crypto Success: ${cryptoSymbol}/USD = $${currentPrice}`);

        return {
          currentPrice,
          openPrice: currentPrice,
          highPrice: currentPrice * 1.02,
          lowPrice: currentPrice * 0.98,
          previousClose: currentPrice,
          change: 0,
          changePercent: 0
        };
      } else {
        throw new Error('No crypto rate data in Alpha Vantage response');
      }
    } else {
      // Handle stock symbols
      console.log(`🟡 Alpha Vantage: Fetching stock ${cleanSymbol}`);

      const stockResponse = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${cleanSymbol}&apikey=${alphaVantageApiKey}`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!stockResponse.ok) {
        throw new Error(`HTTP ${stockResponse.status}: ${await stockResponse.text()}`);
      }

      const stockData = await stockResponse.json();
      console.log(`🟡 Alpha Vantage Stock Response:`, JSON.stringify(stockData, null, 2));

      // Check for rate limit messages
      if (stockData.Note || stockData.Information) {
        const msg = stockData.Note || stockData.Information;
        console.error(`⚠️ Alpha Vantage Rate Limit: ${msg}`);
        throw new Error(`Rate limited: ${msg}`);
      }

      if (stockData['Error Message']) {
        console.error(`❌ Alpha Vantage Error: ${stockData['Error Message']}`);
        throw new Error(`API error: ${stockData['Error Message']}`);
      }

      const quote = stockData['Global Quote'];
      if (quote && quote['05. price']) {
        const currentPrice = parseFloat(quote['05. price']);
        console.log(`✅ Alpha Vantage Stock Success: ${cleanSymbol} = $${currentPrice}`);

        return {
          currentPrice,
          openPrice: parseFloat(quote['02. open']),
          highPrice: parseFloat(quote['03. high']),
          lowPrice: parseFloat(quote['04. low']),
          previousClose: parseFloat(quote['08. previous close']),
          change: parseFloat(quote['09. change']),
          changePercent: parseFloat(quote['10. change percent'].replace('%', ''))
        };
      } else {
        throw new Error('No stock quote data in Alpha Vantage response');
      }
    }
  } catch (error) {
    console.error(`❌ Alpha Vantage error for ${symbol}:`, error.message);
    throw error;
  }
}

// Twelve Data real-time data fetching for forex
async function fetchTwelveDataRealTime(symbol: string): Promise<StockData | null> {
  const twelveDataApiKey = Deno.env.get('TWELVEDATA_API_KEY');
  
  if (!twelveDataApiKey) {
    return null;
  }

  try {
    // Use the main detectAssetType function
    function detectAssetTypeLocal(symbol: string) {
      const forexPairs = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNY', 'INR', 'KRW', 'THB', 'MYR', 'IDR', 'PHP'];

      if (symbol.includes('/')) {
        const [base, quote] = symbol.split('/');
        return {
          type: 'forex',
          normalizedSymbol: symbol,
          requestedPair: symbol,
          providerPair: symbol,
          needsInversion: false
        };
      }

      if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
        const base = symbol.slice(0, 3);
        const quote = symbol.slice(3);
        if (forexPairs.includes(base) && forexPairs.includes(quote)) {
          const requestedPair = `${base}/${quote}`;

          let providerPair = requestedPair;
          let needsInversion = false;

          if ((base === 'JPY' && quote === 'USD') ||
            (base === 'EUR' && quote === 'USD') ||
            (base === 'GBP' && quote === 'USD')) {
            providerPair = `USD/${base}`;
            needsInversion = true;
          }

          return {
            type: 'forex',
            normalizedSymbol: providerPair,
            requestedPair,
            providerPair,
            needsInversion
          };
        }
      }

      return { type: 'stock', normalizedSymbol: symbol };
    }

    const assetInfo = detectAssetTypeLocal(symbol);
    if (assetInfo.type !== 'forex') {
      return null;
    }

    console.log(`Fetching real-time forex data from Twelve Data for ${symbol}`);

    const response = await fetch(
      `https://api.twelvedata.com/quote?symbol=${assetInfo.normalizedSymbol}&apikey=${twelveDataApiKey}`
    );

    if (!response.ok) {
      console.log(`Twelve Data real-time API error for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.close) {
      console.log(`No real-time forex data found for ${symbol} from Twelve Data`);
      return null;
    }

    let stockData = {
      currentPrice: parseFloat(data.close),
      openPrice: parseFloat(data.open),
      highPrice: parseFloat(data.high),
      lowPrice: parseFloat(data.low),
      previousClose: parseFloat(data.previous_close),
      change: parseFloat(data.change),
      changePercent: parseFloat(data.percent_change)
    };

    // Apply inversion if needed
    if (assetInfo.needsInversion) {
      stockData = {
        currentPrice: 1 / stockData.currentPrice,
        openPrice: 1 / stockData.openPrice,
        highPrice: 1 / stockData.lowPrice,
        lowPrice: 1 / stockData.highPrice,
        previousClose: 1 / stockData.previousClose,
        change: -stockData.change / (stockData.currentPrice * stockData.currentPrice),
        changePercent: -stockData.changePercent
      };
    }

    console.log(`Successfully fetched real-time forex data from Twelve Data`);
    return stockData;

  } catch (error) {
    console.error('Error fetching real-time forex data from Twelve Data:', error);
    return null;
  }
}

// Real-time data fetching with multiple providers (Twelve Data → Finnhub → Alpha Vantage)
async function fetchRealStockData(symbol: string): Promise<StockData> {
  const assetInfo = detectAssetType(symbol);
  
  // For forex, prioritize Twelve Data
  if (assetInfo.type === 'forex') {
    const twelveDataResult = await fetchTwelveDataRealTime(symbol);
    if (twelveDataResult) {
      return twelveDataResult;
    }
    console.log('Twelve Data failed for forex real-time, falling back to other providers');
  }

  const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
  const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');

  if (!finnhubApiKey) {
    throw new Error('FINNHUB_API_KEY environment variable is not configured');
  }

  console.log(`Fetching REAL-TIME data for ${symbol} - Multiple providers fallback`);

  const symbolVariants = getFinnhubSymbol(symbol);
  const errors: string[] = [];

  for (const finnhubSymbol of symbolVariants) {
    try {
      console.log(`🔥 TRYING Finnhub API: ${finnhubSymbol}`);

      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${finnhubSymbol}&token=${finnhubApiKey}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'ChartMate-Trading-Widget/1.0'
          },
          signal: AbortSignal.timeout(15000) // 15 second timeout
        }
      );

      console.log(`📡 Finnhub Response Status: ${response.status} for ${finnhubSymbol}`);

      if (!response.ok) {
        const errorText = await response.text();
        const error = `HTTP ${response.status}: ${errorText}`;
        console.error(`❌ Finnhub API Error for ${finnhubSymbol}: ${error}`);
        errors.push(`${finnhubSymbol}: ${error}`);
        continue;
      }

      const data = await response.json();
      console.log(`📊 Finnhub Raw Data for ${finnhubSymbol}:`, JSON.stringify(data));

      // Validate data thoroughly
      if (!data) {
        errors.push(`${finnhubSymbol}: No data returned`);
        continue;
      }

      if (data.error) {
        errors.push(`${finnhubSymbol}: API returned error: ${data.error}`);
        continue;
      }

      if (!data.c || data.c <= 0 || isNaN(data.c)) {
        errors.push(`${finnhubSymbol}: Invalid price data (c=${data.c})`);
        continue;
      }

      // SUCCESS - Real-time data found
      console.log(`✅ SUCCESS with Finnhub: ${finnhubSymbol} = $${data.c}`);

      return {
        currentPrice: data.c,
        openPrice: data.o || data.c,
        highPrice: data.h || data.c,
        lowPrice: data.l || data.c,
        previousClose: data.pc || data.c,
        change: data.d || 0,
        changePercent: data.dp || 0
      };

    } catch (error) {
      const errorMsg = `Network/Parse error: ${error.message}`;
      console.error(`❌ Finnhub Exception for ${finnhubSymbol}: ${errorMsg}`);
      errors.push(`${finnhubSymbol}: ${errorMsg}`);
      continue;
    }
  }

  // If Finnhub failed completely, try Alpha Vantage for supported asset classes
  try {
    if (!alphaVantageApiKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY missing');
    }
    console.log(`🔁 Finnhub failed. Trying Alpha Vantage for ${symbol}...`);
    const alphaData = await fetchAlphaVantageData(symbol);
    console.log(`✓ Alpha Vantage success for ${symbol}: $${alphaData.currentPrice}`);
    return alphaData;
  } catch (alphaErr) {
    errors.push(`AlphaVantage: ${alphaErr.message}`);
  }

  // If we get here, ALL providers failed
  const fullError = `REAL-TIME DATA FETCH FAILED for ${symbol}. Tried symbols: ${symbolVariants.join(', ')}. Errors: ${errors.join(' | ')}`;
  console.error(`🚨 ${fullError}`);
  throw new Error(fullError);
}

// Enhanced fallback data with more realistic current market prices
function getEnhancedFallbackData(symbol: string): StockData {
  const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|BINANCE|OANDA):/, '');

  // Current realistic market prices (as of late 2024)
  const marketPrices: Record<string, StockData> = {
    'EURUSD': {
      currentPrice: 1.0850,
      openPrice: 1.0845,
      highPrice: 1.0865,
      lowPrice: 1.0835,
      previousClose: 1.0845,
      change: 0.0005,
      changePercent: 0.046
    },
    'GBPUSD': {
      currentPrice: 1.2680,
      openPrice: 1.2675,
      highPrice: 1.2695,
      lowPrice: 1.2665,
      previousClose: 1.2675,
      change: 0.0005,
      changePercent: 0.039
    },
    'USDJPY': {
      currentPrice: 149.85,
      openPrice: 149.70,
      highPrice: 150.10,
      lowPrice: 149.50,
      previousClose: 149.70,
      change: 0.15,
      changePercent: 0.10
    },
    'BTCUSD': {
      currentPrice: 97850.00,
      openPrice: 97500.00,
      highPrice: 98200.00,
      lowPrice: 97200.00,
      previousClose: 97500.00,
      change: 350.00,
      changePercent: 0.36
    },
    'BTCUSDT': {
      currentPrice: 97850.00,
      openPrice: 97500.00,
      highPrice: 98200.00,
      lowPrice: 97200.00,
      previousClose: 97500.00,
      change: 350.00,
      changePercent: 0.36
    },
    'ETHUSD': {
      currentPrice: 3420.50,
      openPrice: 3400.00,
      highPrice: 3450.00,
      lowPrice: 3380.00,
      previousClose: 3400.00,
      change: 20.50,
      changePercent: 0.60
    },
    'ETHUSDT': {
      currentPrice: 3420.50,
      openPrice: 3400.00,
      highPrice: 3450.00,
      lowPrice: 3380.00,
      previousClose: 3400.00,
      change: 20.50,
      changePercent: 0.60
    },
    'AAPL': {
      currentPrice: 230.50,
      openPrice: 229.80,
      highPrice: 231.20,
      lowPrice: 229.00,
      previousClose: 229.80,
      change: 0.70,
      changePercent: 0.30
    },
    'GOOGL': {
      currentPrice: 175.85,
      openPrice: 175.20,
      highPrice: 176.50,
      lowPrice: 174.80,
      previousClose: 175.20,
      change: 0.65,
      changePercent: 0.37
    },
    'MSFT': {
      currentPrice: 420.15,
      openPrice: 419.50,
      highPrice: 421.80,
      lowPrice: 418.90,
      previousClose: 419.50,
      change: 0.65,
      changePercent: 0.15
    },
    'TSLA': {
      currentPrice: 358.20,
      openPrice: 356.80,
      highPrice: 360.50,
      lowPrice: 355.20,
      previousClose: 356.80,
      change: 1.40,
      changePercent: 0.39
    }
  };

  // Return specific data if available
  if (marketPrices[cleanSymbol]) {
    console.log(`Using realistic fallback data for ${cleanSymbol}: $${marketPrices[cleanSymbol].currentPrice}`);
    return marketPrices[cleanSymbol];
  }

  // Generate reasonable fallback for unknown symbols
  let basePrice = 100.0;

  // Adjust base price based on symbol type
  if (cleanSymbol.includes('BTC')) basePrice = 97000.0;
  else if (cleanSymbol.includes('ETH')) basePrice = 3400.0;
  else if (cleanSymbol.includes('USD') && cleanSymbol.length === 6) basePrice = 1.0; // Forex
  else if (cleanSymbol.match(/^[A-Z]{1,5}$/)) basePrice = 150.0; // Stock

  const variation = basePrice * 0.02; // 2% variation
  const change = (Math.random() - 0.5) * variation;
  const changePercent = (change / basePrice) * 100;

  const fallbackData = {
    currentPrice: basePrice + change,
    openPrice: basePrice,
    highPrice: basePrice + Math.abs(variation),
    lowPrice: basePrice - Math.abs(variation),
    previousClose: basePrice,
    change: change,
    changePercent: changePercent
  };

  console.log(`Generated fallback data for ${cleanSymbol}: $${fallbackData.currentPrice.toFixed(2)}`);
  return fallbackData;
}

// Keep old function for backward compatibility
function getFallbackData(symbol: string): StockData {
  return getEnhancedFallbackData(symbol);
}

// Technical Analysis Functions
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  return ema;
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;

  // Calculate signal line (9-period EMA of MACD)
  const macdValues = [];
  for (let i = Math.max(26, prices.length - 50); i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    if (slice.length >= 26) {
      const ema12_temp = calculateEMA(slice, 12);
      const ema26_temp = calculateEMA(slice, 26);
      macdValues.push(ema12_temp - ema26_temp);
    }
  }

  const signal = calculateEMA(macdValues, 9);
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

function calculateBollingerBands(prices: number[], period: number = 20): { upper: number; middle: number; lower: number } {
  if (prices.length < period) return { upper: 0, middle: 0, lower: 0 };

  const sma = calculateSMA(prices, period);
  const recentPrices = prices.slice(-period);
  const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: sma + (stdDev * 2),
    middle: sma,
    lower: sma - (stdDev * 2)
  };
}

function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    trueRanges.push(tr);
  }

  return calculateSMA(trueRanges, period);
}

function detectCandlestickPatterns(candles: Candle[]): string[] {
  if (candles.length < 3) return [];

  const patterns: string[] = [];
  const recent = candles.slice(-3);
  const current = recent[2];
  const previous = recent[1];

  // Doji pattern
  const bodySize = Math.abs(current.close - current.open);
  const range = current.high - current.low;
  if (bodySize / range < 0.1) {
    patterns.push('Doji');
  }

  // Hammer pattern
  const lowerShadow = current.open > current.close ?
    current.close - current.low : current.open - current.low;
  const upperShadow = current.high - Math.max(current.open, current.close);

  if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
    patterns.push('Hammer');
  }

  // Shooting Star
  if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5) {
    patterns.push('Shooting Star');
  }

  // Engulfing patterns
  if (recent.length >= 2) {
    const prevBody = Math.abs(previous.close - previous.open);
    const currBody = Math.abs(current.close - current.open);

    if (currBody > prevBody * 1.3) {
      if (previous.close < previous.open && current.close > current.open) {
        patterns.push('Bullish Engulfing');
      } else if (previous.close > previous.open && current.close < current.open) {
        patterns.push('Bearish Engulfing');
      }
    }
  }

  return patterns;
}

function findSupportResistanceLevels(candles: Candle[]): { support: number[]; resistance: number[] } {
  if (candles.length < 10) return { support: [], resistance: [] };

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const support: number[] = [];
  const resistance: number[] = [];

  // Find swing highs and lows
  for (let i = 2; i < candles.length - 2; i++) {
    // Swing high
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
      highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      resistance.push(highs[i]);
    }

    // Swing low
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
      lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      support.push(lows[i]);
    }
  }

  // Sort and take most significant levels
  support.sort((a, b) => b - a);
  resistance.sort((a, b) => a - b);

  return {
    support: support.slice(0, 3),
    resistance: resistance.slice(0, 3)
  };
}

function analyzeVolumeProfile(candles: Candle[]): string {
  if (candles.length < 10) return 'insufficient_data';

  const recentVolumes = candles.slice(-10).map(c => c.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const latestVolume = candles[candles.length - 1].volume;

  if (latestVolume > avgVolume * 1.5) return 'high_volume';
  if (latestVolume < avgVolume * 0.5) return 'low_volume';
  return 'normal_volume';
}

function analyzeVolatility(candles: Candle[]): string {
  if (candles.length < 20) return 'unknown';

  const atr = calculateATR(candles, 14);
  const currentPrice = candles[candles.length - 1].close;
  const atrPercent = (atr / currentPrice) * 100;

  if (atrPercent > 3) return 'high_volatility';
  if (atrPercent < 1) return 'low_volatility';
  return 'normal_volatility';
}

function analyzeTrend(candles: Candle[]): string {
  if (candles.length < 50) return 'unknown';

  const closes = candles.map(c => c.close);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);

  if (sma20 > sma50 * 1.02) return 'bullish';
  if (sma20 < sma50 * 0.98) return 'bearish';
  return 'sideways';
}

function computeTechnicalContext(candles: Candle[]): TechnicalContext {
  if (candles.length === 0) {
    return {
      candles: [],
      indicators: {
        sma20: 0, sma50: 0, ema12: 0, ema26: 0, rsi: 50,
        macd: 0, macdSignal: 0, macdHistogram: 0,
        bbUpper: 0, bbMiddle: 0, bbLower: 0, atr: 0
      },
      patterns: [],
      supportLevels: [],
      resistanceLevels: [],
      volumeProfile: 'unknown',
      volatilityState: 'unknown',
      trendDirection: 'unknown'
    };
  }

  const closes = candles.map(c => c.close);
  const macdData = calculateMACD(closes);
  const bbData = calculateBollingerBands(closes);
  const levels = findSupportResistanceLevels(candles);

  return {
    candles: candles.slice(-20), // Last 20 candles for context
    indicators: {
      sma20: calculateSMA(closes, 20),
      sma50: calculateSMA(closes, 50),
      ema12: calculateEMA(closes, 12),
      ema26: calculateEMA(closes, 26),
      rsi: calculateRSI(closes),
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram,
      bbUpper: bbData.upper,
      bbMiddle: bbData.middle,
      bbLower: bbData.lower,
      atr: calculateATR(candles)
    },
    patterns: detectCandlestickPatterns(candles),
    supportLevels: levels.support,
    resistanceLevels: levels.resistance,
    volumeProfile: analyzeVolumeProfile(candles),
    volatilityState: analyzeVolatility(candles),
    trendDirection: analyzeTrend(candles)
  };
}

async function getGeminiAnalysis(
  symbol: string,
  investment: number,
  timeframe: string,
  stockData: StockData,
  techContext: TechnicalContext
): Promise<{ structuredData: any; analysis: string }> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

  if (!geminiApiKey) {
    throw new Error('Gemini API key not configured');
  }

  const techSummary = `
TECHNICAL ANALYSIS DATA:

Current Price: $${stockData.currentPrice}
Change: ${stockData.change} (${stockData.changePercent}%)

TECHNICAL INDICATORS:
- RSI: ${techContext.indicators.rsi.toFixed(2)} ${techContext.indicators.rsi > 70 ? '(OVERBOUGHT)' : techContext.indicators.rsi < 30 ? '(OVERSOLD)' : '(NEUTRAL)'}
- SMA20: $${techContext.indicators.sma20.toFixed(2)}
- SMA50: $${techContext.indicators.sma50.toFixed(2)}
- SMA Cross: ${techContext.indicators.sma20 > techContext.indicators.sma50 ? 'BULLISH (Golden Cross)' : 'BEARISH (Death Cross)'}
- MACD: ${techContext.indicators.macd.toFixed(4)}
- MACD Signal: ${techContext.indicators.macdSignal.toFixed(4)}
- MACD Histogram: ${techContext.indicators.macdHistogram.toFixed(4)} ${techContext.indicators.macdHistogram > 0 ? '(BULLISH MOMENTUM)' : '(BEARISH MOMENTUM)'}
- Bollinger Bands: Upper ${techContext.indicators.bbUpper.toFixed(2)}, Middle ${techContext.indicators.bbMiddle.toFixed(2)}, Lower ${techContext.indicators.bbLower.toFixed(2)}
- ATR: ${techContext.indicators.atr.toFixed(2)} (Volatility: ${techContext.volatilityState})

PRICE ACTION PATTERNS: ${techContext.patterns.length > 0 ? techContext.patterns.join(', ') : 'None detected'}

SUPPORT LEVELS: [${techContext.supportLevels.map(l => `$${l.toFixed(2)}`).join(', ')}]
RESISTANCE LEVELS: [${techContext.resistanceLevels.map(l => `$${l.toFixed(2)}`).join(', ')}]

VOLUME PROFILE: ${techContext.volumeProfile}
TREND DIRECTION: ${techContext.trendDirection}
VOLATILITY STATE: ${techContext.volatilityState}

RECENT CANDLE DATA (Last 5):
${techContext.candles.slice(-5).map((c, i) =>
    `${i + 1}. O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} V:${c.volume}`
  ).join('\n')}`;

  const structuredPrompt = `You are an expert technical analyst. Analyze ${symbol} using the provided technical data and respond with ONLY valid JSON in this exact format:

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
  "rationale": "brief explanation of decision based on technical data",
  "risks": ["array of key risk factors"],
  "opportunities": ["array of opportunities"],
  "technicalSignals": {
    "rsiSignal": "overbought" | "oversold" | "neutral",
    "macdSignal": "bullish" | "bearish" | "neutral",
    "trendSignal": "bullish" | "bearish" | "sideways",
    "volumeSignal": "strong" | "weak" | "normal"
  },
  "probabilityScenarios": {
    "bullish": number 0-100,
    "bearish": number 0-100,
    "sideways": number 0-100
  }
}

${techSummary}

Symbol: ${symbol}
Investment: $${investment}
Timeframe: ${timeframe}

ANALYSIS REQUIREMENTS:
1. Base your recommendation primarily on the technical indicators provided
2. Factor in RSI overbought/oversold conditions
3. Consider MACD momentum signals  
4. Analyze trend direction from moving averages
5. Use detected candlestick patterns for reversal/continuation signals
6. Incorporate support/resistance levels for price targets
7. Consider volume profile for strength confirmation
8. Provide probability scenarios that sum to 100%

Respond with ONLY the JSON object, no other text.`;

  const analysisPrompt = `Provide detailed technical analysis for ${symbol}:

${techSummary}

Investment amount: $${investment}
Analysis timeframe: ${timeframe}

COMPREHENSIVE ANALYSIS REQUIREMENTS:
1. **Technical Indicator Analysis**: Interpret RSI, MACD, Moving Averages, Bollinger Bands
2. **Price Action & Patterns**: Explain significance of detected candlestick patterns
3. **Support & Resistance**: Analyze key levels and breakout/breakdown scenarios
4. **Volume Analysis**: Assess volume confirmation or divergence
5. **Volatility Assessment**: Factor in ATR and volatility state
6. **Trend Analysis**: Evaluate short vs long-term trend alignment
7. **Risk/Reward Assessment**: Specific to the $${investment} investment
8. **Entry/Exit Strategy**: Best entry points and stop-loss recommendations
9. **Timeframe-Specific Guidance**: Focus on ${timeframe} predictions
10. **Alternative Scenarios**: What to watch for trend changes

Focus on actionable insights based on the technical data provided.`;

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

    console.log(`Getting enhanced technical analysis for ${symbol}, investment: $${investment}, timeframe: ${timeframe}`);

    // Fetch real stock data and historical candles in parallel
    const [stockData, { candles, meta: marketMeta }] = await Promise.all([
      fetchRealStockData(symbol),
      fetchHistoricalCandles(symbol, timeframe)
    ]);

    console.log('Real stock data fetched:', stockData);
    console.log(`Historical candles fetched: ${candles.length} candles`);

    // Compute technical analysis context
    const techContext = computeTechnicalContext(candles);
    console.log('Technical context computed:', {
      patterns: techContext.patterns,
      rsi: techContext.indicators.rsi,
      trend: techContext.trendDirection,
      volatility: techContext.volatilityState
    });

    // Get enhanced Gemini analysis with technical context
    const { structuredData, analysis } = await getGeminiAnalysis(
      symbol,
      investment,
      timeframe,
      stockData,
      techContext
    );
    console.log('Enhanced Gemini analysis completed');

    const result = {
      symbol,
      currentPrice: stockData.currentPrice,
      change: stockData.change,
      changePercent: stockData.changePercent,
      timeframe,
      analysis,
      stockData,
      technicalContext: {
        patterns: techContext.patterns,
        indicators: {
          rsi: techContext.indicators.rsi,
          macd: techContext.indicators.macd,
          trend: techContext.trendDirection,
          volatility: techContext.volatilityState
        },
        supportLevels: techContext.supportLevels,
        resistanceLevels: techContext.resistanceLevels
      },
      marketMeta,
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