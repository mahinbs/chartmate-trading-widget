-- Deploy-time overrides for conditional orders (session times, clock entry/exit, auto-exit toggle)
ALTER TABLE public.pending_conditional_orders
  ADD COLUMN IF NOT EXISTS deploy_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.pending_conditional_orders.deploy_overrides IS
  'Optional JSON: { start_time, end_time, squareoff_time, clock_entry_time, clock_exit_time, use_auto_exit } merged into live condition scan only; does not mutate user_strategies.';
