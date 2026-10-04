// Static-site entry: bundles FeedView + React into one script for sites without React.
// Either the page provides <div id="feed-root"></div> and window.FEED_SITE = { client, siteName, base?, sessionUrl?, skin }
// (auto-mount), or a script calls window.FeedMount(element, site) itself (for SPAs that re-render).
import { createRoot } from "react-dom/client";
import { createFeedClient, type FeedClientOptions } from "./api";
import { FeedView, type FeedSkin } from "./FeedView";

type Site = { client: string; siteName: string; base?: string; sessionUrl?: string | null; withCookies?: boolean; sessionHeaders?: () => Record<string, string>; skin: FeedSkin };
function mount(el: HTMLElement, site: Site) {
  const opts: FeedClientOptions = { client: site.client, base: site.base, sessionUrl: site.sessionUrl, withCookies: site.withCookies, sessionHeaders: site.sessionHeaders };
  createRoot(el).render(<FeedView client={createFeedClient(opts)} skin={site.skin} siteName={site.siteName} />);
}
const w = window as unknown as { FEED_SITE?: Site; FeedMount?: typeof mount };
w.FeedMount = mount;
const el = document.getElementById("feed-root");
if (w.FEED_SITE && el) mount(el, w.FEED_SITE);
