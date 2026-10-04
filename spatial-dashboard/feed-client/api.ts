/**
 * feed-client/api.ts — thin, copyable wrapper over the shared family feed (Apixis.dev /api/feed/*).
 * Contract: docs/FEED_API.md in 313aidaroos/Apixis.dev. Fetch only, no SDK, no styling.
 * Same file in every Ixis site; only the options passed to createFeedClient() differ.
 * Written 2026-10-04 by Grok for Awad.
 */

export type PostType = "video" | "photo" | "text";
export type PostedBy = "self" | "agent" | "cixy";

export interface MiniProfile { id: string; username: string; display_name: string; avatar_url: string | null }
export interface Profile extends MiniProfile {
  bio: string; home_site: string; followers: number; following: number; posts: number;
  agent_posting: boolean; cixy_posting: boolean; viewer_follows?: boolean; banned: boolean; created_at: string;
}
export interface Media { url: string; poster_url?: string | null; width?: number | null; height?: number | null; duration_s?: number | null; mime?: string | null }
export interface Post {
  id: string; type: PostType; status: "pending" | "live" | "held" | "removed";
  caption: string; hashtags: string[]; media: Media | null;
  source_site: string; source_site_name: string; posted_by: PostedBy; ai_label: string | null;
  author: MiniProfile;
  counts: { likes: number; comments: number; shares: number; saves: number; views: number; tips_ixis: number };
  viewer?: { liked: boolean; saved: boolean; follows_author: boolean };
  boosted_until: string | null; moderation?: { state: string; reason: string | null };
  created_at: string; published_at: string | null;
}
export interface Comment {
  id: string; post_id: string; parent_id: string | null; body: string; author: MiniProfile;
  replies: number; likes: number; status: string; created_at: string;
}
export interface Page<T> { ok: true; items: T[]; next_cursor: string | null }
export interface TrendingTag { tag: string; posts_24h: number; score: number }
export interface HashtagHit { tag: string; posts: number }
export interface FeedConfig {
  ok: true; public_feed: boolean; post_types: PostType[]; source_sites: string[];
  limits: { caption_max: number; comment_max: number; hashtags_max: number; video_max_bytes: number; photo_max_bytes: number; video_max_seconds: number };
  tips: { presets_ixis: number[]; fee_bps: number };
  boost: { ixis_per_day: number; min_days: number; max_days: number; fee_bps: number };
}
export interface Tip { id: string; amount: number; fee: number; creator_receives: number; fee_bps: number; status: string; wallet_receipt_id: string }
export interface Boost { id: string; days: number; ixis: number; fee: number; fee_bps: number; starts_at: string; ends_at: string; status: string }
export interface Earnings { ok: true; tips_received: { count: number; gross_ixis: number; fee_ixis: number; net_ixis: number }; recent: Array<{ post_id: string; from: MiniProfile; amount: number; net: number; created_at: string }> }
export type ReportReason = "adult" | "violence" | "hate" | "harassment" | "spam" | "self_harm" | "other";
export type FeedKind =
  | { kind: "for-you"; source_site?: string } | { kind: "following" } | { kind: "profile"; username: string }
  | { kind: "hashtag"; tag: string } | { kind: "saved" } | { kind: "mine" } | { kind: "search-posts"; q: string };

export class FeedError extends Error {
  status: number; code: string; data: Record<string, unknown>;
  constructor(status: number, code: string, message: string, data: Record<string, unknown> = {}) {
    super(message); this.status = status; this.code = code; this.data = data;
  }
}

export interface FeedClientOptions {
  /** Feed API base, default https://www.apixis.dev/api/feed ("/api/feed" on apixis.dev itself). */
  base?: string;
  /** This site's allow-listed client key (socixis, renoxis, ...). Stamped as source_site on new posts (feeds are never filtered by it by default). */
  client: string;
  /** Same-origin route on THIS site that mints a feed token for the signed-in person; null = cookie auth (apixis.dev). */
  sessionUrl?: string | null;
  /** Send cookies with feed calls (only for same-origin apixis.dev). */
  withCookies?: boolean;
  /** Extra headers for the sessionUrl call only (sites whose own sign-in token lives in the browser, e.g. Geoxis). */
  sessionHeaders?: () => Record<string, string>;
  fetchImpl?: typeof fetch;
}

export interface FeedSession { token: string | null; expires_at: string | null; profile: Profile | null }

const DEFAULT_BASE = "https://www.apixis.dev/api/feed";
const enc = encodeURIComponent;
const qs = (o: Record<string, string | number | null | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${enc(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};
export const newIdempotencyKey = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)}`;

export function createFeedClient(opts: FeedClientOptions) {
  const base = (opts.base || DEFAULT_BASE).replace(/\/+$/, "");
  const f: typeof fetch = opts.fetchImpl || ((...a) => fetch(...a));
  let session: FeedSession = { token: null, expires_at: null, profile: null };
  let sessionPromise: Promise<FeedSession> | null = null;
  let sessionLoaded = false;
  const listeners = new Set<(s: FeedSession) => void>();
  const emit = () => listeners.forEach((l) => l(session));

  async function loadSession(force = false): Promise<FeedSession> {
    if (opts.sessionUrl === null) {
      // apixis.dev: same-origin cookie; /me tells us who is signed in.
      if (!force && sessionLoaded) return session;
      try {
        const r = await f(`${base}/me`, { credentials: "include", cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        session = { token: null, expires_at: null, profile: d?.profile ?? null };
      } catch { session = { token: null, expires_at: null, profile: null }; }
      sessionLoaded = true; emit(); return session;
    }
    const fresh = session.token && session.expires_at && Date.parse(session.expires_at) - Date.now() > 60_000;
    if (!force && sessionLoaded && (fresh || !session.token)) return session;
    if (!force && sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      try {
        const r = await f(opts.sessionUrl || "/api/feed-session", { credentials: "same-origin", cache: "no-store", headers: opts.sessionHeaders?.() });
        const d = await r.json().catch(() => null);
        session = r.ok && d?.ok && d.token ? { token: d.token, expires_at: d.expires_at ?? null, profile: d.profile ?? null } : { token: null, expires_at: null, profile: null };
      } catch { session = { token: null, expires_at: null, profile: null }; }
      sessionLoaded = true; sessionPromise = null; emit(); return session;
    })();
    return sessionPromise;
  }

  async function call<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const s = await loadSession();
    const headers: Record<string, string> = { "x-apixis-client": opts.client };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (s.token) headers.authorization = `Bearer ${s.token}`;
    let r: Response;
    try {
      r = await f(`${base}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        credentials: opts.withCookies || opts.sessionUrl === null ? "include" : "omit", cache: "no-store",
      });
    } catch {
      throw new FeedError(0, "network_error", "The feed is unreachable right now. Check your connection and try again.");
    }
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 401 && d.error === "token_expired" && !retried) { await loadSession(true); return call<T>(method, path, body, true); }
    if (!r.ok || d.ok === false) {
      throw new FeedError(r.status, String(d.error || (r.status === 404 ? "not_found" : "server_error")), String(d.message || d.error || `Feed error ${r.status}`), d);
    }
    return d as T;
  }
  const get = <T>(p: string) => call<T>("GET", p);
  const post = <T>(p: string, b: unknown = {}) => call<T>("POST", p, b);
  const del = <T>(p: string) => call<T>("DELETE", p);

  function feedPath(k: FeedKind): string {
    switch (k.kind) {
      case "for-you": return `/for-you${qs({ source_site: k.source_site })}`;
      case "following": return "/following";
      case "profile": return `/profiles/${enc(k.username)}/posts`;
      case "hashtag": return `/hashtags/${enc(k.tag.replace(/^#/, ""))}`;
      case "saved": return "/me/saved";
      case "mine": return "/me/posts";
      case "search-posts": return `/search${qs({ q: k.q, type: "posts" })}`;
    }
  }
  const page = (path: string, cursor?: string | null, limit = 10) =>
    get<Page<Post>>(`${path}${path.includes("?") ? "&" : "?"}${qs({ cursor, limit }).slice(1)}`);

  async function upload(file: Blob, kind: "video" | "photo" | "frame"): Promise<string> {
    const type = file.type || (kind === "video" ? "video/mp4" : "image/jpeg");
    const d = await post<{ upload: { path: string; signed_url: string } }>("/uploads", { kind, content_type: type, bytes: file.size });
    let r: Response;
    try { r = await f(d.upload.signed_url, { method: "PUT", headers: { "content-type": type }, body: file }); }
    catch { throw new FeedError(0, "upload_failed", "The upload didn't finish. Try again."); }
    if (!r.ok) throw new FeedError(r.status, "upload_failed", "The upload didn't finish. Try again.");
    return d.upload.path;
  }

  return {
    client: opts.client,
    base,
    session: () => session,
    loadSession,
    onSession(l: (s: FeedSession) => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    config: () => get<FeedConfig>("/config"),
    feed: (k: FeedKind, cursor?: string | null, limit?: number) => page(feedPath(k), cursor, limit),
    post: (id: string) => get<{ post: Post }>(`/posts/${enc(id)}`).then((d) => d.post),
    deletePost: (id: string) => del<{ ok: true }>(`/posts/${enc(id)}`),
    view: (id: string, watched_s: number, duration_s?: number) => post(`/posts/${enc(id)}/view`, { watched_s, duration_s }).catch(() => null),
    profile: (u: string) => get<{ profile: Profile }>(`/profiles/${enc(u)}`).then((d) => d.profile),
    followers: (u: string, cursor?: string | null) => get<Page<Profile>>(`/profiles/${enc(u)}/followers${qs({ cursor, limit: 30 })}`),
    followingOf: (u: string, cursor?: string | null) => get<Page<Profile>>(`/profiles/${enc(u)}/following${qs({ cursor, limit: 30 })}`),
    me: () => get<{ profile: Profile }>("/me").then((d) => d.profile),
    updateMe: (patch: Partial<Pick<Profile, "username" | "display_name" | "bio" | "avatar_url" | "agent_posting" | "cixy_posting">>) =>
      call<{ profile: Profile }>("PATCH", "/me", patch).then((d) => { session = { ...session, profile: d.profile }; emit(); return d.profile; }),
    earnings: () => get<Earnings>("/me/earnings"),
    follow: (u: string) => post<{ following: boolean; followers: number }>(`/follow/${enc(u)}`),
    unfollow: (u: string) => del<{ following: boolean; followers: number }>(`/follow/${enc(u)}`),
    like: (id: string) => post<{ liked: boolean; likes: number }>(`/posts/${enc(id)}/like`),
    unlike: (id: string) => del<{ liked: boolean; likes: number }>(`/posts/${enc(id)}/like`),
    save: (id: string) => post<{ saved: boolean; saves: number }>(`/posts/${enc(id)}/save`),
    unsave: (id: string) => del<{ saved: boolean; saves: number }>(`/posts/${enc(id)}/save`),
    share: (id: string, channel: "link" | "tiktok" | "instagram" | "x" | "other" = "link") => post<{ shares: number }>(`/posts/${enc(id)}/share`, { channel }),
    comments: (postId: string, parentId?: string | null, cursor?: string | null) =>
      get<Page<Comment>>(`/posts/${enc(postId)}/comments${qs({ parent_id: parentId, cursor, limit: 20 })}`),
    addComment: (postId: string, body: string, parentId: string | null = null) =>
      post<{ comment: Comment }>(`/posts/${enc(postId)}/comments`, { body, parent_id: parentId }).then((d) => d.comment),
    deleteComment: (id: string) => del<{ ok: true }>(`/comments/${enc(id)}`),
    searchUsers: (q: string, cursor?: string | null) => get<Page<Profile>>(`/search${qs({ q, type: "users", cursor, limit: 20 })}`),
    searchHashtags: (q: string, cursor?: string | null) => get<Page<HashtagHit>>(`/search${qs({ q: q.replace(/^#/, ""), type: "hashtags", cursor, limit: 20 })}`),
    trending: (limit = 20) => get<{ items: TrendingTag[] }>(`/trending${qs({ limit })}`).then((d) => d.items),
    report: (target_type: "post" | "comment", target_id: string, reason: ReportReason, details?: string) =>
      post<{ report_id: string }>("/reports", { target_type, target_id, reason, details: details || undefined }),
    tip: (id: string, amount: number) => post<{ tip: Tip }>(`/posts/${enc(id)}/tip`, { amount, idempotency_key: newIdempotencyKey("tip") }).then((d) => d.tip),
    boost: (id: string, days: number) => post<{ boost: Boost }>(`/posts/${enc(id)}/boost`, { days, idempotency_key: newIdempotencyKey("boost") }).then((d) => d.boost),
    upload,
    createPost: (input: {
      type: PostType; caption: string; hashtags?: string[]; media_path?: string; frame_paths?: string[];
      width?: number; height?: number; duration_s?: number; source_ref?: string; cross_post?: string[]; idempotency_key?: string;
    }) => post<{ post: Post }>("/posts", { source_site: opts.client, posted_by: "self", ...input }).then((d) => d.post),
  };
}
export type FeedClient = ReturnType<typeof createFeedClient>;

/** Pull 1..4 JPEG stills from a local video file (first = poster) for moderation. Browser only. */
export async function videoFrames(file: Blob, count = 3): Promise<{ frames: Blob[]; width: number; height: number; duration_s: number }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("This video can't be read in the browser.")); });
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    const w = v.videoWidth || 720, h = v.videoHeight || 1280;
    const scale = Math.min(1, 720 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    const frames: Blob[] = [];
    const n = Math.max(1, Math.min(4, count));
    for (let i = 0; i < n; i++) {
      const t = duration ? Math.min(duration - 0.05, (duration * (i + 0.5)) / n) : 0;
      await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = Math.max(0, t); setTimeout(res, 2500); });
      ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);
      const b = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
      if (b) frames.push(b);
    }
    return { frames, width: w, height: h, duration_s: Math.round(duration * 10) / 10 };
  } finally { URL.revokeObjectURL(url); }
}

/** Image size for photo posts. Browser only. */
export async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    await img.decode().catch(() => undefined);
    return { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
  } finally { URL.revokeObjectURL(url); }
}

/** Kind, human error text for the UI (no jargon). */
export function feedErrorText(e: unknown): string {
  if (!(e instanceof FeedError)) return "Something went wrong. Please try again.";
  switch (e.code) {
    case "sign_in_required": case "unauthorized": return "Sign in with Apixis to do that.";
    case "rate_limited": return `You're going a little fast. Try again in ${e.data.retry_after_s ?? 30}s.`;
    case "banned": return "This account can't post or comment right now.";
    case "insufficient_ixis": return "You don't have enough Ixis for that yet.";
    case "wallet_min_order": return "Small tips are coming soon. The 100 Ixis tip works now.";
    case "apixis_sign_in_required": return typeof e.data.message === "string" && e.data.message ? e.data.message
      : e.data.side === "seller" ? "This creator needs to sign in with their Apixis ID before they can receive Ixis." : "Sign in with your Apixis ID to send Ixis.";
    case "wallet_unavailable": return "The Apixis Wallet is busy right now. Nothing was charged. Try again soon.";
    case "invalid_media": return "That file can't be posted. Use a photo (JPG, PNG, WebP) or a video (MP4, WebM, MOV).";
    case "not_found": return "That post isn't available anymore.";
    case "store_not_configured": case "server_error": case "network_error": return "The feed is starting up. Please try again in a moment.";
    default: return e.message || "Something went wrong. Please try again.";
  }
}
