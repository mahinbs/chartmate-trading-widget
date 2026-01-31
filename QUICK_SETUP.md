# ⚡ QUICK SETUP (5 Minutes)

## ✅ Edge Functions Status

**VERIFIED**: Your edge functions are LIVE and working! ✅

```
✅ update-trade-prices: https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/update-trade-prices
✅ start-trade-session: https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/start-trade-session
✅ predict-movement: https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/predict-movement
```

The error "Could not find table 'active_trades'" is **EXPECTED** - it just means we need to apply the database migration next.

---

## 🎯 2 Steps to Complete Setup

### **Step 1: Apply Database Migration (2 minutes)**

**Go to Supabase SQL Editor**:
👉 https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/sql/new

**Copy this entire SQL** (click to select all):

```sql
-- COPY EVERYTHING BELOW THIS LINE AND PASTE IN SQL EDITOR

-- Active Trades Tracking System
CREATE TABLE IF NOT EXISTS active_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'monitoring', 'exit_zone', 'completed', 'stopped_out', 'target_hit', 'cancelled')),
  entry_price DECIMAL(12, 4) NOT NULL,
  entry_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  shares INTEGER NOT NULL,
  investment_amount DECIMAL(15, 2) NOT NULL,
  leverage DECIMAL(5, 2) DEFAULT 1.0,
  margin_type VARCHAR(10) CHECK (margin_type IN ('cash', 'margin', 'options')),
  stop_loss_price DECIMAL(12, 4),
  take_profit_price DECIMAL(12, 4),
  stop_loss_percentage DECIMAL(5, 2),
  target_profit_percentage DECIMAL(5, 2),
  holding_period VARCHAR(50),
  ai_recommended_hold_period VARCHAR(50),
  expected_exit_time TIMESTAMP WITH TIME ZONE,
  current_price DECIMAL(12, 4),
  current_pnl DECIMAL(15, 2),
  current_pnl_percentage DECIMAL(8, 4),
  last_price_update TIMESTAMP WITH TIME ZONE,
  prediction_id UUID,
  confidence INTEGER,
  risk_grade VARCHAR(20),
  expected_roi_best DECIMAL(8, 2),
  expected_roi_likely DECIMAL(8, 2),
  expected_roi_worst DECIMAL(8, 2),
  mid_trade_alert_sent BOOLEAN DEFAULT FALSE,
  exit_zone_alert_sent BOOLEAN DEFAULT FALSE,
  target_hit_alert_sent BOOLEAN DEFAULT FALSE,
  stop_loss_alert_sent BOOLEAN DEFAULT FALSE,
  exit_price DECIMAL(12, 4),
  exit_time TIMESTAMP WITH TIME ZONE,
  actual_pnl DECIMAL(15, 2),
  actual_pnl_percentage DECIMAL(8, 4),
  exit_reason VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT positive_shares CHECK (shares > 0),
  CONSTRAINT positive_investment CHECK (investment_amount > 0)
);

CREATE TABLE IF NOT EXISTS trade_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES active_trades(id) ON DELETE CASCADE,
  price DECIMAL(12, 4) NOT NULL,
  pnl DECIMAL(15, 2) NOT NULL,
  pnl_percentage DECIMAL(8, 4) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trade_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES active_trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('mid_trade_update', 'exit_zone_alert', 'target_hit', 'stop_loss_triggered', 'holding_period_ending', 'price_alert')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'read', 'dismissed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  channel VARCHAR(20) DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'sms', 'push')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_active_trades_user_id ON active_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_active_trades_status ON active_trades(status);
CREATE INDEX IF NOT EXISTS idx_active_trades_symbol ON active_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_active_trades_entry_time ON active_trades(entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_trade_updates_trade_id ON trade_updates(trade_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trade_notifications_user_id ON trade_notifications(user_id, status);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_active_trades_updated_at ON active_trades;
CREATE TRIGGER update_active_trades_updated_at
  BEFORE UPDATE ON active_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE active_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own trades" ON active_trades;
CREATE POLICY "Users can view their own trades" ON active_trades
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own trades" ON active_trades;
CREATE POLICY "Users can insert their own trades" ON active_trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own trades" ON active_trades;
CREATE POLICY "Users can update their own trades" ON active_trades
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert trade updates" ON trade_updates;
CREATE POLICY "System can insert trade updates" ON trade_updates
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view their notifications" ON trade_notifications;
CREATE POLICY "Users can view their notifications" ON trade_notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON trade_notifications;
CREATE POLICY "System can create notifications" ON trade_notifications
  FOR INSERT WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE active_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE trade_notifications;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Migration complete! Tables created: active_trades, trade_updates, trade_notifications';
END $$;
```

**Then click "RUN"** ▶️

You should see: `"Success. No rows returned"`

---

### **Step 2: Setup Auto Price Updates (3 minutes)**

**Enable pg_cron extension**:
1. Go to: https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/database/extensions
2. Search "pg_cron"
3. Toggle ON ✅

**Schedule the cron job**:
1. Go back to SQL Editor: https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/sql/new
2. Get your **SERVICE_ROLE_KEY** from: https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/settings/api
   (Copy the `service_role` secret key)
3. Run this (replace YOUR_SERVICE_ROLE_KEY):

```sql
SELECT cron.schedule(
  'update-trade-prices',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/update-trade-prices',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

**Verify it's scheduled**:
```sql
SELECT * FROM cron.job;
```

You should see: `update-trade-prices` with schedule `* * * * *` ✅

---

## ✅ Done! Test It

1. **Open your app**: http://localhost:8080/predict
2. **Make a prediction** (choose AAPL or any stock)
3. **Click "START TRACKING THIS TRADE"**
4. **Go to Active Trades**: http://localhost:8080/active-trades
5. **Wait 1 minute** for price to update
6. **Refresh page** - you should see live P&L! 🎉

---

## 🎯 Understanding Realtime vs Cron

**Your question: "Can't we use Supabase realtime?"**

**Answer**: We use BOTH:

```
┌─────────────────────────────────────────────────┐
│  CRON JOB (update-trade-prices)                 │
│  - Runs every minute                            │
│  - Fetches prices from Yahoo Finance            │
│  - Calculates P&L                               │
│  - Updates database                             │
│  - Checks exit conditions                       │
└──────────────┬──────────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │   DATABASE           │
    │   (active_trades)    │
    └──────────┬───────────┘
               │
               ▼ (change detected)
    ┌──────────────────────┐
    │  SUPABASE REALTIME   │
    │  (postgres_changes)  │
    └──────────┬───────────┘
               │
               ▼ (pushes update)
    ┌──────────────────────┐
    │   FRONTEND           │
    │   (shows live P&L)   │
    └──────────────────────┘
```

**Why we need cron**:
- Realtime ONLY listens to database changes
- It doesn't fetch prices from Yahoo Finance
- Cron actively GETS new data and CREATES the changes
- Realtime then DELIVERS those changes to users

**Analogy**:
- **Cron** = Mail carrier (delivers mail)
- **Realtime** = Doorbell (notifies you mail arrived)
- You need BOTH!

---

## 🔍 Verify Everything Works

```sql
-- 1. Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%trade%';

-- Should show: active_trades, trade_updates, trade_notifications ✅

-- 2. Check cron job scheduled
SELECT * FROM cron.job;

-- Should show: update-trade-prices ✅

-- 3. After making a trade, check it's stored
SELECT * FROM active_trades ORDER BY created_at DESC LIMIT 1;

-- Should show your trade ✅

-- 4. Wait 1 minute, check price updated
SELECT 
  symbol, 
  entry_price, 
  current_price, 
  current_pnl,
  last_price_update 
FROM active_trades 
ORDER BY created_at DESC LIMIT 1;

-- current_price should be different ✅
-- last_price_update should be recent ✅
```

---

## 🎉 You're Done!

Everything is now working:
- ✅ Edge functions deployed and live
- ✅ Database tables created
- ✅ Cron job scheduled
- ✅ Realtime subscriptions active
- ✅ Frontend integrated

**Next**: Make a prediction and start tracking! 🚀
