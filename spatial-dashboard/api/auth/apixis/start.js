// Added 2026-09-27 (Grok Bot). /auth/apixis/start is rewritten here by vercel.json.
import { startApixisLogin } from "../../../lib/apixis-login.js";

export default function handler(req, res) {
  return startApixisLogin(req, res);
}
