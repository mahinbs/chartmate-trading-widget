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

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
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
    const ownerEmail = (body.owner_email as string | undefined)?.trim().toLowerCase() ?? "";
    const slug = normalizeSlug((body.slug as string | undefined) ?? "");
    const brandName = (body.brand_name as string | undefined)?.trim() ?? "";
    const startsOn = (body.starts_on as string | undefined)?.trim() ?? "";
    const endsOn = (body.ends_on as string | undefined)?.trim() ?? "";
    const subscriptionPlan = ((body.subscription_plan as string | undefined) ?? "1_year").trim();
    const brandLogoUrl = ((body.brand_logo_url as string | undefined) ?? "").trim() || null;
    const brandPrimaryColor = ((body.brand_primary_color as string | undefined) ?? "#6366f1").trim();
    const brandTagline = ((body.brand_tagline as string | undefined) ?? "").trim() || null;

    if (!ownerEmail || !slug || !brandName || !startsOn || !endsOn) {
      return new Response(JSON.stringify({ error: "owner_email, slug, brand_name, starts_on, and ends_on are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingTenant } = await supabaseClient
      .from("white_label_tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existingTenant) {
      return new Response(JSON.stringify({ error: "Slug already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tempPassword = randomTempPassword(12);
    const { data: createdUser, error: createErr } = await supabaseClient.auth.admin.createUser({
      email: ownerEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { need_password_reset: true, full_name: brandName },
    });
    if (createErr || !createdUser.user?.id) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Failed to create owner user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerUserId = createdUser.user.id;

    const { error: roleErr } = await supabaseClient
      .from("user_roles")
      .upsert({ user_id: ownerUserId, role: "admin" }, { onConflict: "user_id" });
    if (roleErr) {
      await supabaseClient.auth.admin.deleteUser(ownerUserId);
      throw new Error(`Failed to assign admin role: ${roleErr.message}`);
    }

    // New WL tenants are created as suspended until payment is completed.
    const { data: tenant, error: tenantErr } = await supabaseClient
      .from("white_label_tenants")
      .insert({
        slug,
        brand_name: brandName,
        brand_logo_url: brandLogoUrl,
        brand_primary_color: brandPrimaryColor,
        brand_tagline: brandTagline,
        owner_user_id: ownerUserId,
        owner_email: ownerEmail,
        subscription_plan: subscriptionPlan,
        starts_on: startsOn,
        ends_on: endsOn,
        status: "suspended",
      })
      .select("id, slug")
      .single();

    if (tenantErr || !tenant) {
      await supabaseClient.from("user_roles").delete().eq("user_id", ownerUserId);
      await supabaseClient.auth.admin.deleteUser(ownerUserId);
      throw new Error(tenantErr?.message ?? "Failed to create tenant");
    }

    const { error: membershipErr } = await supabaseClient
      .from("white_label_tenant_users")
      .upsert(
        {
          tenant_id: tenant.id,
          user_id: ownerUserId,
          role: "admin",
          status: "active",
        },
        { onConflict: "tenant_id,user_id" },
      );

    if (membershipErr) {
      await supabaseClient.from("white_label_tenants").delete().eq("id", tenant.id);
      await supabaseClient.from("user_roles").delete().eq("user_id", ownerUserId);
      await supabaseClient.auth.admin.deleteUser(ownerUserId);
      throw new Error(`Failed to create tenant membership: ${membershipErr.message}`);
    }

    return new Response(
      JSON.stringify({
        tenant_id: tenant.id,
        slug: tenant.slug,
        email: ownerEmail,
        temp_password: tempPassword,
        message: "Tenant owner created. Share temporary password; they must reset it on first login.",
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
