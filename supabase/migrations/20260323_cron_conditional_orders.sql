-- Unschedule cron for conditional orders — we use webhook for real-time instead.
-- No cron. When TradingView (or any system) detects conditions, it POSTs to the
-- strategy webhook → order fires instantly.

SELECT cron.unschedule('process-conditional-orders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-conditional-orders'
);
