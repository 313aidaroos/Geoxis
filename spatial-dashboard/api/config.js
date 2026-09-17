import { OWNER_EMAIL, SUPPORT_INBOX } from "../lib/core.js";
import { envConfig, sendJson } from "../lib/supabaseServer.js";

export default function handler(req, res) {
  const cfg = envConfig();
  sendJson(res, 200, {
    supabaseUrl: cfg.url,
    supabaseAnonKey: cfg.anonKey,
    ownerEmail: OWNER_EMAIL,
    supportInbox: SUPPORT_INBOX,
    cixyAvailable: Boolean(cfg.anthropicKey),
  }, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
}
