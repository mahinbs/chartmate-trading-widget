/**
 * admin-provision-algo — Supabase Edge Function (super-admin only)
 *
 * Provisions a user for live algo trading:
 *  1. Admin provides the user's personal OpenAlgo API key (each user has their own unique key).
 *     Get it from openalgo.tradebrainx.com → create the user account → copy their API key.
 *  2. Saves that API key to user_trading_integration (tied to this specific user only).
 *  3. Creates an algo_user_assignments record with strategy + risk profile.
 *  4. Marks algo_onboarding as "provisioned".
 *
 * Body: { onboarding_id, openalgo_api_key }
 * Every user gets a DIFFERENT openalgo_api_key — never reuse the same key across users.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Auth + super-admin check ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleRow?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: super-admin only" }), { status: 403, headers });
    }

    // ── Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const onboardingId: string   = (body.onboarding_id as string)?.trim();
    const openalgoApiKey: string = (body.openalgo_api_key as string)?.trim();

    if (!onboardingId || !openalgoApiKey) {
      return new Response(
        JSON.stringify({ error: "onboarding_id and openalgo_api_key are required. Each user has their own unique API key from OpenAlgo." }),
        { status: 400, headers },
      );
    }

    // ── Fetch the onboarding record ───────────────────────────────────────
    const { data: onboarding, error: fetchErr } = await supabase
      .from("algo_onboarding")
      .select("id, user_id, broker, strategy_pref, risk_level, status")
      .eq("id", onboardingId)
      .maybeSingle();

    if (fetchErr || !onboarding) {
      return new Response(
        JSON.stringify({ error: "Onboarding record not found" }),
        { status: 404, headers },
      );
    }

    if (onboarding.status === "provisioned" || onboarding.status === "active") {
      return new Response(
        JSON.stringify({ error: "This user has already been provisioned" }),
        { status: 409, headers },
      );
    }

    const targetUserId: string = onboarding.user_id;

    // ── Upsert user_trading_integration with the user's personal API key ──
    // NOTE: openalgoApiKey is unique per user — it was obtained from
    // openalgo.tradebrainx.com by creating this user's account there.
    const { data: integrationRow, error: upsertErr } = await supabase
      .from("user_trading_integration")
      .upsert(
        {
          user_id:           targetUserId,
          integration_type:  "openalgo",
          base_url:          OPENALGO_URL || "",
          api_key_encrypted: "",
          broker:            onboarding.broker ?? "zerodha",
          openalgo_api_key:  openalgoApiKey,
          strategy_name:     onboarding.strategy_pref ?? "ChartMate AI",
          is_active:         true,
          updated_at:        new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();

    if (upsertErr) {
      console.error("admin-provision-algo upsert error:", upsertErr);
      return new Response(
        JSON.stringify({ error: "Failed to save integration: " + upsertErr.message }),
        { status: 500, headers },
      );
    }

    // ── Upsert algo_user_assignments ──────────────────────────────────────
    const allowedStrategy = (onboarding.strategy_pref ?? "trend_following").toString().trim();
    const riskProfile = (onboarding.risk_level ?? "medium").toString().toLowerCase();
    const { error: assignmentErr } = await supabase
      .from("algo_user_assignments")
      .upsert(
        {
          user_id:          targetUserId,
          integration_id:   integrationRow?.id ?? null,
          allowed_strategy: allowedStrategy,
          risk_profile:     riskProfile,
          status:           "active",
          assigned_by:      user.id,
          updated_at:       new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (assignmentErr) {
      console.error("admin-provision-algo assignment error:", assignmentErr);
      return new Response(
        JSON.stringify({ error: "Failed to save user assignment: " + assignmentErr.message }),
        { status: 500, headers },
      );
    }

    // ── Mark onboarding as provisioned ────────────────────────────────────
    await supabase
      .from("algo_onboarding")
      .update({ status: "provisioned", provisioned_at: new Date().toISOString() })
      .eq("id", onboardingId);

    return new Response(
      JSON.stringify({
        success: true,
        message: "User provisioned successfully",
      }),
      { status: 200, headers },
    );

  } catch (err) {
    console.error("admin-provision-algo error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers },
    );
  }
});
