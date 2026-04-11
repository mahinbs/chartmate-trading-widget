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
  template: "signup" | "recovery";
}) {
  const safeEmail = escapeHtml(params.to);
  const safeOtp = escapeHtml(params.otp);

  const signupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your TradingSmart.ai verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#050505;">
  <div style="display:none;max-height:0;overflow:hidden;">
    Your TradingSmart.ai code is ${safeOtp}. Enter it in the app to verify ${safeEmail}.
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#050505;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background-color:#0f1419;border:1px solid #1e293b;border-radius:16px;">
          <tr>
            <td align="center" style="padding:32px 24px 16px;background:linear-gradient(180deg,#0c1917,#0f1419);">
              <img src="https://www.tradingsmart.ai/assets/logo-BvaV304R.png" width="100" alt="TradingSmart.ai" style="display:block;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;font-family:Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#f8fafc;">Verify your email</h1>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:#94a3b8;">
                Enter this code in the app to finish signing up for <strong style="color:#e2e8f0;">${safeEmail}</strong>:
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 28px 8px;">
              <div style="font-family:Consolas,Monaco,ui-monospace,monospace;font-size:36px;font-weight:700;letter-spacing:0.35em;color:#14b8a6;padding:16px 24px;background:#0a1210;border:1px solid #134e4a;border-radius:12px;display:inline-block;">
                ${safeOtp}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-family:Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
                This code expires soon. If you did not create an account, ignore this message.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#0a0f14;border-top:1px solid #1e293b;text-align:center;font-size:12px;color:#64748b;font-family:Segoe UI,Roboto,sans-serif;">
              <a href="https://www.tradingsmart.ai/" style="color:#14b8a6;text-decoration:none;">tradingsmart.ai</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const recoveryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your TradingSmart.ai password</title>
</head>
<body style="margin:0;padding:0;background-color:#050505;">
  <div style="display:none;max-height:0;overflow:hidden;">
    TradingSmart.ai password reset code ${safeOtp} for ${safeEmail}.
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#050505;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background-color:#0f1419;border:1px solid #1e293b;border-radius:16px;">
          <tr>
            <td align="center" style="padding:32px 24px 16px;background:linear-gradient(180deg,#0c1917,#0f1419);">
              <img src="https://www.tradingsmart.ai/assets/logo-BvaV304R.png" width="100" alt="TradingSmart.ai" style="display:block;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;font-family:Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#f8fafc;">Password reset code</h1>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:#94a3b8;">
                We received a request to reset the password for <strong style="color:#e2e8f0;">${safeEmail}</strong>. Enter this code on the sign-in page under <strong style="color:#e2e8f0;">Forgot password</strong>:
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 28px 8px;">
              <div style="font-family:Consolas,Monaco,ui-monospace,monospace;font-size:36px;font-weight:700;letter-spacing:0.35em;color:#14b8a6;padding:16px 24px;background:#0a1210;border:1px solid #134e4a;border-radius:12px;display:inline-block;">
                ${safeOtp}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-family:Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
                If you did not request this, you can ignore this email. Your password will stay the same.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#0a0f14;border-top:1px solid #1e293b;text-align:center;font-size:12px;color:#64748b;font-family:Segoe UI,Roboto,sans-serif;">
              <a href="https://www.tradingsmart.ai/" style="color:#14b8a6;text-decoration:none;">tradingsmart.ai</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const html = params.template === "signup" ? signupHtml : recoveryHtml;
  const text =
    params.template === "signup"
      ? `Verify your email\n\nEnter this code in the app to finish signing up for ${params.to}:\n\n${params.otp}`
      : `Password reset code\n\nUse this code to reset the password for ${params.to}:\n\n${params.otp}`;

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
        subject: "Your TradingSmart.ai verification code",
        template: "signup",
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
        subject: "Reset your TradingSmart.ai password",
        template: "recovery",
      });

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, code: "invalid_action", message: "Invalid action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ ok: false, code: "internal_error", message }, 500);
  }
});
