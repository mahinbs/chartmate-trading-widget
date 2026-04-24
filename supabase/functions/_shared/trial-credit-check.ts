/**
 * Trial credits: paid users bypass; trial users consume via consume_trial_credit RPC.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { planAllowsAlgo } from "./subscription-plans.ts";

export async function hasActivePaidAlgoPlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("plan_id, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;
  const st = String((data as { status?: string }).status ?? "");
  if (st !== "active" && st !== "trialing" && st !== "pro_trial") return false;
  const endRaw = (data as { current_period_end?: string | null }).current_period_end;
  const endMs = endRaw ? new Date(endRaw).getTime() : null;
  const graceOk = endMs == null || endMs + 24 * 60 * 60 * 1000 > Date.now();
  if (!graceOk) return false;
  const planId = (data as { plan_id?: string | null }).plan_id ?? null;
  return planAllowsAlgo(planId);
}

type ConsumeRpcRow = { ok: boolean; credits_remaining: number | null; message: string | null };

export async function checkAndConsumeTrialCredit(
  supabase: SupabaseClient,
  userId: string,
  cost: number,
  action: string,
): Promise<{ ok: boolean; creditsRemaining: number | null; reason?: string; skippedPaid?: boolean }> {
  if (await hasActivePaidAlgoPlan(supabase, userId)) {
    return { ok: true, creditsRemaining: null, skippedPaid: true };
  }

  const { data, error } = await supabase.rpc("consume_trial_credit", {
    p_user_id: userId,
    p_cost: cost,
    p_action: action,
  });

  if (error) {
    console.warn("consume_trial_credit RPC error:", error.message);
    return { ok: false, creditsRemaining: null, reason: error.message };
  }

  const row = Array.isArray(data) ? (data[0] as ConsumeRpcRow | undefined) : (data as ConsumeRpcRow | undefined);
  if (!row) {
    return { ok: false, creditsRemaining: null, reason: "no_response" };
  }

  const ok = Boolean(row.ok);
  const creditsRemaining =
    row.credits_remaining === null || row.credits_remaining === undefined
      ? null
      : Number(row.credits_remaining);
  const message = row.message ?? undefined;

  if (!ok) {
    return { ok: false, creditsRemaining: creditsRemaining ?? 0, reason: message };
  }

  return { ok: true, creditsRemaining };
}
