/**
 * manage-strategy — Supabase Edge Function
 *
 * CRUD for user strategies. Syncs create/delete to OpenAlgo automatically.
 *
 * Actions:
 *   create  — create strategy in Supabase + OpenAlgo
 *   update  — update strategy config in Supabase (name, symbols, risk, times)
 *   delete  — delete from Supabase + OpenAlgo
 *   list    — list all strategies for the user
 *   toggle  — toggle is_active
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENALGO_URL     = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");
const OPENALGO_APP_KEY = Deno.env.get("OPENALGO_APP_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = (body.action as string ?? "list").toLowerCase();

    // ── LIST ──────────────────────────────────────────────────────────────
    if (action === "list") {
      const { data, error } = await supabase
        .from("user_strategies")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      // Enrich each strategy with the full webhook URL so the client doesn't need to know OPENALGO_URL
      const strategies = (data ?? []).map((s: any) => ({
        ...s,
        webhook_url: s.openalgo_webhook_id && OPENALGO_URL
          ? `${OPENALGO_URL}/webhook/${s.openalgo_webhook_id}`
          : null,
      }));
      return new Response(JSON.stringify({ strategies }), { status: 200, headers });
    }

    // ── CREATE ────────────────────────────────────────────────────────────
    if (action === "create") {
      const name         = ((body.name as string) ?? "").trim();
      const description  = ((body.description as string) ?? "").trim();
      const tradingMode  = ((body.trading_mode as string) ?? "LONG").toUpperCase();
      const isIntraday   = body.is_intraday !== false;
      const startTime    = (body.start_time as string)    ?? "09:15";
      const endTime      = (body.end_time as string)      ?? "15:15";
      const squareoff    = (body.squareoff_time as string) ?? "15:15";
      const riskPct      = Number(body.risk_per_trade_pct ?? 1.0);
      const symbols      = Array.isArray(body.symbols) ? (body.symbols as unknown[]) : [];
      const paperStrategyType = ((body.paper_strategy_type as string) ?? "").trim() || null;
      const marketType = ((body.market_type as string) ?? "stocks").trim().toLowerCase();
      const entryConditions = (body.entry_conditions && typeof body.entry_conditions === "object")
        ? body.entry_conditions
        : {};
      const exitRaw = body.exit_conditions;
      const exitConditions = exitRaw === null
        ? null
        : (exitRaw && typeof exitRaw === "object")
        ? exitRaw
        : {};
      const autoExitOff = exitConditions && typeof exitConditions === "object" &&
        (exitConditions as { autoExitEnabled?: boolean }).autoExitEnabled === false;
      const slIn = body.stop_loss_pct;
      const tpIn = body.take_profit_pct;
      const slPct = autoExitOff
        ? null
        : slIn === null || slIn === undefined
        ? null
        : Number(slIn);
      const tpPct = autoExitOff
        ? null
        : tpIn === null || tpIn === undefined
        ? null
        : Number(tpIn);
      const positionConfig = (body.position_config && typeof body.position_config === "object")
        ? body.position_config
        : {};
      const riskConfig = (body.risk_config && typeof body.risk_config === "object")
        ? body.risk_config
        : {};
      const chartConfig = (body.chart_config && typeof body.chart_config === "object")
        ? body.chart_config
        : {};
      const executionDays = Array.isArray(body.execution_days)
        ? (body.execution_days as unknown[]).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0 && v <= 6)
        : [];

      if (!name) {
        return new Response(JSON.stringify({ error: "name is required" }), { status: 400, headers });
      }

      // Get user's OpenAlgo username from integration table
      const { data: integration } = await supabase
        .from("user_trading_integration")
        .select("openalgo_username, openalgo_api_key")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      const openalgoUsername = (integration as any)?.openalgo_username ?? "";
      const hasActiveBroker = Boolean(openalgoUsername);

      // Create strategy in OpenAlgo (if configured)
      let openalgoStrategyId: number | null = null;
      let openalgoWebhookId: string | null  = null;

      if (OPENALGO_URL && OPENALGO_APP_KEY && openalgoUsername) {
        const res = await fetch(`${OPENALGO_URL}/api/v1/platform/create-strategy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Platform-Key": OPENALGO_APP_KEY,
          },
          body: JSON.stringify({
            username:      openalgoUsername,
            name,
            trading_mode:  tradingMode,
            is_intraday:   isIntraday,
            start_time:    startTime,
            end_time:      endTime,
            squareoff_time: squareoff,
            stop_loss_pct: slPct ?? null,
            take_profit_pct: tpPct ?? null,
            symbols,
          }),
        });

        if (res.ok) {
          const d = await res.json() as { strategy_id: number; webhook_id: string };
          openalgoStrategyId = d.strategy_id;
          openalgoWebhookId  = d.webhook_id;
        } else {
          console.warn("OpenAlgo strategy creation failed:", await res.text());
        }
      }

      // Save in Supabase
      const { data: created, error: insertErr } = await supabase
        .from("user_strategies")
        .insert({
          user_id:              user.id,
          name,
          description,
          trading_mode:         tradingMode,
          is_intraday:          isIntraday,
          start_time:           startTime,
          end_time:             endTime,
          squareoff_time:       squareoff,
          risk_per_trade_pct:   riskPct,
          stop_loss_pct:        slPct,
          take_profit_pct:      tpPct,
          symbols,
          paper_strategy_type:  paperStrategyType,
          is_active: hasActiveBroker,
          market_type: marketType,
          entry_conditions: entryConditions,
          exit_conditions: exitConditions,
          position_config: positionConfig,
          risk_config: riskConfig,
          chart_config: chartConfig,
          execution_days: executionDays,
          openalgo_strategy_id: openalgoStrategyId,
          openalgo_webhook_id:  openalgoWebhookId,
        })
        .select()
        .single();

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: "Failed to save strategy: " + insertErr.message }),
          { status: 500, headers },
        );
      }

      return new Response(JSON.stringify({ strategy: created }), { status: 201, headers });
    }

    // ── UPDATE ────────────────────────────────────────────────────────────
    if (action === "update") {
      const strategyId = (body.strategy_id as string ?? "").trim();
      if (!strategyId) {
        return new Response(JSON.stringify({ error: "strategy_id is required" }), { status: 400, headers });
      }

      const { data: currentRow } = await supabase
        .from("user_strategies")
        .select("is_active")
        .eq("id", strategyId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!currentRow) {
        return new Response(JSON.stringify({ error: "Strategy not found" }), { status: 404, headers });
      }
      if ((currentRow as { is_active?: boolean }).is_active === true) {
        return new Response(
          JSON.stringify({
            error: "Cannot edit a live strategy. Deactivate it first, then edit.",
            error_code: "STRATEGY_LIVE_LOCKED",
          }),
          { status: 409, headers },
        );
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name           !== undefined) updates.name             = body.name;
      if (body.description    !== undefined) updates.description      = body.description;
      if (body.trading_mode   !== undefined) updates.trading_mode     = (body.trading_mode as string).toUpperCase();
      if (body.is_intraday    !== undefined) updates.is_intraday      = body.is_intraday;
      if (body.start_time     !== undefined) updates.start_time       = body.start_time;
      if (body.end_time       !== undefined) updates.end_time         = body.end_time;
      if (body.squareoff_time !== undefined) updates.squareoff_time   = body.squareoff_time;
      if (body.risk_per_trade_pct !== undefined) updates.risk_per_trade_pct = Number(body.risk_per_trade_pct);
      if (body.stop_loss_pct !== undefined) {
        updates.stop_loss_pct = body.stop_loss_pct === null ? null : Number(body.stop_loss_pct);
      }
      if (body.take_profit_pct !== undefined) {
        updates.take_profit_pct = body.take_profit_pct === null ? null : Number(body.take_profit_pct);
      }
      if (body.symbols        !== undefined) updates.symbols          = body.symbols;
      if (body.paper_strategy_type !== undefined) updates.paper_strategy_type = ((body.paper_strategy_type as string) ?? "").trim() || null;
      if (body.market_type    !== undefined) updates.market_type      = String(body.market_type).trim().toLowerCase();
      if (body.entry_conditions !== undefined && body.entry_conditions && typeof body.entry_conditions === "object") updates.entry_conditions = body.entry_conditions;
      if (body.exit_conditions !== undefined) {
        if (body.exit_conditions === null) updates.exit_conditions = null;
        else if (typeof body.exit_conditions === "object") updates.exit_conditions = body.exit_conditions;
      }
      if (body.position_config !== undefined && body.position_config && typeof body.position_config === "object") updates.position_config = body.position_config;
      if (body.risk_config !== undefined && body.risk_config && typeof body.risk_config === "object") updates.risk_config = body.risk_config;
      if (body.chart_config !== undefined && body.chart_config && typeof body.chart_config === "object") updates.chart_config = body.chart_config;
      if (body.execution_days !== undefined && Array.isArray(body.execution_days)) {
        updates.execution_days = (body.execution_days as unknown[])
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v >= 0 && v <= 6);
      }

      const { data: updated, error: updateErr } = await supabase
        .from("user_strategies")
        .update(updates)
        .eq("id", strategyId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateErr) {
        return new Response(
          JSON.stringify({ error: "Failed to update: " + updateErr.message }),
          { status: 500, headers },
        );
      }

      // Best-effort: sync risk changes to OpenAlgo so the auto-exit engine uses latest SL/TP%
      try {
        const wantsRiskSync = body.stop_loss_pct !== undefined || body.take_profit_pct !== undefined;
        if (wantsRiskSync && OPENALGO_URL && OPENALGO_APP_KEY) {
          const { data: integration } = await supabase
            .from("user_trading_integration")
            .select("openalgo_username")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .maybeSingle();

          const openalgoUsername = (integration as any)?.openalgo_username ?? "";
          if (openalgoUsername) {
            await fetch(`${OPENALGO_URL}/api/v1/platform/update-strategy-risk`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Platform-Key": OPENALGO_APP_KEY,
              },
              body: JSON.stringify({
                username: openalgoUsername,
                name: String((updated as any)?.name ?? ""),
                stop_loss_pct: (updated as any)?.stop_loss_pct,
                take_profit_pct: (updated as any)?.take_profit_pct,
              }),
            });
          }
        }
      } catch (_e) {
        // ignore sync failures
      }

      return new Response(JSON.stringify({ strategy: updated }), { status: 200, headers });
    }

    // ── TOGGLE ────────────────────────────────────────────────────────────
    if (action === "toggle") {
      const strategyId = (body.strategy_id as string ?? "").trim();
      if (!strategyId) {
        return new Response(JSON.stringify({ error: "strategy_id is required" }), { status: 400, headers });
      }

      const { data: current } = await supabase
        .from("user_strategies")
        .select("is_active")
        .eq("id", strategyId)
        .eq("user_id", user.id)
        .maybeSingle();

      const enabling = !(current as any)?.is_active;
      if (enabling) {
        const { data: integration } = await supabase
          .from("user_trading_integration")
          .select("openalgo_username")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        const openalgoUsername = (integration as any)?.openalgo_username ?? "";
        if (!openalgoUsername) {
          return new Response(
            JSON.stringify({ error: "Connect broker first to deploy/activate this strategy." }),
            { status: 400, headers },
          );
        }

        const { data: rowSym } = await supabase
          .from("user_strategies")
          .select("symbols")
          .eq("id", strategyId)
          .eq("user_id", user.id)
          .maybeSingle();
        const syms = (rowSym as { symbols?: unknown })?.symbols;
        let hasTradableSymbol = false;
        if (Array.isArray(syms)) {
          for (const x of syms) {
            if (typeof x === "string" && x.trim().length > 0) {
              hasTradableSymbol = true;
              break;
            }
            if (x && typeof x === "object") {
              const sym = String((x as Record<string, unknown>).symbol ?? "").trim();
              const q = Number((x as Record<string, unknown>).quantity ?? 0);
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
          return new Response(
            JSON.stringify({
              error:
                "Set a symbol and quantity before going live (confirm in the activation dialog or edit the strategy).",
              error_code: "ACTIVATION_NEEDS_SYMBOL",
            }),
            { status: 400, headers },
          );
        }
      }

      const { data: toggled, error: toggleErr } = await supabase
        .from("user_strategies")
        .update({ is_active: !(current as any)?.is_active, updated_at: new Date().toISOString() })
        .eq("id", strategyId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (toggleErr) {
        return new Response(
          JSON.stringify({ error: "Failed to toggle: " + toggleErr.message }),
          { status: 500, headers },
        );
      }

      return new Response(JSON.stringify({ strategy: toggled }), { status: 200, headers });
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    if (action === "delete") {
      const strategyId = (body.strategy_id as string ?? "").trim();
      if (!strategyId) {
        return new Response(JSON.stringify({ error: "strategy_id is required" }), { status: 400, headers });
      }

      // Get OpenAlgo strategy_id first
      const { data: existing } = await supabase
        .from("user_strategies")
        .select("openalgo_strategy_id")
        .eq("id", strategyId)
        .eq("user_id", user.id)
        .maybeSingle();

      // Delete from OpenAlgo
      const openalgoId = (existing as any)?.openalgo_strategy_id;
      if (openalgoId && OPENALGO_URL && OPENALGO_APP_KEY) {
        await fetch(`${OPENALGO_URL}/api/v1/platform/strategy/${openalgoId}`, {
          method: "DELETE",
          headers: { "X-Platform-Key": OPENALGO_APP_KEY },
        }).catch(() => {/* non-fatal */});
      }

      const { error: deleteErr } = await supabase
        .from("user_strategies")
        .delete()
        .eq("id", strategyId)
        .eq("user_id", user.id);

      if (deleteErr) {
        return new Response(
          JSON.stringify({ error: "Failed to delete: " + deleteErr.message }),
          { status: 500, headers },
        );
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Use create | update | delete | list | toggle` }),
      { status: 400, headers },
    );

  } catch (err) {
    console.error("manage-strategy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers },
    );
  }
});
