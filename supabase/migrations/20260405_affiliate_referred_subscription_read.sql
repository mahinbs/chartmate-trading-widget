-- Let affiliates (and WL admins who created the affiliate) read user_subscriptions only for users
-- they referred via user_signup_profiles.affiliate_id — for dashboard plan / Paid vs Free.

DROP POLICY IF EXISTS "Affiliate reads referred user subscriptions" ON public.user_subscriptions;
CREATE POLICY "Affiliate reads referred user subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_signup_profiles p
      INNER JOIN public.affiliates a ON a.id = p.affiliate_id
      WHERE p.user_id = user_subscriptions.user_id
        AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "WL admin reads referred user subscriptions" ON public.user_subscriptions;
CREATE POLICY "WL admin reads referred user subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_signup_profiles p
      INNER JOIN public.affiliates af ON af.id = p.affiliate_id
      WHERE p.user_id = user_subscriptions.user_id
        AND af.created_by = auth.uid()
    )
  );
