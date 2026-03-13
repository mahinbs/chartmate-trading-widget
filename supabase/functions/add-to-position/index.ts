/**
 * add-to-position — Add more capital to an existing active trade.
 * Recalculates avg entry, shares, investment, SL/TP.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AddToPositionRequest {
  tradeId: string;
  additionalAmount: number;
  currentPrice: number;
  /** If crypto, allow fractional shares */
  allowFractional?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: AddToPositionRequest = await req.json();
    const { tradeId, additionalAmount, currentPrice, allowFractional } = body;

    if (!tradeId || additionalAmount <= 0 || !currentPrice || currentPrice <= 0) {
      return new Response(
        JSON.stringify({ error: "tradeId, additionalAmount (> 0), and currentPrice required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: trade, error: fetchErr } = await supabase
      .from("active_trades")
      .select("*")
      .eq("id", tradeId)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !trade) {
      return new Response(JSON.stringify({ error: "Trade not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["active", "monitoring", "exit_zone"].includes(trade.status)) {
      return new Response(JSON.stringify({ error: "Can only add to active trades" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isCrypto = /BTC|ETH|-USD|CRYPTO/i.test(trade.symbol ?? "");
    const frac = allowFractional ?? isCrypto;
    const addShares = frac ? additionalAmount / currentPrice : Math.floor(additionalAmount / currentPrice);

    if (addShares <= 0) {
      return new Response(JSON.stringify({ error: "Additional amount too small for at least 1 share" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const oldShares = parseFloat(trade.shares ?? 0);
    const oldInvestment = parseFloat(trade.investment_amount ?? 0);
    const oldEntry = parseFloat(trade.entry_price ?? 0);
    const slPct = parseFloat(trade.stop_loss_percentage ?? 5);
    const tpPct = parseFloat(trade.target_profit_percentage ?? 10);

    const newShares = oldShares + addShares;
    const newInvestment = oldInvestment + additionalAmount;
    const newAvgEntry = (oldEntry * oldShares + currentPrice * addShares) / newShares;
    const isSell = trade.action === "SELL";
    const newStopLoss = isSell
      ? newAvgEntry * (1 + slPct / 100)
      : newAvgEntry * (1 - slPct / 100);
    const newTakeProfit = isSell
      ? newAvgEntry * (1 - tpPct / 100)
      : newAvgEntry * (1 + tpPct / 100);
    const signedPnl = (currentPrice - newAvgEntry) * newShares * (isSell ? -1 : 1);
    const signedPnlPct = newAvgEntry > 0
      ? ((currentPrice - newAvgEntry) / newAvgEntry) * 100 * (isSell ? -1 : 1)
      : 0;

    const { error: updateErr } = await supabase
      .from("active_trades")
      .update({
        shares: frac ? newShares : Math.floor(newShares),
        investment_amount: newInvestment,
        entry_price: newAvgEntry,
        stop_loss_price: newStopLoss,
        take_profit_price: newTakeProfit,
        current_price: currentPrice,
        current_pnl: signedPnl,
        current_pnl_percentage: signedPnlPct,
        last_price_update: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId)
      .eq("user_id", user.id);

    if (updateErr) {
      console.error("add-to-position update error:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to update trade" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Position updated",
        updated: {
          shares: frac ? newShares : Math.floor(newShares),
          investmentAmount: newInvestment,
          avgEntryPrice: newAvgEntry,
          stopLossPrice: newStopLoss,
          takeProfitPrice: newTakeProfit,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("add-to-position error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
