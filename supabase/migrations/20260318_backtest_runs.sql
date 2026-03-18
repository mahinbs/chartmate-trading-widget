-- ============================================================
-- Migration: backtest_runs (store backtesting history per user)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.backtest_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  symbol        text NOT NULL,
  exchange      text NOT NULL DEFAULT 'NSE',
  action        text NOT NULL DEFAULT 'BUY',
  mode          text NOT NULL DEFAULT 'strategy', -- strategy | simple
  strategy_label text,

  -- Params and results are stored as jsonb for flexibility
  params        jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  trades        jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_user_time ON public.backtest_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_symbol    ON public.backtest_runs(user_id, symbol);

ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own backtest runs"
  ON public.backtest_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own backtest runs"
  ON public.backtest_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own backtest runs"
  ON public.backtest_runs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service and super-admin manage backtest runs"
  ON public.backtest_runs FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

