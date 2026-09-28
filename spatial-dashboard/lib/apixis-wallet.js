/**
 * Apixis Wallet — shared server-side client (JS version).
 * Stripped TypeScript for Geoxis. Do not fork the logic.
 */

const BASE = (process.env.APIXIS_WALLET_API_URL ?? "https://apixis-wallet.vercel.app").replace(/\/$/, "");
const KEY = process.env.WALLET_API_KEY ?? process.env.APIXIS_WALLET_API_KEY ?? "";

export class WalletError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
  get insufficient() { return this.status === 402; }
}

export function isWalletConfigured() {
  return KEY.length > 20;
}

async function call(method, path, body) {
  if (!isWalletConfigured()) throw new WalletError(503, "Wallet not configured (WALLET_API_KEY missing)");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  if (!res.ok) throw new WalletError(res.status, json?.error ?? `Wallet ${res.status}`, json);
  return json;
}

export async function quote(productKey) {
  const res = await fetch(`${BASE}/api/v1/quotes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productKey }),
    cache: "no-store",
  });
  if (!res.ok) throw new WalletError(res.status, `Unknown product ${productKey}`);
  return res.json();
}

export async function reserve(ownerEmail, productKey, idempotencyKey) {
  return call("POST", "/api/v1/reservations", { productKey, idempotencyKey, owner_email: ownerEmail });
}

export async function capture(reservationId) {
  return call("POST", `/api/v1/reservations/${reservationId}/capture`);
}

export async function release(reservationId) {
  return call("POST", `/api/v1/reservations/${reservationId}/release`);
}

export async function entitlements(ownerEmail, app) {
  const r = await call("GET", `/api/v1/entitlements?app=${encodeURIComponent(app)}&owner_email=${encodeURIComponent(ownerEmail)}`);
  return r.entitlements ?? [];
}

export async function hasEntitlement(ownerEmail, app, productKey) {
  const list = await entitlements(ownerEmail, app);
  return list.some((e) => e.product_key === productKey && e.status === "active");
}

export async function redeem(opts) {
  let held;
  try {
    held = await reserve(opts.ownerEmail, opts.productKey, opts.idempotencyKey);
  } catch (e) {
    if (e instanceof WalletError && e.insufficient) {
      return { ok: false, insufficient: true, needed: e.body?.ixis ?? 0, message: e.message };
    }
    throw e;
  }

  try {
    const result = await opts.provision(held);
    const receipt = await capture(held.reservationId);
    return { ok: true, receiptId: receipt.receiptId, entitlementId: receipt.entitlementId, result };
  } catch (err) {
    // Capture failed after provision — undo the provision before releasing hold
    if (opts.unprovision) {
      try {
        await opts.unprovision();
      } catch (unprovErr) {
        console.error("[wallet] unprovision failed:", unprovErr);
      }
    }
    try {
      await release(held.reservationId);
    } catch { /* release failed; auto-release will kick in */ }
    throw err;
  }
}

// ---------------------------------------------------------------- SDK v3 additions (2026-09-27, Grok Bot)
// JS port of ApixisWallet SDK v3 (lib/apixis-wallet.ts, 2026-09-23): Apixis ID sign-in + shared balance.
// Existing functions above are unchanged (redeem still uses the verified email).

const OWNER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** owner = Apixis ID `sub` (preferred) or the VERIFIED email from this site's session. */
export function ownerQuery(owner) {
  const value = String(owner || "").trim();
  return OWNER_UUID.test(value) ? `owner_id=${encodeURIComponent(value)}` : `owner_email=${encodeURIComponent(value)}`;
}

/** The person's ONE family balance ({ currency, available, paid, bonus, reserved, usd, history }). */
export async function walletBalance(owner, { history = 0 } = {}) {
  const n = Math.max(0, Math.min(Number(history) || 0, 50));
  return call("GET", `/api/v1/balance?${ownerQuery(owner)}&history=${n}`);
}

/** Where to send the browser to sign in. `state` must also be kept in an httpOnly cookie. */
export function apixisLoginUrl({ state, redirectUri, clientId }) {
  const u = new URL(`${BASE}/sso/authorize`);
  u.searchParams.set("client_id", clientId ?? process.env.APIXIS_CLIENT_ID ?? "geoxis");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Server side, in the callback: trade the one-time `code` for { sub, email, email_verified }. Single use. */
export async function exchangeLoginCode(code, redirectUri) {
  return call("POST", "/api/sso/token", { code, redirect_uri: redirectUri });
}

/** "Buy Ixis" link; the Wallet sends the person back to `returnUrl`. */
export function buyIxisUrl(product, returnUrl) {
  const u = new URL(`${BASE}/buy`);
  u.searchParams.set("product", product);
  u.searchParams.set("return_url", returnUrl);
  return u.toString();
}
