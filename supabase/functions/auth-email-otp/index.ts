import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SignupProfile = {
  full_name?: string;
  date_of_birth?: string;
  phone?: string;
  country?: string;
  affiliate_id?: string | null;
  referral_code?: string | null;
};

type SendSignupPayload = {
  action: "signup_send";
  email?: string;
  password?: string;
  profile?: SignupProfile;
  redirectTo?: string;
};

type SendRecoveryPayload = {
  action: "recovery_send";
  email?: string;
  redirectTo?: string;
};

type RequestPayload = SendSignupPayload | SendRecoveryPayload;

const DEFAULT_FROM_EMAIL = "ChartMate <noreply@chartmate.trade>";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toCleanMeta(profile?: SignupProfile): Record<string, string> | undefined {
  if (!profile) return undefined;
  const meta: Record<string, string> = {};

  const fullName = (profile.full_name ?? "").trim();
  if (fullName) meta.full_name = fullName;

  const dob = (profile.date_of_birth ?? "").trim();
  if (dob) meta.date_of_birth = dob;

  const phone = (profile.phone ?? "").trim();
  if (phone) meta.phone = phone;

  const country = (profile.country ?? "").trim();
  if (country) meta.country = country;

  const affiliateId = (profile.affiliate_id ?? "").trim();
  if (affiliateId) meta.affiliate_id = affiliateId;

  const referralCode = (profile.referral_code ?? "").trim();
  if (referralCode) meta.referral_code = referralCode;

  return Object.keys(meta).length ? meta : undefined;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeEmail(input?: string): string {
  return (input ?? "").trim().toLowerCase();
}

function userAlreadyExistsMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already exists") ||
    m.includes("user already") ||
    m.includes("email address is already") ||
    m.includes("email is already") ||
    m.includes("duplicate")
  );
}

async function sendOtpEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  otp: string;
  subject: string;
  preheader: string;
  headline: string;
  helperText: string;
}) {
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <p style="margin:0 0 12px;color:#111827;font-size:14px;">${escapeHtml(params.preheader)}</p>
      <h1 style="margin:0 0 16px;color:#0f172a;font-size:22px;">${escapeHtml(params.headline)}</h1>
      <p style="margin:0 0 16px;color:#334155;font-size:14px;">${escapeHtml(params.helperText)}</p>
      <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 30px; letter-spacing: 6px; color: #0f172a; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; text-align: center; padding: 14px 8px; margin-bottom: 16px;">
        ${escapeHtml(params.otp)}
      </div>
      <p style="margin:0;color:#64748b;font-size:12px;">If you did not request this, you can ignore this email.</p>
    </div>
  `.trim();

  const text = `${params.headline}\n\n${params.helperText}\n\nYour code: ${params.otp}\n\nIf you did not request this, you can ignore this email.`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend request failed (${res.status}): ${body}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed", message: "Method not allowed" }, 405);
  }

  try {
    const payload = (await req.json()) as RequestPayload;
    const email = normalizeEmail(payload.email);

    if (!email) {
      return jsonResponse({ ok: false, code: "email_required", message: "Email is required." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? DEFAULT_FROM_EMAIL;

    if (!supabaseUrl || !serviceRole) {
      throw new Error("Missing Supabase environment variables.");
    }
    if (!resendApiKey) {
      throw new Error("Missing RESEND_API_KEY environment variable.");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (payload.action === "signup_send") {
      const password = (payload.password ?? "").trim();
      if (!password) {
        return jsonResponse({ ok: false, code: "password_required", message: "Password is required." });
      }

      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        password,
        options: {
          data: toCleanMeta(payload.profile),
          redirectTo: payload.redirectTo,
        },
      });

      if (error) {
        if (userAlreadyExistsMessage(error.message)) {
          return jsonResponse({
            ok: false,
            code: "user_exists",
            message: "An account with this email already exists.",
          });
        }
        return jsonResponse({ ok: false, code: "signup_link_failed", message: error.message });
      }

      const otp = (data?.properties as { email_otp?: string } | null)?.email_otp;
      if (!otp) {
        throw new Error("Signup OTP not returned by Supabase.");
      }

      await sendOtpEmail({
        apiKey: resendApiKey,
        from: resendFrom,
        to: email,
        otp,
        subject: "Verify your ChartMate account",
        preheader: "Use this verification code to finish signup.",
        headline: "Confirm your email",
        helperText: "Enter this 6-digit code on the signup screen to activate your account.",
      });

      return jsonResponse({ ok: true });
    }

    if (payload.action === "recovery_send") {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: payload.redirectTo,
        },
      });

      if (error) {
        return jsonResponse({ ok: false, code: "recovery_link_failed", message: error.message });
      }

      const otp = (data?.properties as { email_otp?: string } | null)?.email_otp;
      if (!otp) {
        throw new Error("Recovery OTP not returned by Supabase.");
      }

      await sendOtpEmail({
        apiKey: resendApiKey,
        from: resendFrom,
        to: email,
        otp,
        subject: "Reset your ChartMate password",
        preheader: "Use this code to reset your password.",
        headline: "Password reset code",
        helperText: "Enter this 6-digit code on the reset screen and set your new password.",
      });

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, code: "invalid_action", message: "Invalid action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ ok: false, code: "internal_error", message }, 500);
  }
});
