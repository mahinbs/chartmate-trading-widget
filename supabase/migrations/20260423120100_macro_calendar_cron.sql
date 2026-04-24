-- Schedule fetch-macro-calendar daily (08:00 UTC) via pg_cron + pg_net.
-- Requires app.supabase_url (or falls back to project URL) and CRON_SECRET matching Edge env.

CREATE OR REPLACE FUNCTION public.trigger_fetch_macro_calendar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  v_url := current_setting('app.supabase_url', true);
  IF v_url IS NULL OR btrim(v_url) = '' THEN
    v_url := 'https://ssesqiqtndhurfyntgbm.supabase.co';
  END IF;

  v_secret := current_setting('app.cron_secret', true);
  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
      WHERE name = 'CRON_SECRET'
      ORDER BY created_at DESC
      LIMIT 1;
    EXCEPTION
      WHEN undefined_table THEN
        v_secret := NULL;
    END;
  END IF;

  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    RAISE NOTICE 'fetch-macro-calendar: CRON_SECRET not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/fetch-macro-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', v_secret
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'fetch-macro-calendar: pg_cron not installed; skipping';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'fetch-macro-calendar: pg_net not installed; skipping';
    RETURN;
  END IF;

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'fetch-macro-calendar-daily-utc' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'fetch-macro-calendar-daily-utc',
    '0 8 * * *',
    'select public.trigger_fetch_macro_calendar();'
  );
END $$;

COMMENT ON FUNCTION public.trigger_fetch_macro_calendar() IS
  'Calls Edge Function fetch-macro-calendar (high-impact IN/US macro events for ORB gate)';
