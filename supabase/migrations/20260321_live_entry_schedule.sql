-- Alarm-style schedules for live entry digests: all days, weekdays, custom weekdays, or one-shot "tomorrow".

ALTER TABLE public.live_entry_trackers
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'all_days'
    CHECK (schedule_mode IN ('all_days', 'weekdays', 'custom', 'tomorrow_once')),
  ADD COLUMN IF NOT EXISTS days_of_week SMALLINT[] NOT NULL DEFAULT '{}'::SMALLINT[],
  ADD COLUMN IF NOT EXISTS one_off_local_date TEXT;

COMMENT ON COLUMN public.live_entry_trackers.schedule_mode IS 'all_days | weekdays | custom (use days_of_week) | tomorrow_once (one_off_local_date)';
COMMENT ON COLUMN public.live_entry_trackers.days_of_week IS '0=Sun .. 6=Sat; used when schedule_mode = custom';
COMMENT ON COLUMN public.live_entry_trackers.one_off_local_date IS 'YYYY-MM-DD in user timezone; fire once then auto-disable when schedule_mode = tomorrow_once';
