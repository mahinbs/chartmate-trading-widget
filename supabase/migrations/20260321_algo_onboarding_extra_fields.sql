-- Add legacy onboarding fields into single algo_onboarding form
alter table public.algo_onboarding
  add column if not exists trade_type text,
  add column if not exists trading_experience text,
  add column if not exists preferred_timeframe text,
  add column if not exists target_profit_pct numeric(5,2),
  add column if not exists stop_loss_pct numeric(5,2),
  add column if not exists max_drawdown_pct numeric(5,2),
  add column if not exists leverage_preference text,
  add column if not exists custom_leverage text,
  add column if not exists trading_goal text,
  add column if not exists trading_frequency text,
  add column if not exists risk_acknowledged boolean not null default false;

alter table public.algo_onboarding
  add constraint algo_onboarding_target_profit_pct_chk
  check (target_profit_pct is null or (target_profit_pct >= 0 and target_profit_pct <= 100));

alter table public.algo_onboarding
  add constraint algo_onboarding_stop_loss_pct_chk
  check (stop_loss_pct is null or (stop_loss_pct >= 0 and stop_loss_pct <= 100));

alter table public.algo_onboarding
  add constraint algo_onboarding_max_drawdown_pct_chk
  check (max_drawdown_pct is null or (max_drawdown_pct >= 0 and max_drawdown_pct <= 100));
