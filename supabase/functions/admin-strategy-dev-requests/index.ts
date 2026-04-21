/**
 * Super admin: list / update strategy_development_requests (algo-only custom build form).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const ALLOWED_STATUS = new Set([
  "submitted",
  "in_progress",
  "completed",
  "delivered",
  "cancelled",
]);

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
      return new Response(JSON.stringify({ error: "Forbidden: super-admin only" }), { status: 403, headers });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "list").toLowerCase();

    if (action === "list") {
      const { data: rows, error } = await supabase
        .from("strategy_development_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        console.error("admin-strategy-dev-requests list:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      }

      const list = rows ?? [];
      const uniqueIds = [...new Set(list.map((r: { user_id: string }) => r.user_id))];
      const emailById = new Map<string, string>();
      for (const uid of uniqueIds) {
        try {
          const { data: u } = await supabase.auth.admin.getUserById(uid);
          const em = u?.user?.email;
          if (em) emailById.set(uid, em);
        } catch {
          // ignore missing user
        }
      }

      const enriched = await Promise.all(
        list.map(async (r: Record<string, unknown>) => {
          const uid = String(r.user_id ?? "");
          let pdf_signed_url: string | null = null;
          const path = r.document_object_path != null ? String(r.document_object_path).trim() : "";
          if (path && path.startsWith(`${uid}/`)) {
            const { data: signed } = await supabase.storage
              .from("strategy-dev-docs")
              .createSignedUrl(path, 3600);
            pdf_signed_url = signed?.signedUrl ?? null;
          }
          return {
            ...r,
            user_email: emailById.get(uid) ?? null,
            pdf_signed_url,
          };
        }),
      );

      return new Response(JSON.stringify({ rows: enriched }), { status: 200, headers });
    }

    if (action === "update") {
      const id = String(body.id ?? "").trim();
      if (!id) {
        return new Response(JSON.stringify({ error: "id is required" }), { status: 400, headers });
      }
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.status != null) {
        const st = String(body.status).toLowerCase().trim();
        if (!ALLOWED_STATUS.has(st)) {
          return new Response(JSON.stringify({ error: "Invalid status" }), { status: 400, headers });
        }
        updates.status = st;
      }
      if (body.admin_notes !== undefined) {
        updates.admin_notes = body.admin_notes === null || body.admin_notes === ""
          ? null
          : String(body.admin_notes);
      }
      if (body.eta !== undefined) {
        const raw = String(body.eta ?? "").trim();
        updates.eta = raw === "" ? null : raw;
      }
      if (Object.keys(updates).length <= 1) {
        return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400, headers });
      }
      const { data: updated, error: upErr } = await supabase
        .from("strategy_development_requests")
        .update(updates)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers });
      }
      return new Response(JSON.stringify({ row: updated }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Unknown action; use list | update" }), {
      status: 400,
      headers,
    });
  } catch (e) {
    console.error("admin-strategy-dev-requests:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
