// Automatic Apixis world agent provision endpoint (Geoxis, 2026-09-30)
// Based on Grok's kit: lib/apixis-world-agent.ts + lib/apixis-world-provision.ts
import { authContext, sendJson, envConfig } from "../lib/supabaseServer.js";

// Import the official SDK (TypeScript - will work in Node ESM)
async function loadSDK() {
  const { ensureWorldAgent, needsProvision } = await import("../lib/apixis-world-agent.js");
  const { provisionApixisWorldAgent } = await import("../lib/apixis-world-provision.js");
  return { ensureWorldAgent, needsProvision, provisionApixisWorldAgent };
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
    const { ensureWorldAgent, provisionApixisWorldAgent } = await loadSDK();
    const cfg = envConfig();

    // Service role client for saving metadata
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);

    const result = await ensureWorldAgent(user, {
      client: "geoxis",
      provision: async (input) => {
        return await provisionApixisWorldAgent({
          client: input.client,
          email: input.email,
          emailVerified: true, // authContext ensures email is verified
          apixisSub: input.apixisSub,
          displayName: input.displayName,
        });
      },
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
