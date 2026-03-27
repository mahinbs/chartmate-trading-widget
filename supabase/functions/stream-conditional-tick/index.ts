/**
 * stream-conditional-tick — Live path: called when OpenAlgo (or monitor) receives an LTP tick.
 * Re-evaluates pending conditional orders for that symbol only (no full-table poll).
 *
 * Auth: X-Stream-Tick-Secret must match env STREAM_TICK_SECRET (set in ChartMate monitor + Supabase secrets).
 *
 * POST { "symbol": "RELIANCE" }  // any casing / optional .NS — matching is normalized server-side
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  tryExecutePendingRow,
  type PendingConditionalRow,
} from "../_shared/pendingConditionalExecution.ts";

const STREAM_TICK_SECRET = Deno.env.get("STREAM_TICK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const ENTRY_DIGEST_SECRET = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";
const COOLDOWN_SECONDS = Math.min(Math.max(Number(Deno.env.get("STREAM_TICK_COOLDOWN_SECONDS") ?? "12"), 5), 120);

function normalizeBaseSymbol(s: string): string {
  let x = String(s ?? "").trim().toUpperCase();
  for (const suf of [".NS", ".BO", "-EQ", "-BE", "-BL"]) {
    if (x.endsWith(suf)) x = x.slice(0, -suf.length);
  }
  return x;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Stream-Tick-Secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  if (!STREAM_TICK_SECRET || req.headers.get("X-Stream-Tick-Secret") !== STREAM_TICK_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  try {
    const body = await req.json().catch(() => ({})) as { symbol?: string };
    const rawSym = String(body.symbol ?? "").trim();
    if (!rawSym) {
      return new Response(JSON.stringify({ error: "symbol is required" }), { status: 400, headers });
    }
    const base = normalizeBaseSymbol(rawSym);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();
    await supabase
      .from("pending_conditional_orders")
      .update({ status: "expired", error_message: "Expired before conditions matched" })
      .eq("status", "pending")
      .lt("expires_at", nowIso);

    const { data: pending, error: fetchErr } = await supabase
      .from("pending_conditional_orders")
      .select("id, user_id, strategy_id, symbol, exchange, action, quantity, product, paper_strategy_type, created_at, expires_at, deploy_overrides")
      .eq("status", "pending")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(80);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers });
    }

    const rows = (pending ?? []).filter((r) => normalizeBaseSymbol(r.symbol) === base) as PendingConditionalRow[];

    const localFireGuard = new Map<string, number>();
    const results: Record<string, string> = {};
    let fired = 0;

    for (const row of rows) {
      const outcome = await tryExecutePendingRow(supabase, row, {
        supabaseUrl: SUPABASE_URL,
        openalgoUrl: OPENALGO_URL,
        entryDigestSecret: ENTRY_DIGEST_SECRET,
        localFireGuard,
        cooldownSeconds: COOLDOWN_SECONDS,
      });
      results[row.id] = outcome;
      if (outcome === "fired") fired += 1;
    }

    return new Response(JSON.stringify({
      ok: true,
      symbol: rawSym,
      base,
      checked: rows.length,
      fired,
      results,
    }), { status: 200, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("stream-conditional-tick:", e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});
