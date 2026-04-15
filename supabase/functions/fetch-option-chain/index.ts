/**
 * fetch-option-chain — Supabase Edge Function
 *
 * Proxies OpenAlgo /api/v1/optionchain for the authenticated user.
 * Returns full option chain with CE/PE LTP, OI, IV, Delta, Theta per strike,
 * and resolves the current ATM strike from the underlying LTP.
 *
 * Request body:
 *   { symbol, exchange, expiry_date? }
 *
 * Response:
 *   {
 *     atm_strike: number,
 *     underlying_ltp: number,
 *     expiry_date: string,
 *     strikes: Array<{
 *       strike: number,
 *       ce: { ltp, oi, oi_change, iv, delta, theta, symbol } | null,
 *       pe: { ltp, oi, oi_change, iv, delta, theta, symbol } | null,
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

async function fetchOpenAlgoChainWithRetry(
  url: string,
  payload: Record<string, string>,
): Promise<Response> {
  const timeouts = [18000, 40000];
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

  throw lastError ?? new Error("OpenAlgo optionchain request failed");
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

    // Authenticate user
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

    // Check algo entitlement
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

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const symbol: string = (body.symbol ?? "NIFTY").toUpperCase();
    const exchange: string = (body.exchange ?? "NFO").toUpperCase();
    const expiryDate: string | undefined = body.expiry_date;

    // Build payload for OpenAlgo /optionchain
    const chainPayload: Record<string, string> = {
      apikey: openalgoApiKey.trim(),
      symbol,
      exchange,
    };
    if (expiryDate) chainPayload.expiry = expiryDate;

    const chainRes = await fetchOpenAlgoChainWithRetry(
      `${OPENALGO_URL}/api/v1/optionchain`,
      chainPayload,
    );

    if (!chainRes.ok) {
      const errText = await chainRes.text().catch(() => "unknown");
      return new Response(
        JSON.stringify({ error: "OpenAlgo optionchain failed.", detail: errText }),
        { status: 502, headers },
      );
    }

    const chainData = await chainRes.json();

    // Normalise OpenAlgo response into a consistent shape
    // OpenAlgo returns: { status, data: { atm_strike, underlying_ltp, expiry, calls: [...], puts: [...] } }
    const raw = chainData?.data ?? chainData;

    const atmStrike: number = Number(raw?.atm_strike ?? raw?.atmstrike ?? 0);
    const underlyingLtp: number = Number(raw?.underlying_ltp ?? raw?.ltp ?? 0);
    const resolvedExpiry: string = raw?.expiry ?? expiryDate ?? "";

    // Merge calls and puts into a strike-keyed map
    type LegData = {
      ltp: number;
      oi: number;
      oi_change: number;
      iv: number;
      delta: number;
      theta: number;
      symbol: string;
    };
    const strikeMap: Map<number, { ce: LegData | null; pe: LegData | null }> = new Map();

    const mapLeg = (item: Record<string, unknown>): LegData => ({
      ltp: Number(item.ltp ?? item.lastPrice ?? 0),
      oi: Number(item.oi ?? item.openInterest ?? 0),
      oi_change: Number(item.oi_change ?? item.changeinOpenInterest ?? 0),
      iv: Number(item.iv ?? item.impliedVolatility ?? 0),
      delta: Number(item.delta ?? 0),
      theta: Number(item.theta ?? 0),
      symbol: String(item.symbol ?? item.tradingSymbol ?? ""),
    });

    const calls: unknown[] = Array.isArray(raw?.calls) ? raw.calls : (Array.isArray(raw?.CE) ? raw.CE : []);
    const puts: unknown[] = Array.isArray(raw?.puts) ? raw.puts : (Array.isArray(raw?.PE) ? raw.PE : []);

    for (const c of calls) {
      const item = c as Record<string, unknown>;
      const strike = Number(item.strike ?? item.strikePrice ?? 0);
      if (!strike) continue;
      const existing = strikeMap.get(strike) ?? { ce: null, pe: null };
      existing.ce = mapLeg(item);
      strikeMap.set(strike, existing);
    }
    for (const p of puts) {
      const item = p as Record<string, unknown>;
      const strike = Number(item.strike ?? item.strikePrice ?? 0);
      if (!strike) continue;
      const existing = strikeMap.get(strike) ?? { ce: null, pe: null };
      existing.pe = mapLeg(item);
      strikeMap.set(strike, existing);
    }

    const strikes = Array.from(strikeMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([strike, legs]) => ({ strike, ce: legs.ce, pe: legs.pe }));

    return new Response(
      JSON.stringify({
        atm_strike: atmStrike,
        underlying_ltp: underlyingLtp,
        expiry_date: resolvedExpiry,
        symbol,
        exchange,
        strikes,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("[fetch-option-chain] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers },
    );
  }
});
