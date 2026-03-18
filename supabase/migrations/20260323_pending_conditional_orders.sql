-- Pending conditional orders: queued from UI, executed by our backend when strategy conditions are met

CREATE TABLE IF NOT EXISTS public.pending_conditional_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES public.user_strategies(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  exchange text NOT NULL DEFAULT 'NSE',
  action text NOT NULL CHECK (action IN ('BUY', 'SELL')),
  quantity integer NOT NULL,
  product text NOT NULL DEFAULT 'MIS',
  paper_strategy_type text NOT NULL DEFAULT 'trend_following',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'expired')),
  last_checked_at timestamptz,
  executed_at timestamptz,
  broker_order_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pending_cond_user ON public.pending_conditional_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_cond_status ON public.pending_conditional_orders(status);
CREATE INDEX IF NOT EXISTS idx_pending_cond_pending ON public.pending_conditional_orders(status, created_at) WHERE status = 'pending';

ALTER TABLE public.pending_conditional_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own pending orders"
  ON public.pending_conditional_orders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
