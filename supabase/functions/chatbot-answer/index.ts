/**
 * chatbot-answer — Platform support chatbot using our underlying AI model.
 * Handles misspellings and rephrasing; answers only about ChartMate.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

const PHONE = "+91 96329 53355";
const KNOWLEDGE = `
ChartMate is an AI-powered trading intelligence platform.

PLATFORM OVERVIEW:
- AI Predictions: our AI engine analyses live price, RSI, MACD, news & global macro to predict BUY/SELL/HOLD with probability scores.
- Strategy Selection: the AI ranks 11 real strategies (Trend Following, Swing Trading, Scalping, Mean Reversion, Breakout, Momentum, Range Trading, News-based, Options Buying, Options Selling, Pairs Trading) for current market.
- Backtesting: Before any real order, platform backtests the chosen strategy on 100+ days of real OHLCV data; shows "Strategy Conditions Met" or not, win rate, drawdown, profit factor.
- Paper Trading: Simulate trades with virtual money; no real capital; all gates bypassed; trades tracked with a paper badge.
- Daily Analysis (Market Picks): Admins run the full analysis pipeline and publish to a board; all users see it at /market-picks (symbol, price, action, probability, ROI scenarios, rationale, market conditions, expiry).
- Active Trades: Monitor open positions with live P&L, stop-loss, take-profit; outcomes like Target Hit, Stopped Out, Cancelled.
- Capital Scenarios: Best/Likely/Worst case and Max Loss in dollars for Small ($10k), Medium ($100k), Large ($1M) investor; fractional shares supported.
- BUY = bullish signal; SELL = bearish; HOLD = unclear/mixed — real order still requires strategy conditions met and backtest.
- Chart: TradingView chart on Predict page; syncs to selected symbol (stocks, crypto, forex).
- Admin: /admin has Users list and Daily Shares; admin runs same full AI analysis then publishes to Daily Board; can re-predict or delete rows.
- Getting started: Sign up, go to Predict, search symbol, set investment & timeframe, Run AI Analysis, pick strategy (or Paper Trade), track in Active Trades.
- Contact: For help beyond the platform, users can call or WhatsApp ${PHONE}.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: JSON_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body?.history) ? body.history as Array<{ role?: string; text?: string }> : [];
    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message" }), { status: 400, headers: JSON_HEADERS });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ answer: "Support is temporarily unavailable. Please call or WhatsApp " + PHONE + " for help.", suggestContact: true }), { status: 200, headers: JSON_HEADERS });
    }

    const historyText = history.length
      ? history
          .slice(-8)
          .map((h) => `${(h.role === "user" ? "User" : "Assistant")}: ${String(h.text ?? "").replace(/\n/g, " ")}`)
          .join("\n")
      : "No previous messages.";

    const prompt = `You are Tradingsmart Bot, the support assistant for the Tradingsmart / ChartMate platform. You ONLY answer questions about this platform (features, how it works, AI, strategies, paper trading, backtesting, daily analysis, etc.). Be friendly and human. Interpret the user's message even if it has typos or misspellings.

KNOWLEDGE BASE (use this to answer in detail):
${KNOWLEDGE}

CONVERSATION SO FAR (oldest to newest):
${historyText}

LATEST USER MESSAGE:
"${message.replace(/"/g, '\\"')}"

RULES:
1. Answer concisely in about 3–6 short lines (roughly 4–8 sentences total). Avoid long paragraphs; keep things easy to skim.
2. For bullets use only "• " (bullet space) at the start of a line, never "• * " or a lone asterisk. Use **bold** only for emphasis on a word or phrase, not after bullets.
2. Do NOT use " -- " (double dash) anywhere. Write in plain, natural sentences.
3. If the question is clearly about ChartMate, answer fully using the knowledge above. Do NOT add contact info, phone number, or "reach out to us" in these answers.
4. ONLY when the user asks something irrelevant (e.g. stock picks, life advice), or asks to buy the platform, or asks for money/pricing, or explicitly asks for contact/support/human, then end your reply by saying they can call or WhatsApp ${PHONE} for that. Otherwise do not mention contact or phone.
5. Do not make up features; stick to the knowledge base.
6. Use the conversation so far to stay context-aware across multiple user messages in the same chat.
7. Keep formatting clean: no extra asterisks, no double dashes.`;

    // 3.1 Flash-Lite model: cheap, fast, good for support chatbot (preview model name as of Mar 2026)
    const model = "gemini-3.1-flash-lite-preview";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.4,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("chatbot model error", res.status, errText);
      return new Response(JSON.stringify({
        answer: "Something went wrong on our side. Please try again or contact " + PHONE + " for help.",
        suggestContact: true,
      }), { status: 200, headers: JSON_HEADERS });
    }

    const data = await res.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "I couldn't generate a reply. Please contact " + PHONE + " for help.";

    // Only suggest contact when user asked something irrelevant, to buy, for money, or for human/contact
    const lowerMsg = message.toLowerCase();
    const askedForContact = /\b(contact|support|human|call|whatsapp|phone|reach|speak to)\b/i.test(lowerMsg);
    const askedBuyOrMoney = /\b(buy|purchase|price|cost|money|invest in|how much)\b/i.test(lowerMsg);
    const answerIsRedirect = text.length < 350 && (text.includes(PHONE) || text.includes("call or WhatsApp"));
    const suggestContact = askedForContact || askedBuyOrMoney || answerIsRedirect;

    return new Response(JSON.stringify({ answer: text, suggestContact }), { status: 200, headers: JSON_HEADERS });
  } catch (e) {
    console.error("chatbot-answer error", e);
    return new Response(JSON.stringify({
      answer: "Sorry, something went wrong. Please try again or call/WhatsApp " + PHONE + " for help.",
      suggestContact: true,
    }), { status: 200, headers: JSON_HEADERS });
  }
});
