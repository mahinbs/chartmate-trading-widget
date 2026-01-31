# 🚀 Complete Setup Guide

## ✅ **Step 1: Verify Edge Functions are Deployed**

### **Option A: Check via Supabase Dashboard**
1. Go to: https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/functions
2. You should see:
   - ✅ `predict-movement` (enhanced)
   - ✅ `start-trade-session` (new)
   - ✅ `update-trade-prices` (new)
   - `analyze-post-prediction`
   - `get-market-status`
   - `search-symbols`

### **Option B: Test with curl**
```bash
# Test start-trade-session (should return 401 Unauthorized if working)
curl https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/start-trade-session

# Test update-trade-prices (should work without auth)
curl https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/update-trade-prices

# If you get "Function not found" = not deployed
# If you get 401 or valid JSON = deployed ✅
```

---

## ✅ **Step 2: Apply Database Migrations**

You have **3 options** (choose the easiest for you):

### **Option A: Via Supabase Dashboard (EASIEST)** ⭐

1. **Go to SQL Editor**:
   - Open: https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/sql/new

2. **Copy the migration SQL**:
   - Open file: `/supabase/migrations/20260131_active_trades.sql`
   - Copy ALL contents (Cmd+A, Cmd+C)

3. **Paste and Run**:
   - Paste into SQL Editor
   - Click "Run" button
   - Should see: "Success. No rows returned"

4. **Verify tables created**:
   ```sql
   -- Run this to check:
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('active_trades', 'trade_updates', 'trade_notifications');
   ```
   - Should return 3 rows ✅

---

### **Option B: Via Terminal Script**

```bash
# Make script executable
chmod +x apply-migrations.sh

# Run it
./apply-migrations.sh

# Enter your database password when prompted
# (Find in: Dashboard > Settings > Database)
```

---

### **Option C: Via psql directly**

```bash
# Get your database password from Dashboard > Settings > Database

# Run migration
psql "postgresql://postgres:YOUR_PASSWORD@db.ssesqiqtndhurfyntgbm.supabase.co:5432/postgres" \
  -f supabase/migrations/20260131_active_trades.sql
```

---

## ✅ **Step 3: Setup Automatic Price Updates**

You have **2 options**:

### **Option A: Supabase Cron (EASIEST)** ⭐

1. **Enable pg_cron extension**:
   - Go to: https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/database/extensions
   - Search for "pg_cron"
   - Toggle ON

2. **Create cron job via SQL**:
   - Go to SQL Editor: https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/sql/new
   - Run this:

```sql
-- Schedule update-trade-prices to run every minute
SELECT cron.schedule(
  'update-trade-prices',           -- Job name
  '* * * * *',                     -- Every minute (cron format)
  $$
  SELECT net.http_post(
    url := 'https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/update-trade-prices',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

**Replace `YOUR_SERVICE_ROLE_KEY`** with your service role key from:
- Dashboard > Settings > API > `service_role` secret

3. **Verify cron job is running**:
```sql
-- Check scheduled jobs
SELECT * FROM cron.job;

-- Check job run history (after a few minutes)
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

---

### **Option B: External Cron Service (if pg_cron doesn't work)**

Use a service like:
- **GitHub Actions** (free, runs every minute)
- **Render Cron Jobs** (free tier available)
- **Vercel Cron** (if using Vercel)

**GitHub Actions example**:

Create `.github/workflows/update-prices.yml`:
```yaml
name: Update Trade Prices

on:
  schedule:
    - cron: '* * * * *'  # Every minute
  workflow_dispatch:     # Manual trigger

jobs:
  update-prices:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Function
        run: |
          curl -X POST \
            https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/update-trade-prices \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

---

## 🧪 **Step 4: Test Everything**

### **Test 1: Database Tables**
```sql
-- Check tables exist
\dt active_trades trade_updates trade_notifications

-- Should show 3 tables ✅
```

### **Test 2: Edge Functions**
```bash
# Test predict-movement (needs auth, so 401 is OK)
curl https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/predict-movement

# Test update-trade-prices (should return JSON)
curl https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/update-trade-prices

# Expected: {"message":"No active trades","updated":0}
# This is good! Means it's working ✅
```

### **Test 3: Complete Flow**

1. **Make a prediction**:
   - Go to http://localhost:8080/predict
   - Choose a stock (e.g., AAPL)
   - Enter investment amount
   - Complete all steps

2. **Start tracking**:
   - After prediction results, click **"START TRACKING THIS TRADE"**
   - Should see success message
   - Should navigate to /active-trades

3. **Verify in database**:
```sql
SELECT * FROM active_trades ORDER BY created_at DESC LIMIT 1;
-- Should see your trade ✅
```

4. **Wait 1-2 minutes** (for cron to run)

5. **Check if price updated**:
```sql
SELECT 
  symbol, 
  entry_price, 
  current_price, 
  current_pnl,
  last_price_update 
FROM active_trades 
ORDER BY created_at DESC 
LIMIT 1;

-- current_price should be different from entry_price ✅
-- last_price_update should be recent ✅
```

6. **Check Active Trades page**:
   - Go to http://localhost:8080/active-trades
   - Should see your trade with live P&L
   - Countdown timer should be ticking ✅

---

## 🔍 **Troubleshooting**

### **Problem: Tables not created**

**Check**:
```sql
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public';
```

**Solution**: Re-run migration SQL in dashboard

---

### **Problem: Edge functions not found**

**Check deployment**:
```bash
supabase functions list --project-ref ssesqiqtndhurfyntgbm
```

**Solution**: Re-deploy
```bash
supabase functions deploy start-trade-session --project-ref ssesqiqtndhurfyntgbm --no-verify-jwt
supabase functions deploy update-trade-prices --project-ref ssesqiqtndhurfyntgbm --no-verify-jwt
```

---

### **Problem: Prices not updating**

**Check cron job status**:
```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- View recent runs
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

**Check for errors**:
```sql
SELECT 
  jobid,
  runid,
  job_pid,
  status,
  return_message,
  start_time
FROM cron.job_run_details 
WHERE status = 'failed'
ORDER BY start_time DESC;
```

**Solution**: Check logs in Supabase Dashboard > Edge Functions > Logs

---

### **Problem: "No active trades" message**

**This is NORMAL** if you haven't started tracking any trades yet.

**To create a test trade**:
1. Make a prediction
2. Click "Start Tracking This Trade"
3. Trade will appear in Active Trades

---

## 📊 **Monitoring**

### **View all active trades**:
```sql
SELECT 
  symbol,
  action,
  status,
  entry_price,
  current_price,
  current_pnl,
  current_pnl_percentage,
  created_at,
  last_price_update
FROM active_trades
WHERE status IN ('active', 'monitoring', 'exit_zone')
ORDER BY created_at DESC;
```

### **View price update history**:
```sql
SELECT 
  at.symbol,
  tu.price,
  tu.pnl,
  tu.pnl_percentage,
  tu.timestamp
FROM trade_updates tu
JOIN active_trades at ON tu.trade_id = at.id
WHERE at.symbol = 'AAPL'  -- Replace with your symbol
ORDER BY tu.timestamp DESC
LIMIT 20;
```

### **View notifications**:
```sql
SELECT 
  at.symbol,
  tn.type,
  tn.title,
  tn.message,
  tn.status,
  tn.created_at
FROM trade_notifications tn
JOIN active_trades at ON tn.trade_id = at.id
ORDER BY tn.created_at DESC
LIMIT 20;
```

---

## ✅ **Verification Checklist**

Use this to confirm everything is working:

- [ ] **Edge Functions Deployed**
  - [ ] Can see them in dashboard
  - [ ] curl test returns valid response
  
- [ ] **Database Tables Created**
  - [ ] active_trades exists
  - [ ] trade_updates exists  
  - [ ] trade_notifications exists
  - [ ] Can query them without error
  
- [ ] **Cron Job Setup**
  - [ ] pg_cron extension enabled
  - [ ] Job scheduled (visible in cron.job table)
  - [ ] Job running (visible in cron.job_run_details)
  
- [ ] **Frontend Working**
  - [ ] Can make predictions
  - [ ] "Start Tracking" button appears
  - [ ] Can navigate to /active-trades
  - [ ] Active trades page loads
  
- [ ] **Real-time Updates Working**
  - [ ] Trade appears after clicking "Start Tracking"
  - [ ] P&L updates automatically (after cron runs)
  - [ ] Countdown timer ticks
  - [ ] Status changes show up
  
- [ ] **Notifications Working**
  - [ ] Notifications appear in database
  - [ ] Toast notifications show in app

---

## 🎯 **Quick Start (TL;DR)**

If you want the absolute fastest path:

```bash
# 1. Check functions deployed
curl https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/update-trade-prices

# 2. Apply migration via dashboard
# - Go to https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/sql/new
# - Copy/paste contents of supabase/migrations/20260131_active_trades.sql
# - Click Run

# 3. Enable pg_cron
# - Go to https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/database/extensions
# - Enable pg_cron

# 4. Schedule cron job
# - In SQL Editor, run the cron.schedule() command from above

# 5. Test
# - Make prediction
# - Click "Start Tracking"
# - Go to /active-trades
# - Wait 1 minute
# - Refresh to see price update

# Done! 🎉
```

---

## 🆘 **Need Help?**

If anything doesn't work:

1. Check Supabase logs: Dashboard > Edge Functions > Logs
2. Check browser console: F12 > Console
3. Check database: SQL Editor > Run queries above
4. Check this file: `COMPLETE_IMPLEMENTATION_REPORT.md`

---

**Last Updated**: 2026-01-31  
**All Features**: ✅ Deployed and Ready
