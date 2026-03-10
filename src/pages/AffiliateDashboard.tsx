import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Link2, Users, FileText, DollarSign, Percent, Copy, Check, LogOut } from "lucide-react";
import { toast } from "sonner";

interface AffiliateStats {
  id: string;
  code: string;
  name: string;
  email: string;
  commission_percent: number;
  is_active: boolean;
  unique_visitors: number;
  form_submissions: ContactRow[];
  payments: PaymentRow[];
  total_commission_earned: number;
}

interface ContactRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  telegram_id?: string | null;
  description?: string | null;
  referral_code?: string | null;
  created_at: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  commission_amount: number;
  status: string;
  created_at: string;
}

export default function AffiliateDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"forms" | "payments">("forms");
  const [formsPage, setFormsPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const pageSize = 10;
  const [selectedForm, setSelectedForm] = useState<ContactRow | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: aff, error: affErr } = await (supabase as any)
        .from("affiliates")
        .select("id, code, name, email, commission_percent, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (affErr) throw affErr;
      if (!aff) throw new Error("No affiliate record found for this account.");

      const { data: visitors } = await (supabase as any)
        .from("affiliate_visitors")
        .select("visitor_ip")
        .eq("affiliate_id", aff.id);

      const { data: submissions } = await (supabase as any)
        .from("contact_submissions")
        .select("id, name, email, phone, telegram_id, description, referral_code, created_at")
        .eq("affiliate_id", aff.id)
        .order("created_at", { ascending: false });

      const { data: payments } = await (supabase as any)
        .from("user_payments")
        .select("id, amount, currency, commission_amount, status, created_at")
        .eq("affiliate_id", aff.id)
        .order("created_at", { ascending: false });

      const totalCommission = (payments ?? []).reduce(
        (sum: number, p: PaymentRow) => sum + Number(p.commission_amount ?? 0),
        0
      );

      setStats({
        ...aff,
        unique_visitors: (visitors ?? []).length,
        form_submissions: submissions ?? [],
        payments: payments ?? [],
        total_commission_earned: totalCommission,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load your affiliate data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const affiliateLink = stats ? `${window.location.origin}/?ref=${encodeURIComponent(stats.code)}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(affiliateLink).then(() => {
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Affiliate record not found. Contact admin.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">Affiliate Dashboard</h1>
            <p className="text-xs text-muted-foreground">Welcome, {stats.name}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-white/10 hover:bg-white/5">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-white hover:bg-white/5">
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Sign out
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">

        {/* Your affiliate link */}
        <Card className="glass-panel border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-cyan-400" />
              Your affiliate link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              <code className="flex-1 text-sm text-cyan-300 bg-white/5 px-4 py-3 rounded-lg font-mono break-all">
                {affiliateLink}
              </code>
              <Button
                onClick={copyLink}
                className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
              >
                {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                {copied ? "Copied!" : "Copy link"}
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Share this link on your channels. When someone opens it, visits your link, fills the form or pays — you earn your commission.
            </p>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-1">
                <Users className="h-5 w-5 text-blue-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Unique visitors</span>
              </div>
              <p className="text-3xl font-bold text-white">{stats.unique_visitors}</p>
              <p className="text-xs text-zinc-500 mt-1">Distinct IPs via your link</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-1">
                <FileText className="h-5 w-5 text-amber-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Forms filled</span>
              </div>
              <p className="text-3xl font-bold text-white">{stats.form_submissions.length}</p>
              <p className="text-xs text-zinc-500 mt-1">Contact form submissions</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-1">
                <DollarSign className="h-5 w-5 text-green-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Payments</span>
              </div>
              <p className="text-3xl font-bold text-white">{stats.payments.length}</p>
              <p className="text-xs text-zinc-500 mt-1">Users who paid via your link</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-1">
                <Percent className="h-5 w-5 text-purple-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Commission earned</span>
              </div>
              <p className="text-3xl font-bold text-green-400">
                ₹{stats.total_commission_earned.toFixed(2)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">at {stats.commission_percent}% per payment</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "forms" | "payments")} className="space-y-4">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="forms" className="text-xs flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-amber-400" />
              Forms filled
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-green-400" />
              Money earned
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="space-y-4">
            <Card className="glass-panel border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-400" />
                  People who filled the form via your link ({stats.form_submissions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {stats.form_submissions.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-6 text-center">
                    No form submissions yet. Share your link to get started!
                  </p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-muted-foreground">Name</TableHead>
                          <TableHead className="text-muted-foreground">Email</TableHead>
                          <TableHead className="text-muted-foreground">Phone</TableHead>
                          <TableHead className="text-muted-foreground">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.form_submissions
                          .slice((formsPage - 1) * pageSize, formsPage * pageSize)
                          .map((s) => (
                            <TableRow
                              key={s.id}
                              className="border-white/5 hover:bg-white/5 cursor-pointer"
                              onClick={() => setSelectedForm(s)}
                            >
                              <TableCell className="text-zinc-300">{s.name}</TableCell>
                              <TableCell className="text-zinc-400 text-sm">{s.email}</TableCell>
                              <TableCell className="text-zinc-400 text-sm">{s.phone}</TableCell>
                              <TableCell className="text-zinc-500 text-xs">
                                {new Date(s.created_at).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                    {stats.form_submissions.length > pageSize && (
                      <div className="flex justify-end items-center gap-3 pt-4 text-xs text-muted-foreground">
                        <span>
                          Page {formsPage} of {Math.ceil(stats.form_submissions.length / pageSize)}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={formsPage === 1}
                            onClick={() => setFormsPage((p) => Math.max(1, p - 1))}
                            className="h-7 px-3 border-white/10"
                          >
                            Prev
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={formsPage * pageSize >= stats.form_submissions.length}
                            onClick={() =>
                              setFormsPage((p) =>
                                p * pageSize >= stats.form_submissions.length ? p : p + 1,
                              )
                            }
                            className="h-7 px-3 border-white/10"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card className="glass-panel border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  Payments & your commission ({stats.payments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {stats.payments.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-6 text-center">
                    No payments via your link yet.
                  </p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-muted-foreground">Amount</TableHead>
                          <TableHead className="text-muted-foreground">Status</TableHead>
                          <TableHead className="text-muted-foreground">Your commission</TableHead>
                          <TableHead className="text-muted-foreground">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.payments
                          .slice((paymentsPage - 1) * pageSize, paymentsPage * pageSize)
                          .map((p) => (
                            <TableRow key={p.id} className="border-white/5 hover:bg-white/5">
                              <TableCell className="text-zinc-300">
                                {p.currency} {Number(p.amount).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={p.status === "completed" ? "default" : "secondary"}
                                  className="border-white/10 text-xs"
                                >
                                  {p.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-green-400 font-medium">
                                ₹{Number(p.commission_amount ?? 0).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-zinc-500 text-xs">
                                {new Date(p.created_at).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                    {stats.payments.length > pageSize && (
                      <div className="flex justify-end items-center gap-3 pt-4 text-xs text-muted-foreground">
                        <span>
                          Page {paymentsPage} of {Math.ceil(stats.payments.length / pageSize)}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={paymentsPage === 1}
                            onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                            className="h-7 px-3 border-white/10"
                          >
                            Prev
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={paymentsPage * pageSize >= stats.payments.length}
                            onClick={() =>
                              setPaymentsPage((p) =>
                                p * pageSize >= stats.payments.length ? p : p + 1,
                              )
                            }
                            className="h-7 px-3 border-white/10"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedForm} onOpenChange={(o) => !o && setSelectedForm(null)}>
          <DialogContent className="max-w-lg bg-zinc-950 border border-zinc-800 text-white">
            {selectedForm && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Form details</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm mt-2">
                  <div>
                    <span className="text-zinc-500">Name</span>
                    <p className="text-zinc-100">{selectedForm.name}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Email</span>
                    <p className="text-zinc-100 break-all">{selectedForm.email}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Phone</span>
                    <p className="text-zinc-100">{selectedForm.phone}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Telegram ID</span>
                    <p className="text-zinc-100">{selectedForm.telegram_id || "—"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Message / Description</span>
                    <p className="text-zinc-100 whitespace-pre-wrap">
                      {selectedForm.description || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Referral code (typed by user)</span>
                    <p className="text-zinc-100">
                      {selectedForm.referral_code || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Submitted at</span>
                    <p className="text-zinc-100">
                      {new Date(selectedForm.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
