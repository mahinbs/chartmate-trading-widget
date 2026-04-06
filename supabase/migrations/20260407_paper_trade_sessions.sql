-- Paper trade support for pending_conditional_orders:
-- is_paper_trade: when true, conditions are checked in real-time but entry goes to active_trades
--                 directly (bypasses OpenAlgo/broker). The broker_order_id is assigned a PAPER- prefix.
-- scheduled_for:  when set, condition monitoring begins only after this UTC timestamp.
--                 status='scheduled' until that moment, then auto-transitions to 'pending'.

ALTER TABLE public.pending_conditional_orders
  ADD COLUMN IF NOT EXISTS is_paper_trade BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.pending_conditional_orders
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ NULL;

-- Widen the status check to include 'scheduled'
ALTER TABLE public.pending_conditional_orders
  DROP CONSTRAINT IF EXISTS pending_conditional_orders_status_check;

ALTER TABLE public.pending_conditional_orders
  ADD CONSTRAINT pending_conditional_orders_status_check
    CHECK (status IN ('pending', 'scheduled', 'executed', 'cancelled', 'expired'));

-- Index to efficiently find scheduled rows that are now due
CREATE INDEX IF NOT EXISTS idx_pending_cond_scheduled
  ON public.pending_conditional_orders(scheduled_for)
  WHERE status = 'scheduled';

COMMENT ON COLUMN public.pending_conditional_orders.is_paper_trade IS
  'When true, a matched entry creates an active_trades row directly (PAPER- broker_order_id) instead of routing through OpenAlgo.';

COMMENT ON COLUMN public.pending_conditional_orders.scheduled_for IS
  'UTC timestamp at which condition monitoring begins. NULL = start immediately. While in the future the status is ''scheduled''.';
