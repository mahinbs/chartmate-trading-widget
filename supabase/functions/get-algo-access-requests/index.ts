/**
 * Super admin: list algo_access_requests (new access wizard submissions).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    const role = (roleRow as { role?: string } | null)?.role ?? "user";
    if (role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
    }

    const { data, error } = await supabase
      .from("algo_access_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("get-algo-access-requests:", error);
      return new Response(JSON.stringify({ error: "Query failed" }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ rows: data ?? [] }), { status: 200, headers });
  } catch (e) {
    console.error("get-algo-access-requests:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
