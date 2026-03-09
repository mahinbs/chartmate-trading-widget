import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, PlusCircle, Save, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const CHART_TYPES = ["area", "line", "bar"] as const;
type ChartType = (typeof CHART_TYPES)[number];

interface ChartPoint { date: string; value: number }

interface Metric {
  id: string;
  key: string;
  label: string;
  value: string;
  unit: string | null;
  description: string | null;
  sort_order: number | null;
  chart_type: ChartType | null;
  chart_data: ChartPoint[] | null;
}

/** Deterministic seeded-random in [-1,1] */
function seededRand(seed: number) {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Auto-generate 7 realistic daily data points from the current total value */
function autoGenPoints(key: string, currentValue: number): ChartPoint[] {
  const base = currentValue;
  const keySeed = key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    // Progress from 60% to 100% with slight noise
    const progress = 0.6 + (0.4 * (i + 1)) / 7;
    const noise = seededRand(keySeed + i) * 0.04; // ±4% noise
    const rounded = Number(base * progress * (1 + noise)).toFixed(
      base < 100 ? 1 : 0
    );
    return { date: label, value: Number(rounded) };
  });
}

function parseNumeric(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function AdminPublicDashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newMetric, setNewMetric] = useState<Partial<Metric>>({
    key: "", label: "", value: "", unit: "", description: "", chart_type: "area",
  });

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("public_dashboard_metrics")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = ((data as any[]) || []).map((m) => ({
        ...m,
        chart_data: Array.isArray(m.chart_data) ? m.chart_data : null,
      }));
      setMetrics(rows);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMetrics(); }, []);

  const seedDefaults = async () => {
    try {
      const defaults = [
        { key: "profit", label: "Total Profit", value: "1250000", unit: "USD", description: "Cumulative strategy profit (simulated) since launch.", sort_order: 1, chart_type: "area" },
        { key: "revenue", label: "Total Revenue", value: "2100000", unit: "USD", description: "Total subscription & licensing revenue (simulated).", sort_order: 2, chart_type: "line" },
        { key: "users", label: "Active Users", value: "1200", unit: "", description: "Number of users currently using the platform.", sort_order: 3, chart_type: "bar" },
        { key: "accuracy", label: "Signal Accuracy", value: "94", unit: "%", description: "Backtested hit-rate on AI trading signals.", sort_order: 4, chart_type: "area" },
      ];
      const { error } = await supabase.from("public_dashboard_metrics").insert(defaults as any[]);
      if (error) throw error;
      toast.success("Default metrics created");
      loadMetrics();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create default metrics");
    }
  };

  const handleMetricChange = (id: string, field: keyof Metric, value: unknown) => {
    setMetrics((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handlePointChange = (metricId: string, pointIdx: number, newValue: string) => {
    setMetrics((prev) =>
      prev.map((m) => {
        if (m.id !== metricId) return m;
        const pts = getPoints(m);
        const updated = pts.map((p, i) =>
          i === pointIdx ? { ...p, value: Number(newValue) || 0 } : p
        );
        return { ...m, chart_data: updated };
      })
    );
  };

  /** Returns existing chart_data or auto-generates 7 points */
  const getPoints = (m: Metric): ChartPoint[] => {
    if (Array.isArray(m.chart_data) && m.chart_data.length >= 2) return m.chart_data;
    return autoGenPoints(m.key, parseNumeric(m.value));
  };

  const initPoints = (metricId: string) => {
    setMetrics((prev) =>
      prev.map((m) => {
        if (m.id !== metricId || Array.isArray(m.chart_data)) return m;
        return { ...m, chart_data: autoGenPoints(m.key, parseNumeric(m.value)) };
      })
    );
  };

  const saveMetrics = async () => {
    try {
      setSaving(true);
      const updates = metrics.map((m) => ({
        id: m.id,
        key: m.key,
        label: m.label,
        value: m.value,
        unit: m.unit,
        description: m.description,
        sort_order: m.sort_order,
        chart_type: m.chart_type || "area",
        chart_data: Array.isArray(m.chart_data) ? m.chart_data : null,
      }));
      const { error } = await supabase.from("public_dashboard_metrics").upsert(updates as any[], { onConflict: "id" });
      if (error) throw error;
      toast.success("Dashboard metrics saved");
      loadMetrics();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save metrics");
    } finally {
      setSaving(false);
    }
  };

  const addMetric = async () => {
    if (!newMetric.key?.trim() || !newMetric.label?.trim()) { toast.error("Key and label are required"); return; }
    try {
      const payload = {
        key: newMetric.key.trim(),
        label: newMetric.label.trim(),
        value: (newMetric.value ?? "").toString(),
        unit: (newMetric.unit ?? "").toString() || null,
        description: newMetric.description ?? null,
        sort_order: metrics.length + 1,
        chart_type: newMetric.chart_type || "area",
        chart_data: null,
      };
      const { data, error } = await supabase.from("public_dashboard_metrics").insert(payload as any).select("*").single();
      if (error) throw error;
      setMetrics((prev) => [...prev, { ...(data as any), chart_data: null }]);
      setNewMetric({ key: "", label: "", value: "", unit: "", description: "", chart_type: "area" });
      toast.success("Metric added");
    } catch (e: any) {
      toast.error(e?.message || "Failed to add metric");
    }
  };

  const deleteMetric = async (id: string) => {
    if (!confirm("Delete this metric?")) return;
    try {
      const { error } = await supabase.from("public_dashboard_metrics").delete().eq("id", id);
      if (error) throw error;
      setMetrics((prev) => prev.filter((m) => m.id !== id));
      toast.success("Metric deleted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete metric");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Public Dashboard Metrics</CardTitle>
          <p className="text-sm text-muted-foreground">
            Edit the numbers, chart types, and 7-day data points shown on the public dashboard. Expand any row to edit individual daily data points.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
            </div>
          ) : metrics.length === 0 ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted-foreground">
                No metrics yet. Add your own below or create a default set.
              </p>
              <Button size="sm" onClick={seedDefaults}>
                <PlusCircle className="h-4 w-4 mr-1" /> Create default metrics
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Chart</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((m) => {
                    const isExpanded = expandedId === m.id;
                    const pts = getPoints(m);
                    return (
                      <>
                        <TableRow key={m.id}>
                          <TableCell className="text-xs font-mono">{m.key}</TableCell>
                          <TableCell>
                            <Input value={m.label} onChange={(e) => handleMetricChange(m.id, "label", e.target.value)} className="min-w-[110px]" />
                          </TableCell>
                          <TableCell>
                            <Input value={m.value} onChange={(e) => handleMetricChange(m.id, "value", e.target.value)} className="min-w-[100px]" />
                          </TableCell>
                          <TableCell className="w-[90px]">
                            <Input value={m.unit || ""} onChange={(e) => handleMetricChange(m.id, "unit", e.target.value)} placeholder="USD / %" />
                          </TableCell>
                          <TableCell className="w-[110px]">
                            <select
                              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                              value={m.chart_type || "area"}
                              onChange={(e) => handleMetricChange(m.id, "chart_type", e.target.value)}
                            >
                              {CHART_TYPES.map((t) => (
                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell className="max-w-[160px]">
                            <Textarea rows={2} value={m.description || ""} onChange={(e) => handleMetricChange(m.id, "description", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1"
                              onClick={() => {
                                if (!isExpanded) initPoints(m.id);
                                setExpandedId(isExpanded ? null : m.id);
                              }}
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              7 days
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() => deleteMetric(m.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow key={`${m.id}-points`} className="bg-muted/30">
                            <TableCell colSpan={8} className="py-3 px-4">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">
                                7-day data points — edit any value (auto-generated from current total if blank)
                              </p>
                              <div className="grid grid-cols-7 gap-2">
                                {pts.map((pt, idx) => (
                                  <div key={idx} className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground text-center">{pt.date}</p>
                                    <Input
                                      type="number"
                                      value={pt.value}
                                      onChange={(e) => handlePointChange(m.id, idx, e.target.value)}
                                      className="text-xs text-center px-1"
                                    />
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-2">
                                These are displayed on the public &ldquo;Last 7 days&rdquo; chart. Click &ldquo;Save changes&rdquo; to persist.
                              </p>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex justify-end">
                <Button size="sm" onClick={saveMetrics} disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving…</> : <><Save className="h-4 w-4 mr-1" />Save changes</>}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add new metric */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add new metric</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Key</p>
              <Input value={newMetric.key || ""} onChange={(e) => setNewMetric((p) => ({ ...p, key: e.target.value }))} placeholder="unique_key" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Label</p>
              <Input value={newMetric.label || ""} onChange={(e) => setNewMetric((p) => ({ ...p, label: e.target.value }))} placeholder="Total Profit" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Value</p>
              <Input value={newMetric.value || ""} onChange={(e) => setNewMetric((p) => ({ ...p, value: e.target.value }))} placeholder="1250000" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Chart type</p>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                value={newMetric.chart_type || "area"}
                onChange={(e) => setNewMetric((p) => ({ ...p, chart_type: e.target.value as ChartType }))}
              >
                {CHART_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Unit</p>
              <Input value={newMetric.unit || ""} onChange={(e) => setNewMetric((p) => ({ ...p, unit: e.target.value }))} placeholder="USD / % / users" />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <p className="text-xs font-medium text-muted-foreground">Description</p>
              <Textarea rows={2} value={newMetric.description || ""} onChange={(e) => setNewMetric((p) => ({ ...p, description: e.target.value }))} placeholder="Short description shown on the public dashboard." />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={addMetric}>
              <PlusCircle className="h-4 w-4 mr-1" /> Add metric
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
