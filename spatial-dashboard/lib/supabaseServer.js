import { isOwner, normalizeEmail, tenantSlugFor, filterAssetsForTenant } from "./core.js";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

export function envConfig(env = process.env) {
  return {
    url: env.SUPABASE_URL || "",
    anonKey: env.SUPABASE_ANON_KEY || "",
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    anthropicKey: env.ANTHROPIC_API_KEY || "",
    appUrl: env.APP_URL || "",
  };
}

export function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ ...jsonHeaders, ...headers })) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function requireSupabase(env = process.env) {
  const cfg = envConfig(env);
  if (!cfg.url || !cfg.anonKey || !cfg.serviceKey) {
    const err = new Error("supabase_not_configured");
    err.status = 503;
    throw err;
  }
  return cfg;
}

async function sbFetch(path, { method = "GET", body, token, service = false, headers = {} } = {}) {
  const cfg = requireSupabase();
  const key = service ? cfg.serviceKey : cfg.anonKey;
  const res = await fetch(`${cfg.url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      ...(body ? jsonHeaders : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || data?.error_description || data?.error || `supabase_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function getUserFromBearer(token) {
  if (!token) return null;
  return sbFetch("/auth/v1/user", { token });
}

async function selectOne(table, query) {
  const rows = await sbFetch(`/rest/v1/${table}?${query}&limit=1`, { service: true });
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function insertOne(table, row) {
  const rows = await sbFetch(`/rest/v1/${table}`, {
    method: "POST",
    service: true,
    body: row,
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function upsert(table, row, onConflict) {
  const q = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const rows = await sbFetch(`/rest/v1/${table}${q}`, {
    method: "POST",
    service: true,
    body: row,
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function ensureUserTenant(user) {
  const email = normalizeEmail(user?.email);
  if (!user?.id || !email) {
    const err = new Error("invalid_user");
    err.status = 401;
    throw err;
  }

  await upsert("profiles", { user_id: user.id, email, full_name: user.user_metadata?.full_name || null }, "user_id");

  const admin = isOwner(email);
  const slug = admin ? "geoxis-owner" : tenantSlugFor(email);
  let tenant = await selectOne("tenants", `slug=eq.${encodeURIComponent(slug)}&select=*`);
  if (!tenant) tenant = await insertOne("tenants", { slug, name: admin ? "Geoxis Owner" : slug.replaceAll("-", " ") });

  const role = admin ? "owner" : "member";
  await upsert("tenant_memberships", { tenant_id: tenant.id, user_id: user.id, email, role }, "tenant_id,user_id");
  return { user: { id: user.id, email }, tenant, role, admin };
}

export async function authContext(req) {
  const h = req?.headers?.authorization || req?.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  const token = match?.[1] || null;
  const user = await getUserFromBearer(token);
  if (!user) return null;
  return ensureUserTenant(user);
}

export async function listTenantAssets(tenantId) {
  const rows = await sbFetch(
    `/rest/v1/current_asset_positions?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*`,
    { service: true },
  );
  const mapped = (rows || []).map((r) => ({
    id: r.external_id,
    tenant_id: r.tenant_id,
    name: r.name,
    type: r.type,
    operator: r.operator,
    latitude: r.latitude,
    longitude: r.longitude,
    altitudeMeters: r.altitude_meters ?? 0,
    heading: r.heading ?? 0,
    course: r.heading ?? 0,
    headingChange: 0,
    speedMps: r.speed_mps ?? 0,
    speedKnots: +((r.speed_mps ?? 0) * 1.943844).toFixed(1),
    speedKph: +((r.speed_mps ?? 0) * 3.6).toFixed(1),
    destination: r.destination,
    cargo: r.cargo,
    odometerKm: 0,
    alarm: r.alarm,
    alarmReason: r.alarm_reason,
    source: "supabase",
    timestamp: r.recorded_at,
  }));
  return filterAssetsForTenant(mapped, tenantId);
}

export async function createSupportTicket(ticket) {
  return insertOne("support_tickets", {
    tenant_id: ticket.tenant_id,
    requester_email: ticket.email,
    subject: ticket.subject,
    message: ticket.message,
    inbox: ticket.inbox,
    route_to: ticket.route_to,
    status: ticket.status,
  });
}

export async function listSupportTickets() {
  return sbFetch("/rest/v1/support_tickets?select=*&order=created_at.desc&limit=100", { service: true });
}
