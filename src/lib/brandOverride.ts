const CHARTMATE_OVERRIDE_EMAIL = "sahasraedu77@gmail.com";
const BRAND_OVERRIDE_STORAGE_KEY = "brand_override_mode";

export function isChartmateOverrideEmail(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === CHARTMATE_OVERRIDE_EMAIL;
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
