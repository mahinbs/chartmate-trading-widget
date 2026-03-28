-- EMA guide: no signals on 9:15–9:29 IST opening candles when tz is Asia/Kolkata.
-- Chapter 6: min risk:reward (TP% / SL%) enforced when enforceGuideChapter6 is true.

UPDATE public.user_strategies
SET risk_config = COALESCE(risk_config, '{}'::jsonb) || '{"minRiskReward": 2}'::jsonb
WHERE name LIKE 'Algo Guide%'
   OR (entry_conditions IS NOT NULL AND (entry_conditions->>'algoGuidePreset') IS NOT NULL);

UPDATE public.user_strategies
SET entry_conditions = COALESCE(entry_conditions, '{}'::jsonb)
  || '{"algoGuideBlockFirstSessionMinutes": true}'::jsonb
WHERE name LIKE 'Algo Guide · EMA%';
