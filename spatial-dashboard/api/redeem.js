import { authContext, sendJson } from "../lib/supabaseServer.js";
import { redeem, isWalletConfigured } from "../lib/apixis-wallet.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });

  // Auth check BEFORE reading body
  const ctx = await authContext(req).catch(() => null);
  if (!ctx) return sendJson(res, 401, { error: "not_authenticated" });

  if (!isWalletConfigured()) {
    return sendJson(res, 503, { error: "wallet_not_configured", message: "Wallet API key is missing." });
  }

  try {
    const body = await readBody(req);
    const { productKey, attemptId } = body;

    if (!productKey || typeof productKey !== "string") {
      return sendJson(res, 400, { error: "missing_product_key" });
    }

    if (!attemptId || typeof attemptId !== "string" || attemptId.length > 80) {
      return sendJson(res, 400, { error: "invalid_attempt_id", message: "attemptId required, max 80 chars" });
    }

    // Use verified email as owner identity (not uid, which differs per Supabase project)
    const ownerEmail = ctx.user.email;
    // Idempotency key: user + product + client attemptId (stable per click retry)
    const idempotencyKey = `geoxis-${ctx.user.id.slice(0, 8)}-${productKey}-${attemptId}`.slice(0, 80);

    const result = await redeem({
      ownerEmail,
      productKey,
      idempotencyKey,
      provision: async () => {
        // TODO: Write entitlement/subscription row here
        return { success: true };
      },
      unprovision: async () => {
        // TODO: Delete the entitlement/subscription row written in provision
      },
    });

    if (!result.ok) {
      return sendJson(res, 402, {
        error: "insufficient_ixis",
        message: result.message || "Not enough Ixis.",
        needed: result.needed,
      });
    }

    return sendJson(res, 200, {
      success: true,
      entitlementId: result.entitlementId,
      message: "Plan activated successfully!",
    });
  } catch (err) {
    if (err.status === 402) {
      return sendJson(res, 402, {
        error: "insufficient_ixis",
        message: "Not enough Ixis. Buy Ixis in Apixis Wallet.",
      });
    }
    console.error("[redeem] error:", err);
    return sendJson(res, err.status || 500, {
      error: "redeem_failed",
      message: err.message || "Redemption failed.",
    });
  }
}
