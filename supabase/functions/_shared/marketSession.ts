/**
 * Market-aware session windows for algo-guide presets (ORB, Supertrend, VWAP).
 * Indian cash → Asia/Kolkata; US equities → America/New_York (DST via IANA);
 * Crypto / Forex → UTC with 24h-friendly rules for paper + live scans.
 */

export type MarketSessionKind = "india_equity" | "us_equity" | "crypto" | "forex";

export type MarketSessionProfile = {
  kind: MarketSessionKind;
  /** IANA timezone for wall-clock rules on chart bars */
  timeZone: string;
  /** ORB formation window [start, end) in minutes from local midnight */
  orbOpenStartMin: number;
  orbOpenEndMin: number;
  /** First bar minute eligible for ORB breakout (usually = orbOpenEndMin) */
  orbBreakoutAfterMin: number;
  supertrendSessionStartMin: number;
  supertrendSessionEndMin: number;
  /** If true, Supertrend flips allowed any time of day */
  supertrend24h: boolean;
  /** VWAP: block new setups at or after this minute; null = no cutoff */
  vwapLastEntryBeforeMin: number | null;
  /** Local cash close (reference / UI); null if continuous */
  marketCloseMin: number | null;
};

/** Wall-clock minutes from midnight in `tz` for a Unix seconds timestamp */
export function wallClockMinutesInZone(tsSec: number, tz: string): number | null {
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

export function wallClockMinutesNowInZone(tz: string): number | null {
  return wallClockMinutesInZone(Math.floor(Date.now() / 1000), tz);
}

/**
 * Classify symbol for session math (matches strategy-entry-signals asset routing).
 * US stocks with hyphens (e.g. BRK-B) stay `us_equity`; crypto is *-USD / *-USDT on Yahoo.
 */
export function classifyMarketSessionKind(yahooSymbol: string): MarketSessionKind {
  const s = String(yahooSymbol ?? "").trim().toUpperCase();
  if (!s) return "us_equity";
  if (s.endsWith(".NS") || s.endsWith(".BO")) return "india_equity";
  if (s.includes("=X")) return "forex";
  if (/-(USD|USDT)$/i.test(s)) return "crypto";
  return "us_equity";
}

export function resolveMarketSessionProfile(yahooSymbol: string): MarketSessionProfile {
  const kind = classifyMarketSessionKind(yahooSymbol);
  switch (kind) {
    case "india_equity":
      return {
        kind,
        timeZone: "Asia/Kolkata",
        orbOpenStartMin: 9 * 60 + 15,
        orbOpenEndMin: 9 * 60 + 30,
        orbBreakoutAfterMin: 9 * 60 + 30,
        supertrendSessionStartMin: 9 * 60 + 30,
        supertrendSessionEndMin: 12 * 60 + 30,
        supertrend24h: false,
        vwapLastEntryBeforeMin: 14 * 60 + 45,
        marketCloseMin: 15 * 60 + 15,
      };
    case "us_equity":
      return {
        kind,
        timeZone: "America/New_York",
        orbOpenStartMin: 9 * 60 + 30,
        orbOpenEndMin: 9 * 60 + 45,
        orbBreakoutAfterMin: 9 * 60 + 45,
        supertrendSessionStartMin: 9 * 60 + 30,
        supertrendSessionEndMin: 12 * 60 + 30,
        supertrend24h: false,
        vwapLastEntryBeforeMin: 15 * 60 + 45,
        marketCloseMin: 16 * 60,
      };
    case "crypto":
      return {
        kind,
        timeZone: "UTC",
        orbOpenStartMin: 0,
        orbOpenEndMin: 15,
        orbBreakoutAfterMin: 15,
        supertrendSessionStartMin: 0,
        supertrendSessionEndMin: 24 * 60 - 1,
        supertrend24h: true,
        vwapLastEntryBeforeMin: null,
        marketCloseMin: null,
      };
    case "forex":
    default:
      return {
        kind: "forex",
        timeZone: "UTC",
        orbOpenStartMin: 0,
        orbOpenEndMin: 15,
        orbBreakoutAfterMin: 15,
        supertrendSessionStartMin: 0,
        supertrendSessionEndMin: 24 * 60 - 1,
        supertrend24h: true,
        vwapLastEntryBeforeMin: null,
        marketCloseMin: null,
      };
  }
}

/** Risk / clock gates in pendingConditionalExecution: same zone as chart session */
export function resolveRiskTimeZone(yahooSymbol: string): string {
  return resolveMarketSessionProfile(yahooSymbol).timeZone;
}
