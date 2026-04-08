-- Fix RLS policies to include super_admin role for marketing resources
-- Use the existing is_app_admin() helper which covers both 'admin' and 'super_admin'

-- 1. Update affiliate_marketing_resources table policies
DROP POLICY IF EXISTS "Admins can manage all marketing resources" ON public.affiliate_marketing_resources;
CREATE POLICY "Admins can manage all marketing resources" ON public.affiliate_marketing_resources
  FOR ALL USING (
    auth.role() = 'service_role' OR public.is_app_admin()
  )
  WITH CHECK (
    auth.role() = 'service_role' OR public.is_app_admin()
  );

-- 2. Update storage bucket policies for 'affiliate-resources'
-- We drop and recreate the admin management policy to include super_admin
DROP POLICY IF EXISTS "Admins can manage affiliate resources" ON storage.objects;
CREATE POLICY "Admins can manage affiliate resources" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'affiliate-resources' AND 
    public.is_app_admin()
  )
  WITH CHECK (
    bucket_id = 'affiliate-resources' AND 
    public.is_app_admin()
  );
