-- Allow fractional pending quantities for crypto paper strategies.
-- Existing integer values cast safely to numeric.
alter table public.pending_conditional_orders
  alter column quantity type numeric(20,8) using quantity::numeric;
