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
      return new Response(JSON.stringify({ strategies: data ?? [] }), { status: 200, headers });
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
      const slPct        = Number(body.stop_loss_pct       ?? 2.0);
      const tpPct        = Number(body.take_profit_pct     ?? 4.0);
      const symbols      = (body.symbols as unknown[])    ?? [];

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

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name           !== undefined) updates.name             = body.name;
      if (body.description    !== undefined) updates.description      = body.description;
      if (body.trading_mode   !== undefined) updates.trading_mode     = (body.trading_mode as string).toUpperCase();
      if (body.is_intraday    !== undefined) updates.is_intraday      = body.is_intraday;
      if (body.start_time     !== undefined) updates.start_time       = body.start_time;
      if (body.end_time       !== undefined) updates.end_time         = body.end_time;
      if (body.squareoff_time !== undefined) updates.squareoff_time   = body.squareoff_time;
      if (body.risk_per_trade_pct !== undefined) updates.risk_per_trade_pct = Number(body.risk_per_trade_pct);
      if (body.stop_loss_pct  !== undefined) updates.stop_loss_pct   = Number(body.stop_loss_pct);
      if (body.take_profit_pct !== undefined) updates.take_profit_pct = Number(body.take_profit_pct);
      if (body.symbols        !== undefined) updates.symbols          = body.symbols;

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
