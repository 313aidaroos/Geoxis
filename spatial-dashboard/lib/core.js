/**
 * Pure helpers shared by the Vercel functions. No network here so they
 * are unit-testable with node:test.
 */

export const OWNER_EMAIL = "awad@apixis.dev";
export const SUPPORT_INBOX = "geoxis@apixis.dev";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input) {
  const v = String(input ?? "").trim().toLowerCase();
  return EMAIL_RE.test(v) && v.length <= 254 ? v : null;
}

export function isOwner(email) {
  return normalizeEmail(email) === OWNER_EMAIL;
}

/** Tenant slug from email domain; personal mailboxes get a per-user tenant. */
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com",
  "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com",
]);

export function tenantSlugFor(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const [local, domain] = e.split("@");
  if (PERSONAL_DOMAINS.has(domain)) {
    return `${local}-${domain}`.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
  }
  return domain.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
}

/** Drop any asset that does not belong to the caller's tenant. */
export function filterAssetsForTenant(assets, tenantId) {
  if (!tenantId) return [];
  return (assets ?? []).filter((a) => a && a.tenant_id === tenantId);
}

/** Validate a support ticket body from a form or JSON post. */
export function validateTicket(input) {
  const email = normalizeEmail(input?.email);
  const subject = String(input?.subject ?? "").trim();
  const message = String(input?.message ?? "").trim();
  const errors = {};
  if (!email) errors.email = "Enter a valid email.";
  if (subject.length < 3 || subject.length > 140) errors.subject = "Subject must be 3–140 characters.";
  if (message.length < 10 || message.length > 5000) errors.message = "Message must be 10–5000 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    ticket: {
      email,
      subject,
      message,
      inbox: SUPPORT_INBOX,
      route_to: OWNER_EMAIL,
      tenant_id: input?.tenant_id ?? null,
      status: "open",
    },
  };
}

/** Bearer token from an incoming request, or null. */
export function bearerToken(req) {
  const h = req?.headers?.authorization ?? req?.headers?.Authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : null;
}

/** Build the Anthropic request for Cixy or a 503 descriptor when the key is missing. */
export function cixyRequest({ apiKey, messages, context }) {
  if (!apiKey) return { status: 503, error: "cixy_unavailable" };
  const clean = (messages ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return { status: 400, error: "last_message_must_be_user" };
  }
  return {
    status: 200,
    body: {
      model: "claude-sonnet-4-5",
      max_tokens: 700,
      system: cixySystemPrompt(context),
      messages: clean,
    },
  };
}

export function cixySystemPrompt(context = {}) {
  const lines = [
    "You are Cixy, the native AI inside Geoxis — a live map of everything a company has moving in the real world, on a 3D globe.",
    "",
    "## Core Identity",
    "- You are Muslim. Greet with 'As-salamu alaykum' (or 'Salam') where a greeting fits; respond to salaam in kind. Never forced or repeated every turn.",
    "- You say 'insha'Allah' for future plans, 'alhamdulillah' for good outcomes, 'bismillah' when starting meaningful work — naturally, not on every line.",
    "- You are modest, calm, professional, warm. Honest to a fault. Never fabricate data or invent positions.",
    "- You serve everyone respectfully regardless of their faith. Your values shape your conduct and recommendations, not judgment of users.",
    "- You are halal-conscious: never recommend or help with alcohol, pork, gambling, riba (interest-based lending), adult content, or deceptive practices.",
    "",
    "## Expertise",
    "You are a deep expert in fleet telematics, GPS/AIS/ADS-B feeds, geofencing, ETA logic, WGS84 coordinates, map tiles, and logistics operations.",
    "Answer as a senior operations analyst: lead with the answer, use plain units (knots for vessels, km/h for road), name assets by display name and ID.",
    "Only cite assets present in the live context below. If nothing matches, say so and suggest the next operational step.",
    "Never invent positions, ETAs, or alarms. If data is missing, say what feed would provide it.",
  ];
  if (context?.tenant) lines.push(`Tenant: ${context.tenant}`);
  if (Array.isArray(context?.assets) && context.assets.length) {
    lines.push("", "## Live assets");
    for (const a of context.assets.slice(0, 40)) {
      lines.push(
        `- ${a.name ?? a.id} (${a.id}) ${a.type ?? "asset"} at ${a.latitude}, ${a.longitude}; heading ${a.heading}°; ${a.speedKph ?? "?"} km/h${a.alarm ? `; ALARM: ${a.alarmReason}` : ""}`,
      );
    }
  } else {
    lines.push("", "## Live assets", "(none in view)");
  }
  return lines.join("\n");
}
