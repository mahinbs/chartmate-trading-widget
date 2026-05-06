import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, Code2, Copy, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/hooks/useAdmin";
import { Navigate } from "react-router-dom";

type DevRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  strategy_name: string;
  description: string | null;
  market: string | null;
  priority: string;
  contact_email: string | null;
  document_object_path: string | null;
  status: string;
  eta: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  pdf_signed_url: string | null;
};

const STATUS_OPTIONS = ["submitted", "in_progress", "completed", "delivered", "cancelled"] as const;

export default function AdminStrategyDevRequestsPage() {
  const { isSuperAdmin, loading: adminLoading } = useAdmin();
  const [rows, setRows] = useState<DevRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: string; admin_notes: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-strategy-dev-requests", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const data = (res.data as { rows?: DevRow[] } | null)?.rows ?? [];
      setRows(data);
      const next: Record<string, { status: string; admin_notes: string }> = {};
      for (const r of data) {
        next[r.id] = {
          status: (r.status ?? "submitted").toLowerCase(),
          admin_notes: r.admin_notes ?? "",
        };
      }
      setDrafts(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!adminLoading && isSuperAdmin) void load();
  }, [adminLoading, isSuperAdmin, load]);

  if (!adminLoading && !isSuperAdmin) {
    return <Navigate to="/home" replace />;
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const saveRow = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-strategy-dev-requests", {
        body: {
          action: "update",
          id,
          status: d.status,
          admin_notes: d.admin_notes.trim() || null,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const err = (res.data as { error?: string } | null)?.error;
      if (err) throw new Error(err);
      toast.success("Request updated");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      r.strategy_name.toLowerCase().includes(q) ||
      (r.user_email ?? "").toLowerCase().includes(q) ||
      r.user_id.toLowerCase().includes(q) ||
      (r.contact_email ?? "").toLowerCase().includes(q) ||
      (r.description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search strategy, user email, user id, contact…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          className="border-white/10 hover:bg-white/5"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Code2 className="h-5 w-5 text-violet-400" />
            Strategy development requests
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Submissions from the ChartMate algo-only dashboard. Each row shows the ChartMate account (
            <span className="text-cyan-300/90">user id + email</span>). Use{" "}
            <strong className="text-white">List of Users</strong> or support workflows to act on their account;
            create or seed strategies for them in ChartMate as you normally would for that user.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Created</TableHead>
                <TableHead className="text-muted-foreground">Account</TableHead>
                <TableHead className="text-muted-foreground">Strategy</TableHead>
                <TableHead className="text-muted-foreground">Market / priority</TableHead>
                <TableHead className="text-muted-foreground">Contact</TableHead>
                <TableHead className="text-muted-foreground">PDF</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground w-[200px]">Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="border-white/10 align-top">
                  <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <div className="text-cyan-300/90 text-sm truncate" title={r.user_email ?? ""}>
                      {r.user_email ?? "—"}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={r.user_id}>
                        {r.user_id}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => void copy(r.user_id, "User id")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-white text-sm max-w-[220px]">
                    <div className="font-medium">{r.strategy_name}</div>
                    {r.description ? (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3" title={r.description}>
                        {r.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    <div>{r.market ?? "—"}</div>
                    <Badge variant="outline" className="mt-1 border-white/20 text-[10px]">
                      {r.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground break-all max-w-[140px]">
                    {r.contact_email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {r.pdf_signed_url ? (
                      <a
                        href={r.pdf_signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open PDF
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={drafts[r.id]?.status ?? r.status}
                      onValueChange={(v) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [r.id]: { ...(prev[r.id] ?? { status: r.status, admin_notes: r.admin_notes ?? "" }), status: v },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {r.eta ? (
                      <div className="text-[10px] text-muted-foreground mt-1">ETA {r.eta}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="space-y-2">
                    <Textarea
                      placeholder="Internal notes…"
                      value={drafts[r.id]?.admin_notes ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [r.id]: {
                            ...(prev[r.id] ?? { status: r.status, admin_notes: "" }),
                            admin_notes: e.target.value,
                          },
                        }))
                      }
                      className="min-h-[56px] text-xs bg-white/5 border-white/10"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={savingId === r.id}
                      onClick={() => void saveRow(r.id)}
                    >
                      {savingId === r.id ? "Saving…" : "Save"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No strategy build requests yet. They appear here when users submit from algo-only (after
                    migration + edge deploy).
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
