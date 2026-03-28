-- Turn on server-enforceable guide gates (max open positions + late intraday block) for algo-guide-style rows.
-- fire-strategy-signal + pending conditional execution read enforceGuideChapter6 / blockNewEntriesAfter via algoGuideRiskGates.

UPDATE public.user_strategies
SET risk_config = COALESCE(risk_config, '{}'::jsonb)
  || jsonb_build_object(
    'enforceGuideChapter6', true,
    'blockNewEntriesAfter', '14:45'
  )
WHERE (
  name LIKE 'Algo Guide%'
  OR (entry_conditions IS NOT NULL AND (entry_conditions->>'algoGuidePreset') IS NOT NULL)
);
