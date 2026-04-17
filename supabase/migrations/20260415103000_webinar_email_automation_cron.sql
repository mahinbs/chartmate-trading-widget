-- Schedules webinar email automation edge function.
-- Configure either:
--   app.webinar_automation_secret = <secret>
-- or Supabase Vault secret named WEBINAR_AUTOMATION_SECRET.

CREATE OR REPLACE FUNCTION public.trigger_webinar_email_automation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  v_url := current_setting('app.supabase_url', true);
  v_secret := current_setting('app.webinar_automation_secret', true);

  IF v_url IS NULL OR btrim(v_url) = '' THEN
    v_url := 'https://ssesqiqtndhurfyntgbm.supabase.co';
  END IF;

  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    BEGIN
      SELECT decrypted_secret
        INTO v_secret
      FROM vault.decrypted_secrets
      WHERE name = 'WEBINAR_AUTOMATION_SECRET'
      ORDER BY created_at DESC
      LIMIT 1;
    EXCEPTION
      WHEN undefined_table THEN
        v_secret := NULL;
    END;
  END IF;

  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    RAISE NOTICE 'webinar-email-automation: secret not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/webinar-email-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{"action":"run_scheduled"}'::jsonb
  );
END;
$$;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'webinar-email-automation: pg_cron not installed; skipping';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'webinar-email-automation: pg_net not installed; skipping';
    RETURN;
  END IF;

  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'webinar-email-automation-every-5-min'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'webinar-email-automation-every-5-min',
    '*/5 * * * *',
    'select public.trigger_webinar_email_automation();'
  );
END;
$$;

COMMENT ON FUNCTION public.trigger_webinar_email_automation() IS
  'Invokes Edge Function webinar-email-automation for reminders and trial expiry nudges';
