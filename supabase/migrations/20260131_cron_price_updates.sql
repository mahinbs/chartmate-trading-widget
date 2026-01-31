-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to update active trade prices every 2 minutes
SELECT cron.schedule(
  'update-active-trades-prices',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/update-trade-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Store Supabase settings (to be set via SQL editor in Supabase dashboard)
-- Run these commands in Supabase SQL Editor after deployment:
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://ssesqiqtndhurfyntgbm.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key-here';
