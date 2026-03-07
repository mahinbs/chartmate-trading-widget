/**
 * backtest-strategy — Supabase Edge Function
 *
 * Runs a historical backtest for a given strategy on real OHLCV data,
 * and checks whether current market conditions satisfy the strategy's
 * entry requirements ("strategy achieved").
 *
 * Returns:
 *   strategyAchieved  – whether current conditions match the strategy
 *   achievementReason – plain-English explanation
 *   totalTrades       – # of simulated trades in the backtest window
 *   winRate           – percentage of profitable trades
 *   avgReturn         – average return per trade (%)
 *   totalReturn       – cumulative return over the period (%)
 *   maxDrawdown       – largest peak-to-trough loss (%)
 *   profitFactor      – gross profit / gross loss
 *   backtestPeriod    – how many days were backtested
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// ─── Indicator helpers ────────────────────────────────────────────────────────

function computeSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function computeRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    if (i === period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    } else {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }
  return result;
}

function computeATR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  const result: (number | null)[] = [null];
  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const avg = trs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    result.push(avg);
  }
  return result;
}

// ─── Strategy achievement check (current conditions) ─────────────────────────

function checkStrategyAchieved(
  strategy: string,
  action: "BUY" | "SELL",
  latestClose: number,
  latestSMA20: number | null,
  latestRSI: number | null,
  high20d: number,
  low20d: number,
): { achieved: boolean; reason: string } {
  const rsi = latestRSI ?? 50;
  const aboveSMA = latestSMA20 != null && latestClose > latestSMA20;
  const belowSMA = latestSMA20 != null && latestClose < latestSMA20;
  const pctFromHigh = latestSMA20 ? ((latestClose - high20d) / high20d) * 100 : 0;
  const pctFromLow  = latestSMA20 ? ((latestClose - low20d) / low20d) * 100 : 0;

  switch (strategy) {
    case "trend_following":
      if (action === "BUY")  return aboveSMA && rsi > 45
        ? { achieved: true,  reason: `Price (${latestClose.toFixed(2)}) is above SMA20 (${latestSMA20?.toFixed(2)}) and RSI ${rsi.toFixed(1)} > 45 — uptrend conditions met.` }
        : { achieved: false, reason: `Trend-following BUY requires price above SMA20 and RSI > 45. Current: price ${aboveSMA ? "above" : "below"} SMA20, RSI ${rsi.toFixed(1)}.` };
      return belowSMA && rsi < 55
        ? { achieved: true,  reason: `Price below SMA20 and RSI ${rsi.toFixed(1)} < 55 — downtrend conditions met for SELL.` }
        : { achieved: false, reason: `Trend-following SELL requires price below SMA20. Current: price ${belowSMA ? "below" : "above"} SMA20.` };

    case "breakout_breakdown":
      if (action === "BUY")  return pctFromHigh > -2
        ? { achieved: true,  reason: `Price is within 2% of the 20-day high (${high20d.toFixed(2)}) — breakout setup is active.` }
        : { achieved: false, reason: `Breakout BUY requires price within 2% of the 20-day high (${high20d.toFixed(2)}). Current price is ${Math.abs(pctFromHigh).toFixed(1)}% away.` };
      return pctFromLow < 2
        ? { achieved: true,  reason: `Price is within 2% of the 20-day low (${low20d.toFixed(2)}) — breakdown setup is active.` }
        : { achieved: false, reason: `Breakdown SELL requires price within 2% of the 20-day low (${low20d.toFixed(2)}).` };

    case "mean_reversion":
      if (action === "BUY")  return rsi < 35
        ? { achieved: true,  reason: `RSI ${rsi.toFixed(1)} < 35 — asset is oversold, mean-reversion BUY conditions met.` }
        : { achieved: false, reason: `Mean-reversion BUY requires RSI < 35 (oversold). Current RSI: ${rsi.toFixed(1)}. Wait for a deeper pullback.` };
      return rsi > 65
        ? { achieved: true,  reason: `RSI ${rsi.toFixed(1)} > 65 — asset is overbought, mean-reversion SELL conditions met.` }
        : { achieved: false, reason: `Mean-reversion SELL requires RSI > 65 (overbought). Current RSI: ${rsi.toFixed(1)}.` };

    case "momentum":
      if (action === "BUY")  return rsi > 55 && aboveSMA
        ? { achieved: true,  reason: `RSI ${rsi.toFixed(1)} > 55 and price above SMA20 — momentum is bullish, conditions met.` }
        : { achieved: false, reason: `Momentum BUY requires RSI > 55 and price above SMA20. RSI: ${rsi.toFixed(1)}, price ${aboveSMA ? "above" : "below"} SMA20.` };
      return rsi < 45 && belowSMA
        ? { achieved: true,  reason: `RSI ${rsi.toFixed(1)} < 45 and price below SMA20 — bearish momentum conditions met.` }
        : { achieved: false, reason: `Momentum SELL requires RSI < 45 and price below SMA20.` };

    case "scalping": {
      const intraVolatility = latestSMA20 ? Math.abs((latestClose - latestSMA20) / latestSMA20 * 100) : 0;
      return intraVolatility > 0.3
        ? { achieved: true,  reason: `Intraday price movement of ~${intraVolatility.toFixed(1)}% from SMA — sufficient volatility for scalping.` }
        : { achieved: false, reason: `Scalping needs higher intraday volatility. Price is too close to average — spreads may eliminate profits.` };
    }

    case "swing_trading":
      if (action === "BUY")  return aboveSMA && rsi > 40 && rsi < 65
        ? { achieved: true,  reason: `RSI ${rsi.toFixed(1)} in neutral zone (40–65) with price above SMA20 — healthy pullback for swing entry.` }
        : { achieved: false, reason: `Swing-trading BUY needs price above SMA20 and RSI between 40–65. RSI: ${rsi.toFixed(1)}.` };
      return belowSMA && rsi > 35 && rsi < 60
        ? { achieved: true,  reason: `RSI ${rsi.toFixed(1)} neutral with price below SMA20 — swing short conditions met.` }
        : { achieved: false, reason: `Swing-trading SELL needs price below SMA20 and RSI between 35–60.` };

    case "range_trading": {
      const midRange = (high20d + low20d) / 2;
      const rangeWidth = ((high20d - low20d) / midRange) * 100;
      const isRanging = rangeWidth < 15 && rsi > 35 && rsi < 65;
      return isRanging
        ? { achieved: true,  reason: `20-day range is ${rangeWidth.toFixed(1)}% wide and RSI ${rsi.toFixed(1)} is neutral — range-trading conditions met.` }
        : { achieved: false, reason: `Range-trading requires a well-defined range (< 15% wide) and neutral RSI. Range: ${rangeWidth.toFixed(1)}%, RSI: ${rsi.toFixed(1)}.` };
    }

    case "news_based":
      return { achieved: true, reason: "News/event-based strategy can be applied when a catalyst is present. Ensure a known event is driving this trade." };

    case "options_buying":
      return rsi > 60 || rsi < 40
        ? { achieved: true,  reason: `RSI ${rsi.toFixed(1)} shows directional conviction — options buying for leveraged directional bet is appropriate.` }
        : { achieved: false, reason: `Options-buying works best with strong directional conviction (RSI > 60 or < 40). RSI is ${rsi.toFixed(1)} — direction unclear.` };

    case "options_selling": {
      const rangeWidth = ((high20d - low20d) / low20d) * 100;
      return rangeWidth < 12 && rsi > 40 && rsi < 60
        ? { achieved: true,  reason: `Price in a ${rangeWidth.toFixed(1)}% range with neutral RSI — low-volatility environment is ideal for options selling.` }
        : { achieved: false, reason: `Options-selling needs low volatility and range-bound price. Range: ${rangeWidth.toFixed(1)}%, RSI: ${rsi.toFixed(1)}.` };
    }

    case "pairs_trading":
      return { achieved: false, reason: "Pairs-trading requires two correlated symbols. Cannot determine spread conditions with a single asset." };

    default:
      return { achieved: true, reason: "Strategy conditions not specifically defined — proceed with caution." };
  }
}

// ─── Strategy simulation (backtest) ──────────────────────────────────────────

interface Trade { return: number; entryIdx: number; exitIdx: number }

function simulateTrades(
  strategy: string,
  action: "BUY" | "SELL",
  closes: number[],
  highs: number[],
  lows: number[],
  sma20: (number | null)[],
  rsi: (number | null)[],
): Trade[] {
  const trades: Trade[] = [];
  let inTrade = false;
  let entryPrice = 0;
  let entryIdx = 0;
  let holdDays = 0;
  const SL = action === "BUY" ? 0.95 : 1.05;   // 5% stop loss
  const TP = action === "BUY" ? 1.07 : 0.93;   // 7% take profit
  const maxHold = 10;

  const exit = (i: number) => {
    const ret = action === "BUY"
      ? ((closes[i] - entryPrice) / entryPrice) * 100
      : ((entryPrice - closes[i]) / entryPrice) * 100;
    trades.push({ return: ret, entryIdx, exitIdx: i });
    inTrade = false;
  };

  for (let i = 20; i < closes.length; i++) {
    if (inTrade) {
      holdDays++;
      const ratio = closes[i] / entryPrice;
      if ((action === "BUY" && (ratio <= SL || ratio >= TP)) ||
          (action === "SELL" && (ratio >= 2 - SL || ratio <= 2 - TP)) ||
          holdDays >= maxHold) {
        exit(i);
      }
      continue;
    }

    const r = rsi[i] ?? 50;
    const s = sma20[i];
    const high20 = Math.max(...highs.slice(Math.max(0, i - 20), i));
    const low20  = Math.min(...lows.slice(Math.max(0, i - 20), i));

    let signal = false;
    switch (strategy) {
      case "trend_following":
        signal = action === "BUY" ? (s != null && closes[i] > s && r > 50) : (s != null && closes[i] < s && r < 50);
        break;
      case "breakout_breakdown":
        signal = action === "BUY" ? closes[i] >= high20 * 0.99 : closes[i] <= low20 * 1.01;
        break;
      case "mean_reversion":
        signal = action === "BUY" ? r < 30 : r > 70;
        break;
      case "momentum":
        signal = action === "BUY" ? (r > 58 && s != null && closes[i] > s) : (r < 42 && s != null && closes[i] < s);
        break;
      case "scalping":
        signal = action === "BUY"
          ? (closes[i] < lows[i - 1] * 1.002 && closes[i] > closes[i - 1] * 0.99)
          : (closes[i] > highs[i - 1] * 0.998 && closes[i] < closes[i - 1] * 1.01);
        break;
      case "swing_trading":
        signal = action === "BUY"
          ? (s != null && closes[i] > s && closes[i] < closes[i - 1] && closes[i - 1] < closes[i - 2] && r > 40 && r < 65)
          : (s != null && closes[i] < s && closes[i] > closes[i - 1] && closes[i - 1] > closes[i - 2] && r > 35 && r < 60);
        break;
      case "range_trading":
        signal = action === "BUY"
          ? (closes[i] <= low20 * 1.02 && r < 40)
          : (closes[i] >= high20 * 0.98 && r > 60);
        break;
      case "news_based":
        signal = action === "BUY" ? r > 55 : r < 45;
        break;
      case "options_buying":
        signal = action === "BUY" ? (r > 60 && s != null && closes[i] > s) : (r < 40 && s != null && closes[i] < s);
        break;
      case "options_selling":
        signal = action === "BUY" ? (r < 40 && Math.abs(closes[i] - (s ?? closes[i])) / closes[i] < 0.03) : false;
        break;
      case "pairs_trading":
        signal = false;
        break;
      default:
        signal = r > 50 && action === "BUY";
    }

    if (signal && i + 1 < closes.length) {
      inTrade   = true;
      entryPrice = closes[i + 1] ?? closes[i];
      entryIdx  = i + 1;
      holdDays  = 0;
    }
  }

  // Close any open trade at end
  if (inTrade) exit(closes.length - 1);
  return trades;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]) {
  if (trades.length === 0) return { winRate: 0, avgReturn: 0, totalReturn: 0, maxDrawdown: 0, profitFactor: 0 };
  const wins   = trades.filter(t => t.return > 0);
  const losses = trades.filter(t => t.return <= 0);
  const winRate      = (wins.length / trades.length) * 100;
  const avgReturn    = trades.reduce((a, t) => a + t.return, 0) / trades.length;
  const totalReturn  = trades.reduce((a, t) => a + t.return, 0);
  const grossProfit  = wins.reduce((a, t) => a + t.return, 0);
  const grossLoss    = Math.abs(losses.reduce((a, t) => a + t.return, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss;

  // Max drawdown: largest consecutive-loss run
  let peak = 0;
  let equity = 0;
  let maxDD = 0;
  for (const t of trades) {
    equity += t.return;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  return { winRate, avgReturn, totalReturn, maxDrawdown: -maxDD, profitFactor };
}

// ─── Fetch historical OHLCV from Alpha Vantage ────────────────────────────────

function normalizeSymbol(raw: string): string {
  return (raw || "")
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "")
    .replace(/-USD$/i, "USD")
    .replace(/=X$/i, "");
}

async function fetchDailyOHLC(symbol: string, alphaKey: string) {
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${alphaKey}`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d   = await r.json();
    const ts  = d?.["Time Series (Daily)"];
    if (!ts) return null;

    const entries = Object.entries(ts)
      .sort((a, b) => a[0].localeCompare(b[0]))   // chronological
      .slice(-100);                                  // last 100 trading days

    const dates:  string[] = [];
    const opens:  number[] = [];
    const highs:  number[] = [];
    const lows:   number[] = [];
    const closes: number[] = [];

    for (const [date, bar] of entries as [string, any][]) {
      dates.push(date);
      opens.push(Number(bar["1. open"]));
      highs.push(Number(bar["2. high"]));
      lows.push(Number(bar["3. low"]));
      closes.push(Number(bar["5. adjusted close"] ?? bar["4. close"]));
    }
    return { dates, opens, highs, lows, closes };
  } catch {
    return null;
  }
}

// ─── Fallback: Fetch from Yahoo Finance ──────────────────────────────────────

async function fetchDailyOHLCFromYahoo(rawSymbol: string) {
  try {
    const sym     = encodeURIComponent(rawSymbol);
    const endTs   = Math.floor(Date.now() / 1000);
    const startTs = endTs - 100 * 24 * 60 * 60;
    const url     = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&period1=${startTs}&period2=${endTs}`;
    const r       = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d       = await r.json();
    const result  = d?.chart?.result?.[0];
    if (!result) return null;

    const timestamps  = result.timestamp as number[];
    const q           = result.indicators?.quote?.[0];
    const adjClose    = result.indicators?.adjclose?.[0]?.adjclose as number[];
    if (!timestamps || !q) return null;

    const dates:  string[] = [];
    const opens:  number[] = [];
    const highs:  number[] = [];
    const lows:   number[] = [];
    const closes: number[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (q.close?.[i] == null) continue;
      dates.push(new Date(timestamps[i] * 1000).toISOString().split("T")[0]);
      opens.push(q.open?.[i]  ?? q.close[i]);
      highs.push(q.high?.[i]  ?? q.close[i]);
      lows.push(q.low?.[i]   ?? q.close[i]);
      closes.push(adjClose?.[i] ?? q.close[i]);
    }
    return { dates, opens, highs, lows, closes };
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const alphaKey = Deno.env.get("ALPHA_VANTAGE_API_KEY") ?? "";
    const body     = await req.json().catch(() => ({}));

    const rawSymbol: string   = body?.symbol   ?? "AAPL";
    const strategy: string    = body?.strategy  ?? "trend_following";
    const action: "BUY"|"SELL" = (body?.action ?? "BUY") === "SELL" ? "SELL" : "BUY";

    const normalized = normalizeSymbol(rawSymbol);

    // 1. Fetch OHLCV data
    let ohlcv = alphaKey ? await fetchDailyOHLC(normalized, alphaKey) : null;
    if (!ohlcv) ohlcv = await fetchDailyOHLCFromYahoo(rawSymbol);
    if (!ohlcv || ohlcv.closes.length < 30) {
      return new Response(JSON.stringify({
        error: "Insufficient historical data to run backtest. Please try again later.",
        strategyAchieved: false,
        achievementReason: "Could not fetch historical data.",
      }), { status: 200, headers: JSON_HEADERS });
    }

    const { dates, opens, highs, lows, closes } = ohlcv;
    const n = closes.length;

    // 2. Compute indicators
    const sma20 = computeSMA(closes, 20);
    const rsi14 = computeRSI(closes, 14);

    const latestClose  = closes[n - 1];
    const latestSMA20  = sma20[n - 1];
    const latestRSI    = rsi14[n - 1];
    const high20d      = Math.max(...highs.slice(Math.max(0, n - 20)));
    const low20d       = Math.min(...lows.slice(Math.max(0, n - 20)));

    // 3. Check if strategy is currently achieved
    const { achieved, reason } = checkStrategyAchieved(
      strategy, action, latestClose, latestSMA20, latestRSI, high20d, low20d,
    );

    // 4. Run backtest simulation
    const trades  = simulateTrades(strategy, action, closes, highs, lows, sma20, rsi14);
    const metrics = computeMetrics(trades);

    // 5. Annotate sample trades with dates
    const sampleTrades = trades.slice(-10).map(t => ({
      entryDate:   dates[t.entryIdx] ?? "?",
      exitDate:    dates[t.exitIdx]  ?? "?",
      returnPct:   parseFloat(t.return.toFixed(2)),
      profitable:  t.return > 0,
    }));

    return new Response(JSON.stringify({
      symbol:            rawSymbol,
      strategy,
      action,
      backtestPeriod:    `${n} trading days`,
      strategyAchieved:  achieved,
      achievementReason: reason,
      totalTrades:       trades.length,
      wins:              trades.filter(t => t.return > 0).length,
      losses:            trades.filter(t => t.return <= 0).length,
      winRate:           parseFloat(metrics.winRate.toFixed(1)),
      avgReturn:         parseFloat(metrics.avgReturn.toFixed(2)),
      totalReturn:       parseFloat(metrics.totalReturn.toFixed(2)),
      maxDrawdown:       parseFloat(metrics.maxDrawdown.toFixed(2)),
      profitFactor:      parseFloat(Math.min(metrics.profitFactor, 99).toFixed(2)),
      sampleTrades,
      currentIndicators: {
        price:  parseFloat(latestClose.toFixed(2)),
        sma20:  latestSMA20 != null ? parseFloat(latestSMA20.toFixed(2)) : null,
        rsi14:  latestRSI   != null ? parseFloat(latestRSI.toFixed(1))   : null,
        high20d: parseFloat(high20d.toFixed(2)),
        low20d:  parseFloat(low20d.toFixed(2)),
      },
      fetchedAt: new Date().toISOString(),
    }), { status: 200, headers: JSON_HEADERS });

  } catch (err: any) {
    console.error("backtest-strategy error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
