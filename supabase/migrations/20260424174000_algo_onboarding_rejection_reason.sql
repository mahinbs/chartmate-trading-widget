-- Allow super-admin rejection with explicit reason and user re-apply flow.

ALTER TABLE public.algo_onboarding
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

COMMENT ON COLUMN public.algo_onboarding.rejection_reason IS
  'Super-admin rejection reason shown to the user for re-submission.';
COMMENT ON COLUMN public.algo_onboarding.rejected_at IS
  'Timestamp when onboarding was rejected by super-admin.';

ALTER TABLE public.algo_onboarding
  DROP CONSTRAINT IF EXISTS algo_onboarding_status_check;

ALTER TABLE public.algo_onboarding
  ADD CONSTRAINT algo_onboarding_status_check
  CHECK (status IN ('pending', 'provisioned', 'active', 'cancelled', 'rejected'));
