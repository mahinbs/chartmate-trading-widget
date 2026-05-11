const BRAND_OVERRIDE_STORAGE_KEY = "brand_override_mode";
const CHARTMATE_OVERRIDE_EMAILS = new Set(
  String(import.meta.env.VITE_CHARTMATE_OVERRIDE_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),
);

export function isChartmateOverrideEmail(email?: string | null): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return CHARTMATE_OVERRIDE_EMAILS.has(normalized);
}

export function setBrandOverrideFromEmail(email?: string | null): void {
  try {
    if (isChartmateOverrideEmail(email)) {
      localStorage.setItem(BRAND_OVERRIDE_STORAGE_KEY, "chartmate");
      return;
    }
    localStorage.removeItem(BRAND_OVERRIDE_STORAGE_KEY);
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

export function isChartmateBrandActive(): boolean {
  try {
    return localStorage.getItem(BRAND_OVERRIDE_STORAGE_KEY) === "chartmate";
  } catch {
    return false;
  }
}

export function replaceTradingSmartBrand(text: string): string {
  return text
    .replace(/TradingSmart\.ai/gi, "ChartMate.ai")
    .replace(/TradingSmart/gi, "ChartMate")
    .replace(/Trading Smart\.ai/gi, "ChartMate.ai")
    .replace(/Trading Smart/gi, "ChartMate")
    .replace(/tradingsmart\.ai/gi, "chartmate.ai")
    .replace(/tradingsmart/gi, "chartmate");
}
