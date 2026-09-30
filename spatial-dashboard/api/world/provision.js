// Provision world agent on first sign-in (Geoxis Bot, 2026-09-30)
import { authContext, sendJson, envConfig } from "../lib/supabaseServer.js";
import { provisionWorldAgent, hasWorldAgent } from "../lib/apixis-world.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    // Must be signed in
    const ctx = await authContext(req).catch(() => null);
    if (!ctx) {
      return sendJson(res, 401, { error: "not_authenticated" });
    }

    const user = ctx.user;

    // Already provisioned?
    if (hasWorldAgent(user)) {
      const existing = user.app_metadata.world_agent;
      return sendJson(res, 200, {
        ok: true,
        created: false,
        agent: existing.agent,
        citizen_id: existing.citizen_id,
        enter_url: existing.enter_url,
      });
    }

    // Provision now
    const result = await provisionWorldAgent({
      email: user.email,
      email_verified: user.email_confirmed_at != null,
      display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      apixis_sub: user.app_metadata?.apixis_sub || null,
    });

    if (!result.ok) {
      return sendJson(res, result.status || 500, {
        ok: false,
        error: result.error,
        message: result.message || null,
      });
    }

    // Persist in user metadata so we don't provision twice
    const cfg = envConfig();
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        world_agent: {
          citizen_id: result.citizen_id,
          agent: result.agent,
          enter_url: result.enter_url,
          provisioned_at: new Date().toISOString(),
        },
      },
    });

    if (updateError) {
      console.error("[provision] failed to persist:", updateError);
      // Still return success - provision happened even if metadata write failed
    }

    return sendJson(res, 200, {
      ok: true,
      created: result.created,
      agent: result.agent,
      citizen_id: result.citizen_id,
      enter_url: result.enter_url,
      starter_ixis: result.starter_ixis,
    });
  } catch (err) {
    console.error("[provision] error:", err);
    return sendJson(res, 500, {
      ok: false,
      error: "provision_failed",
      message: err.message,
    });
  }
}
