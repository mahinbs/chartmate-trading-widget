/**
 * store-vix-history — Daily India VIX close → public.historical_vix
 * Called by pg_cron ~15:35 IST (10:05 UTC) Mon–Fri after NSE close.
 * Auth: X-Cron-Secret must match CRON_SECRET (or empty if unset in dev).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
/** Platform OpenAlgo key for market data (same as other Edge functions) */
const OPENALGO_API_KEY = Deno.env.get("OPENALGO_API_KEY") ?? Deno.env.get("OPENALGO_APP_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Cron-Secret, Authorization",
};

type HistRow = { close?: number; c?: number; date?: string; timestamp?: string | number };

function parseRows(data: unknown): HistRow[] {
  if (Array.isArray(data)) return data as HistRow[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: HistRow[] }).data;
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (CRON_SECRET && req.headers.get("X-Cron-Secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SRK) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!OPENALGO_URL || !OPENALGO_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENALGO_URL and OPENALGO_API_KEY (or OPENALGO_APP_KEY) required" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const cal = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = cal.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  const todayIst = `${y}-${m}-${d}`;

  const url = `${OPENALGO_URL}/api/v1/history`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: OPENALGO_API_KEY,
      symbol: "INDIA VIX",
      exchange: "NSE",
      interval: "1d",
      start_date: todayIst,
      end_date: todayIst,
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: `OpenAlgo history HTTP ${res.status}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const json = await res.json();
  if (json && typeof json === "object" && (json as { status?: string }).status === "error") {
    return new Response(JSON.stringify({ error: (json as { message?: string }).message ?? "OpenAlgo error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = parseRows(json);
  let closing: number | null = null;
  for (const r of rows) {
    const c = Number(r.close ?? r.c ?? 0);
    if (Number.isFinite(c) && c > 0) closing = c;
  }

  if (closing === null) {
    return new Response(
      JSON.stringify({ error: "No VIX close in history for today", today: todayIst, rows: rows.length }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SRK);
  const { error: upErr } = await supabase.from("historical_vix").upsert(
    { trade_date: todayIst, closing_vix: closing },
    { onConflict: "trade_date" },
  );
  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, trade_date: todayIst, closing_vix: closing }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
