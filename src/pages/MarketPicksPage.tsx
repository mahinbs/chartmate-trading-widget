import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { tradeTrackingService, ActiveTrade } from "@/services/tradeTrackingService";

interface BoardRow {
  id: string;
  symbol: string;
  display_name: string | null;
  probability_score: number | null;
  action_signal: "BUY" | "SELL" | "HOLD" | null;
  expires_at: string;
  generated_for_date: string;
  prediction_payload: any;
}

export default function MarketPicksPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [liveStats, setLiveStats] = useState<Record<string, { active: number; pnl: number }>>({});

  const loadBoard = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("public-daily-board");
      if (error) throw error;
      setRows(data?.rows || []);
      setDate(data?.date || "");
    } catch (error: any) {
      console.error("Failed to load market picks:", error);
      toast.error(error?.message || "Failed to load market picks");
    } finally {
      setLoading(false);
    }
  };

  const loadLiveStats = async () => {
    try {
      const { data } = await tradeTrackingService.getActiveTrades();
      if (!data) {
        setLiveStats({});
        return;
      }
      const map: Record<string, { active: number; pnl: number }> = {};
      (data as ActiveTrade[]).forEach((t) => {
        const key = (t.symbol || "").toUpperCase();
        if (!key) return;
        if (!map[key]) map[key] = { active: 0, pnl: 0 };
        map[key].active += 1;
        map[key].pnl += t.currentPnl ?? 0;
      });
      setLiveStats(map);
    } catch (e) {
      console.error("Failed to load live stats for board:", e);
    }
  };

  useEffect(() => {
    loadBoard();
    loadLiveStats();

    const boardInterval = setInterval(loadBoard, 60_000);
    const statsInterval = setInterval(loadLiveStats, 30_000);

    const subscription = tradeTrackingService.subscribeToTrades(() => {
      loadLiveStats();
    });

    return () => {
      clearInterval(boardInterval);
      clearInterval(statsInterval);
      subscription.unsubscribe();
    };
  }, []);

  const nextRefreshLabel = useMemo(() => {
    if (!rows.length) return "-";
    const soonest = rows.map((r) => new Date(r.expires_at).getTime()).sort((a, b) => a - b)[0];
    const diffMs = soonest - Date.now();
    if (diffMs <= 0) return "Refreshing soon";
    return `${Math.ceil(diffMs / (60 * 1000))} min`;
  }, [rows]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate("/rsb-fintech-founder")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Website Home
            </Button>
            <h1 className="text-xl md:text-2xl font-bold">Daily Market Picks</h1>
          </div>
          <Button variant="outline" onClick={loadBoard} disabled={loading} className="w-full md:w-auto">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader><CardTitle>Board Snapshot</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            <div className="px-3 py-2 rounded bg-muted">Date: <strong>{date || "-"}</strong></div>
            <div className="px-3 py-2 rounded bg-muted">Symbols: <strong>{rows.length}</strong></div>
            <div className="px-3 py-2 rounded bg-muted">Next refresh: <strong>{nextRefreshLabel}</strong></div>
            <div className="px-3 py-2 rounded bg-muted">Auto-refresh: <strong>Every 60s</strong></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Analyses</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead>Live Orders</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>AI Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.display_name || row.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={row.action_signal === "BUY" ? "default" : row.action_signal === "SELL" ? "destructive" : "secondary"}>
                        {row.action_signal || "HOLD"}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.probability_score != null ? `${row.probability_score}%` : "-"}</TableCell>
                    <TableCell>
                      {(() => {
                        const live = liveStats[row.symbol.toUpperCase()];
                        if (!live || live.active === 0) return "-";
                        const sign = live.pnl >= 0 ? "+" : "";
                        return `${live.active} active (${sign}${live.pnl.toFixed(2)})`;
                      })()}
                    </TableCell>
                    <TableCell>{new Date(row.expires_at).toLocaleString()}</TableCell>
                    <TableCell className="max-w-[380px] truncate">{row.prediction_payload?.geminiForecast?.positioning_guidance?.notes || "No notes"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
