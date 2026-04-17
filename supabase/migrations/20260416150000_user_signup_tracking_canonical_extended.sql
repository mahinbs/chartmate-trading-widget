-- Extend user_signup_tracking to store canonical lifecycle fields (stage + attribution + timestamps)
-- and recompute stage from trial_access/webinar_registrations/user_subscriptions via triggers.

ALTER TABLE public.user_signup_tracking
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'signed_up'
  CHECK (stage IN ('signed_up', 'trial_active', 'webinar_registered', 'paid_user'));

ALTER TABLE public.user_signup_tracking
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

ALTER TABLE public.user_signup_tracking
  ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

ALTER TABLE public.user_signup_tracking
  ADD COLUMN IF NOT EXISTS trial_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end_at TIMESTAMPTZ;

ALTER TABLE public.user_signup_tracking
  ADD COLUMN IF NOT EXISTS webinar_batch_code TEXT;

ALTER TABLE public.user_signup_tracking
  ADD COLUMN IF NOT EXISTS paid_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.user_signup_tracking
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_signup_tracking_stage ON public.user_signup_tracking(stage);
CREATE INDEX IF NOT EXISTS idx_user_signup_tracking_source ON public.user_signup_tracking(source);
CREATE INDEX IF NOT EXISTS idx_user_signup_tracking_utm_source ON public.user_signup_tracking(utm_source);
CREATE INDEX IF NOT EXISTS idx_user_signup_tracking_affiliate_id ON public.user_signup_tracking(affiliate_id);

-- Canonical recompute function
CREATE OR REPLACE FUNCTION public.recompute_user_signup_tracking(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage TEXT := 'signed_up';
  v_trial_start_at TIMESTAMPTZ;
  v_trial_end_at TIMESTAMPTZ;
  v_webinar_batch_code TEXT;
  v_paid_plan_id TEXT;
  v_paid_at TIMESTAMPTZ;
  v_last_activity_at TIMESTAMPTZ;
BEGIN
  -- Ensure a row exists for this user (placeholders are okay; signup_complete upsert will fill source/UTMs).
  IF NOT EXISTS (SELECT 1 FROM public.user_signup_tracking WHERE user_id = p_user_id) THEN
    INSERT INTO public.user_signup_tracking (user_id, name, email, whatsapp, source, utm_json, stage)
    SELECT
      usp.user_id,
      NULLIF(usp.full_name, '') AS name,
      usp.email,
      usp.phone AS whatsapp,
      'unknown'::text AS source,
      '{}'::jsonb AS utm_json,
      'signed_up'::text AS stage
    FROM public.user_signup_profiles usp
    WHERE usp.user_id = p_user_id;
  END IF;

  -- Paid?
  SELECT
    s.plan_id,
    COALESCE(s.updated_at, s.created_at) AS paid_ts
  INTO
    v_paid_plan_id,
    v_paid_at
  FROM public.user_subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
  ORDER BY COALESCE(s.updated_at, s.created_at) DESC
  LIMIT 1;

  IF v_paid_plan_id IS NOT NULL THEN
    v_stage := 'paid_user';
  END IF;

  -- Trial (only if currently active)
  SELECT
    t.start_at,
    t.end_at,
    t.updated_at
  INTO
    v_trial_start_at,
    v_trial_end_at,
    v_last_activity_at
  FROM public.trial_access t
  WHERE t.user_id = p_user_id
  ORDER BY COALESCE(t.updated_at, t.start_at) DESC
  LIMIT 1;

  -- If we didn't already mark paid, consider active trial.
  IF v_stage <> 'paid_user' THEN
    IF v_trial_end_at IS NOT NULL
      AND v_trial_end_at > NOW()
      AND (SELECT status FROM public.trial_access WHERE user_id = p_user_id ORDER BY COALESCE(updated_at, start_at) DESC LIMIT 1) = 'active'
    THEN
      v_stage := 'trial_active';
    ELSE
      -- Clear values when trial isn't currently active.
      IF NOT (v_last_activity_at IS NULL) THEN
        v_trial_start_at := v_trial_start_at;
        v_trial_end_at := v_trial_end_at;
      END IF;
    END IF;
  END IF;

  -- Latest webinar reservation (registered/attended/no_show)
  SELECT
    w.batch_code,
    w.created_at
  INTO
    v_webinar_batch_code,
    v_last_activity_at
  FROM public.webinar_registrations w
  WHERE w.user_id = p_user_id
    AND w.status <> 'cancelled'
  ORDER BY w.created_at DESC
  LIMIT 1;

  IF v_stage <> 'paid_user' AND v_stage <> 'trial_active' THEN
    IF v_webinar_batch_code IS NOT NULL THEN
      v_stage := 'webinar_registered';
    ELSE
      v_stage := 'signed_up';
    END IF;
  END IF;

  -- Last activity: greatest timestamp among subscription/trial/webinar.
  SELECT GREATEST(
    COALESCE(v_paid_at, TO_TIMESTAMP(0)),
    COALESCE((SELECT updated_at FROM public.trial_access WHERE user_id = p_user_id ORDER BY COALESCE(updated_at,start_at) DESC LIMIT 1), TO_TIMESTAMP(0)),
    COALESCE((SELECT created_at FROM public.webinar_registrations WHERE user_id = p_user_id AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1), TO_TIMESTAMP(0))
  )
  INTO v_last_activity_at;

  UPDATE public.user_signup_tracking ust
  SET
    stage = v_stage,
    trial_start_at = v_trial_start_at,
    trial_end_at = v_trial_end_at,
    webinar_batch_code = v_webinar_batch_code,
    paid_plan_id = v_paid_plan_id,
    paid_at = v_paid_at,
    last_activity_at = v_last_activity_at,
    updated_at = NOW()
  WHERE ust.user_id = p_user_id;
END;
$$;

-- Trigger helpers
CREATE OR REPLACE FUNCTION public.recompute_user_signup_tracking_on_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_user_signup_tracking(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_user_signup_tracking_on_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_user_signup_tracking(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_user_signup_tracking_on_webinar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_user_signup_tracking(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recompute_signup_tracking_on_subscription ON public.user_subscriptions;
CREATE TRIGGER recompute_signup_tracking_on_subscription
  AFTER INSERT OR UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.recompute_user_signup_tracking_on_subscription();

DROP TRIGGER IF EXISTS recompute_signup_tracking_on_trial ON public.trial_access;
CREATE TRIGGER recompute_signup_tracking_on_trial
  AFTER INSERT OR UPDATE ON public.trial_access
  FOR EACH ROW EXECUTE FUNCTION public.recompute_user_signup_tracking_on_trial();

DROP TRIGGER IF EXISTS recompute_signup_tracking_on_webinar ON public.webinar_registrations;
CREATE TRIGGER recompute_signup_tracking_on_webinar
  AFTER INSERT OR UPDATE ON public.webinar_registrations
  FOR EACH ROW EXECUTE FUNCTION public.recompute_user_signup_tracking_on_webinar();

-- Backfill computed stage/lifecycle for existing users.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT user_id FROM public.user_signup_tracking LOOP
    PERFORM public.recompute_user_signup_tracking(r.user_id);
  END LOOP;
END $$;

