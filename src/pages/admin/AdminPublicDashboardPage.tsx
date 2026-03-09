import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, PlusCircle, Save, Trash2, ChevronDown, ChevronUp, BarChart3, TrendingUp, Activity, LayoutDashboard } from "lucide-react";

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
    <div className="space-y-8">
      {/* Metrics List Card */}
      <Card className="glass-panel border-white/10">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-white flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                Public Dashboard Metrics
              </CardTitle>
              <CardDescription className="text-zinc-400 mt-1">
                Manage the key performance indicators shown on the public dashboard.
              </CardDescription>
            </div>
            {metrics.length === 0 && !loading && (
              <Button size="sm" onClick={seedDefaults} className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20">
                <PlusCircle className="h-4 w-4 mr-1" /> Create default metrics
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" /> Loading metrics…
            </div>
          ) : metrics.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-white/10 rounded-xl bg-white/5">
              <p>No metrics found. Add your first metric below.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/30">
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-zinc-400 font-medium">Key</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Label</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Value</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Unit</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Chart</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Description</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Data</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.map((m) => {
                      const isExpanded = expandedId === m.id;
                      const pts = getPoints(m);
                      return (
                        <>
                          <TableRow key={m.id} className="border-white/5 hover:bg-white/5 transition-colors">
                            <TableCell className="text-xs font-mono text-zinc-500">{m.key}</TableCell>
                            <TableCell>
                              <Input 
                                value={m.label} 
                                onChange={(e) => handleMetricChange(m.id, "label", e.target.value)} 
                                className="min-w-[120px] bg-zinc-950/50 border-white/10 h-8 text-sm focus-visible:ring-primary/50" 
                              />
                            </TableCell>
                            <TableCell>
                              <Input 
                                value={m.value} 
                                onChange={(e) => handleMetricChange(m.id, "value", e.target.value)} 
                                className="min-w-[100px] bg-zinc-950/50 border-white/10 h-8 text-sm focus-visible:ring-primary/50" 
                              />
                            </TableCell>
                            <TableCell className="w-[100px]">
                              <Input 
                                value={m.unit || ""} 
                                onChange={(e) => handleMetricChange(m.id, "unit", e.target.value)} 
                                placeholder="Unit"
                                className="bg-zinc-950/50 border-white/10 h-8 text-sm focus-visible:ring-primary/50" 
                              />
                            </TableCell>
                            <TableCell className="w-[130px]">
                              <Select
                                value={m.chart_type || "area"}
                                onValueChange={(val) => handleMetricChange(m.id, "chart_type", val)}
                              >
                                <SelectTrigger className="h-8 bg-zinc-950/50 border-white/10 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CHART_TYPES.map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">
                                      <div className="flex items-center gap-2">
                                        {t === 'area' && <Activity className="h-3 w-3 text-primary" />}
                                        {t === 'line' && <TrendingUp className="h-3 w-3 text-blue-400" />}
                                        {t === 'bar' && <BarChart3 className="h-3 w-3 text-green-400" />}
                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              <Input 
                                value={m.description || ""} 
                                onChange={(e) => handleMetricChange(m.id, "description", e.target.value)} 
                                className="bg-zinc-950/50 border-white/10 h-8 text-sm focus-visible:ring-primary/50 truncate"
                                title={m.description || ""}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`text-xs h-8 px-2 border border-white/10 ${isExpanded ? 'bg-primary/10 text-primary border-primary/20' : 'text-zinc-400 hover:text-white'}`}
                                onClick={() => {
                                  if (!isExpanded) initPoints(m.id);
                                  setExpandedId(isExpanded ? null : m.id);
                                }}
                              >
                                {isExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                                7 days
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => deleteMetric(m.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${m.id}-points`} className="bg-white/[0.02] hover:bg-white/[0.02]">
                              <TableCell colSpan={8} className="p-0 border-b border-white/5">
                                <div className="p-4 bg-zinc-950/30 inner-shadow">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-semibold text-zinc-400 flex items-center gap-2">
                                      <Activity className="h-3 w-3 text-primary" />
                                      7-day trend data points
                                    </p>
                                    <span className="text-[10px] text-zinc-500">Auto-generated from current value if blank</span>
                                  </div>
                                  <div className="grid grid-cols-7 gap-3">
                                    {pts.map((pt, idx) => (
                                      <div key={idx} className="space-y-1.5">
                                        <p className="text-[10px] text-zinc-500 text-center uppercase tracking-wider">{pt.date}</p>
                                        <Input
                                          type="number"
                                          value={pt.value}
                                          onChange={(e) => handlePointChange(m.id, idx, e.target.value)}
                                          className="text-xs text-center px-1 h-8 bg-zinc-900 border-white/10 focus-visible:ring-primary/30"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  onClick={saveMetrics} 
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                >
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving Changes…</> : <><Save className="h-4 w-4 mr-2" />Save All Changes</>}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add New Metric Card */}
      <Card className="glass-panel border-white/10">
        <CardHeader>
          <CardTitle className="text-xl text-white flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            Add New Metric
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Create a new key performance indicator for the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Metric Key</Label>
              <Input 
                value={newMetric.key || ""} 
                onChange={(e) => setNewMetric((p) => ({ ...p, key: e.target.value }))} 
                placeholder="e.g. total_profit" 
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Display Label</Label>
              <Input 
                value={newMetric.label || ""} 
                onChange={(e) => setNewMetric((p) => ({ ...p, label: e.target.value }))} 
                placeholder="e.g. Total Profit" 
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Current Value</Label>
              <Input 
                value={newMetric.value || ""} 
                onChange={(e) => setNewMetric((p) => ({ ...p, value: e.target.value }))} 
                placeholder="e.g. 1250000" 
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Unit</Label>
              <Input 
                value={newMetric.unit || ""} 
                onChange={(e) => setNewMetric((p) => ({ ...p, unit: e.target.value }))} 
                placeholder="e.g. USD, %, Users" 
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Chart Type</Label>
              <Select
                value={newMetric.chart_type || "area"}
                onValueChange={(val) => setNewMetric((p) => ({ ...p, chart_type: val as ChartType }))}
              >
                <SelectTrigger className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <div className="flex items-center gap-2">
                        {t === 'area' && <Activity className="h-4 w-4 text-primary" />}
                        {t === 'line' && <TrendingUp className="h-4 w-4 text-blue-400" />}
                        {t === 'bar' && <BarChart3 className="h-4 w-4 text-green-400" />}
                        <span className="capitalize">{t} Chart</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Description</Label>
              <Input 
                value={newMetric.description || ""} 
                onChange={(e) => setNewMetric((p) => ({ ...p, description: e.target.value }))} 
                placeholder="Short description shown on hover" 
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button 
              onClick={addMetric}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
            >
              <PlusCircle className="h-4 w-4 mr-2" /> Add Metric
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
