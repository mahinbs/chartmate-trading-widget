/**
 * Spot USD per 1 INR (multiply an INR amount by this to get USD).
 * Uses Frankfurter (ECB rates) — same source as the Active Trades page.
 * Server-side Finnhub is used elsewhere for quotes; the publishable app has no browser Finnhub key.
 */
export async function fetchUsdPerInr(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=INR&to=USD",
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { USD?: number } };
    const rate = json?.rates?.USD;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
