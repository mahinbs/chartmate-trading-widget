/**
 * Returns a Fyers login URL that redirects the user back to
 * ChartMate after broker login via OpenAlgo platform callback.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    let return_url = "";
    try {
      const body = await req.json();
      return_url = body?.return_url ?? "";
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body; return_url required" }), { status: 400, headers });
    }

    if (!return_url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "return_url must be a full URL" }), { status: 400, headers });
    }

    const { data: assignment } = await supabase
      .from("algo_user_assignments")
      .select("openalgo_username")
      .eq("user_id", user.id)
      .maybeSingle();

    let openalgoUsername = assignment?.openalgo_username ?? "";
    if (!openalgoUsername) {
      const cleanId = user.id.replace(/-/g, "");
      openalgoUsername = `sb_${cleanId.substring(0, 28)}`;
    }

    if (!OPENALGO_URL || !OPENALGO_APP_KEY) {
      return new Response(JSON.stringify({ error: "Broker integration not configured. Contact support." }), {
        status: 503,
        headers,
      });
    }

    const platformUrl =
      `${OPENALGO_URL}/api/v1/platform/fyers/login-url` +
      `?username=${encodeURIComponent(openalgoUsername)}` +
      `&return_url=${encodeURIComponent(return_url)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(platformUrl, {
        method: "GET",
        headers: { "X-Platform-Key": OPENALGO_APP_KEY },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data?.url && typeof data.url === "string") {
          return new Response(JSON.stringify({ url: data.url }), { status: 200, headers });
        }
        return new Response(JSON.stringify({ error: data?.error ?? "OpenAlgo did not return a URL" }), {
          status: 502,
          headers,
        });
      }

      const errText = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `OpenAlgo error ${res.status}: ${errText.slice(0, 200)}` }), {
        status: 502,
        headers,
      });
    } catch {
      clearTimeout(timeoutId);
      return new Response(JSON.stringify({ error: "Could not reach broker backend. Try again shortly." }), {
        status: 503,
        headers,
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers,
    });
  }
});
