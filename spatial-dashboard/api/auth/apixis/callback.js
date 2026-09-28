// Added 2026-09-27 (Grok Bot). /auth/apixis/callback is rewritten here by vercel.json
// (both URLs are registered with the Wallet for the `geoxis` client).
import { finishApixisLogin } from "../../../lib/apixis-login.js";

export default function handler(req, res) {
  return finishApixisLogin(req, res);
}
