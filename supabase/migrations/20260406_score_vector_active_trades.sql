-- Migration: Add 7-module score_vector to active_trades for continuous learning
-- When a trade closes, score_vector + actual_pnl enable PnL-correlation analysis
-- per module to adjust weights over time.

ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS score_vector JSONB;

COMMENT ON COLUMN public.active_trades.score_vector IS
  '7-module score breakdown at entry time: {trend_direction, market_strength_score, trend_alignment_score, signal_strength_score, volume_confirmation_score, volatility_score, rr_score, trap_probability, final_score, entry_quality, execute_trade, stop_loss_price, take_profit_price, rr_ratio, adx_value, market_phase}';

-- Index for fast aggregation queries (correlation analysis every N completed trades)
CREATE INDEX IF NOT EXISTS idx_active_trades_score_vector
  ON public.active_trades USING gin (score_vector)
  WHERE score_vector IS NOT NULL;
