/**
 * backtest-vectorbt — VectorBT engine on OpenAlgo (Historify → Yahoo Finance).
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAndConsumeTrialCredit, hasActivePaidAlgoPlan } from "../_shared/trial-credit-check.ts";
const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
// Used to confirm the deployed function version in browser Network → Response.
const BUILD_ID = "backtest-vectorbt:options-orb:2026-04-09-01";
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders
  };
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers
      });
    }
    if (!OPENALGO_URL || !OPENALGO_APP_KEY) {
      return new Response(JSON.stringify({
        error: "OpenAlgo not configured"
      }), {
        status: 500,
        headers
      });
    }
    const body = await req.json().catch(()=>({}));
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    if (!symbol) {
      return new Response(JSON.stringify({
        error: "symbol is required"
      }), {
        status: 400,
        headers
      });
    }
    // For options_orb strategy we need the user's OpenAlgo API key (for 5-min broker data).
    // For all other strategies we leave it null (Historify → Yahoo fallback).
    const isOptionsOrb = (body.strategy ?? "") === "options_orb";
    let openalgoApiKey: string | null = null;
    if (isOptionsOrb) {
      if (!(await hasActivePaidAlgoPlan(supabase, user.id))) {
        return new Response(JSON.stringify({
          error: "Options ORB backtests require a paid algo plan and broker data. On a free trial, use Strategy or Simple BUY/SELL backtests only.",
          error_code: "OPTIONS_ORB_REQUIRES_PAID_ALGO",
        }), { status: 403, headers });
      }
      const { data: integRow } = await supabase
        .from("user_trading_integration")
        .select("openalgo_api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      openalgoApiKey = (integRow as { openalgo_api_key?: string } | null)?.openalgo_api_key ?? null;
      if (!openalgoApiKey) {
        return new Response(JSON.stringify({
          error: "Broker not connected. Connect your broker in Broker Sync to run options backtests (5-min intraday data required)."
        }), { status: 200, headers });
      }
    }

    const trialCredit = await checkAndConsumeTrialCredit(supabase, user.id, 10, "backtest_vectorbt");
    if (!trialCredit.ok) {
      return new Response(JSON.stringify({
        build_id: BUILD_ID,
        error: "Insufficient trial credits. Upgrade for unlimited access.",
        error_code: "TRIAL_CREDITS_EXHAUSTED",
        credits_remaining: trialCredit.creditsRemaining ?? 0,
        reason: trialCredit.reason ?? null,
      }), {
        status: 402,
        headers,
      });
    }

    const requestBody: Record<string, unknown> = {
      symbol,
      exchange: body.exchange ?? "NSE",
      strategy: body.strategy ?? "trend_following",
      action: body.action ?? "BUY",
      days: body.days ?? 365,
      stop_loss_pct: body.stop_loss_pct ?? 2,
      take_profit_pct: body.take_profit_pct ?? 4,
      max_hold_days: body.max_hold_days ?? 10,
      data_source: body.data_source ?? "auto",
      openalgo_api_key: openalgoApiKey,
      // Custom strategy — builder fields
      entry_conditions: body.entry_conditions ?? null,
      exit_conditions: body.exit_conditions ?? null,
      custom_strategy_name: body.custom_strategy_name ?? null,
      custom_strategy_id: body.custom_strategy_id ?? null,
      custom_strategy_snapshot: body.custom_strategy_snapshot && typeof body.custom_strategy_snapshot === "object"
        ? body.custom_strategy_snapshot : null,
      execution_days: Array.isArray(body.execution_days) ? body.execution_days : null,
    };

    // Options ORB — pass the full config block through
    if (isOptionsOrb && body.options_config && typeof body.options_config === "object") {
      requestBody.options_config = body.options_config;
    }

    const res = await fetch(`${OPENALGO_URL}/api/v1/platform/vectorbt-backtest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Platform-Key": OPENALGO_APP_KEY,
      },
      body: JSON.stringify(requestBody),
    });
    const rawText = await res.text().catch(()=>"");
    const data = rawText ? JSON.parse(rawText) : {};
    // IMPORTANT:
    // Supabase client treats non-2xx as "invoke error" and hides the JSON body.
    // So we always return 200 and include upstream status + message in payload.
    if (!res.ok) {
      return new Response(JSON.stringify({
        build_id: BUILD_ID,
        error: data?.error ?? "VectorBT backtest failed",
        upstream_status: res.status,
        upstream_detail: data?.detail ?? rawText ?? null
      }), {
        status: 200,
        headers
      });
    }
    return new Response(JSON.stringify({
      build_id: BUILD_ID,
      ...data
    }), {
      status: 200,
      headers
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({
      build_id: BUILD_ID,
      error: msg
    }), {
      status: 500,
      headers
    });
  }
});
