import { authContext, listSupportTickets, sendJson } from "../../lib/supabaseServer.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
  try {
    const ctx = await authContext(req);
    if (!ctx) return sendJson(res, 401, { error: "not_authenticated" });
    if (!ctx.admin) return sendJson(res, 403, { error: "owner_only" });
    const tickets = await listSupportTickets();
    return sendJson(res, 200, { tickets }, { "Cache-Control": "no-store" });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: "admin_support_failed", message: String(err?.message || err) });
  }
}
