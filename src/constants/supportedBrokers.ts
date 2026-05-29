// =====================================================================
// Supported brokers catalogue (powers /supported-brokers)
// =====================================================================
// `domain` drives the real broker logo via the favicon service in the
// page component; `color` is the brand tint used for the monogram
// fallback when a logo can't be fetched. `integrated: true` marks the
// brokers ChartMate connects to natively today (1-click OAuth or API
// token); the rest are part of the broader supported universe reachable
// through the OpenAlgo bridge / on request.
// =====================================================================

export type BrokerCategory =
  | "Indian Stocks & F&O"
  | "Global Stocks & ETFs"
  | "Crypto Exchanges"
  | "Forex & CFD"
  | "Futures & Commodities";

export interface SupportedBroker {
  name: string;
  domain: string;
  category: BrokerCategory;
  description: string;
  color: string;
  integrated?: boolean;
  /** When set, the broker card links to /supported-brokers/<detailSlug>. */
  detailSlug?: string;
}

export const BROKER_CATEGORIES: BrokerCategory[] = [
  "Indian Stocks & F&O",
  "Global Stocks & ETFs",
  "Crypto Exchanges",
  "Forex & CFD",
  "Futures & Commodities",
];

/** Real logo via Google's favicon service; falls back to a monogram on error. */
export const brokerLogoUrl = (domain: string) =>
  `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;

export const SUPPORTED_BROKERS: SupportedBroker[] = [
  // ── Indian Stocks & F&O ────────────────────────────────────────────
  { name: "Zerodha", domain: "zerodha.com", category: "Indian Stocks & F&O", color: "#f37935", integrated: true, description: "India's largest discount broker. One-click Kite OAuth for equities, F&O and commodities." },
  { name: "Upstox", domain: "upstox.com", category: "Indian Stocks & F&O", color: "#5b2be0", integrated: true, description: "Low-cost discount broker with a fast developer API for equities and derivatives." },
  { name: "Angel One", domain: "angelone.in", category: "Indian Stocks & F&O", color: "#5367ff", integrated: true, description: "Full-service broker. Connect via SmartAPI token for orders across NSE, BSE and MCX." },
  { name: "Fyers", domain: "fyers.in", category: "Indian Stocks & F&O", color: "#2962ff", integrated: true, description: "API-first broker with one-click OAuth and rich charting for active traders." },
  { name: "Dhan", domain: "dhan.co", category: "Indian Stocks & F&O", color: "#1a9c8f", integrated: true, description: "Modern trading app with a clean DhanHQ developer API for super-fast order placement." },
  { name: "Alice Blue", domain: "aliceblueonline.com", category: "Indian Stocks & F&O", color: "#0ea5e9", integrated: true, description: "Discount broker offering ANT API access for automated equity and F&O strategies." },
  { name: "Compositedge", domain: "compositedge.com", category: "Indian Stocks & F&O", color: "#6366f1", integrated: true, description: "XTS-powered broker with low-latency API access for algorithmic execution." },
  { name: "Definedge", domain: "definedge.com", category: "Indian Stocks & F&O", color: "#eab308", integrated: true, description: "Tech-driven broker with the Definedge Suite API for systematic traders." },
  { name: "Firstock", domain: "thefirstock.com", category: "Indian Stocks & F&O", color: "#ec4899", integrated: true, description: "Connect API broker built for retail algo traders with simple session tokens." },
  { name: "5paisa", domain: "5paisa.com", category: "Indian Stocks & F&O", color: "#84cc16", integrated: true, description: "Ultra-low-cost broker with an open developer API for equities and derivatives." },
  { name: "5paisa XTS", domain: "5paisa.com", category: "Indian Stocks & F&O", color: "#a3e635", integrated: true, description: "5paisa's XTS market-data and execution API for high-frequency F&O workflows." },
  { name: "Flattrade", domain: "flattrade.in", category: "Indian Stocks & F&O", color: "#fb923c", integrated: true, description: "Zero-brokerage discount broker with a free API for automated trading." },
  { name: "Groww", domain: "groww.in", category: "Indian Stocks & F&O", color: "#00b386", integrated: true, description: "Popular investing app now offering a developer API for stocks and F&O orders." },
  { name: "Indiabulls", domain: "dhani.com", category: "Indian Stocks & F&O", color: "#3b82f6", integrated: true, description: "Indiabulls Securities API access for equity and derivative order routing." },
  { name: "IIFL Securities", domain: "iiflsecurities.com", category: "Indian Stocks & F&O", color: "#f59e0b", integrated: true, description: "Full-service broker with an interactive API for NSE/BSE cash and F&O." },
  { name: "INDmoney", domain: "indmoney.com", category: "Indian Stocks & F&O", color: "#4ade80", integrated: true, description: "Super-app for Indian and US stocks with developer access for automated orders." },
  { name: "Jainam", domain: "jainam.in", category: "Indian Stocks & F&O", color: "#8b5cf6", integrated: true, description: "XTS-powered brokerage with market + interactive API for algo execution." },
  { name: "Kotak Neo", domain: "kotaksecurities.com", category: "Indian Stocks & F&O", color: "#ef4444", integrated: true, description: "Kotak Securities' Neo API with TOTP login for equities and derivatives." },
  { name: "Motilal Oswal", domain: "motilaloswal.com", category: "Indian Stocks & F&O", color: "#facc15", integrated: true, description: "Full-service broker with the OpenAPI suite for order and portfolio automation." },
  { name: "mStock", domain: "mstock.com", category: "Indian Stocks & F&O", color: "#06b6d4", integrated: true, description: "Mirae Asset's mStock with a free lifetime API for equities and F&O." },
  { name: "Nubra", domain: "nubra.io", category: "Indian Stocks & F&O", color: "#d946ef", integrated: true, description: "Options-focused broker (Angel Arc) with SmartAPI-based automated execution." },
  { name: "Paytm Money", domain: "paytmmoney.com", category: "Indian Stocks & F&O", color: "#00b9f1", integrated: true, description: "Paytm's investing arm offering a developer API for stocks and derivatives." },
  { name: "Pocketful", domain: "pocketful.in", category: "Indian Stocks & F&O", color: "#f43f5e", integrated: true, description: "Discount broker with OAuth-based API access for systematic traders." },
  { name: "SAMCO", domain: "samco.in", category: "Indian Stocks & F&O", color: "#14b8a6", integrated: true, description: "Discount broker with the StockNote API for automated equity and F&O orders." },
  { name: "Shoonya", domain: "finvasia.com", category: "Indian Stocks & F&O", color: "#22c55e", integrated: true, description: "Finvasia's zero-brokerage platform with a free API for algo trading." },
  { name: "Tradejini", domain: "tradejini.com", category: "Indian Stocks & F&O", color: "#f97316", integrated: true, description: "Discount broker providing API access for equities, F&O and commodities." },
  { name: "Wisdom Capital", domain: "wisdomcapital.in", category: "Indian Stocks & F&O", color: "#fbbf24", integrated: true, description: "Discount brokerage with API-driven order routing for active traders." },
  { name: "Zebu", domain: "zebuetrade.com", category: "Indian Stocks & F&O", color: "#38bdf8", integrated: true, description: "Discount broker with TOTP-secured API access for automated strategies." },
  { name: "ICICI Direct", domain: "icicidirect.com", category: "Indian Stocks & F&O", color: "#c8202f", description: "Full-service broker with the Breeze API for cash, F&O and currency." },
  { name: "HDFC Securities", domain: "hdfcsec.com", category: "Indian Stocks & F&O", color: "#004c8f", description: "HDFC's full-service brokerage supporting equities, derivatives and IPOs." },
  { name: "Sharekhan", domain: "sharekhan.com", category: "Indian Stocks & F&O", color: "#f47216", description: "Veteran full-service broker with research and multi-segment trading." },
  { name: "SBI Securities", domain: "sbisecurities.in", category: "Indian Stocks & F&O", color: "#22409a", description: "SBI's brokerage arm for equities, derivatives and mutual funds." },
  { name: "Axis Direct", domain: "axisdirect.in", category: "Indian Stocks & F&O", color: "#97144d", description: "Axis Bank's full-service broker for stocks, F&O and investments." },
  { name: "Edelweiss", domain: "edelweiss.in", category: "Indian Stocks & F&O", color: "#003d7a", description: "Diversified financial-services broker for equities and derivatives." },
  { name: "Geojit", domain: "geojit.com", category: "Indian Stocks & F&O", color: "#e4002b", description: "Full-service broker with a strong presence across South India." },
  { name: "Religare", domain: "religareonline.com", category: "Indian Stocks & F&O", color: "#0072bc", description: "Full-service broker for equities, commodities and currency trading." },
  { name: "Nuvama", domain: "nuvama.com", category: "Indian Stocks & F&O", color: "#1f2937", description: "Wealth-management broker (formerly Edelweiss Wealth) for HNI traders." },
  { name: "Choice Broking", domain: "choiceindia.com", category: "Indian Stocks & F&O", color: "#f7941e", description: "Full-service broker offering equities, F&O and advisory services." },
  { name: "Prabhudas Lilladher", domain: "plindia.com", category: "Indian Stocks & F&O", color: "#00529b", description: "Legacy full-service broker with research-led equity and F&O trading." },
  { name: "Anand Rathi", domain: "anandrathi.com", category: "Indian Stocks & F&O", color: "#ed1c24", description: "Wealth and broking house for equities, derivatives and commodities." },
  { name: "SMC Global", domain: "smcindiaonline.com", category: "Indian Stocks & F&O", color: "#f15a22", description: "Diversified broker covering equities, currency and commodity markets." },
  { name: "Bonanza", domain: "bonanzaonline.com", category: "Indian Stocks & F&O", color: "#ef4123", description: "Full-service broker with multi-segment access across NSE, BSE and MCX." },
  { name: "Ventura", domain: "ventura1.com", category: "Indian Stocks & F&O", color: "#0066b3", description: "Full-service broker offering equities, derivatives and mutual funds." },
  { name: "TradeSmart", domain: "tradesmartonline.in", category: "Indian Stocks & F&O", color: "#00a651", description: "Discount broker with low flat brokerage for equities and F&O." },
  { name: "Stoxkart", domain: "stoxkart.com", category: "Indian Stocks & F&O", color: "#ff6600", description: "SMC-backed discount broker for equities and derivatives trading." },
  { name: "Espresso", domain: "espresso.sharekhan.com", category: "Indian Stocks & F&O", color: "#ff5a00", description: "Sharekhan's discount arm with flat per-order pricing." },
  { name: "Goodwill", domain: "gwcindia.in", category: "Indian Stocks & F&O", color: "#1e88e5", description: "Discount broker (GWC) with API access for equities and commodities." },
  { name: "Profitmart", domain: "profitmart.in", category: "Indian Stocks & F&O", color: "#f47b20", description: "Discount broker offering multi-segment trading and API connectivity." },

  // ── Global Stocks & ETFs ───────────────────────────────────────────
  { name: "Interactive Brokers", domain: "interactivebrokers.com", category: "Global Stocks & ETFs", color: "#d81222", description: "Global multi-asset broker with deep API access across 150+ markets." },
  { name: "Charles Schwab", domain: "schwab.com", category: "Global Stocks & ETFs", color: "#00a0df", description: "Major US broker for stocks, ETFs and options with developer APIs." },
  { name: "Fidelity", domain: "fidelity.com", category: "Global Stocks & ETFs", color: "#468125", description: "Leading US brokerage for stocks, ETFs and retirement investing." },
  { name: "TD Ameritrade", domain: "tdameritrade.com", category: "Global Stocks & ETFs", color: "#00a160", description: "US broker (now part of Schwab) known for thinkorswim and its API." },
  { name: "E*TRADE", domain: "etrade.com", category: "Global Stocks & ETFs", color: "#6633cc", description: "Morgan Stanley's online broker for US equities, options and ETFs." },
  { name: "Robinhood", domain: "robinhood.com", category: "Global Stocks & ETFs", color: "#00c805", description: "Commission-free US app for stocks, options and crypto." },
  { name: "Webull", domain: "webull.com", category: "Global Stocks & ETFs", color: "#0a84ff", description: "Commission-free broker with advanced charting for US markets." },
  { name: "Vanguard", domain: "vanguard.com", category: "Global Stocks & ETFs", color: "#96151d", description: "Low-cost index-fund and ETF pioneer for long-term investors." },
  { name: "Merrill Edge", domain: "merrilledge.com", category: "Global Stocks & ETFs", color: "#0073cf", description: "Bank of America's brokerage for US stocks, ETFs and options." },
  { name: "tastytrade", domain: "tastytrade.com", category: "Global Stocks & ETFs", color: "#4caf50", description: "Options-focused US broker with a powerful trading API." },
  { name: "Public", domain: "public.com", category: "Global Stocks & ETFs", color: "#5a31f4", description: "Social investing app for US stocks, ETFs, bonds and crypto." },
  { name: "SoFi Invest", domain: "sofi.com", category: "Global Stocks & ETFs", color: "#00a4b4", description: "All-in-one fintech offering commission-free stock and ETF trading." },
  { name: "Moomoo", domain: "moomoo.com", category: "Global Stocks & ETFs", color: "#ff6b00", description: "Futu-backed broker with pro tools for US and Asian equities." },
  { name: "Tradier", domain: "tradier.com", category: "Global Stocks & ETFs", color: "#00bcd4", description: "API-first US brokerage built for developers and fintech apps." },
  { name: "Lightspeed", domain: "lightspeed.com", category: "Global Stocks & ETFs", color: "#f47920", description: "Active-trader broker for equities, options and futures." },
  { name: "TradeStation", domain: "tradestation.com", category: "Global Stocks & ETFs", color: "#003da5", description: "Pro-grade US broker with a robust API for stocks, options and futures." },
  { name: "Ally Invest", domain: "ally.com", category: "Global Stocks & ETFs", color: "#5c068c", description: "Ally Bank's brokerage for low-cost US stock and options trading." },
  { name: "Firstrade", domain: "firstrade.com", category: "Global Stocks & ETFs", color: "#e60012", description: "Commission-free US broker popular with international investors." },
  { name: "Saxo Bank", domain: "home.saxo", category: "Global Stocks & ETFs", color: "#002c5f", description: "Danish multi-asset broker with global market access and OpenAPI." },
  { name: "DEGIRO", domain: "degiro.com", category: "Global Stocks & ETFs", color: "#ed1c24", description: "Low-cost European broker for global stocks and ETFs." },
  { name: "Trading 212", domain: "trading212.com", category: "Global Stocks & ETFs", color: "#00a3e0", description: "Commission-free UK/EU app for stocks, ETFs and CFDs." },
  { name: "Freetrade", domain: "freetrade.io", category: "Global Stocks & ETFs", color: "#1e1e1e", description: "UK commission-free investing app for stocks and ETFs." },
  { name: "Hargreaves Lansdown", domain: "hl.co.uk", category: "Global Stocks & ETFs", color: "#00263a", description: "UK's largest investment platform for funds, shares and ISAs." },
  { name: "Interactive Investor", domain: "ii.co.uk", category: "Global Stocks & ETFs", color: "#e3001b", description: "UK flat-fee investment platform for shares, funds and ETFs." },
  { name: "eToro", domain: "etoro.com", category: "Global Stocks & ETFs", color: "#6ac259", description: "Social trading platform for stocks, ETFs and crypto with copy-trading." },
  { name: "Revolut", domain: "revolut.com", category: "Global Stocks & ETFs", color: "#0666eb", description: "Fintech super-app with commission-light stock and crypto trading." },
  { name: "Trade Republic", domain: "traderepublic.com", category: "Global Stocks & ETFs", color: "#000000", description: "European mobile broker for stocks, ETFs and savings plans." },
  { name: "Scalable Capital", domain: "scalable.capital", category: "Global Stocks & ETFs", color: "#1a1a2e", description: "German broker and robo-advisor for stocks, ETFs and crypto." },
  { name: "Wealthsimple", domain: "wealthsimple.com", category: "Global Stocks & ETFs", color: "#32302f", description: "Canadian fintech for commission-free stock, ETF and crypto trading." },
  { name: "Questrade", domain: "questrade.com", category: "Global Stocks & ETFs", color: "#0066b3", description: "Canadian self-directed broker for stocks, ETFs and options." },
  { name: "CommSec", domain: "commsec.com.au", category: "Global Stocks & ETFs", color: "#ffcc00", description: "Commonwealth Bank's brokerage for Australian and US equities." },
  { name: "Stake", domain: "stake.com.au", category: "Global Stocks & ETFs", color: "#6938ef", description: "Australian app for low-cost US and ASX share trading." },
  { name: "Tiger Brokers", domain: "tigerbrokers.com", category: "Global Stocks & ETFs", color: "#ff6f00", description: "Global broker for US, HK and Singapore equities and options." },
  { name: "Futu", domain: "futunn.com", category: "Global Stocks & ETFs", color: "#ff6b00", description: "Pro trading platform for US, HK and China-listed equities." },
  { name: "Zacks Trade", domain: "zackstrade.com", category: "Global Stocks & ETFs", color: "#1f5fa8", description: "Research-driven broker offering global market access for active traders." },

  // ── Crypto Exchanges ───────────────────────────────────────────────
  { name: "Binance", domain: "binance.com", category: "Crypto Exchanges", color: "#f3ba2f", integrated: true, description: "World's largest crypto exchange. Spot and futures via API key for live and paper bots." },
  { name: "Coinbase", domain: "coinbase.com", category: "Crypto Exchanges", color: "#0052ff", description: "Leading US-regulated exchange with Advanced Trade and developer APIs." },
  { name: "Kraken", domain: "kraken.com", category: "Crypto Exchanges", color: "#5741d9", description: "Veteran exchange with deep liquidity, spot and futures REST/WebSocket APIs." },
  { name: "Bybit", domain: "bybit.com", category: "Crypto Exchanges", color: "#f7a600", description: "Derivatives-first exchange with high-leverage perpetuals and a fast API." },
  { name: "OKX", domain: "okx.com", category: "Crypto Exchanges", color: "#111111", description: "Global exchange with spot, futures, options and a unified trading API." },
  { name: "KuCoin", domain: "kucoin.com", category: "Crypto Exchanges", color: "#24ae8f", description: "Broad-altcoin exchange with spot, margin and futures API access." },
  { name: "Bitget", domain: "bitget.com", category: "Crypto Exchanges", color: "#1da2b4", description: "Derivatives and copy-trading exchange with a robust trading API." },
  { name: "Gate.io", domain: "gate.io", category: "Crypto Exchanges", color: "#2354e6", description: "Long-tail altcoin exchange with spot, futures and options APIs." },
  { name: "Crypto.com", domain: "crypto.com", category: "Crypto Exchanges", color: "#103f68", description: "Consumer crypto app and exchange with a full trading API." },
  { name: "Gemini", domain: "gemini.com", category: "Crypto Exchanges", color: "#00dcfa", description: "US-regulated exchange focused on security and compliance." },
  { name: "Bitfinex", domain: "bitfinex.com", category: "Crypto Exchanges", color: "#16b157", description: "Advanced exchange with deep liquidity, margin and lending APIs." },
  { name: "Bitstamp", domain: "bitstamp.net", category: "Crypto Exchanges", color: "#009e3a", description: "One of the oldest exchanges, EU-regulated with a clean API." },
  { name: "HTX", domain: "htx.com", category: "Crypto Exchanges", color: "#008cd6", description: "Global exchange (formerly Huobi) for spot and derivatives trading." },
  { name: "MEXC", domain: "mexc.com", category: "Crypto Exchanges", color: "#00b897", description: "High-listing-volume exchange with spot and futures API support." },
  { name: "Poloniex", domain: "poloniex.com", category: "Crypto Exchanges", color: "#0d9bd6", description: "Veteran altcoin exchange with spot and futures markets." },
  { name: "Coincheck", domain: "coincheck.com", category: "Crypto Exchanges", color: "#1d4ed8", description: "Major Japanese exchange for spot crypto trading." },
  { name: "bitFlyer", domain: "bitflyer.com", category: "Crypto Exchanges", color: "#d4a017", description: "Leading Japanese exchange with a regulated spot and futures API." },
  { name: "Upbit", domain: "upbit.com", category: "Crypto Exchanges", color: "#093687", description: "South Korea's largest exchange with deep KRW liquidity." },
  { name: "Bithumb", domain: "bithumb.com", category: "Crypto Exchanges", color: "#f37321", description: "Major Korean exchange for spot crypto trading." },
  { name: "WazirX", domain: "wazirx.com", category: "Crypto Exchanges", color: "#3067f0", description: "Popular Indian crypto exchange with an order-placement API." },
  { name: "CoinDCX", domain: "coindcx.com", category: "Crypto Exchanges", color: "#4f5fee", description: "Leading Indian exchange offering spot and futures API access." },
  { name: "CoinSwitch", domain: "coinswitch.co", category: "Crypto Exchanges", color: "#5e5adb", description: "Indian crypto investing app with a simple trading interface." },
  { name: "Deribit", domain: "deribit.com", category: "Crypto Exchanges", color: "#11161c", description: "Premier crypto options and futures venue with a low-latency API." },
  { name: "BitMEX", domain: "bitmex.com", category: "Crypto Exchanges", color: "#1a1a1a", description: "Derivatives exchange that pioneered crypto perpetual swaps." },
  { name: "Phemex", domain: "phemex.com", category: "Crypto Exchanges", color: "#00b4d8", description: "Fast derivatives exchange with zero-fee spot and a clean API." },
  { name: "WhiteBIT", domain: "whitebit.com", category: "Crypto Exchanges", color: "#15a47a", description: "European exchange with spot, margin and futures markets." },
  { name: "LBank", domain: "lbank.com", category: "Crypto Exchanges", color: "#00d4b5", description: "Global exchange with a wide altcoin selection and API access." },
  { name: "BingX", domain: "bingx.com", category: "Crypto Exchanges", color: "#2354ff", description: "Social and copy-trading exchange for spot and perpetuals." },
  { name: "Bitvavo", domain: "bitvavo.com", category: "Crypto Exchanges", color: "#1a1a2e", description: "Dutch-regulated exchange with low fees and a developer API." },
  { name: "HitBTC", domain: "hitbtc.com", category: "Crypto Exchanges", color: "#1c2030", description: "Long-running exchange with a broad market and trading API." },

  // ── Forex & CFD ────────────────────────────────────────────────────
  { name: "OANDA", domain: "oanda.com", category: "Forex & CFD", color: "#cd1409", description: "Veteran forex broker with a developer-friendly REST and streaming API." },
  { name: "Forex.com", domain: "forex.com", category: "Forex & CFD", color: "#e31837", description: "Global forex and CFD broker (StoneX) with API access for automation." },
  { name: "IG", domain: "ig.com", category: "Forex & CFD", color: "#e30613", description: "Global leader in CFDs and spread betting with a full trading API." },
  { name: "CMC Markets", domain: "cmcmarkets.com", category: "Forex & CFD", color: "#e4002b", description: "Established CFD and forex broker with thousands of instruments." },
  { name: "Pepperstone", domain: "pepperstone.com", category: "Forex & CFD", color: "#d81e05", description: "Low-spread forex/CFD broker supporting MT4, MT5 and cTrader." },
  { name: "IC Markets", domain: "icmarkets.com", category: "Forex & CFD", color: "#003a70", description: "ECN broker with raw spreads and MT4/MT5/cTrader connectivity." },
  { name: "XM", domain: "xm.com", category: "Forex & CFD", color: "#d4001a", description: "Global forex and CFD broker with MT4/MT5 and tight spreads." },
  { name: "FXCM", domain: "fxcm.com", category: "Forex & CFD", color: "#003366", description: "Forex and CFD broker with a well-documented trading API." },
  { name: "Plus500", domain: "plus500.com", category: "Forex & CFD", color: "#ed1c24", description: "CFD specialist covering forex, indices, shares and commodities." },
  { name: "AvaTrade", domain: "avatrade.com", category: "Forex & CFD", color: "#00a4e4", description: "Multi-regulated forex/CFD broker with MT4, MT5 and AvaTradeGO." },
  { name: "FxPro", domain: "fxpro.com", category: "Forex & CFD", color: "#c8102e", description: "Forex and CFD broker offering MT4, MT5 and cTrader platforms." },
  { name: "Exness", domain: "exness.com", category: "Forex & CFD", color: "#ffe600", description: "High-volume forex broker with instant withdrawals and MT4/MT5.", detailSlug: "exness" },
  { name: "FBS", domain: "fbs.com", category: "Forex & CFD", color: "#0046be", description: "Global forex broker with low-cost accounts and MT4/MT5 support." },
  { name: "OctaFX", domain: "octafx.com", category: "Forex & CFD", color: "#e21e26", description: "Forex/CFD broker with copy-trading and MetaTrader platforms." },
  { name: "HFM", domain: "hfm.com", category: "Forex & CFD", color: "#d4001a", description: "HF Markets — multi-asset forex/CFD broker with MT4 and MT5." },
  { name: "Tickmill", domain: "tickmill.com", category: "Forex & CFD", color: "#f47920", description: "Low-cost ECN forex broker with raw spreads and fast execution." },
  { name: "Admirals", domain: "admiralmarkets.com", category: "Forex & CFD", color: "#009fe3", description: "Multi-regulated forex/CFD broker (Admiral Markets) with MT4/MT5." },
  { name: "ThinkMarkets", domain: "thinkmarkets.com", category: "Forex & CFD", color: "#00b1eb", description: "Forex/CFD broker with ThinkTrader, MT4 and MT5 platforms." },
  { name: "Vantage", domain: "vantagemarkets.com", category: "Forex & CFD", color: "#009b3a", description: "Multi-asset forex/CFD broker with raw ECN pricing and MT4/MT5.", detailSlug: "vantage" },
  { name: "FP Markets", domain: "fpmarkets.com", category: "Forex & CFD", color: "#003a5d", description: "Australian ECN forex/CFD broker with MT4, MT5 and cTrader." },
  { name: "Swissquote", domain: "swissquote.com", category: "Forex & CFD", color: "#e30613", description: "Swiss bank and broker for forex, CFDs and global securities." },
  { name: "Dukascopy", domain: "dukascopy.com", category: "Forex & CFD", color: "#003366", description: "Swiss forex bank with JForex API and ECN liquidity." },
  { name: "LMAX", domain: "lmax.com", category: "Forex & CFD", color: "#0033a0", description: "Exchange-style forex broker with ultra-low-latency FIX API." },
  { name: "Capital.com", domain: "capital.com", category: "Forex & CFD", color: "#6c5ce7", description: "AI-driven CFD broker with an open trading API across asset classes." },
  { name: "Saxo (FX)", domain: "home.saxo", category: "Forex & CFD", color: "#002c5f", description: "Saxo Bank's forex and CFD desk with the powerful OpenAPI." },

  // ── Futures & Commodities ──────────────────────────────────────────
  { name: "NinjaTrader", domain: "ninjatrader.com", category: "Futures & Commodities", color: "#f47b20", description: "Popular futures platform and brokerage with an automation API." },
  { name: "AMP Futures", domain: "ampfutures.com", category: "Futures & Commodities", color: "#0066b3", description: "Discount futures broker supporting dozens of trading platforms." },
  { name: "Optimus Futures", domain: "optimusfutures.com", category: "Futures & Commodities", color: "#f7941e", description: "Futures broker offering low day-trade margins and many platforms." },
  { name: "Tradovate", domain: "tradovate.com", category: "Futures & Commodities", color: "#00aeef", description: "Cloud-native futures broker with a modern REST/WebSocket API." },
  { name: "Ironbeam", domain: "ironbeam.com", category: "Futures & Commodities", color: "#c8102e", description: "Futures broker and FCM with a developer API for execution." },
  { name: "Cannon Trading", domain: "cannontrading.com", category: "Futures & Commodities", color: "#003366", description: "Veteran futures and commodities broker with multi-platform support." },
  { name: "Daniels Trading", domain: "danielstrading.com", category: "Futures & Commodities", color: "#00529b", description: "Independent futures brokerage with research and managed programs." },
  { name: "Phillip Futures", domain: "phillipcapital.in", category: "Futures & Commodities", color: "#e30613", description: "PhillipCapital's futures and commodities desk across Asian markets." },
  { name: "Edge Clear", domain: "edgeclear.com", category: "Futures & Commodities", color: "#1a73e8", description: "Futures brokerage focused on active and institutional day traders." },
  { name: "Stage 5 Trading", domain: "stage5trading.com", category: "Futures & Commodities", color: "#ff6600", description: "Boutique futures broker with personal service and many platforms." },
  { name: "Apex Trader Funding", domain: "apextraderfunding.com", category: "Futures & Commodities", color: "#6938ef", description: "Futures prop firm with evaluation accounts for funded traders." },
  { name: "Topstep", domain: "topstep.com", category: "Futures & Commodities", color: "#00b16a", description: "Futures funding evaluation program for aspiring professional traders." },
  { name: "Earn2Trade", domain: "earn2trade.com", category: "Futures & Commodities", color: "#2354ff", description: "Futures education and funded-trader evaluation platform." },
  { name: "Discount Trading", domain: "discounttrading.com", category: "Futures & Commodities", color: "#1e88e5", description: "Low-cost futures broker supporting a wide range of platforms." },
];
