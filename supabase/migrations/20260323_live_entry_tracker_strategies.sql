-- Persist selected strategies per live entry schedule.
ALTER TABLE public.live_entry_trackers
  ADD COLUMN IF NOT EXISTS selected_strategies text[] NOT NULL DEFAULT ARRAY['trend_following', 'mean_reversion', 'momentum']::text[];

ALTER TABLE public.live_entry_trackers
  ADD COLUMN IF NOT EXISTS selected_custom_strategy_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.live_entry_trackers.selected_strategies IS 'Built-in strategy ids used by entry digest scan for this schedule';
COMMENT ON COLUMN public.live_entry_trackers.selected_custom_strategy_ids IS 'user_strategies ids selected for this schedule';
