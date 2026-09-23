import { validateTicket } from "../lib/core.js";
import { authContext, createSupportTicket, sendJson, envConfig } from "../lib/supabaseServer.js";
import { clientIp, rateLimited } from "../lib/rateLimit.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.end();
    return;
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  if (rateLimited(`support:${clientIp(req)}`, 5, 10 * 60 * 1000)) {
    return sendJson(res, 429, { error: "rate_limited", message: "Too many requests. Please wait a few minutes." });
  }

  try {
    const body = await readBody(req);
    let ctx = null;
    if (req.headers.authorization || req.headers.Authorization) ctx = await authContext(req);
    const validated = validateTicket({ ...body, tenant_id: ctx?.tenant?.id ?? null });
    if (!validated.ok) return sendJson(res, 400, validated);
    const row = await createSupportTicket(validated.ticket);

    // Send email via Resend
    const cfg = envConfig();
    if (cfg.resendKey) {
      const subject = `[Geoxis Support] ${validated.ticket.subject}`;
      const html = `<p><strong>From:</strong> ${validated.ticket.email}</p>
<p><strong>Subject:</strong> ${validated.ticket.subject}</p>
<p><strong>Message:</strong></p>
<p>${validated.ticket.message.replace(/\n/g, "<br>")}</p>
<p><small>Tenant: ${validated.ticket.tenant_id || "public"} | Ticket ID: ${row.id}</small></p>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Geoxis <geoxis@apixis.dev>",
          to: validated.ticket.route_to,
          subject,
          html,
        }),
      });
    }

    return sendJson(res, 201, {
      ok: true,
      ticket: {
        id: row.id,
        status: row.status,
        inbox: row.inbox,
        route_to: row.route_to,
        created_at: row.created_at,
      },
    }, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: "support_failed", message: String(err?.message || err) });
  }
}
