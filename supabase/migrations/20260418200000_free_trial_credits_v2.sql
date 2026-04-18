-- Free trial credits: atomic consume RPC, trial strategy seeds, trial_seed markers.

ALTER TABLE public.user_strategies
  ADD COLUMN IF NOT EXISTS trial_seed boolean NOT NULL DEFAULT false;

ALTER TABLE public.options_strategies
  ADD COLUMN IF NOT EXISTS trial_seed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_strategies.trial_seed IS 'True when row was auto-seeded for free trial (2 equity templates).';
COMMENT ON COLUMN public.options_strategies.trial_seed IS 'True when row was auto-seeded for free trial (2 options templates).';

-- ---------------------------------------------------------------------------
-- consume_trial_credit: deduct credits for trial users (IST calendar day).
-- Callable with user JWT (auth.uid() = p_user_id) or service_role (Edge).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_trial_credit(
  p_user_id uuid,
  p_cost integer,
  p_action text
)
RETURNS TABLE(ok boolean, credits_remaining integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.trial_access%ROWTYPE;
  v_day text;
  v_used numeric;
  v_limit int;
  v_new_used numeric;
BEGIN
  IF p_cost IS NULL OR p_cost < 1 THEN
    RETURN QUERY SELECT false, NULL::int, 'invalid_cost'::text;
    RETURN;
  END IF;

  IF NOT (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
  ) THEN
    RETURN QUERY SELECT false, NULL::int, 'forbidden'::text;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.trial_access
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::int, 'no_trial'::text;
    RETURN;
  END IF;

  IF v_row.status IS DISTINCT FROM 'active' OR v_row.end_at <= now() THEN
    RETURN QUERY SELECT false, NULL::int, 'trial_inactive'::text;
    RETURN;
  END IF;

  v_limit := GREATEST(COALESCE(v_row.daily_credit_limit, 0), 0);
  IF v_limit < 1 THEN
    RETURN QUERY SELECT false, 0, 'no_daily_limit'::text;
    RETURN;
  END IF;

  v_day := to_char((timezone('Asia/Kolkata', clock_timestamp()))::date, 'YYYY-MM-DD');
  v_used := COALESCE((v_row.used_credits_json ->> v_day)::numeric, 0);

  IF v_used + p_cost > v_limit THEN
    RETURN QUERY SELECT false, GREATEST((v_limit - v_used)::int, 0), 'insufficient_credits'::text;
    RETURN;
  END IF;

  v_new_used := v_used + p_cost;

  UPDATE public.trial_access
  SET
    used_credits_json = jsonb_set(
      COALESCE(used_credits_json, '{}'::jsonb),
      ARRAY[v_day],
      to_jsonb(v_new_used),
      true
    ),
    limits_metadata_json = COALESCE(limits_metadata_json, '{}'::jsonb)
      || jsonb_build_object(
        'last_credit_action_at', to_jsonb(now()),
        'last_credit_action', to_jsonb(COALESCE(p_action, ''))
      ),
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, (v_limit - v_new_used)::int, 'ok'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_trial_credit(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_trial_credit(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_trial_credit(uuid, integer, text) TO service_role;

COMMENT ON FUNCTION public.consume_trial_credit IS
  'Atomically consume trial credits for IST calendar day; returns ok + remaining.';

-- ---------------------------------------------------------------------------
-- seed_trial_strategies_for_user: 2 equity + 2 options templates (idempotent).
-- ---------------------------------------------------------------------------
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

  IF NOT EXISTS (
    SELECT 1 FROM public.options_strategies
    WHERE user_id = p_user_id AND trial_seed = true AND name = 'Trial: NIFTY Iron Condor'
  ) THEN
    INSERT INTO public.options_strategies (
      user_id, name, description,
      underlying, exchange, instrument_type, expiry_type,
      strike_selection, option_type, trade_direction, strategy_style, legs,
      entry_conditions, orb_config, exit_rules, risk_config,
      start_time, end_time, execution_days, strategy_state,
      is_paper_only, is_active, trial_seed
    )
    VALUES (
      p_user_id,
      'Trial: NIFTY Iron Condor',
      'Free trial options template — explore in paper mode.',
      'NIFTY', 'NFO', 'OPTIDX', 'weekly',
      'ATM', 'auto', 'neutral', 'iron_condor', '[]'::jsonb,
      jsonb_build_object('strategy_type', 'iron_condor', 'orb_breakout', false, 'min_vix', 13.0),
      '{"orb_duration_mins":15,"min_range_pct":0.2,"max_range_pct":1.0,"momentum_bars":3}'::jsonb,
      '{"sl_pct":30,"tp_pct":50,"trailing_enabled":true}'::jsonb,
      '{"max_premium_per_lot":500,"max_daily_loss_inr":2000,"lot_size":1}'::jsonb,
      '09:30', '15:15', ARRAY['Mon','Tue','Wed','Thu','Fri']::text[], '{}'::jsonb,
      true, false, true
    );
    n := n + 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.options_strategies
    WHERE user_id = p_user_id AND trial_seed = true AND name = 'Trial: NIFTY Bull Call Spread'
  ) THEN
    INSERT INTO public.options_strategies (
      user_id, name, description,
      underlying, exchange, instrument_type, expiry_type,
      strike_selection, option_type, trade_direction, strategy_style, legs,
      entry_conditions, orb_config, exit_rules, risk_config,
      start_time, end_time, execution_days, strategy_state,
      is_paper_only, is_active, trial_seed
    )
    VALUES (
      p_user_id,
      'Trial: NIFTY Bull Call Spread',
      'Free trial options template — explore in paper mode.',
      'NIFTY', 'NFO', 'OPTIDX', 'weekly',
      'ATM', 'CE', 'bullish', 'spread',
      '[]'::jsonb,
      jsonb_build_object('strategy_type', 'bull_call_spread', 'orb_breakout', false),
      '{"orb_duration_mins":15,"min_range_pct":0.2,"max_range_pct":1.0,"momentum_bars":3}'::jsonb,
      '{"sl_pct":40,"tp_pct":60,"trailing_enabled":false}'::jsonb,
      '{"max_premium_per_lot":500,"max_daily_loss_inr":2000,"lot_size":1}'::jsonb,
      '09:30', '15:15', ARRAY['Mon','Tue','Wed','Thu','Fri']::text[], '{}'::jsonb,
      true, false, true
    );
    n := n + 1;
  END IF;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_trial_strategies_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_trial_strategies_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_trial_strategies_for_user(uuid) TO service_role;

COMMENT ON FUNCTION public.seed_trial_strategies_for_user IS
  'Idempotent seed of 2 equity + 2 options trial strategies (trial_seed=true).';

-- Backfill active trials that had daily_credit_limit = 0 (legacy).
UPDATE public.trial_access
SET
  daily_credit_limit = 100,
  updated_at = now()
WHERE status = 'active'
  AND end_at > now()
  AND daily_credit_limit = 0;
