import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, TrendingDown, Users, BarChart3, Activity, Calendar, Globe, ChevronLeft, ChevronRight } from "lucide-react";
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

interface Subscriber {
  id: string;
  name: string;
  country: string;
  payment_id: string | null;
  subscribed_at: string;
}

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

function toFlag(code: string): string {
  const cc = code.toUpperCase();
  if (cc.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (cc.charCodeAt(0) - 65), A + (cc.charCodeAt(1) - 65));
}

function countryFlag(country: string): string {
  const c = country.trim();
  if (!c) return "";

  const map: Record<string, string> = {
    Thailand: "TH",
    USA: "US",
    "United States": "US",
    India: "IN",
    Netherlands: "NL",
    Brazil: "BR",
    "South Korea": "KR",
    Nigeria: "NG",
    Kazakhstan: "KZ",
    France: "FR",
    UAE: "AE",
    "United Arab Emirates": "AE",
    Poland: "PL",
    Sweden: "SE",
    Japan: "JP",
    Mexico: "MX",
    Ireland: "IE",
    Taiwan: "TW",
    Ghana: "GH",
    Bulgaria: "BG",
    Italy: "IT",
    Pakistan: "PK",
    "New Zealand": "NZ",
    Germany: "DE",
    Spain: "ES",
    Argentina: "AR",
    "South Africa": "ZA",
    Canada: "CA",
    Egypt: "EG",
    Serbia: "RS",
    Fiji: "FJ",
    Croatia: "HR",
    UK: "GB",
    "United Kingdom": "GB",
    Chile: "CL",
    Russia: "RU",
    Australia: "AU",
    Uzbekistan: "UZ",
    Austria: "AT",
    Oman: "OM",
    Colombia: "CO",
    Singapore: "SG",
    Switzerland: "CH",
    Ethiopia: "ET",
    Peru: "PE",
    "Cook Islands": "CK",
    Belarus: "BY",
    Vietnam: "VN",
    Lebanon: "LB",
    Uruguay: "UY",
    Tonga: "TO",
    Samoa: "WS",
    Eswatini: "SZ",
    Ukraine: "UA",
    Jordan: "JO",
    Somalia: "SO",
    Morocco: "MA",
    Montenegro: "ME",
    Tunisia: "TN",
    Iran: "IR",
    Israel: "IL",
    China: "CN",
    Norway: "NO",
  };

  const mapped = map[c] || map[c.toUpperCase()];
  if (mapped) return toFlag(mapped);

  const parts = c.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last.length === 2) return toFlag(last);

  return "";
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

/** Generate last-7-days per-day data — always ignores saved cumulative chart_data.
 *  Previous 6 days are stable (seeded). Today changes each calendar day. */
function buildSevenDayData(m: Metric, tz: string): ChartPoint[] {
  const base = parseNumeric(m.value);
  const now = new Date();
  const keySeed = m.key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const dailyBase = base / 30;
  const todaySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
    const daySeed = i < 6 ? keySeed + i * 31 + 7777 : keySeed + todaySeed;
    const factor = 1 + seededRand(daySeed) * 0.45;
    const value = Math.max(0, Math.round(dailyBase * factor));
    return { date: label, value };
  });
}

/** Generate last-7-days % deviation from weekly mean for the combined area chart.
 *  All metrics share the same ±% Y-axis so USD vs counts are all comparable. */
function buildSevenDayPctGrowth(metrics: Metric[], tz: string): { date: string; [key: string]: string | number }[] {
  const now = new Date();
  const todaySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

  // Pre-compute raw daily values for each metric across all 7 days
  const rawByMetric: Record<string, number[]> = {};
  metrics.forEach((m) => {
    const base = parseNumeric(m.value);
    const keySeed = m.key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const dailyBase = base / 30;
    rawByMetric[m.label] = Array.from({ length: 7 }, (_, i) => {
      const daySeed = i < 6 ? keySeed + i * 31 + 9999 : keySeed + todaySeed;
      return Math.max(0, dailyBase * (1 + seededRand(daySeed) * 0.45));
    });
  });

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
    const point: { date: string; [key: string]: string | number } = { date: label };
    metrics.forEach((m) => {
      const vals = rawByMetric[m.label];
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const pct = avg !== 0 ? ((vals[i] - avg) / avg) * 100 : 0;
      point[m.label] = parseFloat(pct.toFixed(1));
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

const SUB_PAGE_SIZE = 10;

export default function PublicDashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subPage, setSubPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [{ data: mData, error: mErr }, { data: sData }] = await Promise.all([
          (supabase as any).from("public_dashboard_metrics").select("*").order("sort_order", { ascending: true }),
          (supabase as any).from("recent_subscribers").select("id, name, country, payment_id, subscribed_at").order("subscribed_at", { ascending: false }),
        ]);
        if (mErr) throw mErr;
        setMetrics((mData as any[]) || []);
        setSubscribers((sData as any[]) || []);
      } catch (e) {
        console.error("Failed to load public dashboard", e);
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

  const sevenDayGrowthData = useMemo(
    () => buildSevenDayPctGrowth(numericMetrics, tz),
    [numericMetrics, tz]
  );

  const growthMetrics = numericMetrics;

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
                    const prev = data[data.length - 2]?.value ?? 0;
                    const curr = data[data.length - 1]?.value ?? 0;
                    const growthPct = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

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
                                {growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}% today
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

            {/* ── 7-day % change chart — all metrics normalised to ±% ── */}
            {growthMetrics.length >= 1 && sevenDayGrowthData.length > 0 && (
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Daily Performance — last 7 days (% vs weekly avg)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Each metric shown as % deviation from its own 7-day average — up/down every day
                  </p>
                </CardHeader>
                <CardContent className="pt-2">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart
                      data={sevenDayGrowthData}
                      margin={{ top: 10, right: 16, left: 8, bottom: 0 }}
                    >
                      <defs>
                        {growthMetrics.map((m, idx) => (
                          <linearGradient key={m.id} id={`mgr-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]} stopOpacity={0.02} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
                        width={52}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }}
                        formatter={(val: number, name: string) => [`${val > 0 ? "+" : ""}${val}%`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af", paddingTop: "8px" }} />
                      {growthMetrics.map((m, idx) => (
                        <Area
                          key={m.id}
                          type="monotone"
                          dataKey={m.label}
                          stroke={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]}
                          strokeWidth={2}
                          fill={`url(#mgr-${m.id})`}
                          dot={false}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* ── Recent Subscribers ── */}
            {subscribers.length > 0 && (() => {
              const totalPages = Math.ceil(subscribers.length / SUB_PAGE_SIZE);
              const pageSlice = subscribers.slice((subPage - 1) * SUB_PAGE_SIZE, subPage * SUB_PAGE_SIZE);
              return (
                <div>
                  <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    Recent Members
                    <Badge variant="outline" className="text-[10px] ml-1">{subscribers.length} total</Badge>
                  </h2>
                  <Card className="border-border/50">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50 bg-muted/30">
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">#</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Name</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Country</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Payment Ref</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Joined</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageSlice.map((s, idx) => {
                              const globalIdx = (subPage - 1) * SUB_PAGE_SIZE + idx + 1;
                              const joinedDate = new Date(s.subscribed_at).toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric", timeZone: tz,
                              });
                              const maskedRef = s.payment_id
                                ? s.payment_id.length > 8
                                  ? `${s.payment_id.slice(0, 6)}••••`
                                  : s.payment_id
                                : "—";
                              return (
                                <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-3 text-muted-foreground text-xs">{globalIdx}</td>
                                  <td className="px-4 py-3 font-medium">{s.name}</td>
                                  <td className="px-4 py-3">
                                    {(() => {
                                      const flag = countryFlag(s.country);
                                      return (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                          {flag ? (
                                            <span className="text-base leading-none">{flag}</span>
                                          ) : (
                                            <Globe className="h-3 w-3" />
                                          )}
                                          <span>{s.country}</span>
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-4 py-3">
                                    <code className="text-xs bg-muted/40 px-1.5 py-0.5 rounded font-mono">{maskedRef}</code>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground">{joinedDate}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
                          <p className="text-xs text-muted-foreground">
                            Showing {(subPage - 1) * SUB_PAGE_SIZE + 1}–{Math.min(subPage * SUB_PAGE_SIZE, subscribers.length)} of {subscribers.length}
                          </p>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={subPage === 1} onClick={() => setSubPage(p => p - 1)}>
                              <ChevronLeft className="h-3 w-3" />
                            </Button>
                            <span className="text-xs px-2">{subPage} / {totalPages}</span>
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={subPage === totalPages} onClick={() => setSubPage(p => p + 1)}>
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

          </>
        )}
      </div>
    </div>
  );
}
