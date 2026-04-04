-- Track failed renewal attempts (Stripe invoice.payment_failed). Cleared on invoice.paid.
-- Access is already gated by status: past_due / canceled are not "active" in the app.

alter table public.user_subscriptions
  add column if not exists payment_failed_at timestamptz;

comment on column public.user_subscriptions.payment_failed_at is
  'Last time Stripe reported invoice.payment_failed for this subscription; cleared when a payment succeeds (invoice.paid).';
