/**
 * fetch-expiry-dates — Supabase Edge Function
 *
 * Proxies OpenAlgo /api/v1/expiry for the authenticated user.
 * Returns sorted expiry dates tagged as weekly/monthly.
 *
 * Request body:
 *   { symbol, exchange, instrumenttype }
 *   instrumenttype: "OPTIDX" | "OPTSTK"
 *
 * Response:
 *   {
 *     expiries: Array<{
 *       date: string,         // "YYYY-MM-DD"
 *       display: string,      // human readable "24 Jan"
 *       tag: "weekly" | "monthly" | "next_weekly" | "far",
 *       days_to_expiry: number
 *     }>
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTradeAccess } from "../_shared/trade-access.ts";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

async function fetchOpenAlgoExpiryWithRetry(
  url: string,
  payload: Record<string, string>,
): Promise<Response> {
  const timeouts = [15000, 35000];
  let lastError: unknown = null;

  for (let i = 0; i < timeouts.length; i += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeouts[i]),
      });
      return res;
    } catch (err) {
      lastError = err;
      const msg = String(err ?? "");
      const isTimeout =
        msg.includes("Signal timed out") ||
        msg.includes("TimeoutError") ||
        msg.toLowerCase().includes("timed out");
      if (!isTimeout || i === timeouts.length - 1) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("OpenAlgo expiry request failed");
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

function toISODate(d: Date): string {
  const ist = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const day = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (!OPENALGO_URL) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_URL not configured." }),
        { status: 503, headers },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const access = await resolveTradeAccess(supabase, user.id);
    if (!access.hasAlgoEntitlement) {
      return new Response(
        JSON.stringify({ error: "Algo subscription required.", error_code: "NO_SUBSCRIPTION" }),
        { status: 403, headers },
      );
    }

    const openalgoApiKey = access.integration?.openalgo_api_key;
    if (!openalgoApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAlgo API key not configured.", error_code: "NO_API_KEY" }),
        { status: 422, headers },
      );
    }

    const body = await req.json().catch(() => ({}));
    const symbol: string = (body.symbol ?? "NIFTY").toUpperCase();
    const exchange: string = (body.exchange ?? "NFO").toUpperCase();
    const instrumenttype: string = body.instrumenttype ?? "OPTIDX";

    const expiryRes = await fetchOpenAlgoExpiryWithRetry(`${OPENALGO_URL}/api/v1/expiry`, {
      apikey: openalgoApiKey.trim(),
      symbol,
      exchange,
      instrumenttype,
    });

    if (!expiryRes.ok) {
      const errText = await expiryRes.text().catch(() => "unknown");
      return new Response(
        JSON.stringify({ error: "OpenAlgo expiry failed.", detail: errText }),
        { status: 502, headers },
      );
    }

    const expiryData = await expiryRes.json();

    // OpenAlgo returns { status, data: ["DD-Mon-YYYY", ...] } or { data: [...] }
    const rawDates: string[] = Array.isArray(expiryData?.data)
      ? expiryData.data
      : Array.isArray(expiryData)
      ? expiryData
      : [];

    const todayKey = toISODate(new Date());

    // Parse and sort dates (include today’s expiry — compare IST calendar days, not d > now)
    const parsed = rawDates
      .map((ds) => {
        let d: Date | null = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
          d = new Date(ds + "T12:00:00+05:30");
        } else if (/^\d{2}-[A-Za-z]+-\d{4}$/.test(ds)) {
          d = new Date(ds.replace(/-/g, " ") + " 12:00:00 GMT+0530");
        } else {
          d = new Date(ds);
        }
        if (isNaN(d?.getTime() ?? NaN)) return null;
        return d;
      })
      .filter((d): d is Date => d !== null && toISODate(d) >= todayKey)
      .sort((a, b) => a.getTime() - b.getTime());

    // Tag expiries
    type ExpiryItem = {
      date: string;
      display: string;
      tag: "weekly" | "monthly" | "next_weekly" | "far";
      days_to_expiry: number;
    };

    const fromIst = new Date(todayKey + "T12:00:00+05:30");
    const expiries: ExpiryItem[] = parsed.map((d, idx) => {
      const days = daysBetween(fromIst, d);
      let tag: ExpiryItem["tag"];
      if (idx === 0) tag = "weekly";
      else if (idx === 1) {
        // If within 14 days, it's the next weekly
        tag = days <= 14 ? "next_weekly" : "monthly";
      } else if (days <= 35) {
        tag = "monthly";
      } else {
        tag = "far";
      }
      return {
        date: toISODate(d),
        display: formatDisplay(d),
        tag,
        days_to_expiry: days,
      };
    });

    return new Response(
      JSON.stringify({ symbol, exchange, instrumenttype, expiries }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("[fetch-expiry-dates] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers },
    );
  }
});
