-- RSI divergence batch scanner: every MINUTE (finest schedule pg_cron supports — not per-second).
-- For tick-level behaviour, stream-conditional-tick calls runRsiDivergenceTickScan on each LTP.
--
-- If an older job exists: SELECT cron.unschedule('rsi-divergence-every-2min');
--
-- ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_REF.supabase.co';
-- ALTER DATABASE postgres SET app.cron_secret = 'YOUR_CRON_SECRET';
--
select cron.schedule(
  'rsi-divergence-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/rsi-divergence-scanner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
