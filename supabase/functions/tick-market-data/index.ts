const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY") ?? "";
const TIINGO_API_KEY = Deno.env.get("TIINGO_API_KEY") ?? "";
const TIINGO_FX_WS = "wss://api.tiingo.com/fx";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LevelRow = { price: number; bid: number; ask: number };
type Snapshot = {
  source: string;
  symbol: string;
  timestamp: number;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  levels: LevelRow[];
};

function isLikelyForexSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase().trim();
  if (s.endsWith("=X")) return true;
  if (/^[A-Z]{6}$/.test(s)) return true;
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(s)) return true;
  return false;
}

function inferAssetType(symbol: string): "crypto" | "forex" | "indian" | "us" {
  if (isLikelyForexSymbol(symbol)) return "forex";
  if (symbol.includes("-USD") || symbol.includes("-USDT")) return "crypto";
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) return "indian";
  return "us";
}

function getIncrementForPrice(price: number, asset: string): number {
  if (asset === "forex") return 0.0005;
  if (price >= 50000) return 20;
  if (price >= 5000) return 5;
  if (price >= 500) return 1;
  if (price >= 100) return 0.5;
  if (price >= 10) return 0.05;
  return 0.01;
}

function buildLevelsFromQuote(price: number, change: number, volume: number, asset: string): LevelRow[] {
  const inc = getIncrementForPrice(price, asset);
  const out: LevelRow[] = [];
  const directionalBias = change >= 0 ? 1 : -1;
  const base = Math.max(1000, volume || 50000);
  for (let i = -12; i <= 12; i++) {
    const p = Number((price + i * inc).toFixed(6));
    const dist = Math.abs(i);
    const weight = Math.exp(-dist / 4);
    // Keep bids mostly below mid-price and asks mostly above mid-price.
    const bid = i <= 0
      ? base * weight * (directionalBias > 0 ? 1.2 : 0.95)
      : base * weight * 0.08;
    const ask = i >= 0
      ? base * weight * (directionalBias > 0 ? 0.95 : 1.2)
      : base * weight * 0.08;
    out.push({ price: p, bid, ask });
  }
  return out.sort((a, b) => b.price - a.price);
}

function toFinnhubSymbol(symbol: string): string {
  if (symbol.endsWith("=X")) {
    const s = symbol.replace("=X", "");
    if (s.length === 6) return `OANDA:${s.slice(0, 3)}_${s.slice(3)}`;
    return `OANDA:${s.replace("/", "_")}`;
  }
  return symbol.replace(/\.(NS|BO)$/i, "");
}

function toTiingoFxTicker(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  if (s.endsWith("=X")) return s.replace("=X", "").replace(/[^A-Z]/g, "");
  const compact = s.replace(/[^A-Z]/g, "");
  return compact.length >= 6 ? compact.slice(0, 6) : "EURUSD";
}

function toMsTimestamp(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e15) return Math.floor(v / 1e6); // ns
    if (v > 1e12) return Math.floor(v / 1e3); // us
    if (v < 1e11) return Math.floor(v * 1000); // s
    return Math.floor(v); // ms
  }
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return toMsTimestamp(n);
    const d = Date.parse(v);
    if (!Number.isNaN(d)) return d;
  }
  return Date.now();
}

function parseTiingoFxTick(raw: string): { bid: number; ask: number; ts: number } | null {
  try {
    const msg = JSON.parse(raw);
    const packet = Array.isArray(msg) ? msg[0] : msg;
    const data = packet?.data ?? packet;
    const bid = Number(data?.bidPrice ?? data?.bid ?? data?.topBid ?? data?.priceBid ?? data?.bestBid);
    const ask = Number(data?.askPrice ?? data?.ask ?? data?.topAsk ?? data?.priceAsk ?? data?.bestAsk);
    const ts = toMsTimestamp(data?.timestamp ?? data?.quoteTimestamp ?? data?.lastSaleTimestamp ?? data?.t ?? data?.time);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
    return { bid, ask, ts };
  } catch {
    return null;
  }
}

async function fetchTiingoFxSnapshot(symbol: string): Promise<Snapshot> {
  if (!TIINGO_API_KEY) throw new Error("TIINGO_API_KEY missing");
  const ticker = toTiingoFxTicker(symbol);

  const tick = await new Promise<{ bid: number; ask: number; ts: number }>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timeout = setTimeout(() => {
      done(() => {
        try { ws.close(1000, "timeout"); } catch { /* ignore */ }
        reject(new Error("Tiingo FX timeout"));
      });
    }, 9000);

    const ws = new WebSocket(TIINGO_FX_WS);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        eventName: "subscribe",
        authorization: `Token ${TIINGO_API_KEY}`,
        eventData: { thresholdLevel: 5, tickers: [ticker] },
      }));
    };
    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "";
      const parsed = data ? parseTiingoFxTick(data) : null;
      if (!parsed) return;
      done(() => {
        clearTimeout(timeout);
        try { ws.close(1000, "ok"); } catch { /* ignore */ }
        resolve(parsed);
      });
    };
    ws.onerror = () => {
      done(() => {
        clearTimeout(timeout);
        try { ws.close(1011, "error"); } catch { /* ignore */ }
        reject(new Error("Tiingo FX websocket error"));
      });
    };
    ws.onclose = () => {
      if (settled) return;
      done(() => {
        clearTimeout(timeout);
        reject(new Error("Tiingo FX websocket closed"));
      });
    };
  });

  const mid = (tick.bid + tick.ask) / 2;
  const spread = Math.max(0.00001, Math.abs(tick.ask - tick.bid));
  const syntheticVol = Math.max(30000, Math.round(spread * 2_000_000_000));
  return {
    source: "Tiingo FX WS",
    symbol,
    timestamp: tick.ts,
    price: mid,
    open: mid,
    high: Math.max(mid, tick.ask),
    low: Math.min(mid, tick.bid),
    close: mid,
    volume: syntheticVol,
    levels: buildLevelsFromQuote(mid, 0, syntheticVol, "forex"),
  };
}

function buildSyntheticHistoryFromSnapshot(base: Snapshot, timeframe: string, count: number): Snapshot[] {
  const sec = timeframeToSeconds(timeframe);
  const stepMs = Math.max(60_000, sec * 1000);
  const out: Snapshot[] = [];
  const center = Number(base.price || base.close || 0);
  for (let i = count - 1; i >= 0; i--) {
    const ts = base.timestamp - i * stepMs;
    const drift = Math.sin((count - i) / 3) * (center * 0.0002);
    const close = Number((center + drift).toFixed(6));
    const open = Number((close - drift * 0.4).toFixed(6));
    const high = Math.max(open, close) + Math.abs(drift) * 0.3;
    const low = Math.min(open, close) - Math.abs(drift) * 0.3;
    out.push({
      source: base.source,
      symbol: base.symbol,
      timestamp: ts,
      price: close,
      open,
      high,
      low,
      close,
      volume: base.volume,
      levels: buildLevelsFromQuote(close, close - open, base.volume, "forex"),
    });
  }
  return out;
}

function defaultForexMid(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("EURUSD")) return 1.08;
  if (s.includes("GBPUSD")) return 1.27;
  if (s.includes("USDINR")) return 83.2;
  if (s.includes("USDJPY")) return 150.0;
  return 1.0;
}

function buildFallbackForexSnapshot(symbol: string): Snapshot {
  const mid = defaultForexMid(symbol);
  const volume = 120000;
  return {
    source: "Fallback FX",
    symbol,
    timestamp: Date.now(),
    price: mid,
    open: mid,
    high: mid,
    low: mid,
    close: mid,
    volume,
    levels: buildLevelsFromQuote(mid, 0, volume, "forex"),
  };
}

function defaultStockMid(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("AAPL")) return 190;
  if (s.includes("TSLA")) return 180;
  if (s.includes("NVDA")) return 900;
  if (s.includes("PCJEWELLER")) return 8.5;
  return 100;
}

function buildFallbackStockSnapshot(symbol: string): Snapshot {
  const mid = defaultStockMid(symbol);
  const volume = 220000;
  return {
    source: "Fallback Stock",
    symbol,
    timestamp: Date.now(),
    price: mid,
    open: mid,
    high: mid,
    low: mid,
    close: mid,
    volume,
    levels: buildLevelsFromQuote(mid, 0, volume, "us"),
  };
}

function mapTimeframeToBinance(tf: string): string {
  const x = tf.toLowerCase();
  if (x === "1m") return "1m";
  if (x === "5m") return "5m";
  if (x === "30m") return "30m";
  if (x === "1h") return "1h";
  if (x === "1d") return "1d";
  if (x === "1w") return "1w";
  return "1M";
}

function mapTimeframeToFinnhub(tf: string): string {
  const x = tf.toLowerCase();
  if (x === "1m") return "1";
  if (x === "5m") return "5";
  if (x === "30m") return "30";
  if (x === "1h") return "60";
  if (x === "1d") return "D";
  if (x === "1w") return "W";
  return "M";
}

function mapTimeframeToYahoo(tf: string): string {
  const x = tf.toLowerCase();
  if (x === "1m") return "1m";
  if (x === "5m") return "5m";
  if (x === "30m") return "30m";
  if (x === "1h") return "60m";
  if (x === "1d") return "1d";
  if (x === "1w") return "1wk";
  return "1mo";
}

function timeframeToSeconds(tf: string): number {
  const x = tf.toLowerCase();
  if (x === "1m") return 60;
  if (x === "5m") return 300;
  if (x === "30m") return 1800;
  if (x === "1h") return 3600;
  if (x === "1d") return 86400;
  if (x === "1w") return 604800;
  return 2592000;
}

async function fetchYahooIndian(symbol: string) {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 6 * 60 * 60;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1m`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(18000) });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const t = r?.timestamp as number[] | undefined;
  if (!q || !t?.length) throw new Error("No Yahoo data");

  const rows: Array<{ ts: number; open: number; high: number; low: number; close: number; vol: number }> = [];
  for (let i = 0; i < t.length; i++) {
    if (q.close?.[i] == null || q.open?.[i] == null) continue;
    rows.push({
      ts: Number(t[i]) * 1000,
      open: Number(q.open[i]),
      high: Number(q.high?.[i] ?? q.close[i]),
      low: Number(q.low?.[i] ?? q.close[i]),
      close: Number(q.close[i]),
      vol: Number(q.volume?.[i] ?? 0),
    });
  }
  if (!rows.length) throw new Error("Empty Yahoo rows");
  const last = rows[rows.length - 1];
  const first = rows[0];
  const inc = getIncrementForPrice(last.close, "indian");
  const levelsMap = new Map<number, LevelRow>();
  for (let i = Math.max(0, rows.length - 30); i < rows.length; i++) {
    const row = rows[i];
    const bucket = Math.round(row.close / inc) * inc;
    const old = levelsMap.get(bucket) ?? { price: bucket, bid: 0, ask: 0 };
    const isBuy = row.close >= row.open;
    levelsMap.set(bucket, {
      price: bucket,
      bid: old.bid + (isBuy ? row.vol * 0.35 : row.vol * 0.65),
      ask: old.ask + (isBuy ? row.vol * 0.65 : row.vol * 0.35),
    });
  }
  const levels = Array.from(levelsMap.values()).sort((a, b) => b.price - a.price);
  return {
    source: "Yahoo Finance",
    symbol,
    timestamp: last.ts,
    price: last.close,
    open: first.open,
    high: Math.max(...rows.map((x) => x.high)),
    low: Math.min(...rows.map((x) => x.low)),
    close: last.close,
    volume: rows.reduce((s, x) => s + x.vol, 0),
    levels: levels.length ? levels : buildLevelsFromQuote(last.close, last.close - first.open, rows.reduce((s, x) => s + x.vol, 0), "indian"),
  };
}

async function fetchYahooIndianHistory(symbol: string, timeframe: string, count: number): Promise<Snapshot[]> {
  const interval = mapTimeframeToYahoo(timeframe);
  const sec = timeframeToSeconds(timeframe);
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - sec * Math.max(40, count + 10);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(18000) });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const t = r?.timestamp as number[] | undefined;
  if (!q || !t?.length) return [];
  const rows: Array<{ ts: number; open: number; high: number; low: number; close: number; vol: number }> = [];
  for (let i = 0; i < t.length; i++) {
    if (q.close?.[i] == null || q.open?.[i] == null) continue;
    rows.push({
      ts: Number(t[i]) * 1000,
      open: Number(q.open[i]),
      high: Number(q.high?.[i] ?? q.close[i]),
      low: Number(q.low?.[i] ?? q.close[i]),
      close: Number(q.close[i]),
      vol: Number(q.volume?.[i] ?? 0),
    });
  }
  const sliced = rows.slice(-count);
  return sliced.map((row, idx) => {
    const prevClose = idx > 0 ? sliced[idx - 1].close : row.open;
    return {
      source: "Yahoo Finance",
      symbol,
      timestamp: row.ts,
      price: row.close,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.vol,
      levels: buildLevelsFromQuote(row.close, row.close - prevClose, row.vol, "indian"),
    };
  });
}

async function fetchYahooMarketHistory(
  symbol: string,
  asset: "us" | "forex",
  timeframe: string,
  count: number,
): Promise<Snapshot[]> {
  const interval = mapTimeframeToYahoo(timeframe);
  const sec = timeframeToSeconds(timeframe);
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - sec * Math.max(40, count + 10);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(18000) });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const t = r?.timestamp as number[] | undefined;
  if (!q || !t?.length) return [];
  const rows: Array<{ ts: number; open: number; high: number; low: number; close: number; vol: number }> = [];
  for (let i = 0; i < t.length; i++) {
    if (q.close?.[i] == null || q.open?.[i] == null) continue;
    rows.push({
      ts: Number(t[i]) * 1000,
      open: Number(q.open[i]),
      high: Number(q.high?.[i] ?? q.close[i]),
      low: Number(q.low?.[i] ?? q.close[i]),
      close: Number(q.close[i]),
      vol: Number(q.volume?.[i] ?? 0),
    });
  }
  const sliced = rows.slice(-count);
  return sliced.map((row, idx) => {
    const prevClose = idx > 0 ? sliced[idx - 1].close : row.open;
    return {
      source: "Yahoo Finance REST",
      symbol,
      timestamp: row.ts,
      price: row.close,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.vol,
      levels: buildLevelsFromQuote(row.close, row.close - prevClose, row.vol, asset),
    };
  });
}

async function fetchYahooMarketSnapshot(symbol: string, asset: "us" | "forex"): Promise<Snapshot> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 3 * 60 * 60;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1m`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(18000) });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const t = r?.timestamp as number[] | undefined;
  if (!q || !t?.length) throw new Error("No Yahoo data");
  const rows: Array<{ ts: number; open: number; high: number; low: number; close: number; vol: number }> = [];
  for (let i = 0; i < t.length; i++) {
    if (q.close?.[i] == null || q.open?.[i] == null) continue;
    rows.push({
      ts: Number(t[i]) * 1000,
      open: Number(q.open[i]),
      high: Number(q.high?.[i] ?? q.close[i]),
      low: Number(q.low?.[i] ?? q.close[i]),
      close: Number(q.close[i]),
      vol: Number(q.volume?.[i] ?? 0),
    });
  }
  if (!rows.length) throw new Error("Empty Yahoo rows");
  const first = rows[0];
  const last = rows[rows.length - 1];
  const vol = rows.reduce((s, x) => s + x.vol, 0);
  return {
    source: "Yahoo Finance REST",
    symbol,
    timestamp: last.ts,
    price: last.close,
    open: first.open,
    high: Math.max(...rows.map((x) => x.high)),
    low: Math.min(...rows.map((x) => x.low)),
    close: last.close,
    volume: vol,
    levels: buildLevelsFromQuote(last.close, last.close - first.open, vol, asset),
  };
}

async function fetchFinnhub(symbol: string, asset: "us" | "forex") {
  if (!FINNHUB_API_KEY) throw new Error("FINNHUB_API_KEY missing");
  const fs = toFinnhubSymbol(symbol);
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fs)}&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const q = await res.json();
  const price = Number(q?.c ?? 0);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid finnhub quote");
  const open = Number(q?.o ?? price);
  const high = Number(q?.h ?? price);
  const low = Number(q?.l ?? price);
  const prev = Number(q?.pc ?? price);
  const ts = Number(q?.t ?? Math.floor(Date.now() / 1000)) * 1000;
  const change = price - prev;
  const syntheticVol = Math.max(20000, Math.abs(high - low) * 100000);
  return {
    source: "Finnhub",
    symbol,
    timestamp: ts,
    price,
    open,
    high,
    low,
    close: price,
    volume: syntheticVol,
    levels: buildLevelsFromQuote(price, change, syntheticVol, asset),
  };
}

async function fetchFinnhubHistory(symbol: string, asset: "us" | "forex", timeframe: string, count: number): Promise<Snapshot[]> {
  if (!FINNHUB_API_KEY) throw new Error("FINNHUB_API_KEY missing");
  const fs = toFinnhubSymbol(symbol);
  const reso = mapTimeframeToFinnhub(timeframe);
  const sec = timeframeToSeconds(timeframe);
  const to = Math.floor(Date.now() / 1000);
  const from = to - sec * Math.max(40, count + 10);
  const endpoint = asset === "forex" ? "forex/candle" : "stock/candle";
  const url = `https://finnhub.io/api/v1/${endpoint}?symbol=${encodeURIComponent(fs)}&resolution=${encodeURIComponent(reso)}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Finnhub HTTP ${r.status}`);
  const d = await r.json();
  if (d?.s !== "ok" || !Array.isArray(d?.t)) return [];
  const len = d.t.length;
  const start = Math.max(0, len - count);
  const out: Snapshot[] = [];
  for (let i = start; i < len; i++) {
    const ts = Number(d.t[i]) * 1000;
    const open = Number(d.o?.[i] ?? d.c?.[i] ?? 0);
    const high = Number(d.h?.[i] ?? d.c?.[i] ?? 0);
    const low = Number(d.l?.[i] ?? d.c?.[i] ?? 0);
    const close = Number(d.c?.[i] ?? 0);
    const vol = Number(d.v?.[i] ?? 0);
    const prevClose = i > 0 ? Number(d.c?.[i - 1] ?? open) : open;
    out.push({
      source: "Finnhub",
      symbol,
      timestamp: ts,
      price: close,
      open,
      high,
      low,
      close,
      volume: vol,
      levels: buildLevelsFromQuote(close, close - prevClose, vol, asset),
    });
  }
  return out;
}

async function fetchBinanceHistory(symbol: string, timeframe: string, count: number): Promise<Snapshot[]> {
  const pair = symbol.endsWith("-USD")
    ? `${symbol.replace("-USD", "")}USDT`
    : symbol.endsWith("-USDT")
    ? symbol.replace("-", "")
    : "BTCUSDT";
  const interval = mapTimeframeToBinance(timeframe);
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${Math.min(100, Math.max(20, count + 2))}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
  const rows = await r.json() as any[];
  const sliced = rows.slice(-count);
  return sliced.map((k, i) => {
    const open = Number(k[1]);
    const high = Number(k[2]);
    const low = Number(k[3]);
    const close = Number(k[4]);
    const volume = Number(k[5]) * close;
    const prevClose = i > 0 ? Number(sliced[i - 1][4]) : open;
    return {
      source: "Binance REST",
      symbol,
      timestamp: Number(k[6]),
      price: close,
      open,
      high,
      low,
      close,
      volume,
      levels: buildLevelsFromQuote(close, close - prevClose, volume, "crypto"),
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { "Content-Type": "application/json", ...corsHeaders };
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const timeframe = String(body.timeframe ?? "5m");
    const mode = String(body.mode ?? "snapshot");
    const count = Math.min(60, Math.max(10, Number(body.count) || 18));
    if (!symbol) return new Response(JSON.stringify({ error: "symbol required" }), { status: 400, headers });

    const asset = inferAssetType(symbol);
    if (mode === "history") {
      if (asset === "indian") {
        const list = await fetchYahooIndianHistory(symbol, timeframe, count);
        return new Response(JSON.stringify({ source: "Yahoo Finance", symbol, snapshots: list }), { status: 200, headers });
      }
      if (asset === "us") {
        try {
          const list = await fetchYahooMarketHistory(symbol, "us", timeframe, count);
          return new Response(JSON.stringify({ source: "Yahoo Finance REST", symbol, snapshots: list }), { status: 200, headers });
        } catch {
          try {
            const list = await fetchFinnhubHistory(symbol, asset, timeframe, count);
            return new Response(JSON.stringify({ source: "Finnhub", symbol, snapshots: list }), { status: 200, headers });
          } catch {
            try {
              const snap = await fetchYahooMarketSnapshot(symbol, "us");
              const list = buildSyntheticHistoryFromSnapshot(snap, timeframe, count);
              return new Response(JSON.stringify({ source: snap.source, symbol, snapshots: list }), { status: 200, headers });
            } catch {
              const fallback = buildFallbackStockSnapshot(symbol);
              const list = buildSyntheticHistoryFromSnapshot(fallback, timeframe, count);
              return new Response(JSON.stringify({ source: fallback.source, symbol, snapshots: list }), { status: 200, headers });
            }
          }
        }
      }
      if (asset === "forex") {
        try {
          const snap = await fetchTiingoFxSnapshot(symbol);
          const list = buildSyntheticHistoryFromSnapshot(snap, timeframe, count);
          return new Response(JSON.stringify({ source: snap.source, symbol, snapshots: list }), { status: 200, headers });
        } catch {
          const fallback = buildFallbackForexSnapshot(symbol);
          const list = buildSyntheticHistoryFromSnapshot(fallback, timeframe, count);
          return new Response(JSON.stringify({ source: fallback.source, symbol, snapshots: list }), { status: 200, headers });
        }
      }
      const list = await fetchBinanceHistory(symbol, timeframe, count);
      return new Response(JSON.stringify({ source: "Binance REST", symbol, snapshots: list }), { status: 200, headers });
    }

    if (asset === "indian") {
      const y = await fetchYahooIndian(symbol);
      return new Response(JSON.stringify(y), { status: 200, headers });
    }

    if (asset === "forex") {
      try {
        const fx = await fetchTiingoFxSnapshot(symbol);
        return new Response(JSON.stringify(fx), { status: 200, headers });
      } catch {
        const fallback = buildFallbackForexSnapshot(symbol);
        return new Response(JSON.stringify(fallback), { status: 200, headers });
      }
    }

    if (asset === "us") {
      try {
        const y = await fetchYahooMarketSnapshot(symbol, "us");
        return new Response(JSON.stringify(y), { status: 200, headers });
      } catch {
        try {
          const f = await fetchFinnhub(symbol, asset);
          return new Response(JSON.stringify(f), { status: 200, headers });
        } catch {
          const fallback = buildFallbackStockSnapshot(symbol);
          return new Response(JSON.stringify(fallback), { status: 200, headers });
        }
      }
    }

    // Crypto here is primarily handled by Binance WS in frontend.
    // Provide fallback snapshot through Binance REST.
    const pair = symbol.endsWith("-USD") ? `${symbol.replace("-USD", "")}USDT` : symbol.replace("-USDT", "USDT");
    const tRes = await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${pair}`, { signal: AbortSignal.timeout(10000) });
    if (!tRes.ok) throw new Error(`Binance HTTP ${tRes.status}`);
    const t = await tRes.json();
    const bid = Number(t?.bidPrice ?? 0);
    const ask = Number(t?.askPrice ?? 0);
    const price = bid && ask ? (bid + ask) / 2 : bid || ask;
    if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid Binance ticker");
    const levels = buildLevelsFromQuote(price, 0, 50000, "crypto");
    return new Response(JSON.stringify({
      source: "Binance REST",
      symbol,
      timestamp: Date.now(),
      price,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 50000,
      levels,
    }), { status: 200, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});

