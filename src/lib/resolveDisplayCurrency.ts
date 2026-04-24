export type CurrencyMode = "INR" | "USD";

/** URL ?currency=INR|USD forces display (case-insensitive). */
export function currencyFromQuery(): CurrencyMode | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("currency");
  if (!raw) return null;
  const u = raw.trim().toUpperCase();
  if (u === "INR" || u === "RS" || u === "RUPEE") return "INR";
  if (u === "USD" || u === "DOLLAR") return "USD";
  return null;
}

/**
 * Strong client-side signals when IP APIs fail (rate limit, adblock, localhost quirks).
 * India uses IANA zone "Asia/Kolkata" (older: "Asia/Calcutta").
 */
export function inferIndiaFromClient(): boolean {
  const offsetMinutes = new Date().getTimezoneOffset();
  // IST is UTC+5:30 -> getTimezoneOffset() = -330
  if (offsetMinutes === -330) return true;

  if (typeof Intl !== "undefined") {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return true;
    } catch {
      /* ignore */
    }
  }
  if (typeof navigator === "undefined") return false;
  const list = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const l of list) {
    const x = l.toLowerCase();
    if (x === "en-in" || x.endsWith("-in")) return true;
  }
  return false;
}

type GeoJson = { country_code?: string; error?: boolean; reason?: string };

async function fetchCountryFromIpApi(): Promise<string | null> {
  const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
  const j = (await res.json()) as GeoJson;
  if (!res.ok || j.error) return null;
  const cc = (j.country_code ?? "").toUpperCase();
  return cc || null;
}

async function fetchCountryFromIpWho(): Promise<string | null> {
  const res = await fetch("https://ipwho.is/", { cache: "no-store" });
  const j = (await res.json()) as { success?: boolean; country_code?: string };
  if (!res.ok || j.success === false) return null;
  const cc = (j.country_code ?? "").toUpperCase();
  return cc || null;
}

export async function resolveCountryCodeFromIp(): Promise<string | null> {
  try {
    const a = await fetchCountryFromIpApi();
    if (a) return a;
  } catch {
    /* try backup */
  }
  try {
    const b = await fetchCountryFromIpWho();
    if (b) return b;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Single async resolution: query override → IP → client heuristics.
 * Use from hooks and from embedded-HTML pricers.
 */
export async function resolveDisplayCurrency(): Promise<CurrencyMode> {
  const q = currencyFromQuery();
  if (q) return q;
  const cc = await resolveCountryCodeFromIp();
  if (cc) return cc === "IN" ? "INR" : "USD";
  // Unknown geo: prefer safe global default to avoid mislabeling non-India users as INR.
  return "USD";
}
