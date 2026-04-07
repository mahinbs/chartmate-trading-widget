-- Add ai_filter_snapshot column and UPDATE policy to backtest_runs
ALTER TABLE public.backtest_runs
  ADD COLUMN IF NOT EXISTS ai_filter_snapshot jsonb;

-- Allow users to update their own backtest runs (needed to save AI filter results)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'backtest_runs'
      AND policyname = 'Users update own backtest runs'
  ) THEN
    CREATE POLICY "Users update own backtest runs"
      ON public.backtest_runs FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;
