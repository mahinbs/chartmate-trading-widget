import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import FreeUserDashboard from "@/pages/FreeUserDashboard";
import PendingSetupDashboard from "@/pages/PendingSetupDashboard";

/**
 * /home is the Algo Trading Engine entry point.
 *  - Provisioned/active users go to the in-app live trading dashboard.
 *  - Paid users who haven't finished setup see a preview dashboard.
 *  - Free users see the in-dashboard broker picker + plan, which checks out
 *    and returns them to /algo-setup after payment.
 */
export default function AlgoEngineRedirect() {
  const { user } = useAuth();
  const { hasAlgoAccess, loading: subLoading } = useSubscription();
  const [algoStatus, setAlgoStatus] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAlgoStatus = async () => {
      if (!user?.id || !hasAlgoAccess) {
        if (!cancelled) {
          setAlgoStatus(null);
          setStatusLoading(false);
        }
        return;
      }
      const { data } = await (supabase as any)
        .from("algo_onboarding")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setAlgoStatus(data?.status ?? null);
        setStatusLoading(false);
      }
    };
    fetchAlgoStatus();
    return () => {
      cancelled = true;
    };
  }, [user?.id, hasAlgoAccess]);

  const ready = !subLoading && !statusLoading;
  const canUseAlgoTools =
    hasAlgoAccess && (algoStatus === "provisioned" || algoStatus === "active");

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Provisioned/active: go to the in-app live trading dashboard (stays on
  // tradingsmart.ai — the old external algo.tradingsmart.in handoff had no
  // shared session and hung on "Loading…").
  if (canUseAlgoTools) {
    return <Navigate to="/trading-dashboard" replace />;
  }

  // Paid users who haven't finished onboarding see a preview of the
  // dashboard they'll unlock (with a CTA back into the KYC form), instead
  // of an infinite bounce to /algo-setup.
  if (hasAlgoAccess) {
    return <PendingSetupDashboard algoStatus={algoStatus} />;
  }

  // Free users get the in-dashboard broker picker + plan.
  return <FreeUserDashboard />;
}
