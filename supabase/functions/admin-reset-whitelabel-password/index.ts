import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomTempPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += chars[bytes[i]! % chars.length];
  return out;
}

async function getAuthenticatedUser(req: Request, supabaseClient: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization header");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired token");
  return data.user;
}

async function assertSuperAdmin(userId: string, supabaseClient: ReturnType<typeof createClient>) {
  const { data: roleRow, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to validate role: ${error.message}`);
  if (roleRow?.role !== "super_admin") throw new Error("Forbidden: super-admin only");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const adminUser = await getAuthenticatedUser(req, supabaseClient);
    await assertSuperAdmin(adminUser.id, supabaseClient);

    const body = await req.json().catch(() => ({}));
    const tenantId = (body.tenant_id as string | undefined)?.trim();
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant, error: tenantErr } = await supabaseClient
      .from("white_label_tenants")
      .select("owner_user_id, owner_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantErr) throw new Error(tenantErr.message);
    if (!tenant?.owner_user_id) {
      return new Response(JSON.stringify({ error: "Tenant owner user not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tempPassword = randomTempPassword(12);
    const { error: updErr } = await supabaseClient.auth.admin.updateUserById(tenant.owner_user_id, {
      password: tempPassword,
      user_metadata: { need_password_reset: true },
    } as any);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        email: tenant.owner_email,
        temp_password: tempPassword,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: message.includes("Forbidden") ? 403 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
