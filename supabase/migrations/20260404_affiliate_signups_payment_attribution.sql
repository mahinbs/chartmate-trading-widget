-- Affiliate attribution: signups (user_signup_profiles) + payment rows; RLS for affiliates / WL admins / super_admin
-- IP-based linking uses affiliate_visitors (same IP as record-affiliate-visit); last visit wins; shared NAT can collide.

-- 1. Signup profile: which affiliate referred this user (validated in trigger)
ALTER TABLE public.user_signup_profiles
  ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL;
ALTER TABLE public.user_signup_profiles
  ADD COLUMN IF NOT EXISTS referral_code_at_signup TEXT;

CREATE INDEX IF NOT EXISTS idx_user_signup_profiles_affiliate_id
  ON public.user_signup_profiles(affiliate_id);

COMMENT ON COLUMN public.user_signup_profiles.affiliate_id IS 'Affiliate who referred this user at signup (?ref=), validated against affiliates.is_active';
COMMENT ON COLUMN public.user_signup_profiles.referral_code_at_signup IS 'Raw ?ref= code string stored at signup for display';

-- 2. Payments: plan + Stripe session for idempotency
ALTER TABLE public.user_payments
  ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE public.user_payments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_payments_stripe_checkout_session_id
  ON public.user_payments(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- 3. Trigger: validate affiliate_id from auth metadata; persist referral code
CREATE OR REPLACE FUNCTION public.handle_new_user_signup_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dob date;
  v_age int;
  v_name text;
  v_phone text;
  v_country text;
  v_affiliate_id uuid;
  v_ref_code text;
BEGIN
  v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), '');
  v_phone := nullif(trim(new.raw_user_meta_data->>'phone'), '');
  v_country := nullif(trim(new.raw_user_meta_data->>'country'), '');
  v_ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  v_affiliate_id := NULL;
  IF new.raw_user_meta_data ? 'affiliate_id'
     AND nullif(trim(new.raw_user_meta_data->>'affiliate_id'), '') IS NOT NULL
  THEN
    BEGIN
      v_affiliate_id := (new.raw_user_meta_data->>'affiliate_id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.affiliates a
        WHERE a.id = v_affiliate_id AND a.is_active = true
      ) THEN
        v_affiliate_id := NULL;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_affiliate_id := NULL;
    END;
  END IF;

  IF new.raw_user_meta_data ? 'date_of_birth'
     AND nullif(trim(new.raw_user_meta_data->>'date_of_birth'), '') IS NOT NULL
  THEN
    BEGIN
      v_dob := (new.raw_user_meta_data->>'date_of_birth')::date;
      v_age := (extract(year FROM age(current_date, v_dob)))::int;
    EXCEPTION
      WHEN OTHERS THEN
        v_dob := NULL;
        v_age := NULL;
    END;
  END IF;

  INSERT INTO public.user_signup_profiles (
    user_id, email, full_name, date_of_birth, age_at_signup, phone, country,
    affiliate_id, referral_code_at_signup
  )
  VALUES (
    new.id, new.email, v_name, v_dob, v_age, v_phone, v_country,
    v_affiliate_id, v_ref_code
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = excluded.email,
    full_name = excluded.full_name,
    date_of_birth = coalesce(excluded.date_of_birth, user_signup_profiles.date_of_birth),
    age_at_signup = coalesce(excluded.age_at_signup, user_signup_profiles.age_at_signup),
    phone = coalesce(excluded.phone, user_signup_profiles.phone),
    country = coalesce(excluded.country, user_signup_profiles.country),
    affiliate_id = coalesce(excluded.affiliate_id, user_signup_profiles.affiliate_id),
    referral_code_at_signup = coalesce(excluded.referral_code_at_signup, user_signup_profiles.referral_code_at_signup),
    updated_at = now();

  RETURN new;
END;
$$;

-- 4. RLS: referred users visible to affiliate + WL creator + super_admin (already has read-all)
DROP POLICY IF EXISTS "Affiliate reads referred signup profiles" ON public.user_signup_profiles;
CREATE POLICY "Affiliate reads referred signup profiles"
  ON public.user_signup_profiles FOR SELECT
  USING (
    affiliate_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = user_signup_profiles.affiliate_id
        AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "WL admin reads referred signup profiles" ON public.user_signup_profiles;
CREATE POLICY "WL admin reads referred signup profiles"
  ON public.user_signup_profiles FOR SELECT
  USING (
    affiliate_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = user_signup_profiles.affiliate_id
        AND a.created_by = auth.uid()
    )
  );

-- 5. Super-admin: full visibility on affiliate-related tables (role is super_admin, not legacy admin)
DROP POLICY IF EXISTS "Super-admin manages all affiliates" ON public.affiliates;
CREATE POLICY "Super-admin manages all affiliates"
  ON public.affiliates FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super-admin reads all affiliate_visitors" ON public.affiliate_visitors;
CREATE POLICY "Super-admin reads all affiliate_visitors"
  ON public.affiliate_visitors FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super-admin reads all contact_submissions" ON public.contact_submissions;
CREATE POLICY "Super-admin reads all contact_submissions"
  ON public.contact_submissions FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super-admin reads all user_payments" ON public.user_payments;
CREATE POLICY "Super-admin reads all user_payments"
  ON public.user_payments FOR SELECT
  USING (public.is_super_admin());
