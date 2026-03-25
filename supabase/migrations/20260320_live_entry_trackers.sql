-- Live entry point daily digest: user tracks up to 5 symbols (stocks/crypto), each with a local wall-clock time.

CREATE TABLE IF NOT EXISTS public.live_entry_trackers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  display_name TEXT,
  notify_time TIME NOT NULL DEFAULT TIME '09:30:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_digest_on TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT live_entry_trackers_user_symbol UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_live_entry_trackers_user ON public.live_entry_trackers (user_id);
CREATE INDEX IF NOT EXISTS idx_live_entry_trackers_enabled ON public.live_entry_trackers (user_id) WHERE enabled = TRUE;

CREATE OR REPLACE FUNCTION public.enforce_max_live_entry_trackers()
RETURNS TRIGGER AS $$
DECLARE
  n INT;
BEGIN
  IF NEW.enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO n
  FROM public.live_entry_trackers
  WHERE user_id = NEW.user_id
    AND enabled = TRUE
    AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF n >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 symbols with entry digest tracking enabled';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_live_entry_max ON public.live_entry_trackers;
CREATE TRIGGER trg_live_entry_max
  BEFORE INSERT OR UPDATE ON public.live_entry_trackers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_live_entry_trackers();

DROP TRIGGER IF EXISTS trg_live_entry_updated ON public.live_entry_trackers;
CREATE TRIGGER trg_live_entry_updated
  BEFORE UPDATE ON public.live_entry_trackers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.live_entry_trackers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own live entry trackers"
  ON public.live_entry_trackers
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- In-app alerts (no trade_id — separate from trade_notifications)
CREATE TABLE IF NOT EXISTS public.entry_point_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entry_point_alerts_user_created ON public.entry_point_alerts (user_id, created_at DESC);

ALTER TABLE public.entry_point_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own entry point alerts"
  ON public.entry_point_alerts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own entry point alerts"
  ON public.entry_point_alerts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Inserts are performed by Edge Functions using the service role (bypasses RLS).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.entry_point_alerts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.live_entry_trackers IS 'Daily entry-point digest schedule per symbol (max 5 enabled per user)';
COMMENT ON TABLE public.entry_point_alerts IS 'In-app notifications for daily entry-point digests';
