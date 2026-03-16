/**
 * PlaceOrderPanel
 *
 * Self-contained order entry form. Used both inline (right column) and as a
 * Dialog modal inside BrokerPortfolioCard.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, Clock, Info, Loader2, Search, Send,
} from "lucide-react";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────

const EXCHANGES = [
  { value: "NSE",   label: "NSE — National Stock Exchange" },
  { value: "BSE",   label: "BSE — Bombay Stock Exchange" },
  { value: "NFO",   label: "NFO — NSE Futures & Options" },
  { value: "BFO",   label: "BFO — BSE Futures & Options" },
  { value: "CDS",   label: "CDS — Currency Derivatives" },
  { value: "MCX",   label: "MCX — Multi Commodity Exchange" },
  { value: "NCDEX", label: "NCDEX — National Commodity & Derivatives" },
];

const PRODUCT_TYPES = [
  { value: "CNC",  label: "CNC — Delivery" },
  { value: "MIS",  label: "MIS — Intraday" },
  { value: "NRML", label: "NRML — F&O Carry" },
  { value: "CO",   label: "CO — Cover Order" },
  { value: "BO",   label: "BO — Bracket Order" },
];

const ORDER_TYPES = [
  { value: "MARKET", label: "MARKET" },
  { value: "LIMIT",  label: "LIMIT" },
  { value: "SL",     label: "SL — Stop-Loss" },
  { value: "SL-M",   label: "SL-M — SL Market" },
];

const QUICK_PICKS: Record<string, { symbol: string; label: string }[]> = {
  NSE: [
    { symbol: "RELIANCE",  label: "RELIANCE" },
    { symbol: "TCS",       label: "TCS" },
    { symbol: "HDFCBANK",  label: "HDFCBANK" },
    { symbol: "INFY",      label: "INFY" },
    { symbol: "SBIN",      label: "SBIN" },
  ],
  NFO: [
    { symbol: "NIFTY",     label: "NIFTY" },
    { symbol: "BANKNIFTY", label: "BANKNIFTY" },
    { symbol: "FINNIFTY",  label: "FINNIFTY" },
  ],
};

// ── Market status ─────────────────────────────────────────────────────────────

type MarketSession = "pre_market" | "open" | "post_market" | "closed" | "weekend";

interface MarketStatus {
  session: MarketSession;
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  dot: string;
}

function getISTNow() {
  const now = new Date();
  const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
  return { h: ist.getHours(), m: ist.getMinutes(), day: ist.getDay() };
}

function toMinutes(h: number, m: number) { return h * 60 + m; }
function fmtDur(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
}

function computeMarketStatus(): MarketStatus {
  const { h, m, day } = getISTNow();
  const now = toMinutes(h, m);
  const PRE = toMinutes(9, 0), MKT = toMinutes(9, 15), END = toMinutes(15, 30), POST = toMinutes(16, 0);
  if (day === 0 || day === 6) return { session: "weekend", label: "Market Closed", sublabel: "Weekend — opens Mon 9:15 AM IST", color: "text-zinc-400", bg: "bg-zinc-800/40 border-zinc-700/40", dot: "bg-zinc-500" };
  if (now < PRE)    return { session: "closed",      label: "Market Closed",     sublabel: `Pre-market starts 9:00 AM IST`,                         color: "text-zinc-400",  bg: "bg-zinc-800/40 border-zinc-700/40",   dot: "bg-zinc-500" };
  if (now < MKT)    return { session: "pre_market",  label: "Pre-Market",        sublabel: `Call auction — opens in ${fmtDur(MKT - now)}`,           color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-400" };
  if (now < END)    return { session: "open",        label: "Market Open",       sublabel: `NSE/BSE live — closes in ${fmtDur(END - now)}`,          color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", dot: "bg-green-400" };
  if (now < POST)   return { session: "post_market", label: "After-Market (AMO)", sublabel: "Orders queued & executed at next open",                 color: "text-blue-400",  bg: "bg-blue-500/10 border-blue-500/20",   dot: "bg-blue-400" };
  return { session: "closed", label: "Market Closed", sublabel: "Opens 9:00 AM IST (Mon–Fri)", color: "text-zinc-400", bg: "bg-zinc-800/40 border-zinc-700/40", dot: "bg-zinc-500" };
}

function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(computeMarketStatus);
  useEffect(() => {
    const id = setInterval(() => setStatus(computeMarketStatus()), 30000);
    return () => clearInterval(id);
  }, []);
  return status;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SymbolResult {
  symbol: string;
  description: string;
  full_symbol: string;
  exchange: string;
  type: string;
}

interface OrderForm {
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL";
  quantity: string;
  product: string;
  pricetype: string;
  price: string;
  trigger_price: string;
}

const EMPTY_ORDER: OrderForm = {
  symbol: "", exchange: "NSE", action: "BUY",
  quantity: "", product: "CNC", pricetype: "MARKET",
  price: "", trigger_price: "",
};

// ── SymbolSearchInput ─────────────────────────────────────────────────────────

function SymbolSearchInput({
  value, onChange, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (symbol: string, exchange: string) => void;
}) {
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const data: SymbolResult[] = (res.data as any[]) ?? [];
      const indian = data.filter(d => d.full_symbol?.endsWith(".NS") || d.full_symbol?.endsWith(".BO"));
      setResults(indian.slice(0, 8));
      if (indian.length > 0) setOpen(true);
    } catch { /* silent */ } finally { setSearching(false); }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 320);
  };

  const handleSelect = (item: SymbolResult) => {
    onSelect(item.symbol, item.full_symbol?.endsWith(".BO") ? "BSE" : "NSE");
    setOpen(false);
    setResults([]);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <Input
          placeholder="Search symbol…"
          value={value}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="bg-zinc-900 border-zinc-700 text-white font-mono pl-8 pr-8 uppercase"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden">
          {results.map((item, i) => (
            <button
              key={i}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800 text-left transition-colors border-b border-zinc-800 last:border-0"
              onMouseDown={() => handleSelect(item)}
            >
              <div className="min-w-0">
                <span className="font-mono text-white text-sm font-semibold">{item.symbol}</span>
                <p className="text-[11px] text-zinc-500 truncate">{item.description}</p>
              </div>
              <span className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded ml-2 shrink-0">
                {item.full_symbol?.endsWith(".BO") ? "BSE" : "NSE"}
              </span>
            </button>
          ))}
          <p className="text-[10px] text-zinc-600 px-3 py-1.5 bg-zinc-950 border-t border-zinc-800">
            For F&O, type directly (e.g. NIFTY25MARFUT)
          </p>
        </div>
      )}
    </div>
  );
}

// ── PlaceOrderPanel ───────────────────────────────────────────────────────────

/**
 * @param asModal  When true, strips the outer Card wrapper so it can be
 *                 embedded cleanly inside a Dialog.
 */
export default function PlaceOrderPanel({
  broker,
  onOrderPlaced,
  asModal = false,
}: {
  broker: string;
  onOrderPlaced: () => void;
  asModal?: boolean;
}) {
  const [order, setOrder] = useState<OrderForm>(EMPTY_ORDER);
  const [placing, setPlacing] = useState(false);
  const market = useMarketStatus();
  const brokerLabel = broker.charAt(0).toUpperCase() + broker.slice(1);

  const set = <K extends keyof OrderForm>(k: K, v: OrderForm[K]) =>
    setOrder(o => ({ ...o, [k]: v }));

  const placeOrder = async () => {
    if (!order.symbol.trim()) { toast.error("Enter a symbol"); return; }
    if (!order.quantity || parseInt(order.quantity) < 1) { toast.error("Enter a valid quantity"); return; }
    if (order.pricetype === "LIMIT" && !order.price) { toast.error("Enter limit price"); return; }
    if ((order.pricetype === "SL" || order.pricetype === "SL-M") && !order.trigger_price) {
      toast.error("Enter trigger price"); return;
    }
    setPlacing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("openalgo-place-order", {
        body: {
          symbol:        order.symbol.trim().toUpperCase(),
          exchange:      order.exchange,
          action:        order.action,
          quantity:      parseInt(order.quantity),
          product:       order.product,
          pricetype:     order.pricetype,
          price:         order.price ? parseFloat(order.price) : 0,
          trigger_price: order.trigger_price ? parseFloat(order.trigger_price) : 0,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = res.data as any;
      if (res.error || result?.error) {
        toast.error(result?.error ?? res.error?.message ?? "Order failed");
      } else {
        const oid = result?.orderid ?? result?.broker_order_id ?? "placed";
        toast.success(
          `${order.action} ${order.symbol} placed — #${String(oid).slice(-8)}`,
          { duration: 6000 }
        );
        setOrder(EMPTY_ORDER);
        setTimeout(onOrderPlaced, 1500);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Order failed");
    } finally {
      setPlacing(false);
    }
  };

  const needsLimit   = order.pricetype === "LIMIT" || order.pricetype === "SL";
  const needsTrigger = order.pricetype === "SL"    || order.pricetype === "SL-M";
  const isBuy        = order.action === "BUY";

  const body = (
    <div className="space-y-3">
      {/* Market status banner */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${market.bg}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${market.dot} ${market.session === "open" ? "animate-pulse" : ""}`} />
        <div className="min-w-0 flex-1">
          <span className={`font-semibold ${market.color}`}>{market.label}</span>
          <span className="text-zinc-500 ml-1.5 text-[11px]">{market.sublabel}</span>
        </div>
        <Clock className={`h-3.5 w-3.5 shrink-0 ${market.color}`} />
      </div>

      {/* AMO / closed notice */}
      {(market.session === "post_market" || market.session === "closed" || market.session === "weekend") && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300/80 leading-relaxed">
            {market.session === "post_market"
              ? "Market is closed. Orders placed now are AMO — they queue and execute at the next market open."
              : "Market is currently closed. Orders placed now will be treated as AMO and execute when the market opens."}
          </p>
        </div>
      )}

      {/* Pre-market notice */}
      {market.session === "pre_market" && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15 text-[11px]">
          <Info className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300/80 leading-relaxed">
            Pre-market (call auction) is active. Only limit orders at pre-market prices are accepted. Regular trading starts at 9:15 AM IST.
          </p>
        </div>
      )}

      {/* BUY / SELL toggle */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-900 rounded-lg">
        <button
          onClick={() => set("action", "BUY")}
          className={`py-2.5 rounded-md text-sm font-bold transition-all ${isBuy ? "bg-green-600 text-white shadow-lg shadow-green-900/40" : "text-zinc-500 hover:text-zinc-300"}`}
        >▲ BUY</button>
        <button
          onClick={() => set("action", "SELL")}
          className={`py-2.5 rounded-md text-sm font-bold transition-all ${!isBuy ? "bg-red-600 text-white shadow-lg shadow-red-900/40" : "text-zinc-500 hover:text-zinc-300"}`}
        >▼ SELL</button>
      </div>

      {/* Symbol search */}
      <div className="space-y-1">
        <Label className="text-zinc-500 text-[11px]">Symbol *</Label>
        <SymbolSearchInput
          value={order.symbol}
          onChange={v => set("symbol", v)}
          onSelect={(sym, exch) => setOrder(o => ({ ...o, symbol: sym, exchange: exch }))}
        />
      </div>

      {/* Quick picks */}
      {QUICK_PICKS[order.exchange] && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PICKS[order.exchange].map(q => (
            <button
              key={q.symbol}
              onClick={() => set("symbol", q.symbol)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                order.symbol === q.symbol
                  ? "bg-teal-500/20 border-teal-500/40 text-teal-300"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >{q.label}</button>
          ))}
        </div>
      )}

      {/* Exchange + Qty */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-zinc-500 text-[11px]">Exchange *</Label>
          <Select value={order.exchange} onValueChange={v => set("exchange", v)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {EXCHANGES.map(e => <SelectItem key={e.value} value={e.value} className="text-zinc-200 text-xs">{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-zinc-500 text-[11px]">Quantity *</Label>
          <Input type="number" min={1} placeholder="10" value={order.quantity}
            onChange={e => set("quantity", e.target.value)}
            className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm" />
        </div>
      </div>

      {/* Product + Order type */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-zinc-500 text-[11px]">Product</Label>
          <Select value={order.product} onValueChange={v => set("product", v)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {PRODUCT_TYPES.map(p => <SelectItem key={p.value} value={p.value} className="text-zinc-200 text-xs">{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-zinc-500 text-[11px]">Order Type</Label>
          <Select value={order.pricetype} onValueChange={v => set("pricetype", v)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {ORDER_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-zinc-200 text-xs">{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Conditional price fields */}
      {(needsLimit || needsTrigger) && (
        <div className="grid grid-cols-2 gap-2">
          {needsLimit && (
            <div className="space-y-1">
              <Label className="text-zinc-500 text-[11px]">Limit Price *</Label>
              <Input type="number" step="0.05" placeholder="2450.50" value={order.price}
                onChange={e => set("price", e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white font-mono h-9 text-sm" />
            </div>
          )}
          {needsTrigger && (
            <div className="space-y-1">
              <Label className="text-zinc-500 text-[11px]">Trigger Price *</Label>
              <Input type="number" step="0.05" placeholder="2440.00" value={order.trigger_price}
                onChange={e => set("trigger_price", e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white font-mono h-9 text-sm" />
            </div>
          )}
        </div>
      )}

      {/* Order summary strip */}
      {order.symbol && order.quantity && (
        <div className={`rounded-lg p-2.5 text-[11px] font-mono border ${
          isBuy ? "bg-green-500/5 border-green-500/20 text-green-300" : "bg-red-500/5 border-red-500/20 text-red-300"
        }`}>
          <span className="font-bold">{order.action}</span>
          {" "}{order.quantity} × <span className="font-bold">{order.symbol}</span>
          {" "}· {order.exchange} · {order.product} · {order.pricetype}
          {order.price && ` @ ₹${order.price}`}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={placeOrder}
        disabled={placing || !order.symbol || !order.quantity}
        className={`w-full py-3.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
          isBuy
            ? "bg-green-600 hover:bg-green-500 active:bg-green-700 text-white shadow-lg shadow-green-900/30"
            : "bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-lg shadow-red-900/30"
        }`}
      >
        {placing ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Placing…</>
        ) : market.session === "open" ? (
          <><Send className="h-4 w-4" />{isBuy ? "▲ BUY" : "▼ SELL"} {order.symbol || "Order"}</>
        ) : (
          <><Send className="h-4 w-4" />{isBuy ? "▲ BUY" : "▼ SELL"} {order.symbol || "AMO Order"} (AMO)</>
        )}
      </button>

      <p className="text-[10px] text-center text-zinc-700">
        {market.session === "open"
          ? "Live order · executes instantly · Real money at risk"
          : "AMO order · queued · executes at next market open"}
      </p>
    </div>
  );

  if (asModal) return body;

  return (
    <Card className="bg-zinc-950 border border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
          <Send className="h-3.5 w-3.5 text-teal-400" />
          Place Order
          <span className="ml-auto text-[10px] text-zinc-600 font-normal">via {brokerLabel}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {body}
      </CardContent>
    </Card>
  );
}
