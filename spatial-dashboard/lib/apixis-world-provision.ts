/**
 * Automatic Apixis world agent at signup — SERVER ONLY (reads APIXIS_WORLD_KEY). Never import from a
 * client component. Copy into each Ixis product as lib/apixis-world-provision.ts, next to
 * lib/apixis-world.ts. Added 2026-09-28 by Grok Developer Bot.
 *
 * Call it once, right after a NEW account exists and its email is verified (first successful
 * signup / first sign-in). Keep a per-user flag (e.g. app_metadata.apixis_world_agent_at) so later
 * sign-ins skip the call; Apixis.dev is idempotent anyway (one citizen per email, one agent per
 * citizen, 1,000 starter Ixis once), so a retry never makes a second agent or a second grant.
 *
 *   const r = await provisionApixisWorldAgent({ client: "renoxis", email, apixisSub });
 *   if (r.ok) await markUser({ apixis_world_agent_at: new Date().toISOString(), apixis_world_agent_id: r.agent.id });
 *
 * Then show "Your agent is ready. Enter the Apixis world" linking to enterApixisUrl("<client>")
 * (lib/apixis-world.ts). Entering signs in with Apixis ID and lands in the world with
 * "Back to <product>".
 *
 * Env (product's Vercel project, server only):
 *   APIXIS_WORLD_KEY   this product's key; Apixis.dev keeps only its SHA-256 in APIXIS_WORLD_KEYS
 *   APIXIS_WORLD_API   optional, default https://www.apixis.dev
 */

export type ApixisWorldAgent = { id: string; name: string; status: string; ixix_balance: number };

export type ApixisWorldAgentResult =
  | {
      ok: true;
      created: boolean;
      starterGrantedNow: boolean;
      starterIxis: number;
      agent: ApixisWorldAgent | null;
      enterUrl: string;
    }
  | { ok: false; error: string; status?: number };

export async function provisionApixisWorldAgent(input: {
  client: string;
  email: string;
  /** Only pass true when the product has verified the email. */
  emailVerified?: boolean;
  apixisSub?: string | null;
  displayName?: string | null;
  timeoutMs?: number;
}): Promise<ApixisWorldAgentResult> {
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
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.ok !== true) {
      return { ok: false, status: res.status, error: typeof body.error === "string" ? body.error : `http_${res.status}` };
    }
    return {
      ok: true,
      created: Boolean(body.created),
      starterGrantedNow: Boolean(body.starter_granted_now),
      starterIxis: Number(body.starter_ixis ?? 0),
      agent: (body.agent as ApixisWorldAgent | undefined) ?? null,
      enterUrl: typeof body.enter_url === "string" ? body.enter_url : `https://www.apixis.dev/enter?from=${input.client}`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error)?.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
