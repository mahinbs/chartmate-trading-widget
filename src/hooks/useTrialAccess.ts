import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

function todayKeyIst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type TrialAccessRow = {
  status: string;
  end_at: string;
  daily_credit_limit: number;
  used_credits_json: Record<string, number> | null;
};

export function useTrialAccess() {
  const { user, loading: authLoading } = useAuth();
  const [row, setRow] = useState<TrialAccessRow | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setRow(null);
      setFetching(false);
      return;
    }
    setFetching(true);
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("trial_access")
        .select("status, end_at, daily_credit_limit, used_credits_json")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.warn("useTrialAccess:", error.message);
        setRow(null);
      } else {
        setRow(data as TrialAccessRow | null);
      }
      setFetching(false);
    })();
  }, [user?.id]);

  const loading = authLoading || (Boolean(user?.id) && fetching);

  const derived = useMemo(() => {
    if (!row) {
      return {
        hasTrialRecord: false,
        isOnTrial: false,
        trialExpired: false,
        creditsRemaining: 0,
        creditsPerDay: 0,
        trialEndsAt: null as Date | null,
        daysLeft: 0,
        isExpired: false,
      };
    }
    const end = new Date(row.end_at);
    const trialEndsAt = end;
    const endMs = end.getTime();
    const statusActive = String(row.status ?? "") === "active";
    const timeOk = endMs > Date.now();
    const isOnTrial = statusActive && timeOk;
    const hasTrialRecord = true;
    const trialExpired = !isOnTrial;
    const isExpired = !timeOk;
    const creditsPerDay = Math.max(0, Number(row.daily_credit_limit ?? 0));
    const usedJson = (row.used_credits_json ?? {}) as Record<string, number>;
    const dayKey = todayKeyIst();
    const usedToday = Number(usedJson[dayKey] ?? 0);
    const creditsRemaining = isOnTrial ? Math.max(0, creditsPerDay - usedToday) : 0;
    const msLeft = endMs - Date.now();
    const daysLeft = msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0;

    return {
      hasTrialRecord,
      isOnTrial,
      trialExpired,
      creditsRemaining,
      creditsPerDay,
      trialEndsAt,
      daysLeft,
      isExpired,
    };
  }, [row]);

  return {
    loading,
    row,
    ...derived,
  };
}
