import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const IST_OFFSET_MS = 330 * 60 * 1000;
const DEFAULT_FROM_EMAIL = "TradingSmart.ai <noreply@tradingsmart.ai>";

type WebinarBatch = {
  id: string;
  code: string;
  name: string;
  session_pattern_json: Array<{
    weekday: number;
    hourIST: number;
    minuteIST: number;
    durationMinutes: number;
  }>;
  zoom_join_url: string | null;
};

type WebinarRegistration = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  status: string;
  batch_code: string;
  webinar_batches: WebinarBatch | null;
};

type Payload =
  | { action: "registration_confirmation"; registrationId: string }
  | { action: "run_scheduled" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function sendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
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
      html: params.html,
      text: params.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed (${res.status}): ${body}`);
  }
  return res.json().catch(() => ({}));
}

function nextSessionDates(pattern: WebinarBatch["session_pattern_json"], now = new Date()) {
  const upcoming: Date[] = [];
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = nowIST.getUTCMonth();
  const d = nowIST.getUTCDate();

  for (let i = 0; i < 8; i += 1) {
    const dayUtcAtIstMidnight = new Date(Date.UTC(y, m, d + i, 0, 0, 0));
    const weekdayIST = dayUtcAtIstMidnight.getUTCDay();
    for (const slot of pattern ?? []) {
      if (slot.weekday !== weekdayIST) continue;
      const sessionUtc = new Date(
        Date.UTC(y, m, d + i, slot.hourIST, slot.minuteIST, 0) - IST_OFFSET_MS,
      );
      if (sessionUtc.getTime() > now.getTime() - 90 * 60 * 1000) {
        upcoming.push(sessionUtc);
      }
    }
  }
  upcoming.sort((a, b) => a.getTime() - b.getTime());
  return upcoming;
}

function inWindow(deltaMs: number, targetMs: number, toleranceMs = 5 * 60 * 1000) {
  return deltaMs >= targetMs - toleranceMs && deltaMs <= targetMs + toleranceMs;
}

async function logEmailEvent(
  supabase: ReturnType<typeof createClient>,
  row: {
    registration_id?: string | null;
    user_id?: string | null;
    email: string;
    template_key: string;
    scheduled_for: string;
    sent_at?: string | null;
    status: "queued" | "sent" | "failed" | "skipped";
    provider_response_json?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("email_events").insert([row]);
  if (error && error.code !== "23505") {
    throw error;
  }
}

async function alreadySent(
  supabase: ReturnType<typeof createClient>,
  templateKey: string,
  registrationId?: string | null,
  userId?: string | null,
) {
  let query = supabase
    .from("email_events")
    .select("id")
    .eq("template_key", templateKey)
    .limit(1);
  if (registrationId) query = query.eq("registration_id", registrationId);
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query.maybeSingle();
  return Boolean(data?.id);
}

function reminderTemplate(params: {
  fullName: string;
  batchName: string;
  joinUrl: string;
  sessionLabel: string;
  reminderType: "t24h" | "t2h" | "t15m" | "no_show";
}) {
  const subjectMap: Record<typeof params.reminderType, string> = {
    t24h: `Webinar reminder: ${params.batchName} starts in 24 hours`,
    t2h: `Webinar reminder: ${params.batchName} starts in 2 hours`,
    t15m: `Join now: ${params.batchName} starts in 15 minutes`,
    no_show: `You missed a session: ${params.batchName}`,
  };
  const introMap: Record<typeof params.reminderType, string> = {
    t24h: "Your live session is scheduled for tomorrow.",
    t2h: "Your live session starts in around 2 hours.",
    t15m: "Your live session starts in around 15 minutes. Join now.",
    no_show: "Looks like you missed the latest session. You can still attend the next one.",
  };
  const subject = subjectMap[params.reminderType];
  const intro = introMap[params.reminderType];
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
      <h2 style="margin-bottom:8px;">TradingSmart Webinar Reminder</h2>
      <p>Hi ${params.fullName || "Trader"},</p>
      <p>${intro}</p>
      <p><strong>Batch:</strong> ${params.batchName}</p>
      <p><strong>Session:</strong> ${params.sessionLabel} (IST)</p>
      <p><a href="${params.joinUrl}" style="display:inline-block;padding:10px 14px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;">Join Webinar</a></p>
      <p>If the button does not work, use this link:<br/>${params.joinUrl}</p>
    </div>
  `;
  const text = [
    `Hi ${params.fullName || "Trader"},`,
    intro,
    `Batch: ${params.batchName}`,
    `Session: ${params.sessionLabel} (IST)`,
    `Join: ${params.joinUrl}`,
  ].join("\n");
  return { subject, html, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  try {
    const payload = (await req.json()) as Payload;
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? DEFAULT_FROM_EMAIL;
    const automationSecret = Deno.env.get("WEBINAR_AUTOMATION_SECRET") ?? "";

    if (!supabaseUrl || !serviceRole || !resendApiKey) {
      throw new Error("Missing required environment variables.");
    }
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (payload.action === "registration_confirmation") {
      const { data: reg } = await supabase
        .from("webinar_registrations")
        .select("id,full_name,email,batch_code,webinar_batches(id,code,name,session_pattern_json,zoom_join_url)")
        .eq("id", payload.registrationId)
        .maybeSingle();

      const row = reg as WebinarRegistration | null;
      if (!row?.id || !row.webinar_batches) {
        return json({ ok: false, message: "Registration not found" }, 404);
      }

      const joinUrl = row.webinar_batches.zoom_join_url?.trim();
      if (!joinUrl) return json({ ok: true, skipped: true, reason: "missing_zoom_join_url" });

      const templateKey = `registration_confirmation:${row.id}`;
      if (await alreadySent(supabase, templateKey, row.id, null)) {
        return json({ ok: true, skipped: true, reason: "already_sent" });
      }

      const subject = `Webinar confirmed: ${row.webinar_batches.name}`;
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
          <h2>You're registered: ${row.webinar_batches.name}</h2>
          <p>Hi ${row.full_name || "Trader"},</p>
          <p>Your webinar batch is confirmed. Use the Zoom link below for all sessions in this batch.</p>
          <p><a href="${joinUrl}" style="display:inline-block;padding:10px 14px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;">Open Zoom Link</a></p>
          <p>We will send reminder emails before each session.</p>
        </div>
      `;
      const text = [
        `Hi ${row.full_name || "Trader"},`,
        `Your webinar batch (${row.webinar_batches.name}) is confirmed.`,
        `Join link: ${joinUrl}`,
        "You will receive reminder emails before each session.",
      ].join("\n");
      const provider = await sendEmail({
        apiKey: resendApiKey,
        from: resendFrom,
        to: row.email,
        subject,
        html,
        text,
      });

      await logEmailEvent(supabase, {
        registration_id: row.id,
        email: row.email,
        template_key: templateKey,
        scheduled_for: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        status: "sent",
        provider_response_json: provider,
      });
      return json({ ok: true, sent: true });
    }

    if (payload.action === "run_scheduled") {
      const bearer = (req.headers.get("Authorization") ?? "")
        .replace(/^Bearer\s+/i, "")
        .trim();
      if (!automationSecret || bearer !== automationSecret) {
        return json({ ok: false, message: "Forbidden" }, 403);
      }

      const now = new Date();
      let sentCount = 0;
      let skippedCount = 0;

      const { data: rows } = await supabase
        .from("webinar_registrations")
        .select("id,user_id,full_name,email,status,batch_code,webinar_batches(id,code,name,session_pattern_json,zoom_join_url)")
        .eq("status", "registered");
      const registrations = (rows ?? []) as WebinarRegistration[];

      for (const reg of registrations) {
        const batch = reg.webinar_batches;
        const joinUrl = batch?.zoom_join_url?.trim();
        if (!batch || !joinUrl) {
          skippedCount += 1;
          continue;
        }
        const sessions = nextSessionDates(batch.session_pattern_json, now);
        for (const session of sessions) {
          const delta = session.getTime() - now.getTime();
          let reminderType: "t24h" | "t2h" | "t15m" | "no_show" | null = null;
          if (inWindow(delta, 24 * 60 * 60 * 1000)) reminderType = "t24h";
          else if (inWindow(delta, 2 * 60 * 60 * 1000)) reminderType = "t2h";
          else if (inWindow(delta, 15 * 60 * 1000)) reminderType = "t15m";
          else if (delta < -60 * 60 * 1000 && delta > -120 * 60 * 1000) reminderType = "no_show";
          if (!reminderType) continue;

          const sessionLabel = new Date(session.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
          const templateKey = `webinar_${reminderType}:${reg.id}:${session.toISOString()}`;
          if (await alreadySent(supabase, templateKey, reg.id, reg.user_id)) {
            skippedCount += 1;
            continue;
          }

          const mail = reminderTemplate({
            fullName: reg.full_name,
            batchName: batch.name,
            joinUrl,
            sessionLabel,
            reminderType,
          });

          try {
            const provider = await sendEmail({
              apiKey: resendApiKey,
              from: resendFrom,
              to: reg.email,
              subject: mail.subject,
              html: mail.html,
              text: mail.text,
            });
            await logEmailEvent(supabase, {
              registration_id: reg.id,
              user_id: reg.user_id,
              email: reg.email,
              template_key: templateKey,
              scheduled_for: session.toISOString(),
              sent_at: new Date().toISOString(),
              status: "sent",
              provider_response_json: provider,
            });
            sentCount += 1;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "send_failed";
            await logEmailEvent(supabase, {
              registration_id: reg.id,
              user_id: reg.user_id,
              email: reg.email,
              template_key: templateKey,
              scheduled_for: session.toISOString(),
              sent_at: new Date().toISOString(),
              status: "failed",
              provider_response_json: { error: message },
            });
          }
        }
      }

      // Trial expiry reminders.
      const { data: expiringTrials } = await supabase
        .from("trial_access")
        .select("user_id,end_at,status")
        .eq("status", "active");
      for (const trial of expiringTrials ?? []) {
        const endAt = new Date(trial.end_at as string);
        const delta = endAt.getTime() - now.getTime();
        let kind: "trial_expiry_24h" | "trial_expiry_2h" | null = null;
        if (inWindow(delta, 24 * 60 * 60 * 1000, 10 * 60 * 1000)) kind = "trial_expiry_24h";
        else if (inWindow(delta, 2 * 60 * 60 * 1000, 10 * 60 * 1000)) kind = "trial_expiry_2h";
        if (!kind) continue;

        if (await alreadySent(supabase, `${kind}:${trial.user_id}`, null, trial.user_id as string)) {
          continue;
        }

        const userRes = await supabase.auth.admin.getUserById(trial.user_id as string);
        const email = userRes.data.user?.email;
        if (!email) continue;

        const subject =
          kind === "trial_expiry_24h"
            ? "Your 2-day trial expires in 24 hours"
            : "Your 2-day trial expires in 2 hours";
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
            <h2>Trial Expiry Reminder</h2>
            <p>Your limited-access trial is ending soon.</p>
            <p><a href="https://www.tradingsmart.ai/pricing" style="display:inline-block;padding:10px 14px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;">View Plans</a></p>
            <p>You can also book a demo call from your dashboard.</p>
          </div>
        `;
        const text = "Your limited-access trial is ending soon. View plans: https://www.tradingsmart.ai/pricing";
        const provider = await sendEmail({
          apiKey: resendApiKey,
          from: resendFrom,
          to: email,
          subject,
          html,
          text,
        });
        await logEmailEvent(supabase, {
          user_id: trial.user_id as string,
          email,
          template_key: `${kind}:${trial.user_id}`,
          scheduled_for: endAt.toISOString(),
          sent_at: new Date().toISOString(),
          status: "sent",
          provider_response_json: provider,
        });
        sentCount += 1;
      }

      return json({ ok: true, sent: sentCount, skipped: skippedCount });
    }

    return json({ ok: false, message: "Invalid action" }, 400);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return json({ ok: false, message }, 500);
  }
});
