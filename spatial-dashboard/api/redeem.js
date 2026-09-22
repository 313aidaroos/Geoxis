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
    const { productKey } = body;

    if (!productKey || typeof productKey !== "string") {
      return sendJson(res, 400, { error: "missing_product_key" });
    }

    // Use verified email as owner identity (not uid, which differs per Supabase project)
    const ownerEmail = ctx.user.email;
    const idempotencyKey = `geoxis-${ctx.user.id}-${productKey}-${Date.now()}`;

    const result = await redeem({
      ownerEmail,
      productKey,
      idempotencyKey,
      provision: async () => {
        // Provision logic: create subscription row, grant entitlement
        // For now, just succeed (actual provisioning logic goes here)
        return { success: true };
      },
    });

    return sendJson(res, 200, {
      success: true,
      entitlementId: result.entitlementId,
      message: "Plan activated successfully!",
    });
  } catch (err) {
    // Wallet client throws WalletError with status + body
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
