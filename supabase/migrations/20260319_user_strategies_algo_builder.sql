ALTER TABLE public.user_strategies
  ADD COLUMN IF NOT EXISTS market_type text NOT NULL DEFAULT 'stocks',
  ADD COLUMN IF NOT EXISTS entry_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS exit_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS position_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS chart_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_days integer[] NOT NULL DEFAULT '{}'::integer[];
