-- Make admin authorization role-based (super-admin by role),
-- and seed admin role for known admin emails if they exist.

CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS BOOLEAN AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    );
$$ LANGUAGE sql STABLE;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'
FROM auth.users u
WHERE lower(u.email) IN ('trading@admin.com', 'trading@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET
  role = EXCLUDED.role,
  updated_at = now();
