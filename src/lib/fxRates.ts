/**
 * Spot USD/INR for backtesting UI — ECB reference rates via Frankfurter (no API key).
 * https://www.frankfurter.app/
 */
export type UsdInrQuote = { inrPerUsd: number; rateDate: string };

export async function fetchUsdInr(): Promise<UsdInrQuote> {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  const j = (await res.json()) as { rates?: { INR?: number }; date?: string };
  const inr = j.rates?.INR;
  if (typeof inr !== "number" || !Number.isFinite(inr) || inr <= 0) {
    throw new Error("Invalid USD/INR payload");
  }
  return { inrPerUsd: inr, rateDate: typeof j.date === "string" ? j.date : "" };
}
