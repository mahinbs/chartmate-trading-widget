/**
 * OpenAlgo broker candles / LTP for live equity path (no Yahoo on conditional-order evaluation).
 */
export const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

export type OpenAlgoCandlePack = {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
};

function parseHistoryRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

/**
 * `symbol`: broker symbol (e.g. RELIANCE) — no Yahoo suffix.
 * `exchange`: NSE, BSE, etc.
 * `interval`: 1m, 5m, 15m, 60m, 1h, 1D, ...
 */
export async function fetchOpenAlgoHistoryCandles(
  apiKey: string,
  symbol: string,
  exchange: string,
  interval: string,
  startDateIso: string,
  endDateIso: string,
  openAlgoBaseUrl: string = OPENALGO_URL,
): Promise<OpenAlgoCandlePack | null> {
  const base = (openAlgoBaseUrl || "").replace(/\/$/, "");
  if (!base || !apiKey || !symbol) return null;
  const url = `${base}/api/v1/history`;
  const body = {
    apikey: apiKey,
    symbol: symbol.replace(/\.(NS|BO|ns|bo)$/i, "").trim(),
    exchange: exchange.toUpperCase(),
    interval,
    start_date: startDateIso,
    end_date: endDateIso,
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data === "object" && (data as { status?: string }).status === "error") return null;
    const rows = parseHistoryRows(data);
    const t: number[] = [];
    const o: number[] = [];
    const h: number[] = [];
    const l: number[] = [];
    const c: number[] = [];
    const v: number[] = [];
    for (const r of rows) {
      const ts = r.timestamp ?? r.time ?? r.date;
      let tsec = 0;
      if (typeof ts === "number" && Number.isFinite(ts)) {
        tsec = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
      } else if (typeof ts === "string" && ts.length > 0) {
        const ms = new Date(ts).getTime();
        tsec = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
      }
      const cl = Number(r.close ?? r.c ?? 0);
      if (!tsec || !Number.isFinite(cl) || cl <= 0) continue;
      t.push(tsec);
      o.push(Number(r.open ?? r.o ?? cl));
      h.push(Number(r.high ?? r.h ?? cl));
      l.push(Number(r.low ?? r.l ?? cl));
      c.push(cl);
      v.push(Math.max(0, Number(r.volume ?? r.v ?? 0)));
    }
    if (c.length < 5) return null;
    return { t, o, h, l, c, v };
  } catch {
    return null;
  }
}

export async function fetchIndiaVixLtp(
  apiKey: string,
  openAlgoBaseUrl: string = OPENALGO_URL,
): Promise<number | null> {
  const base = (openAlgoBaseUrl || "").replace(/\/$/, "");
  if (!base || !apiKey) return null;
  try {
    const r = await fetch(`${base}/api/v1/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey, symbol: "INDIA VIX", exchange: "NSE" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const ltp = d?.data?.ltp ?? d?.data?.Ltp ?? d?.ltp;
    const n = Number(ltp);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** ISO date YYYY-MM-DD in a timezone */
export function calendarDateInTimeZone(tz: string, d = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
