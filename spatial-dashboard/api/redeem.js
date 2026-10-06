// Change note (Claude, Sep 2026): 'Not on sale' instead of an error. See docs/LAUNCH_NOTES.md.
// Change note (Claude, Oct 2026): provision/unprovision now write the entitlement row (sql/004) instead of a TODO.
import { authContext, deleteWhere, patchWhere, sendJson, upsert } from "../lib/supabaseServer.js";
import { redeem, isWalletConfigured } from "../lib/apixis-wallet.js";
import { entitlementExpiry } from "../lib/ingest.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

// geoxis.tracking.* and geoxis.export.report are in the Wallet catalog and provision writes the access row
// (public.entitlements, sql/004). Awad flips this when Geoxis is ready to sell (OWNER_CHECKLIST).
const PLANS_ON_SALE = false;

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

    if (!PLANS_ON_SALE) {
      return sendJson(res, 409, { error: "not_on_sale", message: "Geoxis plans open soon. Nothing was charged." });
    }

    if (!attemptId || typeof attemptId !== "string" || attemptId.length > 80) {
      return sendJson(res, 400, { error: "invalid_attempt_id", message: "attemptId required, max 80 chars" });
    }

    // Billing identity: the Apixis ID `sub` saved at Apixis sign-in, else the verified email.
    // Never the local uid — it differs per Supabase project.
    const apixisSub = ctx.user.app_metadata?.apixis_sub;
    const owner = typeof apixisSub === "string" && apixisSub ? apixisSub : ctx.user.email;
    if (!owner) return sendJson(res, 401, { error: "email_not_verified" });
    // Idempotency key: user + product + client attemptId (stable per click retry)
    const idempotencyKey = `geoxis-${ctx.user.id.slice(0, 8)}-${productKey}-${attemptId}`.slice(0, 80);

    let reservationId = null;
    const result = await redeem({
      owner,
      productKey,
      idempotencyKey,
      // Runs after the Wallet hold and before capture: grant the access this product promises.
      provision: async (held) => {
        reservationId = String(held.reservationId);
        // Upsert on reservation_id: a retried click returns the same Wallet hold and must not fail or duplicate.
        const row = await upsert("entitlements", {
          tenant_id: ctx.tenant.id,
          user_id: ctx.user.id,
          owner,
          product_key: productKey,
          reservation_id: reservationId,
          status: "active",
          expires_at: entitlementExpiry(productKey),
        }, "reservation_id");
        return { entitlementRowId: row.id };
      },
      // Capture failed → the person was not charged, so take the access back before the hold is released.
      // Only a row with no receipt: a captured hold means charged (family rule 3), that access is never removed here.
      unprovision: async () => {
        if (reservationId) await deleteWhere("entitlements", `reservation_id=eq.${encodeURIComponent(reservationId)}&receipt_id=is.null`);
      },
    });

    if (!result.ok) {
      return sendJson(res, 402, {
        error: "insufficient_ixis",
        message: result.message || "Not enough Ixis.",
        needed: result.needed,
      });
    }

    // Captured = charged (family rule 3). Record the Wallet receipt on the access row; never undo it from here.
    if (reservationId) {
      await patchWhere("entitlements", `reservation_id=eq.${encodeURIComponent(reservationId)}`, {
        receipt_id: result.receiptId ?? null,
        wallet_entitlement_id: result.entitlementId ?? null,
      }).catch((e) => console.error("[redeem] receipt save failed:", e));
    }

    return sendJson(res, 200, {
      success: true,
      entitlementId: result.entitlementId,
      receiptId: result.receiptId,
      expiresAt: entitlementExpiry(productKey),
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
