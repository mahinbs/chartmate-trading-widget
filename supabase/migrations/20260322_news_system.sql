-- SQL to create the news table and performance indexes
-- This also sets up the cron jobs for news ingestion

-- 1. Create the news table
CREATE TABLE IF NOT EXISTS public.news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT,
    source TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    image_url TEXT,
    region TEXT NOT NULL DEFAULT 'GLOBAL', -- Uppercase country code (IN, US, etc.) or 'GLOBAL'
    category TEXT DEFAULT 'Market News',
    impact_score INTEGER DEFAULT 0,
    is_trending BOOLEAN DEFAULT false,
    sentiment TEXT DEFAULT 'neutral',
    affected_symbols TEXT[], -- Array of stock symbols mentioned
    author TEXT,
    full_content TEXT, -- AI-extracted full article HTML
    published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- 3. Allow public read access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'news' AND policyname = 'Public Read Access'
    ) THEN
        CREATE POLICY "Public Read Access" ON public.news
            FOR SELECT USING (true);
    END IF;
END
$$;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_published_at ON public.news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_region_published ON public.news (region, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_trending ON public.news (is_trending) WHERE is_trending = true;
CREATE INDEX IF NOT EXISTS idx_news_url ON public.news (url);

-- 5. Setup pg_cron and pg_net for automatic news ingestion
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule fetch-news edge function every 15 minutes
-- We use net.http_post to trigger the Supabase Edge Function
SELECT cron.unschedule('ingest-market-news')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ingest-market-news'
);

SELECT cron.schedule(
  'ingest-market-news',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    -- Hardcoding URL since ALTER DATABASE permissions might be restricted
    url := 'https://ssesqiqtndhurfyntgbm.supabase.co/functions/v1/fetch-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- REPLACE 'YOUR_SERVICE_ROLE_KEY' with your actual key in the SQL Editor
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
