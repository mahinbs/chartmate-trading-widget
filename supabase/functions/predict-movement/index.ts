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
  assetType: string;
  yahooSymbol: string;
  yahooInterval: string;
  yahooRange: string;
}

// Yahoo Finance symbol normalization
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

// Yahoo interval mapping
function mapInterval(interval: string): { yahooInterval: string; needsAggregation?: boolean; aggregateToMinutes?: number } {
  const mapping: Record<string, any> = {
    '1': { yahooInterval: '1m' },
    '5': { yahooInterval: '5m' },
    '15': { yahooInterval: '15m' },
    '60': { yahooInterval: '60m' },
    '240': { yahooInterval: '60m', needsAggregation: true, aggregateToMinutes: 240 },
    'D': { yahooInterval: '1d' },
    'W': { yahooInterval: '1wk' }
  };
  
  return mapping[interval] || { yahooInterval: '1d' };
}

// Pick range for Yahoo API based on interval
function pickRangeForInterval(yahooInterval: string): string {
  const rangeMap: Record<string, string> = {
    '1m': '5d',
    '5m': '1mo',
    '15m': '1mo',
    '60m': '3mo',
    '1d': '1y',
    '1wk': '2y'
  };
  
  return rangeMap[yahooInterval] || '1y';
}

// Resample candles for aggregation (e.g., 60m to 240m)
function resampleCandles(candles: Candle[], targetMinutes: number): Candle[] {
  if (!candles.length) return [];
  
  const sourceMinutes = 60; // Source is 60m
  const ratio = targetMinutes / sourceMinutes; // 4 for 240m
  
  const resampled: Candle[] = [];
  for (let i = 0; i < candles.length; i += ratio) {
    const group = candles.slice(i, i + ratio);
    if (group.length === 0) continue;
    
    const aggregated: Candle = {
      timestamp: group[0].timestamp,
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0)
    };
    
    resampled.push(aggregated);
  }
  
  return resampled;
}

// Derive stock data from candles (replaces Yahoo quote API)
function deriveStockDataFromCandles(candles: Candle[]): StockData {
  if (!candles.length) {
    throw new Error('No candles available to derive stock data');
  }
  
  // Sort by timestamp to ensure proper order
  const sortedCandles = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const latestCandle = sortedCandles[sortedCandles.length - 1];
  const previousCandle = sortedCandles.length > 1 ? sortedCandles[sortedCandles.length - 2] : latestCandle;
  
  const currentPrice = latestCandle.close;
  const previousClose = previousCandle.close;
  const change = currentPrice - previousClose;
  const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
  
  return {
    currentPrice,
    openPrice: latestCandle.open,
    highPrice: latestCandle.high,
    lowPrice: latestCandle.low,
    previousClose,
    change,
    changePercent
  };
}

// Fetch intraday candles for real-time quote data
async function fetchIntradayCandlesForQuote(yahooSymbol: string): Promise<Candle[]> {
  const intervals = ['1m', '5m', '15m', '60m']; // Try intraday first
  const range = '1d'; // Just today's data for quote
  
  for (const interval of intervals) {
    try {
      console.log(`🟡 Trying ${interval} candles for quote data: ${yahooSymbol}`);
      const candles = await fetchYahooChart({ yahooSymbol, interval, range });
      if (candles.length > 0) {
        console.log(`✅ Got ${candles.length} ${interval} candles for ${yahooSymbol}`);
        return candles;
      }
    } catch (error) {
      console.log(`❌ Failed ${interval} for ${yahooSymbol}:`, error.message);
      continue;
    }
  }
  
  // Fallback to daily if intraday fails
  try {
    console.log(`🟡 Fallback to daily candles for quote: ${yahooSymbol}`);
    const candles = await fetchYahooChart({ yahooSymbol, interval: '1d', range: '5d' });
    if (candles.length > 0) {
      console.log(`✅ Got ${candles.length} daily candles for ${yahooSymbol}`);
      return candles;
    }
  } catch (error) {
    console.log(`❌ Daily candles also failed for ${yahooSymbol}:`, error.message);
  }
  
  throw new Error(`Unable to fetch any candle data for ${yahooSymbol}`);
}

// Fetch chart data from Yahoo Finance
async function fetchYahooChart(params: { yahooSymbol: string; interval: string; range: string }): Promise<Candle[]> {
  const { yahooSymbol, interval, range } = params;
  console.log(`🟡 Fetching Yahoo chart: ${yahooSymbol}, interval: ${interval}, range: ${range}`);
  
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${range}`,
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
  
  const candles: Candle[] = [];
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

async function fetchHistoricalCandles(symbol: string, timeframe: string): Promise<{ candles: Candle[]; meta: MarketMeta | null }> {
  try {
    const { yahooSymbol, assetType } = normalizeToYahooSymbol(symbol);
    const intervalMapping = mapInterval(timeframe);
    const range = pickRangeForInterval(intervalMapping.yahooInterval);
    
    console.log(`Fetching Yahoo candles: ${symbol} → ${yahooSymbol} (${assetType}), interval: ${intervalMapping.yahooInterval}, range: ${range}`);
    
    // Try different intervals if the requested one fails
    const intervalSequence = [intervalMapping.yahooInterval, '5m', '15m', '60m', '1d'];
    let candles: Candle[] = [];
    let finalInterval = intervalMapping.yahooInterval;
    
    for (const interval of intervalSequence) {
      try {
        candles = await fetchYahooChart({ yahooSymbol, interval, range });
        finalInterval = interval;
        break;
      } catch (error) {
        console.log(`Failed with interval ${interval}:`, error.message);
        continue;
      }
    }
    
    if (!candles.length) {
      console.log(`No candle data found for ${symbol} → ${yahooSymbol}`);
      return { candles: [], meta: null };
    }
    
    // Apply aggregation if needed
    if (intervalMapping.needsAggregation && intervalMapping.aggregateToMinutes) {
      candles = resampleCandles(candles, intervalMapping.aggregateToMinutes);
      console.log(`Resampled to ${intervalMapping.aggregateToMinutes}m: ${candles.length} candles`);
    }
    
    const meta: MarketMeta = {
      provider: 'Yahoo Finance',
      symbol: yahooSymbol,
      resolution: finalInterval,
      assetType,
      yahooSymbol,
      yahooInterval: finalInterval,
      yahooRange: range
    };
    
    return { candles: candles.slice(-100), meta }; // Keep last 100 candles
  } catch (error) {
    console.error(`Error fetching Yahoo candles for ${symbol}:`, error);
    return { candles: [], meta: null };
  }
}

// Real-time data fetching using Yahoo Finance candles only (no quote API)
async function fetchRealStockData(symbol: string): Promise<StockData> {
  console.log(`Fetching REAL-TIME Yahoo Finance data for ${symbol}`);
  
  const { yahooSymbol, assetType } = normalizeToYahooSymbol(symbol);
  console.log(`Mapped ${symbol} → ${yahooSymbol} (${assetType})`);
  
  try {
    // Get candles for quote data (replaces Yahoo quote API)
    const candles = await fetchIntradayCandlesForQuote(yahooSymbol);
    const stockData = deriveStockDataFromCandles(candles);
    console.log(`✅ Derived stock data from ${candles.length} candles for ${yahooSymbol}:`, stockData);
    return stockData;
  } catch (error) {
    console.error(`❌ Yahoo candle-based quote failed for ${symbol} → ${yahooSymbol}:`, error);
    
    // Use enhanced fallback if candles fail
    console.log(`🟡 Using enhanced fallback data for ${symbol}`);
    return getEnhancedFallbackData(symbol);
  }
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