import { validateTicket } from "../lib/core.js";
import { authContext, createSupportTicket, sendJson } from "../lib/supabaseServer.js";

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

  try {
    const body = await readBody(req);
    let ctx = null;
    if (req.headers.authorization || req.headers.Authorization) ctx = await authContext(req);
    const validated = validateTicket({ ...body, tenant_id: ctx?.tenant?.id ?? null });
    if (!validated.ok) return sendJson(res, 400, validated);
    const row = await createSupportTicket(validated.ticket);
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
