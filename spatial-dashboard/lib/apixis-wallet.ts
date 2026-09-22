/**
 * Apixis Wallet — shared server-side client for sister sites.
 *
 * Copy this ONE file into your repo (lib/apixis-wallet.ts). Do not fork the logic.
 * Runs on the SERVER only (Route Handler / Server Action). Never import from a
 * client component: it reads WALLET_API_KEY, which must never reach a browser.
 *
 * Env (already set on every family Vercel project):
 *   WALLET_API_KEY          service bearer for money routes
 *   APIXIS_WALLET_API_URL   https://apixis-wallet.vercel.app
 *
 * Rules this client enforces so you don't have to remember them:
 *   - Wallet is the single source of truth for what a user owns. Read entitlements
 *     from here; never author your own authoritative balance or ownership.
 *   - Every redeem = quote → reserve → (you provision) → capture, or release on ANY
 *     failure. `redeem()` does that dance for you and never leaves a hold dangling.
 *   - Identity is the verified EMAIL, not the uid (uids differ per Supabase project).
 *   - Idempotency keys are stable per attempt: retrying the same attempt is safe.
 *   - 402 is a normal outcome ("not enough Ixis"), not an error. Show a Buy Ixis link.
 *   - Never fake success. If the Wallet is unreachable, say so.
 */

const BASE = (process.env.APIXIS_WALLET_API_URL ?? "https://apixis-wallet.vercel.app").replace(/\/$/, "");
const KEY = process.env.WALLET_API_KEY ?? process.env.APIXIS_WALLET_API_KEY ?? "";

export type Quote = { productKey: string; app: string; name: string; ixis: number; usd: number };
export type Reservation = { reservationId: string; status: "held"; productKey: string; ixis: number };
export type Entitlement = {
  id: string;
  owner_id: string;
  app_slug: string;
  product_key: string;
  status: "active" | string;
  xp_price: number | null;
  renews_at: string | null;
  created_at: string;
};

export class WalletError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
  /** Customer has fewer Ixis than the product costs. Show "Buy Ixis". */
  get insufficient() { return this.status === 402; }
}

export function isWalletConfigured(): boolean {
  return KEY.length > 20;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!isWalletConfigured()) throw new WalletError(503, "Wallet not configured on this server (WALLET_API_KEY missing)");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error page */ }
  if (!res.ok) throw new WalletError(res.status, json?.error ?? `Wallet ${res.status}`, json);
  return json as T;
}

/** Public price check. No auth needed. Use it to render prices from the one canonical catalog. */
export async function quote(productKey: string): Promise<Quote> {
  const res = await fetch(`${BASE}/api/v1/quotes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productKey }),
    cache: "no-store",
  });
  if (!res.ok) throw new WalletError(res.status, `Unknown product ${productKey}`);
  return res.json();
}

/**
 * Put a hold on the customer's Ixis.
 * `ownerEmail` = the signed-in user's VERIFIED email from YOUR Supabase session (user.email),
 * never from the request body. Email is the family-wide identity: every site has its own
 * Supabase project, so uids differ per site and mean nothing to the Wallet.
 */
export async function reserve(ownerEmail: string, productKey: string, idempotencyKey: string): Promise<Reservation> {
  return call("POST", "/api/v1/reservations", { productKey, idempotencyKey, owner_email: ownerEmail });
}

export async function capture(reservationId: string) {
  return call<{ reservationId: string; status: "captured"; receiptId: string }>("POST", `/api/v1/reservations/${reservationId}/capture`);
}

export async function release(reservationId: string) {
  return call<{ reservationId: string; status: "released" }>("POST", `/api/v1/reservations/${reservationId}/release`);
}

/** What this user owns on your app. Wallet writes these on capture; you only read. */
export async function entitlements(ownerEmail: string, app: string): Promise<Entitlement[]> {
  const r = await call<{ entitlements: Entitlement[] }>("GET", `/api/v1/entitlements?app=${encodeURIComponent(app)}&owner_email=${encodeURIComponent(ownerEmail)}`);
  return r.entitlements ?? [];
}

export async function hasEntitlement(ownerEmail: string, app: string, productKey: string): Promise<boolean> {
  const list = await entitlements(ownerEmail, app);
  return list.some((e) => e.product_key === productKey && e.status === "active");
}

/**
 * The whole redeem, done right:
 *   reserve → provision() → capture; if provision() throws or capture fails → release, rethrow.
 * `provision` is YOUR side effect (create the subscription row, unlock the file, start the job).
 * It runs while the Ixis are held, so a crash never charges without delivering.
 *
 * Returns { ok:true, receiptId } or { ok:false, insufficient:true } for the 402 case.
 */
export async function redeem<T>(opts: {
  /** user.email from YOUR Supabase session — the family-wide identity. */
  ownerEmail: string;
  productKey: string;
  idempotencyKey: string;
  provision: (reservation: Reservation) => Promise<T>;
}): Promise<{ ok: true; receiptId: string; result: T } | { ok: false; insufficient: true; needed: number; message: string }> {
  let held: Reservation;
  try {
    held = await reserve(opts.ownerEmail, opts.productKey, opts.idempotencyKey);
  } catch (e) {
    if (e instanceof WalletError && e.insufficient) {
      const q = await quote(opts.productKey).catch(() => null);
      return { ok: false, insufficient: true, needed: q?.ixis ?? 0, message: e.message };
    }
    throw e;
  }
  try {
    const result = await opts.provision(held);
    const cap = await capture(held.reservationId);
    return { ok: true, receiptId: cap.receiptId, result };
  } catch (e) {
    await release(held.reservationId).catch(() => { /* already settled or wallet down; ledger stays consistent */ });
    throw e;
  }
}

/** Where to send someone who needs more Ixis. Returns them to `returnUrl` after purchase. */
export function buyIxisUrl(product: string, returnUrl: string): string {
  const u = new URL(`${BASE}/buy`);
  u.searchParams.set("product", product);
  u.searchParams.set("return_url", returnUrl);
  return u.toString();
}
