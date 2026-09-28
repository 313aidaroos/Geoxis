// Added 2026-09-27 (Grok Bot, balance pill). GET /api/wallet/balance
// The signed-in user's Apixis Wallet balance for the header pill (Bearer session token, like /api/me).
//   200 { available, linked, buy }        linked = signed in with Apixis ID (owner = Apixis `sub`)
//   401 { available: null, signIn: true } no session → the pill shows "Sign in with Apixis"
import { getUserFromBearer, sendJson } from "../../lib/supabaseServer.js";
import { buyIxisUrl, walletBalance, WalletError } from "../../lib/apixis-wallet.js";
import { apixisSubOf, siteUrl } from "../../lib/apixis-login.js";

export default async function handler(req, res) {
  const headers = { "Cache-Control": "private, no-store" };
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, headers);
  const buy = buyIxisUrl("geoxis", `${siteUrl()}/`);
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || "").trim());
  const user = match ? await getUserFromBearer(match[1]).catch(() => null) : null;
  if (!user?.email) return sendJson(res, 401, { available: null, buy, signIn: true }, headers);

  const sub = apixisSubOf(user);
  const linked = Boolean(sub);
  try {
    const balance = await walletBalance(sub || user.email);
    return sendJson(res, 200, { currency: "Ixis", available: Number(balance.available ?? 0), linked, buy }, headers);
  } catch (err) {
    if (err instanceof WalletError && (err.status === 403 || err.status === 404)) {
      return sendJson(res, 200, { available: null, linked: false, buy, signInWithApixis: true }, headers);
    }
    return sendJson(res, 503, { available: null, linked, buy, error: "Apixis Wallet is unreachable right now." }, headers);
  }
}
