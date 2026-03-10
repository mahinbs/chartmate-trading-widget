-- Affiliates system: super admin manages affiliates, commission %, and tracks visitors + form submissions + payments
-- Affiliates can bring both normal users and (when whitelabel is enabled) whitelabel users.

-- 1. Allow 'affiliate' role in user_roles
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('admin', 'user', 'affiliate'));

-- 2. Affiliates table: one row per affiliate; commission_percent set by super admin
CREATE TABLE IF NOT EXISTS public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON public.affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates(code);
CREATE INDEX IF NOT EXISTS idx_affiliates_is_active ON public.affiliates(is_active);

-- 3. Affiliate visitors: one row per (affiliate_id, visitor_ip) for unique visitor count
CREATE TABLE IF NOT EXISTS public.affiliate_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  visitor_ip TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  UNIQUE(affiliate_id, visitor_ip)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_visitors_affiliate_id ON public.affiliate_visitors(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_visitors_visited_at ON public.affiliate_visitors(visited_at DESC);

-- 4. Add affiliate tracking columns to contact_submissions
ALTER TABLE public.contact_submissions ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL;
ALTER TABLE public.contact_submissions ADD COLUMN IF NOT EXISTS referral_code TEXT; -- raw code typed by user if no session ref

CREATE INDEX IF NOT EXISTS idx_contact_submissions_affiliate_id ON public.contact_submissions(affiliate_id);

-- 5. User payments: when a user pays on the site, we attribute to affiliate and store commission
CREATE TABLE IF NOT EXISTS public.user_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
  commission_percent NUMERIC(5, 2),
  commission_amount NUMERIC(14, 2),
  commission_paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_payments_user_id ON public.user_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payments_affiliate_id ON public.user_payments(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_user_payments_created_at ON public.user_payments(created_at DESC);

-- Trigger for affiliates.updated_at
DROP TRIGGER IF EXISTS update_affiliates_updated_at ON public.affiliates;
CREATE TRIGGER update_affiliates_updated_at
  BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_payments.updated_at
DROP TRIGGER IF EXISTS update_user_payments_updated_at ON public.user_payments;
CREATE TRIGGER update_user_payments_updated_at
  BEFORE UPDATE ON public.user_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS for affiliates
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all affiliates" ON public.affiliates;
CREATE POLICY "Admins can manage all affiliates" ON public.affiliates
  FOR ALL USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')))
  WITH CHECK (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')));

DROP POLICY IF EXISTS "Affiliate can read own row" ON public.affiliates;
CREATE POLICY "Affiliate can read own row" ON public.affiliates
  FOR SELECT USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- 7. RLS for affiliate_visitors (only admins and service role; affiliates read own via view or we allow affiliate to read own stats)
DROP POLICY IF EXISTS "Admins and service can manage affiliate_visitors" ON public.affiliate_visitors;
CREATE POLICY "Admins and service can manage affiliate_visitors" ON public.affiliate_visitors
  FOR ALL USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')));

DROP POLICY IF EXISTS "Affiliate can read own visitors" ON public.affiliate_visitors;
CREATE POLICY "Affiliate can read own visitors" ON public.affiliate_visitors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.affiliates a WHERE a.id = affiliate_visitors.affiliate_id AND a.user_id = auth.uid())
  );

-- 8. RLS for user_payments
ALTER TABLE public.user_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and service can manage user_payments" ON public.user_payments;
CREATE POLICY "Admins and service can manage user_payments" ON public.user_payments
  FOR ALL USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')));

DROP POLICY IF EXISTS "Affiliate can read own commissions" ON public.user_payments;
CREATE POLICY "Affiliate can read own commissions" ON public.user_payments
  FOR SELECT USING (
    affiliate_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.affiliates a WHERE a.id = user_payments.affiliate_id AND a.user_id = auth.uid())
  );

-- 9. Referral code is stored as raw text in contact_submissions.referral_code (no anon affiliate lookup)
-- Only super admin can see all affiliates; affiliates can see their own row.
-- Allow anonymous insert for contact_submissions (already have "Anyone can insert" policy).
-- No change needed; insert policy is with check (true). We only added columns.

-- 10. Admin + affiliates need to SELECT contact_submissions (for admin panel + affiliate dashboards)
DROP POLICY IF EXISTS "Admins can view contact submissions" ON public.contact_submissions;
CREATE POLICY "Admins can view contact submissions" ON public.contact_submissions
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

DROP POLICY IF EXISTS "Affiliate can view own submissions" ON public.contact_submissions;
CREATE POLICY "Affiliate can view own submissions" ON public.contact_submissions
  FOR SELECT USING (
    affiliate_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.affiliates a
      WHERE a.id = contact_submissions.affiliate_id
        AND a.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.affiliates IS 'Affiliates managed by super admin; commission % set per affiliate';
COMMENT ON TABLE public.affiliate_visitors IS 'Unique visitor IP per affiliate for ?ref= link tracking';
COMMENT ON TABLE public.user_payments IS 'Payments by users; commission attributed to affiliate when applicable';
