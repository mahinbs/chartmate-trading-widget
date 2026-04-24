/**
 * Starts a 14-day Pro trial (user_subscriptions only — no Stripe, no card).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
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
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const { data: row, error: selErr } = await supabase
      .from("user_subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (selErr) {
      console.error("start-pro-trial select:", selErr);
      return new Response(JSON.stringify({ error: "Could not read subscription" }), {
        status: 500,
        headers,
      });
    }

    const s = (row as { status?: string } | null)?.status;
    if (
      s === "active" ||
      s === "trialing" ||
      s === "pro_trial" ||
      s === "past_due" ||
      s === "incomplete"
    ) {
      return new Response(
        JSON.stringify({ error: "A subscription or Pro trial is already on your account" }),
        { status: 400, headers },
      );
    }

    const end = new Date();
    end.setDate(end.getDate() + 14);
    const endIso = end.toISOString();
    const nowIso = new Date().toISOString();

    if (row) {
      const { error: upErr } = await supabase
        .from("user_subscriptions")
        .update({
          plan_id: "professionalPlan",
          status: "pro_trial",
          current_period_end: endIso,
          stripe_subscription_id: null,
          cancel_at_period_end: false,
          payment_failed_at: null,
          pending_plan_change: null,
          pending_plan_change_at: null,
          updated_at: nowIso,
        })
        .eq("user_id", user.id);
      if (upErr) {
        console.error("start-pro-trial update:", upErr);
        return new Response(JSON.stringify({ error: "Could not start trial" }), {
          status: 500,
          headers,
        });
      }
    } else {
      const { error: insErr } = await supabase.from("user_subscriptions").insert({
        user_id: user.id,
        plan_id: "professionalPlan",
        status: "pro_trial",
        current_period_end: endIso,
      });
      if (insErr) {
        console.error("start-pro-trial insert:", insErr);
        return new Response(JSON.stringify({ error: "Could not start trial" }), {
          status: 500,
          headers,
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (e) {
    console.error("start-pro-trial:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
