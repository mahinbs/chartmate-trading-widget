-- Strangle roll engine: strikes, OTM offsets, order ids, adjustment_count (JSON, optional).

ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS strategy_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.active_trades.strategy_metadata IS
  'e.g. strangle: short leg strikes, offsets, per-leg order ids, roll_trigger_pts, adjustment_count.';

CREATE INDEX IF NOT EXISTS idx_active_trades_strategy_metadata
  ON public.active_trades USING gin (strategy_metadata)
  WHERE options_strategy_id IS NOT NULL;
