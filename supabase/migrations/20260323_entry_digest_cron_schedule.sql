-- Schedule entry-point-daily-digest every minute from Postgres (pg_cron + pg_net).
-- Requires DB settings:
--   app.supabase_url         = https://<project-ref>.supabase.co
--   app.entry_digest_secret  = <same value as ENTRY_DIGEST_SECRET secret in Edge Functions>

CREATE OR REPLACE FUNCTION public.trigger_entry_point_daily_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  v_url := current_setting('app.supabase_url', true);
  v_secret := current_setting('app.entry_digest_secret', true);

  -- Fallback URL to this project when DB setting is missing.
  IF v_url IS NULL OR btrim(v_url) = '' THEN
    v_url := 'https://ssesqiqtndhurfyntgbm.supabase.co';
  END IF;

  -- Optional fallback: try Supabase Vault secret if DB setting is missing.
  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    BEGIN
      SELECT decrypted_secret
        INTO v_secret
      FROM vault.decrypted_secrets
      WHERE name = 'ENTRY_DIGEST_SECRET'
      ORDER BY created_at DESC
      LIMIT 1;
    EXCEPTION
      WHEN undefined_table THEN
        v_secret := NULL;
    END;
  END IF;

  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    RAISE NOTICE 'entry-point-daily-digest: entry digest secret not configured (set app.entry_digest_secret or Vault secret ENTRY_DIGEST_SECRET)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/entry-point-daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
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
    RAISE NOTICE 'entry-point-daily-digest: pg_cron not installed; skipping schedule';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'entry-point-daily-digest: pg_net not installed; skipping schedule';
    RETURN;
  END IF;

  SELECT jobid
    INTO v_job_id
  FROM cron.job
  WHERE jobname = 'entry-point-daily-digest-every-minute'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'entry-point-daily-digest-every-minute',
    '* * * * *',
    'select public.trigger_entry_point_daily_digest();'
  );
END $$;

COMMENT ON FUNCTION public.trigger_entry_point_daily_digest() IS
  'Invokes Edge Function entry-point-daily-digest using app.supabase_url + app.entry_digest_secret database settings';
