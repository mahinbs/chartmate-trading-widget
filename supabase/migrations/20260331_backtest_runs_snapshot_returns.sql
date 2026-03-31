-- Full API payload for replaying backtest UI; daily return series for charts/history.

ALTER TABLE public.backtest_runs
  ADD COLUMN IF NOT EXISTS returns jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.backtest_runs
  ADD COLUMN IF NOT EXISTS result_snapshot jsonb;

COMMENT ON COLUMN public.backtest_runs.returns IS 'Daily portfolio return % series (matches BacktestResult.dailyReturns)';
COMMENT ON COLUMN public.backtest_runs.result_snapshot IS 'Full VectorBT/backtest response JSON for identical UI replay';
