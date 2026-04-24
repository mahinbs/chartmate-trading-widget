/**
 * rsi-divergence-scanner — Batch multi-stock RSI divergence scan.
 *
 * - No weekend / execution_days skip (crypto & global assets run 24/7).
 * - pg_cron: every minute (`* * * * *`) — Postgres cron cannot run every second; use
 *   stream-conditional-tick + runRsiDivergenceTickScan for per-tick updates on LTP.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detectRsiDivergenceHits } from "../_shared/algoGuideDetectors.ts";
import { fetchYahoo1hBars } from "../_shared/rsiDivergenceTickScan.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret",
};

const TOP_NSE_SYMBOLS: string[] = [
  "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "BHARTIARTL.NS", "ICICIBANK.NS",
  "SBIN.NS", "INFY.NS", "LICI.NS", "HINDUNILVR.NS", "ITC.NS",
  "KOTAKBANK.NS", "LT.NS", "HCLTECH.NS", "MARUTI.NS", "SUNPHARMA.NS",
  "BAJFINANCE.NS", "AXISBANK.NS", "ONGC.NS", "NTPC.NS", "TATAMOTORS.NS",
  "WIPRO.NS", "ADANIPORTS.NS", "POWERGRID.NS", "ULTRACEMCO.NS", "TITAN.NS",
  "M&M.NS", "NESTLEIND.NS", "TATASTEEL.NS", "BAJAJFINSV.NS", "TECHM.NS",
  "JSWSTEEL.NS", "HINDALCO.NS", "GRASIM.NS", "ADANIENT.NS", "DRREDDY.NS",
  "COALINDIA.NS", "CIPLA.NS", "BPCL.NS", "APOLLOHOSP.NS", "BRITANNIA.NS",
  "EICHERMOT.NS", "HEROMOTOCO.NS", "DIVISLAB.NS", "SBILIFE.NS", "HDFCLIFE.NS",
  "SHRIRAMFIN.NS", "TRENT.NS", "BEL.NS", "INDUSINDBK.NS", "BAJAJ-AUTO.NS",
  "AMBUJACEM.NS", "BANKBARODA.NS", "BERGEPAINT.NS", "BIOCON.NS", "BOSCHLTD.NS",
  "CANBK.NS", "CHOLAFIN.NS", "COLPAL.NS", "DABUR.NS", "DLF.NS",
  "GAIL.NS", "GODREJCP.NS", "HAVELLS.NS", "ICICIGI.NS", "ICICIPRULI.NS",
  "INDHOTEL.NS", "IOC.NS", "IRCTC.NS", "JINDALSTEL.NS", "LUPIN.NS",
  "MARICO.NS", "MCDOWELL-N.NS", "MFSL.NS", "OFSS.NS", "PAGEIND.NS",
  "PFC.NS", "PIDILITIND.NS", "PNB.NS", "RECLTD.NS", "SAIL.NS",
  "SIEMENS.NS", "SRF.NS", "TORNTPHARM.NS", "TATACONSUM.NS", "TATAPOWER.NS",
  "TIINDIA.NS", "UNIONBANK.NS", "UPL.NS", "VEDL.NS", "VOLTAS.NS",
  "WHIRLPOOL.NS", "YESBANK.NS", "ZOMATO.NS", "NYKAA.NS", "PAYTM.NS",
  "MPHASIS.NS", "COFORGE.NS", "PERSISTENT.NS", "LTIM.NS", "KPITTECH.NS",
];

function istDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  if (CRON_SECRET && req.headers.get("X-Cron-Secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers,
    });
  }

  try {
    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: strategies, error: stratErr } = await supabase
      .from("user_strategies")
      .select(
        "id, user_id, name, position_config, entry_conditions, stop_loss_pct, take_profit_pct, risk_per_trade_pct",
      )
      .filter("entry_conditions->>algoGuidePreset", "eq", "rsi_divergence");

    if (stratErr) {
      return new Response(JSON.stringify({ error: stratErr.message }), { status: 500, headers });
    }
    if (!strategies || strategies.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, created: 0, message: "No RSI divergence strategies found" }), {
        status: 200,
        headers,
      });
    }

    const todayStr = istDateStr();
    let totalScanned = 0;
    let totalCreated = 0;
    const allResults: Record<string, unknown>[] = [];

    for (const strategy of strategies) {
      const posCfg = strategy.position_config && typeof strategy.position_config === "object"
        ? strategy.position_config as Record<string, unknown>
        : {};
      const universe: string[] = Array.isArray(posCfg.stockUniverse) && posCfg.stockUniverse.length > 0
        ? (posCfg.stockUniverse as string[])
        : TOP_NSE_SYMBOLS;

      const strategyResults: { symbol: string; result: string }[] = [];

      const { data: existingPending } = await supabase
        .from("pending_conditional_orders")
        .select("symbol")
        .eq("strategy_id", strategy.id)
        .eq("user_id", strategy.user_id)
        .in("status", ["pending", "monitoring"])
        .gte("created_at", `${todayStr}T00:00:00Z`);

      const alreadyPendingSymbols = new Set(
        (existingPending ?? []).map((r: { symbol: string }) => String(r.symbol ?? "").toUpperCase()),
      );

      const FETCH_PARALLEL = 12;
      for (let batchStart = 0; batchStart < universe.length; batchStart += FETCH_PARALLEL) {
        const batch = universe.slice(batchStart, batchStart + FETCH_PARALLEL);
        const fetched = await Promise.all(
          batch.map(async (symbol) => ({
            symbol,
            ohlcv: await fetchYahoo1hBars(symbol, 200),
          })),
        );

        for (const { symbol, ohlcv } of fetched) {
          totalScanned++;
          const symbolUpper = symbol.toUpperCase().replace(/\.NS$/, "").replace(/\.BO$/, "");

          if (alreadyPendingSymbols.has(symbolUpper) || alreadyPendingSymbols.has(symbol.toUpperCase())) {
            strategyResults.push({ symbol, result: "already_pending" });
            continue;
          }

          if (!ohlcv) {
            strategyResults.push({ symbol, result: "no_data" });
            continue;
          }

          const hits = detectRsiDivergenceHits(ohlcv.c, ohlcv.h, ohlcv.l, undefined);
          if (hits.length === 0) {
            strategyResults.push({ symbol, result: "no_hit" });
            continue;
          }

          const latestHit = hits[hits.length - 1];
          const hitTimeSec = ohlcv.t[latestHit.i] ?? 0;
          const ageHours = (Date.now() / 1000 - hitTimeSec) / 3600;

          if (ageHours > 3) {
            strategyResults.push({ symbol, result: "hit_stale", ageHours: Math.round(ageHours) });
            continue;
          }

          const entryPrice = ohlcv.c[latestHit.i];
          const swingPoint = Number(latestHit.meta?.rsiSwingPoint ?? 0);
          const priorSwing = Number(latestHit.meta?.rsiPriorSwing ?? 0);
          const slPct = Number(strategy.stop_loss_pct ?? 1) / 100;

          const isBuy = latestHit.side === "BUY";
          const slPrice = Number.isFinite(swingPoint) && swingPoint > 0
            ? swingPoint
            : isBuy ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct);
          const slDist = Math.abs(entryPrice - slPrice);
          const tpPrice = Number.isFinite(priorSwing) && priorSwing > 0
            ? priorSwing
            : isBuy ? entryPrice + 3 * slDist : entryPrice - 3 * slDist;

          const riskPct = Number(strategy.risk_per_trade_pct ?? 1) / 100;
          const capitalGuess = 100000;
          const riskAmount = capitalGuess * riskPct;
          const quantity = slDist > 0 ? Math.max(1, Math.round(riskAmount / slDist)) : 1;

          const u = symbol.toUpperCase();
          const exchange = u.includes("-USD") || u.includes("-USDT") ? "CRYPTO" : u.endsWith(".BO") ? "BSE" : "NSE";
          const product = exchange === "CRYPTO" ? "SPOT" : "MIS";

          const { error: insertErr } = await supabase.from("pending_conditional_orders").insert({
            user_id: strategy.user_id,
            strategy_id: strategy.id,
            symbol: symbolUpper,
            exchange,
            action: latestHit.side,
            quantity,
            product,
            status: "pending",
            paper_strategy_type: "mean_reversion",
            is_paper_trade: true,
            notes: JSON.stringify({
              source: "rsi_divergence_scanner",
              scannedAt: new Date().toISOString(),
              hitBar: latestHit.i,
              entryPrice,
              stopLossPrice: Math.round(slPrice * 100) / 100,
              takeProfitPrice: Math.round(tpPrice * 100) / 100,
              ageHours: Math.round(ageHours * 10) / 10,
              rsiSwingPoint: swingPoint,
              rsiPriorSwing: priorSwing,
            }),
          });

          if (insertErr) {
            strategyResults.push({ symbol, result: `insert_error: ${insertErr.message}` });
          } else {
            totalCreated++;
            alreadyPendingSymbols.add(symbolUpper);
            strategyResults.push({ symbol, result: "created", side: latestHit.side, entryPrice });
          }
        }
      }

      allResults.push({
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        user_id: strategy.user_id,
        universe_size: universe.length,
        results: strategyResults,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: totalScanned,
        created: totalCreated,
        strategies: strategies.length,
        results: allResults,
      }),
      { status: 200, headers },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("rsi-divergence-scanner:", e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
});
