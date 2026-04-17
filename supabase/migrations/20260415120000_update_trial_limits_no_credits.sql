-- Update trial model to explicit per-day limits (no credit messaging).

ALTER TABLE public.trial_access
  ALTER COLUMN daily_credit_limit SET DEFAULT 0,
  ALTER COLUMN backtests_per_day SET DEFAULT 10,
  ALTER COLUMN ai_analysis_per_day SET DEFAULT 10,
  ALTER COLUMN scans_per_day SET DEFAULT 0;

ALTER TABLE public.trial_access
  ADD COLUMN IF NOT EXISTS paper_trades_per_day INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS strategy_creations_per_day INTEGER NOT NULL DEFAULT 1;

UPDATE public.trial_access
SET
  daily_credit_limit = 0,
  backtests_per_day = 10,
  ai_analysis_per_day = 10,
  scans_per_day = 0,
  paper_trades_per_day = COALESCE(paper_trades_per_day, 10),
  strategy_creations_per_day = COALESCE(strategy_creations_per_day, 1),
  updated_at = NOW();
