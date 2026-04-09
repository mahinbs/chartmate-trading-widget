import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getClientIp } from "shared/affiliate-ip-resolution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeSource(referrer: string | null, userAgent: string | null, utmSource: string | null): string {
  if (utmSource?.trim()) return utmSource.trim();
  const ua = (userAgent || "").toLowerCase();
  const ref = (referrer || "").toLowerCase();
  if (ua.includes("whatsapp")) return "whatsapp";
  if (ua.includes("instagram")) return "instagram";
  if (ua.includes("telegram")) return "telegram";
  if (ua.includes("facebook") || ref.includes("facebook.com") || ref.includes("fb.com")) return "facebook";
  if (ref.includes("google.")) return "google";
  if (ref.includes("bing.")) return "bing";
  if (ref.includes("t.co") || ref.includes("twitter.com") || ref.includes("x.com")) return "x";
  if (!ref) return "direct";
  try {
    const host = new URL(referrer || "").hostname;
    return host || "direct";
  } catch {
    return ref || "direct";
  }
}

function getDeviceType(ua: string | null): string {
  if (!ua) return "unknown";
  const ual = ua.toLowerCase();
  if (ual.includes("ipad") || ual.includes("tablet")) return "tablet";
  if (ual.includes("mobile") || ual.includes("android") || ual.includes("iphone")) return "mobile";
  if (ual.includes("smart-tv") || ual.includes("tv")) return "tv";
  if (ual.includes("bot") || ual.includes("spider") || ual.includes("crawler")) return "bot";
  return "desktop";
}

function getBrowser(ua: string | null): string {
  if (!ua) return "unknown";
  const ual = ua.toLowerCase();
  if (ual.includes("whatsapp")) return "WhatsApp In-App";
  if (ual.includes("instagram")) return "Instagram In-App";
  if (ual.includes("telegram")) return "Telegram In-App";
  if (ual.includes("edg/")) return "Edge";
  if (ual.includes("opr/") || ual.includes("opera")) return "Opera";
  if (ual.includes("firefox/")) return "Firefox";
  if (ual.includes("chrome/") && !ual.includes("edg/") && !ual.includes("opr/")) return "Chrome";
  if (ual.includes("safari/") && !ual.includes("chrome/")) return "Safari";
  if (ual.includes("brave/")) return "Brave";
  return "Other";
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

    // Supabase Edge Functions often provide location data in headers
    let city = req.headers.get("x-vercel-ip-city") || req.headers.get("cf-ipcity") || null;
    let region = req.headers.get("x-vercel-ip-country-region") || req.headers.get("cf-region") || null;
    let countryCode = req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry") || null;
    let countryName: string | null = null;

    console.log(`Visit received. IP: ${visitorIp}, Initial Geo: ${city}, ${region}, ${countryCode}`);

    // Normalize localhost for lookup
    const lookupIp = (visitorIp === "127.0.0.1" || visitorIp === "::1" || visitorIp === "unknown") ? "8.8.8.8" : visitorIp;

    if (!city || !region || !countryCode) {
      console.log(`Performing fallback geolocation lookup for IP: ${lookupIp}`);
      try {
        const geoController = new AbortController();
        const geoTimeout = setTimeout(() => geoController.abort(), 4000);

        let geoData: Record<string, string> | null = null;

        // Try Primary: ipapi.co
        try {
          const res = await fetch(`https://ipapi.co/${lookupIp}/json/`, { signal: geoController.signal });
          if (res.ok) {
            const data: any = await res.json();
            // ipapi returns HTTP 200 with { error: true } for rate limits / bad IP
            if (!data?.error && data?.country_code) {
              geoData = data;
              console.log("ipapi.co resolved location:", data.city, data.country_code);
            } else {
              console.log("ipapi.co unusable response:", data?.reason || data?.error);
            }
          } else {
            console.log("ipapi.co returned status:", res.status);
          }
        } catch (e) {
          console.log("Primary geo lookup (ipapi.co) failed/timed out:", e.message);
        }

        // Try Fallback: ip-api.com (if primary failed)
        if (!geoData) {
          try {
            const res = await fetch(`http://ip-api.com/json/${lookupIp}`, { signal: geoController.signal });
            if (res.ok) {
              const data: any = await res.json();
              if (data.status === "success") {
                geoData = {
                  city: data.city,
                  region: data.regionName,
                  country_code: data.countryCode,
                  country_name: data.country
                };
                console.log("ip-api.com resolved location:", data.city, data.countryCode);
              }
            }
          } catch (e) {
            console.log("Fallback geo lookup (ip-api.com) failed/timed out:", e.message);
          }
        }

        clearTimeout(geoTimeout);

        if (geoData) {
          city = city || geoData.city || "Unknown";
          region = region || geoData.region || geoData.region_code || "Unknown";
          countryCode = countryCode || geoData.country_code || "Unknown";
          countryName = geoData.country_name || "Unknown";
        } else {
          console.log("All geolocation services failed to resolve data for IP:", lookupIp);
          city = city || "Unknown";
          region = region || "Unknown";
          countryCode = countryCode || "Unknown";
        }
      } catch (geoError) {
        console.log("Geolocation logic threw fatal error:", geoError.message);
        city = city || "Unknown";
        region = region || "Unknown";
        countryCode = countryCode || "Unknown";
      }
    }

    const deviceType = getDeviceType(userAgent);
    const browser = getBrowser(userAgent);
    const source = normalizeSource(referrer, userAgent, utms.source);

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

    const visitedAt = new Date().toISOString();
    const visitorRow = {
      affiliate_id: affiliate.id,
      visitor_ip: visitorIp,
      user_agent: userAgent,
      device_type: deviceType,
      browser: browser,
      city: city,
      region: region,
      country: countryCode, // Backward compatibility column
      country_code: countryCode,
      country_name: countryName,
      utm_source: source,
      utm_medium: utms.medium,
      utm_campaign: utms.campaign,
      utm_term: utms.term,
      utm_content: utms.content,
      referrer: referrer,
      visited_at: visitedAt,
    };

    const { data: existing } = await supabase
      .from("affiliate_visitors")
      .select("id")
      .eq("affiliate_id", affiliate.id)
      .eq("visitor_ip", visitorIp)
      .maybeSingle();

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("affiliate_visitors")
        .update(visitorRow)
        .eq("id", existing.id);
      if (updateError) throw updateError;
      return new Response(JSON.stringify({ ok: true, status: "updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertError } = await supabase.from("affiliate_visitors").insert(visitorRow);

    if (insertError?.code === "23505") {
      const { error: upAfterRace } = await supabase
        .from("affiliate_visitors")
        .update(visitorRow)
        .eq("affiliate_id", affiliate.id)
        .eq("visitor_ip", visitorIp);
      if (upAfterRace) throw upAfterRace;
      return new Response(JSON.stringify({ ok: true, status: "updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (insertError) throw insertError;

    if (affiliate.user_id) {
      const location = [city, countryCode].filter(Boolean).join(", ") || "an unknown location";
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
