import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BoardRow = {
  symbol: string;
  display_name: string | null;
  sort_order: number;
  timeframe: string;
  investment: number;
  profile: Record<string, unknown>;
};

type AuthContext = { userId: string | null; email: string | null; isServiceRole: boolean };

function parseTimeframeMinutes(timeframe: string): number {
  const match = /^(\d+)(m|h|d|w)$/i.exec((timeframe || "1d").trim());
  if (!match) return 1440;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "m") return value;
  if (unit === "h") return value * 60;
  if (unit === "d") return value * 1440;
  return value * 10080;
}

function computeExpiryIso(timeframe: string): string {
  const minutes = parseTimeframeMinutes(timeframe);
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeProbability(raw: unknown): number | null {
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  return raw <= 1 ? Number((raw * 100).toFixed(2)) : Number(raw.toFixed(2));
}

async function getAuthContext(req: Request, supabaseClient: ReturnType<typeof createClient>): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization header");
  const token = authHeader.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (token && token === serviceRoleKey) return { userId: null, email: null, isServiceRole: true };
  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired token");
  return { userId: data.user.id, email: data.user.email ?? null, isServiceRole: false };
}

async function assertAdmin(auth: AuthContext, supabaseClient: ReturnType<typeof createClient>) {
  if (auth.isServiceRole) return;
  const { data: roleRow, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to validate role: ${error.message}`);
  const hasAdminRole = roleRow?.role === "admin";
  if (!hasAdminRole) throw new Error("Forbidden: admin access required");
}

async function callPredictMovement(symbol: string, timeframe: string, investment: number, profile: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const horizons = [parseTimeframeMinutes(timeframe), 240, 1440, 10080];
  const response = await fetch(`${supabaseUrl}/functions/v1/predict-movement`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
    body: JSON.stringify({ symbol, investment, timeframe, horizons, ...profile }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || `predict-movement failed for ${symbol}`);
  return payload;
}

async function generateBoardRows(rows: BoardRow[], generatedForDate: string, generatedBy: string | null, refreshReason: "manual" | "expiry" | "daily" | "auto") {
  const generatedRows = [];
  for (const row of rows) {
    const prediction = await callPredictMovement(row.symbol, row.timeframe || "1d", Number(row.investment || 10000), row.profile || {});
    const forecast = prediction?.geminiForecast?.forecasts?.[0];
    const probabilities = forecast?.probabilities || {};
    const maxProbability = Math.max(Number(probabilities.up ?? 0), Number(probabilities.down ?? 0), Number(probabilities.sideways ?? 0));
    generatedRows.push({
      generated_for_date: generatedForDate,
      symbol: row.symbol,
      display_name: row.display_name || row.symbol,
      sort_order: row.sort_order,
      timeframe: row.timeframe || "1d",
      investment: Number(row.investment || 10000),
      profile: row.profile || {},
      prediction_payload: prediction,
      probability_score: normalizeProbability(maxProbability),
      action_signal: prediction?.geminiForecast?.action_signal?.action || null,
      expires_at: computeExpiryIso(row.timeframe || "1d"),
      generated_by: generatedBy,
      refresh_reason: refreshReason,
      is_active: true,
      generated_at: new Date().toISOString(),
    });
  }
  return generatedRows;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const auth = await getAuthContext(req, supabaseClient);
    await assertAdmin(auth, supabaseClient);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const date = url.searchParams.get("date");
      let query = supabaseClient.from("daily_predictions_board").select("*").order("generated_for_date", { ascending: false }).order("sort_order", { ascending: true });
      if (date) query = query.eq("generated_for_date", date);
      const { data, error } = await query.limit(200);
      if (error) throw new Error(`Failed to fetch board: ${error.message}`);
      return new Response(JSON.stringify({ rows: data ?? [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action || "generate";
    const generatedForDate = body?.date || todayUtcDate();

    if (action === "generate" || action === "daily") {
      const { data: watchlist, error } = await supabaseClient
        .from("admin_symbol_watchlist")
        .select("symbol, display_name, sort_order, timeframe, investment, profile, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(10);
      if (error) throw new Error(`Failed to fetch watchlist: ${error.message}`);
      if (!watchlist || watchlist.length === 0) {
        return new Response(JSON.stringify({ message: "No active symbols in watchlist", updated: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const rows = await generateBoardRows(
        (watchlist as any[]).map((r) => ({ symbol: r.symbol, display_name: r.display_name, sort_order: r.sort_order, timeframe: r.timeframe, investment: Number(r.investment), profile: r.profile || {} })),
        generatedForDate,
        auth.userId,
        action === "daily" ? "daily" : "manual",
      );
      const { error: upsertError } = await supabaseClient.from("daily_predictions_board").upsert(rows, { onConflict: "generated_for_date,symbol" });
      if (upsertError) throw new Error(`Failed to upsert board rows: ${upsertError.message}`);
      return new Response(JSON.stringify({ success: true, action, generatedForDate, updated: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "refresh_expired") {
      const { data: expiredRows, error: expiredError } = await supabaseClient
        .from("daily_predictions_board")
        .select("symbol, display_name, sort_order, timeframe, investment, profile")
        .eq("generated_for_date", generatedForDate)
        .eq("is_active", true)
        .lte("expires_at", new Date().toISOString())
        .order("sort_order", { ascending: true });
      if (expiredError) throw new Error(`Failed to fetch expired rows: ${expiredError.message}`);
      if (!expiredRows || expiredRows.length === 0) {
        return new Response(JSON.stringify({ success: true, action, generatedForDate, updated: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const rows = await generateBoardRows(expiredRows as any, generatedForDate, auth.userId, "expiry");
      const { error: upsertError } = await supabaseClient.from("daily_predictions_board").upsert(rows, { onConflict: "generated_for_date,symbol" });
      if (upsertError) throw new Error(`Failed to refresh rows: ${upsertError.message}`);
      return new Response(JSON.stringify({ success: true, action, generatedForDate, updated: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message ?? "Internal server error" }), {
      status: error.message?.includes("Forbidden") ? 403 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
