-- ============================================================
-- Drop the 2-minute polling crons for options.
-- The chartmate-monitor handles everything in real-time via
-- the OpenAlgo WebSocket — no cron polling needed.
-- ============================================================

SELECT cron.unschedule('options-strategy-entry-cron');
SELECT cron.unschedule('options-paper-exit-monitor-cron');
