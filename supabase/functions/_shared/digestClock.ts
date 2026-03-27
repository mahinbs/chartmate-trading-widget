/**
 * Single source of truth for entry-digest scheduling clock math.
 * Used by: entry-point-daily-digest (Edge), src/lib/timezones.ts (UI).
 * Keep behavior identical — same Intl options as the live digest job.
 */

const LEGACY_TZ_ALIAS: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
};

export function normalizeTimezoneForDigest(tz: string | null | undefined): string {
  const t = (tz ?? "UTC").trim();
  return LEGACY_TZ_ALIAS[t] ?? t;
}

const WD: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/** Same wall clock / calendar date as the Edge Function uses for firing digests. */
export function getDigestClockContext(
  now: Date,
  tzRaw: string,
): { h: number; m: number; dateKey: string; weekday: number; weekdayName: string } {
  const tz = normalizeTimezoneForDigest(tzRaw);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const parts = dtf.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = get("year");
  const mo = get("month");
  const da = get("day");
  const h = Number(get("hour"));
  const m = Number(get("minute"));
  const wdName = get("weekday");
  return {
    h,
    m,
    dateKey: `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`,
    weekday: WD[wdName] ?? 0,
    weekdayName: wdName,
  };
}

export function parseNotifyTimeForDigest(s: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(s).trim());
  if (!m) return { h: 9, m: 30 };
  return { h: Number(m[1]), m: Number(m[2]) };
}

/**
 * True when local "minutes since midnight" is within [0, N) minutes after the scheduled time.
 * Wide enough for cron every 5m to still catch the alarm (e.g. 10:41 alarm + tick at 10:45).
 * With * * * * * (every minute) this still fires in the first minute after the chosen time.
 */
const DIGEST_FIRE_WINDOW_MIN = 16;

export function isInDigestFireWindow(nowMin: number, scheduledMin: number): boolean {
  let diff = nowMin - scheduledMin;
  if (diff < 0) diff += 1440;
  return diff >= 0 && diff < DIGEST_FIRE_WINDOW_MIN;
}

/** Readable line for UI — proves same clock the digest uses. */
export function formatDigestClockNowLine(now: Date, tzRaw: string): string {
  const tz = normalizeTimezoneForDigest(tzRaw);
  const ctx = getDigestClockContext(now, tz);
  const hm = `${String(ctx.h).padStart(2, "0")}:${String(ctx.m).padStart(2, "0")}`;
  return `Digest clock: ${ctx.weekdayName}, ${ctx.dateKey} · ${hm} (${tz})`;
}
