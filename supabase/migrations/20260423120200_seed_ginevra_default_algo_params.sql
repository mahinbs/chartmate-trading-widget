-- Optional: merge spec-default algoGuideParams into ginevra’s 6 NSE strategy-guide rows (7th SMC left unchanged).
-- Idempotent: existing keys in algoGuideParams are preserved; we only fill missing guide tuning.

DO $$
DECLARE
  u_id uuid;
BEGIN
  SELECT id INTO u_id FROM auth.users WHERE lower(email) = lower('ginevra89@tiffincrane.com') LIMIT 1;
  IF u_id IS NULL THEN
    RAISE NOTICE 'seed_ginevra_default_algo_params: user not found — skip';
    RETURN;
  END IF;

  UPDATE public.user_strategies
  SET entry_conditions = jsonb_set(
    COALESCE(entry_conditions, '{}'::jsonb),
    '{algoGuideParams}',
    coalesce(entry_conditions->'algoGuideParams', '{}'::jsonb)
      || '{
        "emaVixMin": 12, "emaVixMax": 25,
        "emaTradeStartMin": 570, "emaTradeEndMin": 840
      }'::jsonb,
    true
  )
  WHERE user_id = u_id AND name = 'Algo Guide · EMA 20/50 Trend Crossover';

  UPDATE public.user_strategies
  SET entry_conditions = jsonb_set(
    COALESCE(entry_conditions, '{}'::jsonb),
    '{algoGuideParams}',
    coalesce(entry_conditions->'algoGuideParams', '{}'::jsonb)
      || '{
        "orbVixMax": 22,
        "orbRequireFiiNetBuying": true,
        "orbBlockMacroEvents": true,
        "orbMacroBlockWindowMin": 30
      }'::jsonb,
    true
  )
  WHERE user_id = u_id AND name = 'Algo Guide · Opening Range Breakout (ORB)';

  UPDATE public.user_strategies
  SET entry_conditions = jsonb_set(
    COALESCE(entry_conditions, '{}'::jsonb),
    '{algoGuideParams}',
    coalesce(entry_conditions->'algoGuideParams', '{}'::jsonb)
      || '{
        "stVixMin": 12, "stVixMax": 25
      }'::jsonb,
    true
  )
  WHERE user_id = u_id AND name = 'Algo Guide · Supertrend (7, ATR mult 3)';

  UPDATE public.user_strategies
  SET entry_conditions = jsonb_set(
    COALESCE(entry_conditions, '{}'::jsonb),
    '{algoGuideParams}',
    coalesce(entry_conditions->'algoGuideParams', '{}'::jsonb)
      || '{
        "vwapVixMin": 11
      }'::jsonb,
    true
  )
  WHERE user_id = u_id AND name = 'Algo Guide · VWAP Bounce';

  UPDATE public.user_strategies
  SET entry_conditions = jsonb_set(
    COALESCE(entry_conditions, '{}'::jsonb),
    '{algoGuideParams}',
    coalesce(entry_conditions->'algoGuideParams', '{}'::jsonb)
      || '{
        "emaVixMin": 12, "emaVixMax": 25
      }'::jsonb,
    true
  )
  WHERE user_id = u_id AND name = 'Algo Guide · RSI Divergence Reversal';

  UPDATE public.user_strategies
  SET entry_conditions = jsonb_set(
    COALESCE(entry_conditions, '{}'::jsonb),
    '{algoGuideParams}',
    coalesce(entry_conditions->'algoGuideParams', '{}'::jsonb)
      || '{
        "lqVixMin": 12, "lqVixMax": 30
      }'::jsonb,
    true
  )
  WHERE user_id = u_id AND name = 'Algo Guide · Liquidity Sweep + BOS';
END $$;
