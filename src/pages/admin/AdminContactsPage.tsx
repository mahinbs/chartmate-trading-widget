import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Download, RefreshCw, Mail, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContactRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  telegram_id: string | null;
  description: string | null;
  created_at: string;
  affiliate_id: string | null;
  referral_code: string | null;
  affiliate_code: string | null;
  affiliate_name: string | null;
}

interface WebinarBatchRow {
  id: string;
  code: string;
  name: string;
  timezone: string;
  zoom_join_url: string | null;
  is_active: boolean;
}

interface WebinarRegistrationRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  batch_code: string;
  source: string;
  created_at: string;
  status: string;
}

interface FunnelKpis {
  landingViews: number;
  signupStarts: number;
  signupCompletes: number;
  batchSelects: number;
  webinarRegistrations: number;
  trialActive: number;
  trialTotal: number;
}

export default function AdminContactsPage() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [webinarBatches, setWebinarBatches] = useState<WebinarBatchRow[]>([]);
  const [webinarRegistrations, setWebinarRegistrations] = useState<WebinarRegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBatchIds, setSavingBatchIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [kpis, setKpis] = useState<FunnelKpis>({
    landingViews: 0,
    signupStarts: 0,
    signupCompletes: 0,
    batchSelects: 0,
    webinarRegistrations: 0,
    trialActive: 0,
    trialTotal: 0,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data: submissions, error } = await (supabase as any)
        .from("contact_submissions")
        .select("id, name, email, phone, telegram_id, description, created_at, affiliate_id, referral_code")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const affIds = [...new Set((submissions ?? []).filter((s: any) => s.affiliate_id).map((s: any) => s.affiliate_id))];
      let affiliateMap: Record<string, { code: string; name: string }> = {};

      if (affIds.length > 0) {
        const { data: affiliates } = await (supabase as any)
          .from("affiliates")
          .select("id, code, name")
          .in("id", affIds);
        (affiliates ?? []).forEach((a: any) => {
          affiliateMap[a.id] = { code: a.code, name: a.name };
        });
      }

      setRows(
        (submissions ?? []).map((s: any) => ({
          ...s,
          affiliate_code: s.affiliate_id ? (affiliateMap[s.affiliate_id]?.code ?? null) : null,
          affiliate_name: s.affiliate_id ? (affiliateMap[s.affiliate_id]?.name ?? null) : (s.referral_code ? null : null),
        }))
      );

      const [{ data: batches }, { data: registrations }] = await Promise.all([
        (supabase as any)
          .from("webinar_batches")
          .select("id, code, name, timezone, zoom_join_url, is_active")
          .order("name", { ascending: true }),
        (supabase as any)
          .from("webinar_registrations")
          .select("id, full_name, email, phone, batch_code, source, created_at, status")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      setWebinarBatches((batches ?? []) as WebinarBatchRow[]);
      setWebinarRegistrations((registrations ?? []) as WebinarRegistrationRow[]);

      const [
        landingViewsRes,
        signupStartsRes,
        signupCompletesRes,
        batchSelectRes,
        webinarRegRes,
        trialActiveRes,
        trialTotalRes,
      ] = await Promise.all([
        (supabase as any)
          .from("funnel_events")
          .select("*", { count: "exact", head: true })
          .eq("event_name", "landing_view"),
        (supabase as any)
          .from("funnel_events")
          .select("*", { count: "exact", head: true })
          .eq("event_name", "signup_start"),
        (supabase as any)
          .from("funnel_events")
          .select("*", { count: "exact", head: true })
          .eq("event_name", "signup_complete"),
        (supabase as any)
          .from("funnel_events")
          .select("*", { count: "exact", head: true })
          .eq("event_name", "batch_select"),
        (supabase as any)
          .from("webinar_registrations")
          .select("*", { count: "exact", head: true }),
        (supabase as any)
          .from("trial_access")
          .select("*", { count: "exact", head: true })
          .eq("status", "active"),
        (supabase as any)
          .from("trial_access")
          .select("*", { count: "exact", head: true }),
      ]);

      setKpis({
        landingViews: landingViewsRes.count ?? 0,
        signupStarts: signupStartsRes.count ?? 0,
        signupCompletes: signupCompletesRes.count ?? 0,
        batchSelects: batchSelectRes.count ?? 0,
        webinarRegistrations: webinarRegRes.count ?? 0,
        trialActive: trialActiveRes.count ?? 0,
        trialTotal: trialTotalRes.count ?? 0,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      (r.affiliate_code ?? "").toLowerCase().includes(q)
    );
  });

  const updateBatchLocal = (id: string, patch: Partial<WebinarBatchRow>) => {
    setWebinarBatches((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const saveBatch = async (batch: WebinarBatchRow) => {
    setSavingBatchIds((prev) => ({ ...prev, [batch.id]: true }));
    try {
      const { error } = await (supabase as any)
        .from("webinar_batches")
        .update({
          zoom_join_url: batch.zoom_join_url?.trim() || null,
          is_active: batch.is_active,
        })
        .eq("id", batch.id);
      if (error) throw error;
      toast.success(`${batch.name} updated`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update batch");
    } finally {
      setSavingBatchIds((prev) => ({ ...prev, [batch.id]: false }));
    }
  };

  const exportRegistrationsCsv = () => {
    if (!webinarRegistrations.length) {
      toast.error("No webinar registrations to export.");
      return;
    }
    const headers = [
      "full_name",
      "email",
      "phone",
      "batch_code",
      "status",
      "source",
      "created_at",
    ];
    const rowsCsv = webinarRegistrations.map((row) =>
      [
        row.full_name,
        row.email,
        row.phone,
        row.batch_code,
        row.status,
        row.source,
        row.created_at,
      ]
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...rowsCsv].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `webinar-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, referral..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
          />
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="border-white/10 hover:bg-white/5">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass-panel">
          <CardContent className="pt-5">
            <p className="text-xs text-zinc-500">Landing views</p>
            <p className="text-2xl font-bold text-white">{kpis.landingViews}</p>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-5">
            <p className="text-xs text-zinc-500">Signup started</p>
            <p className="text-2xl font-bold text-white">{kpis.signupStarts}</p>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-5">
            <p className="text-xs text-zinc-500">Signup complete</p>
            <p className="text-2xl font-bold text-white">{kpis.signupCompletes}</p>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-5">
            <p className="text-xs text-zinc-500">Batch selected</p>
            <p className="text-2xl font-bold text-white">{kpis.batchSelects}</p>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-5">
            <p className="text-xs text-zinc-500">Webinar registrations</p>
            <p className="text-2xl font-bold text-white">{kpis.webinarRegistrations}</p>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-5">
            <p className="text-xs text-zinc-500">Trials active</p>
            <p className="text-2xl font-bold text-white">{kpis.trialActive}</p>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-5">
            <p className="text-xs text-zinc-500">Trials total</p>
            <p className="text-2xl font-bold text-white">{kpis.trialTotal}</p>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-5">
            <p className="text-xs text-zinc-500">Signup CVR</p>
            <p className="text-2xl font-bold text-white">
              {kpis.landingViews > 0
                ? `${((kpis.signupCompletes / kpis.landingViews) * 100).toFixed(1)}%`
                : "0.0%"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5" />
            Webinar Batches ({webinarBatches.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {webinarBatches.map((batch) => (
            <div
              key={batch.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-zinc-200">{batch.name}</p>
                  <p className="text-xs text-zinc-500">
                    {batch.code} • {batch.timezone}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Active</span>
                  <Switch
                    checked={batch.is_active}
                    onCheckedChange={(v) =>
                      updateBatchLocal(batch.id, { is_active: v === true })
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Input
                  value={batch.zoom_join_url ?? ""}
                  onChange={(e) =>
                    updateBatchLocal(batch.id, { zoom_join_url: e.target.value })
                  }
                  placeholder="Zoom join URL"
                  className="flex-1 min-w-[260px] bg-white/5 border-white/10 text-white"
                />
                <Button
                  onClick={() => saveBatch(batch)}
                  disabled={Boolean(savingBatchIds[batch.id])}
                  className="bg-teal-500 hover:bg-teal-400 text-black"
                >
                  {savingBatchIds[batch.id] ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ))}
          {webinarBatches.length === 0 && (
            <p className="text-sm text-muted-foreground">No webinar batches found.</p>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-white flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Webinar Registrations ({webinarRegistrations.length})
            </CardTitle>
            <Button
              variant="outline"
              onClick={exportRegistrationsCsv}
              className="border-white/10 hover:bg-white/5"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground">Batch</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Source</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webinarRegistrations.map((r) => (
                <TableRow key={r.id} className="border-white/5 hover:bg-white/5 align-top">
                  <TableCell className="font-medium text-zinc-300 whitespace-nowrap">{r.full_name}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{r.email}</TableCell>
                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell className="text-zinc-400 text-xs">{r.batch_code}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-teal-500/40 text-teal-400 text-xs">
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500 text-xs">{r.source}</TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && webinarRegistrations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No webinar registrations yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Form submissions ({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground">Telegram</TableHead>
                <TableHead className="text-muted-foreground">Description / Plan</TableHead>
                <TableHead className="text-muted-foreground">Referred by</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="border-white/5 hover:bg-white/5 align-top">
                  <TableCell className="font-medium text-zinc-300 whitespace-nowrap">{r.name}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{r.email}</TableCell>
                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell className="text-zinc-500 text-sm">{r.telegram_id || "—"}</TableCell>
                  <TableCell className="text-zinc-400 text-xs max-w-[200px]">
                    <span className="line-clamp-3">{r.description || "—"}</span>
                  </TableCell>
                  <TableCell>
                    {r.affiliate_code ? (
                      <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 text-xs whitespace-nowrap">
                        {r.affiliate_code}
                        {r.affiliate_name && <span className="ml-1 text-zinc-500">({r.affiliate_name})</span>}
                      </Badge>
                    ) : r.referral_code ? (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs whitespace-nowrap" title="Manually entered — not yet matched to an affiliate">
                        {r.referral_code} <span className="ml-1 text-zinc-500">(manual)</span>
                      </Badge>
                    ) : (
                      <span className="text-zinc-600 text-xs">Direct</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {rows.length === 0 ? "No submissions yet." : "No results match your search."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
