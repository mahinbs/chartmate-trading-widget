-- Strategy development requests (algo-only dashboard) + private PDF storage

CREATE TABLE IF NOT EXISTS public.strategy_development_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  strategy_name text NOT NULL,
  description text,
  market text,
  priority text NOT NULL DEFAULT 'normal',
  contact_email text,
  document_object_path text,
  status text NOT NULL DEFAULT 'submitted',
  eta date,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategy_dev_requests_user_created
  ON public.strategy_development_requests (user_id, created_at DESC);

ALTER TABLE public.strategy_development_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategy_dev_requests_select_own"
  ON public.strategy_development_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.strategy_development_requests IS
  'User-submitted custom strategy build requests from TradingSmart algo-only; admin fulfills via ChartMate.';

-- Private bucket for PDFs (path: {user_id}/{filename})
INSERT INTO storage.buckets (id, name, public)
VALUES ('strategy-dev-docs', 'strategy-dev-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "strategy_dev_docs_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'strategy-dev-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "strategy_dev_docs_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'strategy-dev-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "strategy_dev_docs_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'strategy-dev-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
