import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { TradingDashboardLoadingScreen } from "./TradingDashboardShell";

interface ProvisionStatus {
  provisioned: boolean;
  broker: string | null;
  loading: boolean;
}

export interface TradingDashboardAccessGateProps {
  children: (ctx: { broker: string }) => React.ReactNode;
  /**
   * Where to send signed-in users who are not allowed (unpaid or algo not provisioned).
   * @default "/algo-setup" — live trading dashboard onboarding.
   */
  notReadyRedirect?: "/algo-setup" | "/pricing";
}

/**
 * Signed-in, paid, algo provisioned, active broker integration — otherwise redirects.
 */
export function TradingDashboardAccessGate({
  children,
  notReadyRedirect = "/algo-setup",
}: TradingDashboardAccessGateProps) {
  const { pathname, search } = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<ProvisionStatus>({
    provisioned: false,
    broker: null,
    loading: true,
  });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      const isPaid = sub?.status === "active" || sub?.status === "trialing";
      if (!isPaid) {
        setStatus({ provisioned: false, broker: null, loading: false });
        return;
      }

      const { data: onboarding } = await (supabase as any)
        .from("algo_onboarding")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      const isProvisioned = onboarding?.status === "provisioned" || onboarding?.status === "active";

      const { data: integration } = await (supabase as any)
        .from("user_trading_integration")
        .select("is_active, broker")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      setStatus({
        provisioned: !!isProvisioned,
        broker: integration?.broker ?? null,
        loading: false,
      });
    })();
  }, [user?.id]);

  if (authLoading || status.loading) {
    return <TradingDashboardLoadingScreen />;
  }

  if (!user) {
    const redirect = encodeURIComponent(`${pathname}${search}`);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }

  if (!status.provisioned) {
    return <Navigate to={notReadyRedirect} replace />;
  }

  return <>{children({ broker: status.broker ?? "zerodha" })}</>;
}
