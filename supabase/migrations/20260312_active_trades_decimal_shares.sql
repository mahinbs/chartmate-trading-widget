-- Allow decimal quantities for crypto trades (and any fractional trading flows).
-- Existing integer values cast safely to numeric.
alter table public.active_trades
  alter column shares type numeric(20,8) using shares::numeric;

-- Keep the positive quantity rule after type change.
alter table public.active_trades
  drop constraint if exists positive_shares;

alter table public.active_trades
  add constraint positive_shares check (shares > 0);

-- Keep helper function compatible with fractional shares.
create or replace function calculate_pnl(
  p_entry_price DECIMAL,
  p_current_price DECIMAL,
  p_shares DECIMAL,
  p_leverage DECIMAL DEFAULT 1.0
)
returns table(pnl DECIMAL, pnl_percentage DECIMAL) as $$
begin
  return query select
    ((p_current_price - p_entry_price) * p_shares * p_leverage)::decimal(15,2) as pnl,
    (((p_current_price - p_entry_price) / p_entry_price) * 100 * p_leverage)::decimal(8,4) as pnl_percentage;
end;
$$ language plpgsql;
