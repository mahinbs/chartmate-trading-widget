-- ============================================================
-- Migration: user_strategies table + openalgo_username column
-- ============================================================

-- 1. Add openalgo_username to user_trading_integration
--    (stores the derived username like "sb_<id>" used in OpenAlgo)
ALTER TABLE public.user_trading_integration
  ADD COLUMN IF NOT EXISTS openalgo_username text;

-- 2. user_strategies — multi-strategy management per user
--    Users create strategies from ChartMate; we sync them to OpenAlgo.
CREATE TABLE IF NOT EXISTS public.user_strategies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,

  -- Trading config
  trading_mode        text NOT NULL DEFAULT 'LONG',   -- LONG | SHORT | BOTH
  is_intraday         boolean NOT NULL DEFAULT true,
  start_time          text DEFAULT '09:15',
  end_time            text DEFAULT '15:15',
  squareoff_time      text DEFAULT '15:15',

  -- Risk config
  risk_per_trade_pct  numeric(5,2) DEFAULT 1.0,       -- % of capital per trade
  stop_loss_pct       numeric(5,2) DEFAULT 2.0,       -- % SL from entry
  take_profit_pct     numeric(5,2) DEFAULT 4.0,       -- % TP from entry

  -- Symbols: [{symbol, exchange, quantity, product_type}]
  symbols             jsonb NOT NULL DEFAULT '[]',

  -- OpenAlgo sync
  openalgo_strategy_id  integer,                      -- OpenAlgo internal strategy id
  openalgo_webhook_id   text,                         -- UUID webhook used for webhook alerts

  -- AI analysis results (populated by analyze-strategy function)
  ai_analysis         jsonb,                          -- recommendations, risk_score, expected_return, notes
  backtest_summary    jsonb,                          -- win_rate, avg_return, max_drawdown, trades_tested

  -- Status
  is_active           boolean NOT NULL DEFAULT true,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_strategies_user       ON public.user_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_strategies_active     ON public.user_strategies(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_strategies_webhook    ON public.user_strategies(openalgo_webhook_id);

-- 3. openalgo_order_history — synced broker orders from OpenAlgo
--    Pulled via sync-order-history edge function (calls /api/v1/orderbook).
CREATE TABLE IF NOT EXISTS public.openalgo_order_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- From OpenAlgo orderbook response
  broker_order_id     text,
  symbol              text,
  exchange            text,
  action              text,       -- BUY | SELL
  quantity            numeric,
  price               numeric,
  order_type          text,       -- MARKET | LIMIT
  product_type        text,       -- MIS | CNC | NRML
  status              text,       -- complete | rejected | open | cancelled
  filled_quantity     numeric,
  average_price       numeric,
  strategy_name       text,
  rejection_reason    text,

  -- From broker
  order_timestamp     timestamptz,
  synced_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, broker_order_id)
);

CREATE INDEX IF NOT EXISTS idx_openalgo_order_history_user      ON public.openalgo_order_history(user_id);
CREATE INDEX IF NOT EXISTS idx_openalgo_order_history_time      ON public.openalgo_order_history(user_id, order_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_openalgo_order_history_symbol    ON public.openalgo_order_history(user_id, symbol);

-- 4. RLS for user_strategies
ALTER TABLE public.user_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own strategies"
  ON public.user_strategies FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super-admin full access strategies"
  ON public.user_strategies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 5. RLS for openalgo_order_history
ALTER TABLE public.openalgo_order_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own order history"
  ON public.openalgo_order_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service and super-admin manage order history"
  ON public.openalgo_order_history FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );
