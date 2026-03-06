-- User trading integration (OpenAlgo / broker gateway)
-- Stores per-user API key and base URL for the trading microservice to use.
CREATE TABLE IF NOT EXISTS user_trading_integration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type text NOT NULL DEFAULT 'openalgo',
  base_url text NOT NULL,
  api_key_encrypted text NOT NULL,
  broker_id text,
  strategy_name text DEFAULT 'ChartMate AI',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_trading_integration_user_id
  ON user_trading_integration(user_id);

ALTER TABLE user_trading_integration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own trading integration"
  ON user_trading_integration FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trading integration"
  ON user_trading_integration FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trading integration"
  ON user_trading_integration FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trading integration"
  ON user_trading_integration FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE user_trading_integration IS 'Stores OpenAlgo (or other gateway) base URL and API key per user for live order placement.';
