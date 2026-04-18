import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useMyTenantMembership } from '@/hooks/useWhitelabel';
import { Skeleton } from '@/components/ui/skeleton';
import { ensureTrialAccessForUser } from '@/lib/ensureTrialAccessForUser';

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { membership, loading: membershipLoading } = useMyTenantMembership(user?.id);
  const location = useLocation();
  const isChangePasswordPage = location.pathname === '/auth/change-password';
  const [trialBootstrapDone, setTrialBootstrapDone] = useState(false);

  useEffect(() => {
    if (authLoading || roleLoading || !user?.id) return;
    if (role !== 'user') {
      setTrialBootstrapDone(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      await ensureTrialAccessForUser(user.id);
      if (!cancelled) setTrialBootstrapDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, roleLoading, user?.id, role]);

  if (authLoading || roleLoading || (role === 'admin' && membershipLoading) || (role === 'user' && !trialBootstrapDone)) {
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

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if ((user as any).user_metadata?.need_password_reset && !isChangePasswordPage) {
    return <Navigate to="/auth/change-password" replace />;
  }

  // WL admins should ONLY use their white-label admin panel.
  if (role === 'admin' && !isChangePasswordPage) {
    const wlSlug = membership?.role === 'admin' && membership?.status === 'active'
      ? membership?.tenant?.slug
      : null;
    if (wlSlug) return <Navigate to={`/wl/${wlSlug}/dashboard`} replace />;
    return <Navigate to="/white-label#pricing" replace />;
  }

  // Affiliates: only the affiliate dashboard (no main platform). Allow password change flow.
  if (role === 'affiliate' && !isChangePasswordPage) {
    const path = location.pathname;
    const onAffiliateDashboard = path === '/affiliate/dashboard' || path.startsWith('/affiliate/dashboard/');
    if (!onAffiliateDashboard) {
      return <Navigate to="/affiliate/dashboard" replace />;
    }
  }

  return <>{children}</>;
};