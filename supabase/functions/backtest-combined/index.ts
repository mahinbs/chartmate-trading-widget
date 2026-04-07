/**
 * backtest-combined — Runs Edge backtest-strategy + OpenAlgo VectorBT in parallel,
 * cross-checks market data (last price alignment), returns merged payload for UI + Gemini.
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
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
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anon) {
      return new Response(JSON.stringify({
        error: "Server misconfigured"
      }), {
        status: 500,
        headers
      });
    }
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
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    if (!symbol) {
      return new Response(JSON.stringify({
        error: "symbol is required"
      }), {
        status: 400,
        headers
      });
    }
    const exchange = String(body.exchange ?? "NSE").toUpperCase();
    const strategy = String(body.strategy ?? "trend_following");
    const action = String(body.action ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
    const sl = Number(body.stop_loss_pct ?? 2);
    const tp = Number(body.take_profit_pct ?? 4);
    const days = Number(body.days ?? 365);
    const fnBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
    const edgePromise = fetch(`${fnBase}/backtest-strategy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`
      },
      body: JSON.stringify({
        symbol,
        strategy,
        action,
        exchange
      })
    }).then(async (r)=>{
      const j = await r.json().catch(()=>({}));
      return {
        ok: r.ok,
        data: j
      };
    });
    const vbtPromise = fetch(`${fnBase}/backtest-vectorbt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: authHeader
      },
      body: JSON.stringify({
        symbol,
        exchange,
        strategy,
        action,
        days,
        stop_loss_pct: sl,
        take_profit_pct: tp
      })
    }).then((r)=>r.json().then((d)=>({
          ok: r.ok,
          data: d
        })));
    const [edgeWrap, vbtWrap] = await Promise.all([
      edgePromise,
      vbtPromise
    ]);
    const edge = edgeWrap.data;
    if (!edgeWrap.ok) {
      return new Response(JSON.stringify({
        error: edge?.error ?? "Edge backtest HTTP error",
        edge,
        vectorbt: null
      }), {
        status: 502,
        headers
      });
    }
    const edgeErr = edge?.error;
    if (edgeErr) {
      return new Response(JSON.stringify({
        error: edgeErr,
        edge,
        vectorbt: null
      }), {
        status: 200,
        headers
      });
    }
    const vbt = vbtWrap.ok && !vbtWrap.data?.error ? vbtWrap.data : null;
    const vbtError = vbtWrap.ok ? null : vbtWrap.data?.error ?? "VectorBT unavailable";
    const pe = edge?.currentIndicators?.price;
    const pv = vbt?.currentIndicators?.price;
    let dataConsistency = {
      edgePrice: pe ?? null,
      vectorbtPrice: pv ?? null,
      pctDiff: null,
      aligned: null,
      notes: []
    };
    if (typeof pe === "number" && typeof pv === "number" && pe > 0 && pv > 0) {
      const pct = Math.abs(pe - pv) / pe * 100;
      dataConsistency.pctDiff = Math.round(pct * 100) / 100;
      dataConsistency.aligned = pct < 1.5;
      if (pct >= 1.5) {
        dataConsistency.notes.push(`Last-bar prices differ ~${pct.toFixed(2)}% between Edge (${pe}) and VectorBT (${pv}) — possible bar timing or data source mismatch.`);
      }
    }
    if (edge?.dataSource) {
      dataConsistency.notes.push(`Edge OHLC source: ${edge.dataSource}`);
    }
    if (vbt?.data_source) {
      dataConsistency.notes.push(`VectorBT OHLC source: ${vbt.data_source}`);
    }
    if (!vbt) {
      dataConsistency.notes.push(`VectorBT: ${vbtError ?? "skipped"}`);
    }
    const eTr = Number(edge?.totalTrades ?? 0);
    const eWr = Number(edge?.winRate ?? 0);
    const eRet = Number(edge?.totalReturn ?? 0);
    const vTr = Number(vbt?.totalTrades ?? 0);
    const vWr = Number(vbt?.winRate ?? 0);
    const vRet = Number(vbt?.totalReturn ?? 0);
    const both = vbt && !edge?.error;
    const avgWinRate = both ? (eWr + vWr) / 2 : eWr || vWr;
    const avgReturn = both ? (eRet + vRet) / 2 : vbt ? vRet : eRet;
    let agreement = "single_engine";
    if (both) {
      const sameSign = eRet >= 0 === vRet >= 0;
      agreement = sameSign ? "returns_same_sign" : "returns_divergent";
    }
    const geminiContext = {
      edge: {
        engine: "edge_twelve_data_yahoo",
        dataSource: edge?.dataSource,
        trades: eTr,
        winRate: eWr,
        totalReturn: eRet,
        strategyAchieved: edge?.strategyAchieved
      },
      vectorbt: vbt ? {
        engine: "vectorbt",
        dataSource: vbt.data_source,
        trades: vTr,
        winRate: vWr,
        totalReturn: vRet,
        sharpeRatio: vbt.sharpeRatio,
        strategyAchieved: vbt.strategyAchieved
      } : null,
      dataConsistency,
      summary: both ? `Two engines: Edge ${eTr} trades ${eWr}% WR ${eRet}% return (${edge?.dataSource}); VectorBT ${vTr} trades ${vWr}% WR ${vRet}% (${vbt?.data_source}). Agreement: ${agreement}.` : `Edge: ${eTr} trades, ${eWr}% WR, ${eRet}% return. ${vbt ? "" : "VectorBT failed — use Edge only."}`
    };
    const merged = {
      winRate: Math.round(avgWinRate * 10) / 10,
      totalReturn: Math.round(avgReturn * 100) / 100,
      edge: {
        totalTrades: eTr,
        wins: edge?.wins ?? 0,
        losses: edge?.losses ?? 0,
        winRate: eWr,
        totalReturn: eRet,
        maxDrawdown: edge?.maxDrawdown,
        profitFactor: edge?.profitFactor,
        dataSource: edge?.dataSource
      },
      vectorbt: vbt ? {
        totalTrades: vTr,
        wins: vbt.wins ?? 0,
        losses: vbt.losses ?? 0,
        winRate: vWr,
        totalReturn: vRet,
        maxDrawdown: vbt.maxDrawdown,
        profitFactor: vbt.profitFactor,
        dataSource: vbt.data_source,
        sharpeRatio: vbt.sharpeRatio
      } : null,
      strategyAchieved: edge?.strategyAchieved && (vbt ? vbt.strategyAchieved : true),
      achievementReason: edge?.achievementReason ?? vbt?.achievementReason,
      backtestPeriod: edge?.backtestPeriod ?? vbt?.backtestPeriod,
      sampleTrades: edge?.sampleTrades?.length ? edge.sampleTrades : vbt?.sampleTrades,
      currentIndicators: edge?.currentIndicators ?? vbt?.currentIndicators
    };
    return new Response(JSON.stringify({
      engine: "combined",
      edge,
      vectorbt: vbt,
      merged,
      dataConsistency,
      agreement,
      geminiContext,
      error: edge?.error ?? null
    }), {
      status: 200,
      headers
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({
      error: msg
    }), {
      status: 500,
      headers
    });
  }
});
