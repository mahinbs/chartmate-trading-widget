import { useEffect, useState } from "react";
import { getSubscription, hasActiveSubscription, type UserSubscription } from "@/services/stripeService";

export function useSubscription() {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSubscription().then((s) => {
      setSubscription(s);
      setLoading(false);
    });
  }, []);

  const isPremium = hasActiveSubscription(subscription);
  const nowMs = Date.now();
  const periodEndMs = subscription?.current_period_end ? new Date(subscription.current_period_end).getTime() : null;
  const daysUntilExpiry = periodEndMs != null ? Math.ceil((periodEndMs - nowMs) / (24 * 60 * 60 * 1000)) : null;
  const isExpiringSoon = isPremium && daysUntilExpiry != null && daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
  const isAutoRenewDisabled = Boolean(subscription?.cancel_at_period_end);
  const isInGracePeriod = Boolean(periodEndMs != null && periodEndMs < nowMs && (periodEndMs + 24 * 60 * 60 * 1000) > nowMs);

  return {
    subscription,
    loading,
    isPremium,
    isExpiringSoon,
    daysUntilExpiry,
    isAutoRenewDisabled,
    isInGracePeriod,
  };
}
