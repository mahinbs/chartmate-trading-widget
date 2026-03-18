/**
 * backtest-combined — Runs Edge backtest-strategy + OpenAlgo VectorBT in parallel,
 * cross-checks market data (last price alignment), returns merged payload for UI + Gemini.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anon) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers });
    }

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
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    if (!symbol) {
      return new Response(JSON.stringify({ error: "symbol is required" }), { status: 400, headers });
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
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ symbol, strategy, action, exchange }),
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, data: j };
    });

    const vbtPromise = fetch(`${fnBase}/backtest-vectorbt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: authHeader,
      },
      body: JSON.stringify({
        symbol,
        exchange,
        strategy,
        action,
        days,
        stop_loss_pct: sl,
        take_profit_pct: tp,
      }),
    }).then((r) => r.json().then((d) => ({ ok: r.ok, data: d })));

    const [edgeWrap, vbtWrap] = await Promise.all([edgePromise, vbtPromise]);
    const edge = edgeWrap.data;
    if (!edgeWrap.ok) {
      return new Response(
        JSON.stringify({ error: (edge as any)?.error ?? "Edge backtest HTTP error", edge, vectorbt: null }),
        { status: 502, headers },
      );
    }
    const edgeErr = (edge as any)?.error;
    if (edgeErr) {
      return new Response(
        JSON.stringify({ error: edgeErr, edge, vectorbt: null }),
        { status: 200, headers },
      );
    }
    const vbt = vbtWrap.ok && !(vbtWrap.data as any)?.error ? vbtWrap.data : null;
    const vbtError = vbtWrap.ok ? null : (vbtWrap.data as any)?.error ?? "VectorBT unavailable";

    const pe = (edge as any)?.currentIndicators?.price;
    const pv = vbt?.currentIndicators?.price;
    let dataConsistency: Record<string, unknown> = {
      edgePrice: pe ?? null,
      vectorbtPrice: pv ?? null,
      pctDiff: null as number | null,
      aligned: null as boolean | null,
      notes: [] as string[],
    };
    if (typeof pe === "number" && typeof pv === "number" && pe > 0 && pv > 0) {
      const pct = (Math.abs(pe - pv) / pe) * 100;
      (dataConsistency as any).pctDiff = Math.round(pct * 100) / 100;
      (dataConsistency as any).aligned = pct < 1.5;
      if (pct >= 1.5) {
        (dataConsistency as any).notes.push(
          `Last-bar prices differ ~${pct.toFixed(2)}% between Edge (${pe}) and VectorBT (${pv}) — possible bar timing or data source mismatch.`,
        );
      }
    }
    if ((edge as any)?.dataSource) {
      (dataConsistency as any).notes.push(`Edge OHLC source: ${(edge as any).dataSource}`);
    }
    if (vbt?.data_source) {
      (dataConsistency as any).notes.push(`VectorBT OHLC source: ${vbt.data_source}`);
    }
    if (!vbt) {
      (dataConsistency as any).notes.push(`VectorBT: ${vbtError ?? "skipped"}`);
    }

    const eTr = Number((edge as any)?.totalTrades ?? 0);
    const eWr = Number((edge as any)?.winRate ?? 0);
    const eRet = Number((edge as any)?.totalReturn ?? 0);
    const vTr = Number(vbt?.totalTrades ?? 0);
    const vWr = Number(vbt?.winRate ?? 0);
    const vRet = Number(vbt?.totalReturn ?? 0);

    const both = vbt && !(edge as any)?.error;
    const avgWinRate = both ? (eWr + vWr) / 2 : eWr || vWr;
    const avgReturn = both ? (eRet + vRet) / 2 : (vbt ? vRet : eRet);
    let agreement = "single_engine";
    if (both) {
      const sameSign = (eRet >= 0) === (vRet >= 0);
      agreement = sameSign ? "returns_same_sign" : "returns_divergent";
    }

    const geminiContext = {
      edge: {
        engine: "edge_twelve_data_yahoo",
        dataSource: (edge as any)?.dataSource,
        trades: eTr,
        winRate: eWr,
        totalReturn: eRet,
        strategyAchieved: (edge as any)?.strategyAchieved,
      },
      vectorbt: vbt
        ? {
            engine: "vectorbt",
            dataSource: vbt.data_source,
            trades: vTr,
            winRate: vWr,
            totalReturn: vRet,
            sharpeRatio: vbt.sharpeRatio,
            strategyAchieved: vbt.strategyAchieved,
          }
        : null,
      dataConsistency,
      summary: both
        ? `Two engines: Edge ${eTr} trades ${eWr}% WR ${eRet}% return (${(edge as any)?.dataSource}); VectorBT ${vTr} trades ${vWr}% WR ${vRet}% (${vbt?.data_source}). Agreement: ${agreement}.`
        : `Edge: ${eTr} trades, ${eWr}% WR, ${eRet}% return. ${vbt ? "" : "VectorBT failed — use Edge only."}`,
    };

    const merged = {
      winRate: Math.round(avgWinRate * 10) / 10,
      totalReturn: Math.round(avgReturn * 100) / 100,
      edge: {
        totalTrades: eTr,
        wins: (edge as any)?.wins ?? 0,
        losses: (edge as any)?.losses ?? 0,
        winRate: eWr,
        totalReturn: eRet,
        maxDrawdown: (edge as any)?.maxDrawdown,
        profitFactor: (edge as any)?.profitFactor,
        dataSource: (edge as any)?.dataSource,
      },
      vectorbt: vbt
        ? {
            totalTrades: vTr,
            wins: vbt.wins ?? 0,
            losses: vbt.losses ?? 0,
            winRate: vWr,
            totalReturn: vRet,
            maxDrawdown: vbt.maxDrawdown,
            profitFactor: vbt.profitFactor,
            dataSource: vbt.data_source,
            sharpeRatio: vbt.sharpeRatio,
          }
        : null,
      strategyAchieved: (edge as any)?.strategyAchieved && (vbt ? vbt.strategyAchieved : true),
      achievementReason: (edge as any)?.achievementReason ?? vbt?.achievementReason,
      backtestPeriod: (edge as any)?.backtestPeriod ?? vbt?.backtestPeriod,
      sampleTrades: (edge as any)?.sampleTrades?.length
        ? (edge as any).sampleTrades
        : vbt?.sampleTrades,
      currentIndicators: (edge as any)?.currentIndicators ?? vbt?.currentIndicators,
    };

    return new Response(
      JSON.stringify({
        engine: "combined",
        edge,
        vectorbt: vbt,
        merged,
        dataConsistency,
        agreement,
        geminiContext,
        error: (edge as any)?.error ?? null,
      }),
      { status: 200, headers },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});
