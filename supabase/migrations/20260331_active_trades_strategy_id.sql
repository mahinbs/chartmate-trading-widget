-- Links active_trades to user_strategies for check-strategy-exit / monitor indicator path.

ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS strategy_id uuid REFERENCES public.user_strategies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_active_trades_strategy_id ON public.active_trades(strategy_id)
  WHERE strategy_id IS NOT NULL;

COMMENT ON COLUMN public.active_trades.strategy_id IS 'user_strategies.id when trade was opened from that strategy (algo / conditional)';
