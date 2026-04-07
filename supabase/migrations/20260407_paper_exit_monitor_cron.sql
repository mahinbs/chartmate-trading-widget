-- Cron: run paper-exit-monitor every 2 minutes to auto-exit paper trades when conditions are met

SELECT cron.unschedule('paper-exit-monitor') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'paper-exit-monitor'
);

SELECT cron.schedule(
  'paper-exit-monitor',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/paper-exit-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  )
  $$
);
