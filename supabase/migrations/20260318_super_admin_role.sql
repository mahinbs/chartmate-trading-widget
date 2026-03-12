-- ============================================================
-- Super-admin role
-- Only trading@admin.com is super_admin.
-- Regular admins (WL partners) cannot manage WL tenants or
-- see other tenants' data. Only super_admin sees / manages all.
-- ============================================================

-- 1. Extend the role check constraint to include super_admin
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('super_admin', 'admin', 'user', 'affiliate'));

-- 2. Helper: is current user the super-admin?
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
    );
$$;

-- 3. Update is_app_admin() to include super_admin so existing code still works
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    );
$$;

-- 4. Upgrade trading@admin.com to super_admin
-- (removes the generic 'admin' role for this email)
UPDATE public.user_roles
SET role = 'super_admin', updated_at = now()
WHERE user_id IN (
  SELECT id FROM auth.users WHERE lower(email) = 'trading@admin.com'
);

-- Also insert if not present yet
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'
FROM auth.users u
WHERE lower(u.email) = 'trading@admin.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', updated_at = now();

-- 5. White-label tenants: restrict full management to super_admin only
--    (regular admins / WL partners can only read their OWN tenant via WL dashboard)
DROP POLICY IF EXISTS "Admins and service can manage WL tenants" ON public.white_label_tenants;

CREATE POLICY "Super-admin and service can manage WL tenants"
  ON public.white_label_tenants FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.is_super_admin()
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_super_admin()
  );

-- 6. wl_payment_requests: restrict to super_admin only
DROP POLICY IF EXISTS "Admins manage wl payment requests" ON public.wl_payment_requests;

CREATE POLICY "Super-admin manages wl payment requests"
  ON public.wl_payment_requests FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.is_super_admin()
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_super_admin()
  );

-- 7. white_label_tenant_users: restrict management to super_admin
--    (service role already bypasses RLS)
DROP POLICY IF EXISTS "Service and admins can manage WL tenant users" ON public.white_label_tenant_users;

CREATE POLICY "Super-admin and service can manage WL tenant users"
  ON public.white_label_tenant_users FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.is_super_admin()
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_super_admin()
  );

-- 8. user_subscriptions: super_admin can see all; regular users can only see their own
--    (existing "Service role full access" policy already covers service_role)
DROP POLICY IF EXISTS "Super-admin reads all subscriptions" ON public.user_subscriptions;
CREATE POLICY "Super-admin reads all subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (public.is_super_admin());
