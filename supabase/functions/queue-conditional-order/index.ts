/**
 * queue-conditional-order — Queue an order to execute only when strategy conditions are met.
 * All UI — no scripts. Our backend processes these and fires when conditions match.
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { planAllowsAlgo } from "../_shared/subscription-plans.ts";
import { checkAndConsumeTrialCredit } from "../_shared/trial-credit-check.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info"
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
    const body = await req.json().catch(()=>({}));
    const { strategy_id, symbol, action, quantity } = body;
    const isPaperTrade = Boolean(body.is_paper_trade);
    if (!strategy_id || !symbol || !action || !quantity) {
      return new Response(JSON.stringify({
        error: "strategy_id, symbol, action and quantity are required"
      }), {
        status: 400,
        headers
      });
    }
    const { data: sub } = await supabase.from("user_subscriptions").select("status, current_period_end, plan_id").eq("user_id", user.id).maybeSingle();
    const endMs = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : null;
    const graceOk = endMs == null || endMs + 24 * 60 * 60 * 1000 > Date.now();
    const paid =
      (sub?.status === "active" || sub?.status === "trialing" || sub?.status === "pro_trial") &&
      graceOk;
    const algoPlan = paid && planAllowsAlgo(sub?.plan_id ?? null);

    if (isPaperTrade) {
      if (!algoPlan) {
        const trialCredit = await checkAndConsumeTrialCredit(
          supabase,
          user.id,
          10,
          "queue_conditional_paper",
        );
        if (!trialCredit.ok) {
          return new Response(JSON.stringify({
            error: "Insufficient trial credits. Upgrade for unlimited access.",
            error_code: "TRIAL_CREDITS_EXHAUSTED",
            credits_remaining: trialCredit.creditsRemaining ?? 0,
            reason: trialCredit.reason ?? null,
          }), {
            status: 402,
            headers,
          });
        }
      }
    } else if (!algoPlan) {
      return new Response(JSON.stringify({
        error: "Active Bot / Pro subscription required",
        error_code: "NO_SUBSCRIPTION"
      }), {
        status: 403,
        headers
      });
    }
    const { data: strategy } = await supabase.from("user_strategies").select("id").eq("id", strategy_id).eq("user_id", user.id).maybeSingle();
    if (!strategy) {
      return new Response(JSON.stringify({
        error: "Strategy not found"
      }), {
        status: 404,
        headers
      });
    }
    const expiresHours = Math.min(Math.max(Number(body.expires_hours) || 24, 1), 168);
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();
    // Duplicate pending guard: same strategy+symbol+side shouldn't queue repeatedly
    const normalizedSymbol = symbol.trim().toUpperCase();
    const normalizedAction = action.toUpperCase();
    const { data: existingPending } = await supabase.from("pending_conditional_orders").select("id, created_at").eq("user_id", user.id).eq("strategy_id", strategy_id).eq("symbol", normalizedSymbol).eq("action", normalizedAction).eq("status", "pending").or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (existingPending) {
      return new Response(JSON.stringify({
        success: true,
        id: existingPending.id,
        deduped: true,
        message: "Already deployed and pending for this strategy/symbol/side."
      }), {
        status: 200,
        headers
      });
    }
    const deployOverrides = body.deploy_overrides && typeof body.deploy_overrides === "object" ? body.deploy_overrides : {};
    const { data: inserted, error: insertErr } = await supabase.from("pending_conditional_orders").insert({
      user_id: user.id,
      strategy_id,
      symbol: normalizedSymbol,
      exchange: (body.exchange ?? "NSE").toUpperCase(),
      action: normalizedAction,
      quantity: Number(quantity) || 1,
      product: (body.product ?? "MIS").toUpperCase(),
      paper_strategy_type: body.paper_strategy_type ?? "trend_following",
      is_paper_trade: isPaperTrade,
      status: "pending",
      expires_at: expiresAt,
      deploy_overrides: deployOverrides
    }).select().single();
    if (insertErr) {
      return new Response(JSON.stringify({
        error: insertErr.message
      }), {
        status: 500,
        headers
      });
    }
    return new Response(JSON.stringify({
      success: true,
      id: inserted.id
    }), {
      status: 201,
      headers
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e?.message ?? "Internal error"
    }), {
      status: 500,
      headers
    });
  }
});
