/**
 * admin-reject-algo — Supabase Edge Function (super-admin only)
 *
 * Body: { onboarding_id: string, reason: string }
 * Marks algo_onboarding row as `rejected` and stores `rejection_reason`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Must allow OPTIONS to succeed at the gateway: set verify_jwt = false in supabase/config.toml
// for this function so preflight (no user JWT) is not rejected before the worker runs.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, Authorization, X-Client-Info, Apikey, Content-Type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    // Some clients/proxies handle 200 + body more reliably than 204 for preflight
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
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

    const body = await req.json().catch(() => ({}));
    const onboardingId = String(body.onboarding_id ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    if (!onboardingId) {
      return new Response(JSON.stringify({ error: "onboarding_id is required" }), { status: 400, headers });
    }
    if (reason.length < 3) {
      return new Response(JSON.stringify({ error: "Rejection reason is required" }), { status: 400, headers });
    }

    const { data: row, error: rowErr } = await supabase
      .from("algo_onboarding")
      .select("id, status")
      .eq("id", onboardingId)
      .maybeSingle();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Onboarding record not found" }), { status: 404, headers });
    }
    if (row.status === "provisioned" || row.status === "active") {
      return new Response(
        JSON.stringify({ error: "Cannot reject a provisioned/active onboarding" }),
        { status: 409, headers },
      );
    }

    const { error: updateErr } = await supabase
      .from("algo_onboarding")
      .update({
        status: "rejected",
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
        provisioned_at: null,
      })
      .eq("id", onboardingId);
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (err) {
    console.error("admin-reject-algo error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
