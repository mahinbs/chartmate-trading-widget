-- Create strategy_condition_events if it never existed (engine/monitor inserts + Phase B UI).
-- Run before 20260418120000 / 20260418121500.

CREATE TABLE IF NOT EXISTS public.strategy_condition_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id   uuid NOT NULL,
  symbol        text NOT NULL DEFAULT '',
  matched       boolean NOT NULL DEFAULT false,
  all_matched   boolean,
  ready_count   integer,
  total_count   integer,
  conditions    jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons       jsonb NOT NULL DEFAULT '{}'::jsonb,
  at            timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategy_condition_events_strategy_id_created_at_idx
  ON public.strategy_condition_events (strategy_id, created_at DESC);

COMMENT ON TABLE public.strategy_condition_events IS
  'Per-tick structured entry/exit condition diagnostics for user_strategies / options_strategies.';
