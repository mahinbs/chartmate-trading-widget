/**
 * manage-strategy — Supabase Edge Function
 *
 * CRUD for user strategies. Syncs create/delete to OpenAlgo automatically.
 *
 * Actions:
 *   create              — create strategy in Supabase + OpenAlgo
 *   update              — update strategy config in Supabase (name, symbols, risk, times)
 *   delete              — delete from Supabase + OpenAlgo
 *   list                — list all strategies for the user
 *   toggle              — toggle is_active
 *   pause_all           — deactivate all strategies + cancel queued conditional rows
 *   seed_guide_presets  — bulk-load the 7 canonical Algo Trading Guide presets
 *                          (idempotent; rows insert as paused, user activates later)
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { planAllowsAlgo } from "../_shared/subscription-plans.ts";
import { getAlgoStrategyLimits, UNLIMITED_CUSTOM_STRATEGIES } from "../_shared/algo-strategy-limits.ts";
const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info"
};
/** True if saved JSON has at least one entry path the scanner can use (preset, raw, clock, or visual groups). */ function entryConditionsLookConfigured(entry) {
  if (entry == null || typeof entry !== "object") return false;
  const e = entry;
  if (String(e.algoGuidePreset ?? "").trim().length > 0) return true;
  if (String(e.rawExpression ?? "").trim().length > 0) return true;
  const st = String(e.strategySubtype ?? "").toLowerCase();
  if ((st === "time_based" || st === "hybrid") && String(e.clockEntryTime ?? "").trim().length > 0) {
    return true;
  }
  const groups = Array.isArray(e.groups) ? e.groups : [];
  for (const g of groups){
    if (!g || typeof g !== "object") continue;
    const conds = Array.isArray(g.conditions) ? g.conditions : [];
    if (conds.length > 0) return true;
  }
  return false;
}
async function activePlanIdForUser(supabase, userId) {
  const { data } = await supabase.from("user_subscriptions").select("plan_id, status, current_period_end").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const st = String(data.status ?? "");
  if (st !== "active" && st !== "trialing" && st !== "pro_trial") return null;
  const endRaw = data.current_period_end;
  const endMs = endRaw ? new Date(endRaw).getTime() : null;
  const graceEndMs = endMs != null ? endMs + 24 * 60 * 60 * 1000 : null;
  if (graceEndMs != null && graceEndMs < Date.now()) return null;
  return data.plan_id ?? null;
}
/** Max user-created (non–trial_seed) strategies while on free trial without paid algo. */
const TRIAL_MAX_CUSTOM_STRATEGIES = 2;
async function hasActiveTrialAccess(supabase, userId) {
  const { data } = await supabase.from("trial_access").select("status, end_at").eq("user_id", userId).maybeSingle();
  if (!data || String(data.status ?? "") !== "active") return false;
  const endRaw = data.end_at;
  if (!endRaw) return false;
  return new Date(String(endRaw)).getTime() > Date.now();
}
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
    // ── Auth ──────────────────────────────────────────────────────────────
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
    const action = (body.action ?? "list").toLowerCase();
    // ── LIST ──────────────────────────────────────────────────────────────
    if (action === "list") {
      const { data, error } = await supabase.from("user_strategies").select("*").eq("user_id", user.id).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      // Enrich each strategy with the full webhook URL so the client doesn't need to know OPENALGO_URL
      const strategies = (data ?? []).map((s)=>({
          ...s,
          webhook_url: s.openalgo_webhook_id && OPENALGO_URL ? `${OPENALGO_URL}/webhook/${s.openalgo_webhook_id}` : null
        }));
      return new Response(JSON.stringify({
        strategies
      }), {
        status: 200,
        headers
      });
    }
    // ── SEED ALGO GUIDE PRESETS ───────────────────────────────────────────
    // Bulk-loads the 7 canonical Algo Trading Guide preset strategies for the
    // current user. Idempotent — uses public.seed_algo_guide_presets_for_user
    // SQL function which inserts only rows that don't already exist.
    // Templates land as is_active=false (paused); the user must connect a
    // broker and toggle active before any of them fires.
    if (action === "seed_guide_presets") {
      const seedPlanId = await activePlanIdForUser(supabase, user.id);
      if (!seedPlanId || !planAllowsAlgo(seedPlanId)) {
        return new Response(JSON.stringify({
          error: "Algo Guide presets require a paid plan with live algo tools. Trial accounts already include pre-built template strategies.",
          error_code: "SEED_PRESETS_REQUIRES_PLAN"
        }), {
          status: 403,
          headers
        });
      }
      const { data: rpcCount, error: rpcErr } = await supabase.rpc(
        "seed_algo_guide_presets_for_user",
        { p_user_id: user.id }
      );
      if (rpcErr) {
        return new Response(JSON.stringify({
          error: "Failed to seed Algo Guide presets: " + rpcErr.message
        }), {
          status: 500,
          headers
        });
      }
      // Re-list strategies so the client can refresh in one round-trip
      const { data: strats, error: listErr } = await supabase
        .from("user_strategies")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (listErr) {
        return new Response(JSON.stringify({
          error: "Seed succeeded but list failed: " + listErr.message
        }), {
          status: 500,
          headers
        });
      }
      const seededStrategies = (strats ?? []).map((s) => ({
        ...s,
        webhook_url: s.openalgo_webhook_id && OPENALGO_URL
          ? `${OPENALGO_URL}/webhook/${s.openalgo_webhook_id}`
          : null
      }));
      return new Response(JSON.stringify({
        seeded: typeof rpcCount === "number" ? rpcCount : 0,
        strategies: seededStrategies
      }), {
        status: 200,
        headers
      });
    }
    // ── CREATE ────────────────────────────────────────────────────────────
    if (action === "create") {
      const name = (body.name ?? "").trim();
      const description = (body.description ?? "").trim();
      const tradingMode = (body.trading_mode ?? "LONG").toUpperCase();
      const isIntraday = body.is_intraday !== false;
      const startTime = body.start_time ?? "09:15";
      const endTime = body.end_time ?? "15:15";
      const squareoff = body.squareoff_time ?? "15:15";
      const riskPct = Number(body.risk_per_trade_pct ?? 1.0);
      const symbols = Array.isArray(body.symbols) ? body.symbols : [];
      const paperStrategyType = (body.paper_strategy_type ?? "").trim() || null;
      const marketType = (body.market_type ?? "stocks").trim().toLowerCase();
      const entryConditions = body.entry_conditions && typeof body.entry_conditions === "object" ? body.entry_conditions : {};
      const exitRaw = body.exit_conditions;
      const exitConditions = exitRaw === null ? null : exitRaw && typeof exitRaw === "object" ? exitRaw : {};
      const autoExitOff = exitConditions && typeof exitConditions === "object" && exitConditions.autoExitEnabled === false;
      const slIn = body.stop_loss_pct;
      const tpIn = body.take_profit_pct;
      const slPct = autoExitOff ? null : slIn === null || slIn === undefined ? null : Number(slIn);
      const tpPct = autoExitOff ? null : tpIn === null || tpIn === undefined ? null : Number(tpIn);
      const positionConfig = body.position_config && typeof body.position_config === "object" ? body.position_config : {};
      const riskConfig = body.risk_config && typeof body.risk_config === "object" ? body.risk_config : {};
      const chartConfig = body.chart_config && typeof body.chart_config === "object" ? body.chart_config : {};
      const executionDays = Array.isArray(body.execution_days) ? body.execution_days.map((v)=>Number(v)).filter((v)=>Number.isFinite(v) && v >= 0 && v <= 6) : [];
      if (!name) {
        return new Response(JSON.stringify({
          error: "name is required"
        }), {
          status: 400,
          headers
        });
      }
      const subPlanId = await activePlanIdForUser(supabase, user.id);
      const paidAlgo = Boolean(subPlanId && planAllowsAlgo(subPlanId));
      let isTrialCreation = false;
      if (paidAlgo) {
        const limits = getAlgoStrategyLimits(subPlanId);
        if (!limits) {
          return new Response(JSON.stringify({
            error: "This plan does not support custom strategies.",
            error_code: "PLAN_NO_STRATEGIES"
          }), {
            status: 403,
            headers
          });
        }
        const { count: stratCount, error: countErr } = await supabase.from("user_strategies").select("id", {
          count: "exact",
          head: true
        }).eq("user_id", user.id);
        if (countErr) {
          return new Response(JSON.stringify({
            error: "Could not verify strategy limit"
          }), {
            status: 500,
            headers
          });
        }
        if (
          limits.maxCustomStrategies !== UNLIMITED_CUSTOM_STRATEGIES &&
          (stratCount ?? 0) >= limits.maxCustomStrategies
        ) {
          const n = limits.maxCustomStrategies;
          return new Response(JSON.stringify({
            error: `Your plan allows up to ${n} custom strateg${n === 1 ? "y" : "ies"}. Upgrade in billing to add more.`,
            error_code: "STRATEGY_LIMIT"
          }), {
            status: 403,
            headers
          });
        }
      } else {
        const trialOk = await hasActiveTrialAccess(supabase, user.id);
        if (!trialOk) {
          return new Response(JSON.stringify({
            error: "An active subscription with live trading (OpenAlgo) access is required to create strategies.",
            error_code: "NO_ALGO_PLAN"
          }), {
            status: 403,
            headers
          });
        }
        const { count: customCount, error: customErr } = await supabase.from("user_strategies").select("id", {
          count: "exact",
          head: true
        }).eq("user_id", user.id).eq("trial_seed", false);
        if (customErr) {
          return new Response(JSON.stringify({
            error: "Could not verify trial strategy limit"
          }), {
            status: 500,
            headers
          });
        }
        if ((customCount ?? 0) >= TRIAL_MAX_CUSTOM_STRATEGIES) {
          return new Response(JSON.stringify({
            error: `Your free trial includes up to ${TRIAL_MAX_CUSTOM_STRATEGIES} custom strategies (plus the pre-built templates). Upgrade to add more.`,
            error_code: "TRIAL_STRATEGY_LIMIT"
          }), {
            status: 403,
            headers
          });
        }
        isTrialCreation = true;
      }
      // Get user's OpenAlgo username from integration table
      const { data: integration } = await supabase.from("user_trading_integration").select("openalgo_username, openalgo_api_key").eq("user_id", user.id).eq("is_active", true).maybeSingle();
      const openalgoUsername = String(integration?.openalgo_username ?? "").trim();
      const openalgoApiKeyCreate = String(integration?.openalgo_api_key ?? "").trim();
      const hasActiveBroker = Boolean(openalgoUsername) || Boolean(openalgoApiKeyCreate);
      // Create strategy in OpenAlgo (paid path only; trial stays research / paper only)
      let openalgoStrategyId = null;
      let openalgoWebhookId = null;
      if (!isTrialCreation && OPENALGO_URL && OPENALGO_APP_KEY && openalgoUsername.length > 0) {
        const res = await fetch(`${OPENALGO_URL}/api/v1/platform/create-strategy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Platform-Key": OPENALGO_APP_KEY
          },
          body: JSON.stringify({
            username: openalgoUsername,
            name,
            trading_mode: tradingMode,
            is_intraday: isIntraday,
            start_time: startTime,
            end_time: endTime,
            squareoff_time: squareoff,
            stop_loss_pct: slPct ?? null,
            take_profit_pct: tpPct ?? null,
            symbols
          })
        });
        if (res.ok) {
          const d = await res.json();
          openalgoStrategyId = d.strategy_id;
          openalgoWebhookId = d.webhook_id;
        } else {
          console.warn("OpenAlgo strategy creation failed:", await res.text());
        }
      }
      // Save in Supabase
      const { data: created, error: insertErr } = await supabase.from("user_strategies").insert({
        user_id: user.id,
        name,
        description,
        trading_mode: tradingMode,
        is_intraday: isIntraday,
        start_time: startTime,
        end_time: endTime,
        squareoff_time: squareoff,
        risk_per_trade_pct: riskPct,
        stop_loss_pct: slPct,
        take_profit_pct: tpPct,
        symbols,
        paper_strategy_type: paperStrategyType,
        is_active: isTrialCreation ? false : hasActiveBroker,
        trial_seed: false,
        market_type: marketType,
        entry_conditions: entryConditions,
        exit_conditions: exitConditions,
        position_config: positionConfig,
        risk_config: riskConfig,
        chart_config: chartConfig,
        execution_days: executionDays,
        openalgo_strategy_id: openalgoStrategyId,
        openalgo_webhook_id: openalgoWebhookId
      }).select().single();
      if (insertErr) {
        return new Response(JSON.stringify({
          error: "Failed to save strategy: " + insertErr.message
        }), {
          status: 500,
          headers
        });
      }
      return new Response(JSON.stringify({
        strategy: created
      }), {
        status: 201,
        headers
      });
    }
    // ── UPDATE ────────────────────────────────────────────────────────────
    if (action === "update") {
      const strategyId = (body.strategy_id ?? "").trim();
      if (!strategyId) {
        return new Response(JSON.stringify({
          error: "strategy_id is required"
        }), {
          status: 400,
          headers
        });
      }
      const { data: currentRow } = await supabase.from("user_strategies").select("is_active").eq("id", strategyId).eq("user_id", user.id).maybeSingle();
      if (!currentRow) {
        return new Response(JSON.stringify({
          error: "Strategy not found"
        }), {
          status: 404,
          headers
        });
      }
      if (currentRow.is_active === true) {
        return new Response(JSON.stringify({
          error: "Cannot edit a live strategy. Deactivate it first, then edit.",
          error_code: "STRATEGY_LIVE_LOCKED"
        }), {
          status: 409,
          headers
        });
      }
      const updates = {
        updated_at: new Date().toISOString()
      };
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.trading_mode !== undefined) updates.trading_mode = body.trading_mode.toUpperCase();
      if (body.is_intraday !== undefined) updates.is_intraday = body.is_intraday;
      if (body.start_time !== undefined) updates.start_time = body.start_time;
      if (body.end_time !== undefined) updates.end_time = body.end_time;
      if (body.squareoff_time !== undefined) updates.squareoff_time = body.squareoff_time;
      if (body.risk_per_trade_pct !== undefined) updates.risk_per_trade_pct = Number(body.risk_per_trade_pct);
      if (body.stop_loss_pct !== undefined) {
        updates.stop_loss_pct = body.stop_loss_pct === null ? null : Number(body.stop_loss_pct);
      }
      if (body.take_profit_pct !== undefined) {
        updates.take_profit_pct = body.take_profit_pct === null ? null : Number(body.take_profit_pct);
      }
      if (body.symbols !== undefined) updates.symbols = body.symbols;
      if (body.paper_strategy_type !== undefined) updates.paper_strategy_type = (body.paper_strategy_type ?? "").trim() || null;
      if (body.market_type !== undefined) updates.market_type = String(body.market_type).trim().toLowerCase();
      if (body.entry_conditions !== undefined && body.entry_conditions && typeof body.entry_conditions === "object") updates.entry_conditions = body.entry_conditions;
      if (body.exit_conditions !== undefined) {
        if (body.exit_conditions === null) updates.exit_conditions = null;
        else if (typeof body.exit_conditions === "object") updates.exit_conditions = body.exit_conditions;
      }
      if (body.position_config !== undefined && body.position_config && typeof body.position_config === "object") updates.position_config = body.position_config;
      if (body.risk_config !== undefined && body.risk_config && typeof body.risk_config === "object") updates.risk_config = body.risk_config;
      if (body.chart_config !== undefined && body.chart_config && typeof body.chart_config === "object") updates.chart_config = body.chart_config;
      if (body.execution_days !== undefined && Array.isArray(body.execution_days)) {
        updates.execution_days = body.execution_days.map((v)=>Number(v)).filter((v)=>Number.isFinite(v) && v >= 0 && v <= 6);
      }
      const { data: updated, error: updateErr } = await supabase.from("user_strategies").update(updates).eq("id", strategyId).eq("user_id", user.id).select().single();
      if (updateErr) {
        return new Response(JSON.stringify({
          error: "Failed to update: " + updateErr.message
        }), {
          status: 500,
          headers
        });
      }
      // Best-effort: sync risk changes to OpenAlgo so the auto-exit engine uses latest SL/TP%
      try {
        const wantsRiskSync = body.stop_loss_pct !== undefined || body.take_profit_pct !== undefined;
        if (wantsRiskSync && OPENALGO_URL && OPENALGO_APP_KEY) {
          const { data: integration } = await supabase.from("user_trading_integration").select("openalgo_username").eq("user_id", user.id).eq("is_active", true).maybeSingle();
          const openalgoUsername = integration?.openalgo_username ?? "";
          if (openalgoUsername) {
            await fetch(`${OPENALGO_URL}/api/v1/platform/update-strategy-risk`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Platform-Key": OPENALGO_APP_KEY
              },
              body: JSON.stringify({
                username: openalgoUsername,
                name: String(updated?.name ?? ""),
                stop_loss_pct: updated?.stop_loss_pct,
                take_profit_pct: updated?.take_profit_pct
              })
            });
          }
        }
      } catch (_e) {
      // ignore sync failures
      }
      return new Response(JSON.stringify({
        strategy: updated
      }), {
        status: 200,
        headers
      });
    }
    // ── TOGGLE ────────────────────────────────────────────────────────────
    if (action === "toggle") {
      const strategyId = (body.strategy_id ?? "").trim();
      if (!strategyId) {
        return new Response(JSON.stringify({
          error: "strategy_id is required"
        }), {
          status: 400,
          headers
        });
      }
      const { data: current } = await supabase.from("user_strategies").select("is_active").eq("id", strategyId).eq("user_id", user.id).maybeSingle();
      const enabling = !current?.is_active;
      if (enabling) {
        const subPlanToggle = await activePlanIdForUser(supabase, user.id);
        const paidAlgoToggle = Boolean(subPlanToggle && planAllowsAlgo(subPlanToggle));
        if (!paidAlgoToggle) {
          const trialActive = await hasActiveTrialAccess(supabase, user.id);
          if (trialActive) {
            return new Response(JSON.stringify({
              error: "Trial accounts use Backtest, AI analysis, and Paper Trade only. Upgrade to activate live strategy execution with your broker.",
              error_code: "TRIAL_NO_LIVE_ACTIVATE"
            }), {
              status: 403,
              headers
            });
          }
          return new Response(JSON.stringify({
            error: "An active subscription with live trading access is required to activate strategies.",
            error_code: "NO_SUBSCRIPTION"
          }), {
            status: 403,
            headers
          });
        }
        const { data: integration } = await supabase.from("user_trading_integration").select("openalgo_username, openalgo_api_key").eq("user_id", user.id).eq("is_active", true).maybeSingle();
        const openalgoUsername = String(integration?.openalgo_username ?? "").trim();
        const openalgoApiKey = String(integration?.openalgo_api_key ?? "").trim();
        // Must match client + get-portfolio-data / fire-strategy-signal: many users only have api_key after OAuth/provision.
        if (!openalgoUsername && !openalgoApiKey) {
          return new Response(JSON.stringify({
            error: "Connect broker first to deploy/activate this strategy."
          }), {
            status: 400,
            headers
          });
        }
        const { data: rowSym } = await supabase.from("user_strategies").select("symbols, entry_conditions").eq("id", strategyId).eq("user_id", user.id).maybeSingle();
        const syms = rowSym?.symbols;
        let hasTradableSymbol = false;
        if (Array.isArray(syms)) {
          for (const x of syms){
            if (typeof x === "string" && x.trim().length > 0) {
              hasTradableSymbol = true;
              break;
            }
            if (x && typeof x === "object") {
              const sym = String(x.symbol ?? "").trim();
              const q = Number(x.quantity ?? 0);
              if (sym.length > 0 && Number.isFinite(q) && q >= 1) {
                hasTradableSymbol = true;
                break;
              }
              if (sym.length > 0) {
                hasTradableSymbol = true;
                break;
              }
            }
          }
        }
        if (!hasTradableSymbol) {
          return new Response(JSON.stringify({
            error: "Set a symbol and quantity before going live (confirm in the activation dialog or edit the strategy).",
            error_code: "ACTIVATION_NEEDS_SYMBOL"
          }), {
            status: 400,
            headers
          });
        }
        const entryCfg = rowSym?.entry_conditions;
        if (!entryConditionsLookConfigured(entryCfg)) {
          return new Response(JSON.stringify({
            error: "Save entry rules before going live: add indicator conditions, a time-based entry, a raw expression, or an Algo Guide preset.",
            error_code: "ACTIVATION_NEEDS_ENTRY_RULES"
          }), {
            status: 400,
            headers
          });
        }
      }
      const wasActive = Boolean(current?.is_active);
      const { data: toggled, error: toggleErr } = await supabase.from("user_strategies").update({
        is_active: !wasActive,
        updated_at: new Date().toISOString()
      }).eq("id", strategyId).eq("user_id", user.id).select().single();
      if (toggleErr) {
        return new Response(JSON.stringify({
          error: "Failed to toggle: " + toggleErr.message
        }), {
          status: 500,
          headers
        });
      }
      const toggledRow = toggled;
      // Turning off must stop live deploy scans — cancel all pending rows for this strategy.
      if (wasActive) {
        await supabase.from("pending_conditional_orders").update({
          status: "cancelled",
          error_message: "Strategy deactivated"
        }).eq("user_id", user.id).eq("strategy_id", strategyId).in("status", ["pending", "scheduled"]);
        return new Response(JSON.stringify({
          strategy: toggledRow
        }), {
          status: 200,
          headers
        });
      }
      // Turning ON — auto-create a pending conditional order if strategy has a symbol configured.
      // This replaces the manual Actions → DEPLOY BUY flow.
      let autoDeployId = null;
      let autoDeployMsg = null;
      const syms = toggledRow.symbols;
      let autoSym = "";
      let autoExchange = "NSE";
      let autoQty = 1;
      const autoProduct = toggledRow.is_intraday ? "MIS" : "CNC";
      const tradingMode = String(toggledRow.trading_mode ?? "BOTH").toUpperCase();
      const autoAction = tradingMode === "SHORT" ? "SELL" : "BUY";
      if (Array.isArray(syms) && syms.length > 0) {
        const s0 = syms[0];
        if (typeof syms[0] === "string") {
          autoSym = syms[0].trim().toUpperCase();
        } else if (s0 && typeof s0 === "object") {
          autoSym = String(s0.symbol ?? "").trim().toUpperCase();
          autoExchange = String(s0.exchange ?? "NSE").toUpperCase();
          const q = Number(s0.quantity ?? 0);
          if (q >= 1) autoQty = Math.floor(q);
        }
      }
      if (autoSym) {
        // Deduplicate: don't re-queue if a live pending already exists
        const { data: existingPending } = await supabase.from("pending_conditional_orders").select("id").eq("user_id", user.id).eq("strategy_id", strategyId).eq("symbol", autoSym).eq("status", "pending").maybeSingle();
        if (!existingPending) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          const { data: newOrder, error: insertErr } = await supabase.from("pending_conditional_orders").insert({
            user_id: user.id,
            strategy_id: strategyId,
            symbol: autoSym,
            exchange: autoExchange,
            action: autoAction,
            quantity: autoQty,
            product: autoProduct,
            paper_strategy_type: String(toggledRow.paper_strategy_type ?? "trend_following"),
            status: "pending",
            expires_at: expiresAt,
            deploy_overrides: {
              start_time: toggledRow.start_time ?? "09:15",
              end_time: toggledRow.end_time ?? "15:15",
              squareoff_time: toggledRow.squareoff_time ?? "15:15",
              use_auto_exit: true
            }
          }).select("id").single();
          if (!insertErr && newOrder) {
            autoDeployId = newOrder.id;
          } else if (insertErr) {
            autoDeployMsg = insertErr.message;
          }
        } else {
          autoDeployId = existingPending.id;
          autoDeployMsg = "already_pending";
        }
      } else {
        autoDeployMsg = "no_symbol_configured";
      }
      return new Response(JSON.stringify({
        strategy: toggledRow,
        auto_deploy_id: autoDeployId,
        auto_deploy_msg: autoDeployMsg
      }), {
        status: 200,
        headers
      });
    }
    // ── PAUSE ALL (emergency / dashboard kill switch) ─────────────────────
    if (action === "pause_all") {
      await supabase.from("pending_conditional_orders").update({
        status: "cancelled",
        error_message: "Paused via pause_all (dashboard / kill switch)",
      }).eq("user_id", user.id).in("status", [
        "pending",
        "scheduled",
      ]);
      const { data: activeBefore } = await supabase.from("user_strategies").select("id").eq("user_id", user.id).eq("is_active", true);
      const n = activeBefore?.length ?? 0;
      if (n > 0) {
        const { error: pauseErr } = await supabase.from("user_strategies").update({
          is_active: false,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id).eq("is_active", true);
        if (pauseErr) {
          return new Response(JSON.stringify({
            error: "Failed to pause strategies: " + pauseErr.message,
          }), {
            status: 500,
            headers,
          });
        }
      }
      return new Response(JSON.stringify({
        ok: true,
        strategies_paused: n,
      }), {
        status: 200,
        headers,
      });
    }
    // ── DELETE ────────────────────────────────────────────────────────────
    if (action === "delete") {
      const strategyId = (body.strategy_id ?? "").trim();
      if (!strategyId) {
        return new Response(JSON.stringify({
          error: "strategy_id is required"
        }), {
          status: 400,
          headers
        });
      }
      const delPlanId = await activePlanIdForUser(supabase, user.id);
      const delLimits = delPlanId ? getAlgoStrategyLimits(delPlanId) : null;
      if (!delLimits?.allowDeleteStrategies) {
        const trialOkDel = await hasActiveTrialAccess(supabase, user.id);
        if (trialOkDel) {
          const { data: rowMeta } = await supabase.from("user_strategies").select("trial_seed").eq("id", strategyId).eq("user_id", user.id).maybeSingle();
          if (rowMeta?.trial_seed === true) {
            return new Response(JSON.stringify({
              error: "Pre-built trial template strategies cannot be deleted. You can delete strategies you created yourself (up to the trial limit).",
              error_code: "DELETE_TRIAL_SEED_NOT_ALLOWED"
            }), {
              status: 403,
              headers
            });
          }
        } else {
          return new Response(JSON.stringify({
            error: "Your plan does not include deleting strategies. You can edit existing strategies, or upgrade to Pro to create and remove strategies freely.",
            error_code: "DELETE_NOT_ALLOWED"
          }), {
            status: 403,
            headers
          });
        }
      }
      // Get OpenAlgo strategy_id first
      const { data: existing } = await supabase.from("user_strategies").select("openalgo_strategy_id").eq("id", strategyId).eq("user_id", user.id).maybeSingle();
      // Delete from OpenAlgo
      const openalgoId = existing?.openalgo_strategy_id;
      if (openalgoId && OPENALGO_URL && OPENALGO_APP_KEY) {
        await fetch(`${OPENALGO_URL}/api/v1/platform/strategy/${openalgoId}`, {
          method: "DELETE",
          headers: {
            "X-Platform-Key": OPENALGO_APP_KEY
          }
        }).catch(()=>{});
      }
      const { error: deleteErr } = await supabase.from("user_strategies").delete().eq("id", strategyId).eq("user_id", user.id);
      if (deleteErr) {
        return new Response(JSON.stringify({
          error: "Failed to delete: " + deleteErr.message
        }), {
          status: 500,
          headers
        });
      }
      return new Response(JSON.stringify({
        success: true
      }), {
        status: 200,
        headers
      });
    }
    return new Response(JSON.stringify({
      error: `Unknown action: ${action}. Use create | update | delete | list | toggle | pause_all | seed_guide_presets`
    }), {
      status: 400,
      headers
    });
  } catch (err) {
    console.error("manage-strategy error:", err);
    return new Response(JSON.stringify({
      error: "Internal error"
    }), {
      status: 500,
      headers
    });
  }
});
