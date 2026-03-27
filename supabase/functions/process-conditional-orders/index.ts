/**
 * process-conditional-orders — Backup / sweep: polls pending deployed orders on a schedule.
 * Primary live path: stream-conditional-tick (called from ChartMate monitor on each OpenAlgo WS tick).
 *
 * Call with: X-Cron-Secret: <CRON_SECRET> (optional; if set, required for cron)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tryExecutePendingRow, type PendingConditionalRow } from "../_shared/pendingConditionalExecution.ts";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const ENTRY_DIGEST_SECRET = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";
const DEFAULT_RUN_SECONDS = 50;
const DEFAULT_POLL_MS = 2000;
const DEFAULT_COOLDOWN_SECONDS = 15;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  if (CRON_SECRET && req.headers.get("X-Cron-Secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      run_seconds?: number;
      poll_interval_ms?: number;
      max_orders_per_tick?: number;
      cooldown_seconds?: number;
    };
    const runSeconds = Math.min(Math.max(Number(body.run_seconds) || DEFAULT_RUN_SECONDS, 5), 120);
    const pollIntervalMs = Math.min(Math.max(Number(body.poll_interval_ms) || DEFAULT_POLL_MS, 250), 10000);
    const maxOrdersPerTick = Math.min(Math.max(Number(body.max_orders_per_tick) || 20, 1), 100);
    const cooldownSeconds = Math.min(Math.max(Number(body.cooldown_seconds) || DEFAULT_COOLDOWN_SECONDS, 1), 300);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const startedAt = Date.now();
    const deadline = startedAt + runSeconds * 1000;
    const localFireGuard = new Map<string, number>();
    const processed: string[] = [];
    const fired: string[] = [];
    let ticks = 0;

    while (Date.now() < deadline) {
      ticks += 1;
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
        .limit(maxOrdersPerTick);

      if (fetchErr) {
        console.error("process-conditional-orders fetch:", fetchErr);
        return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers });
      }

      if (!pending || pending.length === 0) {
        await sleep(pollIntervalMs);
        continue;
      }

      for (const row of pending as PendingConditionalRow[]) {
        processed.push(row.id);
        const outcome = await tryExecutePendingRow(supabase, row, {
          supabaseUrl: SUPABASE_URL,
          openalgoUrl: OPENALGO_URL,
          entryDigestSecret: ENTRY_DIGEST_SECRET,
          localFireGuard,
          cooldownSeconds,
        });
        if (outcome === "fired") fired.push(row.id);
      }

      await sleep(pollIntervalMs);
    }

    return new Response(JSON.stringify({
      ok: true,
      processed: processed.length,
      fired: fired.length,
      ticks,
      run_seconds: runSeconds,
      poll_interval_ms: pollIntervalMs,
      note: "Live ticks also trigger stream-conditional-tick from chartmate-monitor",
    }), { status: 200, headers });
  } catch (e: any) {
    console.error("process-conditional-orders error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers });
  }
});
