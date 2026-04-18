-- Phase B: structured condition diagnostics for strategy_condition_events
-- Requires table from 20260418115900_strategy_condition_events_create_table.sql (run that first on fresh DB).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'strategy_condition_events'
  ) THEN
    ALTER TABLE public.strategy_condition_events
      ADD COLUMN IF NOT EXISTS conditions jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS ready_count integer,
      ADD COLUMN IF NOT EXISTS total_count integer,
      ADD COLUMN IF NOT EXISTS all_matched boolean;

    CREATE INDEX IF NOT EXISTS strategy_condition_events_strategy_id_created_at_idx
      ON public.strategy_condition_events (strategy_id, created_at DESC);
  END IF;
END $$;

-- Realtime + RLS: see 20260418121500_strategy_condition_events_rls_realtime.sql
