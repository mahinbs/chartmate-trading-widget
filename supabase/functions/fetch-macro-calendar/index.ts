/**
 * fetch-macro-calendar — Daily high-impact IN/US events for ORB pre-event block.
 * Scheduled via pg_cron (e.g. 08:00 UTC). Upserts public.macro_events_today.
 *
 * Auth: X-Cron-Secret must match env CRON_SECRET (if set) OR service role via internal call.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const FF_JSON_PRIMARY =
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FF_JSON_ALT = "https://www.forexfactory.com/calendar.json";

type FfEvent = {
  date?: string;
  time?: string;
  country?: string;
  title?: string;
  impactName?: string;
  impact?: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Cron-Secret, Authorization",
};

function parseFfDateToIso(d: string | undefined): string | null {
  if (!d || typeof d !== "string") return null;
  // "Sun Apr 23 2023" or ISO
  const tryIso = Date.parse(d);
  if (Number.isFinite(tryIso)) {
    return new Date(tryIso).toISOString().slice(0, 10);
  }
  return null;
}

function impactRank(s: string | undefined): number {
  const u = (s ?? "").toLowerCase();
  if (u.includes("high")) return 3;
  if (u.includes("medium")) return 2;
  if (u.includes("low")) return 1;
  return 0;
}

/** Parse "8:15am" / "2:00pm" / "14:00" → HH:MM in UTC (calendar JSON often stores local — treat as best-effort UTC for window gate) */
function timeToTimeString(raw: string | undefined): string | null {
  if (!raw || raw === "All Day" || raw === "Tentative" || /^\s*\d+:\d+/.test(String(raw)) === false) {
    if (raw && /^\d{1,2}:\d{2}/.test(String(raw).trim())) {
      const p = String(raw).trim();
      return p.length >= 5 ? p.slice(0, 5) : null;
    }
    return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (CRON_SECRET && req.headers.get("X-Cron-Secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!SUPABASE_URL || !SRK) {
    return new Response(JSON.stringify({ error: "Missing env" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SRK);
  const todayUtc = new Date().toISOString().slice(0, 10);

  let events: FfEvent[] = [];
  for (const url of [FF_JSON_PRIMARY, FF_JSON_ALT]) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "ChartMateMacroBot/1.0", "Accept": "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      const list = Array.isArray(j) ? j : (Array.isArray(j?.events) ? j.events : null);
      if (Array.isArray(list) && list.length) {
        events = list as FfEvent[];
        break;
      }
    } catch { /* try next */ }
  }

  const rows: Array<{
    event_date: string;
    event_time_utc: string | null;
    title: string;
    impact: string;
    source: string;
  }> = [];

  for (const e of events) {
    const country = String(e.country ?? "").toUpperCase();
    if (country !== "IN" && country !== "US" && country !== "USD" && country !== "INR") {
      if (!/india|united states|u\.s\./i.test(String(e.title ?? ""))) continue;
    }
    const im = (e.impactName ?? e.impact ?? "").toString();
    if (impactRank(im) < 3) continue;
    const dkey = parseFfDateToIso(e.date) ?? todayUtc;
    if (dkey !== todayUtc) continue;
    const timeStr = timeToTimeString(e.time) ?? "12:00";
    rows.push({
      event_date: dkey,
      event_time_utc: timeStr,
      title: String(e.title ?? "Event").slice(0, 500),
      impact: "high",
      source: "forexfactory",
    });
  }

  // Replace today's rows (idempotent re-run)
  await supabase.from("macro_events_today").delete().eq("event_date", todayUtc);

  if (rows.length) {
    const { error } = await supabase.from("macro_events_today").insert(rows);
    if (error) {
      return new Response(JSON.stringify({ error: error.message, inserted: 0 }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, date: todayUtc, inserted: rows.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
