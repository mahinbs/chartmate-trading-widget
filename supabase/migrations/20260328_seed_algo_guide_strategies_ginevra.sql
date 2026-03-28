-- Seed five "Algo Trading Strategy Guide" presets for a single account (educational presets).
-- strategy-entry-signals: EMA row uses visual groups AND raw adjunct VOLUME vs VOL_SMA(20) on real bar volume.
-- Rows with entry_conditions.algoGuidePreset run ORB / Supertrend(7,3) / VWAP bounce / RSI divergence detectors
-- on fetched OHLCV (Yahoo / Twelve Data / Alpha Vantage). If a preset finds no trades, paper_strategy_type
-- templates still apply as fallback. Requires auth.users row for ginevra89@tiffincrane.com (no-op if user missing).

INSERT INTO public.user_strategies (
  user_id,
  name,
  description,
  trading_mode,
  is_intraday,
  start_time,
  end_time,
  squareoff_time,
  risk_per_trade_pct,
  stop_loss_pct,
  take_profit_pct,
  symbols,
  is_active,
  market_type,
  paper_strategy_type,
  entry_conditions,
  exit_conditions,
  position_config,
  risk_config,
  chart_config,
  execution_days
)
SELECT
  u.id,
  v.name,
  v.description,
  v.trading_mode,
  v.is_intraday,
  v.start_time,
  v.end_time,
  v.squareoff_time,
  v.risk_per_trade_pct,
  v.stop_loss_pct,
  v.take_profit_pct,
  '[]'::jsonb,
  true,
  'equity',
  v.paper_strategy_type,
  v.entry_conditions::jsonb,
  v.exit_conditions::jsonb,
  v.position_config::jsonb,
  v.risk_config::jsonb,
  v.chart_config::jsonb,
  v.execution_days
FROM auth.users u
CROSS JOIN (VALUES
  (
    'Algo Guide · EMA 20/50 Trend Crossover',
    $desc1$Educational preset (NSE guide). LONG bias: 20 EMA crosses above 50 EMA, RSI 14 between 50–75, price above 200 EMA, volume ≥1.5× 20-bar average (raw rule on real bar volume from Yahoo/Twelve Data). Prefer India session 9:30–14:00 IST; VIX filter manual. SL: below signal candle low; TP: ≥2.5R; trail to 20 EMA; square-off by 3:15. Past performance does not guarantee future results.$desc1$,
    'LONG'::text,
    true,
    '09:30'::text,
    '14:00'::text,
    '15:15'::text,
    1.0::numeric,
    1.0::numeric,
    2.5::numeric,
    'trend_following'::text,
    $ec1${
      "mode": "visual",
      "groupLogic": "AND",
      "strategySubtype": "indicator_based",
      "rawExpression": "VOLUME >= 1.5 * VOL_SMA(20)",
      "algoGuideBlockFirstSessionMinutes": true,
      "groups": [
        {
          "id": "a1111111-1111-4111-8111-111111111101",
          "logic": "AND",
          "conditions": [
            {
              "id": "b1111111-1111-4111-8111-111111111101",
              "indicator": "EMA",
              "period": 20,
              "op": "crosses_above",
              "rhs": { "kind": "indicator", "id": "EMA", "period": 50 }
            },
            {
              "id": "b1111111-1111-4111-8111-111111111102",
              "indicator": "RSI",
              "period": 14,
              "op": "greater_than",
              "rhs": { "kind": "value", "value": 50 }
            },
            {
              "id": "b1111111-1111-4111-8111-111111111103",
              "indicator": "RSI",
              "period": 14,
              "op": "less_than",
              "rhs": { "kind": "value", "value": 75 }
            },
            {
              "id": "b1111111-1111-4111-8111-111111111104",
              "indicator": "PRICE",
              "op": "greater_than",
              "rhs": { "kind": "indicator", "id": "EMA", "period": 200 }
            }
          ]
        }
      ]
    }$ec1$,
    $ex1${
      "takeProfitPct": 2.5,
      "stopLossPct": 1,
      "trailingStop": false,
      "timeBasedExit": false,
      "clockExitTime": "15:15"
    }$ex1$,
    $pc1${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc1$,
    $rc1${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "minRiskReward": 2}$rc1$,
    $cc1${"interval": "15m", "chartType": "candlestick"}$cc1$,
    ARRAY[1,2,3,4,5]::integer[]
  ),
  (
    'Algo Guide · Opening Range Breakout (ORB)',
    $desc2$Educational preset (Toby Crabel ORB). Scanner: opening range 9:15–9:30 IST, breakout after 9:30 on chart interval (use 5m for guide fidelity). Width filter 0.2%–1% of mid. Fallback template breakout_breakdown applies if no ORB match. SL: range opposite side; target ~1.5–2× range; flat by 3:15.$desc2$,
    'BOTH',
    true,
    '09:30'::text,
    '15:15'::text,
    '15:15'::text,
    1.0::numeric,
    1.0::numeric,
    2.0::numeric,
    'breakout_breakdown'::text,
    $ec2${
      "mode": "visual",
      "groupLogic": "AND",
      "strategySubtype": "indicator_based",
      "rawExpression": "",
      "algoGuidePreset": "orb",
      "groups": []
    }$ec2$,
    $ex2${"takeProfitPct": 2, "stopLossPct": 1, "clockExitTime": "15:15"}$ex2$,
    $pc2${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc2$,
    $rc2${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30}$rc2$,
    $cc2${"interval": "5m", "chartType": "candlestick"}$cc2$,
    ARRAY[1,2,3,4,5]::integer[]
  ),
  (
    'Algo Guide · Supertrend (7, ATR mult 3)',
    $desc3$Educational preset (Olivier Seban-style Supertrend). Scanner: Supertrend(7,3) trend flips 9:30–12:30 IST on the chart interval (guide uses 15m+5m dual TF — single TF here). Fallback momentum template if no flip. Guide: SL at ST line, trail on flips, avoid chop and tiny ATR.$desc3$,
    'BOTH',
    true,
    '09:30'::text,
    '12:30'::text,
    '15:15'::text,
    1.0::numeric,
    1.0::numeric,
    3.0::numeric,
    'momentum'::text,
    $ec3${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "supertrend_7_3", "groups": []}$ec3$,
    $ex3${"takeProfitPct": 3, "stopLossPct": 1, "clockExitTime": "15:15"}$ex3$,
    $pc3${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc3$,
    $rc3${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30}$rc3$,
    $cc3${"interval": "5m", "chartType": "candlestick"}$cc3$,
    ARRAY[1,2,3,4,5]::integer[]
  ),
  (
    'Algo Guide · VWAP Bounce',
    $desc4$Educational preset (Brian Shannon / Linda Raschke style). Scanner: session VWAP from typical price × volume, 1st/2nd touch heuristic with volume vs 10-bar avg (needs real volume on bars). Fallback mean_reversion if no match. SL ~0.5% from VWAP at entry per guide; partials at +1/+2 SD manual.$desc4$,
    'BOTH',
    true,
    '09:15'::text,
    '14:45'::text,
    '15:15'::text,
    1.0::numeric,
    0.5::numeric,
    1.5::numeric,
    'mean_reversion'::text,
    $ec4${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "vwap_bounce", "groups": []}$ec4$,
    $ex4${"takeProfitPct": 2, "stopLossPct": 0.5, "clockExitTime": "15:15"}$ex4$,
    $pc4${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc4$,
    $rc4${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30}$rc4$,
    $cc4${"interval": "5m", "chartType": "candlestick"}$cc4$,
    ARRAY[1,2,3,4,5]::integer[]
  ),
  (
    'Algo Guide · RSI Divergence Reversal',
    $desc5$Educational preset (Cardwell / Brown style divergence). Scanner: simplified pivot RSI divergence + MACD histogram direction on this symbol’s bars (not a multi-stock screener). Fallback mean_reversion on 1h if no divergence. Prefer swing/positional rules from PDF for holds.$desc5$,
    'BOTH',
    false,
    '09:15'::text,
    '15:15'::text,
    '15:15'::text,
    1.0::numeric,
    1.0::numeric,
    3.0::numeric,
    'mean_reversion'::text,
    $ec5${
      "mode": "visual",
      "groupLogic": "AND",
      "strategySubtype": "indicator_based",
      "rawExpression": "",
      "algoGuidePreset": "rsi_divergence",
      "groups": []
    }$ec5$,
    $ex5${"takeProfitPct": 3, "stopLossPct": 1, "trailingStop": false, "timeBasedExit": false}$ex5$,
    $pc5${"orderProduct": "CNC", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc5$,
    $rc5${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30}$rc5$,
    $cc5${"interval": "1h", "chartType": "candlestick"}$cc5$,
    ARRAY[1,2,3,4,5]::integer[]
  )
) AS v(name, description, trading_mode, is_intraday, start_time, end_time, squareoff_time, risk_per_trade_pct, stop_loss_pct, take_profit_pct, paper_strategy_type, entry_conditions, exit_conditions, position_config, risk_config, chart_config, execution_days)
WHERE lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_strategies s
    WHERE s.user_id = u.id AND s.name = v.name
  );
