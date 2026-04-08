-- 1. Create a new table for manual affiliate payouts
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  notes TEXT,
  invoice_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id ON public.affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_created_at ON public.affiliate_payouts(created_at DESC);

-- 2. RLS for affiliate_payouts
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all payouts" ON public.affiliate_payouts;
CREATE POLICY "Admins can manage all payouts" ON public.affiliate_payouts
  FOR ALL USING (
    auth.role() = 'service_role' OR public.is_app_admin()
  )
  WITH CHECK (
    auth.role() = 'service_role' OR public.is_app_admin()
  );

DROP POLICY IF EXISTS "Affiliate can read own payouts" ON public.affiliate_payouts;
CREATE POLICY "Affiliate can read own payouts" ON public.affiliate_payouts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.affiliates a WHERE a.id = affiliate_payouts.affiliate_id AND a.user_id = auth.uid())
  );

-- 3. Create a new storage bucket for affiliate payout invoices
INSERT INTO storage.buckets (id, name, public) 
VALUES ('affiliate-payouts', 'affiliate-payouts', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Set up RLS for the affiliate-payouts bucket
DROP POLICY IF EXISTS "Admins can manage affiliate payouts invoices" ON storage.objects;
CREATE POLICY "Admins can manage affiliate payouts invoices" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'affiliate-payouts' AND 
    public.is_app_admin()
  )
  WITH CHECK (
    bucket_id = 'affiliate-payouts' AND 
    public.is_app_admin()
  );

DROP POLICY IF EXISTS "Affiliate can read own payout invoices" ON storage.objects;
CREATE POLICY "Affiliate can read own payout invoices" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'affiliate-payouts' AND
    (name LIKE (SELECT user_id::text || '/%' FROM public.affiliates WHERE user_id = auth.uid()) OR 
     name LIKE (SELECT id::text || '/%' FROM public.affiliates WHERE user_id = auth.uid()))
  );
