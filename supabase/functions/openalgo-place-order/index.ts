/**
 * openalgo-place-order — Supabase Edge Function
 *
 * Uses the REAL OpenAlgo API:
 *   POST /api/v1/placeorder
 *   { apikey, strategy, exchange, symbol, action, quantity, pricetype, product, price }
 *
 * The user's OpenAlgo API key is stored in user_trading_integration.openalgo_api_key
 * (set once from openalgo.tradebrainx.com after logging in with Zerodha).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTradeAccess } from "../_shared/trade-access.ts";

const OPENALGO_URL = (Deno.env.get("OPENALGO_URL") ?? "").replace(/\/$/, "");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (!OPENALGO_URL) {
      return new Response(
        JSON.stringify({ error: "OPENALGO_URL not configured. Contact support." }),
        { status: 503, headers },
      );
    }

    // ── Authenticate Supabase user ────────────────────────────────────────
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

    // ── Verify paid + onboarding + integration prerequisites ─────────────
    const access = await resolveTradeAccess(supabase as any, user.id);
    if (!access.hasActiveSubscription) {
      return new Response(
        JSON.stringify({
          error: "An active subscription is required to place live orders. Please purchase a plan.",
          error_code: "NO_SUBSCRIPTION",
        }),
        { status: 403, headers },
      );
    }
    if (!access.hasProvisionedOnboarding) {
      return new Response(
        JSON.stringify({
          error: "Onboarding not provisioned yet. Please complete onboarding and wait for activation.",
          error_code: "ONBOARDING_NOT_PROVISIONED",
        }),
        { status: 403, headers },
      );
    }
    if (!access.hasActiveIntegration || !access.integration) {
      return new Response(
        JSON.stringify({
          error: "No active broker integration found. Please connect your broker in Settings.",
          error_code: "NO_INTEGRATION",
        }),
        { status: 400, headers },
      );
    }

    // ── Load user's OpenAlgo API key from DB ──────────────────────────────
    const integration = access.integration;

    const openalgoApiKey = integration.openalgo_api_key ?? "";
    if (!openalgoApiKey.trim()) {
      return new Response(
        JSON.stringify({
          error: "OpenAlgo API key missing. Open 'Connect Broker' and paste your key from openalgo.tradebrainx.com → API Keys.",
          error_code: "NO_OPENALGO_KEY",
        }),
        { status: 400, headers },
      );
    }

    // ── Parse order payload ───────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { symbol, action, quantity, exchange, product, pricetype, price, strategy } = body as {
      symbol:     string;
      action:     string;
      quantity:   number;
      exchange?:  string;
      product?:   string;
      pricetype?: string;
      price?:     number;
      strategy?:  string;
      strategy_code?: string;
      intent?: "entry" | "exit";
      trade_id?: string;
    };
    const strategyCode = ((body as { strategy_code?: string }).strategy_code ?? "").trim().toLowerCase();
    const orderIntent = (body as { intent?: string }).intent === "exit" ? "exit" : "entry";
    const tradeId = ((body as { trade_id?: string }).trade_id ?? "").trim() || null;

    const writeAudit = async (params: {
      status: "success" | "failed";
      errorCode?: string;
      errorMessage?: string;
      responsePayload?: unknown;
    }) => {
      await supabase.from("order_audit_logs").insert({
        user_id: user.id,
        trade_id: tradeId,
        intent: orderIntent,
        provider: "openalgo",
        request_payload: body,
        response_payload: params.responsePayload ?? null,
        status: params.status,
        error_code: params.errorCode ?? null,
        error_message: params.errorMessage ?? null,
      });
    };

    if (!symbol || !action || !quantity) {
      await writeAudit({
        status: "failed",
        errorCode: "INVALID_ORDER_PAYLOAD",
        errorMessage: "symbol, action and quantity are required",
      });
      return new Response(
        JSON.stringify({ error: "symbol, action and quantity are required" }),
        { status: 400, headers },
      );
    }

    // ── Enforce server-side strategy/account assignment (entries only) ────
    const { data: assignment } = await supabase
      .from("algo_user_assignments")
      .select("allowed_strategy, status, integration_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (orderIntent === "entry") {
      if (!assignment) {
        await writeAudit({
          status: "failed",
          errorCode: "ASSIGNMENT_REQUIRED",
          errorMessage: "No active admin assignment found for this user",
        });
        return new Response(
          JSON.stringify({
            error: "No active strategy assignment found. Contact support to activate your assigned strategy.",
            error_code: "ASSIGNMENT_REQUIRED",
          }),
          { status: 403, headers },
        );
      }

      const allowedStrategy = (assignment.allowed_strategy ?? "").toString().trim().toLowerCase();
      if (allowedStrategy && strategyCode && strategyCode !== allowedStrategy) {
        await writeAudit({
          status: "failed",
          errorCode: "STRATEGY_NOT_ALLOWED",
          errorMessage: `Requested strategy ${strategyCode} does not match allowed strategy ${allowedStrategy}`,
        });
        return new Response(
          JSON.stringify({
            error: `Strategy '${strategyCode}' is not allowed for your account. Allowed strategy: '${allowedStrategy}'.`,
            error_code: "STRATEGY_NOT_ALLOWED",
          }),
          { status: 403, headers },
        );
      }

      if (assignment.integration_id && assignment.integration_id !== access.integration.id) {
        await writeAudit({
          status: "failed",
          errorCode: "ASSIGNMENT_INTEGRATION_MISMATCH",
          errorMessage: "Assigned integration is not active for this user",
        });
        return new Response(
          JSON.stringify({
            error: "Assigned account mapping is invalid. Please contact support.",
            error_code: "ASSIGNMENT_INTEGRATION_MISMATCH",
          }),
          { status: 403, headers },
        );
      }
    }

    const resolvedExchange = (exchange ?? "NSE").toUpperCase();
    const isIndianExchange = ["NSE", "BSE", "NFO", "BFO"].includes(resolvedExchange);

    // ── Indian market hours guard: Mon–Fri 09:00–15:30 IST ───────────────
    if (isIndianExchange) {
      const IST_OFFSET_MS = 330 * 60 * 1000;
      const nowIst = new Date(Date.now() + IST_OFFSET_MS);
      const day    = nowIst.getUTCDay();
      const mins   = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();

      if (day === 0 || day === 6 || mins < 540 || mins > 930) {
        await writeAudit({
          status: "failed",
          errorCode: "MARKET_CLOSED",
          errorMessage: "Indian market is closed for new orders",
        });
        return new Response(
          JSON.stringify({
            error: "Indian market is closed. Orders can only be placed Mon–Fri between 09:00 and 15:30 IST.",
            error_code: "MARKET_CLOSED",
          }),
          { status: 400, headers },
        );
      }
    }

    // ── Call real OpenAlgo /api/v1/placeorder ─────────────────────────────
    const resolvedStrategyName =
      strategy ?? access.integration.strategy_name ?? (strategyCode || "ChartMate AI");

    const orderPayload = {
      apikey:             openalgoApiKey.trim(),
      strategy:           resolvedStrategyName,
      exchange:           resolvedExchange,
      symbol:             symbol.toUpperCase(),
      action:             action.toUpperCase(),
      product:            product  ?? "CNC",
      pricetype:          pricetype ?? "MARKET",
      quantity:           String(Number(quantity)),
      price:              String(price ?? 0),
      trigger_price:      "0",
      disclosed_quantity: "0",
    };

    const openalgoRes = await fetch(`${OPENALGO_URL}/api/v1/placeorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    const openalgoData = await openalgoRes.json().catch(() => ({}));

    // ── Map OpenAlgo error codes back to user-friendly messages ───────────
    if (!openalgoRes.ok) {
      const detail = (openalgoData as any)?.message ?? (openalgoData as any)?.error ?? "Order failed";

      // Invalid/expired API key
      if (openalgoRes.status === 401 || openalgoRes.status === 403) {
        await writeAudit({
          status: "failed",
          errorCode: "INVALID_OPENALGO_KEY",
          errorMessage: "OpenAlgo API key invalid or expired",
          responsePayload: openalgoData,
        });
        return new Response(
          JSON.stringify({
            error: "Your OpenAlgo API key is invalid or expired. Please reconnect your broker.",
            error_code: "INVALID_OPENALGO_KEY",
          }),
          { status: 401, headers },
        );
      }

      await writeAudit({
        status: "failed",
        errorCode: "OPENALGO_ORDER_FAILED",
        errorMessage: detail,
        responsePayload: openalgoData,
      });
      return new Response(
        JSON.stringify({ error: detail, raw: openalgoData }),
        { status: 502, headers },
      );
    }

    await writeAudit({
      status: "success",
      responsePayload: openalgoData,
    });

    // Success — return the order ID directly
    return new Response(JSON.stringify(openalgoData), { status: 200, headers });

  } catch (err) {
    console.error("openalgo-place-order error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error placing order" }),
      { status: 500, headers },
    );
  }
});
