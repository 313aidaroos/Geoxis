// Change note (Claude, Sep 2026): Rate limited. See docs/LAUNCH_NOTES.md.
import { cixyRequest } from "../lib/core.js";
import { authContext, listTenantAssets, sendJson, envConfig } from "../lib/supabaseServer.js";
import { snapshot } from "../lib/fleetEngine.js";
import { clientIp, rateLimited } from "../lib/rateLimit.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  const cfg = envConfig();
  if (!cfg.anthropicKey) return sendJson(res, 503, { error: "cixy_unavailable", message: "ANTHROPIC_API_KEY is not configured." });

  try {
    const body = await readBody(req);
    let ctx = null;
    let assets = [];
    const signedIn = Boolean(req.headers.authorization || req.headers.Authorization);
    // Public demo chat is capped harder than signed-in tenants.
    if (rateLimited(`cixy:${clientIp(req)}`, signedIn ? 60 : 15, 10 * 60 * 1000)) {
      return sendJson(res, 429, { error: "rate_limited", message: "Too many messages. Please wait a few minutes." });
    }
    if (signedIn) {
      ctx = await authContext(req);
      if (!ctx) return sendJson(res, 401, { error: "unauthorized" });
      assets = await listTenantAssets(ctx.tenant.id);
    } else {
      const live = await snapshot();
      assets = live.assets;
    }
    const reqSpec = cixyRequest({ apiKey: cfg.anthropicKey, messages: body.messages, context: { tenant: ctx?.tenant?.slug || "public-demo", assets } });
    if (reqSpec.status !== 200) return sendJson(res, reqSpec.status, { error: reqSpec.error });

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(reqSpec.body),
    });
    const data = await upstream.json();
    if (!upstream.ok) return sendJson(res, upstream.status, { error: "anthropic_failed", detail: data?.error?.message || data?.error || data });
    const text = (data.content || []).map((p) => p?.text || "").join("\n").trim();
    return sendJson(res, 200, { text, usage: data.usage || null }, { "Cache-Control": "no-store" });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: "cixy_failed", message: String(err?.message || err) });
  }
}
