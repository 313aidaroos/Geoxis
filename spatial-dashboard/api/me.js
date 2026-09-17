import { authContext, sendJson } from "../lib/supabaseServer.js";

export default async function handler(req, res) {
  try {
    const ctx = await authContext(req);
    if (!ctx) return sendJson(res, 401, { error: "not_authenticated" });
    return sendJson(res, 200, ctx, { "Cache-Control": "no-store" });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message || "me_failed" });
  }
}
