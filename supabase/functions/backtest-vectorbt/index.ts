/**
 * backtest-vectorbt — VectorBT engine on OpenAlgo (Historify → Yahoo Finance).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Used to confirm the deployed function version in browser Network → Response.
const BUILD_ID = "backtest-vectorbt:disable-broker:2026-03-18-01";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
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

    if (!OPENALGO_URL || !OPENALGO_APP_KEY) {
      return new Response(JSON.stringify({ error: "OpenAlgo not configured" }), { status: 500, headers });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    if (!symbol) {
      return new Response(JSON.stringify({ error: "symbol is required" }), { status: 400, headers });
    }

    // NOTE:
    // Broker-history path is temporarily disabled to avoid upstream broker SDK
    // runtime issues (e.g. `datetime.UTC` errors) until OpenAlgo is redeployed.
    // VectorBT will still backtest using Historify → Yahoo via OpenAlgo.
    const openalgoApiKey = null;

    const res = await fetch(`${OPENALGO_URL}/api/v1/platform/vectorbt-backtest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Platform-Key": OPENALGO_APP_KEY,
      },
      body: JSON.stringify({
        symbol,
        exchange: body.exchange ?? "NSE",
        strategy: body.strategy ?? "trend_following",
        action: body.action ?? "BUY",
        days: body.days ?? 365,
        stop_loss_pct: body.stop_loss_pct ?? 2,
        take_profit_pct: body.take_profit_pct ?? 4,
        max_hold_days: body.max_hold_days ?? 10,
        data_source: body.data_source ?? "auto",
        openalgo_api_key: openalgoApiKey,
      }),
    });

    const rawText = await res.text().catch(() => "");
    const data = rawText ? (JSON.parse(rawText) as any) : {};

    // IMPORTANT:
    // Supabase client treats non-2xx as "invoke error" and hides the JSON body.
    // So we always return 200 and include upstream status + message in payload.
    if (!res.ok) {
      return new Response(
        JSON.stringify({
          build_id: BUILD_ID,
          error: data?.error ?? "VectorBT backtest failed",
          upstream_status: res.status,
          upstream_detail: data?.detail ?? rawText ?? null,
        }),
        { status: 200, headers },
      );
    }

    return new Response(JSON.stringify({ build_id: BUILD_ID, ...data }), { status: 200, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ build_id: BUILD_ID, error: msg }), { status: 500, headers });
  }
});
