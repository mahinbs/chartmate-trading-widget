-- Add payout tracking to user_payments for the affiliate management system

-- 1. Add payout_status column (default 'pending')
ALTER TABLE public.user_payments 
ADD COLUMN IF NOT EXISTS payout_status text DEFAULT 'pending' 
CHECK (payout_status IN ('pending', 'paid'));

-- 2. Add payout_at column
ALTER TABLE public.user_payments
ADD COLUMN IF NOT EXISTS payout_at timestamp with time zone;

-- Index for performance in dashboard queries
CREATE INDEX IF NOT EXISTS idx_user_payments_payout_status ON public.user_payments(payout_status);
