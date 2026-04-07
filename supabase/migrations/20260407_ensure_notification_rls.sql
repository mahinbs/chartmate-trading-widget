-- 1. Ensure affiliate_notifications table exists (case where it was manually created)
CREATE TABLE IF NOT EXISTS public.affiliate_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('referral', 'conversion', 'payout', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster fetching
CREATE INDEX IF NOT EXISTS idx_affiliate_notifications_user_id ON public.affiliate_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_notifications_created_at ON public.affiliate_notifications(created_at DESC);

-- 2. Enable RLS
ALTER TABLE public.affiliate_notifications ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Admin can manage (ALL) notifications for manual admin-to-affiliate messaging
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.affiliate_notifications;
CREATE POLICY "Admins can manage all notifications" ON public.affiliate_notifications
  FOR ALL USING (
    auth.role() = 'service_role' OR public.is_app_admin()
  )
  WITH CHECK (
    auth.role() = 'service_role' OR public.is_app_admin()
  );

-- 4. Policy: Users can read their own notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON public.affiliate_notifications;
CREATE POLICY "Users can read own notifications" ON public.affiliate_notifications
  FOR SELECT USING (
    auth.uid() = user_id
  );

-- 5. Policy: Users can update their own (for mark as read)
DROP POLICY IF EXISTS "Users can update own notifications" ON public.affiliate_notifications;
CREATE POLICY "Users can update own notifications" ON public.affiliate_notifications
  FOR UPDATE USING (
    auth.uid() = user_id
  )
  WITH CHECK (
    auth.uid() = user_id
  );

-- 6. Policy: Users can delete their own (for clear all)
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.affiliate_notifications;
CREATE POLICY "Users can delete own notifications" ON public.affiliate_notifications
  FOR DELETE USING (
    auth.uid() = user_id
  );
