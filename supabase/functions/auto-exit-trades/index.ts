/**
 * auto-exit-trades — Supabase Edge Function
 *
 * Returns recent auto-exit tracked trades for the logged-in user.
 * This is server-to-server: Supabase verifies user, then calls OpenAlgo platform API.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL     = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

export const JSON_HEADERS = { "Content-Type": "application/json", ...corsHeaders };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: JSON_HEADERS });

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
    }

    const { data: integration } = await supabase
      .from("user_trading_integration")
      .select("openalgo_username")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const openalgoUsername = (integration as any)?.openalgo_username ?? "";
    if (!openalgoUsername) {
      return new Response(JSON.stringify({ trades: [] }), { status: 200, headers: JSON_HEADERS });
    }

    if (!OPENALGO_URL || !OPENALGO_APP_KEY) {
      return new Response(JSON.stringify({ error: "OpenAlgo not configured" }), { status: 500, headers: JSON_HEADERS });
    }

    const res = await fetch(`${OPENALGO_URL}/api/v1/platform/auto-exit-trades/${encodeURIComponent(openalgoUsername)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Platform-Key": OPENALGO_APP_KEY,
      },
    });

    const txt = await res.text();
    const data = txt ? JSON.parse(txt) : {};
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data?.error ?? "Failed to load auto-exit trades" }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ trades: data?.trades ?? [] }), { status: 200, headers: JSON_HEADERS });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), { status: 500, headers: JSON_HEADERS });
  }
});

