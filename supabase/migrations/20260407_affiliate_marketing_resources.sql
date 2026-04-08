-- 1. Marketing Resources table: Unique per affiliate
CREATE TABLE IF NOT EXISTS public.affiliate_marketing_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video', 'script')),
  title TEXT NOT NULL,
  content_url TEXT, -- for videos (YouTube/Vimeo/Direct)
  content_text TEXT, -- for scripts
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for marketing resources
ALTER TABLE public.affiliate_marketing_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all marketing resources" ON public.affiliate_marketing_resources;
CREATE POLICY "Admins can manage all marketing resources" ON public.affiliate_marketing_resources
  FOR ALL USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')))
  WITH CHECK (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')));

DROP POLICY IF EXISTS "Affiliate can read own marketing resources" ON public.affiliate_marketing_resources;
CREATE POLICY "Affiliate can read own marketing resources" ON public.affiliate_marketing_resources
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.affiliates a WHERE a.id = affiliate_marketing_resources.affiliate_id AND a.user_id = auth.uid())
  );

-- 2. Enhance visitor tracking with analytics columns
ALTER TABLE public.affiliate_visitors 
ADD COLUMN IF NOT EXISTS device_type TEXT,
ADD COLUMN IF NOT EXISTS browser TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS country TEXT;

-- Update trigger for affiliate_marketing_resources
DROP TRIGGER IF EXISTS update_affiliate_marketing_resources_updated_at ON public.affiliate_marketing_resources;
CREATE TRIGGER update_affiliate_marketing_resources_updated_at
  BEFORE UPDATE ON public.affiliate_marketing_resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
