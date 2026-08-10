import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * One-click logout. Visiting /logout signs the user out of their Supabase
 * session and returns them to the login page — a shareable URL for signing
 * out without hunting for the menu button.
 */
export default function LogoutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await supabase.auth.signOut();
      } catch {
        /* already signed out / network — fall through to /auth anyway */
      }
      try {
        // Belt-and-suspenders: clear any persisted supabase session keys.
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* ignore */
      }
      if (!cancelled) navigate("/auth", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
