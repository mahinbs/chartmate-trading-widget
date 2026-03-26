-- Persist historical what-if snapshots with each backtest run (UI "Historical What-If" tab).

ALTER TABLE public.backtest_runs
  ADD COLUMN IF NOT EXISTS historical_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.backtest_runs.historical_snapshots IS
  'VectorBT multi-window what-if results (label, lookbackDays, trades, returns, equityCurveSlice, etc.)';
