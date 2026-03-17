-- Add paper_strategy_type to user_strategies so backtests stay consistent
ALTER TABLE public.user_strategies
  ADD COLUMN IF NOT EXISTS paper_strategy_type text;

