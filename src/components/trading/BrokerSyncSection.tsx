/**
 * BrokerSyncSection
 *
 * Shows the user's current broker connection status and lets them
 * sync their daily broker token — all from within ChartMate.
 *
 * Each broker generates a session token valid for ONE trading day (expires midnight IST).
 * Users must re-sync each morning before trading.
 *
 * For Zerodha: OAuth button → Zerodha login → OpenAlgo callback → token saved.
 * For others: Paste today's access token directly.
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

const BROKER_LABELS: Record<string, { label: string; color: string; oauthSupported: boolean }> = {
  zerodha:  { label: "Zerodha",   color: "text-orange-400",  oauthSupported: true  },
  upstox:   { label: "Upstox",    color: "text-purple-400",  oauthSupported: false },
  angel:    { label: "Angel One", color: "text-blue-400",    oauthSupported: false },
  fyers:    { label: "Fyers",     color: "text-green-400",   oauthSupported: false },
  dhan:     { label: "Dhan",      color: "text-teal-400",    oauthSupported: false },
  other:    { label: "Broker",    color: "text-zinc-400",    oauthSupported: false },
};

const TOKEN_PASTE_HELP: Record<string, string> = {
  zerodha:  "Log in to kite.zerodha.com → Console → API → generate access token",
  upstox:   "Log in to upstox.com developer portal → generate today's access token",
  angel:    "Log in to angelone.in → SmartAPI dashboard → generate daily JWT token",
  fyers:    "Log in to myapi.fyers.in → generate today's access token",
  dhan:     "Log in to dhan.co → developer console → generate access token",
  other:    "Generate today's access token from your broker's API portal",
};

function isTokenExpired(integration: UserTradingIntegration | null): boolean {
  if (!integration?.token_expires_at) return true;
  return new Date(integration.token_expires_at).getTime() < Date.now();
}

function isTokenFresh(integration: UserTradingIntegration | null): boolean {
  if (!integration?.api_key_encrypted?.trim()) return false;
  return !isTokenExpired(integration);
}

interface Props {
  broker?: string;   // broker from algo_onboarding; if not set, reads from integration
  compact?: boolean; // smaller version for embedding in PredictPage sidebar
}

export default function BrokerSyncSection({ broker: brokerProp, compact = false }: Props) {
  const [integration, setIntegration]   = useState<UserTradingIntegration | null>(null);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [manualToken, setManualToken]   = useState("");
  const [showPaste, setShowPaste]       = useState(false);

  const broker = (brokerProp ?? integration?.broker ?? "other").toLowerCase();
  const brokerInfo = BROKER_LABELS[broker] ?? BROKER_LABELS.other;
  const fresh = isTokenFresh(integration);
  const expired = !fresh && !!integration?.api_key_encrypted?.trim();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getTradingIntegration();
    setIntegration(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Zerodha OAuth ─────────────────────────────────────────────────────────
  const handleZerodhaOAuth = async () => {
    setOauthLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const returnUrl = `${window.location.origin}/broker-callback`;
      const res = await supabase.functions.invoke("get-zerodha-login-url", {
        body: { return_url: returnUrl },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = res.data as { url?: string; error?: string } | null;
      if (res.error || data?.error) {
        toast.error(data?.error ?? res.error?.message ?? "Could not get login URL");
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      toast.error("Error: " + (e.message ?? "unknown"));
    } finally {
      setOauthLoading(false);
    }
  };

  // ── Manual token paste ────────────────────────────────────────────────────
  const handleSaveToken = async () => {
    if (!manualToken.trim()) {
      toast.error("Please paste your access token");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Use sync-broker-session edge function — saves to our DB AND pushes to OpenAlgo
      const res = await supabase.functions.invoke("sync-broker-session", {
        body: { broker, auth_token: manualToken.trim() },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = res.data as { success?: boolean; openalgo_synced?: boolean; openalgo_note?: string } | null;
      if (res.error || !data?.success) {
        toast.error("Failed to save token: " + (res.error?.message ?? "Unknown error"));
        return;
      }
      if (data.openalgo_synced) {
        toast.success("Broker synced! Orders will route live through ChartMate.");
      } else {
        toast.success("Token saved. " + (data.openalgo_note ?? ""));
      }
      setManualToken("");
      setShowPaste(false);
      await load();
    } catch (e: any) {
      toast.error("Error: " + (e.message ?? "unknown"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking broker status…
      </div>
    );
  }

  // ── Compact mode (for PredictPage warning banner) ─────────────────────────
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
              : `${brokerInfo.label} not connected. Sync your broker to place live orders.`}
          </span>
          <a
            href="/algo-setup"
            className="underline text-amber-300 hover:text-amber-200 font-semibold shrink-0"
          >
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
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected Today
            </Badge>
          ) : expired ? (
            <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Session Expired
            </Badge>
          ) : (
            <Badge className="bg-zinc-700 text-zinc-400 border border-zinc-600 text-[10px]">
              <Link2Off className="h-3 w-3 mr-1" />
              Not Connected
            </Badge>
          )}
        </div>
        <CardDescription className="text-zinc-400 text-xs mt-1">
          Your broker session is valid for one trading day (resets midnight IST).
          Sync each morning before placing orders.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current status */}
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

        {/* Action buttons */}
        <div className="space-y-3">
          {brokerInfo.oauthSupported ? (
            <>
              <Button
                onClick={handleZerodhaOAuth}
                disabled={oauthLoading}
                className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold"
              >
                {oauthLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting…</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" />{fresh ? "Re-sync Zerodha" : "Connect Zerodha"}</>
                )}
              </Button>
              <p className="text-[10px] text-zinc-500 text-center">
                You'll be taken to Zerodha login and redirected back automatically.
                ChartMate handles everything — you never see OpenAlgo.
              </p>
            </>
          ) : (
            <>
              {!showPaste ? (
                <Button
                  onClick={() => setShowPaste(true)}
                  variant="outline"
                  className="w-full border-zinc-700 hover:bg-zinc-800 font-bold"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {fresh ? `Re-sync ${brokerInfo.label} Token` : `Connect ${brokerInfo.label}`}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-sm flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-teal-400" />
                      Today's Access Token
                    </Label>
                    <Input
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="Paste your daily access token here"
                      className="bg-zinc-800 border-zinc-700 text-white font-mono text-xs placeholder:text-zinc-600"
                      autoFocus
                    />
                    <p className="text-[10px] text-zinc-500">
                      {TOKEN_PASTE_HELP[broker] ?? TOKEN_PASTE_HELP.other}
                    </p>
                    <a
                      href={`https://${broker === "upstox" ? "upstox.com" : broker === "angel" ? "angelone.in" : broker === "fyers" ? "myapi.fyers.in" : broker === "dhan" ? "dhan.co" : "kite.zerodha.com"}`}
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
                      variant="outline"
                      size="sm"
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
                      {saving ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
                      ) : (
                        <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Save & Connect</>
                      )}
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
