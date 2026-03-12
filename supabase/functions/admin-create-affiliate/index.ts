import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

async function assertAdmin(userId: string, supabaseClient: ReturnType<typeof createClient>) {
  const { data: roleRow, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to validate role: ${error.message}`);
  if (roleRow?.role !== "admin" && roleRow?.role !== "super_admin") throw new Error("Forbidden: admin access required");
}

serve(async (req) => {
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
    await assertAdmin(adminUser.id, supabaseClient);

    const body = await req.json().catch(() => ({}));
    const { code, name, email, commission_percent } = body as {
      code?: string;
      name?: string;
      email?: string;
      commission_percent?: number;
    };

    const codeTrim = typeof code === "string" ? code.trim().toLowerCase().replace(/\s+/g, "") : "";
    const nameTrim = typeof name === "string" ? name.trim() : "";
    const emailTrim = typeof email === "string" ? email.trim() : "";

    if (!codeTrim || !nameTrim || !emailTrim) {
      return new Response(JSON.stringify({ error: "code, name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const commission = Number(commission_percent);
    const commissionPct = Number.isFinite(commission) && commission >= 0 && commission <= 100 ? commission : 10;

    const { data: existing } = await supabaseClient.from("affiliates").select("id").eq("code", codeTrim).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "Affiliate code already in use" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tempPassword = randomTempPassword(12);

    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email: emailTrim,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { need_password_reset: true, full_name: nameTrim },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "User creation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: roleError } = await supabaseClient.from("user_roles").insert({
      user_id: userId,
      role: "affiliate",
    });
    if (roleError) {
      await supabaseClient.auth.admin.deleteUser(userId);
      throw new Error(`Failed to set affiliate role: ${roleError.message}`);
    }

    const { data: affiliateRow, error: affError } = await supabaseClient
      .from("affiliates")
      .insert({
        user_id: userId,
        code: codeTrim,
        name: nameTrim,
        email: emailTrim,
        commission_percent: commissionPct,
        is_active: true,
        created_by: adminUser.id,
      })
      .select("id")
      .single();

    if (affError) {
      await supabaseClient.from("user_roles").delete().eq("user_id", userId);
      await supabaseClient.auth.admin.deleteUser(userId);
      throw new Error(`Failed to create affiliate record: ${affError.message}`);
    }

    return new Response(
      JSON.stringify({
        affiliate_id: affiliateRow?.id,
        user_id: userId,
        email: emailTrim,
        temp_password: tempPassword,
        message: "Affiliate created. Share the temporary password with the affiliate; they must change it on first login.",
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
