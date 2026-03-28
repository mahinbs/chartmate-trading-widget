-- Patch algo-guide seeded strategies for ginevra89@tiffincrane.com after 20260328 seed (idempotent).
-- Merges entry_conditions JSON so existing rows get algoGuidePreset + EMA volume rule without re-insert.

UPDATE public.user_strategies s
SET entry_conditions =
  s.entry_conditions
  || jsonb_build_object(
    'rawExpression',
    'VOLUME >= 1.5 * VOL_SMA(20)'
  )
FROM auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND s.name = 'Algo Guide · EMA 20/50 Trend Crossover';

UPDATE public.user_strategies s
SET entry_conditions = s.entry_conditions || '{"algoGuidePreset":"orb"}'::jsonb
FROM auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND s.name = 'Algo Guide · Opening Range Breakout (ORB)';

UPDATE public.user_strategies s
SET entry_conditions = s.entry_conditions || '{"algoGuidePreset":"supertrend_7_3"}'::jsonb
FROM auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND s.name = 'Algo Guide · Supertrend (7, ATR mult 3)';

UPDATE public.user_strategies s
SET entry_conditions = s.entry_conditions || '{"algoGuidePreset":"vwap_bounce"}'::jsonb
FROM auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND s.name = 'Algo Guide · VWAP Bounce';

UPDATE public.user_strategies s
SET entry_conditions =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        s.entry_conditions,
        '{mode}',
        '"visual"'::jsonb
      ),
      '{groupLogic}',
      '"AND"'::jsonb
    ),
    '{rawExpression}',
    '""'::jsonb
  ) || '{"algoGuidePreset":"rsi_divergence"}'::jsonb
FROM auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = lower('ginevra89@tiffincrane.com')
  AND s.name = 'Algo Guide · RSI Divergence Reversal';
