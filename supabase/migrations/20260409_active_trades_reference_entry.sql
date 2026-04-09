-- Reference quote at execution decision vs actual fill (entry_price) — used for slippage in UI.

ALTER TABLE public.active_trades
  ADD COLUMN IF NOT EXISTS reference_entry_price numeric(14, 6);

COMMENT ON COLUMN public.active_trades.reference_entry_price IS
  'Price shown or used as reference when the trade was opened (signal LTP, chain quote, etc.). Slippage compares entry_price (fill) to this value.';
