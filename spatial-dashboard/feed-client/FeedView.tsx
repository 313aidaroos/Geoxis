"use client";
/**
 * feed-client/FeedView.tsx — the feed's structure and behavior, with NO styling of its own.
 * Every visible style comes from the host site through `skin` (its existing classes) and the host's
 * own feed.css (layout only, using the host's CSS variables). No SVGs: icons are text glyphs.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type FormEvent } from "react";
import type { Comment, FeedClient, FeedConfig, FeedKind, Post, Profile, ReportReason } from "./api";
import { FeedError, feedErrorText, imageSize, newIdempotencyKey, videoFrames } from "./api";
import { useAutoplay, useComments, useFeed, useFeedSession, usePaged, usePost, useProfile, useSearch, useTrending } from "./hooks";

export interface FeedSkin {
  root?: string; tabs: string; tab: string; tabActive: string;
  card: string; cardHead?: string; title?: string;
  button: string; buttonSecondary: string; buttonSmall?: string;
  chip: string; aiChip?: string; input: string; label?: string;
  muted: string; alert: string; notice?: string; empty: string; listRow?: string; sheet?: string;
  /** Host's own sign-in link (must come back to /feed). */
  signInUrl: string;
  /** Host's existing "Buy Ixis" link (Apixis Wallet). */
  buyIxisUrl: string;
  glyphs?: Partial<typeof GLYPHS>;
  /** Show the right-hand column (trending + you) on wide screens. Default true. */
  aside?: boolean;
}
const GLYPHS = { like: "♡", liked: "♥", comment: "❝", save: "☆", saved: "★", share: "↗", tip: "✦", report: "⚑", boost: "▲", soundOff: "🔇", soundOn: "🔊", post: "＋", close: "✕", back: "←", del: "✕" };
type Tab = "for-you" | "following" | "search" | "me";
type Overlay = { type: "profile"; username: string } | { type: "tag"; tag: string } | null;
type Sheet =
  | { type: "comments"; post: Post } | { type: "tip"; post: Post } | { type: "boost"; post: Post }
  | { type: "report"; targetType: "post" | "comment"; id: string } | { type: "compose" } | { type: "signin"; why: string }
  | { type: "people"; username: string; which: "followers" | "following" } | null;

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
const n = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${Math.round(v / 1000)}K` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v));
function ago(iso: string | null) {
  if (!iso) return "";
  const s = Math.max(1, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now"; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`; return new Date(iso).toLocaleDateString();
}
const REASONS: Array<[ReportReason, string]> = [["spam", "Spam"], ["harassment", "Bullying or harassment"], ["hate", "Hate"], ["violence", "Violence"], ["adult", "Not family-friendly"], ["self_harm", "Self-harm"], ["other", "Something else"]];

interface Ctx {
  client: FeedClient; skin: FeedSkin; g: typeof GLYPHS; me: Profile | null; config: FeedConfig | null;
  needSignIn: (why: string) => boolean; open: (s: Sheet) => void; go: (o: Overlay) => void; flash: (m: string) => void;
}

export function FeedView({ client, skin, siteName }: { client: FeedClient; skin: FeedSkin; siteName: string }) {
  const g = useMemo(() => ({ ...GLYPHS, ...(skin.glyphs || {}) }), [skin.glyphs]);
  const { profile: me, loading: sessionLoading } = useFeedSession(client);
  const [config, setConfig] = useState<FeedConfig | null>(null);
  const [tab, setTab] = useState<Tab>("for-you");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [focusPost, setFocusPost] = useState<Post | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { client.config().then(setConfig).catch(() => null); }, [client]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const u = p.get("u"), tag = p.get("tag"), post = p.get("post"), t = p.get("tab");
    if (u) setOverlay({ type: "profile", username: u });
    else if (tag) setOverlay({ type: "tag", tag });
    if (t === "following" || t === "search" || t === "me") setTab(t);
    if (post) client.post(post).then(setFocusPost).catch(() => null);
  }, [client]);
  useEffect(() => {
    const url = new URL(window.location.href);
    ["u", "tag", "tab"].forEach((k) => url.searchParams.delete(k));
    if (overlay?.type === "profile") url.searchParams.set("u", overlay.username);
    if (overlay?.type === "tag") url.searchParams.set("tag", overlay.tag);
    if (!overlay && tab !== "for-you") url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [overlay, tab]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const ctx: Ctx = {
    client, skin, g, me, config,
    needSignIn: (why) => { if (me) return true; setSheet({ type: "signin", why }); return false; },
    open: setSheet, go: (o) => { setOverlay(o); setSheet(null); }, flash: setToast,
  };
  const tabs: Array<[Tab, string]> = [["for-you", "For You"], ["following", "Following"], ["search", "Search · Trending"], ["me", "You"]];

  return (
    <div className={cx("fx-root", skin.root)} data-site={client.client}>
      <div className="fx-topbar">
        <div className={cx("fx-tabs", skin.tabs)} role="navigation" aria-label="Feed">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" className={cx(skin.tab, !overlay && tab === k && skin.tabActive)} aria-pressed={!overlay && tab === k}
              onClick={() => { setOverlay(null); setFocusPost(null); setTab(k); }}>
              {k === "search" ? <><span className="fx-tab-long">{label}</span><span className="fx-tab-short">Search</span></> : label}
            </button>
          ))}
        </div>
        <button type="button" className={cx("fx-compose-btn", skin.button)} onClick={() => ctx.needSignIn("post") && setSheet({ type: "compose" })}>
          {g.post} Post
        </button>
      </div>
      {toast && <p className={cx("fx-toast", skin.notice || skin.chip)} role="status">{toast}</p>}

      <div className={cx("fx-layout", skin.aside === false && "fx-layout-single")}>
        <div className="fx-main">
          {overlay?.type === "profile" ? <ProfileView ctx={ctx} username={overlay.username} onBack={() => setOverlay(null)} key={overlay.username} />
            : overlay?.type === "tag" ? (
              <div>
                <div className="fx-subhead">
                  <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall)} onClick={() => setOverlay(null)}>{g.back} Back</button>
                  <h2 className={skin.title}>#{overlay.tag}</h2>
                </div>
                <Stream ctx={ctx} kind={{ kind: "hashtag", tag: overlay.tag }} empty={`No posts with #${overlay.tag} yet.`} />
              </div>
            )
            : tab === "search" ? <SearchView ctx={ctx} />
            : tab === "me" ? <MeView ctx={ctx} loading={sessionLoading} siteName={siteName} />
            : tab === "following" ? (me
              ? <Stream ctx={ctx} kind={{ kind: "following" }} empty="Follow creators and their newest posts land here." key={`fo${refreshKey}`} />
              : <SignInCard ctx={ctx} why="see posts from people you follow" />)
            : <Stream ctx={ctx} kind={{ kind: "for-you" }} lead={focusPost} key={`fy${refreshKey}`}
                empty={`Nothing here yet. Be the first to post on ${siteName}: posts from every Apixis company show up here.`} />}
        </div>
        {skin.aside !== false && (
          <div className="fx-aside">
            <TrendingCard ctx={ctx} />
            {!me && <SignInCard ctx={ctx} why="like, comment, follow and post" compact />}
          </div>
        )}
      </div>

      {sheet && (
        <SheetFrame ctx={ctx} onClose={() => setSheet(null)} title={
          sheet.type === "comments" ? "Comments" : sheet.type === "tip" ? "Tip the creator" : sheet.type === "boost" ? "Boost this post"
          : sheet.type === "report" ? "Report" : sheet.type === "compose" ? "New post" : sheet.type === "people" ? (sheet.which === "followers" ? "Followers" : "Following") : "Sign in"}>
          {sheet.type === "comments" && <Comments ctx={ctx} post={sheet.post} />}
          {sheet.type === "tip" && <TipBox ctx={ctx} post={sheet.post} />}
          {sheet.type === "boost" && <BoostBox ctx={ctx} post={sheet.post} />}
          {sheet.type === "report" && <ReportBox ctx={ctx} targetType={sheet.targetType} id={sheet.id} />}
          {sheet.type === "compose" && <Composer ctx={ctx} onDone={(p) => { setSheet(null); if (p.status === "live") { setFocusPost(p); setTab("for-you"); setOverlay(null); setRefreshKey((k) => k + 1); } }} />}
          {sheet.type === "people" && <People ctx={ctx} username={sheet.username} which={sheet.which} />}
          {sheet.type === "signin" && <SignInCard ctx={ctx} why={sheet.why} bare />}
        </SheetFrame>
      )}
    </div>
  );
}

function SheetFrame({ ctx, title, onClose, children }: { ctx: Ctx; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => {
    const root = document.documentElement; root.dataset.fxModal = "open";
    return () => { delete root.dataset.fxModal; };
  }, []);
  return (
    <div className="fx-sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="fx-scrim" aria-label="Close" onClick={onClose} />
      <div className={cx("fx-sheet", ctx.skin.card, ctx.skin.sheet)}>
        <div className={cx("fx-sheet-head", ctx.skin.cardHead)}>
          <h2 className={ctx.skin.title}>{title}</h2>
          <button type="button" className={cx(ctx.skin.buttonSecondary, ctx.skin.buttonSmall)} onClick={onClose} aria-label="Close">{ctx.g.close}</button>
        </div>
        <div className="fx-sheet-body">{children}</div>
      </div>
    </div>
  );
}

function SignInCard({ ctx, why, compact, bare }: { ctx: Ctx; why: string; compact?: boolean; bare?: boolean }) {
  const body = (
    <>
      <p>Sign in with your Apixis ID to {why}. Anyone can watch the feed.</p>
      <a className={ctx.skin.button} href={ctx.skin.signInUrl}>Sign in with Apixis</a>
      {!compact && <p className={ctx.skin.muted}>One Apixis account for every family site.</p>}
    </>
  );
  if (bare) return <div className="fx-signin">{body}</div>;
  return <div className={cx("fx-signin", ctx.skin.card)}>{compact && <h2 className={ctx.skin.title}>Join in</h2>}{body}</div>;
}

function Avatar({ p, size = "md" }: { p: { display_name: string; username: string; avatar_url: string | null }; size?: "sm" | "md" | "lg" }) {
  return p.avatar_url
    ? <img className={`fx-avatar fx-avatar-${size}`} src={p.avatar_url} alt="" loading="lazy" />
    : <span className={`fx-avatar fx-avatar-${size}`} aria-hidden="true">{(p.display_name || p.username || "?").slice(0, 1).toUpperCase()}</span>;
}

function Stream({ ctx, kind, empty, lead }: { ctx: Ctx; kind: FeedKind; empty: string; lead?: Post | null }) {
  const feed = useFeed(ctx.client, kind);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = end.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) feed.more(); }, { rootMargin: "600px" });
    io.observe(el); return () => io.disconnect();
  }, [feed.items.length, feed.hasMore, feed.error]);
  const items = lead ? [lead, ...feed.items.filter((p) => p.id !== lead.id)] : feed.items;
  const remove = (id: string) => feed.setItems((xs) => xs.filter((x) => x.id !== id));
  return (
    <div className={cx("fx-stream", !items.length && "fx-stream-empty")}>
      {items.map((p) => <PostCard key={p.id} ctx={ctx} initial={p} onRemoved={() => remove(p.id)} />)}
      {feed.error && (
        <div className={cx("fx-state", ctx.skin.card)}>
          <p className={ctx.skin.alert} role="alert">{feed.error}</p>
          <button type="button" className={ctx.skin.buttonSecondary} onClick={feed.reload}>Try again</button>
        </div>
      )}
      {!feed.error && !feed.loading && !items.length && <div className={cx("fx-state", ctx.skin.card, ctx.skin.empty)}><p>{empty}</p></div>}
      {feed.loading && <p className={cx("fx-loading", ctx.skin.muted)} role="status">Loading…</p>}
      <div ref={end} className="fx-end" aria-hidden="true" />
    </div>
  );
}

// RegExp constructor (not a /u literal) so hosts compiling for ES5 targets still type-check.
const CAPTION_TOKENS = new RegExp("(#[\\p{L}\\p{N}_]+|@[a-z0-9_.]{3,24})", "u");
function Caption({ ctx, text }: { ctx: Ctx; text: string }) {
  const parts = text.split(CAPTION_TOKENS);
  return (
    <p className="fx-caption">
      {parts.map((part, i) => part.startsWith("#") && part.length > 1
        ? <button key={i} type="button" className="fx-link" onClick={() => ctx.go({ type: "tag", tag: part.slice(1).toLowerCase() })}>{part}</button>
        : part.startsWith("@") && part.length > 3
          ? <button key={i} type="button" className="fx-link" onClick={() => ctx.go({ type: "profile", username: part.slice(1) })}>{part}</button>
          : <span key={i}>{part}</span>)}
    </p>
  );
}

function PostCard({ ctx, initial, onRemoved }: { ctx: Ctx; initial: Post; onRemoved: () => void }) {
  const { skin, g, me } = ctx;
  const p = usePost(ctx.client, initial, () => ctx.needSignIn("like, save and follow"));
  const post = p.post;
  const isVideo = post.type === "video" && post.media;
  const auto = useAutoplay(ctx.client, post.id, Boolean(isVideo));
  const mine = Boolean(me && me.id === post.author.id);
  const boosted = post.boosted_until && Date.parse(post.boosted_until) > Date.now();
  async function remove() {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    try { await ctx.client.deletePost(post.id); onRemoved(); ctx.flash("Post deleted."); } catch (e) { p.setError(feedErrorText(e)); }
  }
  return (
    <div role="article" className={cx("fx-post", `fx-post-${post.type}`, skin.card)} aria-label={`Post by ${post.author.display_name}`}>
      <div className={cx("fx-post-head", skin.cardHead)}>
        <button type="button" className="fx-author" onClick={() => ctx.go({ type: "profile", username: post.author.username })}>
          <Avatar p={post.author} />
          <span className="fx-author-text"><strong>{post.author.display_name}</strong><small className={skin.muted}>@{post.author.username} · {ago(post.published_at || post.created_at)}</small></span>
        </button>
        <span className="fx-badges">
          <span className={cx("fx-badge", skin.chip)} title={`Posted on ${post.source_site_name}`}>{post.source_site_name}</span>
          {post.ai_label && <span className={cx("fx-badge fx-ai", skin.aiChip || skin.chip)}>AI · {post.ai_label.replace(/^Posted by AI\s*·\s*/i, "")}</span>}
          {boosted && <span className={cx("fx-badge", skin.chip)}>{g.boost} Boosted</span>}
        </span>
        {!mine && (
          <button type="button" className={cx("fx-follow", p.viewer.follows_author ? skin.buttonSecondary : skin.button, skin.buttonSmall)} onClick={p.toggleFollow}>
            {p.viewer.follows_author ? "Following" : "Follow"}
          </button>
        )}
      </div>
      {post.status !== "live" && (
        <p className={cx("fx-held", skin.notice || skin.alert)}>
          {post.status === "held" ? `This post is waiting for review. ${post.moderation?.reason || ""}` : post.status === "pending" ? "Checking your post…" : "This post was removed."}
        </p>
      )}
      {post.media && (
        <div className="fx-media">
          {isVideo ? (
            <>
              <video ref={auto.ref} src={post.media.url} poster={post.media.poster_url || undefined} muted loop playsInline preload="metadata" onClick={auto.toggleSound} />
              <button type="button" className={cx("fx-sound", skin.buttonSecondary, skin.buttonSmall)} onClick={auto.toggleSound} aria-label={auto.muted ? "Turn sound on" : "Mute"}>
                {auto.muted ? `${g.soundOff} Tap for sound` : g.soundOn}
              </button>
            </>
          ) : <img src={post.media.url} alt={post.caption.slice(0, 120) || "Photo post"} loading="lazy" />}
        </div>
      )}
      {post.caption && <div className={post.type === "text" ? "fx-text-body" : "fx-caption-wrap"}><Caption ctx={ctx} text={post.caption} /></div>}
      <div className="fx-actions">
        <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall, p.viewer.liked && "fx-on")} aria-pressed={p.viewer.liked} onClick={p.toggleLike}>
          {p.viewer.liked ? g.liked : g.like} {n(post.counts.likes)}
        </button>
        <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall)} onClick={() => ctx.open({ type: "comments", post })}>{g.comment} {n(post.counts.comments)}</button>
        <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall, p.viewer.saved && "fx-on")} aria-pressed={p.viewer.saved} onClick={p.toggleSave}>
          {p.viewer.saved ? g.saved : g.save} Save
        </button>
        <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall)} onClick={p.share}>{g.share} Share</button>
        {mine ? (
          <>
            {post.status === "live" && <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall)} onClick={() => ctx.open({ type: "boost", post })}>{g.boost} Boost</button>}
            <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall)} onClick={remove}>{g.del} Delete</button>
          </>
        ) : (
          <>
            <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall)} onClick={() => ctx.needSignIn("tip creators") && ctx.open({ type: "tip", post })}>{g.tip} Tip</button>
            <button type="button" className={cx(skin.buttonSecondary, skin.buttonSmall)} onClick={() => ctx.needSignIn("report posts") && ctx.open({ type: "report", targetType: "post", id: post.id })} aria-label="Report post">{g.report}</button>
          </>
        )}
      </div>
      {p.error && <p className={cx("fx-inline-msg", skin.muted)} role="status">{p.error}</p>}
    </div>
  );
}

function Comments({ ctx, post }: { ctx: Ctx; post: Post }) {
  const top = useComments(ctx.client, post.id);
  return (
    <div className="fx-comments">
      <CommentForm ctx={ctx} postId={post.id} parentId={null} onAdded={(c) => top.setItems((xs) => [c, ...xs])} />
      {top.items.map((c) => <CommentItem key={c.id} ctx={ctx} c={c} postId={post.id} onRemoved={() => top.setItems((xs) => xs.filter((x) => x.id !== c.id))} />)}
      {top.error && <p className={ctx.skin.alert}>{top.error}</p>}
      {!top.loading && !top.items.length && !top.error && <p className={ctx.skin.muted}>No comments yet. Start the conversation.</p>}
      {top.loading && <p className={ctx.skin.muted}>Loading…</p>}
      {top.hasMore && !top.loading && top.items.length > 0 && <button type="button" className={ctx.skin.buttonSecondary} onClick={top.more}>More comments</button>}
    </div>
  );
}

function CommentItem({ ctx, c, postId, onRemoved }: { ctx: Ctx; c: Comment; postId: string; onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const replies = usePaged<Comment>((cur) => ctx.client.comments(postId, c.id, cur), `${c.id}`, open);
  const mine = ctx.me && ctx.me.id === c.author.id;
  return (
    <div className={cx("fx-comment", ctx.skin.listRow)}>
      <div className="fx-comment-line">
        <Avatar p={c.author} size="sm" />
        <div>
          <p><strong>@{c.author.username}</strong> <small className={ctx.skin.muted}>{ago(c.created_at)}</small></p>
          <p className="fx-comment-body">{c.status === "held" ? <em className={ctx.skin.muted}>Waiting for review.</em> : c.body}</p>
          <p className="fx-comment-actions">
            {!c.parent_id && <button type="button" className="fx-link" onClick={() => ctx.needSignIn("reply") && setReplying(!replying)}>Reply</button>}
            {!c.parent_id && c.replies > 0 && <button type="button" className="fx-link" onClick={() => setOpen(!open)}>{open ? "Hide replies" : `View ${c.replies} ${c.replies === 1 ? "reply" : "replies"}`}</button>}
            {mine ? <button type="button" className="fx-link" onClick={async () => { try { await ctx.client.deleteComment(c.id); onRemoved(); } catch (e) { ctx.flash(feedErrorText(e)); } }}>Delete</button>
              : <button type="button" className="fx-link" onClick={() => ctx.needSignIn("report comments") && ctx.open({ type: "report", targetType: "comment", id: c.id })}>Report</button>}
          </p>
        </div>
      </div>
      {replying && <CommentForm ctx={ctx} postId={postId} parentId={c.id} onAdded={(r) => { setReplying(false); setOpen(true); replies.setItems((xs) => [...xs, r]); }} />}
      {open && (
        <div className="fx-replies">
          {replies.items.map((r) => <CommentItem key={r.id} ctx={ctx} c={r} postId={postId} onRemoved={() => replies.setItems((xs) => xs.filter((x) => x.id !== r.id))} />)}
          {replies.hasMore && !replies.loading && replies.items.length > 0 && <button type="button" className="fx-link" onClick={replies.more}>More replies</button>}
        </div>
      )}
    </div>
  );
}

function CommentForm({ ctx, postId, parentId, onAdded }: { ctx: Ctx; postId: string; parentId: string | null; onAdded: (c: Comment) => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ctx.needSignIn("comment") || !body.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const c = await ctx.client.addComment(postId, body.trim(), parentId);
      setBody("");
      if (c.status === "held") setMsg("Thanks. Your comment is waiting for review."); else onAdded(c);
    } catch (err) { setMsg(feedErrorText(err)); } finally { setBusy(false); }
  }
  return (
    <form className="fx-comment-form" onSubmit={submit}>
      <input className={ctx.skin.input} value={body} maxLength={ctx.config?.limits.comment_max ?? 1000} onChange={(e) => setBody(e.target.value)}
        placeholder={ctx.me ? (parentId ? "Write a reply…" : "Add a comment…") : "Sign in to comment"} aria-label={parentId ? "Reply" : "Comment"} onFocus={() => ctx.needSignIn("comment")} />
      <button className={cx(ctx.skin.button, ctx.skin.buttonSmall)} disabled={busy || !body.trim()}>{busy ? "…" : parentId ? "Reply" : "Send"}</button>
      {msg && <p className={ctx.skin.muted}>{msg}</p>}
    </form>
  );
}

function TipBox({ ctx, post }: { ctx: Ctx; post: Post }) {
  const presets = ctx.config?.tips.presets_ixis ?? [10, 50, 100];
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<ReactNode>(null);
  async function tip(amount: number) {
    setBusy(amount); setMsg(null);
    try {
      const t = await ctx.client.tip(post.id, amount);
      setMsg(<>Sent {t.amount} Ixis to @{post.author.username}. Creator receives {t.creator_receives} Ixis (5% Apixis fee).</>);
    } catch (e) {
      if (e instanceof FeedError && e.code === "insufficient_ixis") setMsg(<>You need {String(e.data.needed ?? amount)} Ixis. <a href={ctx.skin.buyIxisUrl}>Buy Ixis</a></>);
      else setMsg(feedErrorText(e));
    } finally { setBusy(null); }
  }
  return (
    <div className="fx-tip">
      <p>Send @{post.author.username} a tip in Ixis from your Apixis Wallet. The creator receives 95%.</p>
      <div className="fx-presets">
        {presets.map((a) => <button key={a} type="button" className={ctx.skin.button} disabled={busy !== null} onClick={() => tip(a)}>{busy === a ? "Sending…" : `${ctx.g.tip} ${a} Ixis`}</button>)}
      </div>
      {msg && <p className={ctx.skin.notice || ctx.skin.muted} role="status">{msg}</p>}
      <p className={ctx.skin.muted}><a href={ctx.skin.buyIxisUrl}>Buy Ixis</a> · 100 Ixis = $1</p>
    </div>
  );
}

function BoostBox({ ctx, post }: { ctx: Ctx; post: Post }) {
  const perDay = ctx.config?.boost.ixis_per_day ?? 250;
  const max = ctx.config?.boost.max_days ?? 30;
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ReactNode>(null);
  async function boost() {
    setBusy(true); setMsg(null);
    try { const b = await ctx.client.boost(post.id, days); setMsg(`Boosted until ${new Date(b.ends_at).toLocaleString()}.`); }
    catch (e) {
      if (e instanceof FeedError && e.code === "insufficient_ixis") setMsg(<>You need {String(e.data.needed ?? days * perDay)} Ixis. <a href={ctx.skin.buyIxisUrl}>Buy Ixis</a></>);
      else setMsg(feedErrorText(e));
    } finally { setBusy(false); }
  }
  return (
    <div className="fx-boost">
      <p>Boosted posts get extra spots in For You across every Apixis company. {perDay} Ixis per day.</p>
      <label className={cx("fx-field", ctx.skin.label)}>Days
        <input className={ctx.skin.input} type="number" min={1} max={max} value={days} onChange={(e) => setDays(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
      </label>
      <p><strong>Total: {(days * perDay).toLocaleString()} Ixis</strong></p>
      <button type="button" className={ctx.skin.button} disabled={busy} onClick={boost}>{busy ? "Boosting…" : `${ctx.g.boost} Boost for ${days} day${days > 1 ? "s" : ""}`}</button>
      {msg && <p className={ctx.skin.notice || ctx.skin.muted} role="status">{msg}</p>}
    </div>
  );
}

function ReportBox({ ctx, targetType, id }: { ctx: Ctx; targetType: "post" | "comment"; id: string }) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  if (state === "done") return <p role="status">Thanks for telling us. We’ll review this {targetType}.</p>;
  return (
    <form className="fx-report" onSubmit={async (e) => {
      e.preventDefault(); setState("busy"); setErr(null);
      try { await ctx.client.report(targetType, id, reason, details); setState("done"); } catch (x) { setErr(feedErrorText(x)); setState("idle"); }
    }}>
      <label className={cx("fx-field", ctx.skin.label)}>What’s wrong?
        <select className={ctx.skin.input} value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
          {REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className={cx("fx-field", ctx.skin.label)}>Details (optional)
        <textarea className={ctx.skin.input} rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <button className={ctx.skin.button} disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Send report"}</button>
      {err && <p className={ctx.skin.alert}>{err}</p>}
    </form>
  );
}

function Composer({ ctx, onDone }: { ctx: Ctx; onDone: (p: Post) => void }) {
  const [type, setType] = useState<"text" | "photo" | "video">("text");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cross, setCross] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Post | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey(`${ctx.client.client}-post`));
  const limits = ctx.config?.limits;
  const doneRef = useRef(onDone); doneRef.current = onDone;
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  useEffect(() => {
    if (result?.status !== "pending") return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      try { const p = await ctx.client.post(result.id); if (p.status !== "pending" || tries > 10) { setResult(p); clearInterval(t); if (p.status === "live") doneRef.current(p); } } catch { /* keep waiting */ }
      if (tries > 10) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [result, ctx.client]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (type === "text" && !caption.trim()) return setErr("Write something to post.");
    if (type !== "text" && !file) return setErr(`Choose a ${type} to post.`);
    try {
      let media_path: string | undefined, frame_paths: string[] | undefined, width: number | undefined, height: number | undefined, duration_s: number | undefined;
      if (file && type === "video") {
        if (limits && file.size > limits.video_max_bytes) throw new Error(`Videos can be up to ${Math.round(limits.video_max_bytes / 1048576)} MB.`);
        setBusy("Reading your video…");
        const fr = await videoFrames(file, 3);
        if (limits && fr.duration_s > limits.video_max_seconds) throw new Error(`Videos can be up to ${limits.video_max_seconds} seconds.`);
        width = fr.width; height = fr.height; duration_s = fr.duration_s;
        setBusy("Uploading…");
        media_path = await ctx.client.upload(file, "video");
        frame_paths = [];
        for (const b of fr.frames) frame_paths.push(await ctx.client.upload(b, "frame"));
      } else if (file && type === "photo") {
        if (limits && file.size > limits.photo_max_bytes) throw new Error(`Photos can be up to ${Math.round(limits.photo_max_bytes / 1048576)} MB.`);
        const s = await imageSize(file); width = s.width; height = s.height;
        setBusy("Uploading…");
        media_path = await ctx.client.upload(file, "photo");
      }
      setBusy("Checking your post…");
      const p = await ctx.client.createPost({ type, caption: caption.trim(), media_path, frame_paths, width, height, duration_s, cross_post: cross.length ? cross : undefined, idempotency_key: key.current });
      setResult(p);
      if (p.status === "live") onDone(p);
    } catch (x) { setErr(x instanceof FeedError ? feedErrorText(x) : x instanceof Error ? x.message : feedErrorText(x)); }
    finally { setBusy(null); }
  }
  if (result && result.status !== "live") {
    return (
      <div role="status">
        <p className={ctx.skin.notice || ctx.skin.muted}>{result.status === "held" ? `Your post is waiting for review. ${result.moderation?.reason || ""}` : result.status === "pending" ? "Checking your post…" : "This post can't be shown."}</p>
        <p className={ctx.skin.muted}>Only you can see it until it’s approved. You’ll find it under You → My posts.</p>
      </div>
    );
  }
  return (
    <form className="fx-composer" onSubmit={submit}>
      <div className={cx("fx-tabs", ctx.skin.tabs)} role="group" aria-label="Post type">
        {(["text", "photo", "video"] as const).map((t) => (
          <button key={t} type="button" className={cx(ctx.skin.tab, type === t && ctx.skin.tabActive)} aria-pressed={type === t} onClick={() => { setType(t); setFile(null); }}>
            {t === "text" ? "Text" : t === "photo" ? "Photo" : "Video"}
          </button>
        ))}
      </div>
      {type !== "text" && (
        <label className={cx("fx-field", ctx.skin.label)}>{type === "photo" ? "Photo (JPG, PNG, WebP)" : "Video (MP4, WebM, MOV)"}
          <input className={ctx.skin.input} type="file" accept={type === "photo" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm,video/quicktime"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {preview && (type === "photo" ? <img className="fx-preview" src={preview} alt="Preview" /> : <video className="fx-preview" src={preview} muted controls playsInline />)}
      <label className={cx("fx-field", ctx.skin.label)}>{type === "text" ? "Your post" : "Caption"}
        <textarea className={ctx.skin.input} rows={type === "text" ? 5 : 3} maxLength={limits?.caption_max ?? 2200} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Say something. Add #hashtags so people can find it." />
      </label>
      <fieldset className="fx-cross">
        <legend className={ctx.skin.muted}>Also post to (optional, uses your connected accounts)</legend>
        {["tiktok", "instagram", "x"].map((c) => (
          <label key={c}><input type="checkbox" checked={cross.includes(c)} onChange={(e) => setCross((xs) => e.target.checked ? [...xs, c] : xs.filter((x) => x !== c))} /> {c === "x" ? "X" : c === "tiktok" ? "TikTok" : "Instagram"}</label>
        ))}
      </fieldset>
      <p className={ctx.skin.muted}>Family-friendly only. Every post gets a quick automatic check before it goes live.</p>
      <button className={ctx.skin.button} disabled={Boolean(busy)}>{busy || "Post"}</button>
      {err && <p className={ctx.skin.alert} role="alert">{err}</p>}
    </form>
  );
}

function People({ ctx, username, which }: { ctx: Ctx; username: string; which: "followers" | "following" }) {
  const list = usePaged<Profile>((c) => (which === "followers" ? ctx.client.followers(username, c) : ctx.client.followingOf(username, c)), `${username}:${which}`);
  return (
    <div className="fx-people">
      {list.items.map((p) => <PersonRow key={p.id} ctx={ctx} p={p} />)}
      {list.loading && <p className={ctx.skin.muted}>Loading…</p>}
      {list.error && <p className={ctx.skin.alert}>{list.error}</p>}
      {!list.loading && !list.items.length && !list.error && <p className={ctx.skin.muted}>Nobody yet.</p>}
      {list.hasMore && !list.loading && list.items.length > 0 && <button type="button" className={ctx.skin.buttonSecondary} onClick={list.more}>More</button>}
    </div>
  );
}

function PersonRow({ ctx, p }: { ctx: Ctx; p: Profile }) {
  return (
    <button type="button" className={cx("fx-person", ctx.skin.listRow)} onClick={() => ctx.go({ type: "profile", username: p.username })}>
      <Avatar p={p} size="sm" />
      <span className="fx-author-text"><strong>{p.display_name}</strong><small className={ctx.skin.muted}>@{p.username} · {n(p.followers)} followers</small></span>
    </button>
  );
}

function ProfileView({ ctx, username, onBack }: { ctx: Ctx; username: string; onBack: () => void }) {
  const { profile, setProfile, error } = useProfile(ctx.client, username);
  const [busy, setBusy] = useState(false);
  const mine = ctx.me && profile && ctx.me.id === profile.id;
  async function follow() {
    if (!profile || !ctx.needSignIn("follow creators")) return;
    setBusy(true);
    try { const r = profile.viewer_follows ? await ctx.client.unfollow(profile.username) : await ctx.client.follow(profile.username); setProfile({ ...profile, viewer_follows: r.following, followers: r.followers }); }
    catch (e) { ctx.flash(feedErrorText(e)); } finally { setBusy(false); }
  }
  return (
    <div className="fx-profile">
      <div className="fx-subhead"><button type="button" className={cx(ctx.skin.buttonSecondary, ctx.skin.buttonSmall)} onClick={onBack}>{ctx.g.back} Back</button></div>
      {error && <p className={ctx.skin.alert}>{error}</p>}
      {profile && (
        <div className={cx("fx-profile-card", ctx.skin.card)}>
          <Avatar p={profile} size="lg" />
          <div className="fx-profile-text">
            <h2 className={ctx.skin.title}>{profile.display_name}</h2>
            <p className={ctx.skin.muted}>@{profile.username}{profile.home_site ? ` · joined on ${profile.home_site}` : ""}</p>
            {profile.bio && <p>{profile.bio}</p>}
            <p className="fx-counts">
              <span><strong>{n(profile.posts)}</strong> posts</span>
              <button type="button" className="fx-link" onClick={() => ctx.open({ type: "people", username: profile.username, which: "followers" })}><strong>{n(profile.followers)}</strong> followers</button>
              <button type="button" className="fx-link" onClick={() => ctx.open({ type: "people", username: profile.username, which: "following" })}><strong>{n(profile.following)}</strong> following</button>
            </p>
          </div>
          {!mine && <button type="button" className={profile.viewer_follows ? ctx.skin.buttonSecondary : ctx.skin.button} disabled={busy} onClick={follow}>{profile.viewer_follows ? "Following" : "Follow"}</button>}
        </div>
      )}
      <Stream ctx={ctx} kind={{ kind: "profile", username }} empty={`@${username} hasn't posted yet.`} />
    </div>
  );
}

function TrendingCard({ ctx }: { ctx: Ctx }) {
  const t = useTrending(ctx.client);
  return (
    <div className={cx("fx-trending", ctx.skin.card)}>
      <div className={ctx.skin.cardHead}><h2 className={ctx.skin.title}>Trending hashtags</h2></div>
      {t.items.length ? (
        <ol className="fx-tag-list">
          {t.items.slice(0, 10).map((x) => (
            <li key={x.tag} className={ctx.skin.listRow}><button type="button" className="fx-link" onClick={() => ctx.go({ type: "tag", tag: x.tag })}>#{x.tag}</button> <small className={ctx.skin.muted}>{x.posts_24h} today</small></li>
          ))}
        </ol>
      ) : <p className={ctx.skin.muted}>{t.error ? "Trending is warming up." : "No trending hashtags yet."}</p>}
    </div>
  );
}

function SearchView({ ctx }: { ctx: Ctx }) {
  const [q, setQ] = useState("");
  const s = useSearch(ctx.client, q);
  return (
    <div className="fx-search">
      <div className={ctx.skin.card}>
        <label className={cx("fx-field", ctx.skin.label)}>Search people or #hashtags
          <input className={ctx.skin.input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="@username or #hashtag" autoFocus />
        </label>
        {s.loading && <p className={ctx.skin.muted}>Searching…</p>}
        {s.error && <p className={ctx.skin.alert}>{s.error}</p>}
        {q.trim().length >= 2 && !s.loading && !s.users.length && !s.tags.length && !s.error && <p className={ctx.skin.muted}>No matches for “{q}”.</p>}
        {s.users.map((p) => <PersonRow key={p.id} ctx={ctx} p={p} />)}
        {s.tags.map((h) => (
          <button key={h.tag} type="button" className={cx("fx-person", ctx.skin.listRow)} onClick={() => ctx.go({ type: "tag", tag: h.tag })}>
            <span className="fx-avatar fx-avatar-sm" aria-hidden="true">#</span>
            <span className="fx-author-text"><strong>#{h.tag}</strong><small className={ctx.skin.muted}>{n(h.posts)} posts</small></span>
          </button>
        ))}
      </div>
      <div className="fx-search-trending"><TrendingCard ctx={ctx} /></div>
    </div>
  );
}

function MeView({ ctx, loading, siteName }: { ctx: Ctx; loading: boolean; siteName: string }) {
  const me = ctx.me;
  const [sub, setSub] = useState<"mine" | "saved" | "settings">("mine");
  if (loading) return <p className={ctx.skin.muted}>Loading…</p>;
  if (!me) return <SignInCard ctx={ctx} why="post, follow, and see your saved posts" />;
  return (
    <div className="fx-me">
      <div className={cx("fx-profile-card", ctx.skin.card)}>
        <Avatar p={me} size="lg" />
        <div className="fx-profile-text">
          <h2 className={ctx.skin.title}>{me.display_name}</h2>
          <p className={ctx.skin.muted}>@{me.username}</p>
          <p className="fx-counts">
            <span><strong>{n(me.posts)}</strong> posts</span>
            <button type="button" className="fx-link" onClick={() => ctx.open({ type: "people", username: me.username, which: "followers" })}><strong>{n(me.followers)}</strong> followers</button>
            <button type="button" className="fx-link" onClick={() => ctx.open({ type: "people", username: me.username, which: "following" })}><strong>{n(me.following)}</strong> following</button>
          </p>
        </div>
      </div>
      <div className={cx("fx-tabs", ctx.skin.tabs)} role="group" aria-label="Your feed">
        {([["mine", "My posts"], ["saved", "Saved"], ["settings", "Profile & earnings"]] as const).map(([k, l]) => (
          <button key={k} type="button" className={cx(ctx.skin.tab, sub === k && ctx.skin.tabActive)} aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      {sub === "mine" && <Stream ctx={ctx} kind={{ kind: "mine" }} empty="You haven't posted yet. Tap Post to share something." />}
      {sub === "saved" && <Stream ctx={ctx} kind={{ kind: "saved" }} empty="Posts you save show up here." />}
      {sub === "settings" && <MeSettings ctx={ctx} me={me} siteName={siteName} />}
    </div>
  );
}

function MeSettings({ ctx, me, siteName }: { ctx: Ctx; me: Profile; siteName: string }) {
  const [form, setForm] = useState({ username: me.username, display_name: me.display_name, bio: me.bio || "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [earn, setEarn] = useState<{ count: number; gross_ixis: number; fee_ixis: number; net_ixis: number } | null>(null);
  useEffect(() => { ctx.client.earnings().then((e) => setEarn(e.tips_received)).catch(() => null); }, [ctx.client]);
  async function save(patch: Parameters<FeedClient["updateMe"]>[0]) {
    setMsg(null);
    try { await ctx.client.updateMe(patch); setMsg("Saved."); } catch (e) { setMsg(feedErrorText(e)); }
  }
  return (
    <div className="fx-settings">
      <form className={ctx.skin.card} onSubmit={(e) => { e.preventDefault(); void save({ ...(form.username !== me.username ? { username: form.username } : {}), display_name: form.display_name, bio: form.bio }); }}>
        <h2 className={ctx.skin.title}>Profile</h2>
        <label className={cx("fx-field", ctx.skin.label)}>Username<input className={ctx.skin.input} value={form.username} pattern="[a-z0-9_.]{3,24}" onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} /></label>
        <label className={cx("fx-field", ctx.skin.label)}>Display name<input className={ctx.skin.input} value={form.display_name} maxLength={60} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
        <label className={cx("fx-field", ctx.skin.label)}>Bio<textarea className={ctx.skin.input} rows={3} maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
        <button className={ctx.skin.button}>Save profile</button>
        {msg && <p className={ctx.skin.muted} role="status">{msg}</p>}
      </form>
      <div className={ctx.skin.card}>
        <h2 className={ctx.skin.title}>AI posting</h2>
        <p className={ctx.skin.muted}>Off unless you turn it on. Posts made for you are always labeled AI.</p>
        <label className="fx-toggle"><input type="checkbox" checked={me.agent_posting} onChange={(e) => save({ agent_posting: e.target.checked })} /> Let my Apixis world agent post for me</label>
        {siteName !== "Halaxis" && <label className="fx-toggle"><input type="checkbox" checked={me.cixy_posting} onChange={(e) => save({ cixy_posting: e.target.checked })} /> Let Cixy post for me</label>}
      </div>
      <div className={ctx.skin.card}>
        <h2 className={ctx.skin.title}>Tips earned</h2>
        {earn ? (
          <p>{earn.count} tips · {earn.gross_ixis.toLocaleString()} Ixis received · {earn.fee_ixis.toLocaleString()} Ixis Apixis fee · <strong>{earn.net_ixis.toLocaleString()} Ixis to you</strong></p>
        ) : <p className={ctx.skin.muted}>No tips yet.</p>}
        <p className={ctx.skin.muted}>Tips land in your Apixis Wallet.</p>
      </div>
    </div>
  );
}
