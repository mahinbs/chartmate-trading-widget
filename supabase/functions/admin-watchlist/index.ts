import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WatchlistItemInput = {
  symbol: string;
  display_name?: string;
  timeframe?: string;
  investment?: number;
  profile?: Record<string, unknown>;
  is_active?: boolean;
};

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
  if (roleRow?.role !== "admin" && roleRow?.role !== "super_admin") {
    throw new Error("Forbidden: admin access required");
  }
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const user = await getAuthenticatedUser(req, supabaseClient);
    await assertAdmin(user.id, supabaseClient);

    if (req.method === "GET") {
      const { data, error } = await supabaseClient
        .from("admin_symbol_watchlist")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(`Failed to fetch watchlist: ${error.message}`);
      return new Response(JSON.stringify({ items: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const items: WatchlistItemInput[] = body?.items ?? [];
      if (!Array.isArray(items)) {
        return new Response(JSON.stringify({ error: "items must be an array" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (items.length > 10) {
        return new Response(JSON.stringify({ error: "Maximum 10 symbols allowed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalized = items.map((item, index) => ({
        symbol: normalizeSymbol(item.symbol),
        display_name: item.display_name?.trim() || normalizeSymbol(item.symbol),
        sort_order: index,
        timeframe: item.timeframe || "1d",
        investment: item.investment && item.investment > 0 ? item.investment : 10000,
        profile: item.profile ?? {},
        is_active: item.is_active ?? true,
        updated_by: user.id,
        created_by: user.id,
      }));

      const uniqueSymbols = new Set(normalized.map((i) => i.symbol));
      if (uniqueSymbols.size !== normalized.length) {
        return new Response(JSON.stringify({ error: "Duplicate symbols are not allowed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteError } = await supabaseClient
        .from("admin_symbol_watchlist")
        .delete()
        .not("id", "is", null);
      if (deleteError) throw new Error(`Failed to replace watchlist: ${deleteError.message}`);

      if (normalized.length > 0) {
        const { error: insertError } = await supabaseClient.from("admin_symbol_watchlist").insert(normalized);
        if (insertError) throw new Error(`Failed to save watchlist: ${insertError.message}`);
      }

      const { data, error } = await supabaseClient
        .from("admin_symbol_watchlist")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(`Failed to fetch saved watchlist: ${error.message}`);

      return new Response(JSON.stringify({ success: true, items: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message ?? "Internal server error" }), {
      status: error.message?.includes("Forbidden") ? 403 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
