-- Widen active_trades numeric columns so large notionals / P&L never overflow on update.

alter table public.active_trades alter column investment_amount type numeric(22, 2);
alter table public.active_trades alter column current_pnl type numeric(22, 2);
alter table public.active_trades alter column entry_price type numeric(18, 8);
alter table public.active_trades alter column stop_loss_price type numeric(18, 8);
alter table public.active_trades alter column take_profit_price type numeric(18, 8);
alter table public.active_trades alter column current_price type numeric(18, 8);
alter table public.active_trades alter column current_pnl_percentage type numeric(12, 6);
