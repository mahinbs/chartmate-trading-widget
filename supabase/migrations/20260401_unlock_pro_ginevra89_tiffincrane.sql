-- Manual entitlement EXCEPTION: full Pro unlock for complimentary accounts @tiffincrane.com
-- Emails: ginevra89@tiffincrane.com, pbrginevra89@tiffincrane.com
-- Not from Stripe — fake customer/subscription/price ids. plan_id 'proPlan' → analysis + live OpenAlgo.
-- On each apply: active status, period = now .. now+10y, random-looking fake Stripe-style ids.

DO $$
DECLARE
  r record;
  fake_cust text;
  fake_sub text;
  fake_price text;
  period_end timestamptz;
BEGIN
  FOR r IN
    SELECT
      u.id AS uid,
      coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)) AS disp_name
    FROM auth.users u
    WHERE lower(u.email) IN (
      'ginevra89@tiffincrane.com',
    )
  LOOP
    fake_cust := 'cus_manual_exc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
    fake_sub := 'sub_manual_exc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
    fake_price := 'price_manual_exc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    period_end := now() + interval '10 years';

    INSERT INTO public.user_subscriptions (
      user_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      updated_at
    )
    VALUES (
      r.uid,
      fake_cust,
      fake_sub,
      fake_price,
      'proPlan',
      'active',
      now(),
      period_end,
      false,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      stripe_customer_id     = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id        = excluded.stripe_price_id,
      plan_id                = excluded.plan_id,
      status                 = excluded.status,
      current_period_start   = excluded.current_period_start,
      current_period_end     = excluded.current_period_end,
      cancel_at_period_end   = false,
      canceled_at            = null,
      updated_at             = now();

    UPDATE public.algo_onboarding
    SET
      status         = 'active',
      plan_id        = 'proPlan',
      provisioned_at = coalesce(provisioned_at, now()),
      updated_at     = now()
    WHERE user_id = r.uid;

    IF NOT EXISTS (SELECT 1 FROM public.algo_onboarding WHERE user_id = r.uid) THEN
      INSERT INTO public.algo_onboarding (
        user_id,
        full_name,
        broker,
        plan_id,
        status,
        provisioned_at
      )
      VALUES (
        r.uid,
        coalesce(nullif(trim(r.disp_name), ''), 'User'),
        'zerodha',
        'proPlan',
        'active',
        now()
      );
    END IF;
  END LOOP;
END $$;
