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

  return { subscription, loading, isPremium: hasActiveSubscription(subscription) };
}
