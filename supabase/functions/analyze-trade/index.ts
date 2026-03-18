/**
 * analyze-trade — Supabase Edge Function
 *
 * Runs Gemini AI analysis for a specific symbol + trade action.
 * Used before placing any order from the dashboard.
 *
 * Body: { symbol, exchange, action, quantity, product }
 * Returns: { analysis: string }
 */

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.3 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    // Light auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const symbol   = String(body.symbol   ?? "").toUpperCase().trim();
    const exchange = String(body.exchange ?? "NSE").toUpperCase().trim();
    const action   = String(body.action   ?? "BUY").toUpperCase().trim();
    const quantity = Number(body.quantity ?? 1);
    const product  = String(body.product  ?? "CNC").toUpperCase().trim();
    const backtestSummary = body.backtest_summary as { totalTrades?: number; winRate?: number; totalReturn?: number; strategyAchieved?: boolean } | undefined;
    const timingReview = body.timing_review as {
      mode?: string;
      strategy_label?: string;
      stop_loss_pct?: number;
      take_profit_pct?: number;
      session_start?: string;
      session_end?: string;
      squareoff_time?: string;
      vectorbt?: Record<string, unknown>;
    } | undefined;

    const combinedBacktest = body.combined_backtest as {
      edge?: { dataSource?: string; totalTrades?: number; winRate?: number; totalReturn?: number; strategyAchieved?: boolean };
      vectorbt?: { dataSource?: string; totalTrades?: number; winRate?: number; totalReturn?: number; strategyAchieved?: boolean; sharpeRatio?: number } | null;
      dataConsistency?: { aligned?: boolean; pctDiff?: number; notes?: string[] };
      agreement?: string;
    } | undefined;

    if (!symbol) {
      return new Response(JSON.stringify({ error: "symbol is required" }), { status: 400, headers });
    }

    const isDelivery = product === "CNC";
    const isIntraday = product === "MIS";
    const isBuy      = action === "BUY";

    let analysis = "";

    if (GEMINI_API_KEY) {
      let backtestCtx = "";
      if (timingReview?.vectorbt) {
        const v = timingReview.vectorbt;
        backtestCtx = `\nBACKTEST TIMING REVIEW (VectorBT on real daily OHLC — Historify or Yahoo):
Mode: ${timingReview.mode ?? "—"}. ${timingReview.strategy_label ? `Strategy: ${timingReview.strategy_label}. ` : ""}
User params: Stop-loss ${timingReview.stop_loss_pct ?? "?"}%, Take-profit ${timingReview.take_profit_pct ?? "?"}%.
Session IST: ${timingReview.session_start ?? "?"}–${timingReview.session_end ?? "?"}, Square-off ${timingReview.squareoff_time ?? "?"}.
Backtest results: ${v.totalTrades ?? 0} trades, ${v.winRate ?? 0}% win rate, ${Number(v.totalReturn ?? 0) >= 0 ? "+" : ""}${v.totalReturn ?? 0}% return, Sharpe ${v.sharpeRatio ?? "n/a"}, data: ${v.data_source ?? "?"}. Conditions met now: ${v.strategyAchieved ?? false}.
Your job in 3-4 sentences ONLY: Are this SL% and TP% reasonable vs the backtest? Is the session/square-off window sensible for intraday vs delivery? Should entry/exit timing or signals be tightened? Be direct. India market. Plain text.`;
        const promptTr = `You are an Indian markets risk coach. ${backtestCtx}`;
        try {
          analysis = await callGemini(promptTr);
        } catch (e) {
          console.warn("Gemini timing review failed:", e);
        }
        if (analysis) {
          /* skip generic trade prompt below */
        }
      }
      if (!analysis && combinedBacktest?.edge) {
        const e = combinedBacktest.edge;
        const v = combinedBacktest.vectorbt;
        const notes = (combinedBacktest.dataConsistency?.notes ?? []).join(" ");
        const align = combinedBacktest.dataConsistency?.aligned;
        backtestCtx = `\nDUAL BACKTEST — Edge (${e.dataSource ?? "?"}): ${e.totalTrades ?? 0} trades, ${e.winRate ?? 0}% WR, ${(e.totalReturn ?? 0) >= 0 ? "+" : ""}${e.totalReturn ?? 0}% return, setup met: ${e.strategyAchieved ?? false}.`;
        if (v) {
          backtestCtx += ` VectorBT (${v.dataSource ?? "?"}): ${v.totalTrades ?? 0} trades, ${v.winRate ?? 0}% WR, ${(v.totalReturn ?? 0) >= 0 ? "+" : ""}${v.totalReturn ?? 0}%, Sharpe ${v.sharpeRatio ?? "—"}, setup met: ${v.strategyAchieved ?? false}.`;
        }
        backtestCtx += ` Engines agreement: ${combinedBacktest.agreement ?? "—"}. Price data check: ${align === true ? "aligned" : align === false ? "minor mismatch between sources" : "n/a"}. ${notes}`;
      } else if (!analysis && backtestSummary) {
        backtestCtx = `\nBacktest (historical market data): ${backtestSummary.totalTrades ?? 0} trades, ${backtestSummary.winRate ?? 0}% win rate, ${(backtestSummary.totalReturn ?? 0) >= 0 ? "+" : ""}${backtestSummary.totalReturn ?? 0}% total return. Conditions currently met: ${backtestSummary.strategyAchieved ?? false}.`;
      }

      if (analysis) {
        /* timing review or prior branch filled analysis */
      } else {
      const prompt = `You are a sharp, no-nonsense Indian stock market analyst. Give a VERY SHORT trade analysis — exactly 3-4 sentences, plain text, no bullet points, no markdown.

Trade: ${action} ${quantity} × ${symbol} on ${exchange}
Product: ${product} (${isDelivery ? "Delivery/CNC" : isIntraday ? "Intraday/MIS" : "F&O carry"})${backtestCtx}

Your 3-4 sentences must cover:
1. Is this a good time to ${action}? If dual backtest data disagrees, say so briefly.
2. Key price level to watch right now
3. One risk and one thing in favour; mention data quality if sources diverged
4. What to do right now (proceed / wait / set SL at X)

Be extremely direct. India-market-context. No markdown. Plain text only. Max 4 sentences.`;

      try {
        analysis = await callGemini(prompt);
      } catch (e) {
        console.warn("Gemini failed, using rule-based fallback:", e);
      }
      }
    }

    // Rule-based fallback when Gemini is unavailable or no API key
    if (!analysis) {
      if (isBuy && isDelivery)
        analysis = `${symbol} on ${exchange}: Proceed only if aligned with your long-term view. Set a stop-loss 5% below entry. CNC delivery means overnight and multi-day risk — ensure you have conviction. Use a limit order for better entry if not urgent.`;
      else if (isBuy && isIntraday)
        analysis = `${symbol} intraday BUY on ${exchange}: High-risk intraday trade. Set a strict stop-loss before entry and square off before 3:15 PM. Check current volume — low volume = avoid. Proceed only if momentum is in your favour.`;
      else if (!isBuy)
        analysis = `SELL ${symbol} on ${exchange}: Confirm you're selling the exact quantity held. If exiting a loss, check if averaging down is viable first. If booking profit, consider partial exit. Verify no pending corporate actions on this stock.`;
      else
        analysis = `${action} ${symbol} on ${exchange}: Verify current price and volume before proceeding. Set a clear stop-loss and target. Risk only what you can afford to lose. Real money will be debited instantly on confirmation.`;
    }

    return new Response(
      JSON.stringify({ analysis: analysis.trim() }),
      { status: 200, headers },
    );

  } catch (err) {
    console.error("analyze-trade error:", err);
    return new Response(
      JSON.stringify({ error: "Analysis failed", analysis: "AI analysis temporarily unavailable. Proceed with caution." }),
      { status: 200, headers },
    );
  }
});
