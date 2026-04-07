-- Plan-change tracking: integration fee history + pending downgrade
-- integration_fee_paid: total one-time fees collected so far (used to compute upgrade delta)
-- pending_plan_change:  plan_id to switch to at next renewal (downgrade flow)
-- pending_plan_change_at: when the pending change was scheduled

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS integration_fee_paid  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_plan_change    TEXT,
  ADD COLUMN IF NOT EXISTS pending_plan_change_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_subscriptions.integration_fee_paid IS
  'Running total of one-time integration fees charged (used to compute upgrade deltas).';
COMMENT ON COLUMN public.user_subscriptions.pending_plan_change IS
  'plan_id to activate at next billing renewal (scheduled downgrade).';
COMMENT ON COLUMN public.user_subscriptions.pending_plan_change_at IS
  'Timestamp when the pending downgrade was requested.';
