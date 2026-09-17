import { snapshot } from "../lib/fleetEngine.js";
import { authContext, listTenantAssets, sendJson } from "../lib/supabaseServer.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.end();
    return;
  }
  if (req.method && req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  }

  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (auth) {
      const ctx = await authContext(req);
      if (!ctx) return sendJson(res, 401, { error: "not_authenticated" });
      const assets = await listTenantAssets(ctx.tenant.id);
      return sendJson(res, 200, {
        sentAt: Date.now(),
        tenant: ctx.tenant,
        sources: { tenant: "supabase" },
        assets,
      }, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    }

    const body = await snapshot();
    return sendJson(res, 200, body, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: "assets_failed", message: String(err?.message || err) });
  }
}
