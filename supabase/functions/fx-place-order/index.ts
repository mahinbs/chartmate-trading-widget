/**
 * fx-place-order — Supabase Edge Function
 *
 * Routes forex orders from ChartMate to the ChartMate FX Microservice
 * (FastAPI + MetaTrader5 running on a Windows/VPS machine).
 *
 * Secrets required:
 *   FX_API_URL    = https://your-fx-host:9000
 *   FX_API_SECRET = same value as FX_API_SECRET in the FX microservice .env
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FX_API_URL    = (Deno.env.get("FX_API_URL")    ?? "").replace(/\/$/, "");
const FX_API_SECRET = Deno.env.get("FX_API_SECRET")  ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    // ── Guard: service must be configured ────────────────────────────────────
    if (!FX_API_URL || !FX_API_SECRET) {
      return new Response(
        JSON.stringify({ error: "FX service not configured. Set FX_API_URL and FX_API_SECRET." }),
        { status: 503, headers },
      );
    }

    // ── Auth: validate Supabase JWT ───────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers },
      );
    }

    const { symbol, side, volume, sl, tp } = body as {
      symbol:  string;
      side:    "BUY" | "SELL";
      volume:  number;
      sl?:     number;
      tp?:     number;
    };

    if (!symbol || !side || !volume) {
      return new Response(
        JSON.stringify({ error: "symbol, side and volume are required" }),
        { status: 400, headers },
      );
    }

    // ── Forward to FX microservice ────────────────────────────────────────────
    const fxRes = await fetch(`${FX_API_URL}/forex/order`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "X-API-SECRET":  FX_API_SECRET,
      },
      body: JSON.stringify({
        symbol,
        side,
        volume,
        sl:        sl   ?? null,
        tp:        tp   ?? null,
        client_id: user.id,
      }),
    });

    const data = await fxRes.json();

    if (!fxRes.ok) {
      return new Response(
        JSON.stringify({ error: data?.detail ?? "FX order failed" }),
        { status: 502, headers },
      );
    }

    return new Response(JSON.stringify(data), { status: 200, headers });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers },
    );
  }
});
