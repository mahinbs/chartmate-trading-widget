-- Enhance affiliate visitor tracking with UTM parameters and referrer
ALTER TABLE public.affiliate_visitors 
ADD COLUMN IF NOT EXISTS utm_source TEXT,
ADD COLUMN IF NOT EXISTS utm_medium TEXT,
ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS utm_term TEXT,
ADD COLUMN IF NOT EXISTS utm_content TEXT,
ADD COLUMN IF NOT EXISTS referrer TEXT;

-- Create indexes for faster campaign performance analysis
CREATE INDEX IF NOT EXISTS idx_affiliate_visitors_utm_source ON public.affiliate_visitors(utm_source);
CREATE INDEX IF NOT EXISTS idx_affiliate_visitors_utm_campaign ON public.affiliate_visitors(utm_campaign);
