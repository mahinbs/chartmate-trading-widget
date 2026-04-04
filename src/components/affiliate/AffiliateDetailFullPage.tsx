import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, UserPlus, FileText, DollarSign, Percent, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { describeReferredUserSubscription, planIdToDisplayName } from "@/lib/referredUserPlanDisplay";

export type AffiliateDetailSurface = "admin" | "wl";

type VisitorRow = { visitor_ip: string; visited_at: string };
type SignupRow = {
  user_id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  country: string | null;
  referral_code_at_signup: string | null;
  created_at: string;
  subscription?: { plan_id: string; status: string; current_period_end: string | null } | null;
};
type SubmissionRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  telegram_id?: string | null;
  referral_code?: string | null;
  created_at: string;
};
type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  commission_amount: number;
  status: string;
  created_at: string;
  plan_id?: string | null;
};

type AffiliateHeader = {
  id: string;
  code: string;
  name: string;
  email: string;
  commission_percent: number;
  is_active: boolean;
};

type Props = {
  affiliateId: string;
  onBack: () => void;
  backLabel?: string;
  surface: AffiliateDetailSurface;
};

export function AffiliateDetailFullPage({ affiliateId, onBack, backLabel = "Back", surface }: Props) {
  const [loading, setLoading] = useState(true);
  const [affiliate, setAffiliate] = useState<AffiliateHeader | null>(null);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [tab, setTab] = useState<"visitors" | "signups" | "forms" | "payments">("visitors");
  const pageSize = 15;
  const [vPage, setVPage] = useState(1);
  const [sPage, setSPage] = useState(1);
  const [fPage, setFPage] = useState(1);
  const [pPage, setPPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: aff, error: ae } = await (supabase as any)
        .from("affiliates")
        .select("id, code, name, email, commission_percent, is_active")
        .eq("id", affiliateId)
        .maybeSingle();
      if (ae) throw ae;
      if (!aff) {
        setAffiliate(null);
        toast.error("Affiliate not found or no access.");
        return;
      }
      setAffiliate(aff);

      const [{ data: v }, { data: su }, { data: sub }, { data: pay }] = await Promise.all([
        (supabase as any)
          .from("affiliate_visitors")
          .select("visitor_ip, visited_at")
          .eq("affiliate_id", affiliateId)
          .order("visited_at", { ascending: false }),
        (supabase as any)
          .from("user_signup_profiles")
          .select("user_id, email, full_name, phone, country, referral_code_at_signup, created_at")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("contact_submissions")
          .select("id, name, email, phone, telegram_id, referral_code, created_at")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("user_payments")
          .select("id, amount, currency, commission_amount, status, created_at, plan_id")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: false }),
      ]);

      const signupList = (su ?? []) as SignupRow[];
      const userIds = signupList.map((r) => r.user_id).filter(Boolean);
      let subByUser: Record<string, { plan_id: string; status: string; current_period_end: string | null }> = {};
      if (userIds.length) {
        const { data: subs } = await (supabase as any)
          .from("user_subscriptions")
          .select("user_id, plan_id, status, current_period_end")
          .in("user_id", userIds);
        (subs ?? []).forEach((row: any) => {
          subByUser[row.user_id] = {
            plan_id: row.plan_id,
            status: row.status,
            current_period_end: row.current_period_end ?? null,
          };
        });
      }

      setVisitors(v ?? []);
      setSignups(
        signupList.map((s) => ({
          ...s,
          subscription: subByUser[s.user_id] ?? null,
        })),
      );
      setSubmissions(sub ?? []);
      setPayments(pay ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load affiliate");
      setAffiliate(null);
    } finally {
      setLoading(false);
    }
  }, [affiliateId]);

  useEffect(() => {
    load();
  }, [load]);

  const linkUrl = affiliate ? `${window.location.origin}/?ref=${encodeURIComponent(affiliate.code)}` : "";
  const totalComm = payments.reduce((sum, p) => sum + Number(p.commission_amount ?? 0), 0);

  const shell =
    surface === "wl"
      ? "min-h-screen bg-black text-white"
      : "text-foreground";

  if (loading && !affiliate) {
    return (
      <div className={shell}>
        <div className="space-y-4 max-w-6xl mx-auto">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!affiliate) {
    return (
      <div className={shell}>
        <Button variant="outline" size="sm" onClick={onBack} className="mb-4 border-white/10">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {backLabel}
        </Button>
        <p className="text-muted-foreground">Affiliate not found.</p>
      </div>
    );
  }

  const cardClass =
    surface === "wl"
      ? "glass-panel border-white/10 bg-white/5"
      : "glass-panel border-white/10";

  return (
    <div className={shell}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className={surface === "wl" ? "border-white/10 text-zinc-300 hover:bg-white/10" : ""}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backLabel}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className={surface === "wl" ? "border-white/10" : ""}>
            Refresh
          </Button>
        </div>

        <div>
          <h1 className={`text-2xl font-bold ${surface === "wl" ? "text-white" : ""}`}>{affiliate.name}</h1>
          <p className={`text-sm ${surface === "wl" ? "text-zinc-500" : "text-muted-foreground"}`}>
            {affiliate.email} · {affiliate.commission_percent}% commission ·{" "}
            <Badge variant={affiliate.is_active ? "default" : "secondary"} className="text-xs">
              {affiliate.is_active ? "Active" : "Inactive"}
            </Badge>
          </p>
        </div>

        <Card className={cardClass}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-base flex items-center gap-2 ${surface === "wl" ? "text-white" : ""}`}>
              <Link2 className="h-4 w-4 text-cyan-400" />
              Affiliate link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className={`text-sm font-mono break-all ${surface === "wl" ? "text-cyan-300" : "text-primary"}`}>
              {linkUrl}
            </code>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Unique visitors", value: visitors.length, color: "text-blue-400", icon: Users },
            { label: "Sign-ups", value: signups.length, color: "text-sky-400", icon: UserPlus },
            { label: "Form submissions", value: submissions.length, color: "text-amber-400", icon: FileText },
            { label: "Payments", value: payments.length, color: "text-green-400", icon: DollarSign },
            { label: `Commission (${affiliate.commission_percent}%)`, value: `₹${totalComm.toFixed(2)}`, color: "text-purple-400", icon: Percent },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-lg p-3 border ${surface === "wl" ? "bg-white/5 border-white/10" : "bg-muted/30 border-border"}`}
            >
              <div className={`flex items-center gap-1.5 mb-1 ${s.color}`}>
                <s.icon className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase text-muted-foreground font-medium">{s.label}</span>
              </div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
          <TabsList
            className={
              surface === "wl"
                ? "bg-zinc-900/80 border border-white/10 flex-wrap h-auto gap-1 py-1 w-full justify-start"
                : "flex-wrap h-auto gap-1 py-1 w-full justify-start"
            }
          >
            <TabsTrigger value="visitors" className="text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Unique visitors ({visitors.length})
            </TabsTrigger>
            <TabsTrigger value="signups" className="text-xs gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Sign-ups ({signups.length})
            </TabsTrigger>
            <TabsTrigger value="forms" className="text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Forms ({submissions.length})
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Money earned ({payments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visitors">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                  Distinct IPs ({visitors.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {visitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No visitors yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>IP</TableHead>
                          <TableHead>First visited</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visitors.slice((vPage - 1) * pageSize, vPage * pageSize).map((row, i) => (
                          <TableRow key={`${row.visitor_ip}-${i}`}>
                            <TableCell className="font-mono text-xs">{row.visitor_ip}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(row.visited_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {visitors.length > pageSize && (
                      <Pager page={vPage} setPage={setVPage} total={visitors.length} pageSize={pageSize} />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signups">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                  Referred accounts ({signups.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {signups.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No sign-ups yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead>Ref code</TableHead>
                          <TableHead>Billing</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Signed up</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {signups.slice((sPage - 1) * pageSize, sPage * pageSize).map((s) => {
                          const d = describeReferredUserSubscription(s.subscription ?? null);
                          return (
                            <TableRow key={s.user_id}>
                              <TableCell className="text-sm">{s.full_name || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{s.email || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{s.phone || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{s.country || "—"}</TableCell>
                              <TableCell className="font-mono text-xs">{s.referral_code_at_signup || "—"}</TableCell>
                              <TableCell>
                                <Badge variant={d.billing === "Paid" ? "default" : "secondary"} className="text-xs">
                                  {d.billing}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs max-w-[200px]">{d.planLine}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(s.created_at).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {signups.length > pageSize && (
                      <Pager page={sPage} setPage={setSPage} total={signups.length} pageSize={pageSize} />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forms">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                  Form submissions ({submissions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {submissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">None yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Referral code</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissions.slice((fPage - 1) * pageSize, fPage * pageSize).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-sm">{s.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{s.phone}</TableCell>
                            <TableCell className="text-xs">{s.referral_code || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(s.created_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {submissions.length > pageSize && (
                      <Pager page={fPage} setPage={setFPage} total={submissions.length} pageSize={pageSize} />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                  Payments & commission ({payments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No payments yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Amount</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Commission</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.slice((pPage - 1) * pageSize, pPage * pageSize).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm">
                              {p.currency} {Number(p.amount).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-xs">{planIdToDisplayName(p.plan_id)}</TableCell>
                            <TableCell>
                              <Badge variant={p.status === "completed" ? "default" : "secondary"} className="text-xs">
                                {p.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-green-600 text-sm font-medium">
                              ₹{Number(p.commission_amount ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {payments.length > pageSize && (
                      <Pager page={pPage} setPage={setPPage} total={payments.length} pageSize={pageSize} />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Pager({
  page,
  setPage,
  total,
  pageSize,
}: {
  page: number;
  setPage: (n: number) => void;
  total: number;
  pageSize: number;
}) {
  const max = Math.ceil(total / pageSize);
  return (
    <div className="flex justify-end items-center gap-2 pt-4 text-xs text-muted-foreground">
      <span>
        Page {page} of {max}
      </span>
      <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>
        Prev
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={page * pageSize >= total}
        onClick={() => setPage((p) => (p * pageSize >= total ? p : p + 1))}
      >
        Next
      </Button>
    </div>
  );
}
