import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, RefreshCw, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { WEBINAR_BATCH_DEFINITIONS } from "@/constants/webinarBatches";

const PAGE_SIZE = 10;

type WebinarBookingRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  batch_code: string;
  batch_name: string;
  slot_time: string;
  created_at: string;
  status: string;
};

type DemoFormRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  description: string | null;
  created_at: string;
};

type EmailSubscriberRow = {
  id: string;
  name: string;
  email: string;
  description: string | null;
  created_at: string;
};

type BatchPatternRow = {
  weekday?: number;
  hourIST?: number;
  minuteIST?: number;
  durationMinutes?: number;
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtISTTime(hour: number, minute: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function deriveSlotTimeFromPattern(pattern: unknown): string | null {
  if (!Array.isArray(pattern) || pattern.length === 0) return null;
  const rows = pattern as BatchPatternRow[];
  const valid = rows.filter(
    (r) =>
      Number.isFinite(r.weekday) &&
      Number.isFinite(r.hourIST) &&
      Number.isFinite(r.minuteIST) &&
      Number.isFinite(r.durationMinutes),
  );
  if (!valid.length) return null;
  const first = valid[0];
  const startHour = Number(first.hourIST);
  const startMinute = Number(first.minuteIST);
  const duration = Number(first.durationMinutes);
  const endMins = startHour * 60 + startMinute + duration;
  const endHour = Math.floor((endMins % (24 * 60)) / 60);
  const endMinute = endMins % 60;
  const days = Array.from(
    new Set(valid.map((r) => WEEKDAY_SHORT[Number(r.weekday)]).filter(Boolean)),
  );
  if (!days.length) return null;
  return `${days.join(" / ")} - ${fmtISTTime(startHour, startMinute)} to ${fmtISTTime(endHour, endMinute)} IST`;
}

export default function AdminWebinarBookingsPage() {
  const [activeTab, setActiveTab] = useState<"webinar" | "demo" | "email">("webinar");

  const [webinarRows, setWebinarRows] = useState<WebinarBookingRow[]>([]);
  const [webinarPage, setWebinarPage] = useState(1);
  const [webinarTotal, setWebinarTotal] = useState(0);
  const [webinarLoading, setWebinarLoading] = useState(true);

  const [demoRows, setDemoRows] = useState<DemoFormRow[]>([]);
  const [demoPage, setDemoPage] = useState(1);
  const [demoTotal, setDemoTotal] = useState(0);
  const [demoLoading, setDemoLoading] = useState(true);

  const [emailRows, setEmailRows] = useState<EmailSubscriberRow[]>([]);
  const [emailPage, setEmailPage] = useState(1);
  const [emailTotal, setEmailTotal] = useState(0);
  const [emailLoading, setEmailLoading] = useState(true);

  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewTitle, setViewTitle] = useState("Details");
  const [viewPayload, setViewPayload] = useState<Record<string, string | null>>({});

  const webinarPageCount = useMemo(() => Math.max(1, Math.ceil(webinarTotal / PAGE_SIZE)), [webinarTotal]);
  const demoPageCount = useMemo(() => Math.max(1, Math.ceil(demoTotal / PAGE_SIZE)), [demoTotal]);
  const emailPageCount = useMemo(() => Math.max(1, Math.ceil(emailTotal / PAGE_SIZE)), [emailTotal]);

  const openDetails = (title: string, payload: Record<string, string | null>) => {
    setViewTitle(title);
    setViewPayload(payload);
    setViewModalOpen(true);
  };

  const loadWebinarRows = async () => {
    try {
      setWebinarLoading(true);
      const from = (webinarPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const [{ data: registrations, count, error: regErr }, { data: batches, error: batchErr }] = await Promise.all([
        (supabase as any)
          .from("webinar_registrations")
          .select("id,full_name,email,phone,batch_code,created_at,status", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to),
        (supabase as any)
          .from("webinar_batches")
          .select("code,name,session_pattern_json"),
      ]);
      if (regErr) throw regErr;
      if (batchErr) throw batchErr;

      const fallbackSlotByCode = new Map(
        WEBINAR_BATCH_DEFINITIONS.map((b) => [b.code, b.tagline] as const),
      );
      const batchMetaByCode = new Map(
        (
          (batches as Array<{ code: string; name: string; session_pattern_json?: unknown }> | null) ?? []
        ).map((b) => [
          b.code,
          {
            name: b.name,
            slot:
              deriveSlotTimeFromPattern(b.session_pattern_json) ??
              fallbackSlotByCode.get(b.code) ??
              "Time not set",
          },
        ] as const),
      );

      const mapped = (((registrations as WebinarBookingRow[] | null) ?? []).map((r) => ({
        ...r,
        batch_name: batchMetaByCode.get(r.batch_code)?.name ?? r.batch_code,
        slot_time:
          batchMetaByCode.get(r.batch_code)?.slot ??
          fallbackSlotByCode.get(r.batch_code) ??
          "Time not set",
      })));

      setWebinarRows(mapped);
      setWebinarTotal(Number(count ?? 0));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load webinar bookings");
    } finally {
      setWebinarLoading(false);
    }
  };

  const loadDemoRows = async () => {
    try {
      setDemoLoading(true);
      const from = (demoPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await (supabase as any)
        .from("contact_submissions")
        .select("id,name,email,phone,description,created_at", { count: "exact" })
        .ilike("description", "[Demo call request]%")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      setDemoRows((data as DemoFormRow[]) ?? []);
      setDemoTotal(Number(count ?? 0));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load demo bookings");
    } finally {
      setDemoLoading(false);
    }
  };

  const loadEmailRows = async () => {
    try {
      setEmailLoading(true);
      const from = (emailPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await (supabase as any)
        .from("contact_submissions")
        .select("id,name,email,description,created_at", { count: "exact" })
        .ilike("description", "[newsletter]%")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      setEmailRows((data as EmailSubscriberRow[]) ?? []);
      setEmailTotal(Number(count ?? 0));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load email subscribers");
    } finally {
      setEmailLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "webinar") void loadWebinarRows();
  }, [activeTab, webinarPage]);

  useEffect(() => {
    if (activeTab === "demo") void loadDemoRows();
  }, [activeTab, demoPage]);

  useEffect(() => {
    if (activeTab === "email") void loadEmailRows();
  }, [activeTab, emailPage]);

  return (
    <div className="space-y-4">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Webinar & Demo
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Manage webinar slot bookings, demo form submissions, and email subscribers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "webinar" | "demo" | "email")}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="webinar">Webinar Bookings</TabsTrigger>
              <TabsTrigger value="demo">Demo Form Users</TabsTrigger>
              <TabsTrigger value="email">Email Subscribers</TabsTrigger>
            </TabsList>

            <TabsContent value="webinar" className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={loadWebinarRows} disabled={webinarLoading}>
                  {webinarLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
              </div>
              <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/30">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Slot Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Booked At</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webinarRows.map((row) => (
                      <TableRow key={row.id} className="border-white/5">
                        <TableCell>{row.full_name}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        <TableCell>
                          <div>{row.batch_name}</div>
                          <div className="text-[10px] text-zinc-500">{row.batch_code}</div>
                        </TableCell>
                        <TableCell>{row.slot_time}</TableCell>
                        <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openDetails("Webinar booking details", {
                                Name: row.full_name,
                                Email: row.email,
                                Phone: row.phone,
                                Batch: `${row.batch_name} (${row.batch_code})`,
                                "Slot Time": row.slot_time,
                                Status: row.status,
                                "Booked At": new Date(row.created_at).toLocaleString(),
                              })
                            }
                          >
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!webinarLoading && webinarRows.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-zinc-500 py-8">No webinar bookings found.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{webinarTotal} total</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={webinarPage <= 1} onClick={() => setWebinarPage((p) => p - 1)}>Prev</Button>
                  <span>Page {webinarPage} / {webinarPageCount}</span>
                  <Button variant="outline" size="sm" disabled={webinarPage >= webinarPageCount} onClick={() => setWebinarPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="demo" className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={loadDemoRows} disabled={demoLoading}>
                  {demoLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
              </div>
              <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/30">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demoRows.map((row) => (
                      <TableRow key={row.id} className="border-white/5">
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openDetails("Demo form details", {
                                Name: row.name,
                                Email: row.email,
                                Phone: row.phone,
                                Description: row.description ?? "—",
                                Submitted: new Date(row.created_at).toLocaleString(),
                              })
                            }
                          >
                            <Eye className="h-4 w-4 mr-1" /> View details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!demoLoading && demoRows.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-zinc-500 py-8">No demo form submissions found.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{demoTotal} total</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={demoPage <= 1} onClick={() => setDemoPage((p) => p - 1)}>Prev</Button>
                  <span>Page {demoPage} / {demoPageCount}</span>
                  <Button variant="outline" size="sm" disabled={demoPage >= demoPageCount} onClick={() => setDemoPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="email" className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={loadEmailRows} disabled={emailLoading}>
                  {emailLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
              </div>
              <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/30">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Subscribed At</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emailRows.map((row) => (
                      <TableRow key={row.id} className="border-white/5">
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>{row.description ?? "newsletter"}</TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openDetails("Email subscriber details", {
                                Name: row.name,
                                Email: row.email,
                                Source: row.description ?? "newsletter",
                                "Subscribed At": new Date(row.created_at).toLocaleString(),
                              })
                            }
                          >
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!emailLoading && emailRows.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-zinc-500 py-8">No email subscribers found.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{emailTotal} total</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={emailPage <= 1} onClick={() => setEmailPage((p) => p - 1)}>Prev</Button>
                  <span>Page {emailPage} / {emailPageCount}</span>
                  <Button variant="outline" size="sm" disabled={emailPage >= emailPageCount} onClick={() => setEmailPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {Object.entries(viewPayload).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[180px_1fr] gap-3 py-1 border-b border-white/5 last:border-b-0">
                <div className="text-zinc-400">{k}</div>
                <div className="text-zinc-200 whitespace-pre-wrap break-words">{v ?? "—"}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
