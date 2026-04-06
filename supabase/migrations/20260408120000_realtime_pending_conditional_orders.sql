-- Push updates to clients when pending rows change (condition text, last_checked_at, status).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_conditional_orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
