/**
 * stream-conditional-tick — Live path: called when OpenAlgo (or monitor) receives an LTP tick.
 * Re-evaluates pending conditional orders for that symbol only (no full-table poll).
 *
 * Auth: X-Stream-Tick-Secret must match env STREAM_TICK_SECRET (set in ChartMate monitor + Supabase secrets).
 *
 * POST { "symbol": "RELIANCE" }  // any casing / optional .NS — matching is normalized server-side
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateScheduledConditionalOrdersAndNotify } from "../_shared/activateScheduledConditionalOrders.ts";
import { tryExecutePendingRow } from "../_shared/pendingConditionalExecution.ts";
import { runRsiDivergenceTickScan } from "../_shared/rsiDivergenceTickScan.ts";
const STREAM_TICK_SECRET = Deno.env.get("STREAM_TICK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const ENTRY_DIGEST_SECRET = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";
const COOLDOWN_SECONDS = Math.min(Math.max(Number(Deno.env.get("STREAM_TICK_COOLDOWN_SECONDS") ?? "12"), 5), 120);
function normalizeBaseSymbol(s) {
  let x = String(s ?? "").trim().toUpperCase();
  for (const suf of [
    ".NS",
    ".BO",
    "-EQ",
    "-BE",
    "-BL"
  ]){
    if (x.endsWith(suf)) x = x.slice(0, -suf.length);
  }
  return x;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Stream-Tick-Secret"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders
  };
  if (!STREAM_TICK_SECRET || req.headers.get("X-Stream-Tick-Secret") !== STREAM_TICK_SECRET) {
    return new Response(JSON.stringify({
      error: "Unauthorized"
    }), {
      status: 401,
      headers
    });
  }
  try {
    const body = await req.json().catch(()=>({}));
    const rawSym = String(body.symbol ?? "").trim();
    if (!rawSym) {
      return new Response(JSON.stringify({
        error: "symbol is required"
      }), {
        status: 400,
        headers
      });
    }
    const base = normalizeBaseSymbol(rawSym);
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const nowIso = new Date().toISOString();
    await activateScheduledConditionalOrdersAndNotify(supabase, nowIso);
    await supabase.from("pending_conditional_orders").update({
      status: "expired",
      error_message: "Expired before conditions matched"
    }).eq("status", "pending").lt("expires_at", nowIso);
    const { data: pending, error: fetchErr } = await supabase.from("pending_conditional_orders").select("id, user_id, strategy_id, symbol, exchange, action, quantity, product, paper_strategy_type, is_paper_trade, created_at, expires_at, deploy_overrides, error_message").eq("status", "pending").or(`expires_at.is.null,expires_at.gt.${nowIso}`).order("created_at", {
      ascending: true
    }).limit(80);
    if (fetchErr) {
      return new Response(JSON.stringify({
        error: fetchErr.message
      }), {
        status: 500,
        headers
      });
    }
    const rows = (pending ?? []).filter((r)=>normalizeBaseSymbol(r.symbol) === base);
    const localFireGuard = new Map();
    const results = {};
    const firesPending = [];
    let fired = 0;
    for (const row of rows){
      const outcome = await tryExecutePendingRow(supabase, row, {
        supabaseUrl: SUPABASE_URL,
        openalgoUrl: OPENALGO_URL,
        entryDigestSecret: ENTRY_DIGEST_SECRET,
        localFireGuard,
        cooldownSeconds: COOLDOWN_SECONDS
      });
      if (typeof outcome === "object" && outcome.type === "ready_to_fire") {
        results[row.id] = "ready_to_fire";
        firesPending.push(outcome.payload);
        fired += 1;
      } else {
        results[row.id] = String(outcome);
        if (outcome === "fired") fired += 1;
      }
    }
    /** RSI divergence: re-scan this symbol on each LTP tick (min 1s between Yahoo pulls per symbol). */
    let rsi_divergence_tick: { created: number; skipped?: string } = { created: 0 };
    try {
      rsi_divergence_tick = await runRsiDivergenceTickScan(supabase, rawSym);
    } catch (rsiErr) {
      console.error("stream-conditional-tick rsi tick scan:", rsiErr);
    }
    return new Response(JSON.stringify({
      ok: true,
      symbol: rawSym,
      base,
      checked: rows.length,
      fired,
      results,
      fires_pending: firesPending,
      rsi_divergence_tick,
    }), {
      status: 200,
      headers
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("stream-conditional-tick:", e);
    return new Response(JSON.stringify({
      error: msg
    }), {
      status: 500,
      headers
    });
  }
});
