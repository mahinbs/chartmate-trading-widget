import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "list").toLowerCase();

    if (action === "detail") {
      const id = String(body.id ?? "");
      if (!id) return new Response(JSON.stringify({ error: "id is required" }), { status: 400, headers });

      const { data, error } = await supabase
        .from("strategy_scan_history")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 404, headers });
      return new Response(JSON.stringify({ item: data }), { status: 200, headers });
    }

    if (action === "delete") {
      const id = String(body.id ?? "");
      if (!id) return new Response(JSON.stringify({ error: "id is required" }), { status: 400, headers });

      const { data: deletedRows, error } = await supabase
        .from("strategy_scan_history")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id");
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      }
      if (!deletedRows?.length) {
        return new Response(JSON.stringify({ error: "Not found or already removed" }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    const page = Math.max(1, Number(body.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(body.pageSize) || 10));
    const symbol = String(body.symbol ?? "").trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("strategy_scan_history")
      .select("id,symbol,scan_started_at,scan_completed_at,signal_count,live_count,predicted_count,data_source,indicator_source,asset_type,created_at", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (symbol) query = query.eq("symbol", symbol);

    const { data, error, count } = await query;
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });

    return new Response(JSON.stringify({
      items: data ?? [],
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    }), { status: 200, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});

