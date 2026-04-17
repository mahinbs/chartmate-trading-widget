-- Signup-first webinar funnel foundation

-- 1) Webinar batches managed by admins
CREATE TABLE IF NOT EXISTS public.webinar_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  session_pattern_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  zoom_join_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webinar_batches_active ON public.webinar_batches(is_active);

-- 2) Webinar registrations (anonymous + signed-in allowed)
CREATE TABLE IF NOT EXISTS public.webinar_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES public.webinar_batches(id) ON DELETE SET NULL,
  batch_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'no_show', 'cancelled')),
  attendance_status TEXT NOT NULL DEFAULT 'unknown' CHECK (attendance_status IN ('unknown', 'attended_any', 'no_show')),
  attended_sessions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  consent_email BOOLEAN NOT NULL DEFAULT true,
  utm_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webinar_registrations_user_batch
  ON public.webinar_registrations(user_id, batch_code)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_batch_code ON public.webinar_registrations(batch_code);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_email ON public.webinar_registrations(email);
CREATE INDEX IF NOT EXISTS idx_webinar_registrations_created_at ON public.webinar_registrations(created_at DESC);

-- 3) 2-day trial and daily limits
CREATE TABLE IF NOT EXISTS public.trial_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted', 'revoked')),
  daily_credit_limit INTEGER NOT NULL DEFAULT 100,
  backtests_per_day INTEGER NOT NULL DEFAULT 2,
  ai_analysis_per_day INTEGER NOT NULL DEFAULT 5,
  scans_per_day INTEGER NOT NULL DEFAULT 15,
  used_credits_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_trial_access_status ON public.trial_access(status);
CREATE INDEX IF NOT EXISTS idx_trial_access_end_at ON public.trial_access(end_at);

-- 4) Funnel event stream
CREATE TABLE IF NOT EXISTS public.funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  event_name TEXT NOT NULL,
  path TEXT,
  utm_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_event_name ON public.funnel_events(event_name);
CREATE INDEX IF NOT EXISTS idx_funnel_events_created_at ON public.funnel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_id ON public.funnel_events(user_id);

-- 5) Email event log for idempotent reminder dispatch
CREATE TABLE IF NOT EXISTS public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registration_id UUID REFERENCES public.webinar_registrations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  template_key TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider_response_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_dedupe
  ON public.email_events(registration_id, template_key, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_events_status_time ON public.email_events(status, scheduled_for);

-- Keep updated_at fresh where supported
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_webinar_batches_updated_at ON public.webinar_batches;
    CREATE TRIGGER update_webinar_batches_updated_at
      BEFORE UPDATE ON public.webinar_batches
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_webinar_registrations_updated_at ON public.webinar_registrations;
    CREATE TRIGGER update_webinar_registrations_updated_at
      BEFORE UPDATE ON public.webinar_registrations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_trial_access_updated_at ON public.trial_access;
    CREATE TRIGGER update_trial_access_updated_at
      BEFORE UPDATE ON public.trial_access
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.webinar_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Helper role checks are repeated inline for compatibility.

-- webinar_batches policies
DROP POLICY IF EXISTS "Public can read active webinar batches" ON public.webinar_batches;
CREATE POLICY "Public can read active webinar batches"
  ON public.webinar_batches
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage webinar batches" ON public.webinar_batches;
CREATE POLICY "Admins can manage webinar batches"
  ON public.webinar_batches
  FOR ALL
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
  )
  WITH CHECK (
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

-- webinar_registrations policies
DROP POLICY IF EXISTS "Anyone can create webinar registrations" ON public.webinar_registrations;
CREATE POLICY "Anyone can create webinar registrations"
  ON public.webinar_registrations
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read all webinar registrations" ON public.webinar_registrations;
CREATE POLICY "Admins can read all webinar registrations"
  ON public.webinar_registrations
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

DROP POLICY IF EXISTS "Users can read own webinar registrations" ON public.webinar_registrations;
CREATE POLICY "Users can read own webinar registrations"
  ON public.webinar_registrations
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own webinar registrations" ON public.webinar_registrations;
CREATE POLICY "Users can update own webinar registrations"
  ON public.webinar_registrations
  FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- trial_access policies
DROP POLICY IF EXISTS "Users can read own trial_access" ON public.trial_access;
CREATE POLICY "Users can read own trial_access"
  ON public.trial_access
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own trial_access" ON public.trial_access;
CREATE POLICY "Users can create own trial_access"
  ON public.trial_access
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all trial_access" ON public.trial_access;
CREATE POLICY "Admins can manage all trial_access"
  ON public.trial_access
  FOR ALL
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
  )
  WITH CHECK (
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

-- funnel_events policies
DROP POLICY IF EXISTS "Anyone can insert funnel events" ON public.funnel_events;
CREATE POLICY "Anyone can insert funnel events"
  ON public.funnel_events
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read funnel events" ON public.funnel_events;
CREATE POLICY "Admins can read funnel events"
  ON public.funnel_events
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

-- email_events policies
DROP POLICY IF EXISTS "Service role manages email events" ON public.email_events;
CREATE POLICY "Service role manages email events"
  ON public.email_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can read email events" ON public.email_events;
CREATE POLICY "Admins can read email events"
  ON public.email_events
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

-- Seed default weekly batches (idempotent)
INSERT INTO public.webinar_batches (code, name, timezone, session_pattern_json, is_active)
VALUES
  (
    'batch_1',
    'Batch 1',
    'Asia/Kolkata',
    '[{"weekday":1,"hourIST":15,"minuteIST":0,"durationMinutes":60},{"weekday":3,"hourIST":15,"minuteIST":0,"durationMinutes":60},{"weekday":5,"hourIST":15,"minuteIST":0,"durationMinutes":60}]'::jsonb,
    true
  ),
  (
    'batch_2',
    'Batch 2',
    'Asia/Kolkata',
    '[{"weekday":2,"hourIST":15,"minuteIST":0,"durationMinutes":60},{"weekday":4,"hourIST":15,"minuteIST":0,"durationMinutes":60},{"weekday":6,"hourIST":15,"minuteIST":0,"durationMinutes":60}]'::jsonb,
    true
  ),
  (
    'batch_3',
    'Batch 3',
    'Asia/Kolkata',
    '[{"weekday":3,"hourIST":14,"minuteIST":0,"durationMinutes":60},{"weekday":5,"hourIST":14,"minuteIST":0,"durationMinutes":60},{"weekday":6,"hourIST":14,"minuteIST":0,"durationMinutes":60}]'::jsonb,
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  timezone = EXCLUDED.timezone,
  session_pattern_json = EXCLUDED.session_pattern_json,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
