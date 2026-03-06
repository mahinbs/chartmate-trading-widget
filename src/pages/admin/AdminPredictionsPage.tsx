import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WatchlistItem {
  symbol: string;
  display_name?: string;
  timeframe?: string;
  investment?: number;
}

interface BoardRow {
  id: string;
  symbol: string;
  display_name: string | null;
  probability_score: number | null;
  action_signal: "BUY" | "SELL" | "HOLD" | null;
  expires_at: string;
  generated_for_date: string;
  refresh_reason: string;
}

const DEFAULT_TIMEFRAME = "1d";

export default function AdminPredictionsPage() {
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [boardRows, setBoardRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newTimeframe, setNewTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [newInvestment, setNewInvestment] = useState("10000");

  const watchlistInputs = useMemo(() => watchlist.slice(0, 10), [watchlist]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [{ data: watchData, error: watchError }, { data: boardData, error: boardError }] = await Promise.all([
        supabase.functions.invoke("admin-watchlist", { method: "GET" }),
        supabase.functions.invoke("admin-daily-board", { method: "GET" }),
      ]);
      if (watchError) throw watchError;
      if (boardError) throw boardError;

      setWatchlist((watchData?.items || []).map((item: any) => ({
        symbol: item.symbol,
        display_name: item.display_name || "",
        timeframe: item.timeframe || DEFAULT_TIMEFRAME,
        investment: item.investment || 10000,
      })));
      setBoardRows(boardData?.rows || []);
    } catch (error: any) {
      console.error("Failed to load admin data:", error);
      toast.error(error?.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateWatchInput = (index: number, key: keyof WatchlistItem, value: string) => {
    const next = [...watchlistInputs];
    next[index] = { ...next[index], [key]: value };
    setWatchlist(next);
  };

  const addWatchItem = () => {
    if (!newSymbol.trim()) {
      toast.error("Enter a symbol first");
      return;
    }
    if (watchlistInputs.length >= 10) {
      toast.error("Maximum 10 symbols allowed");
      return;
    }
    const normalized = newSymbol.trim().toUpperCase();
    if (watchlistInputs.some((w) => w.symbol?.trim().toUpperCase() === normalized)) {
      toast.error("Symbol already added");
      return;
    }
    setWatchlist([
      ...watchlistInputs,
      {
        symbol: normalized,
        display_name: newDisplayName.trim() || normalized,
        timeframe: newTimeframe || DEFAULT_TIMEFRAME,
        investment: Number(newInvestment || 10000),
      },
    ]);
    setNewSymbol("");
    setNewDisplayName("");
    setNewTimeframe(DEFAULT_TIMEFRAME);
    setNewInvestment("10000");
  };

  const removeWatchItem = (index: number) => {
    setWatchlist(watchlistInputs.filter((_, i) => i !== index));
  };

  const saveWatchlist = async () => {
    try {
      setSavingWatchlist(true);
      const cleaned = watchlistInputs
        .map((item) => ({
          symbol: item.symbol?.trim().toUpperCase() || "",
          display_name: item.display_name?.trim() || item.symbol?.trim().toUpperCase() || "",
          timeframe: item.timeframe?.trim() || DEFAULT_TIMEFRAME,
          investment: Number(item.investment || 10000),
        }))
        .filter((item) => item.symbol);

      const { data, error } = await supabase.functions.invoke("admin-watchlist", {
        method: "PUT",
        body: { items: cleaned },
      });
      if (error) throw error;

      setWatchlist((data?.items || []).map((item: any) => ({
        symbol: item.symbol,
        display_name: item.display_name || "",
        timeframe: item.timeframe || DEFAULT_TIMEFRAME,
        investment: item.investment || 10000,
      })));
      toast.success("Watchlist saved");
    } catch (error: any) {
      console.error("Failed to save watchlist:", error);
      toast.error(error?.message || "Failed to save watchlist");
    } finally {
      setSavingWatchlist(false);
    }
  };

  const generateNow = async () => {
    try {
      setGenerating(true);
      const { error } = await supabase.functions.invoke("admin-daily-board", {
        method: "POST",
        body: { action: "generate" },
      });
      if (error) throw error;
      toast.success("Analyses generated");
      await loadData();
    } catch (error: any) {
      console.error("Failed to generate analyses:", error);
      toast.error(error?.message || "Failed to generate analyses");
    } finally {
      setGenerating(false);
    }
  };

  const refreshExpired = async () => {
    try {
      setGenerating(true);
      const { error } = await supabase.functions.invoke("admin-daily-board", {
        method: "POST",
        body: { action: "refresh_expired" },
      });
      if (error) throw error;
      toast.success("Expired analyses refreshed");
      await loadData();
    } catch (error: any) {
      console.error("Failed to refresh expired analyses:", error);
      toast.error(error?.message || "Failed to refresh expired analyses");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate("/home")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Home
            </Button>
            <h1 className="text-xl md:text-2xl font-bold">Admin Daily Analyses</h1>
          </div>
          <div className="flex flex-col w-full md:w-auto md:flex-row items-stretch md:items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/users")} className="w-full md:w-auto">
              <Users className="h-4 w-4 mr-2" />
              Users
            </Button>
            <Button variant="outline" onClick={loadData} disabled={loading} className="w-full md:w-auto">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Reload
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader><CardTitle>Top 10 Symbols Watchlist</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3 grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <Label>Symbol</Label>
                <Input placeholder="AAPL" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} />
              </div>
              <div>
                <Label>Display Name</Label>
                <Input placeholder="Apple" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} />
              </div>
              <div>
                <Label>Timeframe</Label>
                <Input placeholder="1d" value={newTimeframe} onChange={(e) => setNewTimeframe(e.target.value)} />
              </div>
              <div>
                <Label>Investment</Label>
                <Input type="number" value={newInvestment} onChange={(e) => setNewInvestment(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full" variant="secondary" onClick={addWatchItem}>Add Symbol</Button>
              </div>
            </div>

            {watchlistInputs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add symbols you want admin predictions for (up to 10), then click Analyze / Generate Now.
              </p>
            )}

            {watchlistInputs.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label>Symbol #{idx + 1}</Label>
                  <Input placeholder="AAPL" value={item.symbol || ""} onChange={(e) => updateWatchInput(idx, "symbol", e.target.value)} />
                </div>
                <div>
                  <Label>Display Name</Label>
                  <Input placeholder="Apple" value={item.display_name || ""} onChange={(e) => updateWatchInput(idx, "display_name", e.target.value)} />
                </div>
                <div>
                  <Label>Timeframe</Label>
                  <Input placeholder="1d" value={item.timeframe || DEFAULT_TIMEFRAME} onChange={(e) => updateWatchInput(idx, "timeframe", e.target.value)} />
                </div>
                <div>
                  <Label>Investment</Label>
                  <Input type="number" value={item.investment || 10000} onChange={(e) => updateWatchInput(idx, "investment", e.target.value)} />
                </div>
                <div className="md:col-span-4 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => removeWatchItem(idx)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={saveWatchlist} disabled={savingWatchlist}>{savingWatchlist ? "Saving..." : "Save Watchlist"}</Button>
              <Button variant="secondary" onClick={generateNow} disabled={generating}>{generating ? "Generating..." : "Analyze / Generate Now"}</Button>
              <Button variant="outline" onClick={refreshExpired} disabled={generating}>Refresh Expired</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Current Daily Board ({boardRows.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead><TableHead>Action</TableHead><TableHead>Probability</TableHead><TableHead>Date</TableHead><TableHead>Expires</TableHead><TableHead>Refresh Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boardRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.display_name || row.symbol}</TableCell>
                    <TableCell><Badge variant={row.action_signal === "BUY" ? "default" : row.action_signal === "SELL" ? "destructive" : "secondary"}>{row.action_signal || "HOLD"}</Badge></TableCell>
                    <TableCell>{row.probability_score != null ? `${row.probability_score}%` : "-"}</TableCell>
                    <TableCell>{row.generated_for_date}</TableCell>
                    <TableCell>{new Date(row.expires_at).toLocaleString()}</TableCell>
                    <TableCell>{row.refresh_reason}</TableCell>
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
