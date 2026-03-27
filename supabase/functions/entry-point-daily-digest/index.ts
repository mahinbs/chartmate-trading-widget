/**
 * entry-point-daily-digest — scheduled job (Bearer ENTRY_DIGEST_SECRET) or per-user trigger (Bearer user JWT).
 *
 * **JWT + body `{ trackerId }`:** Client invokes at the scheduled minute when the app is open. **Secret + empty body:**
 * cron processes all enabled trackers. Each successful run inserts **one** `entry_point_alerts` row (in-app bell only;
 * no separate “started” row) and `strategy-entry-signals` persists `strategy_scan_history` for Past analyses.
 *
 * Schedules: all_days | weekdays | custom | tomorrow_once.
 *
 * Env: ENTRY_DIGEST_SECRET — same as strategy-entry-signals x-digest-secret
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

type TimeMode = "cron_window" | "exact_minute";

type SB = ReturnType<typeof createClient>;

async function processOneTracker(
  supabase: SB,
  row: TrackerRow,
  secret: string,
  fnUrl: string,
  now: Date,
  timeMode: TimeMode,
): Promise<"sent" | "skipped"> {
  const tz = normalizeTimezoneForDigest((row.timezone || "UTC").trim() || "UTC");
  const { h, m, dateKey, weekday } = getDigestClockContext(now, tz);
  const nowMin = h * 60 + m;
  const { h: th, m: tm } = parseNotifyTimeForDigest(row.notify_time);
  const tgtMin = th * 60 + tm;

  if (row.last_digest_on === dateKey) return "skipped";
  if (!scheduleAllows(row, weekday, dateKey)) return "skipped";

  const timeOk =
    timeMode === "exact_minute"
      ? nowMin === tgtMin
      : isInDigestFireWindow(nowMin, tgtMin);
  if (!timeOk) return "skipped";

  const prevLast = row.last_digest_on;
  const { data: claimedRows, error: claimErr } = await supabase
    .from("live_entry_trackers")
    .update({ last_digest_on: dateKey })
    .eq("id", row.id)
    .or(`last_digest_on.is.null,last_digest_on.neq.${dateKey}`)
    .select("id");

  if (claimErr || !claimedRows?.length) return "skipped";

  const revertLast = async () => {
    await supabase
      .from("live_entry_trackers")
      .update({ last_digest_on: prevLast ?? null })
      .eq("id", row.id);
  };

  try {
    const selectedStrategies = Array.isArray(row.selected_strategies) && row.selected_strategies.length > 0
      ? row.selected_strategies
      : ["trend_following", "mean_reversion", "momentum"];

    let customStrategiesPayload: Array<Record<string, unknown>> = [];
    const customIds = Array.isArray(row.selected_custom_strategy_ids) ? row.selected_custom_strategy_ids : [];
    if (customIds.length > 0) {
      const { data: customRows } = await supabase
        .from("user_strategies")
        .select("id,name,description,trading_mode,stop_loss_pct,take_profit_pct,is_intraday,paper_strategy_type,entry_conditions,exit_conditions,position_config,risk_config,chart_config,execution_days,market_type,start_time,end_time,squareoff_time,risk_per_trade_pct")
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
        entryConditions: (cs.entry_conditions && typeof cs.entry_conditions === "object") ? cs.entry_conditions : null,
        exitConditions: (cs.exit_conditions && typeof cs.exit_conditions === "object") ? cs.exit_conditions : null,
        positionConfig: (cs.position_config && typeof cs.position_config === "object") ? cs.position_config : null,
        riskConfig: (cs.risk_config && typeof cs.risk_config === "object") ? cs.risk_config : null,
        chartConfig: (cs.chart_config && typeof cs.chart_config === "object") ? cs.chart_config : null,
        executionDays: Array.isArray(cs.execution_days) ? cs.execution_days : [],
        marketType: String(cs.market_type ?? "stocks"),
        startTime: cs.start_time != null ? String(cs.start_time) : undefined,
        endTime: cs.end_time != null ? String(cs.end_time) : undefined,
        squareoffTime: cs.squareoff_time != null ? String(cs.squareoff_time) : undefined,
        riskPerTradePct: cs.risk_per_trade_pct != null ? Number(cs.risk_per_trade_pct) : undefined,
        description: cs.description != null ? String(cs.description) : undefined,
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
      await revertLast();
      await supabase.from("entry_point_alerts").insert({
        user_id: row.user_id,
        symbol: row.symbol.trim().toUpperCase(),
        title: `Entry digest failed: ${row.symbol}`,
        message: `Scheduled scan failed (${res.status}). Open AI Trading Analysis to retry.`,
        metadata: {
          phase: "failed",
          status: res.status,
          error: (payload as { error?: string })?.error ?? res.statusText,
          dateKey,
          schedule_mode: row.schedule_mode,
          timezone: tz,
        },
      });
      return "skipped";
    }

    const signals = Array.isArray((payload as { signals?: unknown }).signals)
      ? (payload as { signals: unknown[] }).signals
      : [];
    const historyId = typeof (payload as { historyId?: string }).historyId === "string"
      ? String((payload as { historyId: string }).historyId)
      : null;
    const live = signals.filter((s: { isLive?: boolean }) => s.isLive).length;
    const past = Math.max(0, signals.length - live);
    const buy = signals.filter((s: { side?: string }) => s.side === "BUY").length;
    const sell = signals.filter((s: { side?: string }) => s.side === "SELL").length;

    const title = `Entry points: ${row.symbol}`;
    const message =
      signals.length === 0
        ? `Entry digest — no scored signals right now for ${row.symbol}. Open Live Trading → Scanner to rescan.`
        : `Entry digest — ${live} live · ${past} past · ${buy} BUY / ${sell} SELL (${signals.length} total). Tap Scanner for full breakdown.`;

    const { error: insErr } = await supabase.from("entry_point_alerts").insert({
      user_id: row.user_id,
      symbol: row.symbol.trim().toUpperCase(),
      title,
      message,
      metadata: {
        live,
        past,
        buy,
        sell,
        total: signals.length,
        history_id: historyId,
        source: "scheduled_digest",
        dateKey,
        schedule_mode: row.schedule_mode,
        timezone: tz,
        trigger: timeMode === "exact_minute" ? "client_clock" : "cron",
      },
    });

    if (insErr) {
      await revertLast();
      return "skipped";
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

    return "sent";
  } catch (e) {
    await revertLast();
    await supabase.from("entry_point_alerts").insert({
      user_id: row.user_id,
      symbol: row.symbol.trim().toUpperCase(),
      title: `Entry digest failed: ${row.symbol}`,
        message: "Scheduled scan errored. Open AI Trading Analysis → Scanner to retry.",
      metadata: {
        phase: "failed",
        error: e instanceof Error ? e.message : String(e),
        dateKey,
        schedule_mode: row.schedule_mode,
        timezone: tz,
      },
    });
    return "skipped";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  const secret = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const fnUrl = `${supabaseUrl}/functions/v1/strategy-entry-signals`;

  const body = await req.json().catch(() => ({})) as { trackerId?: string };
  const trackerId = typeof body.trackerId === "string" ? body.trackerId.trim() : "";

  const isCron = secret.length > 0 && bearer === secret;

  if (!isCron) {
    if (!trackerId) {
      return new Response(
        JSON.stringify({ error: "trackerId required when using session auth" }),
        { status: 400, headers },
      );
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearer);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
    }
    const uid = userData.user.id;

    const { data: row, error: rowErr } = await supabase
      .from("live_entry_trackers")
      .select(
        "id,user_id,symbol,display_name,notify_time,timezone,enabled,last_digest_on,schedule_mode,days_of_week,one_off_local_date,selected_strategies,selected_custom_strategy_ids",
      )
      .eq("id", trackerId)
      .eq("user_id", uid)
      .maybeSingle();

    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Tracker not found" }), { status: 404, headers });
    }

    const tr = row as TrackerRow;
    if (!tr.enabled) {
      return new Response(JSON.stringify({ ok: true, outcome: "skipped", reason: "disabled" }), { status: 200, headers });
    }

    if (!secret) {
      return new Response(JSON.stringify({ error: "ENTRY_DIGEST_SECRET not configured" }), { status: 500, headers });
    }

    const now = new Date();
    const tz = normalizeTimezoneForDigest((tr.timezone || "UTC").trim() || "UTC");
    const { h, m, dateKey, weekday } = getDigestClockContext(now, tz);
    const nowMin = h * 60 + m;
    const { h: th, m: tm } = parseNotifyTimeForDigest(tr.notify_time);
    const tgtMin = th * 60 + tm;

    if (tr.last_digest_on === dateKey) {
      return new Response(JSON.stringify({ ok: true, outcome: "skipped", reason: "already_ran" }), { status: 200, headers });
    }
    if (!scheduleAllows(tr, weekday, dateKey)) {
      return new Response(JSON.stringify({ ok: true, outcome: "skipped", reason: "schedule" }), { status: 200, headers });
    }
    if (nowMin !== tgtMin) {
      return new Response(JSON.stringify({ ok: true, outcome: "not_due", reason: "minute_mismatch" }), { status: 200, headers });
    }

    const outcome = await processOneTracker(supabase, tr, secret, fnUrl, now, "exact_minute");
    return new Response(
      JSON.stringify({ ok: true, outcome: outcome === "sent" ? "sent" : "skipped" }),
      { status: 200, headers },
    );
  }

  if (!secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

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

  for (const row of trackers) {
    processed++;
    const r = await processOneTracker(supabase, row, secret, fnUrl, now, "cron_window");
    if (r === "sent") sent++;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      trackers_enabled: trackers.length,
      processed,
      digests_sent: sent,
      errors: [] as string[],
    }),
    { status: 200, headers },
  );
});
