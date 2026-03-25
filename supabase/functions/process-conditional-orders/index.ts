/**
 * process-conditional-orders — Called by cron. Checks pending deployed orders,
 * evaluates FULL dynamic strategy conditions using strategy-entry-signals,
 * and fires order when live conditions are matched.
 * All logic in our backend — no external scripts.
 *
 * Call with: X-Cron-Secret: <CRON_SECRET> (optional; if set, required for cron)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const ENTRY_DIGEST_SECRET = Deno.env.get("ENTRY_DIGEST_SECRET") ?? "";
const DEFAULT_RUN_SECONDS = 50; // cron-safe loop window
const DEFAULT_POLL_MS = 2000;   // sub-minute checks
const DEFAULT_COOLDOWN_SECONDS = 15; // duplicate guard

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
      // Expire stale pending rows first
      await supabase
        .from("pending_conditional_orders")
        .update({ status: "expired", error_message: "Expired before conditions matched" })
        .eq("status", "pending")
        .lt("expires_at", nowIso);

      const { data: pending, error: fetchErr } = await supabase
        .from("pending_conditional_orders")
        .select("id, user_id, strategy_id, symbol, exchange, action, quantity, product, paper_strategy_type, created_at, expires_at")
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

      for (const row of pending) {
      processed.push(row.id);

      // Load full strategy (dynamic fields are source of truth for execution)
      const { data: strategy } = await supabase
        .from("user_strategies")
        .select("id, name, trading_mode, is_intraday, stop_loss_pct, take_profit_pct, paper_strategy_type, symbols, market_type, entry_conditions, exit_conditions, position_config, risk_config, chart_config, execution_days")
        .eq("id", row.strategy_id)
        .single();
      if (!strategy) {
        await supabase.from("pending_conditional_orders").update({
          status: "cancelled",
          error_message: "Strategy not found",
        }).eq("id", row.id);
        continue;
      }

      // Debounce/rate-limit + duplicate guard (local + DB recent executions)
      const dedupeKey = `${row.strategy_id}|${row.symbol}|${row.action}`;
      const lastLocalFire = localFireGuard.get(dedupeKey) ?? 0;
      if (Date.now() - lastLocalFire < cooldownSeconds * 1000) {
        continue;
      }
      const cooldownIso = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
      const { data: recentExecuted } = await supabase
        .from("pending_conditional_orders")
        .select("id, executed_at")
        .eq("strategy_id", row.strategy_id)
        .eq("symbol", row.symbol)
        .eq("action", row.action)
        .eq("status", "executed")
        .gte("executed_at", cooldownIso)
        .limit(1)
        .maybeSingle();
      if (recentExecuted) continue;

      // Check FULL strategy conditions via strategy-entry-signals (dynamic config)
      const customId = `custom_${strategy.id}`;
      const checkHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (ENTRY_DIGEST_SECRET) {
        checkHeaders["x-digest-secret"] = ENTRY_DIGEST_SECRET;
        checkHeaders["x-digest-user-id"] = String(row.user_id);
      }

      const checkRes = await fetch(`${SUPABASE_URL}/functions/v1/strategy-entry-signals`, {
        method: "POST",
        headers: checkHeaders,
        body: JSON.stringify({
          symbol: row.symbol,
          strategies: [],
          action: row.action,
          days: 90,
          preferIntraday: true,
          intradayInterval: "5m",
          intradayLookbackMinutes: 5 * 24 * 60,
          customStrategies: [{
            id: customId,
            name: strategy.name,
            baseType: String((strategy as any).paper_strategy_type ?? "trend_following"),
            tradingMode: String((strategy as any).trading_mode ?? "BOTH"),
            stopLossPct: Number((strategy as any).stop_loss_pct ?? 2),
            takeProfitPct: Number((strategy as any).take_profit_pct ?? 4),
            isIntraday: Boolean((strategy as any).is_intraday ?? true),
            entryConditions: (strategy as any).entry_conditions ?? null,
            exitConditions: (strategy as any).exit_conditions ?? null,
            positionConfig: (strategy as any).position_config ?? null,
            riskConfig: (strategy as any).risk_config ?? null,
            chartConfig: (strategy as any).chart_config ?? null,
            executionDays: Array.isArray((strategy as any).execution_days) ? (strategy as any).execution_days : [],
            marketType: String((strategy as any).market_type ?? "stocks"),
          }],
        }),
      });
      const checkData = (await checkRes.json().catch(() => ({}))) as any;
      const signals = Array.isArray(checkData?.signals) ? checkData.signals : [];
      const achieved = Boolean(signals.find((s: any) =>
        String(s?.strategyId ?? "") === customId &&
        String(s?.side ?? "").toUpperCase() === String(row.action).toUpperCase() &&
        Boolean(s?.isLive) &&
        !Boolean(s?.isPredicted),
      ));

      await supabase
        .from("pending_conditional_orders")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", row.id);

      if (!achieved) continue;

      const { data: integration } = await supabase
        .from("user_trading_integration")
        .select("openalgo_api_key")
        .eq("user_id", row.user_id)
        .eq("is_active", true)
        .maybeSingle() as any;
      const apiKey = integration?.openalgo_api_key ?? "";
      if (!apiKey) {
        await supabase.from("pending_conditional_orders").update({
          status: "cancelled",
          error_message: "No broker connection",
        }).eq("id", row.id);
        continue;
      }

      const positionConfig = ((strategy as any)?.position_config && typeof (strategy as any).position_config === "object")
        ? ((strategy as any).position_config as Record<string, unknown>)
        : {};
      const resolvedExchange = String(positionConfig.exchange ?? row.exchange ?? "NSE").toUpperCase();
      const resolvedProduct = String(positionConfig.orderProduct ?? row.product ?? "MIS").toUpperCase();
      const resolvedQty = Number(positionConfig.quantity ?? row.quantity ?? 1);
      const resolvedPriceType = String(
        (positionConfig.orderType === "LIMIT" ? "LIMIT" : (positionConfig.orderType === "STOP" || positionConfig.orderType === "STOP_LIMIT") ? "SL" : "MARKET"),
      ).toUpperCase();

      const orderPayload = {
        apikey: apiKey.trim(),
        strategy: strategy.name,
        exchange: resolvedExchange,
        symbol: String(row.symbol).toUpperCase().replace(/\.NS$/i, "").replace(/\.BO$/i, ""),
        action: row.action,
        product: resolvedProduct,
        pricetype: resolvedPriceType,
        quantity: String(Number.isFinite(resolvedQty) && resolvedQty > 0 ? resolvedQty : 1),
        price: resolvedPriceType === "MARKET" ? "0" : "0",
        trigger_price: "0",
        disclosed_quantity: "0",
      };

      const placeRes = await fetch(`${OPENALGO_URL}/api/v1/placeorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      const placeData = await placeRes.json().catch(() => ({}));
      const orderId = (placeData as any)?.orderid ?? (placeData as any)?.broker_order_id;

      await supabase.from("pending_conditional_orders").update({
        status: placeRes.ok ? "executed" : "cancelled",
        executed_at: placeRes.ok ? new Date().toISOString() : null,
        broker_order_id: orderId ?? null,
        error_message: placeRes.ok ? null : ((placeData as any)?.message ?? "Order failed"),
      }).eq("id", row.id);

      if (placeRes.ok) {
        fired.push(row.id);
        localFireGuard.set(dedupeKey, Date.now());
        await supabase.from("order_audit_logs").insert({
          user_id: row.user_id,
          trade_id: null,
          intent: "entry",
          provider: "openalgo",
          request_payload: orderPayload,
          response_payload: placeData,
          status: "success",
        }).catch(() => {});
      }
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
    }), { status: 200, headers });
  } catch (e: any) {
    console.error("process-conditional-orders error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers });
  }
});
