import { useState, useEffect, useMemo, useRef } from "react";
import type { CountryCode } from "libphonenumber-js";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { getSessionAffiliateAttribution } from "@/hooks/useAffiliateRef";
import { useAuthEmailCooldown } from "@/hooks/useAuthEmailCooldown";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PhoneCountryCodeCombobox } from "@/components/auth/PhoneCountryCodeCombobox";
import {
  buildE164FromNational,
  DEFAULT_SIGNUP_PHONE_ISO,
} from "@/lib/countryDialCodes";
import { PRICING_PLANS } from "@/constants/pricing";
import { premiumPlanCheckoutUrls } from "@/lib/premiumCheckoutUrls";
import { createCheckoutSession, startProTrial } from "@/services/stripeService";
import { useIsMobileApp } from "@/mobile-app/isMobileDevice";
import { WEBINAR_BATCH_DEFINITIONS } from "@/constants/webinarBatches";
import { ensureTrialAccessForUser } from "@/lib/ensureTrialAccessForUser";
import { trackFunnelEvent } from "@/lib/funnelTracking";

const VALID_PREMIUM_CHECKOUT_PLANS = new Set(PRICING_PLANS.map((p) => p.id));

function computeAgeFromIsoDate(isoDate: string): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function normalizeOtp(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

function EmailCooldownBanner({
  showTimer,
  mmss,
  generic,
}: {
  showTimer: boolean;
  mmss: string;
  generic: boolean;
}) {
  if (!showTimer && !generic) return null;
  return (
    <Alert className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-550 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-50">
      <Clock className="h-4 w-4 text-amber-700 dark:text-amber-200" />
      <AlertTitle>Please wait</AlertTitle>
      <AlertDescription>
        {showTimer ? (
          <>
            You can try again in{" "}
            <span className="font-mono text-base font-semibold tabular-nums">{mmss}</span>{" "}
            (minutes:seconds).
          </>
        ) : (
          <>Too many email requests right now. Try again in a little while.</>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * auth.users enforces unique email; GoTrue returns an error on duplicate signUp.
 * Wording varies by Supabase/GoTrue version, so match several patterns.
 */
function isEmailAlreadyRegisteredAuthError(err: { message?: string; code?: string }): boolean {
  const code = (err.code ?? "").toLowerCase();
  if (code === "user_already_exists" || code === "email_exists") return true;
  const m = (err.message ?? "").toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already exists") ||
    m.includes("user already") ||
    m.includes("email address is already") ||
    m.includes("email is already") ||
    m.includes("duplicate")
  );
}

type AuthPhase =
  | "tabs"
  | "signup-otp"
  | "signup-success"
  | "forgot-send"
  | "forgot-otp";

type PendingSignupContext = {
  email: string;
  password: string;
  profile: {
    full_name: string;
    date_of_birth: string;
    phone?: string;
    country?: string;
    affiliate_id?: string | null;
    referral_code?: string | null;
  };
};

type AuthEmailOtpAction = "signup_send" | "recovery_send";

type AuthEmailOtpResult = {
  ok: boolean;
  code?: string;
  message?: string;
};

const AuthPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [authPhase, setAuthPhase] = useState<AuthPhase>("tabs");
  const [pendingSignupEmail, setPendingSignupEmail] = useState("");
  const [pendingSignupContext, setPendingSignupContext] = useState<PendingSignupContext | null>(
    null,
  );
  const [signUpOtp, setSignUpOtp] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotPasswordConfirm, setForgotPasswordConfirm] = useState("");
  const [availableBatches, setAvailableBatches] = useState<
    Array<{ code: string; name: string; timezone: string; tagline?: string }>
  >([]);
  const [selectedBatchCode, setSelectedBatchCode] = useState("");
  const [savingBatch, setSavingBatch] = useState(false);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");

  const [signInData, setSignInData] = useState({ email: "", password: "" });
  const [signUpData, setSignUpData] = useState({
    fullName: "",
    dateOfBirth: "",
    phoneCountryIso: DEFAULT_SIGNUP_PHONE_ISO as CountryCode,
    phoneNational: "",
    country: "",
    email: "",
    password: "",
    confirmPassword: "",
    techProviderAcknowledge: false,
    termsAcknowledge: false,
  });

  const { signIn, user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postAuthCheckoutStartedRef = useRef(false);
  const emailCooldown = useAuthEmailCooldown();
  const [genericEmailRateLimit, setGenericEmailRateLimit] = useState(false);
  const isMobile = useIsMobileApp();
  const trialBootstrapDoneRef = useRef(false);

  const sendAuthEmailOtp = async (
    action: AuthEmailOtpAction,
    payload: {
      email: string;
      password?: string;
      profile?: PendingSignupContext["profile"];
    },
  ) => {
    const { data, error } = await supabase.functions.invoke("auth-email-otp", {
      body: {
        action,
        email: payload.email,
        password: payload.password,
        profile: payload.profile,
        redirectTo: `${window.location.origin}/auth`,
      },
    });

    if (error) {
      return {
        ok: false,
        message: "Could not send email. Please try again.",
      } as AuthEmailOtpResult;
    }

    return (data ?? {
      ok: false,
      message: "Could not send email. Please try again.",
    }) as AuthEmailOtpResult;
  };

  const signUpAge = useMemo(
    () => (signUpData.dateOfBirth ? computeAgeFromIsoDate(signUpData.dateOfBirth) : null),
    [signUpData.dateOfBirth],
  );

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const entry = searchParams.get("entry");
    if (requestedTab === "signup" || entry === "meta_webinar") {
      setAuthTab("signup");
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      const fullName = localStorage.getItem("signup_prefill_full_name")?.trim() ?? "";
      const email = localStorage.getItem("signup_prefill_email")?.trim() ?? "";
      const phoneIsoRaw = localStorage.getItem("signup_prefill_phone_iso")?.trim() ?? "";
      const phoneNational = localStorage.getItem("signup_prefill_phone_national")?.trim() ?? "";

      if (!fullName && !email && !phoneNational) return;

      const phoneCountryIso: CountryCode | null = /^[A-Z]{2}$/.test(phoneIsoRaw)
        ? (phoneIsoRaw as CountryCode)
        : null;

      setSignUpData((prev) => ({
        ...prev,
        fullName: fullName || prev.fullName,
        email: email || prev.email,
        phoneCountryIso: phoneCountryIso ?? prev.phoneCountryIso,
        phoneNational: phoneNational || prev.phoneNational,
      }));

      setAuthTab("signup");
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    const routeAfterLogin = async () => {
      if (roleLoading || !user) return;
      if ((user as any).user_metadata?.need_password_reset) {
        navigate("/auth/change-password", { replace: true });
        return;
      }

      const plan = searchParams.get("subscribe_plan")?.trim() ?? "";
      const proTrialIntent = searchParams.get("pro_trial") === "1";
      const currencyParam = (searchParams.get("currency") ?? "").toUpperCase();
      const checkoutCurrency = currencyParam === "INR" ? "inr" : undefined;
      const hasCheckoutIntent =
        (proTrialIntent && plan === "professionalPlan") ||
        (Boolean(plan) && VALID_PREMIUM_CHECKOUT_PLANS.has(plan));
      if (authPhase === "signup-success" && !hasCheckoutIntent) return;
      if (proTrialIntent && plan === "professionalPlan" && role === "user") {
        if (postAuthCheckoutStartedRef.current) return;
        postAuthCheckoutStartedRef.current = true;
        const result = await startProTrial();
        if ("error" in result) {
          postAuthCheckoutStartedRef.current = false;
          toast({
            title: "Could not start trial",
            description: result.error,
            variant: "destructive",
          });
          navigate("/pricing", { replace: true });
          return;
        }
        window.location.assign("/home");
        return;
      }
      if (plan && VALID_PREMIUM_CHECKOUT_PLANS.has(plan) && role === "user") {
        if (postAuthCheckoutStartedRef.current) return;
        postAuthCheckoutStartedRef.current = true;
        const { success_url, cancel_url } = premiumPlanCheckoutUrls(plan);
        const result = await createCheckoutSession({
          plan_id: plan,
          success_url,
          cancel_url,
          ...(checkoutCurrency ? { currency: checkoutCurrency } : {}),
        });
        if ("error" in result) {
          postAuthCheckoutStartedRef.current = false;
          toast({
            title: "Could not start checkout",
            description: result.error,
            variant: "destructive",
          });
          navigate("/pricing", { replace: true });
          return;
        }
        if (result.url) {
          window.location.href = result.url;
          return;
        }
        postAuthCheckoutStartedRef.current = false;
        navigate("/pricing", { replace: true });
        return;
      }

      if (role === "super_admin") {
        navigate("/admin", { replace: true });
        return;
      }
      if (role === "admin") {
        const { data } = await (supabase as any)
          .from("white_label_tenant_users")
          .select("white_label_tenants(slug)")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("status", "active")
          .maybeSingle();
        const slug = data?.white_label_tenants?.slug as string | undefined;
        if (slug) navigate(`/wl/${slug}/dashboard`, { replace: true });
        else navigate("/white-label#pricing", { replace: true });
        return;
      }
      if (role === "affiliate") navigate("/affiliate/dashboard", { replace: true });
      else if (role === "user") {
        if (!trialBootstrapDoneRef.current) {
          trialBootstrapDoneRef.current = true;
          await ensureTrialAccessForUser(user.id);
        }

        try {
          const wasPendingSignup = localStorage.getItem("pending_signup_complete") === "1";
          if (wasPendingSignup) {
            localStorage.removeItem("pending_signup_complete");

            const sourcePageRaw = localStorage.getItem("signup_source_page") ?? "unknown";
            const source =
              sourcePageRaw === "meta_webinar"
                ? "2-day access landing page"
                : sourcePageRaw === "ra_checkout"
                  ? "RA strategy checkout"
                  : sourcePageRaw;

            const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
            const fullName =
              (meta.full_name as string) ??
              (meta.fullName as string) ??
              user.email?.split("@")[0] ??
              "User";
            const phone = (meta.phone as string) ?? "";

            const utmSourceRaw = localStorage.getItem("signup_utm_source") ?? "";
            const utmMediumRaw = localStorage.getItem("signup_utm_medium") ?? "";
            const utmCampaignRaw = localStorage.getItem("signup_utm_campaign") ?? "";

            const utm_source = utmSourceRaw.trim() ? utmSourceRaw.trim() : null;
            const utm_medium = utmMediumRaw.trim() ? utmMediumRaw.trim() : null;
            const utm_campaign = utmCampaignRaw.trim() ? utmCampaignRaw.trim() : null;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table is migration-backed
            const { data: profile } = await (supabase as any)
              .from("user_signup_profiles")
              .select("affiliate_id, referral_code_at_signup")
              .eq("user_id", user.id)
              .maybeSingle();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration-backed table
            await (supabase as any).from("user_signup_tracking").upsert(
              [
                {
                  user_id: user.id,
                  name: fullName,
                  email: user.email ?? "",
                  whatsapp: phone,
                  source,
                  stage: "signed_up",
                  utm_json: {},
                  utm_source,
                  utm_medium,
                  utm_campaign,
                  affiliate_id: profile?.affiliate_id ?? null,
                  referral_code: profile?.referral_code_at_signup ?? null,
                },
              ],
              { onConflict: "user_id" },
            );

            await trackFunnelEvent("signup_complete", {
              source_page: sourcePageRaw,
            }, user.id);
            localStorage.removeItem("signup_source_page");
            localStorage.removeItem("signup_utm_source");
            localStorage.removeItem("signup_utm_medium");
            localStorage.removeItem("signup_utm_campaign");
          }
        } catch {
          // Ignore localStorage failures.
        }

        if (isMobile) {
          navigate("/trading-dashboard?tab=options", { replace: true });
        } else {
          navigate("/home", { replace: true });
        }
      }
    };
    routeAfterLogin();
  }, [user, role, roleLoading, navigate, searchParams, authPhase]);

  useEffect(() => {
    const loadBatches = async () => {
      if (authPhase !== "signup-success") return;
      const preferredBatchCode = localStorage.getItem("signup_prefill_batch_code") ?? "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration-backed table
      const { data } = await (supabase as any)
        .from("webinar_batches")
        .select("code,name,timezone")
        .eq("is_active", true)
        .order("name", { ascending: true });
      const dbRows = (data ?? []) as Array<{ code: string; name: string; timezone: string }>;
      const taglineByCode = new Map(
        WEBINAR_BATCH_DEFINITIONS.map((batch) => [batch.code, batch.tagline] as const),
      );
      const rows =
        dbRows.length > 0
          ? dbRows.map((row) => ({
              ...row,
              tagline: taglineByCode.get(row.code),
            }))
          : WEBINAR_BATCH_DEFINITIONS.map((batch) => ({
              code: batch.code,
              name: batch.name,
              timezone: "Asia/Kolkata",
              tagline: batch.tagline,
            }));

      setAvailableBatches(rows);
      if (rows.length > 0) {
        const preferredExists = rows.some((r) => r.code === preferredBatchCode);
        setSelectedBatchCode(preferredExists ? preferredBatchCode : rows[0].code);
      }
    };
    void loadBatches();
  }, [authPhase]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await signIn(signInData.email, signInData.password);

      if (error) {
        toast({
          title: "Sign in failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    void trackFunnelEvent("signup_start", { source_page: "auth_page" });

    const name = signUpData.fullName.trim();
    if (name.length < 2) {
      toast({
        title: "Name required",
        description: "Please enter your full name (at least 2 characters).",
        variant: "destructive",
      });
      return;
    }

    if (signUpData.dateOfBirth) {
      const age = computeAgeFromIsoDate(signUpData.dateOfBirth);
      if (age == null) {
        toast({
          title: "Invalid date of birth",
          description: "Use a valid calendar date.",
          variant: "destructive",
        });
        return;
      }
      if (age < 13) {
        toast({
          title: "Age requirement",
          description: "You must be at least 13 years old to create an account.",
          variant: "destructive",
        });
        return;
      }
      if (age > 120) {
        toast({
          title: "Invalid date of birth",
          description: "Please check the year you entered.",
          variant: "destructive",
        });
        return;
      }
    }

    if (signUpData.password !== signUpData.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (signUpData.password.length < 6) {
      toast({
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (!signUpData.techProviderAcknowledge) {
      toast({
        title: "Acknowledgment required",
        description: "Please acknowledge that this platform is only a technology provider.",
        variant: "destructive",
      });
      return;
    }

    if (!signUpData.termsAcknowledge) {
      toast({
        title: "Terms & Conditions",
        description: "Please agree to the Terms & Conditions before signing up.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const phoneE164 = buildE164FromNational(
        signUpData.phoneCountryIso,
        signUpData.phoneNational,
      );
      const email = signUpData.email.trim().toLowerCase();
      const password = signUpData.password;
      const { affiliateId, referralCode } = getSessionAffiliateAttribution();
      const profile: PendingSignupContext["profile"] = {
        full_name: name,
        date_of_birth: signUpData.dateOfBirth || "1970-01-01",
        phone: phoneE164,
        country: signUpData.country,
        affiliate_id: affiliateId,
        referral_code: referralCode ?? undefined,
      };
      const result = await sendAuthEmailOtp("signup_send", {
        email,
        password,
        profile,
      });

      if (!result.ok) {
        if (
          result.code === "user_exists" ||
          isEmailAlreadyRegisteredAuthError({
            message: result.message,
            code: result.code,
          })
        ) {
          toast({
            title: "Account exists",
            description: "An account with this email already exists. Please sign in instead.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Sign up failed",
            description: result.message ?? "Could not start signup verification.",
            variant: "destructive",
          });
        }
        return;
      }

      setGenericEmailRateLimit(false);
      setPendingSignupEmail(email);
      setPendingSignupContext({ email, password, profile });
      setSignUpOtp("");
      setAuthPhase("signup-otp");
      toast({
        title: "Check your email",
        description: "We sent a 6-digit code to complete signup.",
      });
    } catch {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = normalizeOtp(signUpOtp);
    if (token.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit code from your email.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: pendingSignupEmail,
        token,
        type: "signup",
      });
      if (error) {
        toast({
          title: "Verification failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      if (data.session) {
        toast({ title: "Email verified", description: "You're signed in." });
        const plan = searchParams.get("subscribe_plan")?.trim() ?? "";
        const proTrialIntent = searchParams.get("pro_trial") === "1";
        const hasCheckoutIntent =
          (proTrialIntent && plan === "professionalPlan") ||
          VALID_PREMIUM_CHECKOUT_PLANS.has(plan);
        try {
          localStorage.setItem("pending_signup_complete", "1");
          const sourcePage = new URLSearchParams(window.location.search).get("entry");
          if (sourcePage) localStorage.setItem("signup_source_page", sourcePage);
          localStorage.removeItem("signup_prefill_full_name");
          localStorage.removeItem("signup_prefill_email");
          localStorage.removeItem("signup_prefill_phone_iso");
          localStorage.removeItem("signup_prefill_phone_national");
        } catch {
          // Ignore storage failures.
        }
        setAuthPhase(hasCheckoutIntent ? "tabs" : "signup-success");
        setSignUpOtp("");
        setPendingSignupContext(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendSignupOtp = async () => {
    if (!pendingSignupContext) {
      toast({
        title: "Session expired",
        description: "Please sign up again to resend the code.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const result = await sendAuthEmailOtp("signup_send", {
        email: pendingSignupContext.email,
        password: pendingSignupContext.password,
        profile: pendingSignupContext.profile,
      });
      if (!result.ok) {
        toast({
          title: "Could not resend",
          description: result.message ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      setGenericEmailRateLimit(false);
      toast({ title: "Code sent", description: "Check your inbox for a new code." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!email) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const result = await sendAuthEmailOtp("recovery_send", {
        email,
      });
      if (!result.ok) {
        toast({
          title: "Request failed",
          description: result.message ?? "Could not send reset code.",
          variant: "destructive",
        });
        return;
      }
      setGenericEmailRateLimit(false);
      setForgotOtp("");
      setForgotPassword("");
      setForgotPasswordConfirm("");
      setAuthPhase("forgot-otp");
      toast({
        title: "Check your email",
        description: "We sent a 6-digit code to reset your password.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendRecoveryOtp = async () => {
    const email = forgotEmail.trim();
    if (!email) return;
    setIsLoading(true);
    try {
      const result = await sendAuthEmailOtp("recovery_send", {
        email,
      });
      if (!result.ok) {
        toast({
          title: "Could not resend",
          description: result.message ?? "Could not send reset code.",
          variant: "destructive",
        });
        return;
      }
      setGenericEmailRateLimit(false);
      toast({ title: "Code sent", description: "Check your inbox for a new code." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = normalizeOtp(forgotOtp);
    if (token.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit code from your email.",
        variant: "destructive",
      });
      return;
    }
    if (forgotPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    if (forgotPassword !== forgotPasswordConfirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: forgotEmail.trim(),
        token,
        type: "recovery",
      });
      if (error) {
        toast({
          title: "Verification failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: forgotPassword,
      });
      if (updateErr) {
        toast({
          title: "Could not set password",
          description: updateErr.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Password updated",
        description: "You're signed in with your new password.",
      });
      setAuthPhase("tabs");
      setForgotOtp("");
      setForgotPassword("");
      setForgotPasswordConfirm("");
      if (!data.session) {
        navigate("/home", { replace: true });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const backToTabs = () => {
    setAuthPhase("tabs");
    setSignUpOtp("");
    setPendingSignupContext(null);
    setForgotOtp("");
    setForgotPassword("");
    setForgotPasswordConfirm("");
  };

  const completeSignupWithoutBatch = () => {
    try {
      localStorage.removeItem("signup_prefill_batch_code");
    } catch {
      // Ignore storage failures.
    }
    setAuthPhase("tabs");
    if (isMobile) navigate("/trading-dashboard?tab=options", { replace: true });
    else navigate("/home", { replace: true });
  };

  const handleSelectBatchAfterSignup = async () => {
    if (!user?.id || !selectedBatchCode) {
      toast({
        title: "Choose a batch",
        description: "Select one webinar batch to continue.",
        variant: "destructive",
      });
      return;
    }
    setSavingBatch(true);
    try {
      const fullName =
        ((user.user_metadata as Record<string, unknown> | undefined)?.full_name as string) ||
        user.email?.split("@")[0] ||
        "User";
      const phone =
        ((user.user_metadata as Record<string, unknown> | undefined)?.phone as string) || "";

      // Avoid ON CONFLICT dependency; some DBs may not have matching unique constraint shape.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration-backed table
      const { data: existingReg, error: existingErr } = await (supabase as any)
        .from("webinar_registrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("batch_code", selectedBatchCode)
        .maybeSingle();
      if (existingErr) {
        throw existingErr;
      }

      let regId = existingReg?.id as string | undefined;
      if (!regId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration-backed table
        const { data: insertRows, error: insertErr } = await (supabase as any)
          .from("webinar_registrations")
          .insert([
            {
              user_id: user.id,
              batch_code: selectedBatchCode,
              full_name: fullName,
              email: user.email ?? "",
              phone,
              source: "signup_onboarding",
              consent_email: true,
              status: "registered",
            },
          ])
          .select("id");
        if (insertErr) {
          throw insertErr;
        }
        regId = insertRows?.[0]?.id as string | undefined;
      }

      if (regId) {
        await supabase.functions.invoke("webinar-email-automation", {
          body: { action: "registration_confirmation", registrationId: regId },
        });
      }

      await trackFunnelEvent(
        "batch_select",
        { source_page: "auth_signup_success", batch_code: selectedBatchCode },
        user.id,
      );
      await trackFunnelEvent(
        "webinar_register",
        { source_page: "auth_signup_success", batch_code: selectedBatchCode },
        user.id,
      );

      toast({ title: "Batch reserved", description: "You are enrolled in the selected webinar batch." });
      try {
        localStorage.removeItem("signup_prefill_batch_code");
      } catch {
        // Ignore storage failures.
      }
      completeSignupWithoutBatch();
    } catch (error: any) {
      toast({
        title: "Could not reserve batch",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingBatch(false);
    }
  };

  if (authPhase === "signup-otp") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Enter verification code</CardTitle>
            <CardDescription className="text-center">
              We emailed a 6-digit code to <strong className="text-foreground">{pendingSignupEmail}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailCooldownBanner
              showTimer={emailCooldown.active}
              mmss={emailCooldown.mmss}
              generic={genericEmailRateLimit && !emailCooldown.active}
            />
            <form onSubmit={handleVerifySignupOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-otp">6-digit code</Label>
                <Input
                  id="signup-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={12}
                  className="text-center text-2xl tracking-[0.4em] font-mono"
                  value={signUpOtp}
                  onChange={(e) => setSignUpOtp(normalizeOtp(e.target.value))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & continue
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading || emailCooldown.active}
                onClick={handleResendSignupOtp}
              >
                {emailCooldown.active ? `Wait ${emailCooldown.mmss}` : "Resend code"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToTabs}>
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authPhase === "forgot-send") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Reset password</CardTitle>
            <CardDescription className="text-center">
              We&apos;ll email you a 6-digit code. Enter it on the next step with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailCooldownBanner
              showTimer={emailCooldown.active}
              mmss={emailCooldown.mmss}
              generic={genericEmailRateLimit && !emailCooldown.active}
            />
            <form onSubmit={handleSendPasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || emailCooldown.active}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {emailCooldown.active ? `Wait ${emailCooldown.mmss}` : "Send code"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToTabs}>
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authPhase === "forgot-otp") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Set new password</CardTitle>
            <CardDescription className="text-center">
              Code sent to <strong className="text-foreground">{forgotEmail.trim()}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailCooldownBanner
              showTimer={emailCooldown.active}
              mmss={emailCooldown.mmss}
              generic={genericEmailRateLimit && !emailCooldown.active}
            />
            <form onSubmit={handleVerifyRecoveryOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-otp">6-digit code</Label>
                <Input
                  id="recovery-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={12}
                  className="text-center text-2xl tracking-[0.4em] font-mono"
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(normalizeOtp(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-pass">New password</Label>
                <Input
                  id="recovery-pass"
                  type="password"
                  autoComplete="new-password"
                  value={forgotPassword}
                  onChange={(e) => setForgotPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-pass2">Confirm new password</Label>
                <Input
                  id="recovery-pass2"
                  type="password"
                  autoComplete="new-password"
                  value={forgotPasswordConfirm}
                  onChange={(e) => setForgotPasswordConfirm(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify code & update password
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading || emailCooldown.active}
                onClick={handleResendRecoveryOtp}
              >
                {emailCooldown.active ? `Wait ${emailCooldown.mmss}` : "Resend code"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToTabs}>
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authPhase === "signup-success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Welcome to TradingSmart.ai</CardTitle>
            <CardDescription className="text-center">
              Your 14-day free trial is active. Pick a live training batch now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-300">
              <p>Trial duration: 14 days</p>
              <p>Backtests/day: 10</p>
              <p>Paper trades/day: 10</p>
              <p>AI analysis/day: 10</p>
              <p>Strategy creation/day: 1</p>
            </div>
            <div className="space-y-2">
              <Label>Choose webinar batch</Label>
              <div className="space-y-2">
                {availableBatches.map((batch) => (
                  <label
                    key={batch.code}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                      selectedBatchCode === batch.code
                        ? "border-teal-500/50 bg-teal-500/10"
                        : "border-zinc-700"
                    }`}
                  >
                    <input
                      type="radio"
                      className="accent-teal-500"
                      name="signup-batch"
                      checked={selectedBatchCode === batch.code}
                      onChange={() => setSelectedBatchCode(batch.code)}
                    />
                    <div className="text-sm">
                      <p className="font-medium text-white">{batch.name}</p>
                      <p className="text-zinc-400">{batch.tagline ?? batch.timezone}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-teal-500 hover:bg-teal-400 text-black font-bold"
                disabled={savingBatch || !selectedBatchCode}
                onClick={handleSelectBatchAfterSignup}
              >
                {savingBatch ? "Reserving..." : "Reserve batch and continue"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={completeSignupWithoutBatch}>
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020817] flex items-center justify-center p-4">
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.08),transparent_35%),radial-gradient(circle_at_85%_25%,rgba(45,212,191,0.08),transparent_30%),radial-gradient(circle_at_55%_90%,rgba(99,102,241,0.08),transparent_35%)]" />
        <div className="absolute -left-20 top-14 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -right-20 top-1/4 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <Link
        to="/"
        className="absolute top-5 left-5 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-md transition-colors hover:border-teal-300/40 hover:bg-teal-500/10 hover:text-teal-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to home
      </Link>

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(17,27,48,0.96),rgba(10,15,28,0.96))] shadow-[0_30px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl px-6 pb-8 pt-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">TradingSmart Login</h1>
          <p className="mt-1.5 text-xs text-slate-400">Sign in to access AI-powered market insights and analysis tools.</p>
        </div>

          <EmailCooldownBanner
            showTimer={emailCooldown.active}
            mmss={emailCooldown.mmss}
            generic={genericEmailRateLimit && !emailCooldown.active}
          />
          <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as "signin" | "signup")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-white/5 border border-white/10">
              <TabsTrigger value="signin" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-slate-400">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-slate-400">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signin-email" className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signInData.email}
                    onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                    required
                    className="h-11 border border-cyan-200/10 bg-[#040c1f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signin-password" className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="••••••••••••"
                    value={signInData.password}
                    onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                    required
                    className="h-11 border border-cyan-200/10 bg-[#040c1f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <Button type="submit" className="mt-1 h-11 w-full bg-gradient-to-r from-teal-400 to-blue-500 text-[11px] font-semibold uppercase tracking-[2.2px] text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] hover:brightness-110" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="w-full text-[11px] text-cyan-300/90 hover:text-cyan-200"
                  onClick={() => {
                    setForgotEmail(signInData.email);
                    setAuthPhase("forgot-send");
                  }}
                >
                  Forgot password?
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Full name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your full name"
                    value={signUpData.fullName}
                    onChange={(e) => setSignUpData({ ...signUpData, fullName: e.target.value })}
                    required
                    className="h-11 border border-cyan-200/10 bg-[#040c1f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-dob" className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Date of birth (optional)</Label>
                  <Input
                    id="signup-dob"
                    type="date"
                    value={signUpData.dateOfBirth}
                    onChange={(e) => setSignUpData({ ...signUpData, dateOfBirth: e.target.value })}
                    className="h-11 border border-cyan-200/10 bg-[#040c1f] text-slate-100 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                  />
                  {signUpAge != null && (
                    <p className="text-xs text-slate-400">
                      Age: <span className="font-medium text-slate-200">{signUpAge}</span> years
                      (stored at signup)
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Phone (optional)</Label>
                  <div className="flex flex-row gap-2 sm:gap-3 items-end">
                    <div className="space-y-1.5 w-[5.25rem] sm:w-24 shrink-0">
                      <span className="text-[10px] text-slate-500">Code</span>
                      <PhoneCountryCodeCombobox
                        id="signup-phone-code"
                        value={signUpData.phoneCountryIso}
                        onValueChange={(iso) =>
                          setSignUpData({
                            ...signUpData,
                            phoneCountryIso: iso,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <span className="text-[10px] text-slate-500">Phone number</span>
                      <Input
                        id="signup-phone-national"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="National number (digits only)"
                        className="h-10 w-full border border-cyan-200/10 bg-[#040c1f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                        value={signUpData.phoneNational}
                        onChange={(e) =>
                          setSignUpData({ ...signUpData, phoneNational: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-country" className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Country / region (optional)</Label>
                  <Input
                    id="signup-country"
                    type="text"
                    autoComplete="country-name"
                    placeholder="e.g. United States"
                    value={signUpData.country}
                    onChange={(e) => setSignUpData({ ...signUpData, country: e.target.value })}
                    className="h-11 border border-cyan-200/10 bg-[#040c1f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signUpData.email}
                    onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                    required
                    className="h-11 border border-cyan-200/10 bg-[#040c1f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={signUpData.password}
                    onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                    required
                    minLength={6}
                    className="h-11 border border-cyan-200/10 bg-[#040c1f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-confirm" className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400">Confirm password</Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    placeholder="Confirm your password"
                    value={signUpData.confirmPassword}
                    onChange={(e) =>
                      setSignUpData({ ...signUpData, confirmPassword: e.target.value })
                    }
                    required
                    className="h-11 border border-cyan-200/10 bg-[#040c1f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="flex items-start space-x-3 pt-2">
                  <Checkbox
                    id="techProviderAcknowledgeAuth"
                    className="mt-1 flex-shrink-0 border-cyan-300/30"
                    checked={signUpData.techProviderAcknowledge}
                    onCheckedChange={(checked) => setSignUpData({ ...signUpData, techProviderAcknowledge: checked === true })}
                    required
                  />
                  <Label htmlFor="techProviderAcknowledgeAuth" className="text-xs text-slate-400 font-normal leading-tight cursor-pointer">
                    I understand that this platform is only a technology provider and does not offer any investment advice or trading strategies.
                  </Label>
                </div>
                <div className="flex items-start space-x-3 pt-2">
                  <Checkbox
                    id="termsAcknowledgeAuth"
                    className="mt-1 flex-shrink-0 border-cyan-300/30"
                    checked={signUpData.termsAcknowledge}
                    onCheckedChange={(checked) => setSignUpData({ ...signUpData, termsAcknowledge: checked === true })}
                    required
                  />
                  <Label htmlFor="termsAcknowledgeAuth" className="text-xs text-slate-400 font-normal leading-tight cursor-pointer">
                    I agree to the <Link to="/terms" className="text-teal-400 hover:underline">Terms & Conditions</Link>
                  </Label>
                </div>
                <Button type="submit" className="mt-1 h-11 w-full bg-gradient-to-r from-teal-400 to-blue-500 text-[11px] font-semibold uppercase tracking-[2.2px] text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] hover:brightness-110" disabled={isLoading || emailCooldown.active}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {emailCooldown.active ? `Wait ${emailCooldown.mmss}` : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <p className="mt-3 text-center text-[10px] uppercase tracking-[2.5px] text-slate-500">
            Secure · Encrypted · Tech platform only
          </p>
      </div>
    </div>
  );
};

export default AuthPage;
