-- Migration: Active Trades Tracking System
-- Description: Create tables and functions for live trading session tracking, P&L monitoring, and notifications

-- ========================================
-- 1. ACTIVE_TRADES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS active_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Trade Details
  symbol VARCHAR(20) NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'monitoring', 'exit_zone', 'completed', 'stopped_out', 'target_hit', 'cancelled')),
  
  -- Entry Details
  entry_price DECIMAL(12, 4) NOT NULL,
  entry_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  shares INTEGER NOT NULL,
  investment_amount DECIMAL(15, 2) NOT NULL,
  
  -- Position Details
  leverage DECIMAL(5, 2) DEFAULT 1.0,
  margin_type VARCHAR(10) CHECK (margin_type IN ('cash', 'margin', 'options')),
  
  -- Risk Management
  stop_loss_price DECIMAL(12, 4),
  take_profit_price DECIMAL(12, 4),
  stop_loss_percentage DECIMAL(5, 2),
  target_profit_percentage DECIMAL(5, 2),
  
  -- Holding Period
  holding_period VARCHAR(50), -- e.g., "3-5 days", "1 week"
  ai_recommended_hold_period VARCHAR(50),
  expected_exit_time TIMESTAMP WITH TIME ZONE,
  
  -- Current Status (updated real-time)
  current_price DECIMAL(12, 4),
  current_pnl DECIMAL(15, 2),
  current_pnl_percentage DECIMAL(8, 4),
  last_price_update TIMESTAMP WITH TIME ZONE,
  
  -- AI Prediction Reference
  prediction_id UUID, -- Link to original predictions table if exists
  confidence INTEGER,
  risk_grade VARCHAR(20),
  expected_roi_best DECIMAL(8, 2),
  expected_roi_likely DECIMAL(8, 2),
  expected_roi_worst DECIMAL(8, 2),
  
  -- Notifications
  mid_trade_alert_sent BOOLEAN DEFAULT FALSE,
  exit_zone_alert_sent BOOLEAN DEFAULT FALSE,
  target_hit_alert_sent BOOLEAN DEFAULT FALSE,
  stop_loss_alert_sent BOOLEAN DEFAULT FALSE,
  
  -- Exit Details (filled when trade completes)
  exit_price DECIMAL(12, 4),
  exit_time TIMESTAMP WITH TIME ZONE,
  actual_pnl DECIMAL(15, 2),
  actual_pnl_percentage DECIMAL(8, 4),
  exit_reason VARCHAR(50),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT positive_shares CHECK (shares > 0),
  CONSTRAINT positive_investment CHECK (investment_amount > 0)
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_active_trades_user_id ON active_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_active_trades_status ON active_trades(status);
CREATE INDEX IF NOT EXISTS idx_active_trades_symbol ON active_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_active_trades_entry_time ON active_trades(entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_active_trades_user_active ON active_trades(user_id, status) WHERE status IN ('active', 'monitoring', 'exit_zone');

-- ========================================
-- 2. TRADE_UPDATES TABLE (Price History)
-- ========================================
CREATE TABLE IF NOT EXISTS trade_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES active_trades(id) ON DELETE CASCADE,
  
  -- Price Data
  price DECIMAL(12, 4) NOT NULL,
  pnl DECIMAL(15, 2) NOT NULL,
  pnl_percentage DECIMAL(8, 4) NOT NULL,
  
  -- Time
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Status at this point
  status VARCHAR(20),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_updates_trade_id ON trade_updates(trade_id, timestamp DESC);

-- ========================================
-- 3. TRADE_NOTIFICATIONS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS trade_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES active_trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification Details
  type VARCHAR(50) NOT NULL CHECK (type IN ('mid_trade_update', 'exit_zone_alert', 'target_hit', 'stop_loss_triggered', 'holding_period_ending', 'price_alert')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'read', 'dismissed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  
  -- Notification Channel
  channel VARCHAR(20) DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'sms', 'push')),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_notifications_user_id ON trade_notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_notifications_trade_id ON trade_notifications(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_notifications_created_at ON trade_notifications(created_at DESC);

-- ========================================
-- 4. TRIGGERS & FUNCTIONS
-- ========================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to active_trades
DROP TRIGGER IF EXISTS update_active_trades_updated_at ON active_trades;
CREATE TRIGGER update_active_trades_updated_at
  BEFORE UPDATE ON active_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to trade_notifications
DROP TRIGGER IF EXISTS update_trade_notifications_updated_at ON trade_notifications;
CREATE TRIGGER update_trade_notifications_updated_at
  BEFORE UPDATE ON trade_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ========================================

-- Enable RLS
ALTER TABLE active_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_notifications ENABLE ROW LEVEL SECURITY;

-- Policies for active_trades
CREATE POLICY "Users can view their own trades" ON active_trades
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trades" ON active_trades
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trades" ON active_trades
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trades" ON active_trades
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for trade_updates
CREATE POLICY "Users can view updates for their trades" ON trade_updates
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM active_trades
    WHERE active_trades.id = trade_updates.trade_id
    AND active_trades.user_id = auth.uid()
  ));

CREATE POLICY "System can insert trade updates" ON trade_updates
  FOR INSERT
  WITH CHECK (true); -- Allow system/functions to insert

-- Policies for trade_notifications
CREATE POLICY "Users can view their own notifications" ON trade_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON trade_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON trade_notifications
  FOR INSERT
  WITH CHECK (true);

-- ========================================
-- 6. HELPER FUNCTIONS
-- ========================================

-- Function to calculate P&L
CREATE OR REPLACE FUNCTION calculate_pnl(
  p_entry_price DECIMAL,
  p_current_price DECIMAL,
  p_shares INTEGER,
  p_leverage DECIMAL DEFAULT 1.0
)
RETURNS TABLE(pnl DECIMAL, pnl_percentage DECIMAL) AS $$
BEGIN
  RETURN QUERY SELECT
    ((p_current_price - p_entry_price) * p_shares * p_leverage)::DECIMAL(15,2) as pnl,
    (((p_current_price - p_entry_price) / p_entry_price) * 100 * p_leverage)::DECIMAL(8,4) as pnl_percentage;
END;
$$ LANGUAGE plpgsql;

-- Function to check if stop loss or take profit hit
CREATE OR REPLACE FUNCTION check_exit_conditions(p_trade_id UUID)
RETURNS TABLE(should_exit BOOLEAN, reason VARCHAR) AS $$
DECLARE
  v_trade RECORD;
BEGIN
  SELECT * INTO v_trade FROM active_trades WHERE id = p_trade_id;
  
  IF v_trade.stop_loss_price IS NOT NULL AND v_trade.current_price <= v_trade.stop_loss_price THEN
    RETURN QUERY SELECT true, 'stop_loss_triggered'::VARCHAR;
  ELSIF v_trade.take_profit_price IS NOT NULL AND v_trade.current_price >= v_trade.take_profit_price THEN
    RETURN QUERY SELECT true, 'target_hit'::VARCHAR;
  ELSIF v_trade.expected_exit_time IS NOT NULL AND NOW() >= v_trade.expected_exit_time THEN
    RETURN QUERY SELECT true, 'holding_period_ended'::VARCHAR;
  ELSE
    RETURN QUERY SELECT false, NULL::VARCHAR;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 7. REAL-TIME SUBSCRIPTIONS SETUP
-- ========================================

-- Enable realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE active_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE trade_notifications;

COMMENT ON TABLE active_trades IS 'Stores active trading sessions with real-time P&L tracking';
COMMENT ON TABLE trade_updates IS 'Historical price updates for active trades';
COMMENT ON TABLE trade_notifications IS 'User notifications for trade events';
