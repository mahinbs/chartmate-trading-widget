import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { isManualFullAccessEmail } from "@/lib/manualSubscriptionBypass";

/** Active / broker / paper hub: requires Bot ($49+) or Analysis ($99+). */
export function TradesHubGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { loading, hasAlgoAccess, hasAnalysisAccess } = useSubscription();
  const bypass = isManualFullAccessEmail(user?.email);

  if (user && bypass) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (!hasAlgoAccess && !hasAnalysisAccess) {
    return <Navigate to="/pricing?feature=trades" replace />;
  }

  return <>{children}</>;
}
