-- Canonical user signup tracking for admin reporting
-- Stores name/email/whatsapp/source for each real platform signup.
-- Admin UI derives stage from trial_access + webinar_registrations + user_subscriptions.

CREATE TABLE IF NOT EXISTS public.user_signup_tracking (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  whatsapp text,
  source text NOT NULL DEFAULT 'unknown',
  utm_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_signup_tracking_source
  ON public.user_signup_tracking(source);
CREATE INDEX IF NOT EXISTS idx_user_signup_tracking_email
  ON public.user_signup_tracking(email);
CREATE INDEX IF NOT EXISTS idx_user_signup_tracking_created_at
  ON public.user_signup_tracking(created_at DESC);

DROP TRIGGER IF EXISTS update_user_signup_tracking_updated_at ON public.user_signup_tracking;
CREATE TRIGGER update_user_signup_tracking_updated_at
  BEFORE UPDATE ON public.user_signup_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Backfill existing users so the admin table is immediately populated.
INSERT INTO public.user_signup_tracking (user_id, name, email, whatsapp, source, utm_json, created_at, updated_at)
SELECT
  usp.user_id,
  NULLIF(usp.full_name, '') AS name,
  usp.email,
  usp.phone AS whatsapp,
  'unknown'::text AS source,
  '{}'::jsonb AS utm_json,
  usp.created_at,
  now()
FROM public.user_signup_profiles usp
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_signup_tracking ust WHERE ust.user_id = usp.user_id
);

ALTER TABLE public.user_signup_tracking ENABLE ROW LEVEL SECURITY;

-- Admin can read all tracking rows.
DROP POLICY IF EXISTS "Admins can read all user signup tracking" ON public.user_signup_tracking;
CREATE POLICY "Admins can read all user signup tracking"
  ON public.user_signup_tracking
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
    )
  );

-- Users can read their own tracking row.
DROP POLICY IF EXISTS "Users can read own user signup tracking" ON public.user_signup_tracking;
CREATE POLICY "Users can read own user signup tracking"
  ON public.user_signup_tracking
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert/update their own row (at signup time).
DROP POLICY IF EXISTS "Users can insert own user signup tracking" ON public.user_signup_tracking;
CREATE POLICY "Users can insert own user signup tracking"
  ON public.user_signup_tracking
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own user signup tracking" ON public.user_signup_tracking;
CREATE POLICY "Users can update own user signup tracking"
  ON public.user_signup_tracking
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Make sure the admin panel can compute `paid_user` stage using user_subscriptions.
DROP POLICY IF EXISTS "Admins can read all subscriptions" ON public.user_subscriptions;
CREATE POLICY "Admins can read all subscriptions"
  ON public.user_subscriptions
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'super_admin')
      )
    )
  );

