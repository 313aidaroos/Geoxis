/**
 * Send someone from an Ixis product into the Apixis world with their own agent.
 * Draft for copying into ApixisWallet/sdk/ (and from there into each product as lib/apixis-world.ts).
 * Browser- and server-safe: no secrets, no network calls. Apixis.dev does the sign-in (Apixis ID)
 * and validates `from` and `next` again on its side, so this helper is a convenience, not a gate.
 *
 *   <a href={enterApixisUrl("renoxis")}>Enter the Apixis world</a>
 *   enterApixisUrl("socixis", "/world.html#market")
 *     → https://www.apixis.dev/enter?from=socixis&next=%2Fworld.html%23market
 *
 * What happens: /enter → Apixis ID (Wallet sign-in, instant if already signed in) → Apixis.dev
 * creates or reuses the person's citizen + agent (default look, 200 starter Ixis once) → the world,
 * with a "Back to <product>" link for `from`.
 *
 * Products also create the agent automatically at signup with sdk/apixis-world-provision.ts (server only),
 * then show a "Your agent is ready" card linking to enterApixisUrl(<client>).
 * Not clients (by design): AwadBot and COMMAND.
 */

// www: the apex 308-redirects to www, so linking www saves a hop (same host Apixis.dev validates).
export const APIXIS_WORLD_ORIGIN = "https://www.apixis.dev";

/** Products Apixis.dev accepts as `from`. Anything else is ignored there (no back link). */
export const APIXIS_ENTER_CLIENTS = [
  "renoxis",
  "socixis",
  "rawixis",
  "contraxis",
  "halaxis",
  "lyrixis",
  "recovra",
  "qahwahworld",
  "launchixis",
  "deduxis",
  "geoxis",
  "contentbot",
  "nurserytoons",
  "ominix",
  "wattixis",
] as const;

export type ApixisEnterClient = (typeof APIXIS_ENTER_CLIENTS)[number];

/** Same-origin path on apixis.dev only ("/world.html#market"); anything else falls back to the world. */
function safeWorldPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return null;
  if (/[\\\u0000-\u0020\u007f]/.test(next) || next.length > 500) return null;
  return next;
}

export function enterApixisUrl(client: ApixisEnterClient | string, next?: string): string {
  const url = new URL("/enter", APIXIS_WORLD_ORIGIN);
  const key = String(client ?? "").trim().toLowerCase();
  if ((APIXIS_ENTER_CLIENTS as readonly string[]).includes(key)) url.searchParams.set("from", key);
  const path = safeWorldPath(next);
  if (path) url.searchParams.set("next", path);
  return url.toString();
}
