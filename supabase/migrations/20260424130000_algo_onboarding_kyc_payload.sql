-- KYC + markets from 6-step post-payment algo onboarding
ALTER TABLE public.algo_onboarding
  ADD COLUMN IF NOT EXISTS kyc_payload jsonb,
  ADD COLUMN IF NOT EXISTS markets text[] DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.algo_onboarding.kyc_payload IS
  'ID type, numbers, address, contact email, consent flags from the onboarding wizard.';
COMMENT ON COLUMN public.algo_onboarding.markets IS
  'User-selected market segments (Equity, Options, etc.).';
