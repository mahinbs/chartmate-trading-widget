-- Add multi-leg strategy columns to active_trades
-- Required by the FastAPI multileg order endpoint

ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS legs_data        jsonb,    -- [{label, option_type, action, strike_offset}]
  ADD COLUMN IF NOT EXISTS net_premium      numeric,  -- net credit/debit for the whole structure
  ADD COLUMN IF NOT EXISTS profit_target    numeric,  -- absolute Rs target per lot
  ADD COLUMN IF NOT EXISTS stop_loss        numeric;  -- absolute Rs stop per lot

COMMENT ON COLUMN public.active_trades.legs_data     IS 'Multi-leg structure metadata (Iron Condor, Strangle, etc.)';
COMMENT ON COLUMN public.active_trades.net_premium   IS 'Net credit or debit received when opening the structure';
COMMENT ON COLUMN public.active_trades.profit_target IS 'Absolute P&L target (Rs) to close the structure';
COMMENT ON COLUMN public.active_trades.stop_loss     IS 'Absolute P&L stop (Rs) to close the structure';
