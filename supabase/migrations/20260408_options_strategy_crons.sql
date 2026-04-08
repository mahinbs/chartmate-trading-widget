-- ============================================================
-- Migration: pg_cron jobs for options strategy entry + exit monitoring
-- ============================================================

-- options-strategy-entry: runs every minute during market hours (09:16 – 15:14 IST = 03:46 – 09:44 UTC)
SELECT cron.schedule(
  'options-strategy-entry-cron',
  '*/1 3-9 * * 1-5',
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

-- options-paper-exit-monitor: runs every 2 minutes during market hours
SELECT cron.schedule(
  'options-paper-exit-monitor-cron',
  '*/2 3-9 * * 1-5',
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
