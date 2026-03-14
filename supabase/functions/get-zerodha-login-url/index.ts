/**
 * Returns a Zerodha Kite Connect login URL that redirects the user back to
 * ChartMate after Zerodha login — the user never sees OpenAlgo.
 *
 * Flow:
 *   ChartMate → this function → calls OpenAlgo /api/v1/platform/zerodha/login-url
 *   → returns Kite Connect URL (with signed state) → user logs into Zerodha
 *   → Zerodha redirects to OpenAlgo /zerodha/callback (registered redirect URL)
 *   → OpenAlgo detects platform state, exchanges token, stores session for the user
 *   → OpenAlgo redirects to ChartMate /broker-callback?broker=zerodha&broker_token=...
 *   → BrokerCallbackPage saves token to Supabase → user sees "Connected!"
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL    = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
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
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase   = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } =
      await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    let return_url = "";
    try {
      const body = await req.json();
      return_url = body?.return_url ?? "";
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body; return_url required" }),
        { status: 400, headers },
      );
    }
    if (!return_url.startsWith("http")) {
      return new Response(
        JSON.stringify({ error: "return_url must be a full URL" }),
        { status: 400, headers },
      );
    }

    // ── Resolve OpenAlgo username for this user ─────────────────────────────
    // Preferred: read from algo_user_assignments (saved during admin provisioning).
    // Fallback: derive deterministically from Supabase user_id — matches the
    //           algorithm in OpenAlgo's platform_api.py: sb_<first28chars_uuid_nohyphens>
    const { data: assignment } = await supabase
      .from("algo_user_assignments" as any)
      .select("openalgo_username, status")
      .eq("user_id", user.id)
      .maybeSingle();

    let openalgoUsername: string = (assignment as any)?.openalgo_username ?? "";

    // Fallback: derive from user_id (same algo as OpenAlgo's create-user endpoint)
    if (!openalgoUsername) {
      const cleanId = user.id.replace(/-/g, "");
      openalgoUsername = `sb_${cleanId.substring(0, 28)}`;
    }

    // ── Call OpenAlgo platform endpoint ─────────────────────────────────────
    if (!OPENALGO_URL || !OPENALGO_APP_KEY) {
      return new Response(
        JSON.stringify({ error: "Broker integration not configured. Contact support." }),
        { status: 503, headers },
      );
    }

    const platformUrl =
      `${OPENALGO_URL}/api/v1/platform/zerodha/login-url` +
      `?username=${encodeURIComponent(openalgoUsername)}` +
      `&return_url=${encodeURIComponent(return_url)}`;

    const controller  = new AbortController();
    const timeoutId   = setTimeout(() => controller.abort(), 8000);

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
        return new Response(
          JSON.stringify({ error: data?.error ?? "OpenAlgo did not return a URL" }),
          { status: 502, headers },
        );
      }

      const errText = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `OpenAlgo error ${res.status}: ${errText.slice(0, 200)}` }),
        { status: 502, headers },
      );
    } catch (e) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: "Could not reach broker backend. Try again shortly." }),
        { status: 503, headers },
      );
    }

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers },
    );
  }
});
