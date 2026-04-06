-- Add paper trade tracking columns to active_trades
-- is_paper_trade: true = simulated trade (no real broker order)
-- paper_strategy_type: which strategy template drove this paper trade

ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS is_paper_trade BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS paper_strategy_type TEXT NULL;

COMMENT ON COLUMN public.active_trades.is_paper_trade IS
  'When true this is a simulated paper trade — no real broker order was placed.';

COMMENT ON COLUMN public.active_trades.paper_strategy_type IS
  'Strategy template that triggered this paper trade (e.g. trend_following, orb, vwap_bounce).';

-- Index for filtering paper vs live trades
CREATE INDEX IF NOT EXISTS idx_active_trades_is_paper
  ON public.active_trades (user_id, is_paper_trade)
  WHERE is_paper_trade = true;
