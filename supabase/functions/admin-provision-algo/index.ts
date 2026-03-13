/**
 * admin-provision-algo — Supabase Edge Function (super-admin only)
 *
 * Provisions a user for live algo trading:
 *  1. Calls OpenAlgo /api/v1/platform/create-user to auto-create their OpenAlgo account
 *     and receive their API key (no manual API key copy-paste needed).
 *  2. Saves the API key + broker mapping to user_trading_integration.
 *  3. Creates an algo_user_assignments record with strategy + risk profile.
 *  4. Marks algo_onboarding as "provisioned".
 *
 * Body: { onboarding_id, openalgo_username_override? }
 * (openalgo_api_key is no longer required — it's auto-generated)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";

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
    const onboardingId: string = (body.onboarding_id as string)?.trim();

    if (!onboardingId) {
      return new Response(
        JSON.stringify({ error: "onboarding_id is required" }),
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

    // ── Get user email from Supabase auth ─────────────────────────────────
    const { data: { user: targetUser } } = await supabase.auth.admin.getUserById(targetUserId);
    const targetEmail = targetUser?.email ?? `user_${targetUserId.slice(0, 8)}@chartmate.in`;

    // ── Auto-create OpenAlgo user and get API key ─────────────────────────
    let openalgoApiKey = "";
    let openalgoUsername = "";

    if (OPENALGO_URL && OPENALGO_APP_KEY) {
      const openalgoRes = await fetch(`${OPENALGO_URL}/api/v1/platform/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Platform-Key": OPENALGO_APP_KEY,
        },
        body: JSON.stringify({
          supabase_user_id: targetUserId,
          email: targetEmail,
        }),
      });

      if (!openalgoRes.ok) {
        const errText = await openalgoRes.text();
        console.error("OpenAlgo create-user failed:", errText);
        return new Response(
          JSON.stringify({
            error: "Failed to create OpenAlgo account. Please check OPENALGO_URL and OPENALGO_APP_KEY.",
            detail: errText,
          }),
          { status: 502, headers },
        );
      }

      const openalgoData = await openalgoRes.json() as { api_key: string; username: string; created: boolean };
      openalgoApiKey = openalgoData.api_key ?? "";
      openalgoUsername = openalgoData.username ?? "";
      console.log(`OpenAlgo user ${openalgoUsername} ${openalgoData.created ? "created" : "already existed"}`);
    } else {
      // Fallback: OPENALGO_URL not configured — still provision in Supabase
      console.warn("OPENALGO_URL or OPENALGO_APP_KEY not set — skipping OpenAlgo user creation");
    }

    // ── Upsert user_trading_integration ──────────────────────────────────
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
          openalgo_username: openalgoUsername,
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
        openalgo_username: openalgoUsername || null,
        openalgo_key_set:  !!openalgoApiKey,
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
