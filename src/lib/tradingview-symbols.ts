/**
 * Map ChartMate/internal symbols to TradingView chart format.
 * TradingView uses EXCHANGE:SYMBOL (e.g. BSE:PCJEWELLER, NSE:RELIANCE, NASDAQ:AAPL).
 * Chart URL: https://www.tradingview.com/chart/?symbol=EXCHANGE:SYMBOL
 */
export function getTradingViewSymbol(symbol: string): string {
  if (!symbol || typeof symbol !== "string") return "BSE:SENSEX";
  const s = symbol.trim().toUpperCase();

  // Indian: .BO = BSE, .NS = NSE
  if (s.endsWith(".BO")) {
    return `BSE:${s.slice(0, -3)}`;
  }
  if (s.endsWith(".NS")) {
    return `NSE:${s.slice(0, -3)}`;
  }

  // Forex (e.g. GBPUSD=X, EURUSD=X) — TradingView uses FX: or OANDA:
  if (s.endsWith("=X") || (s.length === 6 && /^[A-Z]{6}$/.test(s))) {
    const pair = s.replace("=X", "");
    return `FX:${pair}`;
  }

  // US stocks — assume NASDAQ if no exchange; could be extended with NYSE: etc.
  if (/^[A-Z]{1,5}$/.test(s)) {
    return `NASDAQ:${s}`;
  }

  // Crypto (e.g. BTC-USD, ETH-USD) — align with Binance USDT pairs used in our WebSocket feed
  if (s.includes("-USD") || s.includes("BTC") || s.includes("ETH")) {
    const base = s.split("-")[0] || s;
    return `BINANCE:${base}USDT`;
  }

  // Default: use as-is (might work for some symbols)
  return s.includes(":") ? s : `BSE:${s}`;
}

/** Whether the asset is typically quoted in USD (US stocks, forex, crypto). */
export function isUsdDenominatedSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== "string") return false;
  const s = symbol.trim().toUpperCase();
  if (s.endsWith(".BO") || s.endsWith(".NS")) return false;
  if (s.endsWith("=X") || /^[A-Z]{6}$/.test(s)) return true; // forex
  if (s.includes("-USD") || s.includes("BTC") || s.includes("ETH")) return true; // crypto
  // US-style tickers (1–5 letters, no dot)
  if (/^[A-Z]{1,5}$/.test(s)) return true;
  return false;
}
