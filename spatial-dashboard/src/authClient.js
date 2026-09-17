export const TOKEN_KEY = "geoxis.session.access_token";
export const USER_KEY = "geoxis.session.user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function clearSession() {
  setToken("");
  localStorage.removeItem(USER_KEY);
}

export function consumeAuthHash(hash = window.location.hash) {
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(text);
  const token = params.get("access_token");
  if (!token) return "";
  setToken(token);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}

export async function config() {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw new Error("config_failed");
  return res.json();
}

export async function requestMagicLink(email) {
  const cfg = await config();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error("auth_not_configured");
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      create_user: true,
      should_create_user: true,
      email_redirect_to: `${location.origin}/login.html`,
    }),
  });
  if (!res.ok) throw new Error("magic_link_failed");
  return true;
}

export async function loadMe() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch("/api/me", { headers: authHeader(), cache: "no-store" });
  if (res.status === 401) {
    clearSession();
    return null;
  }
  if (!res.ok) throw new Error("me_failed");
  const me = await res.json();
  localStorage.setItem(USER_KEY, JSON.stringify(me));
  return me;
}
