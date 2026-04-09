import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Best-effort client IP for Supabase Edge (browser → functions) or chain invoke.
 * Prefer the leftmost X-Forwarded-For hop; also check headers some proxies set.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  for (const h of ["cf-connecting-ip", "true-client-ip", "fly-client-ip"]) {
    const v = req.headers.get(h);
    if (v?.trim()) return v.trim();
  }
  const xri = req.headers.get("x-real-ip");
  if (xri?.trim()) return xri.trim();
  const fwd = req.headers.get("forwarded");
  if (fwd) {
    const m = fwd.match(/for=\s*"?([^";,\s]+)/i);
    if (m?.[1]) return m[1].replace(/^::ffff:/i, "").trim();
  }
  return "unknown";
}

/**
 * Latest affiliate link visit for this IP (affiliate_visitors row).
 * Shared NAT can mis-attribute; last ?ref= visit wins.
 */
export async function resolveAffiliateIdFromVisitorIp(
  supabase: SupabaseClient,
  clientIp: string,
): Promise<{ affiliateId: string; region?: string; city?: string; country_code?: string; country_name?: string } | null> {
  if (!clientIp || clientIp === "unknown") return null;

  const { data: rows, error } = await supabase
    .from("affiliate_visitors")
    .select("affiliate_id, region, city, country_code, country_name")
    .eq("visitor_ip", clientIp)
    .order("visited_at", { ascending: false })
    .limit(8);

  if (error || !rows?.length) return null;

  for (const row of rows) {
    const aid = (row as any).affiliate_id;
    if (!aid) continue;
    const { data: aff } = await supabase
      .from("affiliates")
      .select("id")
      .eq("id", aid)
      .eq("is_active", true)
      .maybeSingle();
    
    if (aff?.id) {
      return {
        affiliateId: aff.id as string,
        region: (row as any).region,
        city: (row as any).city,
        country_code: (row as any).country_code,
        country_name: (row as any).country_name,
      };
    }
  }
  return null;
}

/** First-touch: only set affiliate when profile has none (signup ref or prior sync wins). */
export async function applyAffiliateToUserProfileIfEmpty(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null | undefined,
  affiliateId: string,
  geo?: { region?: string; city?: string; country_code?: string; country_name?: string }
): Promise<void> {
  const { data: prof } = await supabase
    .from("user_signup_profiles")
    .select("user_id, affiliate_id, referral_code_at_signup")
    .eq("user_id", userId)
    .maybeSingle();

  if (prof?.affiliate_id) return;

  const { data: aff } = await supabase
    .from("affiliates")
    .select("code")
    .eq("id", affiliateId)
    .eq("is_active", true)
    .maybeSingle();
  const code = (aff as { code?: string } | null)?.code;

  const now = new Date().toISOString();

  if (prof?.user_id) {
    const patch: Record<string, unknown> = {
      affiliate_id: affiliateId,
      updated_at: now,
      region: geo?.region,
      city: geo?.city,
      country_code: geo?.country_code
    };
    if (code && !(prof as { referral_code_at_signup?: string | null }).referral_code_at_signup) {
      patch.referral_code_at_signup = code;
    }
    await supabase.from("user_signup_profiles").update(patch).eq("user_id", userId).is("affiliate_id", null);
  } else {
    const { error: insErr } = await supabase.from("user_signup_profiles").insert({
      user_id: userId,
      email: userEmail ?? null,
      full_name: "",
      affiliate_id: affiliateId,
      referral_code_at_signup: code ?? null,
      region: geo?.region || null,
      city: geo?.city || null,
      country_code: geo?.country_code || null
    });
    if (insErr?.code === "23505") {
      const patch: Record<string, unknown> = {
        affiliate_id: affiliateId,
        updated_at: now,
        region: geo?.region,
        city: geo?.city,
        country_code: geo?.country_code
      };
      if (code) patch.referral_code_at_signup = code;
      await supabase.from("user_signup_profiles").update(patch).eq("user_id", userId).is("affiliate_id", null);
    }
  }

  // Trigger Notification for New Referral
  const { data: affUser } = await supabase
    .from("affiliates")
    .select("user_id")
    .eq("id", affiliateId)
    .single();

  if (affUser?.user_id) {
    await supabase.from("affiliate_notifications").insert({
      user_id: affUser.user_id,
      type: "referral",
      title: "New Referral!",
      message: `A new user (${userEmail || "anonymous"}) has joined using your link.`
    });
  }
}
