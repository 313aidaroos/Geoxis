// GET /api/feed-session → { ok, token, expires_at, profile } for the signed-in person (401 when signed out).
// Geoxis keeps its Supabase access token in the browser, so the feed page sends it as `Authorization: Bearer`.
// Mints a short-lived family-feed token (Apixis.dev /api/feed/session) with this site's server-only
// APIXIS_WORLD_KEY. The key never reaches the browser. Contract: Apixis.dev docs/FEED_API.md §1b.
import { getUserFromBearer } from "../lib/supabaseServer.js";
import { apixisSubOf } from "../lib/apixis-login.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || "").trim());
  if (!m) return res.status(401).json({ ok: false, error: "unauthorized" });
  let user = null;
  try { user = await getUserFromBearer(m[1]); } catch { user = null; }
  const sub = apixisSubOf(user);
  if (!user?.email || !sub) return res.status(401).json({ ok: false, error: "unauthorized" });
  const key = process.env.APIXIS_WORLD_KEY || "";
  if (!key) return res.status(503).json({ ok: false, error: "store_not_configured" });
  const base = (process.env.APIXIS_WORLD_API || "https://www.apixis.dev").replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/api/feed/session`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "x-apixis-client": "geoxis",
        "x-apixis-sub": sub,
        "x-apixis-email": user.email,
        "content-type": "application/json",
      },
      body: JSON.stringify({ display_name: user.user_metadata?.full_name || undefined }),
    });
    const data = await r.json().catch(() => ({ ok: false, error: "server_error" }));
    return res.status(r.status).json(data);
  } catch {
    return res.status(502).json({ ok: false, error: "server_error" });
  }
}
