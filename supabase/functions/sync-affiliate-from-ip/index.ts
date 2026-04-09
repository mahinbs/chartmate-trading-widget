/**
 * sync-affiliate-from-ip — call once after login (same IP as record-affiliate-visit).
 * If user has no affiliate on user_signup_profiles, attach latest affiliate for this IP.
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyAffiliateToUserProfileIfEmpty, getClientIp, resolveAffiliateIdFromVisitorIp } from "shared/affiliate-ip-resolution.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { data: prof } = await supabase.from("user_signup_profiles").select("affiliate_id").eq("user_id", user.id).maybeSingle();
    if (prof?.affiliate_id) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: "already_attributed"
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const metaAff = user.user_metadata?.affiliate_id;
    if (typeof metaAff === "string" && metaAff.trim()) {
      const { data: affOk } = await supabase.from("affiliates").select("id").eq("id", metaAff.trim()).eq("is_active", true).maybeSingle();
      if (affOk?.id) {
        await applyAffiliateToUserProfileIfEmpty(supabase, user.id, user.email, affOk.id);
        return new Response(JSON.stringify({
          ok: true,
          source: "metadata"
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }
    const ip = getClientIp(req);
    const fromIp = await resolveAffiliateIdFromVisitorIp(supabase, ip);
    if (!fromIp) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: "no_visitor_match"
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    await applyAffiliateToUserProfileIfEmpty(supabase, user.id, user.email, fromIp);
    return new Response(JSON.stringify({
      ok: true,
      source: "visitor_ip"
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    console.error("sync-affiliate-from-ip:", e);
    return new Response(JSON.stringify({
      error: "Internal error"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
