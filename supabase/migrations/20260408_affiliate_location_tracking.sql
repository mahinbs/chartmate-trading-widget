-- Migration: Add geolocation columns to affiliate tracking tables
-- Table: affiliate_visitors
ALTER TABLE public.affiliate_visitors 
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS country_name TEXT,
ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Table: user_signup_profiles
ALTER TABLE public.user_signup_profiles
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Update indexes for faster querying by location
CREATE INDEX IF NOT EXISTS idx_affiliate_visitors_country_code ON public.affiliate_visitors(country_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_visitors_region ON public.affiliate_visitors(region);
CREATE INDEX IF NOT EXISTS idx_user_signup_profiles_country_code ON public.user_signup_profiles(country_code);
CREATE INDEX IF NOT EXISTS idx_user_signup_profiles_region ON public.user_signup_profiles(region);

COMMENT ON COLUMN public.affiliate_visitors.region IS 'Captured region/state from visitor IP';
COMMENT ON COLUMN public.user_signup_profiles.region IS 'Captured region/state from user IP during signup or profile update';
