import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RoleRow = { user_id: string; role: string };

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
  const hasAdminRole = roleRow?.role === "admin";
  if (!hasAdminRole) throw new Error("Forbidden: admin access required");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
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

    const user = await getAuthenticatedUser(req, supabaseClient);
    await assertAdmin(user.id, supabaseClient);

    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const perPage = Number(url.searchParams.get("perPage") ?? "50");

    const { data: authUsers, error: listError } = await supabaseClient.auth.admin.listUsers({ page, perPage });
    if (listError) throw new Error(`Failed to fetch users: ${listError.message}`);

    const userIds = (authUsers?.users ?? []).map((u) => u.id);
    let rolesByUserId = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: rolesData, error: rolesError } = await supabaseClient
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      if (rolesError) throw new Error(`Failed to fetch roles: ${rolesError.message}`);
      rolesByUserId = new Map((rolesData as RoleRow[]).map((r) => [r.user_id, r.role]));
    }

    const users = (authUsers?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      role: rolesByUserId.get(u.id) ?? "user",
    }));

    return new Response(JSON.stringify({ users, page, perPage, total: authUsers?.total ?? users.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message ?? "Internal server error" }), {
      status: error.message?.includes("Forbidden") ? 403 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
