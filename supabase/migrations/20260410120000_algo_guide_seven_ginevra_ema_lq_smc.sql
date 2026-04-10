-- Align all 7 Strategy Guide presets + SMC for ginevra89@tiffincrane.com:
-- 1) EMA row → algoGuidePreset ema_crossover + empty groups (live engine preset path).
-- 2) INSERT Liquidity sweep + BOS and SMC MTF if missing.

-- ── 1) EMA → preset-driven entry (same engine as PDF) ───────────────────────
UPDATE public.user_strategies s
SET entry_conditions = jsonb_build_object(
  'mode', 'visual',
  'groupLogic', 'AND',
  'strategySubtype', 'indicator_based',
  'rawExpression', '',
  'algoGuidePreset', 'ema_crossover',
  'algoGuideBlockFirstSessionMinutes', true,
  'groups', '[]'::jsonb
)
FROM auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND s.name = 'Algo Guide · EMA 20/50 Trend Crossover';

-- ── 2) Liquidity sweep + BOS ────────────────────────────────────────────────
INSERT INTO public.user_strategies (
  user_id, name, description, trading_mode, is_intraday,
  start_time, end_time, squareoff_time,
  risk_per_trade_pct, stop_loss_pct, take_profit_pct,
  symbols, is_active, market_type, paper_strategy_type,
  entry_conditions, exit_conditions, position_config, risk_config, chart_config, execution_days
)
SELECT
  u.id,
  'Algo Guide · Liquidity Sweep + BOS',
  $d$Smart-money style: mark liquidity (equal highs/lows, swing points), wait for a sweep beyond those levels, then a break of structure in the trade direction. Entry on BOS confirmation; SL beyond the sweep; TP toward the next opposing liquidity zone. Tunable via entry_conditions.algoGuideParams in the builder.$d$,
  'BOTH'::text,
  true,
  '09:15'::text,
  '15:15'::text,
  '15:15'::text,
  1.0::numeric,
  1.0::numeric,
  2.0::numeric,
  '[]'::jsonb,
  true,
  'equity'::text,
  'breakout_breakdown'::text,
  $ec${
    "mode": "visual",
    "groupLogic": "AND",
    "strategySubtype": "indicator_based",
    "rawExpression": "",
    "algoGuidePreset": "liquidity_sweep_bos",
    "groups": []
  }$ec$::jsonb,
  $ex${"takeProfitPct": 2, "stopLossPct": 1, "clockExitTime": "15:15"}$ex$::jsonb,
  $pc${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc$::jsonb,
  $rc${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30}$rc$::jsonb,
  $cc${"interval": "5m", "chartType": "candlestick"}$cc$::jsonb,
  ARRAY[1,2,3,4,5]::integer[]
FROM auth.users u
WHERE lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_strategies s2
    WHERE s2.user_id = u.id AND s2.name = 'Algo Guide · Liquidity Sweep + BOS'
  );

-- ── 3) SMC multi-timeframe (SMC Strategy.pdf) ───────────────────────────────
INSERT INTO public.user_strategies (
  user_id, name, description, trading_mode, is_intraday,
  start_time, end_time, squareoff_time,
  risk_per_trade_pct, stop_loss_pct, take_profit_pct,
  symbols, is_active, market_type, paper_strategy_type,
  entry_conditions, exit_conditions, position_config, risk_config, chart_config, execution_days
)
SELECT
  u.id,
  'Algo Guide · SMC Multi-Timeframe Confluence',
  $d$Educational preset from SMC Strategy.pdf: 4H bias, 15m zones/FVG, 1m liquidity sweep + ChoCH + mitigation. Default session gate is London/NY UTC — algoGuideParams.smcDisableSessionGate=true allows NSE/paper outside those windows.$d$,
  'BOTH'::text,
  true,
  '09:15'::text,
  '15:15'::text,
  '15:15'::text,
  1.0::numeric,
  1.0::numeric,
  2.0::numeric,
  '[]'::jsonb,
  true,
  'global_equity'::text,
  'momentum'::text,
  $ec${
    "mode": "visual",
    "groupLogic": "AND",
    "strategySubtype": "indicator_based",
    "rawExpression": "",
    "algoGuidePreset": "smc_mtf_confluence",
    "algoGuideParams": { "smcDisableSessionGate": true },
    "groups": []
  }$ec$::jsonb,
  $ex${"takeProfitPct": 2, "stopLossPct": 1, "clockExitTime": "15:15"}$ex$::jsonb,
  $pc${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NYSE"}$pc$::jsonb,
  $rc${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "allowedExchanges": ["LSE", "NYSE", "NASDAQ"], "sessionVenues": ["london", "new_york"]}$rc$::jsonb,
  $cc${"interval": "5m", "chartType": "candlestick"}$cc$::jsonb,
  ARRAY[1,2,3,4,5]::integer[]
FROM auth.users u
WHERE lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_strategies s2
    WHERE s2.user_id = u.id AND s2.name = 'Algo Guide · SMC Multi-Timeframe Confluence'
  );
