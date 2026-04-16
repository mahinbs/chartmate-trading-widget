import { supabase } from "@/integrations/supabase/client";

export type FunnelEventName =
  | "landing_view"
  | "signup_start"
  | "signup_complete"
  | "batch_select"
  | "webinar_register"
  | "email_sent"
  | "webinar_attend"
  | "demo_booked"
  | "plan_purchased"
  | "ra_marketplace_view"
  | "ra_card_click"
  | "ra_profile_view"
  | "strategy_cta_click"
  | "strategy_checkout_start"
  | "strategy_purchase_intent";

function getOrCreateAnonId(): string {
  const key = "funnel_anon_id_v1";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `anon-${Date.now()}`;
  }
}

export function getUtmPayload() {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  return {
    utm_source: p.get("utm_source"),
    utm_medium: p.get("utm_medium"),
    utm_campaign: p.get("utm_campaign"),
    utm_content: p.get("utm_content"),
    utm_term: p.get("utm_term"),
    referrer: document.referrer || null,
  };
}

export async function trackFunnelEvent(
  eventName: FunnelEventName,
  metadata: Record<string, unknown> = {},
  userId?: string | null,
) {
  const anonId = getOrCreateAnonId();
  const path = window.location.pathname + window.location.search;
  const utm = getUtmPayload();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table is migration-backed
  await (supabase as any).from("funnel_events").insert([
    {
      user_id: userId ?? null,
      anon_id: anonId,
      event_name: eventName,
      path,
      utm_json: utm,
      metadata_json: metadata,
    },
  ]);
}
