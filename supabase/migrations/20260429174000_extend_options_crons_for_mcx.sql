-- Extend options strategy crons for MCX evening session.
-- Old jobs were limited to UTC hours 3-9 (NSE daytime only).
-- New windows:
--   - entry scanner: every 1 min, UTC 03-18 (08:30-23:59 IST)
--   - exit monitor: every 2 min, UTC 03-18 (08:30-23:59 IST)

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('options-strategy-entry-cron');
  EXCEPTION WHEN OTHERS THEN
    -- ignore if missing
    NULL;
  END;

  BEGIN
    PERFORM cron.unschedule('options-paper-exit-monitor-cron');
  EXCEPTION WHEN OTHERS THEN
    -- ignore if missing
    NULL;
  END;
END $$;

SELECT cron.schedule(
  'options-strategy-entry-cron',
  '*/1 3-18 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/options-strategy-entry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'options-paper-exit-monitor-cron',
  '*/2 3-18 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/options-paper-exit-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
