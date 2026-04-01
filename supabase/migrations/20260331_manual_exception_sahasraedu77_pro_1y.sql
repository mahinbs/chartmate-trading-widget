-- Manual entitlement exception (DB-only, no UI hardcode):
-- sahasraedu77@gmail.com gets Pro plan access until 2027-03-30.
-- Idempotent: safe to re-run.

do $$
declare
  v_user_id uuid;
begin
  select id
    into v_user_id
  from auth.users
  where lower(email) = lower('sahasraedu77@gmail.com')
  limit 1;

  if v_user_id is null then
    raise notice 'Manual exception skipped: user sahasraedu77@gmail.com not found in auth.users';
    return;
  end if;

  insert into public.user_subscriptions (
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    plan_id,
    status,
    current_period_start,
    current_period_end
  )
  values (
    v_user_id,
    'manual_exception_sahasraedu77',
    'manual_exception_sahasraedu77',
    null,
    'proPlan',
    'active',
    now(),
    '2027-03-30 23:59:59+00'::timestamptz
  )
  on conflict (user_id) do update set
    plan_id = 'proPlan',
    status = 'active',
    current_period_start = coalesce(public.user_subscriptions.current_period_start, now()),
    current_period_end = '2027-03-30 23:59:59+00'::timestamptz,
    stripe_customer_id = coalesce(public.user_subscriptions.stripe_customer_id, 'manual_exception_sahasraedu77'),
    stripe_subscription_id = coalesce(public.user_subscriptions.stripe_subscription_id, 'manual_exception_sahasraedu77'),
    updated_at = now();

  -- Ensure this exception still follows normal Algo flow (show onboarding form first).
  update public.algo_onboarding
     set status = 'pending',
         updated_at = now()
   where user_id = v_user_id
     and status in ('provisioned', 'active');
end
$$;
