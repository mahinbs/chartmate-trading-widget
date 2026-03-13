/**
 * analyze-strategy — Supabase Edge Function
 *
 * Runs AI analysis + simulated backtesting on a user strategy.
 * Stores results in user_strategies.ai_analysis and backtest_summary.
 *
 * Body: { strategy_id }
 * Returns: { ai_analysis, backtest_summary }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Uses the same GEMINI_API_KEY already configured for predict-movement, suggest-strategy, etc.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
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
    const strategyId = (body.strategy_id as string ?? "").trim();

    if (!strategyId) {
      return new Response(JSON.stringify({ error: "strategy_id is required" }), { status: 400, headers });
    }

    // Fetch strategy
    const { data: strategy, error: fetchErr } = await supabase
      .from("user_strategies")
      .select("*")
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !strategy) {
      return new Response(JSON.stringify({ error: "Strategy not found" }), { status: 404, headers });
    }

    const s = strategy as Record<string, unknown>;

    // Build the AI prompt
    const symbolList = Array.isArray(s.symbols)
      ? (s.symbols as Array<Record<string, unknown>>).map(
          (sym) => `${sym.symbol} (${sym.exchange}, qty: ${sym.quantity}, type: ${sym.product_type})`,
        ).join(", ")
      : "Not specified";

    const prompt = `You are an expert algorithmic trading analyst for Indian markets (NSE/BSE).
Analyze this trading strategy and provide detailed recommendations.

Strategy: "${s.name}"
Description: ${s.description || "None"}
Trading Mode: ${s.trading_mode} (${s.is_intraday ? "Intraday" : "Positional"})
Trading Hours: ${s.start_time} – ${s.end_time} IST${s.is_intraday ? ` | Square-off: ${s.squareoff_time}` : ""}
Symbols: ${symbolList}
Risk per Trade: ${s.risk_per_trade_pct}% of capital
Stop Loss: ${s.stop_loss_pct}%
Take Profit: ${s.take_profit_pct}%

Provide analysis in this exact JSON format (no markdown, pure JSON):
{
  "risk_score": <1-10, where 1=very low risk, 10=very high risk>,
  "expected_monthly_return_pct": <realistic monthly return percentage as number>,
  "win_rate_estimate_pct": <estimated win rate as number 0-100>,
  "recommendation": "<overall recommendation: 'strong_buy' | 'buy' | 'neutral' | 'risky' | 'not_recommended'>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "suggested_improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "optimal_market_conditions": "<when this strategy works best>",
  "avoid_when": "<when to avoid this strategy>",
  "risk_reward_ratio": <take_profit / stop_loss as decimal>,
  "notes": "<key insight for the trader in 1-2 sentences>"
}`;

    // Call Gemini (same key used across the whole platform)
    let aiAnalysis: Record<string, unknown> | null = null;

    if (GEMINI_API_KEY) {
      try {
        const raw = await callGemini(prompt);
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.warn("Gemini analysis failed, falling back to rule-based:", e);
      }
    }

    // Fallback: rule-based analysis when Gemini is unavailable
    if (!aiAnalysis) {
      const sl = Number(s.stop_loss_pct ?? 2);
      const tp = Number(s.take_profit_pct ?? 4);
      const rrr = tp / sl;
      aiAnalysis = {
        risk_score: sl > 3 ? 7 : sl > 1.5 ? 5 : 3,
        expected_monthly_return_pct: rrr > 2 ? 8 : rrr > 1.5 ? 5 : 3,
        win_rate_estimate_pct: s.trading_mode === "BOTH" ? 52 : 55,
        recommendation: rrr >= 2 ? "buy" : rrr >= 1.5 ? "neutral" : "risky",
        strengths: [
          rrr >= 2 ? "Good risk-reward ratio (≥2:1)" : "Defined risk per trade",
          s.is_intraday ? "Intraday — no overnight risk" : "Positional — captures larger moves",
          "Clear stop-loss defined",
        ],
        weaknesses: [
          rrr < 2 ? "Risk-reward ratio below 2:1 is suboptimal" : "Ensure position sizing is consistent",
          "Backtest on at least 3 months of data before live trading",
        ],
        suggested_improvements: [
          rrr < 2 ? `Increase take-profit to ${(sl * 2).toFixed(1)}% to achieve 2:1 R:R` : "Current R:R is solid",
          "Consider adding a volume filter to reduce false signals",
          s.is_intraday ? "Avoid trading the first 15 minutes (09:15–09:30)" : "Set trailing stop-loss once 1:1 R:R achieved",
        ],
        optimal_market_conditions: s.trading_mode === "LONG"
          ? "Trending bull market, sector rotation into your symbols"
          : s.trading_mode === "SHORT"
          ? "Bearish trend, weak sector performance, high volatility"
          : "Any trending market with clear direction",
        avoid_when: "High-impact news days (RBI policy, budget, earnings), low volume sessions",
        risk_reward_ratio: rrr,
        notes: `Rule-based estimate. Set GEMINI_API_KEY for full AI-powered analysis.`,
      };
    }

    // Simulate backtest summary
    const slPct = Number(s.stop_loss_pct ?? 2);
    const tpPct = Number(s.take_profit_pct ?? 4);
    const winRateEst = (aiAnalysis.win_rate_estimate_pct as number ?? 55) / 100;
    const tradesTestCount = s.is_intraday ? 120 : 40;  // ~6 months
    const wonTrades = Math.round(tradesTestCount * winRateEst);
    const avgReturn = (wonTrades * tpPct - (tradesTestCount - wonTrades) * slPct) / tradesTestCount;
    const maxDrawdown = slPct * 3;

    const backtestSummary = {
      trades_tested:          tradesTestCount,
      win_count:              wonTrades,
      loss_count:             tradesTestCount - wonTrades,
      win_rate_pct:           Math.round(winRateEst * 100),
      avg_return_per_trade:   parseFloat(avgReturn.toFixed(2)),
      total_return_pct:       parseFloat((avgReturn * tradesTestCount / 10).toFixed(2)),
      max_drawdown_pct:       parseFloat(maxDrawdown.toFixed(2)),
      profit_factor:          parseFloat(((wonTrades * tpPct) / ((tradesTestCount - wonTrades) * slPct || 1)).toFixed(2)),
      period:                 s.is_intraday ? "Last 6 months (intraday)" : "Last 12 months (positional)",
      note:                   "Simulated backtest based on strategy parameters. Actual results may vary.",
    };

    // Save to DB
    await supabase
      .from("user_strategies")
      .update({
        ai_analysis:     aiAnalysis,
        backtest_summary: backtestSummary,
        updated_at:       new Date().toISOString(),
      })
      .eq("id", strategyId)
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({ ai_analysis: aiAnalysis, backtest_summary: backtestSummary }),
      { status: 200, headers },
    );

  } catch (err) {
    console.error("analyze-strategy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error during analysis" }),
      { status: 500, headers },
    );
  }
});
