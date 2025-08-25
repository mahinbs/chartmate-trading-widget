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

async function fetchHistoricalCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
  
  if (!finnhubApiKey) {
    console.log('Finnhub API key not configured, returning empty candles');
    return [];
  }

  try {
    // Map common forex symbols to Finnhub format
    let finnhubSymbol = symbol;
    if (symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('JPY')) {
      // Handle forex pairs by converting to OANDA format
      if (symbol === 'EURUSD') finnhubSymbol = 'OANDA:EUR_USD';
      else if (symbol === 'GBPUSD') finnhubSymbol = 'OANDA:GBP_USD';
      else if (symbol === 'USDJPY') finnhubSymbol = 'OANDA:USD_JPY';
      else if (symbol === 'USDCHF') finnhubSymbol = 'OANDA:USD_CHF';
      else if (symbol === 'AUDUSD') finnhubSymbol = 'OANDA:AUD_USD';
      else if (symbol === 'USDCAD') finnhubSymbol = 'OANDA:USD_CAD';
      else if (symbol === 'NZDUSD') finnhubSymbol = 'OANDA:NZD_USD';
      // Add more forex pairs as needed
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
      return [];
    }

    const data = await response.json();
    
    if (data.s !== 'ok' || !data.c || data.c.length === 0) {
      console.log(`No candle data found for ${symbol}`);
      return [];
    }

    // Convert to candle format
    const candles: Candle[] = [];
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

    return candles.slice(-100); // Keep last 100 candles
  } catch (error) {
    console.error(`Error fetching candles for ${symbol}:`, error);
    return [];
  }
}

async function fetchRealStockData(symbol: string): Promise<StockData> {
  const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');
  
  if (!finnhubApiKey) {
    throw new Error('Finnhub API key not configured');
  }

  try {
    // Map common forex symbols to Finnhub format for quotes
    let finnhubSymbol = symbol;
    if (symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('JPY')) {
      // Handle forex pairs by converting to OANDA format
      if (symbol === 'EURUSD') finnhubSymbol = 'OANDA:EUR_USD';
      else if (symbol === 'GBPUSD') finnhubSymbol = 'OANDA:GBP_USD';
      else if (symbol === 'USDJPY') finnhubSymbol = 'OANDA:USD_JPY';
      else if (symbol === 'USDCHF') finnhubSymbol = 'OANDA:USD_CHF';
      else if (symbol === 'AUDUSD') finnhubSymbol = 'OANDA:AUD_USD';
      else if (symbol === 'USDCAD') finnhubSymbol = 'OANDA:USD_CAD';
      else if (symbol === 'NZDUSD') finnhubSymbol = 'OANDA:NZD_USD';
    }

    console.log(`Fetching quote for ${symbol} (mapped to ${finnhubSymbol})`);

    // Get current quote from Finnhub for all symbols
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${finnhubSymbol}&token=${finnhubApiKey}`
    );

    if (!response.ok) {
      console.log(`Finnhub API error for ${symbol}: ${response.status}, using fallback data`);
      return getFallbackData(symbol);
    }

    const data = await response.json();
    
    if (!data.c || data.c === 0) {
      console.log(`No data found for ${symbol}, using fallback data`);
      return getFallbackData(symbol);
    }

    // Extract real stock data
    return {
      currentPrice: data.c, // Current price
      openPrice: data.o,    // Open price
      highPrice: data.h,    // High price
      lowPrice: data.l,     // Low price
      previousClose: data.pc, // Previous close
      change: data.d,       // Change
      changePercent: data.dp // Change percent
    };
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    console.log(`Using fallback data for ${symbol}`);
    return getFallbackData(symbol);
  }
}

function getFallbackData(symbol: string): StockData {
  // Return more realistic fallback data based on symbol type
  if (symbol === 'EURUSD' || symbol.includes('EUR')) {
    return {
      currentPrice: 1.17,
      openPrice: 1.16,
      highPrice: 1.18,
      lowPrice: 1.15,
      previousClose: 1.16,
      change: 0.01,
      changePercent: 0.86
    };
  }
  
  // Default fallback for other symbols
  return {
    currentPrice: 100.0,
    openPrice: 99.5,
    highPrice: 101.0,
    lowPrice: 98.5,
    previousClose: 99.5,
    change: 0.5,
    changePercent: 0.50
  };
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
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && 
        highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      resistance.push(highs[i]);
    }
    
    // Swing low
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && 
        lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
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
  `${i+1}. O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} V:${c.volume}`
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
    const [stockData, candles] = await Promise.all([
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