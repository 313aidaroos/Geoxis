// Per-instance limiter for endpoints that spend money (AI). Serverless instances do not share
// memory: a speed bump against scripted abuse, not a global quota.
const buckets = new Map();

export function clientIp(req) {
  const fwd = String(req?.headers?.["x-forwarded-for"] || "");
  return fwd.split(",")[0].trim() || req?.socket?.remoteAddress || "unknown";
}

export function rateLimited(key, max, windowMs, now = Date.now()) {
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) buckets.clear();
  return recent.length > max;
}
