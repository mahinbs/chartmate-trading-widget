-- Manual entitlement exception (testing only, no payment):
-- tusharjain295@gmail.com gets complimentary Professional plan access for 3 months.
-- Idempotent: safe to re-run.

do $$
declare
  v_user_id uuid;
  v_fake_cust text;
  v_fake_sub text;
  v_fake_price text;
begin
  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = lower('tusharjain295@gmail.com')
  limit 1;

  if v_user_id is null then
    raise notice 'Manual exception skipped: user tusharjain295@gmail.com not found in auth.users';
    return;
  end if;

  v_fake_cust := 'cus_manual_exc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
  v_fake_sub := 'sub_manual_exc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
  v_fake_price := 'price_manual_exc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  insert into public.user_subscriptions (
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    updated_at
  )
  values (
    v_user_id,
    v_fake_cust,
    v_fake_sub,
    v_fake_price,
    'professionalPlan',
    'active',
    now(),
    now() + interval '3 months',
    false,
    null,
    now()
  )
  on conflict (user_id) do update set
    stripe_customer_id     = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id        = excluded.stripe_price_id,
    plan_id                = 'professionalPlan',
    status                 = 'active',
    current_period_start   = coalesce(public.user_subscriptions.current_period_start, now()),
    current_period_end     = now() + interval '3 months',
    cancel_at_period_end   = false,
    canceled_at            = null,
    updated_at             = now();

  -- Force first-time onboarding UX:
  -- remove any existing onboarding row so /algo-setup renders the full form.
  delete from public.algo_onboarding where user_id = v_user_id;
end
$$;
