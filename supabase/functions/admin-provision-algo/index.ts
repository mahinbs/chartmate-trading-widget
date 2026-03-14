/**
 * admin-provision-algo — Supabase Edge Function (super-admin only)
 *
 * Provisions a user for live algo trading — fully automated:
 *  1. Fetches the user's email from Supabase auth.
 *  2. Calls OpenAlgo POST /api/v1/platform/create-user  →  creates their OpenAlgo account
 *     and returns their unique API key automatically. (Idempotent — safe to re-run.)
 *  3. Saves API key + broker + strategy to user_trading_integration.
 *  4. Creates algo_user_assignments record.
 *  5. Marks algo_onboarding as "provisioned".
 *
 * Body: { onboarding_id }
 * No manual API key entry needed — OpenAlgo generates one per user automatically.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const APP_KEY      = Deno.env.get("OPENALGO_APP_KEY") ?? "";

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
    const onboardingId: string = ((body.onboarding_id as string) ?? "").trim();

    if (!onboardingId) {
      return new Response(
        JSON.stringify({ error: "onboarding_id is required" }),
        { status: 400, headers },
      );
    }

    // ── Fetch onboarding record ───────────────────────────────────────────
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

    // ── Get user's email from Supabase auth ───────────────────────────────
    const { data: { user: targetUser }, error: userErr } = await supabase.auth.admin.getUserById(targetUserId);
    if (userErr || !targetUser) {
      return new Response(
        JSON.stringify({ error: "Could not fetch user email from auth" }),
        { status: 500, headers },
      );
    }
    const targetEmail = targetUser.email ?? `${targetUserId}@chartmate.user`;

    // ── Auto-create user in OpenAlgo via platform API ─────────────────────
    // This is idempotent — if the user already exists, returns their existing API key.
    if (!OPENALGO_URL) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_URL not configured in Supabase secrets" }),
        { status: 503, headers },
      );
    }
    if (!APP_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_APP_KEY not configured in Supabase secrets" }),
        { status: 503, headers },
      );
    }

    const oaRes = await fetch(`${OPENALGO_URL}/api/v1/platform/create-user`, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "X-Platform-Key": APP_KEY,
      },
      body: JSON.stringify({
        supabase_user_id: targetUserId,
        email:            targetEmail,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const oaData = await oaRes.json().catch(() => ({}));
    const openalgoApiKey: string  = (oaData as any)?.api_key   ?? "";
    const openalgoUsername: string = (oaData as any)?.username  ?? "";

    // If OpenAlgo returned an api_key we're good regardless of HTTP status.
    // If not, surface whatever error OpenAlgo sent back.
    if (!openalgoApiKey) {
      const detail = (oaData as any)?.error ?? `OpenAlgo responded HTTP ${oaRes.status} without an api_key`;
      console.error("admin-provision-algo: OpenAlgo create-user did not return api_key:", detail, oaData);
      return new Response(
        JSON.stringify({ error: `OpenAlgo account creation failed: ${detail}` }),
        { status: 502, headers },
      );
    }

    // ── Save to user_trading_integration ─────────────────────────────────
    const { data: integrationRow, error: upsertErr } = await supabase
      .from("user_trading_integration")
      .upsert(
        {
          user_id:           targetUserId,
          integration_type:  "openalgo",
          base_url:          OPENALGO_URL,
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

    // ── Auto-create default strategy in OpenAlgo ──────────────────────────
    // This means when the user places their first order, the strategy is already ready.
    const strategyName = (onboarding.strategy_pref ?? "ChartMate AI").toString().trim();
    try {
      const stratRes = await fetch(`${OPENALGO_URL}/api/v1/platform/create-strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Platform-Key": APP_KEY },
        body: JSON.stringify({
          username:     openalgoUsername,
          name:         strategyName,
          trading_mode: "LONG",
          is_intraday:  true,
          start_time:   "09:15",
          end_time:     "15:15",
          squareoff_time: "15:15",
          symbols:      [],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const stratData = await stratRes.json().catch(() => ({}));
      console.log(`admin-provision-algo: strategy "${strategyName}" created for ${openalgoUsername}:`, stratData);
    } catch (stratErr) {
      // Non-fatal — user can still trade, strategy creation is best-effort
      console.warn("admin-provision-algo: strategy auto-create failed (non-fatal):", stratErr);
    }

    // ── Upsert algo_user_assignments ──────────────────────────────────────
    const allowedStrategy = strategyName;
    const riskProfile     = (onboarding.risk_level ?? "medium").toString().toLowerCase();
    const { error: assignmentErr } = await supabase
      .from("algo_user_assignments")
      .upsert(
        {
          user_id:            targetUserId,
          integration_id:     integrationRow?.id ?? null,
          allowed_strategy:   allowedStrategy,
          risk_profile:       riskProfile,
          openalgo_username:  openalgoUsername,   // needed for broker OAuth callbacks
          status:             "active",
          assigned_by:        user.id,
          updated_at:         new Date().toISOString(),
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

    console.log(`admin-provision-algo: provisioned user ${targetUserId} (${targetEmail}) → OpenAlgo username: ${openalgoUsername}`);

    return new Response(
      JSON.stringify({
        success:           true,
        message:           "User provisioned successfully",
        openalgo_username: openalgoUsername,
        openalgo_created:  (oaData as any)?.created ?? true,
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
