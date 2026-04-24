-- Daily India VIX closing values for IV Rank (52-week) and options strategy gates.
-- Populated by Edge function store-vix-history (pg_cron after market close IST).

CREATE TABLE IF NOT EXISTS public.historical_vix (
  trade_date DATE PRIMARY KEY,
  closing_vix NUMERIC(8, 4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_historical_vix_trade_date_desc
  ON public.historical_vix (trade_date DESC);

COMMENT ON TABLE public.historical_vix IS
  'Daily closing India VIX (NSE) for IV Rank; filled by store-vix-history Edge job.';

ALTER TABLE public.historical_vix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historical_vix_read_authenticated" ON public.historical_vix;
DROP POLICY IF EXISTS "historical_vix_service_all" ON public.historical_vix;

CREATE POLICY "historical_vix_read_authenticated"
  ON public.historical_vix FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "historical_vix_service_all"
  ON public.historical_vix FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.historical_vix TO authenticated;
GRANT ALL ON public.historical_vix TO service_role;
