/**
 * Automatic Apixis world agent for NEW product accounts — shared logic every Ixis product copies as
 * lib/apixis-world-agent.ts (Grok Developer Bot, 2026-09-28; first shipped in Renoxis #28).
 *
 * Right after a new account exists (first signed-in app load after signup / first Apixis ID sign-in),
 * the product's SERVER asks Apixis.dev to create that person's own world agent (default Apixis body,
 * customizable hair/outfit/colors, 200 in-world Ixis once) via lib/apixis-world-provision.ts, then
 * records it on the user (Supabase: app_metadata.apixis_world_agent_at / _id / _name) so later loads
 * skip the call. Apixis.dev is idempotent by verified email, so a retry never creates a second agent
 * or a second grant. The app then shows the one-time "Your agent is ready" card until the person
 * enters (enterApixisUrl(client)) or dismisses it (app_metadata.apixis_world_welcome_at).
 *
 * Pure logic, no framework imports (unit-testable with node --test).
 */
import type { ApixisWorldAgentResult } from "./apixis-world-provision";

/** Accounts created before this are not auto-provisioned (their agent is created when they enter). */
export const WORLD_AGENT_ROLLOUT_AT = "2026-09-28T05:00:00.000Z"; // 2026-09-28 00:00 CT

export type WorldAgentUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export type WorldAgentView = {
  /** "ready": agent exists on Apixis.dev; "invite": no agent yet (created when they enter). */
  status: "ready" | "invite";
  agentName: string | null;
  /** Show the welcome card (not dismissed, and for "invite" only on new accounts or legacy first run). */
  showWelcome: boolean;
  /** True when this account was created after the rollout (new-account flow). */
  newAccount: boolean;
  /** The person already entered or chose "Not now". */
  dismissed: boolean;
};

function meta(user: WorldAgentUser): Record<string, unknown> {
  return (user.app_metadata ?? {}) as Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function isNewAccount(user: WorldAgentUser, rolloutAt = WORLD_AGENT_ROLLOUT_AT): boolean {
  const created = Date.parse(user.created_at ?? "");
  return Number.isFinite(created) && created >= Date.parse(rolloutAt);
}

/** Email proven: confirmed in Supabase, or the account came from Apixis ID (Wallet-verified). */
export function hasVerifiedEmail(user: WorldAgentUser): boolean {
  return Boolean(user.email && (user.email_confirmed_at || str(meta(user).apixis_sub)));
}

export function worldAgentView(user: WorldAgentUser, rolloutAt = WORLD_AGENT_ROLLOUT_AT): WorldAgentView {
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

/** Should the server call Apixis.dev for this user now? Only new, verified accounts without the flag. */
export function needsProvision(user: WorldAgentUser, rolloutAt = WORLD_AGENT_ROLLOUT_AT): boolean {
  return !str(meta(user).apixis_world_agent_at) && isNewAccount(user, rolloutAt) && hasVerifiedEmail(user);
}

export type EnsureDeps = {
  /** Apixis.dev enter client key, e.g. "socixis". */
  client: string;
  provision: (input: { client: string; email: string; apixisSub: string | null; displayName: string | null }) => Promise<ApixisWorldAgentResult>;
  saveAppMetadata: (userId: string, appMetadata: Record<string, unknown>) => Promise<void>;
  now?: () => Date;
};

/**
 * Provision once and record it. Never throws: a failure leaves the flag unset so the next load
 * retries, and the card still offers /enter (which also creates the agent).
 */
export async function ensureWorldAgent(user: WorldAgentUser, deps: EnsureDeps, rolloutAt = WORLD_AGENT_ROLLOUT_AT): Promise<WorldAgentView> {
  if (!needsProvision(user, rolloutAt)) return worldAgentView(user, rolloutAt);
  try {
    const m = meta(user);
    const displayName = str(user.user_metadata?.full_name) ?? str(user.user_metadata?.name);
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
    console.error("Apixis world agent provision error:", (err as Error)?.message ?? "");
    return worldAgentView(user, rolloutAt);
  }
}

/** app_metadata patch when the person enters the world or dismisses the card. */
export function welcomeSeenMetadata(current: Record<string, unknown> | null | undefined, action: "enter" | "dismiss", now = new Date()): Record<string, unknown> {
  return { ...(current ?? {}), apixis_world_welcome_at: now.toISOString(), apixis_world_welcome_action: action };
}
