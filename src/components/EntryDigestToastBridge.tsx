import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

/**
 * Supabase Realtime: listens for INSERT on entry_point_alerts for this user.
 * When the digest Edge Function inserts a row, the toast fires immediately (no polling).
 * Schedule the digest job often (e.g. every 1 min) so the insert happens soon after alarm time.
 */
export function EntryDigestToastBridge() {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`entry_point_alerts_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entry_point_alerts",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as { title?: string; message?: string };
          toast({
            title: n.title ?? "Entry point digest",
            description: n.message ?? "",
          });
          try {
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification(n.title ?? "Entry points", { body: n.message ?? "" });
            }
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, toast]);

  return null;
}
