-- Schedule store-vix-history daily after Indian cash close (~15:35 IST = 10:05 UTC).
-- Requires pg_cron + pg_net; stores India VIX close in public.historical_vix.

CREATE OR REPLACE FUNCTION public.trigger_store_vix_history()
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
    RAISE NOTICE 'store-vix-history: CRON_SECRET not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/store-vix-history',
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
    RAISE NOTICE 'store-vix-history: pg_cron not installed; skipping';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'store-vix-history: pg_net not installed; skipping';
    RETURN;
  END IF;

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'store-vix-history-daily-ist-close-utc' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  -- 10:05 UTC = 15:35 IST (approx after NSE close)
  PERFORM cron.schedule(
    'store-vix-history-daily-ist-close-utc',
    '5 10 * * 1-5',
    'select public.trigger_store_vix_history();'
  );
END $$;

COMMENT ON FUNCTION public.trigger_store_vix_history() IS
  'Calls Edge store-vix-history to upsert daily India VIX into historical_vix';
