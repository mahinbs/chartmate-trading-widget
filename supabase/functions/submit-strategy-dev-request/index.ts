/**
 * submit-strategy-dev-request — record a strategy build request + email ops inbox.
 *
 * Body (JSON): {
 *   strategy_name, description?, market?, priority?, contact_email?,
 *   document_object_path?  // must be storage path under {user_id}/... in bucket strategy-dev-docs
 * }
 */ import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function etaFromPriority(priority: string): string {
  const p = String(priority || "normal").toLowerCase();
  const days = p === "rush" ? 2 : p === "priority" ? 5 : 10;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  const headers = { "Content-Type": "application/json", ...corsHeaders };
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }
    const body = await req.json().catch(() => ({}));
    const strategy_name = String(body.strategy_name ?? "").trim();
    if (!strategy_name) {
      return new Response(JSON.stringify({ error: "strategy_name is required" }), {
        status: 400,
        headers,
      });
    }
    const description = String(body.description ?? "").trim() || null;
    const market = String(body.market ?? "").trim() || null;
    const priority = String(body.priority ?? "normal").trim() || "normal";
    const contact_email = String(body.contact_email ?? "").trim() || null;
    let document_object_path = body.document_object_path != null
      ? String(body.document_object_path).trim()
      : null;
    if (document_object_path) {
      const prefix = `${user.id}/`;
      if (!document_object_path.startsWith(prefix)) {
        return new Response(JSON.stringify({
          error: "document_object_path must be under your user folder in strategy-dev-docs",
        }), {
          status: 400,
          headers,
        });
      }
      const rel = document_object_path.slice(prefix.length);
      if (!rel) {
        return new Response(JSON.stringify({ error: "Invalid document_object_path" }), {
          status: 400,
          headers,
        });
      }
      const { data: files, error: listErr } = await supabase.storage.from("strategy-dev-docs").list(
        user.id,
        { limit: 200, sortBy: { column: "created_at", order: "desc" } },
      );
      const found = !listErr && (files ?? []).some((o) => o.name === rel);
      if (!found) {
        return new Response(JSON.stringify({
          error: "Uploaded document not found. Upload the PDF first, then submit.",
        }), {
          status: 400,
          headers,
        });
      }
    }
    const eta = etaFromPriority(priority);
    const { data: row, error: insErr } = await supabase
      .from("strategy_development_requests")
      .insert({
        user_id: user.id,
        strategy_name,
        description,
        market,
        priority,
        contact_email,
        document_object_path,
        status: "submitted",
        eta,
      })
      .select("id, created_at, eta, status")
      .single();
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers,
      });
    }
    const adminEmail = (Deno.env.get("STRATEGY_DEV_ADMIN_EMAIL") ?? "").trim();
    const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    const resendFrom = (Deno.env.get("RESEND_FROM_EMAIL") ?? "TradingSmart <noreply@trading-smart.ai>").trim();
    if (adminEmail && resendKey) {
      const dash = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://trading-smart.ai").replace(/\/$/, "");
      const html = `
        <h2>New strategy development request</h2>
        <p><strong>User</strong>: ${user.email ?? user.id}</p>
        <p><strong>Strategy</strong>: ${strategy_name}</p>
        <p><strong>Market</strong>: ${market ?? "—"}</p>
        <p><strong>Priority</strong>: ${priority}</p>
        <p><strong>Contact</strong>: ${contact_email ?? "—"}</p>
        <p><strong>Request id</strong>: ${row.id}</p>
        <p><strong>ETA (auto)</strong>: ${eta}</p>
        ${document_object_path ? `<p><strong>PDF path</strong>: ${document_object_path}</p>` : ""}
        <pre style="white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:8px">${description ?? "—"}</pre>
        <p>Open Supabase → <code>strategy_development_requests</code> to assign status and deliver.</p>
        <p><a href="${dash}">Site</a></p>
      `;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [adminEmail],
          subject: `[Strategy dev] ${strategy_name} — ${user.email ?? user.id}`,
          html,
        }),
      }).catch(() => {});
    }
    return new Response(JSON.stringify({ ok: true, request: row }), {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error("submit-strategy-dev-request:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers,
    });
  }
});
