/**
 * Returns the Zerodha Kite Connect login URL so the user can connect from ChartMate only.
 * Flow: ChartMate → this function → returns URL → user goes to Kite → Zerodha redirects to
 * OpenAlgo → OpenAlgo exchanges token and redirects to ChartMate /broker-callback with token.
 *
 * Tries OpenAlgo GET /api/v1/zerodha/login-url?return_url=... first.
 * If not implemented, builds URL using ZERODHA_API_KEY (optional Supabase secret).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_SECRET = Deno.env.get("OPENALGO_SECRET") ?? "";
const ZERODHA_API_KEY = Deno.env.get("ZERODHA_API_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    let return_url = "";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        return_url = body?.return_url ?? "";
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body; return_url required" }),
          { status: 400, headers }
        );
      }
    } else {
      const u = new URL(req.url);
      return_url = u.searchParams.get("return_url") ?? "";
    }
    if (!return_url.startsWith("http")) {
      return new Response(
        JSON.stringify({ error: "return_url must be a full URL" }),
        { status: 400, headers }
      );
    }
    const encodedReturn = encodeURIComponent(return_url);

    // Prefer ZERODHA_API_KEY (instant, no external call) so we never hang on OpenAlgo cold-start/slowness
    if (ZERODHA_API_KEY) {
      const url = `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(ZERODHA_API_KEY)}&state=${encodedReturn}`;
      return new Response(JSON.stringify({ url }), { status: 200, headers });
    }

    // Optional: try OpenAlgo with a short timeout (don't block user if OpenAlgo is slow/down)
    if (OPENALGO_URL) {
      const openalgoUrl = `${OPENALGO_URL}/api/v1/zerodha/login-url?return_url=${encodedReturn}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(openalgoUrl, {
          method: "GET",
          signal: controller.signal,
          headers: OPENALGO_SECRET
            ? { "X-Chartmate-Secret": OPENALGO_SECRET }
            : undefined,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data?.url && typeof data.url === "string") {
            return new Response(JSON.stringify({ url: data.url }), {
              status: 200,
              headers,
            });
          }
        }
      } catch {
        clearTimeout(timeoutId);
      }
    }

    return new Response(
      JSON.stringify({
        error:
          "Zerodha login not configured. Set OPENALGO_URL (and implement /api/v1/zerodha/login-url) or ZERODHA_API_KEY.",
      }),
      { status: 503, headers }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers }
    );
  }
});
