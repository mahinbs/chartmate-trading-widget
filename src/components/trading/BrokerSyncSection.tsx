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
  portal: string;           // direct link to token-generation page
  tokenHelp: string;        // step-by-step hint shown in UI
  oauthSupported: boolean;  // true = one-click OAuth; false = manual token paste
}> = [
  {
    value: "zerodha",
    label: "Zerodha",
    color: "text-orange-400",
    portal: "https://kite.zerodha.com",
    tokenHelp: "Click 'Connect Zerodha' — you'll be taken to Zerodha login and redirected back automatically.",
    oauthSupported: true,
  },
  {
    value: "upstox",
    label: "Upstox",
    color: "text-purple-400",
    portal: "https://developer.upstox.com/apps",
    tokenHelp: "Open Upstox Developer portal → select your App → click 'Get Access Token' → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "angel",
    label: "Angel One (SmartAPI)",
    color: "text-blue-400",
    portal: "https://smartapi.angelbroking.com/token-generator",
    tokenHelp: "Open SmartAPI Token Generator → enter your Client ID + TOTP → copy the JWT token and paste here.",
    oauthSupported: false,
  },
  {
    value: "fyers",
    label: "Fyers",
    color: "text-green-400",
    portal: "https://api.fyers.in/api/v2/generate-authcode?client_id=",
    tokenHelp: "Open Fyers API portal → Dashboard → click 'Generate Token' for your app → copy access_token and paste here.",
    oauthSupported: false,
  },
  {
    value: "dhan",
    label: "Dhan",
    color: "text-teal-400",
    portal: "https://dhanhq.co/developer/apps",
    tokenHelp: "Open DhanHQ Developer → My Apps → Access Token → generate today's token and paste here.",
    oauthSupported: false,
  },
  {
    value: "aliceblue",
    label: "Alice Blue",
    color: "text-sky-400",
    portal: "https://ant.aliceblueonline.com/",
    tokenHelp: "Open ANT Web → Settings → API Settings → click 'Regenerate Session Token' → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "compositedge",
    label: "Compositedge",
    color: "text-indigo-400",
    portal: "https://compositedge.com/",
    tokenHelp: "Log in to Compositedge → API section → generate today's access token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "definedge",
    label: "Definedge",
    color: "text-yellow-400",
    portal: "https://suite.definedge.com/",
    tokenHelp: "Log in to Definedge Suite → Profile → API → generate today's access token and paste here.",
    oauthSupported: false,
  },
  {
    value: "firstock",
    label: "Firstock",
    color: "text-pink-400",
    portal: "https://connect.thefirstock.com/",
    tokenHelp: "Log in to Firstock Connect → generate today's session token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "fivepaisa",
    label: "5Paisa",
    color: "text-lime-400",
    portal: "https://dev-openapi.5paisa.com/",
    tokenHelp: "Open 5Paisa Developer portal → log in → generate today's access token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "fivepaisaxts",
    label: "5Paisa XTS",
    color: "text-lime-300",
    portal: "https://dev-openapi.5paisa.com/",
    tokenHelp: "Open 5Paisa XTS API portal → generate today's market token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "flattrade",
    label: "Flattrade",
    color: "text-orange-300",
    portal: "https://auth.flattrade.in/",
    tokenHelp: "Open Flattrade auth portal → log in → copy the access token from the redirect URL and paste here.",
    oauthSupported: false,
  },
  {
    value: "groww",
    label: "Groww",
    color: "text-emerald-400",
    portal: "https://developer.groww.in/apps",
    tokenHelp: "Open Groww Developer → your App → Generate Access Token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "ibulls",
    label: "IBULLS (Indiabulls)",
    color: "text-blue-300",
    portal: "https://indiabulls.com/",
    tokenHelp: "Log in to Indiabulls Securities API portal → generate today's session token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "iifl",
    label: "IIFL Securities",
    color: "text-amber-400",
    portal: "https://api.iiflsecurities.com/",
    tokenHelp: "Open IIFL API portal → generate today's interactive token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "indmoney",
    label: "INDmoney",
    color: "text-green-300",
    portal: "https://indmoney.com/",
    tokenHelp: "Open INDmoney Developer section → generate access token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "jainamxts",
    label: "Jainam XTS",
    color: "text-violet-400",
    portal: "https://jainam.in/",
    tokenHelp: "Log in to Jainam XTS API portal → generate today's market + interactive token → paste here.",
    oauthSupported: false,
  },
  {
    value: "kotak",
    label: "Kotak Neo",
    color: "text-red-300",
    portal: "https://napi.kotaksecurities.com/",
    tokenHelp: "Open Kotak Neo API portal → generate today's token using your Mobile + MPIN + TOTP → paste here.",
    oauthSupported: false,
  },
  {
    value: "motilal",
    label: "Motilal Oswal",
    color: "text-yellow-300",
    portal: "https://openapi.motilaloswal.com/",
    tokenHelp: "Open Motilal OpenAPI portal → log in → Dashboard → generate today's access token → paste here.",
    oauthSupported: false,
  },
  {
    value: "mstock",
    label: "mStock (Mirae Asset)",
    color: "text-cyan-400",
    portal: "https://mstock.in/",
    tokenHelp: "Open mStock API portal → log in with your Client ID + Password + TOTP → copy token and paste here.",
    oauthSupported: false,
  },
  {
    value: "nubra",
    label: "Nubra (Angel Arc)",
    color: "text-fuchsia-400",
    portal: "https://smartapi.angelbroking.com/",
    tokenHelp: "Open Angel SmartAPI → generate today's token using TOTP → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "paytm",
    label: "Paytm Money",
    color: "text-blue-400",
    portal: "https://developer.paytmmoney.com/",
    tokenHelp: "Open Paytm Money Developer → Apps → Authorize → copy the access token from the URL and paste here.",
    oauthSupported: false,
  },
  {
    value: "pocketful",
    label: "Pocketful",
    color: "text-rose-400",
    portal: "https://pocketful.in/developer",
    tokenHelp: "Open Pocketful Developer portal → OAuth → generate today's access token → paste here.",
    oauthSupported: false,
  },
  {
    value: "samco",
    label: "SAMCO",
    color: "text-teal-300",
    portal: "https://developers.samco.in/",
    tokenHelp: "Open SAMCO Developer portal → login API → generate session token using your Year of Birth → paste here.",
    oauthSupported: false,
  },
  {
    value: "shoonya",
    label: "Shoonya (Finvasia)",
    color: "text-green-400",
    portal: "https://shoonya.finvasia.com/",
    tokenHelp: "Open Shoonya web portal → log in with User ID + Password + TOTP → copy session token and paste here.",
    oauthSupported: false,
  },
  {
    value: "tradejini",
    label: "Tradejini",
    color: "text-orange-400",
    portal: "https://api.tradejini.com/",
    tokenHelp: "Open Tradejini API portal → generate today's access token using your credentials → paste here.",
    oauthSupported: false,
  },
  {
    value: "wisdom",
    label: "Wisdom Capital",
    color: "text-amber-300",
    portal: "https://wisdomcapital.in/",
    tokenHelp: "Open Wisdom Capital API portal → generate today's session token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "zebu",
    label: "Zebu",
    color: "text-sky-300",
    portal: "https://in.zebuetrade.com/",
    tokenHelp: "Open Zebu API portal → log in with User ID + Password + TOTP → copy access token and paste here.",
    oauthSupported: false,
  },
  {
    value: "dhan_sandbox",
    label: "Dhan (Sandbox)",
    color: "text-zinc-400",
    portal: "https://dhanhq.co/developer/apps",
    tokenHelp: "Dhan sandbox — open DhanHQ Developer → Sandbox → copy test access token and paste here.",
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
                <div className="space-y-2">
                  <Button
                    onClick={() => setShowPaste(true)}
                    variant="outline"
                    className="w-full border-zinc-700 hover:bg-zinc-800 font-bold"
                    disabled={!brokerKey}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {fresh ? `Re-sync ${brokerInfo.label} Token` : `Connect ${brokerInfo.label}`}
                  </Button>
                  {brokerKey && (
                    <a
                      href={brokerInfo.portal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-teal-400 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open {brokerInfo.label} portal to get today's token
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Step guide */}
                  <div className="bg-zinc-800/60 rounded-lg p-3 space-y-1.5 border border-zinc-700/50">
                    <p className="text-[11px] font-semibold text-zinc-300 mb-2">
                      How to connect {brokerInfo.label}
                    </p>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">{brokerInfo.tokenHelp}</p>
                    <a
                      href={brokerInfo.portal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 font-medium mt-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open {brokerInfo.label} portal →
                    </a>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-teal-400" />
                      Paste today's access token
                    </Label>
                    <Input
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="Paste your access token here…"
                      className="bg-zinc-800 border-zinc-700 text-white font-mono text-xs placeholder:text-zinc-600"
                      autoFocus
                    />
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
