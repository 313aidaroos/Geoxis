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
    try {
      await release(held.reservationId);
    } catch { /* release failed; auto-release will kick in */ }
    throw err;
  }
}
