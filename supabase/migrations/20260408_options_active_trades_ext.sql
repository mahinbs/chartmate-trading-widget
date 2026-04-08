-- ============================================================
-- Migration: extend active_trades for options-specific fields
-- Adds strike, expiry, premium tracking columns needed for
-- options position monitoring and premium-based SL/TP.
-- ============================================================

-- Link to the options_strategies that drove this trade
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS options_strategy_id uuid
    REFERENCES public.options_strategies(id) ON DELETE SET NULL;

-- The underlying index/stock (e.g. NIFTY, BANKNIFTY)
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS underlying text;

-- Resolved strike price (e.g. 24000)
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS strike_price numeric(12, 2);

-- CE or PE
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS option_type text
    CHECK (option_type IN ('CE', 'PE'));

-- Expiry date of the contract
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS expiry_date date;

-- Strike offset used at entry (ATM, OTM1, OTM2, ITM1, ITM2)
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS strike_offset text;

-- Fill price of the options contract (premium paid/received per unit)
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS entry_premium numeric(10, 4);

-- Peak premium since entry — used for trailing SL calculation
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS peak_premium numeric(10, 4);

-- Exit premium (fill price when position was closed)
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS exit_premium numeric(10, 4);

-- The resolved options symbol (e.g. NIFTY24JAN24000CE)
ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS options_symbol text;

-- Comments for documentation
COMMENT ON COLUMN public.active_trades.options_strategy_id IS
  'FK to options_strategies row that triggered this trade. NULL for equity trades.';

COMMENT ON COLUMN public.active_trades.underlying IS
  'Underlying index or stock (e.g. NIFTY, BANKNIFTY). NULL for equity trades.';

COMMENT ON COLUMN public.active_trades.strike_price IS
  'Resolved strike price of the option contract.';

COMMENT ON COLUMN public.active_trades.option_type IS
  'CE (Call) or PE (Put).';

COMMENT ON COLUMN public.active_trades.expiry_date IS
  'Expiry date of the options contract.';

COMMENT ON COLUMN public.active_trades.strike_offset IS
  'Strike offset at time of entry: ATM, OTM1, OTM2, ITM1, ITM2.';

COMMENT ON COLUMN public.active_trades.entry_premium IS
  'Premium (LTP) at which the options contract was bought/sold.';

COMMENT ON COLUMN public.active_trades.peak_premium IS
  'Highest premium seen since entry — used for trailing stop-loss calculation.';

COMMENT ON COLUMN public.active_trades.exit_premium IS
  'Premium at which the options contract was closed.';

COMMENT ON COLUMN public.active_trades.options_symbol IS
  'Fully resolved NSE options symbol string (e.g. NIFTY24JAN24000CE).';

-- Index for fast lookup of open options positions
CREATE INDEX IF NOT EXISTS idx_active_trades_options_strategy
  ON public.active_trades(options_strategy_id)
  WHERE options_strategy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_active_trades_options_open
  ON public.active_trades(user_id, options_strategy_id, status)
  WHERE options_strategy_id IS NOT NULL
    AND status IN ('active', 'monitoring', 'exit_zone');
