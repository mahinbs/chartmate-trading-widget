/**
 * BrokerPortfolioCard
 *
 * Live broker account data from OpenAlgo:
 *   - Funds / cash balance
 *   - Open positions (intraday) with Close Position button
 *   - Holdings (long-term)
 *   - Orders with Cancel / Modify buttons
 *   - Cancel All Orders + Close All Positions panic buttons
 *
 * All data looks like ChartMate's own — OpenAlgo is invisible.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3,
  Briefcase, ClipboardList, Loader2, RefreshCw, Wallet, X, Pencil, Zap,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortfolioData {
  broker: string | null;
  token_expires_at: string | null;
  token_expired: boolean;
  funds: Record<string, unknown> | null;
  positions: PositionRow[];
  holdings: HoldingRow[];
  orders: OrderRow[];
  errors: Record<string, string | null>;
}

interface PositionRow {
  tradingsymbol?: string; exchange?: string; product?: string;
  netqty?: number; avgprice?: number; ltp?: number; pnl?: number;
  [key: string]: unknown;
}

interface HoldingRow {
  tradingsymbol?: string; exchange?: string; quantity?: number;
  avgprice?: number; ltp?: number; pnl?: number;
  [key: string]: unknown;
}

interface OrderRow {
  orderid?: string; tradingsymbol?: string; exchange?: string;
  transactiontype?: string; quantity?: number; averageprice?: number;
  price?: number; product?: string; pricetype?: string;
  status?: string; updatetime?: string; ordertime?: string;
  rejectreason?: string;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BROKER_LABELS: Record<string, string> = {
  zerodha: "Zerodha", upstox: "Upstox", angel: "Angel One",
  fyers: "Fyers", dhan: "Dhan",
};

const CANCELLABLE = ["open", "pending", "trigger pending", "after market order req received"];

function fmt(v: number | undefined | null) {
  if (v == null || isNaN(Number(v))) return "—";
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PnlCell({ value }: { value: number | undefined | null }) {
  const n = Number(value ?? 0);
  if (!n || isNaN(n)) return <span className="text-zinc-500">—</span>;
  if (Math.abs(n) < 0.005) return <span className="text-zinc-400">₹0.00</span>;
  return (
    <span className={n > 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
      {n > 0 ? "+" : "−"}₹{Math.abs(n).toFixed(2)}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  const map: Record<string, string> = {
    complete:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    rejected:  "bg-red-500/20 text-red-300 border-red-500/30",
    cancelled: "bg-zinc-600/30 text-zinc-400 border-zinc-600",
    open:      "bg-blue-500/20 text-blue-300 border-blue-500/30",
    pending:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  return (
    <Badge className={`text-[10px] border ${map[s] ?? "bg-zinc-700 text-zinc-400 border-zinc-600"}`}>
      {status ?? "—"}
    </Badge>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BrokerPortfolioCard() {
  const [data, setData]           = useState<PortfolioData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null); // orderid or "all"

  // Modify order dialog state
  const [modifyOrder, setModifyOrder] = useState<OrderRow | null>(null);
  const [modifyPrice, setModifyPrice]   = useState("");
  const [modifyQty, setModifyQty]       = useState("");
  const [modifyType, setModifyType]     = useState("LIMIT");

  // ── Data loading ────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-portfolio-data", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || (res.data as any)?.error) {
        setError((res.data as any)?.error ?? res.error?.message ?? "Failed to load portfolio");
      } else {
        setData(res.data as PortfolioData);
      }
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Broker action call ──────────────────────────────────────────────────
  const doAction = useCallback(async (
    action: string,
    params: Record<string, unknown> = {},
    label: string,
  ) => {
    const key = (params.orderid as string) ?? action;
    setActioning(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("broker-order-action", {
        body: { action, ...params },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = res.data as any;
      if (res.error || d?.error) {
        toast.error(`${label} failed: ${d?.error ?? res.error?.message}`);
        return false;
      }
      toast.success(`${label} successful`);
      await load(true);
      return true;
    } catch (e: any) {
      toast.error(`${label} error: ${e.message}`);
      return false;
    } finally {
      setActioning(null);
    }
  }, [load]);

  // ── Cancel order ────────────────────────────────────────────────────────
  const handleCancel = (order: OrderRow) =>
    doAction("cancel", { orderid: order.orderid }, "Cancel order");

  // ── Modify order submit ─────────────────────────────────────────────────
  const handleModifySubmit = async () => {
    if (!modifyOrder) return;
    const ok = await doAction("modify", {
      orderid:      modifyOrder.orderid,
      symbol:       modifyOrder.tradingsymbol,
      exchange:     modifyOrder.exchange ?? "NSE",
      order_action: modifyOrder.transactiontype ?? "BUY",
      product:      modifyOrder.product ?? "CNC",
      pricetype:    modifyType,
      price:        Number(modifyPrice),
      quantity:     Number(modifyQty),
    }, "Modify order");
    if (ok) setModifyOrder(null);
  };

  // ── Close a single position ─────────────────────────────────────────────
  const handleClosePosition = async (pos: PositionRow) => {
    if (!confirm(`Close position: ${pos.tradingsymbol} (Qty ${pos.netqty})?`)) return;
    await doAction("close_all_pos", {}, `Close ${pos.tradingsymbol}`);
  };

  // ── Panic: close all positions ──────────────────────────────────────────
  const handleCloseAll = async () => {
    if (!confirm("Close ALL open positions? This cannot be undone.")) return;
    await doAction("close_all_pos", {}, "Close all positions");
  };

  // ── Panic: cancel all orders ────────────────────────────────────────────
  const handleCancelAll = async () => {
    if (!confirm("Cancel ALL open orders?")) return;
    await doAction("cancel_all", {}, "Cancel all orders");
  };

  // ── Render states ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-teal-400 mr-2" />
          <span className="text-zinc-400 text-sm">Loading your account…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const noInt = error.includes("NO_INTEGRATION") || error.includes("No active broker");
    return (
      <Alert className="bg-zinc-900 border-zinc-800">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertDescription className="text-zinc-400 text-sm">
          {noInt
            ? "Broker not connected yet. Sync your daily token above to view live account data."
            : error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const brokerLabel = BROKER_LABELS[data.broker ?? ""] ?? data.broker ?? "Broker";
  const available   = (data.funds as any)?.availablecash ?? (data.funds as any)?.net ?? (data.funds as any)?.available_cash ?? null;
  const used        = (data.funds as any)?.utiliseddebits ?? (data.funds as any)?.used_margin ?? null;
  const totalPnl    = data.positions.reduce((s, p) => s + Number(p.pnl ?? 0), 0)
                    + data.holdings.reduce((s, h) => s + Number(h.pnl ?? 0), 0);

  const openOrders  = data.orders.filter(o => CANCELLABLE.includes((o.status ?? "").toLowerCase()));
  const openPosCnt  = data.positions.filter(p => Number(p.netqty ?? 0) !== 0).length;

  return (
    <>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-teal-400" />
              {brokerLabel} Account
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {data.token_expired && (
                <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Session Expired
                </Badge>
              )}
              {/* Panic buttons */}
              {openPosCnt > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleCloseAll}
                  disabled={!!actioning}
                  className="h-7 text-[11px] px-2.5 bg-red-600/80 hover:bg-red-600"
                >
                  {actioning === "close_all_pos"
                    ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    : <Zap className="h-3 w-3 mr-1" />}
                  Close All ({openPosCnt})
                </Button>
              )}
              {openOrders.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelAll}
                  disabled={!!actioning}
                  className="h-7 text-[11px] px-2.5 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                >
                  {actioning === "cancel_all"
                    ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    : <X className="h-3 w-3 mr-1" />}
                  Cancel All Orders ({openOrders.length})
                </Button>
              )}
              <Button
                variant="ghost" size="sm"
                onClick={() => { load(true); toast.success("Refreshed"); }}
                className="h-7 w-7 p-0 text-zinc-500 hover:text-teal-400"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Balance row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-800 rounded-lg p-3 text-center">
              <p className="text-[10px] text-zinc-500 mb-1 flex items-center justify-center gap-1">
                <Wallet className="h-3 w-3" /> Available
              </p>
              <p className="font-bold text-sm text-white">{fmt(Number(available))}</p>
            </div>
            <div className="bg-zinc-800 rounded-lg p-3 text-center">
              <p className="text-[10px] text-zinc-500 mb-1 flex items-center justify-center gap-1">
                <Briefcase className="h-3 w-3" /> Used Margin
              </p>
              <p className="font-bold text-sm text-white">{fmt(Number(used))}</p>
            </div>
            <div className="bg-zinc-800 rounded-lg p-3 text-center">
              <p className="text-[10px] text-zinc-500 mb-1">Today's P/L</p>
              <p className="font-bold text-sm"><PnlCell value={totalPnl} /></p>
            </div>
          </div>
          <p className="text-[10px] text-zinc-600 text-center -mt-1">
            To add funds, open your {brokerLabel} app directly. Balance updates here automatically.
          </p>

          {/* Tabs */}
          <Tabs defaultValue="positions">
            <TabsList className="bg-zinc-800 border border-zinc-700 h-8 w-full">
              <TabsTrigger value="positions" className="text-xs flex-1 h-6 data-[state=active]:bg-teal-500 data-[state=active]:text-black">
                <ArrowUpRight className="h-3 w-3 mr-1" />
                Positions ({data.positions.length})
              </TabsTrigger>
              <TabsTrigger value="holdings" className="text-xs flex-1 h-6 data-[state=active]:bg-teal-500 data-[state=active]:text-black">
                <Briefcase className="h-3 w-3 mr-1" />
                Holdings ({data.holdings.length})
              </TabsTrigger>
              <TabsTrigger value="orders" className="text-xs flex-1 h-6 data-[state=active]:bg-teal-500 data-[state=active]:text-black">
                <ClipboardList className="h-3 w-3 mr-1" />
                Orders ({data.orders.length})
              </TabsTrigger>
            </TabsList>

            {/* ── Positions ─────────────────────────────────────────── */}
            <TabsContent value="positions" className="mt-3">
              {data.positions.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-6">No open positions today</p>
              ) : (
                <div className="space-y-2">
                  {data.positions.map((p, i) => {
                    const hasQty = Number(p.netqty ?? 0) !== 0;
                    const isClosing = actioning === `close_${p.tradingsymbol}`;
                    return (
                      <div key={i} className="bg-zinc-800 rounded-lg p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{p.tradingsymbol}</p>
                          <p className="text-[10px] text-zinc-500">
                            {p.exchange} · {p.product} · Qty: {p.netqty} · Avg {fmt(Number(p.avgprice))}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PnlCell value={Number(p.pnl)} />
                          {hasQty && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleClosePosition(p)}
                              disabled={!!actioning}
                              className="h-6 text-[10px] px-2 bg-red-600/80 hover:bg-red-600"
                            >
                              {isClosing
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : "Close"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── Holdings ──────────────────────────────────────────── */}
            <TabsContent value="holdings" className="mt-3">
              {data.holdings.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-6">No holdings found</p>
              ) : (
                <div className="space-y-2">
                  {data.holdings.map((h, i) => (
                    <div key={i} className="bg-zinc-800 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-white">{h.tradingsymbol}</p>
                        <p className="text-[10px] text-zinc-500">{h.exchange} · Qty: {h.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-400">Avg {fmt(Number(h.avgprice))}</p>
                        <PnlCell value={Number(h.pnl)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Orders ────────────────────────────────────────────── */}
            <TabsContent value="orders" className="mt-3">
              {data.orders.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-6">No orders today</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                  {data.orders.slice(0, 60).map((o, i) => {
                    const canCancel = CANCELLABLE.includes((o.status ?? "").toLowerCase());
                    const isCancelling = actioning === o.orderid;
                    return (
                      <div key={i} className="bg-zinc-800 rounded-lg p-3 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {(o.transactiontype ?? "").toUpperCase() === "BUY"
                              ? <ArrowUpRight className="h-3 w-3 text-emerald-400 shrink-0" />
                              : <ArrowDownRight className="h-3 w-3 text-red-400 shrink-0" />}
                            <p className="font-semibold text-sm text-white truncate">{o.tradingsymbol}</p>
                          </div>
                          <p className="text-[10px] text-zinc-500">
                            {o.transactiontype} · Qty {o.quantity}
                            {o.averageprice ? ` · @${fmt(Number(o.averageprice))}` : ""}
                          </p>
                          {o.rejectreason && (
                            <p className="text-[10px] text-red-400 mt-0.5 truncate">{o.rejectreason}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <StatusBadge status={o.status} />
                          {canCancel && (
                            <div className="flex gap-1">
                              {/* Modify */}
                              <Button
                                size="sm" variant="outline"
                                onClick={() => {
                                  setModifyOrder(o);
                                  setModifyPrice(String(o.price ?? o.averageprice ?? ""));
                                  setModifyQty(String(o.quantity ?? ""));
                                  setModifyType(o.pricetype ?? "LIMIT");
                                }}
                                disabled={!!actioning}
                                className="h-5 px-1.5 text-[10px] border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </Button>
                              {/* Cancel */}
                              <Button
                                size="sm" variant="destructive"
                                onClick={() => handleCancel(o)}
                                disabled={!!actioning}
                                className="h-5 px-1.5 text-[10px] bg-red-600/70 hover:bg-red-600"
                              >
                                {isCancelling
                                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  : <X className="h-2.5 w-2.5" />}
                              </Button>
                            </div>
                          )}
                          <p className="text-[10px] text-zinc-600">
                            {(o.updatetime ?? o.ordertime ?? "").slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Modify Order Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!modifyOrder} onOpenChange={(o) => !o && setModifyOrder(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Pencil className="h-4 w-4 text-blue-400" />
              Modify Order — {modifyOrder?.tradingsymbol}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Update price and/or quantity. The order must still be open/pending.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Price Type</Label>
              <div className="flex gap-2">
                {["LIMIT", "MARKET", "SL", "SL-M"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setModifyType(t)}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                      modifyType === t
                        ? "bg-teal-500 text-black border-teal-500 font-bold"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Price</Label>
                <Input
                  type="number" step="0.05" min="0"
                  value={modifyPrice}
                  onChange={(e) => setModifyPrice(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Quantity</Label>
                <Input
                  type="number" min="1" step="1"
                  value={modifyQty}
                  onChange={(e) => setModifyQty(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="1"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setModifyOrder(null)}
              className="border-zinc-700 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleModifySubmit}
              disabled={!!actioning || !modifyPrice || !modifyQty}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              {actioning === modifyOrder?.orderid
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Modifying…</>
                : <><Pencil className="h-3.5 w-3.5 mr-1.5" />Modify Order</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
