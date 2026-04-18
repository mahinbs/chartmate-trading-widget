-- Trial seed: equity templates only (options paper needs broker chain; free trial is equity-first).

DELETE FROM public.options_strategies WHERE trial_seed = true;

CREATE OR REPLACE FUNCTION public.seed_trial_strategies_for_user(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
  ec_orb jsonb := '{"mode":"visual","groupLogic":"AND","strategySubtype":"indicator_based","rawExpression":"","algoGuidePreset":"orb","groups":[]}'::jsonb;
  ec_ema jsonb := '{"mode":"visual","groupLogic":"AND","strategySubtype":"indicator_based","rawExpression":"","algoGuidePreset":"ema_crossover","algoGuideBlockFirstSessionMinutes":true,"groups":[]}'::jsonb;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_strategies
    WHERE user_id = p_user_id AND trial_seed = true AND name = 'Trial: Opening Range Breakout'
  ) THEN
    INSERT INTO public.user_strategies (
      user_id, name, description, trading_mode, is_intraday,
      start_time, end_time, squareoff_time,
      risk_per_trade_pct, stop_loss_pct, take_profit_pct,
      symbols, market_type, entry_conditions, exit_conditions,
      position_config, risk_config, chart_config, execution_days,
      paper_strategy_type, trial_seed, is_active
    )
    VALUES (
      p_user_id,
      'Trial: Opening Range Breakout',
      'Free trial template — backtest, AI analysis, and paper trade without broker setup.',
      'LONG', true,
      '09:30', '15:15', '15:15',
      1.0, 2.0, 4.0,
      '[{"symbol":"RELIANCE","exchange":"NSE","quantity":1,"product_type":"MIS"}]'::jsonb,
      'stocks', ec_orb, '{}'::jsonb,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, ARRAY[1,2,3,4,5]::integer[],
      'orb', true, false
    );
    n := n + 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_strategies
    WHERE user_id = p_user_id AND trial_seed = true AND name = 'Trial: EMA Crossover'
  ) THEN
    INSERT INTO public.user_strategies (
      user_id, name, description, trading_mode, is_intraday,
      start_time, end_time, squareoff_time,
      risk_per_trade_pct, stop_loss_pct, take_profit_pct,
      symbols, market_type, entry_conditions, exit_conditions,
      position_config, risk_config, chart_config, execution_days,
      paper_strategy_type, trial_seed, is_active
    )
    VALUES (
      p_user_id,
      'Trial: EMA Crossover',
      'Free trial template — backtest, AI analysis, and paper trade without broker setup.',
      'LONG', true,
      '09:30', '15:15', '15:15',
      1.0, 2.0, 4.0,
      '[{"symbol":"TCS","exchange":"NSE","quantity":1,"product_type":"MIS"}]'::jsonb,
      'stocks', ec_ema, '{}'::jsonb,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, ARRAY[1,2,3,4,5]::integer[],
      'trend_following', true, false
    );
    n := n + 1;
  END IF;

  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.seed_trial_strategies_for_user IS
  'Idempotent seed of 2 equity trial strategies only (trial_seed=true).';
