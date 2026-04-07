/**
 * add-to-position — Add more capital to an existing active trade.
 * Recalculates avg entry, shares, investment, SL/TP.
 */ import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
/** DB: current_pnl_percentage is DECIMAL(8,4) → max |value| 9999.9999 */ const clampPct = (n)=>{
  if (!Number.isFinite(n)) return 0;
  const max = 9999.9999;
  return Math.max(-max, Math.min(max, n));
};
const roundPrice = (n)=>{
  if (!Number.isFinite(n)) throw new Error("Invalid price (non-finite)");
  return Math.round(n * 1e4) / 1e4;
};
const roundMoney = (n)=>{
  if (!Number.isFinite(n)) throw new Error("Invalid money amount (non-finite)");
  return Math.round(n * 1e2) / 1e2;
};
const roundShares = (n, frac)=>{
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid shares (non-finite or non-positive)");
  return frac ? Math.round(n * 1e8) / 1e8 : Math.floor(n);
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: "Missing authorization"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({
        error: "Invalid token"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const body = await req.json();
    const { tradeId, additionalAmount, currentPrice, quantity, marketPrice, allowFractional } = body;
    const hasQtyPrice = quantity != null && Number(quantity) > 0 && marketPrice != null && Number(marketPrice) > 0;
    const hasLegacyAmount = additionalAmount != null && Number(additionalAmount) > 0 && currentPrice > 0;
    if (!tradeId || !hasQtyPrice && !hasLegacyAmount) {
      return new Response(JSON.stringify({
        error: "Provide tradeId and either (quantity > 0 and marketPrice > 0) or (additionalAmount > 0 and currentPrice > 0)"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { data: trade, error: fetchErr } = await supabase.from("active_trades").select("*").eq("id", tradeId).eq("user_id", user.id).single();
    if (fetchErr || !trade) {
      return new Response(JSON.stringify({
        error: "Trade not found or access denied"
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    if (![
      "active",
      "monitoring",
      "exit_zone"
    ].includes(trade.status)) {
      return new Response(JSON.stringify({
        error: "Can only add to active trades"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const isCrypto = /BTC|ETH|-USD|CRYPTO/i.test(trade.symbol ?? "");
    const frac = allowFractional ?? isCrypto;
    let addShares;
    let addNotional;
    let priceForAvg;
    let markPrice;
    if (hasQtyPrice) {
      const q = Number(quantity);
      const px = Number(marketPrice);
      addShares = frac ? q : Math.floor(q);
      priceForAvg = px;
      markPrice = px;
      addNotional = addShares * px;
    } else {
      const amt = Number(additionalAmount);
      const px = Number(currentPrice);
      addShares = frac ? amt / px : Math.floor(amt / px);
      priceForAvg = px;
      markPrice = px;
      addNotional = amt;
    }
    if (addShares <= 0) {
      return new Response(JSON.stringify({
        error: "Quantity too small — need at least one share (or increase amount)"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const oldShares = parseFloat(trade.shares ?? 0);
    const oldInvestment = parseFloat(trade.investment_amount ?? 0);
    const oldEntry = parseFloat(trade.entry_price ?? 0);
    const slPct = parseFloat(trade.stop_loss_percentage ?? 5);
    const tpPct = parseFloat(trade.target_profit_percentage ?? 10);
    const newShares = oldShares + addShares;
    const newInvestment = oldInvestment + addNotional;
    const newAvgEntry = (oldEntry * oldShares + priceForAvg * addShares) / newShares;
    const isSell = trade.action === "SELL";
    const newStopLoss = isSell ? newAvgEntry * (1 + slPct / 100) : newAvgEntry * (1 - slPct / 100);
    const newTakeProfit = isSell ? newAvgEntry * (1 - tpPct / 100) : newAvgEntry * (1 + tpPct / 100);
    const signedPnl = (markPrice - newAvgEntry) * newShares * (isSell ? -1 : 1);
    const rawPct = newAvgEntry > 0 ? (markPrice - newAvgEntry) / newAvgEntry * 100 * (isSell ? -1 : 1) : 0;
    const signedPnlPct = clampPct(rawPct);
    let sharesOut;
    let investmentOut;
    let entryOut;
    let slOut;
    let tpOut;
    let markOut;
    let pnlOut;
    try {
      sharesOut = roundShares(frac ? newShares : Math.floor(newShares), frac);
      investmentOut = roundMoney(newInvestment);
      entryOut = roundPrice(newAvgEntry);
      slOut = roundPrice(newStopLoss);
      tpOut = roundPrice(newTakeProfit);
      markOut = roundPrice(markPrice);
      pnlOut = roundMoney(signedPnl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Numeric validation failed";
      console.error("add-to-position numeric error:", msg, {
        newShares,
        newInvestment,
        newAvgEntry
      });
      return new Response(JSON.stringify({
        error: msg
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { data: updatedRows, error: updateErr } = await supabase.from("active_trades").update({
      shares: sharesOut,
      investment_amount: investmentOut,
      entry_price: entryOut,
      stop_loss_price: slOut,
      take_profit_price: tpOut,
      current_price: markOut,
      current_pnl: pnlOut,
      current_pnl_percentage: signedPnlPct,
      last_price_update: new Date().toISOString()
    }).eq("id", tradeId).eq("user_id", user.id).select("id");
    if (updateErr) {
      console.error("add-to-position update error:", JSON.stringify(updateErr));
      return new Response(JSON.stringify({
        error: "Failed to update trade",
        details: updateErr.message,
        code: updateErr.code
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    if (!updatedRows?.length) {
      return new Response(JSON.stringify({
        error: "No row updated (trade missing or access denied)"
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      success: true,
      message: "Position updated",
      updated: {
        shares: sharesOut,
        investmentAmount: investmentOut,
        avgEntryPrice: entryOut,
        stopLossPrice: slOut,
        takeProfitPrice: tpOut
      }
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    console.error("add-to-position error:", e);
    return new Response(JSON.stringify({
      error: "Internal server error"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
