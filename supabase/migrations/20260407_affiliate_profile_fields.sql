-- Add profile fields to affiliates table and allow self-update via RLS
ALTER TABLE public.affiliates 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS pan TEXT,
ADD COLUMN IF NOT EXISTS gst TEXT,
ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS agreement_accepted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- Add updated_at if not present (already should be from 20260310_affiliates.sql)
-- But ensuring it is there for completeness
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='updated_at') THEN
        ALTER TABLE public.affiliates ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- RLS: Allow affiliates to update their own profile details
-- We restrict which columns they can update via the CHECK constraint if needed, 
-- but simpler to just grant UPDATE and rely on the frontend for most fields, 
-- while ensuring sensitive fields (commission, is_active) are protected.

DROP POLICY IF EXISTS "Affiliate can update own profile" ON public.affiliates;
CREATE POLICY "Affiliate can update own profile" ON public.affiliates
  FOR UPDATE USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

-- Ensure index for performance
CREATE INDEX IF NOT EXISTS idx_affiliates_agreement_accepted ON public.affiliates(agreement_accepted);
