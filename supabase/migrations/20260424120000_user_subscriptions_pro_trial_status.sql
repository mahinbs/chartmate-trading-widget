-- Allow 14-day Pro DB trial (no Stripe subscription id) stored in user_subscriptions.
ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;

ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'pro_trial'));
