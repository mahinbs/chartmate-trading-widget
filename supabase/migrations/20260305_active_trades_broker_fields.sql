-- Add broker execution fields to active_trades so we can square off via OpenAlgo
alter table public.active_trades
  add column if not exists broker_order_id   text,      -- entry order ID from OpenAlgo
  add column if not exists exit_order_id     text,      -- exit/square-off order ID from OpenAlgo
  add column if not exists exchange          text default 'NSE',
  add column if not exists product           text default 'CNC',  -- CNC | MIS | NRML
  add column if not exists strategy_type     text;      -- trend_following | intraday | swing | fno
