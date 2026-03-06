-- Admin roles + daily board + user prediction presets

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS BOOLEAN AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'trading@admin.com'
    AND EXISTS (
      SELECT 1
      FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    );
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS admin_symbol_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  display_name TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0 AND sort_order <= 9),
  timeframe TEXT NOT NULL DEFAULT '1d',
  investment NUMERIC(14, 2) NOT NULL DEFAULT 10000,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_watchlist_symbol UNIQUE(symbol),
  CONSTRAINT unique_watchlist_sort_order UNIQUE(sort_order)
);

CREATE INDEX IF NOT EXISTS idx_admin_symbol_watchlist_active
  ON admin_symbol_watchlist(is_active, sort_order);

DROP TRIGGER IF EXISTS update_admin_symbol_watchlist_updated_at ON admin_symbol_watchlist;
CREATE TRIGGER update_admin_symbol_watchlist_updated_at
  BEFORE UPDATE ON admin_symbol_watchlist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS daily_predictions_board (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_for_date DATE NOT NULL,
  symbol TEXT NOT NULL,
  display_name TEXT,
  sort_order INTEGER NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '1d',
  investment NUMERIC(14, 2) NOT NULL DEFAULT 10000,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  prediction_payload JSONB NOT NULL,
  probability_score NUMERIC(5, 2),
  action_signal TEXT CHECK (action_signal IN ('BUY', 'SELL', 'HOLD')),
  expires_at TIMESTAMPTZ NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID REFERENCES auth.users(id),
  refresh_reason TEXT NOT NULL DEFAULT 'manual'
    CHECK (refresh_reason IN ('manual', 'expiry', 'daily', 'auto')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT unique_daily_symbol UNIQUE (generated_for_date, symbol),
  CONSTRAINT unique_daily_sort UNIQUE (generated_for_date, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_daily_predictions_board_date
  ON daily_predictions_board(generated_for_date DESC, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_daily_predictions_board_expiry
  ON daily_predictions_board(expires_at);

CREATE TABLE IF NOT EXISTS user_prediction_presets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT,
  timeframe TEXT,
  custom_timeframe TEXT,
  investment NUMERIC(14, 2),
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_user_prediction_presets_updated_at ON user_prediction_presets;
CREATE TRIGGER update_user_prediction_presets_updated_at
  BEFORE UPDATE ON user_prediction_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_symbol_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_predictions_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prediction_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own role" ON user_roles;
CREATE POLICY "Users can view their own role" ON user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage roles" ON user_roles;
CREATE POLICY "Service role can manage roles" ON user_roles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can view active watchlist" ON admin_symbol_watchlist;
CREATE POLICY "Authenticated users can view active watchlist" ON admin_symbol_watchlist
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

DROP POLICY IF EXISTS "Admins can manage watchlist" ON admin_symbol_watchlist;
CREATE POLICY "Admins can manage watchlist" ON admin_symbol_watchlist
  FOR ALL
  USING (is_app_admin() OR auth.role() = 'service_role')
  WITH CHECK (is_app_admin() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can view board" ON daily_predictions_board;
CREATE POLICY "Authenticated users can view board" ON daily_predictions_board
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

DROP POLICY IF EXISTS "Admins can manage board" ON daily_predictions_board;
CREATE POLICY "Admins can manage board" ON daily_predictions_board
  FOR ALL
  USING (is_app_admin() OR auth.role() = 'service_role')
  WITH CHECK (is_app_admin() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own preset" ON user_prediction_presets;
CREATE POLICY "Users can view own preset" ON user_prediction_presets
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preset" ON user_prediction_presets;
CREATE POLICY "Users can insert own preset" ON user_prediction_presets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preset" ON user_prediction_presets;
CREATE POLICY "Users can update own preset" ON user_prediction_presets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own preset" ON user_prediction_presets;
CREATE POLICY "Users can delete own preset" ON user_prediction_presets
  FOR DELETE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE daily_predictions_board;
