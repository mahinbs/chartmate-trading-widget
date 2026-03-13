import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

type AlgoRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  broker: string;
  broker_client_id: string | null;
  capital_amount: number | null;
  risk_level: string;
  strategy_pref: string | null;
  notes: string | null;
  plan_id: string;
  status: string;
  provisioned_at: string | null;
  created_at: string;
  tenant_id?: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

    const body = await req.json().catch(() => ({} as { tenant_id?: string }));
    const tenantFilter = (body.tenant_id ?? "").trim() || null;

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = (roleRow?.role as string | undefined) ?? "user";
    const isSuperAdmin = role === "super_admin";
    const isTenantAdmin = role === "admin";
    if (!isSuperAdmin && !isTenantAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
    }

    let scopedTenantIds: string[] = [];
    if (isTenantAdmin) {
      const { data: tenantAdminRows } = await supabase
        .from("white_label_tenant_users")
        .select("tenant_id")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .eq("status", "active");
      scopedTenantIds = (tenantAdminRows ?? []).map((r: any) => r.tenant_id).filter(Boolean);
      if (scopedTenantIds.length === 0) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200, headers });
      }
    }

    if (tenantFilter) {
      if (isTenantAdmin && !scopedTenantIds.includes(tenantFilter)) {
        return new Response(JSON.stringify({ error: "Forbidden tenant scope" }), { status: 403, headers });
      }
      if (isSuperAdmin) scopedTenantIds = [tenantFilter];
      if (isTenantAdmin) scopedTenantIds = [tenantFilter];
    }

    let rows: AlgoRow[] = [];
    if (isSuperAdmin && scopedTenantIds.length === 0) {
      const { data } = await supabase
        .from("algo_onboarding")
        .select("*")
        .order("created_at", { ascending: false });
      rows = (data ?? []) as AlgoRow[];
    } else {
      const { data: members } = await supabase
        .from("white_label_tenant_users")
        .select("tenant_id,user_id")
        .in("tenant_id", scopedTenantIds)
        .eq("status", "active");
      const userIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id).filter(Boolean)));
      if (userIds.length === 0) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200, headers });
      }

      const { data: onboarding } = await supabase
        .from("algo_onboarding")
        .select("*")
        .in("user_id", userIds)
        .order("created_at", { ascending: false });
      rows = (onboarding ?? []) as AlgoRow[];
    }

    if (rows.length > 0) {
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: memberships } = await supabase
        .from("white_label_tenant_users")
        .select("tenant_id,user_id")
        .in("user_id", userIds)
        .eq("status", "active");
      const tenantByUser = new Map<string, string>();
      (memberships ?? []).forEach((m: any) => {
        if (!tenantByUser.has(m.user_id)) tenantByUser.set(m.user_id, m.tenant_id);
      });
      rows = rows.map((r) => ({ ...r, tenant_id: tenantByUser.get(r.user_id) ?? null }));
    }

    return new Response(JSON.stringify({ rows }), { status: 200, headers });
  } catch (e) {
    console.error("get-algo-requests error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
