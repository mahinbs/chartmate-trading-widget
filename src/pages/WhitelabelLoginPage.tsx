import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, Lock } from "lucide-react";
import { useWhitelabelTenant, isTenantExpired, daysRemaining } from "@/hooks/useWhitelabel";
import { toast } from "sonner";

export default function WhitelabelLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant, loading: tenantLoading } = useWhitelabelTenant(slug);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  const expired = isTenantExpired(tenant);
  const days = tenant ? daysRemaining(tenant.ends_on) : 0;
  const color = tenant?.brand_primary_color ?? "#6366f1";

  // If already logged in, redirect to white-label dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && tenant) navigate(`/wl/${slug}/dashboard`);
    });
  }, [tenant, slug, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Enter email and password"); return; }
    if (expired) { toast.error("This white-label subscription has expired. Contact your provider."); return; }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Account created! You can now log in.");
        setMode("login");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Register as tenant user (upsert — no error if already exists)
        if (data.user && tenant) {
          await (supabase as any).from("white_label_tenant_users").upsert({
            tenant_id: tenant.id,
            user_id: data.user.id,
            role: tenant.owner_email === email ? "admin" : "user",
            status: "active",
          }, { onConflict: "tenant_id,user_id" });
        }

        toast.success(`Welcome to ${tenant?.brand_name ?? "the platform"}!`);
        navigate(`/wl/${slug}/dashboard`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-center px-4">
        <div className="space-y-3">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold">Partner portal not found</h1>
          <p className="text-muted-foreground text-sm">The link you used is invalid or no longer active.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4" style={{ "--brand": color } as any}>
      {/* Branded header */}
      <div className="mb-8 text-center">
        {tenant.brand_logo_url ? (
          <img src={tenant.brand_logo_url} alt={tenant.brand_name} className="h-14 mx-auto mb-4 object-contain" />
        ) : (
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-extrabold text-white" style={{ background: color }}>
            {tenant.brand_name.charAt(0)}
          </div>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color }}>{tenant.brand_name}</h1>
        {tenant.brand_tagline && <p className="text-muted-foreground text-sm mt-1">{tenant.brand_tagline}</p>}
      </div>

      {/* Expired / suspended banner */}
      {expired && (
        <div className="w-full max-w-sm mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-center">
          <AlertTriangle className="h-5 w-5 text-red-500 mx-auto mb-1" />
          <p className="text-sm text-red-400 font-medium">
            {tenant.status === "suspended" ? "This account has been suspended." : "This white-label subscription has expired."}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Please contact your service provider to renew access.</p>
        </div>
      )}

      {/* Expiry warning */}
      {!expired && days <= 30 && days > 0 && (
        <div className="w-full max-w-sm mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-center text-xs text-amber-600">
          ⚠ Subscription expires in <strong>{days} days</strong> ({tenant.ends_on})
        </div>
      )}

      {/* Login / signup form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-1" style={{ color }}>
            <Lock className="h-4 w-4" />
            {mode === "login" ? "Sign in to your account" : "Create your account"}
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="bg-background" disabled={expired} />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="bg-background" disabled={expired} />
          </div>
          <Button type="submit" className="w-full text-white" disabled={submitting || expired} style={{ background: color }}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {mode === "login" ? "Sign In" : "Create Account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              <>New here? <button type="button" className="underline" style={{ color }} onClick={() => setMode("signup")}>Create account</button></>
            ) : (
              <>Already have one? <button type="button" className="underline" style={{ color }} onClick={() => setMode("login")}>Sign in</button></>
            )}
          </p>
        </div>
        <p className="text-center text-[10px] text-muted-foreground">
          Powered by <span style={{ color }}>Tradingsmart</span> · White-label partner portal
        </p>
      </form>
    </div>
  );
}
