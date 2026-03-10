import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";

interface AffiliateRouteProps {
  children: ReactNode;
}

export const AffiliateRoute = ({ children }: AffiliateRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const location = useLocation();

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if ((user as any).user_metadata?.need_password_reset &&
    location.pathname !== "/auth/change-password") {
    return <Navigate to="/auth/change-password" replace />;
  }

  if (role !== "affiliate" && role !== "admin") {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};
