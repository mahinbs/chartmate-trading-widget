import { useEffect, useState } from "react";
import {
  type CurrencyMode,
  currencyFromQuery,
  resolveDisplayCurrency,
} from "@/lib/resolveDisplayCurrency";

export type { CurrencyMode };

/**
 * India → INR pricing & checkout; otherwise USD.
 * Order: ?currency= → IP (ipapi, then ipwho) → timezone & *-IN locale.
 */
export function useUserCurrency(): { currency: CurrencyMode; countryCode: string; loading: boolean } {
  const fromQuery = typeof window !== "undefined" ? currencyFromQuery() : null;

  const [currency, setCurrency] = useState<CurrencyMode>(
    fromQuery ?? "USD",
  );
  const [countryCode, setCountryCode] = useState(
    fromQuery === "INR" ? "IN" : "",
  );
  const [loading, setLoading] = useState(fromQuery == null);

  useEffect(() => {
    const forced = currencyFromQuery();
    if (forced) {
      setCurrency(forced);
      setCountryCode(forced === "INR" ? "IN" : "");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const c = await resolveDisplayCurrency();
      if (cancelled) return;
      setCurrency(c);
      setCountryCode(c === "INR" ? "IN" : "");
    })()
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { currency, countryCode, loading };
}
