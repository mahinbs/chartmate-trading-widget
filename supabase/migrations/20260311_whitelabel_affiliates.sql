-- White-label affiliate management: allow WL admins to create and manage their own affiliates
-- Affiliates created by WL users are scoped via created_by and whitelabel_tenant_id columns

-- 1. Add whitelabel_tenant_id to affiliates table (nullable — admin-created affiliates won't have one)
ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS whitelabel_tenant_id UUID REFERENCES public.white_label_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_affiliates_whitelabel_tenant_id ON public.affiliates(whitelabel_tenant_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_created_by ON public.affiliates(created_by);

-- 2. RLS: WL admins can SELECT their own affiliates (created_by = auth.uid())
DROP POLICY IF EXISTS "WL admin can read own affiliates" ON public.affiliates;
CREATE POLICY "WL admin can read own affiliates" ON public.affiliates
  FOR SELECT USING (
    created_by IS NOT NULL
    AND auth.uid() = created_by
  );

-- 3. RLS: WL admins can UPDATE their own affiliates
DROP POLICY IF EXISTS "WL admin can update own affiliates" ON public.affiliates;
CREATE POLICY "WL admin can update own affiliates" ON public.affiliates
  FOR UPDATE USING (
    created_by IS NOT NULL
    AND auth.uid() = created_by
  )
  WITH CHECK (
    created_by IS NOT NULL
    AND auth.uid() = created_by
  );

-- 4. RLS: WL admins can DELETE their own affiliates
DROP POLICY IF EXISTS "WL admin can delete own affiliates" ON public.affiliates;
CREATE POLICY "WL admin can delete own affiliates" ON public.affiliates
  FOR DELETE USING (
    created_by IS NOT NULL
    AND auth.uid() = created_by
  );

-- 5. RLS: WL admins can read visitors for their affiliates
DROP POLICY IF EXISTS "WL admin can read own affiliate visitors" ON public.affiliate_visitors;
CREATE POLICY "WL admin can read own affiliate visitors" ON public.affiliate_visitors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = affiliate_visitors.affiliate_id
        AND a.created_by = auth.uid()
    )
  );

-- 6. RLS: WL admins can read contact submissions for their affiliates
DROP POLICY IF EXISTS "WL admin can read own affiliate submissions" ON public.contact_submissions;
CREATE POLICY "WL admin can read own affiliate submissions" ON public.contact_submissions
  FOR SELECT USING (
    affiliate_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = contact_submissions.affiliate_id
        AND a.created_by = auth.uid()
    )
  );

-- 7. RLS: WL admins can read payments for their affiliates
DROP POLICY IF EXISTS "WL admin can read own affiliate payments" ON public.user_payments;
CREATE POLICY "WL admin can read own affiliate payments" ON public.user_payments
  FOR SELECT USING (
    affiliate_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = user_payments.affiliate_id
        AND a.created_by = auth.uid()
    )
  );

COMMENT ON COLUMN public.affiliates.whitelabel_tenant_id IS 'The WL tenant this affiliate belongs to (NULL for admin-created affiliates)';
