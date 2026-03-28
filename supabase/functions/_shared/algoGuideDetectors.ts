/**
 * NSE algo-guide style presets (ORB, Supertrend 7/3, VWAP bounce, RSI divergence).
 * Uses real OHLCV (+ volume when provided). IST wall-clock rules for ORB.
 */

export type AlgoGuidePresetId = "orb" | "supertrend_7_3" | "vwap_bounce" | "rsi_divergence";

export function extractAlgoGuidePreset(entryConditions: unknown): AlgoGuidePresetId | null {
  if (!entryConditions || typeof entryConditions !== "object") return null;
  const p = (entryConditions as { algoGuidePreset?: string }).algoGuidePreset;
  if (p === "orb" || p === "supertrend_7_3" || p === "vwap_bounce" || p === "rsi_divergence") {
    return p;
  }
  return null;
}

function barWallClockMinutes(tsSec: number, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(tsSec * 1000));
    const hh = Number(parts.find((x) => x.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((x) => x.type === "minute")?.value ?? NaN);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  } catch {
    return null;
  }
}

function barDateKey(tsSec: number, tz: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(tsSec * 1000));
    const y = parts.find((x) => x.type === "year")?.value;
    const mo = parts.find((x) => x.type === "month")?.value;
    const d = parts.find((x) => x.type === "day")?.value;
    if (!y || !mo || !d) return null;
    return `${y}-${mo}-${d}`;
  } catch {
    return null;
  }
}

function atrSeries(h: number[], l: number[], c: number[], period: number): number[] {
  const n = c.length;
  const out = new Array(n).fill(NaN);
  const tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tr[i] = h[i] - l[i];
    } else {
      tr[i] = Math.max(
        h[i] - l[i],
        Math.abs(h[i] - c[i - 1]),
        Math.abs(l[i] - c[i - 1]),
      );
    }
  }
  for (let i = period - 1; i < n; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += tr[i - j];
    out[i] = s / period;
  }
  return out;
}

/** Supertrend line + trend: 1 = bullish (green below), -1 = bearish */
export function supertrendSeries(
  h: number[],
  l: number[],
  c: number[],
  period = 7,
  mult = 3,
): { line: number[]; trend: number[] } {
  const n = c.length;
  const line = new Array(n).fill(NaN);
  const trend = new Array(n).fill(0);
  const atr = atrSeries(h, l, c, period);
  const hl2 = h.map((hi, i) => (hi + l[i]) / 2);
  const upper = hl2.map((x, i) => x + mult * (atr[i] || 0));
  const lower = hl2.map((x, i) => x - mult * (atr[i] || 0));

  line[0] = lower[0];
  trend[0] = 1;
  for (let i = 1; i < n; i++) {
    if (!Number.isFinite(atr[i])) {
      line[i] = line[i - 1];
      trend[i] = trend[i - 1];
      continue;
    }
    let up = upper[i];
    let lo = lower[i];
    if (c[i - 1] > line[i - 1]) {
      lo = Math.max(lower[i], line[i - 1]);
    } else {
      up = Math.min(upper[i], line[i - 1]);
    }
    if (c[i] > up) {
      line[i] = lo;
      trend[i] = 1;
    } else if (c[i] < lo) {
      line[i] = up;
      trend[i] = -1;
    } else {
      line[i] = line[i - 1];
      trend[i] = trend[i - 1];
    }
  }
  return { line, trend };
}

export type PresetHit = {
  i: number;
  side: "BUY" | "SELL";
  /** Intraday: bars after signal bar to use as entry index (guide ORB = next candle). Default 0. */
  entryBarOffset?: number;
  meta?: {
    orbH?: number;
    orbL?: number;
    breakoutBar?: number;
    supertrendSl?: number;
  };
};

/** Toby Crabel ORB: range 9:15–9:30 IST, breakout on 5m close after 9:30 */
export function detectOrbHits(
  t: number[],
  c: number[],
  h: number[],
  l: number[],
  tz: string,
): PresetHit[] {
  const n = c.length;
  const hits: PresetHit[] = [];
  const OPEN_START = 9 * 60 + 15;
  const OPEN_END = 9 * 60 + 30;
  const AFTER_OPEN = 9 * 60 + 30;

  const byDay = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const dk = barDateKey(t[i], tz);
    if (!dk) continue;
    if (!byDay.has(dk)) byDay.set(dk, []);
    byDay.get(dk)!.push(i);
  }

  for (const [, idxs] of byDay) {
    idxs.sort((a, b) => t[a] - t[b]);
    let orbH = -Infinity;
    let orbL = Infinity;
    let orbOk = false;
    for (const i of idxs) {
      const m = barWallClockMinutes(t[i], tz);
      if (m == null) continue;
      if (m >= OPEN_START && m < OPEN_END) {
        orbH = Math.max(orbH, h[i]);
        orbL = Math.min(orbL, l[i]);
        orbOk = true;
      }
    }
    if (!orbOk || !Number.isFinite(orbH) || !Number.isFinite(orbL)) continue;
    const mid = (orbH + orbL) / 2;
    const rng = orbH - orbL;
    if (mid <= 0 || rng / mid > 0.01 || rng / mid < 0.002) continue;

    const after = idxs.filter((i) => {
      const m = barWallClockMinutes(t[i], tz);
      return m != null && m >= AFTER_OPEN;
    });
    for (let k = 0; k < after.length; k++) {
      const i = after[k];
      const prevIdx = k > 0 ? after[k - 1] : null;
      const prevClose = prevIdx != null ? c[prevIdx] : null;
      const nextIdx = k + 1 < after.length ? after[k + 1] : null;

      if (c[i] > orbH && (prevClose == null || prevClose <= orbH)) {
        if (nextIdx != null) {
          const nc = c[nextIdx];
          if (nc >= orbL && nc <= orbH) continue;
        }
        hits.push({
          i,
          side: "BUY",
          entryBarOffset: 1,
          meta: { orbH, orbL, breakoutBar: i },
        });
        break;
      }
      if (c[i] < orbL && (prevClose == null || prevClose >= orbL)) {
        if (nextIdx != null) {
          const nc = c[nextIdx];
          if (nc >= orbL && nc <= orbH) continue;
        }
        hits.push({
          i,
          side: "SELL",
          entryBarOffset: 1,
          meta: { orbH, orbL, breakoutBar: i },
        });
        break;
      }
    }
  }
  return hits;
}

export function detectSupertrendFlipHits(
  h: number[],
  l: number[],
  c: number[],
  t: number[],
  tz: string,
): PresetHit[] {
  const { trend, line } = supertrendSeries(h, l, c, 7, 3);
  const atr = atrSeries(h, l, c, 7);
  const n = c.length;
  const hits: PresetHit[] = [];
  const SESSION_END = 12 * 60 + 30;
  const SESSION_START = 9 * 60 + 30;
  for (let i = 1; i < n; i++) {
    const m = barWallClockMinutes(t[i], tz);
    if (m == null || m < SESSION_START || m > SESSION_END) continue;
    const ar = atr[i];
    if (Number.isFinite(ar) && c[i] > 0 && ar / c[i] < 0.001) continue;
    if (trend[i] === 1 && trend[i - 1] === -1) {
      hits.push({ i, side: "BUY", meta: { supertrendSl: line[i] } });
    }
    if (trend[i] === -1 && trend[i - 1] === 1) {
      hits.push({ i, side: "SELL", meta: { supertrendSl: line[i] } });
    }
  }
  return hits;
}

/**
 * Guide: 15m Supertrend direction + 5m flip (PDF). Aligns each fast bar to latest slow bar with tSlow <= tFast.
 */
export function detectSupertrendDualTfHits(
  tFast: number[],
  hFast: number[],
  lFast: number[],
  cFast: number[],
  tSlow: number[],
  hSlow: number[],
  lSlow: number[],
  cSlow: number[],
  tz: string,
): PresetHit[] {
  if (tSlow.length < 15 || tFast.length < 15) {
    return detectSupertrendFlipHits(hFast, lFast, cFast, tFast, tz);
  }
  const { trend: trendSlow } = supertrendSeries(hSlow, lSlow, cSlow, 7, 3);
  const { trend: trendFast, line: lineFast } = supertrendSeries(hFast, lFast, cFast, 7, 3);
  const atrFast = atrSeries(hFast, lFast, cFast, 7);
  const nF = cFast.length;
  const nS = tSlow.length;
  const slowTrendAtFast: number[] = new Array(nF).fill(0);
  let j = 0;
  for (let i = 0; i < nF; i++) {
    while (j + 1 < nS && tSlow[j + 1] <= tFast[i]) j++;
    slowTrendAtFast[i] = trendSlow[j] ?? 0;
  }
  const hits: PresetHit[] = [];
  const SESSION_END = 12 * 60 + 30;
  const SESSION_START = 9 * 60 + 30;
  for (let i = 1; i < nF; i++) {
    const m = barWallClockMinutes(tFast[i], tz);
    if (m == null || m < SESSION_START || m > SESSION_END) continue;
    const st = slowTrendAtFast[i];
    const ar = atrFast[i];
    if (Number.isFinite(ar) && cFast[i] > 0 && ar / cFast[i] < 0.001) continue;
    if (trendFast[i] === 1 && trendFast[i - 1] === -1 && st === 1) {
      hits.push({ i, side: "BUY", meta: { supertrendSl: lineFast[i] } });
    }
    if (trendFast[i] === -1 && trendFast[i - 1] === 1 && st === -1) {
      hits.push({ i, side: "SELL", meta: { supertrendSl: lineFast[i] } });
    }
  }
  return hits;
}

function rsiArr(close: number[], period = 14): number[] {
  const n = close.length;
  const out = new Array(n).fill(NaN);
  if (n < period + 1) return out;
  const gains = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const d = close[i] - close[i - 1];
    gains[i] = Math.max(d, 0);
    losses[i] = Math.max(-d, 0);
  }
  let avgG = 0;
  let avgL = 0;
  for (let i = 1; i <= period; i++) {
    avgG += gains[i];
    avgL += losses[i];
  }
  avgG /= period;
  avgL /= period;
  const rs0 = avgL === 0 ? 100 : avgG / avgL;
  out[period] = 100 - 100 / (1 + rs0);
  for (let i = period + 1; i < n; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period;
    avgL = (avgL * (period - 1) + losses[i]) / period;
    const rs = avgL === 0 ? 100 : avgG / avgL;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function macdHist(close: number[]): number[] {
  const n = close.length;
  const ema = (arr: number[], p: number) => {
    const o = new Array(n).fill(NaN);
    const k = 2 / (p + 1);
    let prev = arr[0];
    o[0] = prev;
    for (let i = 1; i < n; i++) {
      prev = arr[i] * k + prev * (1 - k);
      o[i] = prev;
    }
    return o;
  };
  const fast = ema(close, 12);
  const slow = ema(close, 26);
  const ml = fast.map((x, i) => x - slow[i]);
  const sig = ema(ml.map((x) => (Number.isFinite(x) ? x : 0)), 9);
  return ml.map((x, i) => x - sig[i]);
}

function findPivots(series: number[], window: number): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const n = series.length;
  for (let i = window; i < n - window; i++) {
    const v = series[i];
    let isH = true;
    let isL = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (series[j] > v) isH = false;
      if (series[j] < v) isL = false;
    }
    if (isH) highs.push(i);
    if (isL) lows.push(i);
  }
  return { highs, lows };
}

/** RSI divergence + MACD hist + guide confirmation bar (close beyond prior high/low). */
export function detectRsiDivergenceHits(
  c: number[],
  h: number[],
  l: number[],
  lookback = 50,
  window = 5,
): PresetHit[] {
  const n = c.length;
  const rsi = rsiArr(c, 14);
  const macdH = macdHist(c);
  const hits: PresetHit[] = [];
  const { highs: ph, lows: pl } = findPivots(c, window);
  const { highs: rh, lows: rl } = findPivots(rsi, window);
  const confirmMax = 4;

  for (let k = 1; k < pl.length; k++) {
    const i1 = pl[k - 1];
    const i2 = pl[k];
    if (i2 - i1 < 5 || i2 - i1 > lookback) continue;
    const r1 = rl.filter((x) => Math.abs(x - i1) <= window);
    const r2 = rl.filter((x) => Math.abs(x - i2) <= window);
    if (!r1.length || !r2.length) continue;
    if (
      c[i2] < c[i1] &&
      rsi[r2[0]] > rsi[r1[0]] &&
      Number.isFinite(macdH[i2]) &&
      Number.isFinite(macdH[i2 - 1]) &&
      macdH[i2] > macdH[i2 - 1]
    ) {
      let entryI = -1;
      for (let j = i2 + 1; j <= Math.min(i2 + confirmMax, n - 1); j++) {
        if (c[j] > h[j - 1]) {
          entryI = j;
          break;
        }
      }
      if (entryI >= 0) hits.push({ i: entryI, side: "BUY" });
    }
  }
  for (let k = 1; k < ph.length; k++) {
    const i1 = ph[k - 1];
    const i2 = ph[k];
    if (i2 - i1 < 5 || i2 - i1 > lookback) continue;
    const r1 = rh.filter((x) => Math.abs(x - i1) <= window);
    const r2 = rh.filter((x) => Math.abs(x - i2) <= window);
    if (!r1.length || !r2.length) continue;
    if (
      c[i2] > c[i1] &&
      rsi[r2[0]] < rsi[r1[0]] &&
      Number.isFinite(macdH[i2]) &&
      Number.isFinite(macdH[i2 - 1]) &&
      macdH[i2] < macdH[i2 - 1]
    ) {
      let entryI = -1;
      for (let j = i2 + 1; j <= Math.min(i2 + confirmMax, n - 1); j++) {
        if (c[j] < l[j - 1]) {
          entryI = j;
          break;
        }
      }
      if (entryI >= 0) hits.push({ i: entryI, side: "SELL" });
    }
  }
  return hits;
}

/** VWAP + 1st/2nd touch heuristic; needs volume */
export function detectVwapBounceHits(
  t: number[],
  h: number[],
  l: number[],
  c: number[],
  v: number[],
  tz: string,
  o?: number[],
): PresetHit[] {
  if (!v.length || v.length !== c.length) return [];
  const n = c.length;
  const hits: PresetHit[] = [];
  /** No new VWAP entries from 14:45 IST (last ~30 min before 15:15 cash close). */
  const VWAP_LAST_ENTRY_MIN = 14 * 60 + 45;

  const byDay = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const dk = barDateKey(t[i], tz);
    if (!dk) continue;
    if (!byDay.has(dk)) byDay.set(dk, []);
    byDay.get(dk)!.push(i);
  }

  for (const [, idxs] of byDay) {
    idxs.sort((a, b) => t[a] - t[b]);
    let cumPv = 0;
    let cumV = 0;
    let cumPv2 = 0;
    const vwap: number[] = new Array(n).fill(NaN);
    const sd: number[] = new Array(n).fill(NaN);
    const touchCount: number[] = new Array(n).fill(0);

    for (const i of idxs) {
      const tp = (h[i] + l[i] + c[i]) / 3;
      const vol = Math.max(0, v[i] || 0);
      cumPv += tp * vol;
      cumV += vol;
      cumPv2 += tp * tp * vol;
      const vw = cumV > 0 ? cumPv / cumV : NaN;
      vwap[i] = vw;
      sd[i] = cumV > 0 ? Math.sqrt(Math.max(0, cumPv2 / cumV - vw * vw)) : NaN;

      let touches = 0;
      for (const j of idxs) {
        if (j >= i) break;
        const vwJ = vwap[j];
        if (!Number.isFinite(vwJ)) continue;
        if (l[j] <= vwJ * 1.002 && h[j] >= vwJ * 0.998) touches++;
      }
      touchCount[i] = touches;
    }

    const volSma10 = (endIdx: number): number => {
      const j0 = idxs.indexOf(endIdx);
      if (j0 < 0) return NaN;
      let s = 0;
      let cnt = 0;
      for (let k = Math.max(0, j0 - 9); k <= j0; k++) {
        s += v[idxs[k]] || 0;
        cnt++;
      }
      return cnt ? s / cnt : NaN;
    };

    for (let k = 2; k < idxs.length; k++) {
      const i = idxs[k];
      const prev = idxs[k - 1];
      const m = barWallClockMinutes(t[i], tz);
      if (m == null || m >= VWAP_LAST_ENTRY_MIN) continue;
      const vw = vwap[i];
      if (!Number.isFinite(vw)) continue;
      if (touchCount[i] > 2) continue;
      const va = volSma10(prev);
      if (!Number.isFinite(va) || v[i] <= va) continue;

      const rangePrev = h[prev] - l[prev];
      const openPrev = o && o.length === c.length && Number.isFinite(o[prev]) ? o[prev] : c[prev];
      const lowerWickPrev = Math.min(openPrev, c[prev]) - l[prev];
      const upperWickPrev = h[prev] - Math.max(openPrev, c[prev]);
      const rejectionLong = rangePrev > 1e-9 && lowerWickPrev >= 0.3 * rangePrev;
      const rejectionShort = rangePrev > 1e-9 && upperWickPrev >= 0.3 * rangePrev;

      const longOk =
        c[prev] >= vw * 0.999 &&
        l[prev] <= vw * 1.001 &&
        c[i] > vw &&
        c[i] > c[prev] &&
        rejectionLong;
      const shortOk =
        c[prev] <= vw * 1.001 &&
        h[prev] >= vw * 0.999 &&
        c[i] < vw &&
        c[i] < c[prev] &&
        rejectionShort;
      if (longOk) hits.push({ i, side: "BUY", entryBarOffset: 1 });
      else if (shortOk) hits.push({ i, side: "SELL", entryBarOffset: 1 });
    }
  }
  return hits;
}
