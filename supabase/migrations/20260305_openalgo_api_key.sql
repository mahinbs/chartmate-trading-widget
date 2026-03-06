-- Add openalgo_api_key column to user_trading_integration
-- This is the API key generated inside OpenAlgo (not the Zerodha broker token).
-- User copies it once from openalgo.tradebrainx.com → API Keys after logging in with Zerodha.

alter table public.user_trading_integration
  add column if not exists openalgo_api_key text;
