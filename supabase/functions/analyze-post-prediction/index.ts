import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to detect asset type and normalize symbols with inversion logic
function detectAssetType(symbol: string) {
  const forexPairs = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNY', 'INR', 'KRW', 'THB', 'MYR', 'IDR', 'PHP'];

  // Check if it's forex (6 uppercase letters or contains /)
  if (symbol.includes('/')) {
    const [base, quote] = symbol.split('/');
    if (forexPairs.includes(base) && forexPairs.includes(quote)) {
      return {
        type: 'forex',
        normalizedSymbol: symbol,
        requestedPair: symbol,
        providerPair: symbol,
        needsInversion: false
      };
    }
  }

  if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
    const base = symbol.slice(0, 3);
    const quote = symbol.slice(3);
    if (forexPairs.includes(base) && forexPairs.includes(quote)) {
      const requestedPair = `${base}/${quote}`;

      // Determine if we need to use inverted provider pair for better data availability
      let providerPair = requestedPair;
      let needsInversion = false;

      // Major pairs where providers typically use USD as base
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

  // Detect crypto (comprehensive crypto detection)
  const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|BINANCE|OANDA):/, '');
  const cryptoTokens = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'UNI', 'LTC', 'XRP', 'DOGE', 'MATIC', 'AVAX'];
  const isCrypto = cryptoTokens.some(token => cleanSymbol.includes(token)) ||
    symbol.includes('BINANCE:') ||
    symbol.includes('COINBASE:') ||
    symbol.includes('KRAKEN:') ||
    cleanSymbol.includes('USDT') ||
    cleanSymbol.includes('USDC');

  if (isCrypto) {
    return {
      type: 'crypto',
      normalizedSymbol: symbol,
      requestedPair: null,
      providerPair: null,
      needsInversion: false
    };
  }

  return { type: 'stock', normalizedSymbol: symbol };
}

// Twelve Data API integration for forex data
async function fetchTwelveDataForex(symbol: string, from: Date, to: Date, spanMinutes: number): Promise<any> {
  const twelveDataApiKey = Deno.env.get('TWELVEDATA_API_KEY');
  
  if (!twelveDataApiKey) {
    console.log('Twelve Data API key not configured for forex');
    return null;
  }

  try {
    const assetInfo = detectAssetType(symbol);
    if (assetInfo.type !== 'forex') {
      return null;
    }

    // Determine appropriate interval based on time span
    let interval = '1h';
    if (spanMinutes <= 60) interval = '5min';
    else if (spanMinutes <= 240) interval = '15min';
    else if (spanMinutes <= 1440) interval = '1h';
    else if (spanMinutes <= 10080) interval = '1day';
    else interval = '1week';

    console.log(`🔄 Fetching forex data from Twelve Data for ${symbol} with interval ${interval}`);

    const response = await fetch(
      `https://api.twelvedata.com/time_series?symbol=${assetInfo.normalizedSymbol}&interval=${interval}&outputsize=100&apikey=${twelveDataApiKey}`
    );

    if (!response.ok) {
      console.log(`Twelve Data API error for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.values || data.values.length === 0) {
      console.log(`No forex data found for ${symbol} from Twelve Data`);
      return null;
    }

    // Filter data within time range and convert to our format
    const fromTime = from.getTime();
    const toTime = to.getTime();
    
    const filteredValues = data.values.filter((item: any) => {
      const itemTime = new Date(item.datetime).getTime();
      return itemTime >= fromTime && itemTime <= toTime;
    });

    if (filteredValues.length === 0) {
      console.log('No forex data within time range from Twelve Data');
      return null;
    }

    const prices = filteredValues.map((item: any) => parseFloat(item.close));
    const volumes = filteredValues.map((item: any) => parseFloat(item.volume) || 0);
    
    let marketData = {
      source: 'Twelve Data Forex API',
      open: parseFloat(filteredValues[filteredValues.length - 1].open),
      close: parseFloat(filteredValues[0].close),
      high: Math.max(...filteredValues.map((item: any) => parseFloat(item.high))),
      low: Math.min(...filteredValues.map((item: any) => parseFloat(item.low))),
      volume: volumes.reduce((sum, vol) => sum + vol, 0),
      prices: prices,
      candleCount: filteredValues.length
    };

    // Apply inversion if needed
    if (assetInfo.needsInversion) {
      marketData = invertOHLC(marketData);
      console.log(`Inverted forex data from ${assetInfo.providerPair} to ${assetInfo.requestedPair}`);
    }

    console.log(`✅ Successfully fetched ${filteredValues.length} forex data points from Twelve Data`);
    return marketData;

  } catch (error) {
    console.error('Error fetching forex data from Twelve Data:', error);
    return null;
  }
}

// Helper function to get Finnhub forex symbols (multiple brokers)
function getFinnhubForexSymbols(normalizedSymbol: string) {
  // Skip Finnhub for forex on free tier - return empty array to trigger Alpha Vantage
  console.log(`🔄 Forex analysis detected (${normalizedSymbol}). Skipping Finnhub, routing to Alpha Vantage.`);
  return [];
}

// Helper function to determine resolution based on time span with fallback sequence
function getResolutionSequence(spanMinutes: number) {
  if (spanMinutes <= 90) return ['1', '5', '15'];
  if (spanMinutes <= 360) return ['5', '15', '60'];
  if (spanMinutes <= 1440) return ['15', '60'];
  if (spanMinutes <= 10080) return ['60', 'D'];
  return ['D'];
}

// Helper function to invert OHLC data
function invertOHLC(marketData: any) {
  if (!marketData) return marketData;

  return {
    ...marketData,
    open: 1 / marketData.close,
    close: 1 / marketData.open,
    high: 1 / marketData.low,
    low: 1 / marketData.high,
    prices: marketData.prices?.map((p: number) => 1 / p).reverse() || []
  };
}

// Enhanced fallback data generator with realistic market prices
function generateRealisticMarketData(symbol: string, fromTime: Date, toTime: Date): any {
  const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|BINANCE|OANDA):/, '');

  // Current realistic market prices
  const basePrice = getBasePriceForSymbol(cleanSymbol);

  // Simulate realistic price movement over time period
  const timeDiff = toTime.getTime() - fromTime.getTime();
  const volatilityFactor = getVolatilityFactor(cleanSymbol);

  // Generate random but realistic price movement
  const maxChange = basePrice * volatilityFactor * (timeDiff / (24 * 60 * 60 * 1000)); // Daily volatility scaled
  const priceChange = (Math.random() - 0.5) * maxChange;

  const open = basePrice;
  const close = basePrice + priceChange;
  const high = Math.max(open, close) + Math.abs(priceChange) * 0.3;
  const low = Math.min(open, close) - Math.abs(priceChange) * 0.3;

  return {
    source: 'Generated Market Data',
    open,
    close,
    high,
    low,
    volume: Math.floor(Math.random() * 1000000) + 100000,
    prices: [open, (open + close) / 2, close],
    candleCount: 3
  };
}

function getBasePriceForSymbol(symbol: string): number {
  const prices: Record<string, number> = {
    'EURUSD': 1.0850,
    'GBPUSD': 1.2680,
    'USDJPY': 149.85,
    'BTCUSD': 97850.00,
    'BTCUSDT': 97850.00,
    'ETHUSD': 3420.50,
    'ETHUSDT': 3420.50,
    'AAPL': 230.50,
    'GOOGL': 175.85,
    'MSFT': 420.15,
    'TSLA': 358.20,
    'SPY': 520.30,
    'QQQ': 410.25
  };

  return prices[symbol] || (symbol.includes('USD') && symbol.length === 6 ? 1.0 : 150.0);
}

function getVolatilityFactor(symbol: string): number {
  // Daily volatility factors
  const volatility: Record<string, number> = {
    'EURUSD': 0.008,   // 0.8% daily volatility
    'GBPUSD': 0.012,   // 1.2%
    'USDJPY': 0.010,   // 1.0%
    'BTCUSD': 0.040,   // 4.0% - crypto is more volatile
    'BTCUSDT': 0.040,
    'ETHUSD': 0.045,   // 4.5%
    'ETHUSDT': 0.045,
    'AAPL': 0.020,     // 2.0% - tech stocks
    'GOOGL': 0.025,    // 2.5%
    'MSFT': 0.018,     // 1.8%
    'TSLA': 0.035,     // 3.5% - volatile stock
    'SPY': 0.012,      // 1.2% - ETF
    'QQQ': 0.015       // 1.5%
  };

  return volatility[symbol] || 0.020; // Default 2% volatility
}

// Enhanced fallback summary generator
function generateFallbackSummary(marketData: any, displaySymbol: string, dataSourceInfo: string = '') {
  if (!marketData) {
    // Generate realistic market data for analysis
    const fromTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const toTime = new Date();
    marketData = generateRealisticMarketData(displaySymbol, fromTime, toTime);
    dataSourceInfo = 'Simulated market data based on typical patterns';
  }

  const priceChange = marketData.close - marketData.open;
  const priceChangePercent = ((priceChange / marketData.open) * 100).toFixed(2);
  const direction = priceChange >= 0 ? 'up' : 'down';
  const sign = priceChange >= 0 ? '+' : '';

  // Generate realistic analysis based on symbol type
  const analysisContext = getAnalysisContext(displaySymbol, parseFloat(priceChangePercent));

  const dataSuffix = dataSourceInfo ? `\n\nData: ${dataSourceInfo}` : '';

  return `• ${displaySymbol} moved ${direction} by ${sign}${priceChangePercent}% from ${marketData.open.toFixed(6)} to ${marketData.close.toFixed(6)}.\n• ${analysisContext.catalyst}\n• ${analysisContext.context}${dataSuffix}`;
}

function getAnalysisContext(symbol: string, changePercent: number): { catalyst: string; context: string } {
  const absChange = Math.abs(changePercent);
  const isForex = symbol.includes('USD') && symbol.length === 6;
  const isCrypto = symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('ADA');

  let catalyst = 'No clear catalyst found during the specified timeframe';
  let context = 'The market showed typical intraday trading patterns';

  // Generate context based on price movement magnitude
  if (absChange > 2.0) {
    if (isForex) {
      catalyst = 'Potential economic data release or central bank commentary influenced the move';
      context = 'Currency pairs often react to monetary policy signals and economic indicators';
    } else if (isCrypto) {
      catalyst = 'Cryptocurrency markets showed heightened volatility amid regulatory or market sentiment shifts';
      context = 'Digital assets continue to exhibit high volatility compared to traditional markets';
    } else {
      catalyst = 'Possible earnings, guidance update, or sector-specific news drove the movement';
      context = 'Equity markets responded to fundamental or technical factors';
    }
  } else if (absChange > 0.5) {
    if (isForex) {
      catalyst = 'Standard market fluctuations within normal trading ranges';
      context = 'Currency trading showed moderate activity with typical spread variations';
    } else if (isCrypto) {
      catalyst = 'Normal crypto market volatility within expected daily ranges';
      context = 'Digital asset prices fluctuated within typical intraday parameters';
    } else {
      catalyst = 'Regular market activity with moderate price discovery';
      context = 'Stock price moved in line with broader market sentiment and trading volumes';
    }
  } else {
    catalyst = 'Minimal market movement with low volatility conditions';
    context = 'Price action remained subdued with limited trading interest during the period';
  }

  return { catalyst, context };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, from, marketMeta } = await req.json();

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
    const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanity check on required secrets
    if (!finnhubApiKey && !alphaVantageApiKey) {
      console.warn('Warning: Neither FINNHUB_API_KEY nor ALPHA_VANTAGE_API_KEY is configured');
    }

    const fromTime = new Date(from);
    const toTime = new Date();
    const spanMinutes = (toTime.getTime() - fromTime.getTime()) / 60000;

    console.log(`Analyzing ${symbol} from ${fromTime.toISOString()} to ${toTime.toISOString()}`);

    // Use marketMeta from prediction if available, otherwise detect asset type
    let assetInfo;
    if (marketMeta) {
      console.log('Using market metadata from prediction:', marketMeta);
      assetInfo = {
        type: marketMeta.assetType,
        normalizedSymbol: marketMeta.providerPair || symbol,
        requestedPair: marketMeta.requestedPair,
        providerPair: marketMeta.providerPair,
        needsInversion: marketMeta.needsInversion
      };
    } else {
      // Fallback to detection if no metadata provided
      assetInfo = detectAssetType(symbol);
      console.log(`🔍 Detected asset type: ${assetInfo.type}, normalized symbol: ${assetInfo.normalizedSymbol} for input symbol: ${symbol}`);
    }

    if (assetInfo.requestedPair) {
      console.log(`Requested pair: ${assetInfo.requestedPair}, Provider pair: ${assetInfo.providerPair}, Needs inversion: ${assetInfo.needsInversion}`);
    }

    // Get resolution sequence for fallback
    const resolutionSequence = getResolutionSequence(spanMinutes);
    console.log(`Using resolution sequence: ${resolutionSequence.join(' → ')} for span: ${spanMinutes.toFixed(1)} minutes`);

    // Time padding for better data retrieval: 5 min before, 1 min gap from now
    const paddedFromTime = new Date(fromTime.getTime() - 5 * 60 * 1000);
    const paddedToTime = new Date(toTime.getTime() - 60 * 1000);
    const fromTimestamp = Math.floor(paddedFromTime.getTime() / 1000);
    const toTimestamp = Math.floor(paddedToTime.getTime() / 1000);

    // Fetch REAL-TIME market data - NO FALLBACKS, FAIL FAST
    let marketData = null;
    let dataSource = '';
    let triedMethods: string[] = [];

    if (!finnhubApiKey) {
      throw new Error('FINNHUB_API_KEY environment variable is not configured for analysis');
    }

    console.log(`🔥 Fetching REAL-TIME market data for ${symbol} - NO FALLBACKS`);

    // Smart routing based on asset type and Finnhub free tier limitations
    let endpoint = 'stock/candle';
    let symbolsToTry = [symbol];
    let skipFinnhub = false;

    if (assetInfo.type === 'forex') {
      endpoint = 'forex/candle';
      symbolsToTry = getFinnhubForexSymbols(assetInfo.normalizedSymbol);
      skipFinnhub = true; // Forex doesn't work on Finnhub free tier
      console.log(`🔄 FOREX: endpoint=${endpoint}, symbolsToTry=${JSON.stringify(symbolsToTry)}, skipFinnhub=${skipFinnhub}`);
    } else if (assetInfo.type === 'crypto') {
      endpoint = 'stock/candle'; // Crypto uses stock endpoint on Finnhub
      // Use crypto exchange symbols
      const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|BINANCE|OANDA):/, '');
      if (cleanSymbol.includes('BTC')) {
        symbolsToTry = ['BINANCE:BTCUSDT', 'COINBASE:BTC-USD', 'KRAKEN:XBTUSD'];
      } else if (cleanSymbol.includes('ETH')) {
        symbolsToTry = ['BINANCE:ETHUSDT', 'COINBASE:ETH-USD', 'KRAKEN:ETHUSD'];
      } else {
        symbolsToTry = [symbol];
      }
      skipFinnhub = true; // Skip Finnhub candles for crypto too (free tier limitation)
      console.log(`₿ CRYPTO: endpoint=${endpoint}, symbolsToTry=${JSON.stringify(symbolsToTry)}, skipFinnhub=${skipFinnhub}`);
    } else {
      skipFinnhub = true; // Skip Finnhub candles for stocks too (free tier limitation)
      console.log(`📈 STOCK: endpoint=${endpoint}, symbolsToTry=${JSON.stringify(symbolsToTry)}, skipFinnhub=${skipFinnhub}`);
    }

    const errors: string[] = [];

    // Try each resolution and symbol combination (skip Finnhub if flagged)
    if (!skipFinnhub) {
      for (const resolution of resolutionSequence) {
        if (marketData) break;

        for (const finnhubSymbol of symbolsToTry) {
          if (marketData) break;

          const method = `Finnhub ${endpoint} ${finnhubSymbol} (${resolution})`;
          triedMethods.push(method);

          try {
            console.log(`🔥 TRYING: ${method}`);

            const finnhubResponse = await fetch(
              `https://finnhub.io/api/v1/${endpoint}?symbol=${finnhubSymbol}&resolution=${resolution}&from=${fromTimestamp}&to=${toTimestamp}&token=${finnhubApiKey}`,
              {
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'ChartMate-Trading-Widget/1.0'
                },
                signal: AbortSignal.timeout(15000)
              }
            );

            console.log(`📡 Response Status: ${finnhubResponse.status} for ${method}`);

            if (!finnhubResponse.ok) {
              const errorText = await finnhubResponse.text();
              const error = `HTTP ${finnhubResponse.status}: ${errorText}`;
              console.error(`❌ ${method} failed: ${error}`);
              errors.push(`${method}: ${error}`);
              continue;
            }

            const data = await finnhubResponse.json();
            console.log(`📊 Raw Data for ${method}:`, JSON.stringify(data));

            if (!data) {
              errors.push(`${method}: No data returned`);
              continue;
            }

            if (data.s !== 'ok') {
              errors.push(`${method}: API status=${data.s}`);
              continue;
            }

            if (!data.c || data.c.length === 0) {
              errors.push(`${method}: No candles returned (c=${data.c?.length || 0})`);
              continue;
            }

            // SUCCESS - Real market data found
            let rawMarketData = {
              source: `Finnhub ${endpoint} (${finnhubSymbol}, ${resolution})`,
              open: data.o[0],
              close: data.c[data.c.length - 1],
              high: Math.max(...data.h),
              low: Math.min(...data.l),
              volume: data.v?.reduce((a, b) => a + b, 0) || 0,
              prices: data.c,
              candleCount: data.c.length
            };

            // Apply inversion if needed
            if (assetInfo.needsInversion) {
              rawMarketData = invertOHLC(rawMarketData);
              console.log(`🔄 Inverted candle data from ${assetInfo.providerPair} to ${assetInfo.requestedPair}`);
            }

            marketData = rawMarketData;
            dataSource = `${finnhubSymbol} (${resolution})${assetInfo.needsInversion ? ' inverted' : ''}`;
            console.log(`✅ SUCCESS: ${method} - ${marketData.candleCount} candles`);
            break;

          } catch (err) {
            const error = `Network/Parse error: ${err.message}`;
            console.error(`❌ ${method} exception: ${error}`);
            errors.push(`${method}: ${error}`);
            continue;
          }
        }
      }
    } else {
      console.log(`⚠️ Skipping Finnhub (free tier limitations for ${assetInfo.type}). Going directly to Alpha Vantage.`);
    }

    // For forex, try Twelve Data first, then Alpha Vantage
    if (!marketData && assetInfo.type === 'forex') {
      const twelveDataResult = await fetchTwelveDataForex(symbol, fromTime, toTime, spanMinutes);
      if (twelveDataResult) {
        marketData = twelveDataResult;
        dataSource = `${assetInfo.requestedPair || symbol} via Twelve Data${assetInfo.needsInversion ? ' (inverted)' : ''}`;
        console.log(`✅ Successfully fetched forex data from Twelve Data`);
      }
    }

    // If we get here without marketData, try Alpha Vantage as secondary provider
    if (!marketData) {
      try {
        if (!alphaVantageApiKey) {
          throw new Error('ALPHA_VANTAGE_API_KEY missing');
        }

        console.log('🔁 Finnhub/Twelve Data failed. Trying Alpha Vantage for analysis...');

        if (assetInfo.type === 'forex') {
          let base, quote;

          // Extract base and quote currencies from symbol
          if (assetInfo.requestedPair) {
            [base, quote] = assetInfo.requestedPair.split('/');
          } else if (symbol.includes(':')) {
            const cleanSym = symbol.split(':')[1];
            if (cleanSym.length === 6) {
              base = cleanSym.slice(0, 3);
              quote = cleanSym.slice(3);
            } else {
              [base, quote] = cleanSym.split('/');
            }
          } else if (symbol.length === 6) {
            base = symbol.slice(0, 3);
            quote = symbol.slice(3);
          } else {
            throw new Error(`Cannot parse forex pair from symbol: ${symbol}`);
          }

          console.log(`🟡 Alpha Vantage Analysis: Processing forex ${base}/${quote} for ${spanMinutes.toFixed(0)} minute window`);

          const interval = spanMinutes <= 60 ? '5min' : spanMinutes <= 1440 ? '60min' : null;

          let url = '';
          if (interval) {
            url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${base}&to_symbol=${quote}&interval=${interval}&outputsize=compact&apikey=${alphaVantageApiKey}`;
          } else {
            url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${base}&to_symbol=${quote}&outputsize=compact&apikey=${alphaVantageApiKey}`;
          }

          const av = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) });
          if (!av.ok) throw new Error(`HTTP ${av.status}: ${await av.text()}`);

          const data = await av.json();
          console.log(`🟡 Alpha Vantage FX Response:`, JSON.stringify(data, null, 2));

          // Check for rate limit messages
          if (data.Note || data.Information) {
            const msg = data.Note || data.Information;
            console.error(`⚠️ Alpha Vantage Rate Limit: ${msg}`);
            throw new Error(`Rate limited: ${msg}`);
          }

          if (data['Error Message']) {
            console.error(`❌ Alpha Vantage Error: ${data['Error Message']}`);
            throw new Error(`API error: ${data['Error Message']}`);
          }

          const key = interval ? `Time Series FX (${interval})` : 'Time Series FX (Daily)';
          const series = data[key];
          if (!series) throw new Error(`No Alpha Vantage series for key: ${key}. Available keys: ${Object.keys(data).join(', ')}`);

          const timestamps = Object.keys(series).sort();
          const relevant = timestamps.filter(ts => {
            const d = new Date(ts);
            return d >= fromTime && d <= toTime;
          });

          if (relevant.length === 0) {
            console.warn(`⚠️ No candles in time window. Total candles: ${timestamps.length}, Window: ${fromTime.toISOString()} to ${toTime.toISOString()}`);
            // Use the latest available data if no data in exact window
            const latest = timestamps.slice(-Math.min(3, timestamps.length));
            if (latest.length > 0) {
              console.log(`📊 Using ${latest.length} latest candles as fallback`);
              marketData = {
                source: `Alpha Vantage ${key} (latest ${latest.length} candles)`,
                open: parseFloat(series[latest[0]]['1. open']),
                close: parseFloat(series[latest[latest.length - 1]]['4. close']),
                high: Math.max(...latest.map(ts => parseFloat(series[ts]['2. high']))),
                low: Math.min(...latest.map(ts => parseFloat(series[ts]['3. low']))),
                volume: 0,
                prices: latest.map(ts => parseFloat(series[ts]['4. close'])),
                candleCount: latest.length
              } as any;
              dataSource = `${base}/${quote} via Alpha Vantage (latest data)`;
            } else {
              throw new Error('Alpha Vantage returned no usable candles');
            }
          } else {
            marketData = {
              source: `Alpha Vantage ${key}`,
              open: parseFloat(series[relevant[0]]['1. open']),
              close: parseFloat(series[relevant[relevant.length - 1]]['4. close']),
              high: Math.max(...relevant.map(ts => parseFloat(series[ts]['2. high']))),
              low: Math.min(...relevant.map(ts => parseFloat(series[ts]['3. low']))),
              volume: 0,
              prices: relevant.map(ts => parseFloat(series[ts]['4. close'])),
              candleCount: relevant.length
            } as any;
            dataSource = `${base}/${quote} via Alpha Vantage`;
          }
        } else if (assetInfo.type === 'crypto') {
          // Crypto - use Alpha Vantage digital currency API
          console.log(`🟡 Alpha Vantage Analysis: Processing crypto ${symbol} for ${spanMinutes.toFixed(0)} minute window`);

          // Extract crypto symbol (BTC from BTCUSD, ETH from ETHUSD, etc.)
          const cleanSymbol = symbol.replace(/^(NASDAQ|NYSE|BINANCE|OANDA):/, '');
          let cryptoSymbol = cleanSymbol;
          if (cleanSymbol.includes('USD')) {
            cryptoSymbol = cleanSymbol.replace('USD', '').replace('USDT', '');
          }

          // For crypto, use daily data as intraday isn't as robust
          const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${cryptoSymbol}&market=USD&apikey=${alphaVantageApiKey}`;

          const av = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) });
          if (!av.ok) throw new Error(`HTTP ${av.status}: ${await av.text()}`);

          const data = await av.json();
          console.log(`🟡 Alpha Vantage Crypto Response:`, JSON.stringify(data, null, 2));

          // Check for rate limit messages
          if (data.Note || data.Information) {
            const msg = data.Note || data.Information;
            console.error(`⚠️ Alpha Vantage Rate Limit: ${msg}`);
            throw new Error(`Rate limited: ${msg}`);
          }

          if (data['Error Message']) {
            console.error(`❌ Alpha Vantage Error: ${data['Error Message']}`);
            throw new Error(`API error: ${data['Error Message']}`);
          }

          const series = data['Time Series (Digital Currency Daily)'];
          if (!series) throw new Error(`No Alpha Vantage crypto series. Available keys: ${Object.keys(data).join(', ')}`);

          const timestamps = Object.keys(series).sort();
          const relevant = timestamps.filter(ts => {
            const d = new Date(ts);
            return d >= fromTime && d <= toTime;
          });

          if (relevant.length === 0) {
            console.warn(`⚠️ No crypto candles in time window. Total candles: ${timestamps.length}, Window: ${fromTime.toISOString()} to ${toTime.toISOString()}`);
            // Use the latest available data if no data in exact window
            const latest = timestamps.slice(-Math.min(3, timestamps.length));
            if (latest.length > 0) {
              console.log(`📊 Using ${latest.length} latest crypto candles as fallback`);
              marketData = {
                source: `Alpha Vantage Crypto Daily (latest ${latest.length} candles)`,
                open: parseFloat(series[latest[0]]['1a. open (USD)']),
                close: parseFloat(series[latest[latest.length - 1]]['4a. close (USD)']),
                high: Math.max(...latest.map(ts => parseFloat(series[ts]['2a. high (USD)']))),
                low: Math.min(...latest.map(ts => parseFloat(series[ts]['3a. low (USD)']))),
                volume: latest.reduce((sum, ts) => sum + parseFloat(series[ts]['5. volume'] || '0'), 0),
                prices: latest.map(ts => parseFloat(series[ts]['4a. close (USD)'])),
                candleCount: latest.length
              } as any;
              dataSource = `${cryptoSymbol}/USD via Alpha Vantage (latest data)`;
            } else {
              throw new Error('Alpha Vantage returned no usable crypto candles');
            }
          } else {
            marketData = {
              source: `Alpha Vantage Crypto Daily`,
              open: parseFloat(series[relevant[0]]['1a. open (USD)']),
              close: parseFloat(series[relevant[relevant.length - 1]]['4a. close (USD)']),
              high: Math.max(...relevant.map(ts => parseFloat(series[ts]['2a. high (USD)']))),
              low: Math.min(...relevant.map(ts => parseFloat(series[ts]['3a. low (USD)']))),
              volume: relevant.reduce((sum, ts) => sum + parseFloat(series[ts]['5. volume'] || '0'), 0),
              prices: relevant.map(ts => parseFloat(series[ts]['4a. close (USD)'])),
              candleCount: relevant.length
            } as any;
            dataSource = `${cryptoSymbol}/USD via Alpha Vantage`;
          }
        } else {
          // Stocks/ETFs
          console.log(`🟡 Alpha Vantage Analysis: Processing stock ${symbol} for ${spanMinutes.toFixed(0)} minute window`);

          const interval = spanMinutes <= 60 ? '5min' : spanMinutes <= 1440 ? '60min' : 'daily';
          const func = interval === 'daily' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
          const url = func === 'TIME_SERIES_DAILY'
            ? `https://www.alphavantage.co/query?function=${func}&symbol=${symbol}&outputsize=compact&apikey=${alphaVantageApiKey}`
            : `https://www.alphavantage.co/query?function=${func}&symbol=${symbol}&interval=${interval}&outputsize=compact&apikey=${alphaVantageApiKey}`;

          const av = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) });
          if (!av.ok) throw new Error(`HTTP ${av.status}: ${await av.text()}`);

          const data = await av.json();
          console.log(`🟡 Alpha Vantage Stock Response:`, JSON.stringify(data, null, 2));

          // Check for rate limit messages
          if (data.Note || data.Information) {
            const msg = data.Note || data.Information;
            console.error(`⚠️ Alpha Vantage Rate Limit: ${msg}`);
            throw new Error(`Rate limited: ${msg}`);
          }

          if (data['Error Message']) {
            console.error(`❌ Alpha Vantage Error: ${data['Error Message']}`);
            throw new Error(`API error: ${data['Error Message']}`);
          }

          const key = func === 'TIME_SERIES_DAILY' ? 'Time Series (Daily)' : `Time Series (${interval})`;
          const series = data[key];
          if (!series) throw new Error(`No Alpha Vantage series for key: ${key}. Available keys: ${Object.keys(data).join(', ')}`);

          const timestamps = Object.keys(series).sort();
          const relevant = timestamps.filter(ts => {
            const d = new Date(ts);
            return d >= fromTime && d <= toTime;
          });

          if (relevant.length === 0) {
            console.warn(`⚠️ No candles in time window. Total candles: ${timestamps.length}, Window: ${fromTime.toISOString()} to ${toTime.toISOString()}`);
            // Use the latest available data if no data in exact window
            const latest = timestamps.slice(-Math.min(5, timestamps.length));
            if (latest.length > 0) {
              console.log(`📊 Using ${latest.length} latest candles as fallback`);
              marketData = {
                source: `Alpha Vantage ${key} (latest ${latest.length} candles)`,
                open: parseFloat(series[latest[0]]['1. open']),
                close: parseFloat(series[latest[latest.length - 1]]['4. close']),
                high: Math.max(...latest.map(ts => parseFloat(series[ts]['2. high']))),
                low: Math.min(...latest.map(ts => parseFloat(series[ts]['3. low']))),
                volume: latest.reduce((sum, ts) => sum + parseInt(series[ts]['5. volume'] || '0'), 0),
                prices: latest.map(ts => parseFloat(series[ts]['4. close'])),
                candleCount: latest.length
              } as any;
              dataSource = `${symbol} via Alpha Vantage (latest data)`;
            } else {
              throw new Error('Alpha Vantage returned no usable candles');
            }
          } else {
            marketData = {
              source: `Alpha Vantage ${key}`,
              open: parseFloat(series[relevant[0]]['1. open']),
              close: parseFloat(series[relevant[relevant.length - 1]]['4. close']),
              high: Math.max(...relevant.map(ts => parseFloat(series[ts]['2. high']))),
              low: Math.min(...relevant.map(ts => parseFloat(series[ts]['3. low']))),
              volume: relevant.reduce((sum, ts) => sum + parseInt(series[ts]['5. volume'] || '0'), 0),
              prices: relevant.map(ts => parseFloat(series[ts]['4. close'])),
              candleCount: relevant.length
            } as any;
            dataSource = `${symbol} via Alpha Vantage`;
          }
        }
      } catch (avErr) {
        const fullError = `REAL-TIME MARKET DATA FETCH FAILED for ${symbol}. Tried: ${triedMethods.join(', ')}. Finnhub errors: ${errors.join(' | ')}. Alpha Vantage error: ${avErr.message}`;
        console.error(`🚨 ${fullError}`);
        throw new Error(fullError);
      }
    }



    // Log summary of attempts
    console.log(`Tried methods: ${triedMethods.join(', ')}`);
    console.log(`Final data source: ${dataSource || 'none'}, candles: ${marketData?.candleCount || 0}`);

    // Compute robust metrics if we have market data
    let metricsText = '';
    let computedMetrics = null;

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
          returns.push((marketData.prices[i] - marketData.prices[i - 1]) / marketData.prices[i - 1]);
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        volatility = (Math.sqrt(variance) * 100).toFixed(2);
      }

      computedMetrics = {
        open: marketData.open,
        close: marketData.close,
        high: marketData.high,
        low: marketData.low,
        priceChange,
        priceChangePercent,
        rangePercent,
        volatility
      };

      const volumeText = marketData.volume > 0 ? `- Volume: ${marketData.volume.toLocaleString()}` : '';

      metricsText = `
MARKET DATA (${marketData.source}, ${marketData.candleCount} candles):
- Price: ${marketData.open.toFixed(4)} → ${marketData.close.toFixed(4)} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent}%)
- Range: ${marketData.low.toFixed(4)} - ${marketData.high.toFixed(4)} (${rangePercent}% range)
- Volatility: ${volatility}%
${volumeText}
Time window: ${spanMinutes.toFixed(0)} minutes
`;
    } else {
      metricsText = `Note: Market data unavailable for ${symbol} during ${spanMinutes.toFixed(0)}-minute window. Tried: ${triedMethods.join(', ')}.`;
    }

    // Enhanced AI analysis with multiple fallback strategies
    let aiSummary = '';
    let usedProgrammaticFallback = false;
    let dataSourceInfo = dataSource ? `${dataSource} • ${marketData?.candleCount || 0} candles` : '';

    // Determine display symbol and units information
    const displaySymbol = symbol;
    const displayPair = assetInfo.requestedPair || symbol;
    const unitsText = assetInfo.type === 'forex' && assetInfo.requestedPair
      ? `Units: ${displayPair} (${assetInfo.requestedPair.split('/')[1]} per 1 ${assetInfo.requestedPair.split('/')[0]})`
      : displaySymbol;

    // We should ALWAYS have market data by now, if not it's a real error
    if (!marketData) {
      throw new Error('CRITICAL ERROR: Market data fetch failed and this should never happen with our fail-fast system');
    }

    // Try Gemini AI analysis with enhanced error handling
    try {
      if (geminiApiKey) {
        const analysisPrompt = `Analyze ${displaySymbol} price movement based on the following data. Provide professional market analysis in exactly three bullet points plus sources.

${metricsText}

Format your response as:
• [Price movement with specific percentages and levels]
• [Market catalyst or fundamental driver]  
• [Technical context and market reaction]

Sources: [List any relevant financial news sources]

Requirements:
- Use exact price data provided above
- Keep each bullet under 25 words
- Focus on factual price action
- Provide realistic market context for ${assetInfo.type === 'forex' ? 'forex' : assetInfo.type === 'crypto' ? 'cryptocurrency' : 'equity'} markets`;

        const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + geminiApiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: analysisPrompt }]
            }],
            generationConfig: {
              maxOutputTokens: 300,
              temperature: 0.7
            }
          })
        });

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();

          if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
            aiSummary = geminiData.candidates[0].content.parts[0].text.trim();

            // Clean up any disclaimer text
            aiSummary = aiSummary
              .replace(/^I (do not have|cannot|don't have) access to real-time.*$/gim, '')
              .replace(/Please note that.*?\.?\s*/gi, '')
              .replace(/Disclaimer:.*?\.?\s*/gi, '')
              .replace(/\*\*Disclaimer\*\*:.*?\.?\s*/gi, '')
              .replace(/\n\s*\n/g, '\n')
              .trim();

            console.log('✓ Success with Gemini AI analysis');
          } else {
            throw new Error('No valid content in Gemini response');
          }
        } else {
          throw new Error(`Gemini API error: ${geminiResponse.status}`);
        }
      } else {
        throw new Error('Gemini API key not configured');
      }
    } catch (error) {
      console.error(`🚨 GEMINI AI ANALYSIS FAILED: ${error.message}`);
      throw new Error(`GEMINI AI API ERROR: ${error.message}. Check your GEMINI_API_KEY configuration and API quotas.`);
    }

    // Validate the summary
    if (!aiSummary || aiSummary.length < 20) {
      throw new Error('GEMINI AI returned insufficient analysis. Check API configuration and try again.');
    }

    // Always add data source information
    if (!aiSummary.includes('Data:')) {
      const timeRange = `${fromTime.toISOString().split('T')[0]} → ${toTime.toISOString().split('T')[0]}`;
      const sourceInfo = dataSourceInfo || 'Market analysis completed';
      const dataSourceLine = `\n\nData: ${sourceInfo} • ${timeRange}`;
      aiSummary += dataSourceLine;
    }

    // Final logging
    console.log(`Used programmatic fallback: ${usedProgrammaticFallback}`);
    console.log(`Final AI summary length: ${aiSummary.length}`);
    console.log(`Analysis completed successfully for ${symbol}`);

    const response = {
      symbol,
      from: fromTime.toISOString(),
      to: toTime.toISOString(),
      dataSource: dataSourceInfo,
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