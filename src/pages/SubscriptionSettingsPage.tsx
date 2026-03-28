import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  CreditCard,
  ExternalLink,
  Gift,
  Loader2,
  Minus,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscription } from "@/hooks/useSubscription";
import {
  isMidTierEligibleForProOnlyUpgrade,
  planAllowsAlgo,
  planAllowsAnalysis,
} from "@/lib/subscriptionEntitlements";
import { createBillingPortalSession, hasActiveSubscription } from "@/services/stripeService";
import { cn } from "@/lib/utils";

function planLabel(planId: string | undefined): string {
  switch (planId) {
    case "botIntegration":
      return "Bot — AI auto trading";
    case "probIntelligence":
      return "Probability — analysis & paper";
    case "proPlan":
      return "Pro — full platform";
    default:
      return planId ? `Plan: ${planId}` : "No active plan";
  }
}

function planPriceHint(planId: string | undefined): string {
  switch (planId) {
    case "botIntegration":
      return "$49 / year";
    case "probIntelligence":
      return "$99 / year";
    case "proPlan":
      return "$129 / year";
    default:
      return "";
  }
}

function FeatureRow({
  included,
  title,
  description,
}: {
  included: boolean;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3.5 py-3 border-b border-border/60 last:border-0 first:pt-0">
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          included
            ? "bg-primary/15 text-primary"
            : "bg-muted/80 text-muted-foreground",
        )}
      >
        {included ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Minus className="h-4 w-4" />}
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function SubscriptionSettingsPage() {
  const { subscription, loading, manualFullAccessBypass } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

  const paid = hasActiveSubscription(subscription);
  const planId = subscription?.plan_id;
  const showProPortalCta = paid && isMidTierEligibleForProOnlyUpgrade(planId);
  const periodEnd = subscription?.current_period_end
    ? format(new Date(subscription.current_period_end), "PPP")
    : null;

  const manualStripeProfile = Boolean(
    subscription?.stripe_customer_id?.startsWith("cus_manual_exc_"),
  );
  const noBillingPortal = manualFullAccessBypass || manualStripeProfile;

  const openPortal = async () => {
    setPortalLoading(true);
    const r = await createBillingPortalSession(`${window.location.origin}/subscription`);
    setPortalLoading(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    window.location.href = r.url;
  };

  return (
    <DashboardShellLayout>
      <div className="mx-auto max-w-3xl space-y-8 pb-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Billing & access
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Subscription{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-teal-300">
                & billing
              </span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground leading-relaxed">
              See what your plan includes, open Stripe&apos;s secure portal to manage payment and
              renewal, or compare plans if you&apos;re not subscribed yet.
            </p>
          </div>
        </header>

        <Card className="overflow-hidden border-border/80 bg-card/50 shadow-sm shadow-black/20">
          <CardHeader className="space-y-4 border-b border-border/60 bg-gradient-to-br from-card via-card to-primary/5 pb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Current plan
                </CardTitle>
                {loading ? (
                  <div className="space-y-2 pt-1">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-full max-w-md" />
                  </div>
                ) : paid ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">
                        {planLabel(planId)}
                      </span>
                      {planPriceHint(planId) && (
                        <Badge variant="secondary" className="font-normal">
                          {planPriceHint(planId)}
                        </Badge>
                      )}
                      {noBillingPortal && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-primary/40 bg-primary/10 font-normal text-primary"
                        >
                          <Gift className="h-3 w-3" />
                          Complimentary
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-sm text-muted-foreground">
                      Your active subscription controls which trading and analysis features are
                      unlocked in the app.
                    </CardDescription>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium text-foreground">No active subscription</p>
                    <CardDescription className="text-sm leading-relaxed">
                      Subscribe to unlock AI analysis, paper trading, and (on Bot or Pro) live algo
                      execution. Pick a plan that matches how you trade.
                    </CardDescription>
                  </>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            {!loading && paid && (
              <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-1">
                <FeatureRow
                  included={planAllowsAnalysis(planId)}
                  title="AI analysis & paper hub"
                  description="New Analysis, saved analyses, intraday views, and paper-trade performance — included on Probability ($99) and Pro ($129)."
                />
                <FeatureRow
                  included={planAllowsAlgo(planId)}
                  title="Live algo / OpenAlgo"
                  description="Broker-linked execution and the live trading dashboard — included on Bot ($49) and Pro ($129), not on Probability alone."
                />
                {periodEnd && (
                  <div className="flex gap-3.5 py-3 items-start">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Current period</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Renews or ends on{" "}
                        <span className="font-medium text-foreground">{periodEnd}</span>
                        {subscription?.cancel_at_period_end ? (
                          <span className="block mt-2 text-amber-600 dark:text-amber-400">
                            Auto-renew is off — you keep access until that date, then the plan ends
                            unless you turn renewal back on in the portal.
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loading && !paid && (
              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center sm:text-left">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary sm:mx-0">
                  <Bot className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-foreground">Ready when you are</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-lg mx-auto sm:mx-0">
                  All plans are billed annually through Stripe. You can change or cancel later from
                  the billing portal.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {paid && !noBillingPortal && (
                <Button
                  type="button"
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {portalLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Open billing portal
                </Button>
              )}
              {paid && noBillingPortal && (
                <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-4 py-3 w-full sm:max-w-md">
                  This account uses <span className="font-medium text-foreground">complimentary</span>{" "}
                  access. There is no Stripe customer portal — billing is managed internally.
                </p>
              )}
              {!paid && (
                <>
                  <Button type="button" asChild className="gap-2">
                    <Link to="/pricing">
                      View plans
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to="/home">Back to dashboard</Link>
                  </Button>
                </>
              )}
            </div>

            {showProPortalCta && !noBillingPortal && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Upgrade to Pro ($129)</span> — You’re
                on a mid-tier plan. In the billing portal, switch to Pro for full analysis{" "}
                <em>and</em> live algo. Stripe can charge only the{" "}
                <strong className="text-foreground">prorated difference</strong> for the rest of your
                term when that’s enabled in your Stripe portal settings.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">How billing changes work</CardTitle>
            <CardDescription className="text-xs">
              Summary only — exact behaviour depends on your Stripe Customer Portal configuration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="upgrade" className="border-border/60">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                  Upgrades & Pro
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4 leading-relaxed">
                  <p>
                    If you already pay for <strong className="text-foreground">Bot ($49)</strong> or{" "}
                    <strong className="text-foreground">Probability ($99)</strong>, open the billing
                    portal and move to <strong className="text-foreground">Pro ($129)</strong>. Stripe
                    can apply proration for the time left on your subscription when configured.
                  </p>
                  <p>
                    After checkout, webhooks update your <code className="text-xs">plan_id</code>{" "}
                    automatically — no need to contact support.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="downgrade" className="border-border/60">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                  Downgrades
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4 leading-relaxed">
                  <p>
                    You can schedule a move to a lower tier in the portal. Ideally the cheaper plan
                    starts only when your <strong className="text-foreground">current paid period</strong>{" "}
                    ends, so you keep full access until then — set that in Stripe (e.g. change at
                    period end / subscription schedules).
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="cancel" className="border-border/0">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">
                  Cancel & auto-renew
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4 leading-relaxed">
                  <p>
                    Turning off auto-renew means the subscription won&apos;t bill again after the
                    current term. You keep access until that end date.
                  </p>
                  <p>
                    With auto-renew on, Stripe charges at renewal and access continues for the next
                    period.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {!loading && !paid && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/70 mt-0.5" />
            <span>
              Seeing locked items in the sidebar? They unlock once an active subscription is on your
              account and the app has refreshed. If you just paid, wait a few seconds or refresh the
              page.
            </span>
          </p>
        )}
      </div>
    </DashboardShellLayout>
  );
}
