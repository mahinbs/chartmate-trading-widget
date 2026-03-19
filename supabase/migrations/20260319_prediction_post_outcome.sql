-- Persist post-window outcome (analyze-post-prediction) so users can reopen full analysis without localStorage only.
ALTER TABLE public.predictions
ADD COLUMN IF NOT EXISTS post_outcome_analysis jsonb DEFAULT NULL;

COMMENT ON COLUMN public.predictions.post_outcome_analysis IS 'Outcome payload from analyze-post-prediction: evaluation, ai, marketData, dataSource, updated_at';
