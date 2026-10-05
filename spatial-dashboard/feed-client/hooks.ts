/**
 * feed-client/hooks.ts — React state for the shared family feed. No styling.
 * useFeed / usePost / useComments / useProfile / useSearch / useTrending / useFeedSession / useAutoplay.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment, FeedClient, FeedKind, FeedSession, HashtagHit, Page, Post, Profile, TrendingTag } from "./api";
import { feedErrorText } from "./api";

export function useFeedSession(client: FeedClient) {
  const [s, setS] = useState<FeedSession>(client.session());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const off = client.onSession(setS);
    void client.loadSession().finally(() => setLoading(false));
    return off;
  }, [client]);
  return { profile: s.profile, signedIn: Boolean(s.profile), loading };
}

/** Generic cursor pager. */
export function usePaged<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>, key: string, enabled = true) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const load = useCallback(async (reset: boolean, from: string | null) => {
    const g = reset ? ++gen.current : gen.current;
    setLoading(true); setError(null);
    try {
      const p = await fetchRef.current(reset ? null : from);
      if (g !== gen.current) return;
      setItems((cur) => (reset ? p.items : [...cur, ...p.items.filter((x) => !cur.some((c) => (c as { id?: string }).id === (x as { id?: string }).id))]));
      setCursor(p.next_cursor); setDone(!p.next_cursor);
    } catch (e) { if (g === gen.current) { setError(feedErrorText(e)); if (reset) setItems([]); } }
    finally { if (g === gen.current) setLoading(false); }
  }, []);
  useEffect(() => { if (enabled) { setItems([]); setCursor(null); setDone(false); void load(true, null); } }, [key, enabled, load]);
  return {
    items, setItems, loading, error, hasMore: !done && Boolean(cursor),
    more: () => { if (!loading && !done && !error && cursor) void load(false, cursor); },
    reload: () => { void load(true, null); },
  };
}

export function useFeed(client: FeedClient, kind: FeedKind, enabled = true) {
  return usePaged<Post>((c) => client.feed(kind, c), JSON.stringify(kind), enabled);
}

export function useComments(client: FeedClient, postId: string | null, parentId: string | null = null) {
  return usePaged<Comment>((c) => client.comments(postId as string, parentId, c), `${postId}:${parentId}`, Boolean(postId));
}

export function useProfile(client: FeedClient, username: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!username) return;
    let live = true; setProfile(null); setError(null);
    client.profile(username).then((p) => live && setProfile(p)).catch((e) => live && setError(feedErrorText(e)));
    return () => { live = false; };
  }, [client, username]);
  return { profile, setProfile, error };
}

export function useSearch(client: FeedClient, q: string) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [tags, setTags] = useState<HashtagHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setUsers([]); setTags([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const isTag = term.startsWith("#");
        const [u, h] = await Promise.all([
          isTag ? Promise.resolve({ items: [] as Profile[] }) : client.searchUsers(term.replace(/^@/, "")),
          client.searchHashtags(term),
        ]);
        if (live) { setUsers(u.items); setTags(h.items); }
      } catch (e) { if (live) setError(feedErrorText(e)); }
      finally { if (live) setLoading(false); }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [client, q]);
  return { users, tags, loading, error };
}

export function useTrending(client: FeedClient) {
  const [items, setItems] = useState<TrendingTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client.trending().then((t) => live && setItems(t)).catch((e) => live && setError(feedErrorText(e)));
    return () => { live = false; };
  }, [client]);
  return { items, error };
}

/** Optimistic like / save / follow for one post. */
export function usePost(client: FeedClient, initial: Post, onNeedSignIn: () => boolean) {
  const [post, setPost] = useState(initial);
  useEffect(() => setPost(initial), [initial]);
  const [error, setError] = useState<string | null>(null);
  const viewer = post.viewer ?? { liked: false, saved: false, follows_author: false };
  async function optimistic(patch: (p: Post) => Post, run: () => Promise<unknown>) {
    if (!onNeedSignIn()) return;
    const before = post; setPost(patch(post)); setError(null);
    try { await run(); } catch (e) { setPost(before); setError(feedErrorText(e)); }
  }
  return {
    post, setPost, error, setError, viewer,
    toggleLike: () => optimistic(
      (p) => ({ ...p, viewer: { ...viewer, liked: !viewer.liked }, counts: { ...p.counts, likes: p.counts.likes + (viewer.liked ? -1 : 1) } }),
      () => (viewer.liked ? client.unlike(post.id) : client.like(post.id))),
    toggleSave: () => optimistic(
      (p) => ({ ...p, viewer: { ...viewer, saved: !viewer.saved }, counts: { ...p.counts, saves: p.counts.saves + (viewer.saved ? -1 : 1) } }),
      () => (viewer.saved ? client.unsave(post.id) : client.save(post.id))),
    toggleFollow: () => optimistic(
      (p) => ({ ...p, viewer: { ...viewer, follows_author: !viewer.follows_author } }),
      () => (viewer.follows_author ? client.unfollow(post.author.username) : client.follow(post.author.username))),
    share: async () => {
      const url = `${window.location.origin}${window.location.pathname}?post=${encodeURIComponent(post.id)}${window.location.hash}`;
      let shared = false;
      try {
        if (navigator.share) { await navigator.share({ title: post.author.display_name, text: post.caption.slice(0, 120), url }); shared = true; }
        else { await navigator.clipboard.writeText(url); shared = true; setError("Link copied."); }
      } catch { /* cancelled */ }
      if (shared) {
        setPost((p) => ({ ...p, counts: { ...p.counts, shares: p.counts.shares + 1 } }));
        client.share(post.id, "link").catch(() => null);
      }
    },
  };
}

/** Muted autoplay while the element is on screen; reports watch time once when it leaves. */
export function useAutoplay(client: FeedClient, postId: string, enabled: boolean) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const v = ref.current;
    if (!v || !enabled || typeof IntersectionObserver === "undefined") return;
    let started = 0;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0]; if (!e) return;
      if (e.isIntersecting && e.intersectionRatio >= 0.6) { v.play().catch(() => null); started = Date.now(); }
      else {
        v.pause();
        if (started) { void client.view(postId, (Date.now() - started) / 1000, Number.isFinite(v.duration) ? v.duration : undefined); started = 0; }
      }
    }, { threshold: [0, 0.6] });
    io.observe(v);
    return () => io.disconnect();
  }, [client, postId, enabled]);
  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);
  return { ref, muted, toggleSound: () => setMuted((m) => !m) };
}
