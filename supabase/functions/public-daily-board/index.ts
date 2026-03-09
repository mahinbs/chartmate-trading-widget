import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NOTE: This function intentionally does NOT require auth.
// The daily predictions board is meant to be publicly visible to all users.

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

    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    let targetDate = date;
    if (!targetDate) {
      const { data: latestRow, error: latestError } = await supabaseClient
        .from("daily_predictions_board")
        .select("generated_for_date")
        .eq("is_active", true)
        .order("generated_for_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw new Error(`Failed to find latest board date: ${latestError.message}`);
      targetDate = latestRow?.generated_for_date ?? new Date().toISOString().slice(0, 10);
    }

    const { data, error } = await supabaseClient
      .from("daily_predictions_board")
      .select("*")
      .eq("generated_for_date", targetDate)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`Failed to fetch board rows: ${error.message}`);

    return new Response(JSON.stringify({ date: targetDate, rows: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message ?? "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
