import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri;
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  return "unknown";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let ref: string | null = null;
    let utms: Record<string, string | null> = {
      source: null,
      medium: null,
      campaign: null,
      term: null,
      content: null,
    };
    let referrer: string | null = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      ref = body?.ref ?? null;
      utms = {
        source: body?.utm_source ?? null,
        medium: body?.utm_medium ?? null,
        campaign: body?.utm_campaign ?? null,
        term: body?.utm_term ?? null,
        content: body?.utm_content ?? null,
      };
      referrer = body?.referrer ?? null;
    } else {
      const url = new URL(req.url);
      ref = url.searchParams.get("ref");
      utms = {
        source: url.searchParams.get("utm_source"),
        medium: url.searchParams.get("utm_medium"),
        campaign: url.searchParams.get("utm_campaign"),
        term: url.searchParams.get("utm_term"),
        content: url.searchParams.get("utm_content"),
      };
      referrer = req.headers.get("referer");
    }

    if (!ref || typeof ref !== "string" || !ref.trim()) {
      return new Response(JSON.stringify({ error: "Missing ref" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code = ref.trim();
    const visitorIp = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? null;

    const city = req.headers.get("cf-ipcity") ?? null;
    const region = req.headers.get("cf-region") ?? null;
    const country = req.headers.get("cf-ipcountry") ?? null;

    const getDeviceType = (ua: string | null): string => {
      if (!ua) return "unknown";
      const ual = ua.toLowerCase();
      if (ual.includes("mobile") || ual.includes("android") || ual.includes("iphone") || ual.includes("ipad")) {
        return "mobile";
      }
      if (ual.includes("tablet") || ual.includes("ipad")) return "tablet";
      return "desktop";
    };

    const getBrowser = (ua: string | null): string => {
      if (!ua) return "unknown";
      const ual = ua.toLowerCase();
      if (ual.includes("edg/")) return "Edge";
      if (ual.includes("chrome/")) return "Chrome";
      if (ual.includes("firefox/")) return "Firefox";
      if (ual.includes("safari/") && !ual.includes("chrome/")) return "Safari";
      if (ual.includes("opera/") || ual.includes("opr/")) return "Opera";
      return "Other";
    };

    const deviceType = getDeviceType(userAgent);
    const browser = getBrowser(userAgent);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: affiliate, error: affiliateError } = await supabase
      .from("affiliates")
      .select("id, user_id")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (affiliateError || !affiliate) {
      return new Response(JSON.stringify({ error: "Invalid or inactive affiliate code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertError } = await supabase.from("affiliate_visitors").insert({
      affiliate_id: affiliate.id,
      visitor_ip: visitorIp,
      user_agent: userAgent,
      device_type: deviceType,
      browser: browser,
      city: city,
      region: region,
      country: country,
      utm_source: utms.source,
      utm_medium: utms.medium,
      utm_campaign: utms.campaign,
      utm_term: utms.term,
      utm_content: utms.content,
      referrer: referrer,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ ok: true, status: "already_recorded" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertError;
    }

    if (affiliate.user_id) {
      const location = [city, country].filter(Boolean).join(", ") || "an unknown location";
      await supabase.from("affiliate_notifications").insert({
        user_id: affiliate.user_id,
        type: "system",
        title: "New Click!",
        message: `Someone just visited your referral link from ${location}.`,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("record-affiliate-visit error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
