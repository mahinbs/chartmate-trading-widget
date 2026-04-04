import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
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
  Zap,
  Shield,
  HelpCircle,
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
import { planIdToDisplayName } from "@/lib/referredUserPlanDisplay";

function planLabel(planId: string | undefined): string {
  if (!planId) return "No active plan";
  return planIdToDisplayName(planId);
}

function planPriceHint(planId: string | undefined): string {
  switch (planId) {
    case "starterPlan":
      return "$49 / month";
    case "growthPlan":
      return "$99 / month";
    case "professionalPlan":
      return "$199 / month";
    case "botIntegration":
      return "Legacy — Bot tier";
    case "probIntelligence":
      return "Legacy — Probability tier";
    case "proPlan":
      return "Legacy — Pro tier";
    default:
      return "";
  }
}

function FeatureTile({
  included,
  title,
  description,
}: {
  included: boolean;
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-4 transition-colors",
        included
          ? "border-primary/25 bg-gradient-to-br from-primary/[0.08] via-transparent to-teal-500/[0.04] hover:border-primary/35"
          : "border-border/60 bg-muted/10 opacity-80",
      )}
    >
      <div className="flex gap-3.5">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-inner",
            included
              ? "bg-primary/20 text-primary ring-1 ring-primary/30"
              : "bg-muted/60 text-muted-foreground",
          )}
        >
          {included ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Minus className="h-5 w-5" />}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
      {included && (
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      )}
    </div>
  );
}

export default function SubscriptionSettingsPage() {
  const { subscription, loading, manualFullAccessBypass, hasBillingIssue } = useSubscription();
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
      <div className="relative mx-auto max-w-5xl pb-16 pt-14 lg:pt-6">
        {/* ambient */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-none opacity-40"
          aria-hidden
        >
          <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-primary/20 blur-[100px]" />
          <div className="absolute right-0 top-48 h-64 w-64 rounded-full bg-teal-500/15 blur-[90px]" />
        </div>

        <header className="mb-10 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary shadow-sm shadow-primary/10">
            <Sparkles className="h-3.5 w-3.5" />
            Billing & access
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Subscription{" "}
              <span className="bg-gradient-to-r from-primary via-teal-400 to-cyan-300 bg-clip-text text-transparent">
                & billing
              </span>
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Your plan controls analysis, paper trading, and live algo. Manage payment and renewal
              securely through Stripe whenever you need to.
            </p>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="space-y-6">
            <Card className="overflow-hidden border border-white/10 bg-zinc-950/60 shadow-2xl shadow-black/40 ring-1 ring-primary/10 backdrop-blur-sm">
              <CardHeader className="relative space-y-0 border-b border-white/5 bg-gradient-to-br from-zinc-900/90 via-zinc-950 to-primary/[0.07] px-6 py-8 sm:px-8">
                <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/4 -translate-y-1/4 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-4">
                    <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-muted-foreground">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                        <CreditCard className="h-5 w-5" />
                      </span>
                      Current plan
                    </CardTitle>
                    {loading ? (
                      <div className="space-y-3 pt-1">
                        <Skeleton className="h-8 w-56 rounded-lg" />
                        <Skeleton className="h-4 w-full max-w-md rounded-md" />
                      </div>
                    ) : paid ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            {planLabel(planId)}
                          </span>
                          {planPriceHint(planId) && (
                            <Badge className="border-0 bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/25">
                              {planPriceHint(planId)}
                            </Badge>
                          )}
                          {noBillingPortal && (
                            <Badge
                              variant="outline"
                              className="gap-1.5 border-primary/40 bg-primary/10 font-medium text-primary"
                            >
                              <Gift className="h-3.5 w-3.5" />
                              Complimentary
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                          Your active subscription controls which trading and analysis features are
                          unlocked. Plans renew monthly through Stripe unless you cancel.
                        </CardDescription>
                      </>
                    ) : hasBillingIssue && subscription ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            {planLabel(planId)}
                          </span>
                          <Badge className="border-0 bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            Past due — access paused
                          </Badge>
                        </div>
                        <CardDescription className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                          Update your payment method in Stripe&apos;s billing portal. When the charge
                          succeeds, access turns back on automatically.
                        </CardDescription>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-semibold text-foreground">No active subscription</p>
                        <CardDescription className="max-w-lg text-sm leading-relaxed">
                          Subscribe to unlock AI analysis, paper trading, and live algo execution on
                          Starter, Growth, or Professional. Pick a plan that matches how you trade.
                        </CardDescription>
                      </>
                    )}
                  </div>
                  {!loading && (paid || (hasBillingIssue && subscription)) && !noBillingPortal && (
                    <Button
                      type="button"
                      size="lg"
                      onClick={openPortal}
                      disabled={portalLoading}
                      className={`shrink-0 gap-2 rounded-xl px-6 font-semibold shadow-lg transition ${
                        hasBillingIssue && !paid
                          ? "bg-amber-600 text-white shadow-amber-900/30 hover:bg-amber-500"
                          : "bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/35"
                      }`}
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      Open billing portal
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-6 px-6 py-8 sm:px-8">
                {!loading && hasBillingIssue && subscription && !noBillingPortal && (
                  <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Payment failed or past due</p>
                          <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
                            Stripe could not charge your card for the latest renewal. Premium access is
                            paused until payment succeeds. Open the billing portal to update your
                            payment method or retry.
                          </p>
                          {subscription.payment_failed_at ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Last failed charge notice:{" "}
                              {format(new Date(subscription.payment_failed_at), "PPp")}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">
                            Plan on file: <span className="font-medium text-foreground">{planLabel(planId)}</span>
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        onClick={openPortal}
                        disabled={portalLoading}
                        className="shrink-0 gap-2 rounded-xl bg-amber-600 px-6 font-semibold text-white hover:bg-amber-500"
                      >
                        {portalLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                        Fix payment in portal
                      </Button>
                    </div>
                  </div>
                )}

                {!loading && paid && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FeatureTile
                        included={planAllowsAnalysis(planId)}
                        title="AI analysis & paper hub"
                        description="New Analysis, saved analyses, intraday, and paper-trade performance — on Probability and Pro."
                      />
                      <FeatureTile
                        included={planAllowsAlgo(planId)}
                        title="Live algo / OpenAlgo"
                        description="Broker-linked execution and the live trading dashboard — included on all paid tiers (legacy Probability-only plans excepted)."
                      />
                    </div>

                    {periodEnd && (
                      <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.12] via-primary/[0.06] to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary ring-1 ring-primary/30">
                            <CalendarDays className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary/90">
                              Billing period
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              Renews or ends on{" "}
                              <span className="text-primary">{periodEnd}</span>
                            </p>
                            {subscription?.cancel_at_period_end ? (
                              <p className="mt-2 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
                                Auto-renew is off — you keep access until that date unless you turn
                                renewal back on in the portal.
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="hidden h-10 w-px shrink-0 bg-primary/20 sm:block" />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:max-w-[200px] sm:text-right">
                          <Shield className="h-4 w-4 shrink-0 text-primary/70" />
                          <span>Payments and cards are managed securely by Stripe.</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!loading && !paid && !hasBillingIssue && (
                  <div className="rounded-2xl border border-dashed border-primary/35 bg-gradient-to-br from-primary/[0.08] to-transparent p-8 text-center sm:text-left">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary ring-1 ring-primary/30 sm:mx-0">
                      <Bot className="h-7 w-7" />
                    </div>
                    <p className="text-base font-semibold text-foreground">Ready when you are</p>
                    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground sm:mx-0">
                      Plans bill monthly through Stripe with auto-renewal. Use the billing portal anytime
                      to change plans, cancel auto-renew, or update your card.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {paid && noBillingPortal && (
                    <div className="flex w-full items-start gap-3 rounded-2xl border border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
                      <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <p>
                        This account uses{" "}
                        <span className="font-semibold text-foreground">complimentary</span> access.
                        There is no Stripe customer portal — billing is managed internally.
                      </p>
                    </div>
                  )}
                  {!paid && !hasBillingIssue && (
                    <>
                      <Button type="button" size="lg" asChild className="gap-2 rounded-xl font-semibold">
                        <Link to="/pricing">
                          View plans
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button type="button" variant="outline" size="lg" asChild className="rounded-xl">
                        <Link to="/home">Back to dashboard</Link>
                      </Button>
                    </>
                  )}
                  {!paid && hasBillingIssue && subscription && !noBillingPortal && (
                    <Button type="button" variant="outline" size="lg" asChild className="rounded-xl">
                      <Link to="/home">Back to dashboard</Link>
                    </Button>
                  )}
                </div>

                {showProPortalCta && !noBillingPortal && (
                  <div className="rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                      <Zap className="h-4 w-4 text-primary" />
                      Upgrade to Professional ($199/mo)
                    </span>
                    <p className="mt-2">
                      You&apos;re on Starter or Growth (or a legacy mid-tier). In the billing portal,
                      switch to Professional for the highest strategy limits. Stripe applies proration
                      or schedules the change for the next period depending on your{" "}
                      <strong className="text-foreground">Stripe Customer Portal</strong> and product
                      settings.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {!loading && !paid && !hasBillingIssue && (
              <p className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/80" />
                <span>
                  Seeing locked items in the sidebar? They unlock once an active subscription is on
                  your account and the app has refreshed. If you just paid, wait a few seconds or
                  refresh the page.
                </span>
              </p>
            )}
          </div>

          <aside className="lg:sticky lg:top-6">
            <Card className="overflow-hidden border border-white/10 bg-zinc-950/50 shadow-xl shadow-black/30 ring-1 ring-white/5">
              <CardHeader className="border-b border-white/5 bg-zinc-900/40 px-5 py-5">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base font-semibold">How billing works</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      Summary — exact behaviour depends on your Stripe Customer Portal.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-2">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="upgrade" className="border-border/50 px-3">
                    <AccordionTrigger className="py-4 text-sm font-semibold hover:no-underline hover:text-primary">
                      Upgrades & changes
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        Use <strong className="text-foreground">Open billing portal</strong> to move
                        between <strong className="text-foreground">Starter</strong>,{" "}
                        <strong className="text-foreground">Growth</strong>, and{" "}
                        <strong className="text-foreground">Professional</strong>. Whether the new price
                        starts immediately with proration or at the next renewal is controlled in{" "}
                        <strong className="text-foreground">Stripe Dashboard</strong> (Customer Portal
                        + subscription settings).
                      </p>
                      <p>
                        After checkout or portal changes, Stripe webhooks update your{" "}
                        <code className="text-xs">plan_id</code> in the app automatically.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="downgrade" className="border-border/50 px-3">
                    <AccordionTrigger className="py-4 text-sm font-semibold hover:no-underline hover:text-primary">
                      Downgrades
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        You can schedule a move to a lower tier in the portal. Ideally the cheaper plan
                        starts only when your{" "}
                        <strong className="text-foreground">current paid period</strong> ends, so you
                        keep full access until then — set that in Stripe (e.g. change at period end /
                        subscription schedules).
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="cancel" className="border-border/50 px-3">
                    <AccordionTrigger className="py-4 text-sm font-semibold hover:no-underline hover:text-primary">
                      Cancel & auto-renew
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        <strong className="text-foreground">Cancel subscription</strong> is done in the
                        same Stripe Customer Portal (not inside ChartMate). You can turn off auto-renew
                        or cancel outright depending on what your portal is configured to offer.
                      </p>
                      <p>
                        Turning off auto-renew usually keeps access until the end of the{" "}
                        <strong className="text-foreground">current billing period</strong>. When a
                        renewal charge succeeds, access continues for the next month.
                      </p>
                      <p>
                        If a renewal payment fails, Stripe marks the subscription{" "}
                        <strong className="text-foreground">past_due</strong> and this app pauses
                        premium access until you fix the card in the portal.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </DashboardShellLayout>
  );
}
