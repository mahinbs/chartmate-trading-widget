-- FII/DII daily activity (populated by NSE scraper / service role).
-- ORB filter: require net FII buying when orbRequireFiiNetBuying is true.

CREATE TABLE IF NOT EXISTS public.fii_dii_daily (
  trade_date   date PRIMARY KEY,
  fii_net_buy  numeric,
  dii_net_buy  numeric,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fii_dii_daily_trade_date ON public.fii_dii_daily (trade_date DESC);

COMMENT ON TABLE public.fii_dii_daily IS 'Daily FII/DII net buy/sell (₹ Cr or exchange units) from NSE; used for ORB institutional filter.';

-- Macro events (RBI, FOMC, etc.) — block ORB entries in a window before high-impact times.

CREATE TABLE IF NOT EXISTS public.macro_events_today (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date    date NOT NULL,
  event_time_utc time,
  title         text,
  impact        text,
  source        text,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_macro_events_today_event_date ON public.macro_events_today (event_date);

COMMENT ON TABLE public.macro_events_today IS 'High/medium impact macro events for ORB pre-event block window.';

-- RLS: service role has full access; authenticated users can read (dashboard / edge functions use JWT).
ALTER TABLE public.fii_dii_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_events_today ENABLE ROW LEVEL SECURITY;

-- Drop policies if re-run
DROP POLICY IF EXISTS "fii_dii_daily_read_authenticated" ON public.fii_dii_daily;
DROP POLICY IF EXISTS "fii_dii_daily_service_all" ON public.fii_dii_daily;
DROP POLICY IF EXISTS "macro_events_today_read_authenticated" ON public.macro_events_today;
DROP POLICY IF EXISTS "macro_events_today_service_all" ON public.macro_events_today;

CREATE POLICY "fii_dii_daily_read_authenticated"
  ON public.fii_dii_daily FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fii_dii_daily_service_all"
  ON public.fii_dii_daily FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "macro_events_today_read_authenticated"
  ON public.macro_events_today FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "macro_events_today_service_all"
  ON public.macro_events_today FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.fii_dii_daily TO authenticated;
GRANT ALL ON public.fii_dii_daily TO service_role;
GRANT SELECT ON public.macro_events_today TO authenticated;
GRANT ALL ON public.macro_events_today TO service_role;
