/**
 * BrokerSyncSection
 *
 * Shows the user's current broker connection status and lets them
 * sync their daily broker token — all from within ChartMate.
 *
 * Each broker generates a session token valid for ONE trading day (expires midnight IST).
 * Users must re-sync each morning before trading.
 *
 * Supports all 30 brokers available in OpenAlgo.
 * For Zerodha: OAuth button → Zerodha login → OpenAlgo callback → token saved.
 * For all others: Paste today's access token directly.
 *
 * From the user's POV this is "Connect to ChartMate" — they never see OpenAlgo.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getTradingIntegration,
  UserTradingIntegration,
} from "@/services/openalgoIntegrationService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ── All 30 OpenAlgo brokers ───────────────────────────────────────────────────

export const ALL_BROKERS: Array<{
  value: string;
  label: string;
  color: string;
  portal: string;
  tokenHelp: string;
  oauthSupported: boolean;
}> = [
  {
    value: "zerodha",
    label: "Zerodha",
    color: "text-orange-400",
    portal: "https://kite.zerodha.com/connect/login",
    tokenHelp: "Log in to kite.zerodha.com → Console → API → generate access token",
    oauthSupported: true,
  },
  {
    value: "upstox",
    label: "Upstox",
    color: "text-purple-400",
    portal: "https://developer.upstox.com/",
    tokenHelp: "Log in to developer.upstox.com → Your Apps → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "angel",
    label: "Angel One (SmartAPI)",
    color: "text-blue-400",
    portal: "https://smartapi.angelbroking.com/",
    tokenHelp: "Log in to smartapi.angelbroking.com → Apps → generate daily JWT token",
    oauthSupported: false,
  },
  {
    value: "fyers",
    label: "Fyers",
    color: "text-green-400",
    portal: "https://myapi.fyers.in/",
    tokenHelp: "Log in to myapi.fyers.in → Dashboard → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "dhan",
    label: "Dhan",
    color: "text-teal-400",
    portal: "https://dhanhq.co/",
    tokenHelp: "Log in to dhanhq.co → My Apps → generate access token",
    oauthSupported: false,
  },
  {
    value: "aliceblue",
    label: "Alice Blue",
    color: "text-sky-400",
    portal: "https://ant.aliceblueonline.com/",
    tokenHelp: "Log in to ant.aliceblueonline.com → API Settings → generate session token",
    oauthSupported: false,
  },
  {
    value: "compositedge",
    label: "Compositedge",
    color: "text-indigo-400",
    portal: "https://compositedge.com/",
    tokenHelp: "Log in to your Compositedge account → API section → generate today's token",
    oauthSupported: false,
  },
  {
    value: "definedge",
    label: "Definedge",
    color: "text-yellow-400",
    portal: "https://definedge.com/",
    tokenHelp: "Log in to Definedge portal → API → generate access token",
    oauthSupported: false,
  },
  {
    value: "firstock",
    label: "Firstock",
    color: "text-pink-400",
    portal: "https://firstock.in/",
    tokenHelp: "Log in to firstock.in → Developer → generate session token",
    oauthSupported: false,
  },
  {
    value: "fivepaisa",
    label: "5Paisa",
    color: "text-lime-400",
    portal: "https://dev-openapi.5paisa.com/",
    tokenHelp: "Log in to dev-openapi.5paisa.com → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "fivepaisaxts",
    label: "5Paisa XTS",
    color: "text-lime-300",
    portal: "https://dev-openapi.5paisa.com/",
    tokenHelp: "Log in to 5Paisa XTS API portal → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "flattrade",
    label: "Flattrade",
    color: "text-orange-300",
    portal: "https://flattrade.in/",
    tokenHelp: "Log in to flattrade.in → API → generate session token",
    oauthSupported: false,
  },
  {
    value: "groww",
    label: "Groww",
    color: "text-emerald-400",
    portal: "https://developer.groww.in/",
    tokenHelp: "Log in to developer.groww.in → Apps → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "ibulls",
    label: "IBULLS (Indiabulls)",
    color: "text-blue-300",
    portal: "https://indiabulls.com/",
    tokenHelp: "Log in to Indiabulls API portal → generate today's session token",
    oauthSupported: false,
  },
  {
    value: "iifl",
    label: "IIFL Securities",
    color: "text-amber-400",
    portal: "https://api.iiflsecurities.com/",
    tokenHelp: "Log in to api.iiflsecurities.com → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "indmoney",
    label: "INDmoney",
    color: "text-green-300",
    portal: "https://indmoney.com/",
    tokenHelp: "Log in to INDmoney Developer → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "jainamxts",
    label: "Jainam XTS",
    color: "text-violet-400",
    portal: "https://jainam.in/",
    tokenHelp: "Log in to Jainam XTS API portal → generate session token",
    oauthSupported: false,
  },
  {
    value: "kotak",
    label: "Kotak Neo",
    color: "text-red-300",
    portal: "https://napi.kotaksecurities.com/",
    tokenHelp: "Log in to Kotak Neo API → napi.kotaksecurities.com → generate access token",
    oauthSupported: false,
  },
  {
    value: "motilal",
    label: "Motilal Oswal",
    color: "text-yellow-300",
    portal: "https://openapi.motilaloswal.com/",
    tokenHelp: "Log in to openapi.motilaloswal.com → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "mstock",
    label: "mStock (Mirae Asset)",
    color: "text-cyan-400",
    portal: "https://mstock.in/",
    tokenHelp: "Log in to mStock API portal → generate today's session token",
    oauthSupported: false,
  },
  {
    value: "nubra",
    label: "Nubra",
    color: "text-fuchsia-400",
    portal: "https://nubra.in/",
    tokenHelp: "Log in to Nubra API portal → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "paytm",
    label: "Paytm Money",
    color: "text-blue-400",
    portal: "https://developer.paytmmoney.com/",
    tokenHelp: "Log in to developer.paytmmoney.com → Apps → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "pocketful",
    label: "Pocketful",
    color: "text-rose-400",
    portal: "https://pocketful.in/",
    tokenHelp: "Log in to Pocketful API portal → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "samco",
    label: "SAMCO",
    color: "text-teal-300",
    portal: "https://developers.samco.in/",
    tokenHelp: "Log in to developers.samco.in → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "shoonya",
    label: "Shoonya (Finvasia)",
    color: "text-green-400",
    portal: "https://shoonya.com/",
    tokenHelp: "Log in to Shoonya API portal → generate today's session token",
    oauthSupported: false,
  },
  {
    value: "tradejini",
    label: "Tradejini",
    color: "text-orange-400",
    portal: "https://tradejini.com/",
    tokenHelp: "Log in to Tradejini API portal → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "wisdom",
    label: "Wisdom Capital",
    color: "text-amber-300",
    portal: "https://wisdomcapital.in/",
    tokenHelp: "Log in to Wisdom Capital API portal → generate today's session token",
    oauthSupported: false,
  },
  {
    value: "zebu",
    label: "Zebu",
    color: "text-sky-300",
    portal: "https://zebuetrade.com/",
    tokenHelp: "Log in to Zebu API portal → generate today's access token",
    oauthSupported: false,
  },
  {
    value: "dhan_sandbox",
    label: "Dhan (Sandbox)",
    color: "text-zinc-400",
    portal: "https://dhanhq.co/",
    tokenHelp: "Dhan sandbox mode — use test access token from dhanhq.co developer console",
    oauthSupported: false,
  },
];

// quick lookup by value
const BROKER_MAP = Object.fromEntries(ALL_BROKERS.map(b => [b.value, b]));
const DEFAULT_BROKER = ALL_BROKERS[0];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTokenExpired(integration: UserTradingIntegration | null): boolean {
  if (!integration?.token_expires_at) return true;
  return new Date(integration.token_expires_at).getTime() < Date.now();
}

function isTokenFresh(integration: UserTradingIntegration | null): boolean {
  if (!integration?.api_key_encrypted?.trim()) return false;
  return !isTokenExpired(integration);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  broker?: string;   // broker pre-set from algo_onboarding; if absent, user can pick
  compact?: boolean; // smaller warning banner for PredictPage
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrokerSyncSection({ broker: brokerProp, compact = false }: Props) {
  const [integration, setIntegration]     = useState<UserTradingIntegration | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [oauthLoading, setOauthLoading]   = useState(false);
  const [manualToken, setManualToken]     = useState("");
  const [showPaste, setShowPaste]         = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<string>(brokerProp ?? "");

  // resolve broker: prop > integration > user pick > first in list
  const brokerKey  = (brokerProp ?? selectedBroker ?? integration?.broker ?? "").toLowerCase();
  const brokerInfo = BROKER_MAP[brokerKey] ?? DEFAULT_BROKER;
  const fresh   = isTokenFresh(integration);
  const expired = !fresh && !!integration?.api_key_encrypted?.trim();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getTradingIntegration();
    setIntegration(data);
    if (!brokerProp && data?.broker) setSelectedBroker(data.broker);
    setLoading(false);
  }, [brokerProp]);

  useEffect(() => { load(); }, [load]);

  // ── Zerodha OAuth ─────────────────────────────────────────────────────────
  const handleZerodhaOAuth = async () => {
    setOauthLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-zerodha-login-url", {
        body: { return_url: `${window.location.origin}/broker-callback` },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = res.data as { url?: string; error?: string } | null;
      if (res.error || d?.error) { toast.error(d?.error ?? res.error?.message ?? "Could not get login URL"); return; }
      if (d?.url) window.location.href = d.url;
    } catch (e: any) {
      toast.error("Error: " + (e.message ?? "unknown"));
    } finally {
      setOauthLoading(false);
    }
  };

  // ── Manual token paste ────────────────────────────────────────────────────
  const handleSaveToken = async () => {
    if (!manualToken.trim()) { toast.error("Please paste your access token"); return; }
    if (!brokerKey) { toast.error("Please select your broker first"); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-broker-session", {
        body: { broker: brokerKey, auth_token: manualToken.trim() },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = res.data as { success?: boolean; openalgo_synced?: boolean; openalgo_note?: string } | null;
      if (res.error || !d?.success) {
        toast.error("Failed to save token: " + (res.error?.message ?? "Unknown error"));
        return;
      }
      toast.success(d.openalgo_synced
        ? `${brokerInfo.label} synced! Live orders will route through ChartMate.`
        : ("Token saved. " + (d.openalgo_note ?? "")));
      setManualToken("");
      setShowPaste(false);
      await load();
    } catch (e: any) {
      toast.error("Error: " + (e.message ?? "unknown"));
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking broker status…
      </div>
    );
  }

  // ── Compact mode (warning banner on PredictPage) ──────────────────────────
  if (compact) {
    if (fresh) {
      return (
        <div className="flex items-center gap-2 text-xs text-teal-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className={`font-semibold ${brokerInfo.color}`}>{brokerInfo.label}</span>
            {" "}connected · valid until midnight IST
          </span>
        </div>
      );
    }
    return (
      <Alert className="bg-amber-500/10 border-amber-500/40 text-amber-300 py-2.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <AlertDescription className="text-xs flex items-center justify-between gap-2 flex-wrap">
          <span>
            {expired
              ? `${brokerInfo.label} session expired. Re-sync to place live orders.`
              : "Broker not connected. Sync your broker to place live orders."}
          </span>
          <a href="/algo-setup" className="underline text-amber-300 hover:text-amber-200 font-semibold shrink-0">
            Sync Now →
          </a>
        </AlertDescription>
      </Alert>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  return (
    <Card className={`bg-zinc-900 border-zinc-800 ${fresh ? "border-teal-500/30" : expired ? "border-amber-500/30" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Link2 className="h-4 w-4 text-teal-400" />
            Daily Broker Sync
          </CardTitle>
          {fresh ? (
            <Badge className="bg-teal-500/10 text-teal-400 border border-teal-500/30 text-[10px]">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Connected Today
            </Badge>
          ) : expired ? (
            <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" /> Session Expired
            </Badge>
          ) : (
            <Badge className="bg-zinc-700 text-zinc-400 border border-zinc-600 text-[10px]">
              <Link2Off className="h-3 w-3 mr-1" /> Not Connected
            </Badge>
          )}
        </div>
        <CardDescription className="text-zinc-400 text-xs mt-1">
          Your broker session is valid for one trading day (resets midnight IST).
          Sync each morning before placing live orders.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Broker selector — shown when no broker is pre-set from onboarding */}
        {!brokerProp && (
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Select your broker</Label>
            <Select value={selectedBroker} onValueChange={setSelectedBroker}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                <SelectValue placeholder="Choose broker…" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 max-h-72 overflow-y-auto">
                {ALL_BROKERS.map((b) => (
                  <SelectItem key={b.value} value={b.value} className="text-zinc-200 focus:bg-zinc-800">
                    <span className={b.color}>{b.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Current connected status */}
        {fresh && integration && (
          <div className="bg-zinc-800 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500">Connected Broker</p>
              <p className={`font-semibold text-sm ${brokerInfo.color}`}>{brokerInfo.label}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Expires</p>
              <p className="text-xs text-zinc-300">
                {integration.token_expires_at
                  ? new Date(integration.token_expires_at).toLocaleString(undefined, {
                      hour: "2-digit", minute: "2-digit", hour12: true,
                    }) + " (midnight IST)"
                  : "Tonight"}
              </p>
            </div>
          </div>
        )}

        {expired && (
          <Alert className="bg-amber-500/10 border-amber-500/40 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <AlertDescription className="text-amber-300 text-xs">
              Your {brokerInfo.label} session expired. Re-sync to place live orders today.
            </AlertDescription>
          </Alert>
        )}

        {/* Action area */}
        <div className="space-y-3">
          {brokerInfo.oauthSupported ? (
            /* ── Zerodha: one-click OAuth ──────────────────────────────── */
            <>
              <Button
                onClick={handleZerodhaOAuth}
                disabled={oauthLoading}
                className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold"
              >
                {oauthLoading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting…</>
                  : <><Zap className="h-4 w-4 mr-2" />{fresh ? "Re-sync Zerodha" : "Connect Zerodha"}</>}
              </Button>
              <p className="text-[10px] text-zinc-500 text-center">
                You'll be taken to Zerodha login and redirected back automatically.
              </p>
            </>
          ) : (
            /* ── All other brokers: paste token ────────────────────────── */
            <>
              {!showPaste ? (
                <Button
                  onClick={() => setShowPaste(true)}
                  variant="outline"
                  className="w-full border-zinc-700 hover:bg-zinc-800 font-bold"
                  disabled={!brokerKey}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {fresh ? `Re-sync ${brokerInfo.label} Token` : `Connect ${brokerInfo.label}`}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-sm flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-teal-400" />
                      Today's Access Token — {brokerInfo.label}
                    </Label>
                    <Input
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="Paste your daily access token here"
                      className="bg-zinc-800 border-zinc-700 text-white font-mono text-xs placeholder:text-zinc-600"
                      autoFocus
                    />
                    <p className="text-[10px] text-zinc-500">{brokerInfo.tokenHelp}</p>
                    <a
                      href={brokerInfo.portal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1 w-fit"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open {brokerInfo.label} portal
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => { setShowPaste(false); setManualToken(""); }}
                      className="border-zinc-700 hover:bg-zinc-800 flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveToken}
                      disabled={saving || !manualToken.trim()}
                      className="bg-teal-500 hover:bg-teal-400 text-black font-bold flex-1"
                    >
                      {saving
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
                        : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Save & Connect</>}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-[10px] text-zinc-600 text-center">
          Your token is stored securely and only used to route orders from ChartMate to your broker.
        </p>
      </CardContent>
    </Card>
  );
}
