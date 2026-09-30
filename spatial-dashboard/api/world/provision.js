// Automatic Apixis world agent provision endpoint (Geoxis, 2026-09-30)
// Simplified: call Apixis.dev directly + manage metadata
import { authContext, sendJson, envConfig } from "../lib/supabaseServer.js";

function meta(user) {
  return (user?.app_metadata ?? {});
}

function str(value) {
  return typeof value === "string" && value ? value : null;
}

function isNewAccount(user, rolloutAt = "2026-09-28T05:00:00.000Z") {
  const created = Date.parse(user?.created_at ?? "");
  return Number.isFinite(created) && created >= Date.parse(rolloutAt);
}

function hasVerifiedEmail(user) {
  const m = meta(user);
  return Boolean(user?.email && (user?.email_confirmed_at || str(m.apixis_sub)));
}

function needsProvision(user, rolloutAt = "2026-09-28T05:00:00.000Z") {
  const m = meta(user);
  return !str(m.apixis_world_agent_at) && isNewAccount(user, rolloutAt) && hasVerifiedEmail(user);
}

function worldAgentView(user, rolloutAt = "2026-09-28T05:00:00.000Z") {
  const m = meta(user);
  const ready = Boolean(str(m.apixis_world_agent_at));
  const dismissed = Boolean(str(m.apixis_world_welcome_at));
  const newAccount = isNewAccount(user, rolloutAt);
  return {
    status: ready ? "ready" : "invite",
    agentName: str(m.apixis_world_agent_name),
    showWelcome: !dismissed && (ready || newAccount),
    newAccount,
    dismissed,
  };
}

async function provisionApixisWorldAgent(input) {
  const key = process.env.APIXIS_WORLD_KEY ?? "";
  if (key.length < 24) return { ok: false, error: "apixis_world_key_missing" };
  const base = (process.env.APIXIS_WORLD_API || "https://www.apixis.dev").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 6000);
  try {
    const res = await fetch(`${base}/api/agent/provision`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: input.client,
        email: input.email,
        email_verified: input.emailVerified ?? true,
        apixis_sub: input.apixisSub || undefined,
        display_name: input.displayName || undefined,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({})));
    if (!res.ok || body.ok !== true) {
      return { ok: false, status: res.status, error: typeof body.error === "string" ? body.error : `http_${res.status}` };
    }
    return {
      ok: true,
      created: Boolean(body.created),
      starterGrantedNow: Boolean(body.starter_granted_now),
      starterIxis: Number(body.starter_ixis ?? 0),
      agent: (body.agent) ?? null,
      enterUrl: typeof body.enter_url === "string" ? body.enter_url : `https://www.apixis.dev/enter?from=${input.client}`,
    };
  } catch (err) {
    return { ok: false, error: (err).name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

async function ensureWorldAgent(user, deps, rolloutAt = "2026-09-28T05:00:00.000Z") {
  if (!needsProvision(user, rolloutAt)) return worldAgentView(user, rolloutAt);
  try {
    const m = meta(user);
    const displayName = str(user?.user_metadata?.full_name) ?? str(user?.user_metadata?.name);
    const result = await deps.provision({
      client: deps.client,
      email: String(user.email),
      apixisSub: str(m.apixis_sub),
      displayName,
    });
    if (!result.ok) {
      console.error("Apixis world agent provision failed:", result.error, result.status ?? "");
      return worldAgentView(user, rolloutAt);
    }
    const next = {
      ...m,
      apixis_world_agent_at: (deps.now?.() ?? new Date()).toISOString(),
      apixis_world_agent_id: result.agent?.id ?? null,
      apixis_world_agent_name: result.agent?.name ?? null,
    };
    await deps.saveAppMetadata(user.id, next);
    return worldAgentView({ ...user, app_metadata: next }, rolloutAt);
  } catch (err) {
    console.error("Apixis world agent provision error:", (err).message ?? "");
    return worldAgentView(user, rolloutAt);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    const ctx = await authContext(req).catch(() => null);
    if (!ctx) {
      return sendJson(res, 401, { error: "not_authenticated" });
    }

    const user = ctx.user;
    const cfg = envConfig();

    // Service role client for saving metadata
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);

    const result = await ensureWorldAgent(user, {
      client: "geoxis",
      provision: provisionApixisWorldAgent,
      saveAppMetadata: async (userId, appMetadata) => {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          app_metadata: appMetadata,
        });
        if (error) throw error;
      },
    });

    return sendJson(res, 200, {
      ok: true,
      status: result.status,
      agentName: result.agentName,
      showWelcome: result.showWelcome,
      newAccount: result.newAccount,
    });
  } catch (err) {
    console.error("[world/provision]", err);
    return sendJson(res, 500, {
      ok: false,
      error: "provision_failed",
      message: err.message,
    });
  }
}
