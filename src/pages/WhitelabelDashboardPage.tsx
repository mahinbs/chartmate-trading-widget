import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle, Users, Link2, CalendarDays, LogOut, ArrowRight, Copy, CheckCircle2 } from "lucide-react";
import { useWhitelabelTenant, isTenantExpired, daysRemaining } from "@/hooks/useWhitelabel";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface TenantUser {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  email?: string;
}

export default function WhitelabelDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useWhitelabelTenant(slug);
  const [membership, setMembership] = useState<{ role: string; status: string } | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [copied, setCopied] = useState(false);

  const expired = isTenantExpired(tenant);
  const days = tenant ? daysRemaining(tenant.ends_on) : 0;
  const color = tenant?.brand_primary_color ?? "#6366f1";
  const loginLink = `${window.location.origin}/wl/${slug}`;

  // Auth guard
  useEffect(() => {
    if (authLoading || tenantLoading) return;
    if (!user) { navigate(`/wl/${slug}`); return; }
  }, [authLoading, tenantLoading, user, slug, navigate]);

  // Load my membership for this tenant
  useEffect(() => {
    if (!user || !tenant) return;
    (supabase as any)
      .from("white_label_tenant_users")
      .select("role, status")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        setMembership(data ?? null);
        // If not a member, add as user
        if (!data) {
          (supabase as any).from("white_label_tenant_users").insert({
            tenant_id: tenant.id,
            user_id: user.id,
            role: tenant.owner_email === user.email ? "admin" : "user",
            status: "active",
          });
        }
      });
  }, [user, tenant]);

  // Load tenant users (only for whitelabel admin)
  useEffect(() => {
    if (!tenant || !membership || membership.role !== "admin") { setLoadingUsers(false); return; }
    const load = async () => {
      const { data } = await (supabase as any)
        .from("white_label_tenant_users")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false });
      // Fetch emails from auth (best effort via user metadata)
      setUsers(data ?? []);
      setLoadingUsers(false);
    };
    load();
  }, [tenant, membership]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate(`/wl/${slug}`);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(loginLink);
    setCopied(true);
    toast.success("Login link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading || tenantLoading) {
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
          <Button asChild variant="outline" className="mt-4"><Link to="/">Go Home</Link></Button>
        </div>
      </div>
    );
  }

  const isWLAdmin = membership?.role === "admin" || tenant.owner_email === user?.email;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border/50 sticky top-0 z-40 bg-background/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {tenant.brand_logo_url ? (
              <img src={tenant.brand_logo_url} alt="" className="h-8 object-contain" />
            ) : (
              <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: color }}>
                {tenant.brand_name.charAt(0)}
              </div>
            )}
            <div>
              <span className="font-bold text-foreground" style={{ color }}>{tenant.brand_name}</span>
              {isWLAdmin && <Badge className="ml-2 text-[10px]" variant="outline">Partner Admin</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Go to the main trading app */}
            <Button variant="outline" size="sm" asChild className="gap-1 text-xs">
              <Link to="/home">
                Trading App <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1 text-xs text-muted-foreground">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Expired / suspended banner */}
        {expired && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-400">
                {tenant.status === "suspended" ? "Account Suspended" : "Subscription Expired"}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {tenant.status === "suspended"
                  ? "Your white-label account has been suspended. Please contact Tradingsmart to resolve this."
                  : `Your subscription ended on ${tenant.ends_on}. Renew to restore access for all users.`}
              </p>
            </div>
          </div>
        )}

        {/* Expiry warning */}
        {!expired && days <= 30 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-600">
              Your subscription expires in <strong>{days} days</strong> on {tenant.ends_on}. Contact Tradingsmart to renew.
            </p>
          </div>
        )}

        {/* Subscription info cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Plan", value: tenant.subscription_plan === "2_year" ? "2 Years" : "1 Year", icon: CalendarDays },
            { label: "Starts", value: tenant.starts_on, icon: CalendarDays },
            { label: "Ends", value: tenant.ends_on, icon: CalendarDays },
            { label: "Days Left", value: expired ? "—" : `${Math.max(days, 0)} days`, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-border/50">
              <CardContent className="pt-4 flex items-start gap-3">
                <Icon className="h-4 w-4 mt-0.5" style={{ color }} />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold text-sm">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Login link — share with users */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" style={{ color }} />
              Your Branded Login Link
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Share this link with your users. They'll see your brand when they sign in.</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
              <code className="text-sm flex-1 break-all font-mono text-foreground/80">{loginLink}</code>
              <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={copyLink}>
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Note: You can also point your own domain/subdomain to this platform and share your domain instead.
            </p>
          </CardContent>
        </Card>

        {/* Users table — only for whitelabel admin */}
        {isWLAdmin && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color }} />
                Users ({users.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground">All users who have signed in via your partner link.</p>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <div className="flex items-center gap-2 py-6 text-muted-foreground justify-center text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
                </div>
              ) : users.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No users yet. Share your login link to get started.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30 hover:bg-transparent">
                      <TableHead className="text-muted-foreground text-xs">User ID</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Role</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="border-border/20 hover:bg-muted/20">
                        <TableCell className="font-mono text-xs text-muted-foreground">{u.user_id.slice(0, 16)}…</TableCell>
                        <TableCell>
                          <Badge variant={u.role === "admin" ? "default" : "outline"} className="text-[10px]">
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${u.status === "active" ? "border-green-500 text-green-600" : "border-red-500 text-red-500"}`}
                          >
                            {u.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick-access to the platform */}
        <Card className="border-border/50">
          <CardContent className="pt-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-semibold">Access the Trading Platform</p>
              <p className="text-sm text-muted-foreground">Use all AI predictions, analysis, and trading tools.</p>
            </div>
            <Button asChild style={{ background: color }} className="text-white gap-2">
              <Link to="/home">
                Open Platform <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
