/**
 * sync-broker-session — Supabase Edge Function
 *
 * Called when a user saves their daily broker token from ChartMate's UI.
 * Does TWO things atomically:
 *   1. Saves the token to our Supabase (user_trading_integration) with midnight-IST expiry
 *   2. Pushes the token to OpenAlgo via platform_api /set-broker-session so OpenAlgo
 *      can place orders on the user's behalf
 *
 * Body: { broker: string, auth_token: string, feed_token?: string, broker_user_id?: string }
 * Returns: { success, expires_at, openalgo_synced }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL     = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

/** Compute token expiry: midnight of the next trading day in IST (UTC+5:30) */
function midnightIstExpiry(): string {
  const IST = 330; // minutes
  const nowIstMs = Date.now() + IST * 60_000;
  const nowIst   = new Date(nowIstMs);
  const y = nowIst.getUTCFullYear();
  const m = nowIst.getUTCMonth();
  const d = nowIst.getUTCDate();
  const nextMidnightUtcMs = Date.UTC(y, m, d + 1, 0, 0, 0) - IST * 60_000;
  return new Date(nextMidnightUtcMs).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase   = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body          = await req.json().catch(() => ({}));
    const broker        = ((body.broker as string) ?? "").trim().toLowerCase();
    const authToken     = ((body.auth_token as string) ?? "").trim();
    const feedToken     = ((body.feed_token as string) ?? "").trim() || null;
    const brokerUserId  = ((body.broker_user_id as string) ?? "").trim() || null;

    if (!broker || !authToken) {
      return new Response(
        JSON.stringify({ error: "broker and auth_token are required" }),
        { status: 400, headers },
      );
    }

    const expiresAt = midnightIstExpiry();

    // ── 1. Save to our Supabase ───────────────────────────────────────────────
    const { error: upsertErr } = await supabase
      .from("user_trading_integration" as any)
      .upsert({
        user_id:           user.id,
        integration_type:  "openalgo",
        base_url:          "",
        api_key_encrypted: authToken,
        broker:            broker,
        strategy_name:     "ChartMate AI",
        is_active:         true,
        token_expires_at:  expiresAt,
        updated_at:        new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertErr) {
      console.error("Supabase upsert error:", upsertErr);
      return new Response(
        JSON.stringify({ error: "Failed to save token: " + upsertErr.message }),
        { status: 500, headers },
      );
    }

    // ── 2. Push to OpenAlgo so it can place orders ────────────────────────────
    let openalgoSynced = false;
    let openalgoError  = null;

    if (OPENALGO_URL && OPENALGO_APP_KEY) {
      // Get the user's OpenAlgo username from their integration record
      const { data: integration } = await supabase
        .from("user_trading_integration" as any)
        .select("openalgo_api_key")
        .eq("user_id", user.id)
        .maybeSingle();

      // Get openalgo_username from algo_onboarding → algo_user_assignments
      const { data: assignment } = await supabase
        .from("algo_user_assignments" as any)
        .select("openalgo_username")
        .eq("user_id", user.id)
        .maybeSingle();

      const openalgoUsername: string = (assignment as any)?.openalgo_username ?? "";

      if (openalgoUsername) {
        try {
          const syncRes = await fetch(`${OPENALGO_URL}/api/v1/platform/set-broker-session`, {
            method:  "POST",
            headers: {
              "Content-Type":  "application/json",
              "X-Platform-Key": OPENALGO_APP_KEY,
            },
            body: JSON.stringify({
              username:       openalgoUsername,
              broker:         broker,
              auth_token:     authToken,
              feed_token:     feedToken ?? undefined,
              broker_user_id: brokerUserId ?? undefined,
            }),
            signal: AbortSignal.timeout(8000),
          });

          if (syncRes.ok) {
            openalgoSynced = true;
          } else {
            const errText = await syncRes.text();
            openalgoError = `OpenAlgo returned ${syncRes.status}: ${errText.slice(0, 150)}`;
            console.warn("OpenAlgo set-broker-session failed:", openalgoError);
          }
        } catch (e) {
          openalgoError = e instanceof Error ? e.message : "OpenAlgo unreachable";
          console.warn("OpenAlgo set-broker-session error:", openalgoError);
        }
      } else {
        // User not provisioned yet — token saved to our DB, OpenAlgo sync will
        // happen automatically when admin provisions them.
        openalgoError = "User not yet provisioned — token saved, will sync when account is activated";
      }
    } else {
      openalgoError = "OPENALGO_URL or OPENALGO_APP_KEY not configured";
    }

    return new Response(
      JSON.stringify({
        success:          true,
        expires_at:       expiresAt,
        openalgo_synced:  openalgoSynced,
        openalgo_note:    openalgoError,
      }),
      { status: 200, headers },
    );

  } catch (err) {
    console.error("sync-broker-session error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers },
    );
  }
});
