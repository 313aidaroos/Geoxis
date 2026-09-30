// Added 2026-09-29 (Grok, Geoxis Lead). One Apixis ID = one Wallet = one Apixis world agent.
// JS port of Apixis.dev sdk/apixis-world-provision.ts + Renoxis lib/renoxis/world-agent.ts (same flow).
//
// On first Apixis ID sign-in (and as a retry on the header pill's balance call), the server asks
// Apixis.dev POST /api/agent/provision (Bearer APIXIS_WORLD_KEY, from "geoxis") to create or reuse the
// person's OWN world agent (default customizable Apixis body; Cixy stays the guide) with 200 starter
// Ixis once. The id is stored on the Supabase auth user's app_metadata (apixis_world_agent_at / _id /
// _name; server-only, no migration), so later sign-ins skip the call. Apixis.dev is idempotent by
// verified email (one citizen per email, one agent per citizen, one starter grant), so a retry or a
// race never makes a second agent. SERVER ONLY: never import from src/.
//
// Env (server): APIXIS_WORLD_KEY (issued by the Developer Bot hub), APIXIS_WORLD_API (optional).
import { envConfig } from "./supabaseServer.js";

export const WORLD_CLIENT = "geoxis";
export const ENTER_URL = `https://www.apixis.dev/enter?from=${WORLD_CLIENT}`;

function str(value) {
  return typeof value === "string" && value ? value : null;
}

function meta(user) {
  return user?.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
}

/** Email proven: confirmed in Supabase, or the account came from Apixis ID (Wallet-verified). */
export function hasVerifiedEmail(user) {
  return Boolean(user?.email && (user.email_confirmed_at || str(meta(user).apixis_sub)));
}

/** What the header shows. `ready` = the agent exists on Apixis.dev and its id is stored on the user. */
export function worldAgentView(user) {
  const m = meta(user);
  return {
    ready: Boolean(str(m.apixis_world_agent_at)),
    id: str(m.apixis_world_agent_id),
    name: str(m.apixis_world_agent_name),
    enterUrl: ENTER_URL,
  };
}

/** Call Apixis.dev only for verified users without the stored flag (checked before every call). */
export function needsProvision(user) {
  return Boolean(user?.id) && !str(meta(user).apixis_world_agent_at) && hasVerifiedEmail(user);
}

/** POST /api/agent/provision. Never throws; { ok:false, error } when the key is missing or the hub fails. */
export async function provisionApixisWorldAgent(input, { env = process.env, fetchImpl = fetch } = {}) {
  const key = env.APIXIS_WORLD_KEY || "";
  if (key.length < 24) return { ok: false, error: "apixis_world_key_missing" };
  const base = String(env.APIXIS_WORLD_API || "https://www.apixis.dev").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 6000);
  try {
    const res = await fetchImpl(`${base}/api/agent/provision`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: WORLD_CLIENT,
        email: input.email,
        email_verified: true,
        apixis_sub: input.apixisSub || undefined,
        display_name: input.displayName || undefined,
      }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) || {};
    if (!res.ok || body.ok !== true) {
      return { ok: false, status: res.status, error: typeof body.error === "string" ? body.error : `http_${res.status}` };
    }
    return {
      ok: true,
      created: Boolean(body.created),
      starterGrantedNow: Boolean(body.starter_granted_now),
      starterIxis: Number(body.starter_ixis ?? 0),
      agent: body.agent || null,
      enterUrl: typeof body.enter_url === "string" ? body.enter_url : ENTER_URL,
    };
  } catch (err) {
    return { ok: false, error: err?.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Service-role write of the auth user's app_metadata (Supabase admin REST). */
export async function saveUserAppMetadata(userId, appMetadata) {
  const cfg = envConfig();
  if (!cfg.url || !cfg.serviceKey) throw new Error("supabase_not_configured");
  const res = await fetch(`${cfg.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ app_metadata: appMetadata }),
  });
  if (!res.ok) throw new Error(`save_app_metadata_${res.status}`);
}

/**
 * Provision once and record it. Never throws: a failure (e.g. key missing) leaves the flag unset so the
 * next sign-in / pill load retries, and the header still links to /enter (which also creates the agent).
 */
export async function ensureWorldAgent(user, deps = {}) {
  const provision = deps.provision || provisionApixisWorldAgent;
  const save = deps.saveAppMetadata || saveUserAppMetadata;
  if (!needsProvision(user)) return { user, view: worldAgentView(user), provisioned: false };
  try {
    const m = meta(user);
    const result = await provision({
      email: String(user.email).toLowerCase(),
      apixisSub: str(m.apixis_sub),
      displayName: str(user.user_metadata?.full_name) || str(user.user_metadata?.name),
    });
    if (!result.ok) {
      console.error("Apixis world agent provision failed:", result.error, result.status ?? "");
      return { user, view: worldAgentView(user), provisioned: false, error: result.error };
    }
    const next = {
      ...m,
      apixis_world_agent_at: (deps.now?.() ?? new Date()).toISOString(),
      apixis_world_agent_id: result.agent?.id ?? null,
      apixis_world_agent_name: result.agent?.name ?? null,
    };
    await save(user.id, next);
    const updated = { ...user, app_metadata: next };
    return { user: updated, view: worldAgentView(updated), provisioned: true, created: result.created };
  } catch (err) {
    console.error("Apixis world agent provision error:", err?.message ?? "");
    return { user, view: worldAgentView(user), provisioned: false, error: "provision_error" };
  }
}
