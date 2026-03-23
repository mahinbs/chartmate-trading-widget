/**
 * entry-point-daily-digest — scheduled job (invoke with a secret bearer token).
 *
 * **Delivery:** The app uses Supabase Realtime on `entry_point_alerts` INSERT — toasts are instant once
 * this function inserts a row. **Latency** comes only from how often you run *this* job (cron).
 * Prefer **every 1 minute** (`* * * * *`), not every 5 minutes, so alarms fire close to the user’s wall time.
 *
 * Schedules: all_days | weekdays | custom (days_of_week 0–6 Sun–Sat) | tomorrow_once (one_off_local_date).
 *
 * Env: ENTRY_DIGEST_SECRET — same as strategy-entry-signals x-digest-secret / cron auth
 *
 * @see README.md in this folder for cron + Realtime explanation
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getDigestClockContext,
  isInDigestFireWindow,
  normalizeTimezoneForDigest,
  parseNotifyTimeForDigest,
} from "../_shared/digestClock.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type TrackerRow = {
  id: string;
  user_id: string;
  symbol: string;
  display_name: string | null;
  notify_time: string;
  timezone: string;
  enabled: boolean;
  last_digest_on: string | null;
  schedule_mode: string;
  days_of_week: number[] | null;
  one_off_local_date: string | null;
  selected_strategies: string[] | null;
  selected_custom_strategy_ids: string[] | null;
};

function scheduleAllows(
  row: TrackerRow,
  weekday: number,
  dateKey: string,
): boolean {
  const mode = row.schedule_mode || "all_days";
  if (mode === "tomorrow_once") {
    const one = (row.one_off_local_date ?? "").trim();
    return one.length > 0 && one === dateKey;
  }
  if (mode === "weekdays") {
    return weekday >= 1 && weekday <= 5;
  }
  if (mode === "custom") {
    const days = Array.isArray(row.days_of_week) ? row.days_of_week : [];
    if (days.length === 0) return false;
    return days.includes(weekday);
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  const secret = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!secret || bearer !== secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const fnUrl = `${supabaseUrl}/functions/v1/strategy-entry-signals`;

  const { data: rows, error: qErr } = await supabase
    .from("live_entry_trackers")
    .select(
      "id,user_id,symbol,display_name,notify_time,timezone,enabled,last_digest_on,schedule_mode,days_of_week,one_off_local_date,selected_strategies,selected_custom_strategy_ids",
    )
    .eq("enabled", true);

  if (qErr) {
    console.error("live_entry_trackers:", qErr);
    return new Response(JSON.stringify({ error: qErr.message }), { status: 500, headers });
  }

  const trackers = (rows ?? []) as TrackerRow[];
  const now = new Date();
  let processed = 0;
  let sent = 0;
  const errors: string[] = [];

  for (const row of trackers) {
    processed++;
    const tz = normalizeTimezoneForDigest((row.timezone || "UTC").trim() || "UTC");
    const { h, m, dateKey, weekday } = getDigestClockContext(now, tz);
    const nowMin = h * 60 + m;
    const { h: th, m: tm } = parseNotifyTimeForDigest(row.notify_time);
    const tgtMin = th * 60 + tm;

    if (row.last_digest_on === dateKey) continue;
    if (!isInDigestFireWindow(nowMin, tgtMin)) continue;
    if (!scheduleAllows(row, weekday, dateKey)) continue;

    try {
      // Notify immediately when scheduled digest starts processing.
      await supabase.from("entry_point_alerts").insert({
        user_id: row.user_id,
        symbol: row.symbol.trim().toUpperCase(),
        title: `Entry digest started: ${row.symbol}`,
        message: `Scheduled run started at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} (${tz}). Analyzing now…`,
        metadata: {
          phase: "started",
          dateKey,
          schedule_mode: row.schedule_mode,
          timezone: tz,
        },
      });

      const selectedStrategies = Array.isArray(row.selected_strategies) && row.selected_strategies.length > 0
        ? row.selected_strategies
        : ["trend_following", "mean_reversion", "momentum"];

      let customStrategiesPayload: Array<Record<string, unknown>> = [];
      const customIds = Array.isArray(row.selected_custom_strategy_ids) ? row.selected_custom_strategy_ids : [];
      if (customIds.length > 0) {
        const { data: customRows } = await supabase
          .from("user_strategies")
          .select("id,name,trading_mode,stop_loss_pct,take_profit_pct,is_intraday,paper_strategy_type")
          .eq("user_id", row.user_id)
          .in("id", customIds);
        customStrategiesPayload = ((customRows ?? []) as Array<Record<string, unknown>>).map((cs) => ({
          id: `custom_${String(cs.id)}`,
          name: String(cs.name ?? "Custom strategy"),
          baseType: String(cs.paper_strategy_type ?? "trend_following"),
          tradingMode: String(cs.trading_mode ?? "BOTH"),
          stopLossPct: Number(cs.stop_loss_pct ?? 2),
          takeProfitPct: Number(cs.take_profit_pct ?? 4),
          isIntraday: Boolean(cs.is_intraday ?? true),
        }));
      }

      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-digest-secret": secret,
          "x-digest-user-id": row.user_id,
        },
        body: JSON.stringify({
          symbol: row.symbol.trim(),
          strategies: selectedStrategies,
          customStrategies: customStrategiesPayload,
          action: "BOTH",
          days: 365,
          preferIntraday: true,
          intradayInterval: "5m",
          intradayLookbackMinutes: 5 * 24 * 60,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        await supabase.from("entry_point_alerts").insert({
          user_id: row.user_id,
          symbol: row.symbol.trim().toUpperCase(),
          title: `Entry digest failed: ${row.symbol}`,
          message: `Scheduled run started, but analysis failed (${res.status}).`,
          metadata: {
            phase: "failed",
            status: res.status,
            error: (payload as any)?.error ?? res.statusText,
            dateKey,
            schedule_mode: row.schedule_mode,
            timezone: tz,
          },
        });
        errors.push(`${row.symbol}: ${(payload as any)?.error ?? res.statusText}`);
        continue;
      }

      const signals = Array.isArray((payload as any)?.signals) ? (payload as any).signals : [];
      const historyId = typeof (payload as any)?.historyId === "string" ? String((payload as any).historyId) : null;
      const live = signals.filter((s: any) => s.isLive).length;
      const predicted = signals.filter((s: any) => s.isPredicted).length;
      const buy = signals.filter((s: any) => s.side === "BUY").length;
      const sell = signals.filter((s: any) => s.side === "SELL").length;

      const title = `Entry points: ${row.symbol}`;
      const message =
        signals.length === 0
          ? `Entry digest — no scored signals right now for ${row.symbol}. Open Live Trading → Scanner to rescan.`
          : `Entry digest — ${live} live · ${predicted} upcoming · ${buy} BUY / ${sell} SELL (${signals.length} total). Tap to open Scanner for full table.`;

      const { error: insErr } = await supabase.from("entry_point_alerts").insert({
        user_id: row.user_id,
        symbol: row.symbol.trim().toUpperCase(),
        title,
        message,
        metadata: {
          live,
          predicted,
          buy,
          sell,
          total: signals.length,
          history_id: historyId,
          source: "scheduled_digest",
          dateKey,
          schedule_mode: row.schedule_mode,
          timezone: tz,
        },
      });

      if (insErr) {
        errors.push(`${row.symbol}: alert ${insErr.message}`);
        continue;
      }

      const mode = row.schedule_mode || "all_days";
      const patch: Record<string, unknown> = {
        last_digest_on: dateKey,
        updated_at: new Date().toISOString(),
      };

      if (mode === "tomorrow_once") {
        patch.enabled = false;
        patch.one_off_local_date = null;
        patch.schedule_mode = "all_days";
      }

      await supabase.from("live_entry_trackers").update(patch).eq("id", row.id);

      sent++;
    } catch (e) {
      await supabase.from("entry_point_alerts").insert({
        user_id: row.user_id,
        symbol: row.symbol.trim().toUpperCase(),
        title: `Entry digest failed: ${row.symbol}`,
        message: "Scheduled run started, but analysis errored. Please retry from Scanner.",
        metadata: {
          phase: "failed",
          error: e instanceof Error ? e.message : String(e),
          dateKey,
          schedule_mode: row.schedule_mode,
          timezone: tz,
        },
      });
      errors.push(`${row.symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      trackers_enabled: trackers.length,
      processed,
      digests_sent: sent,
      errors: errors.slice(0, 20),
    }),
    { status: 200, headers },
  );
});
