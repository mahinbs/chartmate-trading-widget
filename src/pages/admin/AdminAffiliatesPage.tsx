import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, PlusCircle, Pencil, Link2, Copy, Check, Trash2, Ban, RotateCcw, Eye, Users, FileText, DollarSign, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AffiliateRow {
  id: string;
  code: string;
  name: string;
  email: string;
  commission_percent: number;
  is_active: boolean;
  created_at: string;
  unique_visitors: number;
  form_submissions: number;
  total_commission: number;
  payments_count: number;
}

interface AffiliateDetail {
  affiliate: AffiliateRow;
  visitors: { visitor_ip: string; visited_at: string }[];
  submissions: { id: string; name: string; email: string; phone: string; created_at: string }[];
  payments: { id: string; amount: number; currency: string; commission_amount: number; status: string; created_at: string }[];
}

const defaultForm = { code: "", name: "", email: "", commission_percent: 10, is_active: true };

export default function AdminAffiliatesPage() {
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ email: string; temp_password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [detailAffiliate, setDetailAffiliate] = useState<AffiliateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: affiliates, error: e1 } = await (supabase as any)
        .from("affiliates")
        .select("id, code, name, email, commission_percent, is_active, created_at")
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      const list: AffiliateRow[] = (affiliates ?? []).map((a: any) => ({
        ...a,
        unique_visitors: 0,
        form_submissions: 0,
        total_commission: 0,
        payments_count: 0,
      }));

      const ids = list.map((a) => a.id);
      if (ids.length === 0) {
        setRows(list);
        setLoading(false);
        return;
      }

      const { data: visitors } = await (supabase as any)
        .from("affiliate_visitors")
        .select("affiliate_id");
      const visitorCount: Record<string, number> = {};
      (visitors ?? []).forEach((v: any) => {
        visitorCount[v.affiliate_id] = (visitorCount[v.affiliate_id] ?? 0) + 1;
      });

      const { data: submissions } = await (supabase as any)
        .from("contact_submissions")
        .select("affiliate_id")
        .in("affiliate_id", ids);
      const submissionCount: Record<string, number> = {};
      (submissions ?? []).forEach((s: any) => {
        if (s.affiliate_id) submissionCount[s.affiliate_id] = (submissionCount[s.affiliate_id] ?? 0) + 1;
      });

      const { data: payments } = await (supabase as any)
        .from("user_payments")
        .select("affiliate_id, commission_amount")
        .in("affiliate_id", ids);
      const commissionSum: Record<string, number> = {};
      const paymentCount: Record<string, number> = {};
      (payments ?? []).forEach((p: any) => {
        if (p.affiliate_id) {
          commissionSum[p.affiliate_id] = (commissionSum[p.affiliate_id] ?? 0) + Number(p.commission_amount ?? 0);
          paymentCount[p.affiliate_id] = (paymentCount[p.affiliate_id] ?? 0) + 1;
        }
      });

      list.forEach((a) => {
        a.unique_visitors = visitorCount[a.id] ?? 0;
        a.form_submissions = submissionCount[a.id] ?? 0;
        a.total_commission = commissionSum[a.id] ?? 0;
        a.payments_count = paymentCount[a.id] ?? 0;
      });

      setRows(list);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load affiliates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(defaultForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (r: AffiliateRow) => {
    setForm({
      code: r.code,
      name: r.name,
      email: r.email,
      commission_percent: r.commission_percent,
      is_active: r.is_active,
    });
    setEditingId(r.id);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.email.trim()) {
      toast.error("Code, name and email are required");
      return;
    }
    setSaving(true);
    setTempPasswordResult(null);
    try {
      if (editingId) {
        const { error } = await (supabase as any)
          .from("affiliates")
          .update({
            name: form.name.trim(),
            email: form.email.trim(),
            commission_percent: Number(form.commission_percent) || 0,
            is_active: form.is_active,
          })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Affiliate updated");
        setDialogOpen(false);
      } else {
        const { data, error } = await supabase.functions.invoke("admin-create-affiliate", {
          body: {
            code: form.code.trim().toLowerCase().replace(/\s+/g, ""),
            name: form.name.trim(),
            email: form.email.trim(),
            commission_percent: Number(form.commission_percent) || 10,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Affiliate created. Share the temporary password with the affiliate.");
        setDialogOpen(false);
        setTempPasswordResult({ email: data.email ?? form.email, temp_password: data.temp_password ?? "" });
      }
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const copyTempPassword = () => {
    if (!tempPasswordResult) return;
    const text = `Email: ${tempPasswordResult.email}\nTemporary password: ${tempPasswordResult.temp_password}\n(They must change this on first login.)`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openDetail = async (row: AffiliateRow) => {
    setDetailLoading(true);
    setDetailAffiliate(null);
    try {
      const [{ data: visitors }, { data: submissions }, { data: payments }] = await Promise.all([
        (supabase as any).from("affiliate_visitors").select("visitor_ip, visited_at").eq("affiliate_id", row.id).order("visited_at", { ascending: false }),
        (supabase as any)
          .from("contact_submissions")
          .select("id, name, email, phone, telegram_id, description, referral_code, created_at")
          .eq("affiliate_id", row.id)
          .order("created_at", { ascending: false }),
        (supabase as any).from("user_payments").select("id, amount, currency, commission_amount, status, created_at").eq("affiliate_id", row.id).order("created_at", { ascending: false }),
      ]);
      setDetailAffiliate({ affiliate: row, visitors: visitors ?? [], submissions: submissions ?? [], payments: payments ?? [] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load affiliate details");
    } finally {
      setDetailLoading(false);
    }
  };

  const linkUrl = (code: string) => {
    const base = window.location.origin;
    return `${base}/?ref=${encodeURIComponent(code)}`;
  };

  const resetAffiliatePassword = async (affiliateId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-affiliate-password", {
        body: { affiliate_id: affiliateId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTempPasswordResult({
        email: data.email,
        temp_password: data.temp_password,
      });
      toast.success("Temporary password generated. Share it with the affiliate.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reset password");
    }
  };

  const toggleAffiliateActive = async (row: AffiliateRow) => {
    try {
      const next = !row.is_active;
      const { error } = await (supabase as any)
        .from("affiliates")
        .update({ is_active: next })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(next ? "Affiliate activated" : "Affiliate suspended");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    }
  };

  const deleteAffiliate = async (row: AffiliateRow) => {
    const ok = window.confirm(
      `Delete affiliate "${row.name}" (${row.code})?\nThis will remove their affiliate record and stats, but not their Supabase auth user.`,
    );
    if (!ok) return;
    try {
      const { error } = await (supabase as any)
        .from("affiliates")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Affiliate deleted");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete affiliate");
    }
  };

  const totalVisitors = rows.reduce((s, r) => s + r.unique_visitors, 0);
  const totalSubmissions = rows.reduce((s, r) => s + r.form_submissions, 0);
  const totalPayments = rows.reduce((s, r) => s + r.payments_count, 0);
  const totalCommission = rows.reduce((s, r) => s + r.total_commission, 0);

  return (
    <div className="space-y-6">
      {/* Overall summary */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-blue-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Total unique visitors</span></div>
              <p className="text-2xl font-bold text-white">{totalVisitors}</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><FileText className="h-4 w-4 text-amber-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Form submissions</span></div>
              <p className="text-2xl font-bold text-white">{totalSubmissions}</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Total payments</span></div>
              <p className="text-2xl font-bold text-white">{totalPayments}</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><Percent className="h-4 w-4 text-purple-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Total commission owed</span></div>
              <p className="text-2xl font-bold text-green-400">₹{totalCommission.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-between items-center flex-wrap gap-2">
        <Button variant="outline" onClick={load} disabled={loading} className="border-white/10 hover:bg-white/5">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-500 text-white">
          <PlusCircle className="h-4 w-4 mr-2" />
          Add affiliate
        </Button>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Affiliates ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Code / Link</TableHead>
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Commission %</TableHead>
                <TableHead className="text-muted-foreground">Unique visitors (IPs)</TableHead>
                <TableHead className="text-muted-foreground">Form submissions</TableHead>
                <TableHead className="text-muted-foreground">Payments</TableHead>
                <TableHead className="text-muted-foreground">Commission earned</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-mono text-cyan-400 text-xs">
                    <a href={linkUrl(r.code)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {r.code}
                    </a>
                  </TableCell>
                  <TableCell className="text-zinc-300">{r.name}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{r.email}</TableCell>
                  <TableCell>{r.commission_percent}%</TableCell>
                  <TableCell className="font-medium text-white">{r.unique_visitors}</TableCell>
                  <TableCell>{r.form_submissions}</TableCell>
                  <TableCell>{r.payments_count}</TableCell>
                  <TableCell className="text-green-400">
                    {r.total_commission > 0 ? `₹${Number(r.total_commission).toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "secondary"} className="border-white/10">
                      {r.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDetail(r)}
                      className="hover:bg-white/10 text-cyan-400"
                      title="View affiliate stats"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(r)}
                      className="hover:bg-white/10"
                      title="Edit affiliate details"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resetAffiliatePassword(r.id)}
                      className="hover:bg-white/10"
                      title="Reset affiliate password"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAffiliateActive(r)}
                      className="hover:bg-white/10"
                      title={r.is_active ? "Suspend affiliate" : "Activate affiliate"}
                    >
                      <Ban className={`h-3.5 w-3.5 ${r.is_active ? "text-amber-400" : "text-emerald-400"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAffiliate(r)}
                      className="hover:bg-white/10 text-red-400"
                      title="Delete affiliate"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No affiliates yet. Add one to start tracking links and commissions.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit affiliate" : "Add affiliate"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Code (used in ?ref=)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. john2024"
                className="bg-white/5 border-white/10"
                disabled={!!editingId}
              />
              {!editingId && (
                <p className="text-xs text-zinc-500">Link: {window.location.origin}/?ref={form.code || "CODE"}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Affiliate name"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="affiliate@example.com"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <Label>Commission % (when their referred user pays)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={form.commission_percent}
                onChange={(e) => setForm((f) => ({ ...f, commission_percent: Number(e.target.value) || 0 }))}
                className="bg-white/5 border-white/10"
              />
            </div>
            {editingId && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-white/20"
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-white/10">
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="bg-cyan-600 hover:bg-cyan-500">
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Affiliate detail popup */}
      <Dialog open={!!detailAffiliate || detailLoading} onOpenChange={(open) => !open && setDetailAffiliate(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-cyan-400" />
              {detailAffiliate?.affiliate.name} — Affiliate Stats
            </DialogTitle>
          </DialogHeader>

          {detailLoading && <p className="text-muted-foreground text-sm py-6 text-center">Loading…</p>}

          {detailAffiliate && !detailLoading && (() => {
            const { affiliate, visitors, submissions, payments } = detailAffiliate;
            const totalComm = payments.reduce((s, p) => s + Number(p.commission_amount ?? 0), 0);
            const link = linkUrl(affiliate.code);
            return (
              <ScrollArea className="max-h-[70vh] pr-2">
                <div className="space-y-6 py-2">
                  {/* Summary chips */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Unique visitors", value: visitors.length, color: "text-blue-400", icon: <Users className="h-4 w-4" /> },
                      { label: "Form submissions", value: submissions.length, color: "text-amber-400", icon: <FileText className="h-4 w-4" /> },
                      { label: "Payments", value: payments.length, color: "text-green-400", icon: <DollarSign className="h-4 w-4" /> },
                      { label: `Commission (${affiliate.commission_percent}%)`, value: `₹${totalComm.toFixed(2)}`, color: "text-purple-400", icon: <Percent className="h-4 w-4" /> },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg bg-white/5 p-3">
                        <div className={`flex items-center gap-1.5 mb-1 ${s.color}`}>{s.icon}<span className="text-xs text-muted-foreground">{s.label}</span></div>
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Affiliate link */}
                  <div className="rounded-lg bg-white/5 px-4 py-3">
                    <p className="text-xs text-zinc-500 mb-1">Affiliate link</p>
                    <code className="text-xs text-cyan-300 font-mono break-all">{link}</code>
                  </div>

                  {/* Visitors */}
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-blue-400" />Unique visitors ({visitors.length})</h3>
                    {visitors.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : (
                      <div className="rounded-lg overflow-hidden border border-white/5">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableHead className="text-muted-foreground text-xs">IP</TableHead>
                              <TableHead className="text-muted-foreground text-xs">First visited</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visitors.map((v, i) => (
                              <TableRow key={i} className="border-white/5 hover:bg-white/5">
                                <TableCell className="font-mono text-xs text-zinc-400">{v.visitor_ip}</TableCell>
                                <TableCell className="text-xs text-zinc-500">{new Date(v.visited_at).toLocaleString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Form submissions */}
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-amber-400" />
                      Form submissions ({submissions.length})
                    </h3>
                    {submissions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">None yet.</p>
                    ) : (
                      <div className="rounded-lg overflow-hidden border border-white/5">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableHead className="text-muted-foreground text-xs">Name</TableHead>
                              <TableHead className="text-muted-foreground text-xs">Email</TableHead>
                              <TableHead className="text-muted-foreground text-xs">Phone</TableHead>
                              <TableHead className="text-muted-foreground text-xs">Telegram</TableHead>
                              <TableHead className="text-muted-foreground text-xs">Referral code</TableHead>
                              <TableHead className="text-muted-foreground text-xs">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {submissions.map((s) => (
                              <TableRow key={s.id} className="border-white/5 hover:bg-white/5">
                                <TableCell className="text-xs text-zinc-300">{s.name}</TableCell>
                                <TableCell className="text-xs text-zinc-400">{s.email}</TableCell>
                                <TableCell className="text-xs text-zinc-400">{s.phone}</TableCell>
                                <TableCell className="text-xs text-zinc-500">{s.telegram_id || "—"}</TableCell>
                                <TableCell className="text-xs text-zinc-500">{s.referral_code || "—"}</TableCell>
                                <TableCell className="text-xs text-zinc-500">
                                  {new Date(s.created_at).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Payments */}
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-green-400" />Payments & commission ({payments.length})</h3>
                    {payments.length === 0 ? <p className="text-xs text-muted-foreground">No payments yet.</p> : (
                      <div className="rounded-lg overflow-hidden border border-white/5">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableHead className="text-muted-foreground text-xs">Amount</TableHead>
                              <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                              <TableHead className="text-muted-foreground text-xs">Commission</TableHead>
                              <TableHead className="text-muted-foreground text-xs">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments.map((p) => (
                              <TableRow key={p.id} className="border-white/5 hover:bg-white/5">
                                <TableCell className="text-xs text-zinc-300">{p.currency} {Number(p.amount).toFixed(2)}</TableCell>
                                <TableCell><Badge variant={p.status === "completed" ? "default" : "secondary"} className="text-xs border-white/10">{p.status}</Badge></TableCell>
                                <TableCell className="text-xs text-green-400 font-medium">₹{Number(p.commission_amount ?? 0).toFixed(2)}</TableCell>
                                <TableCell className="text-xs text-zinc-500">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            );
          })()}

          <DialogFooter>
            <Button onClick={() => setDetailAffiliate(null)} className="bg-zinc-700 hover:bg-zinc-600">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tempPasswordResult} onOpenChange={(open) => !open && setTempPasswordResult(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Affiliate created — share these credentials</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 mb-4">
            The affiliate must sign in with this temporary password, then they will be asked to set a new password on first login.
          </p>
          {tempPasswordResult && (
            <div className="space-y-2 rounded-lg bg-white/5 p-4 font-mono text-sm">
              <p><span className="text-zinc-500">Email:</span> {tempPasswordResult.email}</p>
              <p><span className="text-zinc-500">Temporary password:</span> {tempPasswordResult.temp_password}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={copyTempPassword} className="border-white/10">
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
            <Button onClick={() => setTempPasswordResult(null)} className="bg-cyan-600 hover:bg-cyan-500">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
