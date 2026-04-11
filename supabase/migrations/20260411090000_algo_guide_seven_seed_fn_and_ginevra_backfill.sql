-- All 7 Algo Trading Guide presets — single bulk-seed function any user can call.
--
-- Provides public.seed_algo_guide_presets_for_user(p_user_id uuid) that idempotently
-- inserts the canonical 7 strategies into public.user_strategies for the given user.
-- Each row routes to the matching detector in chartmate-strategy-engine via
-- entry_conditions.algoGuidePreset (engine.py:_VALID_PRESETS / _PRESET_INTERVALS).
--
-- Also:
--   * Backfills Chapter 6 risk gates on any existing Algo Guide row that is missing them.
--   * Removes the leftover "Smart Money · Liquidity Sweep + BOS" duplicate for ginevra
--     (canonical "Algo Guide · Liquidity Sweep + BOS" already exists for her account).
--   * Calls the seed function for ginevra so any newly canonical row is materialised.

CREATE OR REPLACE FUNCTION public.seed_algo_guide_presets_for_user(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id must not be null';
  END IF;

  -- Verify the user exists in auth.users (avoid orphan rows)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'auth user % does not exist', p_user_id;
  END IF;

  WITH new_rows AS (
    INSERT INTO public.user_strategies (
      user_id, name, description, trading_mode, is_intraday,
      start_time, end_time, squareoff_time,
      risk_per_trade_pct, stop_loss_pct, take_profit_pct,
      symbols, is_active, market_type, paper_strategy_type,
      entry_conditions, exit_conditions, position_config, risk_config, chart_config, execution_days
    )
    SELECT
      p_user_id,
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
      false,
      v.market_type,
      v.paper_strategy_type,
      v.entry_conditions::jsonb,
      v.exit_conditions::jsonb,
      v.position_config::jsonb,
      v.risk_config::jsonb,
      v.chart_config::jsonb,
      v.execution_days
    FROM (VALUES
      -- ── 01 · EMA 20/50 Trend Crossover (Strategy_Guide.pdf p.3) ─────────────
      (
        'Algo Guide · EMA 20/50 Trend Crossover',
        $d1$Educational preset (NSE guide). LONG bias: 20 EMA crosses above 50 EMA, RSI 14 between 50–75, price above 200 EMA, volume ≥1.5× 20-bar average. Prefer India session 9:30–14:00 IST. SL: below signal candle low; TP: ≥2.5R; trail to 20 EMA; square-off by 3:15. Past performance does not guarantee future results.$d1$,
        'LONG'::text,
        true,
        '09:30'::text,
        '14:00'::text,
        '15:15'::text,
        1.0::numeric,
        1.0::numeric,
        2.5::numeric,
        'equity'::text,
        'trend_following'::text,
        $ec1${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "ema_crossover", "algoGuideBlockFirstSessionMinutes": true, "groups": []}$ec1$,
        $ex1${"takeProfitPct": 2.5, "stopLossPct": 1, "trailingStop": false, "timeBasedExit": false, "clockExitTime": "15:15"}$ex1$,
        $pc1${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc1$,
        $rc1${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "minRiskReward": 2, "enforceGuideChapter6": true, "blockNewEntriesAfter": "14:45"}$rc1$,
        $cc1${"interval": "15m", "chartType": "candlestick"}$cc1$,
        ARRAY[1,2,3,4,5]::integer[]
      ),
      -- ── 02 · Opening Range Breakout (Strategy_Guide.pdf p.5) ────────────────
      (
        'Algo Guide · Opening Range Breakout (ORB)',
        $d2$Educational preset (Toby Crabel ORB). Scanner: opening range 9:15–9:30 IST, breakout after 9:30 on 5m chart. Width filter 0.2%–1% of mid. SL: range opposite side; target ~1.5–2× range; flat by 3:15.$d2$,
        'BOTH'::text,
        true,
        '09:30'::text,
        '15:15'::text,
        '15:15'::text,
        1.0::numeric,
        1.0::numeric,
        2.0::numeric,
        'equity'::text,
        'breakout_breakdown'::text,
        $ec2${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "orb", "groups": []}$ec2$,
        $ex2${"takeProfitPct": 2, "stopLossPct": 1, "clockExitTime": "15:15"}$ex2$,
        $pc2${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc2$,
        $rc2${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "minRiskReward": 2, "enforceGuideChapter6": true, "blockNewEntriesAfter": "14:45"}$rc2$,
        $cc2${"interval": "5m", "chartType": "candlestick"}$cc2$,
        ARRAY[1,2,3,4,5]::integer[]
      ),
      -- ── 03 · Supertrend ATR(7,3) dual-TF (Strategy_Guide.pdf p.7) ───────────
      (
        'Algo Guide · Supertrend (7, ATR mult 3)',
        $d3$Educational preset (Olivier Seban-style Supertrend). Scanner: Supertrend(7,3) trend flips 9:30–12:30 IST, dual-TF 15m+5m (engine fetches both internally). SL at ST line, trail on flips, ATR filter to skip chop.$d3$,
        'BOTH'::text,
        true,
        '09:30'::text,
        '12:30'::text,
        '15:15'::text,
        1.0::numeric,
        1.0::numeric,
        3.0::numeric,
        'equity'::text,
        'momentum'::text,
        $ec3${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "supertrend_7_3", "groups": []}$ec3$,
        $ex3${"takeProfitPct": 3, "stopLossPct": 1, "clockExitTime": "15:15"}$ex3$,
        $pc3${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc3$,
        $rc3${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "minRiskReward": 2, "enforceGuideChapter6": true, "blockNewEntriesAfter": "14:45"}$rc3$,
        $cc3${"interval": "5m", "chartType": "candlestick"}$cc3$,
        ARRAY[1,2,3,4,5]::integer[]
      ),
      -- ── 04 · VWAP Bounce (Strategy_Guide.pdf p.9) ──────────────────────────
      (
        'Algo Guide · VWAP Bounce',
        $d4$Educational preset (Brian Shannon / Linda Raschke style). Session VWAP from typical price × volume; only 1st/2nd test of the day; rejection candle + volume confirmation. SL ~0.5% from VWAP at entry; partials at +1/+2 SD; avoid last 30 minutes.$d4$,
        'BOTH'::text,
        true,
        '09:15'::text,
        '14:45'::text,
        '15:15'::text,
        1.0::numeric,
        0.5::numeric,
        1.5::numeric,
        'equity'::text,
        'mean_reversion'::text,
        $ec4${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "vwap_bounce", "groups": []}$ec4$,
        $ex4${"takeProfitPct": 2, "stopLossPct": 0.5, "clockExitTime": "15:15"}$ex4$,
        $pc4${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc4$,
        $rc4${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "minRiskReward": 2, "enforceGuideChapter6": true, "blockNewEntriesAfter": "14:45"}$rc4$,
        $cc4${"interval": "5m", "chartType": "candlestick"}$cc4$,
        ARRAY[1,2,3,4,5]::integer[]
      ),
      -- ── 05 · RSI Divergence Reversal (Strategy_Guide.pdf p.11) ─────────────
      (
        'Algo Guide · RSI Divergence Reversal',
        $d5$Educational preset (Cardwell / Brown style divergence). Pivot-based RSI divergence + MACD histogram confirmation on 1H/Daily bars. Bullish/bearish regular divergences and hidden bullish continuation. SL at signal pivot; TP at next opposing pivot or 2–3R.$d5$,
        'BOTH'::text,
        false,
        '09:15'::text,
        '15:15'::text,
        '15:15'::text,
        1.0::numeric,
        1.0::numeric,
        3.0::numeric,
        'equity'::text,
        'mean_reversion'::text,
        $ec5${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "rsi_divergence", "groups": []}$ec5$,
        $ex5${"takeProfitPct": 3, "stopLossPct": 1, "trailingStop": false, "timeBasedExit": false}$ex5$,
        $pc5${"orderProduct": "CNC", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc5$,
        $rc5${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "minRiskReward": 2, "enforceGuideChapter6": true, "blockNewEntriesAfter": "14:45"}$rc5$,
        $cc5${"interval": "1h", "chartType": "candlestick"}$cc5$,
        ARRAY[1,2,3,4,5]::integer[]
      ),
      -- ── 06 · Liquidity Sweep + Break of Structure (in-message spec) ────────
      (
        'Algo Guide · Liquidity Sweep + BOS',
        $d6$Smart-money style: mark liquidity (equal highs/lows, swing points), wait for a sweep beyond those levels, then a break of structure in the trade direction. Entry on BOS confirmation; SL beyond the sweep; TP toward the next opposing liquidity zone. Tunable via entry_conditions.algoGuideParams in the builder.$d6$,
        'BOTH'::text,
        true,
        '09:15'::text,
        '15:15'::text,
        '15:15'::text,
        1.0::numeric,
        1.0::numeric,
        2.0::numeric,
        'equity'::text,
        'breakout_breakdown'::text,
        $ec6${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "liquidity_sweep_bos", "groups": []}$ec6$,
        $ex6${"takeProfitPct": 2, "stopLossPct": 1, "clockExitTime": "15:15"}$ex6$,
        $pc6${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NSE"}$pc6$,
        $rc6${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "minRiskReward": 2, "enforceGuideChapter6": true, "blockNewEntriesAfter": "14:45"}$rc6$,
        $cc6${"interval": "5m", "chartType": "candlestick"}$cc6$,
        ARRAY[1,2,3,4,5]::integer[]
      ),
      -- ── 07 · SMC Multi-Timeframe Confluence (SMC Strategy.pdf) ─────────────
      (
        'Algo Guide · SMC Multi-Timeframe Confluence',
        $d7$Educational preset from SMC Strategy.pdf: 4H bias, 15m zones/FVG, 1m liquidity sweep + ChoCH + mitigation. Default session gate is London/NY UTC — algoGuideParams.smcDisableSessionGate=true allows NSE/paper outside those windows.$d7$,
        'BOTH'::text,
        true,
        '09:15'::text,
        '15:15'::text,
        '15:15'::text,
        1.0::numeric,
        1.0::numeric,
        2.0::numeric,
        'global_equity'::text,
        'momentum'::text,
        $ec7${"mode": "visual", "groupLogic": "AND", "strategySubtype": "indicator_based", "rawExpression": "", "algoGuidePreset": "smc_mtf_confluence", "algoGuideParams": {"smcDisableSessionGate": true}, "groups": []}$ec7$,
        $ex7${"takeProfitPct": 2, "stopLossPct": 1, "clockExitTime": "15:15"}$ex7$,
        $pc7${"orderProduct": "MIS", "orderType": "MARKET", "sizingMode": "fixed_qty", "quantity": 0, "exchange": "NYSE"}$pc7$,
        $rc7${"maxRiskPerTradePct": 1, "maxDailyLossPct": 2, "maxOpenPositions": 3, "capitalAllocationPct": 30, "allowedExchanges": ["LSE", "NYSE", "NASDAQ"], "sessionVenues": ["london", "new_york"]}$rc7$,
        $cc7${"interval": "5m", "chartType": "candlestick"}$cc7$,
        ARRAY[1,2,3,4,5]::integer[]
      )
    ) AS v(
      name, description, trading_mode, is_intraday, start_time, end_time, squareoff_time,
      risk_per_trade_pct, stop_loss_pct, take_profit_pct,
      market_type, paper_strategy_type,
      entry_conditions, exit_conditions, position_config, risk_config, chart_config, execution_days
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_strategies s
      WHERE s.user_id = p_user_id AND s.name = v.name
    )
    RETURNING 1
  )
  SELECT count(*)::integer INTO inserted_count FROM new_rows;

  RETURN inserted_count;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.seed_algo_guide_presets_for_user(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.seed_algo_guide_presets_for_user(uuid) IS
  'Idempotently seed the 7 canonical Algo Trading Guide preset strategies for a user. '
  'Each row inserts only if no strategy with the same canonical name exists for that user. '
  'Used by manage-strategy edge function (action: seed_guide_presets) and SQL backfills.';

-- ── Backfill: ensure every Algo Guide row carries the Chapter 6 risk gates ──
-- (RSI Divergence, Liquidity Sweep + BOS for any existing user — these were
--  inserted by older migrations that pre-dated the gate rollout.)
UPDATE public.user_strategies s
SET risk_config = COALESCE(s.risk_config, '{}'::jsonb)
  || jsonb_build_object(
       'enforceGuideChapter6', true,
       'blockNewEntriesAfter', '14:45',
       'minRiskReward', 2
     )
WHERE (
        s.name LIKE 'Algo Guide%'
        OR (s.entry_conditions->>'algoGuidePreset') IS NOT NULL
      )
  AND s.name <> 'Algo Guide · SMC Multi-Timeframe Confluence'
  AND (
       (s.risk_config->>'enforceGuideChapter6') IS DISTINCT FROM 'true'
    OR (s.risk_config->>'blockNewEntriesAfter') IS NULL
    OR (s.risk_config->>'minRiskReward') IS NULL
  );

-- ── Cleanup: drop ginevra's leftover "Smart Money · Liquidity Sweep + BOS" ──
-- The canonical "Algo Guide · Liquidity Sweep + BOS" already exists for her and
-- now carries the Chapter 6 gates after the backfill above.
DELETE FROM public.user_strategies s
USING auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND s.name = 'Smart Money · Liquidity Sweep + BOS';

-- ── Materialise any missing canonical row for ginevra by calling the seed fn ─
DO $backfill$
DECLARE
  u_id uuid;
  n integer;
BEGIN
  SELECT id INTO u_id FROM auth.users WHERE lower(email) = lower('ginevra89@tiffincrane.com');
  IF u_id IS NOT NULL THEN
    n := public.seed_algo_guide_presets_for_user(u_id);
    RAISE NOTICE 'seed_algo_guide_presets_for_user(ginevra)=% rows inserted', n;
  END IF;
END
$backfill$;
