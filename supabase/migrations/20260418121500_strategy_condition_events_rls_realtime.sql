-- Phase B: RLS so authenticated users can read their strategy_condition_events
-- + Realtime publication (no-op if already added).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'strategy_condition_events'
  ) THEN
    ALTER TABLE public.strategy_condition_events ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "strategy_condition_events_select_own" ON public.strategy_condition_events;
    CREATE POLICY "strategy_condition_events_select_own"
      ON public.strategy_condition_events
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_strategies us
          WHERE us.id::text = strategy_condition_events.strategy_id::text
            AND us.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.options_strategies os
          WHERE os.id::text = strategy_condition_events.strategy_id::text
            AND os.user_id = auth.uid()
        )
      );

    -- Service role bypasses RLS by default; engine/monitor inserts unchanged.
  END IF;
END $$;

-- Realtime publication (only if table exists — avoids 42P01 when create migration not applied yet)
DO $pub$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'strategy_condition_events'
      AND c.relkind = 'r'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.strategy_condition_events;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END IF;
END $pub$;
