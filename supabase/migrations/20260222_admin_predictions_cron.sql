CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('generate-daily-predictions-board')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-daily-predictions-board'
);

SELECT cron.unschedule('refresh-expired-predictions-board')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-expired-predictions-board'
);

SELECT cron.schedule(
  'generate-daily-predictions-board',
  '5 0 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/admin-daily-board',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"daily"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'refresh-expired-predictions-board',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/admin-daily-board',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"refresh_expired"}'::jsonb
  );
  $$
);
