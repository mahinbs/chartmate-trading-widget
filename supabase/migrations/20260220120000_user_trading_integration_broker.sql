-- Add broker and token expiry columns to support direct broker-token flow.
-- api_key_encrypted now stores the user's broker access token (e.g. Zerodha access_token).
-- broker stores the broker id as understood by OpenAlgo (e.g. 'zerodha', 'upstox').
-- token_expires_at tracks the 24-hour expiry; frontend re-prompts when this passes.

ALTER TABLE user_trading_integration
  ADD COLUMN IF NOT EXISTS broker text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
