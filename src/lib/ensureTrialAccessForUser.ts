import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TRIAL_LIMITS } from "@/constants/webinarBatches";

/**
 * Ensures `trial_access` exists for new free users and seeds trial equity strategies.
 * Idempotent — safe to call on every session (e.g. from ProtectedRoute + AuthPage).
 */
export async function ensureTrialAccessForUser(userId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const endIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: existing } = await (supabase as any)
    .from("trial_access")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    const { error: trialInsErr } = await (supabase as any).from("trial_access").insert([
      {
        user_id: userId,
        start_at: nowIso,
        end_at: endIso,
        status: "active",
        daily_credit_limit: DEFAULT_TRIAL_LIMITS.dailyCreditLimit,
        backtests_per_day: DEFAULT_TRIAL_LIMITS.backtestsPerDay,
        ai_analysis_per_day: DEFAULT_TRIAL_LIMITS.aiAnalysisPerDay,
        scans_per_day: 0,
        paper_trades_per_day: DEFAULT_TRIAL_LIMITS.paperTradesPerDay,
        strategy_creations_per_day: DEFAULT_TRIAL_LIMITS.strategyCreationsPerDay,
        limits_metadata_json: {
          live_auto_execution_enabled: false,
        },
      },
    ]);
    if (trialInsErr) {
      console.warn("trial_access insert:", trialInsErr.message);
      return;
    }
  }

  const { data: trialLive } = await (supabase as any)
    .from("trial_access")
    .select("status, end_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    trialLive?.status === "active" &&
    trialLive.end_at &&
    new Date(trialLive.end_at).getTime() > Date.now()
  ) {
    const { error: seedErr } = await (supabase as any).rpc("seed_trial_strategies_for_user", {
      p_user_id: userId,
    });
    if (seedErr) console.warn("seed_trial_strategies_for_user:", seedErr.message);
  }
}
