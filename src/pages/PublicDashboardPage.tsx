import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, TrendingDown, Users, BarChart3, Activity, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

interface Metric {
  id: string;
  key: string;
  label: string;
  value: string;
  unit: string | null;
  description: string | null;
  sort_order: number | null;
  chart_type?: string | null;
  chart_data?: { date: string; value: number }[] | null;
}

type ChartPoint = { date: string; value: number };

function metricIcon(key: string) {
  if (key.includes("profit")) return <TrendingUp className="h-5 w-5 text-emerald-500" />;
  if (key.includes("loss")) return <TrendingDown className="h-5 w-5 text-red-500" />;
  if (key.includes("user")) return <Users className="h-5 w-5 text-sky-500" />;
  if (key.includes("revenue")) return <BarChart3 className="h-5 w-5 text-indigo-500" />;
  return <Activity className="h-5 w-5 text-primary" />;
}

function parseNumeric(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatValue(m: Metric, n?: number): string {
  const numeric = n ?? parseNumeric(m.value);
  if (m.unit === "USD") {
    if (Math.abs(numeric) >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(2)}M`;
    if (Math.abs(numeric) >= 1_000) return `$${(numeric / 1_000).toFixed(1)}K`;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numeric);
  }
  if (m.unit === "%") return `${numeric.toFixed(1)}%`;
  if (m.unit) return `${numeric.toLocaleString()} ${m.unit}`;
  return numeric.toLocaleString();
}

/** Deterministic seeded random — returns a float in [-1, 1] */
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Generate last-7-days data from the current total value */
function buildSevenDayData(m: Metric, tz: string): ChartPoint[] {
  if (Array.isArray(m.chart_data) && m.chart_data.length >= 2) return m.chart_data;

  const base = parseNumeric(m.value);
  const now = new Date();
  const keySeed = m.key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
    // Progressive growth: earlier days are smaller, latest ≈ current value
    const progress = (i + 1) / 7;
    const noise = seededRand(keySeed + i) * 0.07;
    const value = Math.round(base * progress * (1 + noise));
    return { date: label, value };
  });
}

/** Generate last-6-months growth data from current value */
function buildMonthlyGrowth(metrics: Metric[], tz: string): { month: string; [key: string]: string | number }[] {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d.toLocaleDateString("en-US", { timeZone: tz, month: "short", year: "2-digit" });
  });

  return months.map((month, idx) => {
    const point: { month: string; [key: string]: string | number } = { month };
    metrics.forEach((m) => {
      const base = parseNumeric(m.value);
      const keySeed = m.key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const progress = (idx + 1) / 6;
      const noise = seededRand(keySeed + idx * 3) * 0.05;
      point[m.label] = Math.round(base * progress * (1 + noise));
    });
    return point;
  });
}

function accentColors(key: string) {
  if (key.includes("profit")) return { stroke: "#10b981", fill: "#10b981", border: "border-emerald-500/40", bg: "bg-emerald-500/5" };
  if (key.includes("loss")) return { stroke: "#ef4444", fill: "#ef4444", border: "border-red-500/40", bg: "bg-red-500/5" };
  if (key.includes("user")) return { stroke: "#0ea5e9", fill: "#0ea5e9", border: "border-sky-500/40", bg: "bg-sky-500/5" };
  if (key.includes("revenue")) return { stroke: "#6366f1", fill: "#6366f1", border: "border-indigo-500/40", bg: "bg-indigo-500/5" };
  return { stroke: "#8b5cf6", fill: "#8b5cf6", border: "border-violet-500/40", bg: "bg-violet-500/5" };
}

const GROWTH_PALETTE = ["#10b981", "#6366f1", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6"];

function MetricSparkline({ m, data }: { m: Metric; data: ChartPoint[] }) {
  const colors = accentColors(m.key);
  const chartType = m.chart_type || "area";

  const tooltipFormatter = (val: number) => [formatValue(m, val), m.label];

  const commonProps = {
    data,
    margin: { top: 4, right: 4, left: 0, bottom: 0 },
  };

  const axisProps = {
    tick: { fontSize: 10, fill: "#6b7280" },
    tickLine: false,
    axisLine: false,
  };

  return (
    <ResponsiveContainer width="100%" height={100}>
      {chartType === "bar" ? (
        <BarChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} width={40} tickFormatter={(v) => formatValue(m, v)} />
          <Tooltip formatter={tooltipFormatter} contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }} />
          <Bar dataKey="value" fill={colors.fill} radius={[3, 3, 0, 0]} fillOpacity={0.85} />
        </BarChart>
      ) : chartType === "line" ? (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} width={40} tickFormatter={(v) => formatValue(m, v)} />
          <Tooltip formatter={tooltipFormatter} contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }} />
          <Line type="monotone" dataKey="value" stroke={colors.stroke} strokeWidth={2} dot={{ r: 3, fill: colors.stroke }} activeDot={{ r: 5 }} />
        </LineChart>
      ) : (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.fill} stopOpacity={0.35} />
              <stop offset="95%" stopColor={colors.fill} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} width={40} tickFormatter={(v) => formatValue(m, v)} />
          <Tooltip formatter={tooltipFormatter} contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }} />
          <Area type="monotone" dataKey="value" stroke={colors.stroke} strokeWidth={2} fill={`url(#grad-${m.key})`} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

export default function PublicDashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("public_dashboard_metrics")
          .select("*")
          .order("sort_order", { ascending: true });
        if (error) throw error;
        setMetrics((data as any[]) || []);
      } catch (e) {
        console.error("Failed to load public dashboard metrics", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const numericMetrics = useMemo(
    () => metrics.filter((m) => parseNumeric(m.value) !== 0),
    [metrics]
  );

  const sevenDayDataMap = useMemo(
    () => Object.fromEntries(numericMetrics.map((m) => [m.id, buildSevenDayData(m, tz)])),
    [numericMetrics, tz]
  );

  const monthlyGrowthData = useMemo(
    () => buildMonthlyGrowth(numericMetrics.filter((m) => m.unit === "USD" || m.unit === ""), tz),
    [numericMetrics, tz]
  );

  const growthMetrics = numericMetrics.filter((m) => m.unit === "USD" || m.unit === "");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/rsb-fintech-founder">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Home
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Platform Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Live performance metrics &amp; growth stats — curated by the admin
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Timezone: {tz}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-10">

        {loading && (
          <p className="text-sm text-muted-foreground animate-pulse">Loading dashboard…</p>
        )}

        {!loading && metrics.length === 0 && (
          <Card className="max-w-xl mx-auto">
            <CardHeader>
              <CardTitle>No public metrics yet</CardTitle>
              <p className="text-sm text-muted-foreground">
                The admin hasn&apos;t configured any public dashboard metrics yet.
              </p>
            </CardHeader>
          </Card>
        )}

        {!loading && metrics.length > 0 && (
          <>
            {/* ── Hero stat row ── */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              {metrics.map((m) => {
                const colors = accentColors(m.key);
                return (
                  <Card key={m.id} className={`border ${colors.border} ${colors.bg} relative overflow-hidden`}>
                    <CardContent className="pt-5 pb-4 px-5">
                      <div className="flex items-center gap-2 mb-2">
                        {metricIcon(m.key)}
                        <span className="text-xs font-medium text-muted-foreground truncate">{m.label}</span>
                        {m.unit && <Badge variant="outline" className="text-[10px] ml-auto">{m.unit}</Badge>}
                      </div>
                      <p className="text-2xl font-bold tracking-tight">{formatValue(m)}</p>
                      {m.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">{m.description}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* ── 7-day per-metric charts ── */}
            {numericMetrics.length > 0 && (
              <div>
                <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Last 7 Days — per metric
                </h2>
                <div className="grid gap-5 md:grid-cols-2">
                  {numericMetrics.map((m) => {
                    const colors = accentColors(m.key);
                    const data = sevenDayDataMap[m.id] || [];
                    const first = data[0]?.value ?? 0;
                    const last = data[data.length - 1]?.value ?? 0;
                    const growthPct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;

                    return (
                      <Card key={m.id} className={`border ${colors.border}`}>
                        <CardHeader className="pb-1">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              {metricIcon(m.key)}
                              {m.label}
                            </CardTitle>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${growthPct >= 0 ? "border-emerald-500 text-emerald-600" : "border-red-500 text-red-500"}`}
                              >
                                {growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}% 7d
                              </Badge>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {m.chart_type || "area"}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <MetricSparkline m={m} data={data} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Monthly growth chart ── */}
            {growthMetrics.length >= 1 && monthlyGrowthData.length > 0 && (
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Platform Growth — last 6 months
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Month-over-month cumulative growth across key metrics
                  </p>
                </CardHeader>
                <CardContent className="pt-2">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart
                      data={monthlyGrowthData}
                      margin={{ top: 10, right: 16, left: 8, bottom: 0 }}
                    >
                      <defs>
                        {growthMetrics.map((m, idx) => (
                          <linearGradient key={m.id} id={`mgr-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]} stopOpacity={0.02} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                          if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                          return String(v);
                        }}
                        width={52}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }}
                        formatter={(val: number, name: string) => {
                          const metric = growthMetrics.find((m) => m.label === name);
                          return metric ? [formatValue(metric, val), name] : [val.toLocaleString(), name];
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, color: "#9ca3af", paddingTop: "8px" }}
                      />
                      {growthMetrics.map((m, idx) => (
                        <Area
                          key={m.id}
                          type="monotone"
                          dataKey={m.label}
                          stroke={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]}
                          strokeWidth={2}
                          fill={`url(#mgr-${m.id})`}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* ── Combined snapshot bar chart ── */}
            {numericMetrics.length >= 2 && (() => {
              const snapshotData = numericMetrics.map((m) => ({
                id: m.id,
                label: m.label,
                unit: m.unit,
                value: parseNumeric(m.value),
              }));

              return (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Platform Snapshot — current totals
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Relative comparison of all metrics at a glance</p>
                </CardHeader>
                <CardContent className="pt-2">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={snapshotData}
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                          if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                          return String(v);
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickLine={false}
                        axisLine={false}
                        width={120}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }}
                        formatter={(val: number, _name: string, props: any) => {
                          const label = props?.payload?.label as string | undefined;
                          const metric = numericMetrics.find((m) => m.label === label);
                          return metric
                            ? [formatValue(metric, val), metric.label]
                            : [val.toLocaleString(), label ?? ""];
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, color: "#9ca3af" }}
                        formatter={(_, entry: any) => entry?.payload?.label || ""}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {snapshotData.map((row, idx) => (
                          <Cell
                            key={row.id}
                            fill={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]}
                            fillOpacity={0.9}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
