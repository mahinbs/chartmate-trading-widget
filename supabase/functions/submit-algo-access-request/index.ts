/**
 * Public (no JWT): submit access / onboarding application from algo-only request wizard.
 * Inserts into algo_access_requests using service role.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const full_name = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim() || null;
    const country = String(body.country ?? "").trim() || null;
    const city = String(body.city ?? "").trim() || null;
    const payload = typeof body.payload === "object" && body.payload !== null
      ? (body.payload as Record<string, unknown>)
      : {};

    if (!full_name || full_name.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid full_name" }), { status: 400, headers });
    }
    if (!email || !isEmail(email) || email.length > 320) {
      return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error } = await supabase.from("algo_access_requests").insert({
      full_name,
      email,
      phone,
      country,
      city,
      payload,
      status: "new",
    });

    if (error) {
      console.error("submit-algo-access-request insert:", error);
      return new Response(JSON.stringify({ error: "Could not save application" }), {
        status: 500,
        headers,
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (e) {
    console.error("submit-algo-access-request:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
