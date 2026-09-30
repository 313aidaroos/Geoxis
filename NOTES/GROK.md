Grok Bot (Developer Bot hub + product leads) notes. Every change Grok Bot makes to this product (code, env, database, deploys) gets a dated entry here so Claude, Hermes and Codex stay on the same page.

## 2026-09-27 (CT) — Developer Bot (hub)
- Wallet registration: added `geoxis` to `wallet_api_clients` in Supabase project `kzneeksminozmhnqaaun`, with `require_sso=false`.
- Callback URLs registered: https://spatial-dashboard-xi.vercel.app/auth/apixis/callback; https://spatial-dashboard-xi.vercel.app/api/auth/apixis/callback.
- Vercel env: replaced `WALLET_API_KEY` with a per-product `apx_live_` key, added `APIXIS_CLIENT_ID=geoxis`, and left legacy `APIXIS_WALLET_API_KEY` present (name-only check); production was redeployed from the same product commit.
- Cleanup status: the attempted deletion of legacy `APIXIS_WALLET_API_KEY` variables was stopped at about 22:45 CT; no deletion was made here.
- Undo: restore `WALLET_API_KEY` to its legacy value and deactivate the `geoxis` client row.

## 2026-09-27 — Apixis Wallet balance pill + Sign in with Apixis (Grok Bot)
- **What (PR #5, merge ceca075):** header balance pill on every screen + "Sign in with Apixis" (Awad-approved, product side only). All under `spatial-dashboard/`:
  - `lib/apixis-wallet.js`: appended SDK v3 `walletBalance`, `ownerQuery`, `apixisLoginUrl`, `exchangeLoginCode`, `buyIxisUrl` (existing functions/redeem unchanged).
  - `lib/apixis-login.js` + `api/auth/apixis/start.js` / `callback.js`; `vercel.json` rewrites `/auth/apixis/start|callback` → `/api/auth/apixis/*`. Callback creates/finds the Supabase user (app_metadata.apixis_sub), verifies a magic-link token server-side and hands the session to `/login` via the URL hash; `login.html` now goes straight to `next` when a hash token is consumed, and has a "Sign in with Apixis" button.
  - `api/wallet/balance.js` (Bearer session token): 401 `{signIn:true}` without a session; owner = Apixis `sub` when linked, else verified email.
  - `src/walletPill.js` (script on index, support, admin): slim row under the sidebar logo on the globe; next to "← Geoxis globe" on support/admin. Refetch on focus / visibilitychange / pageshow.
- **Verified:** prod READY; `/api/wallet/balance` → 401; `/auth/apixis/start` → 302 to Wallet `/sso/authorize?client_id=geoxis`.
- **Heads-up (pre-existing, not changed):** magic links point at `/auth/callback.html`, which isn't in the Vite build (prod 404); `pricing.html` / `set-password.html` also aren't built.
- **Undo:** `git revert -m 1 ceca075` (or revert PR #5).
- No Wallet code, env/keys, Stripe, checkout or payment links changed.

## 2026-09-29 (CT) — "Other Ixis companies" footer (Geoxis Lead / Grok)
- **What:** Awad-approved footer section linking the 13 other Ixis sites (Geoxis itself left out; Nexxis/Omnixis, Launchixis, PersonalContentBot, AwadBot, COMMAND excluded). Plain text links, `target="_blank" rel="noopener"`, wrap on narrow screens.
- **Files:** `spatial-dashboard/src/ixisCompanies.js` (new: the single list + renderer into `[data-ixis-companies]`); `index.html` (small block at the bottom of the left sidebar, just above the feed-status bar, so nothing covers the map); `login.html`, `support.html`, `admin.html` (had no footer: minimal `<footer>` at the bottom of the existing card/main using the page's existing `border-line` / `text-slate-500` / `text-slate-400 hover:text-emerald-300` styles). Each page loads `/src/ixisCompanies.js`.
- **Branch/PR:** `geoxis-lead/ixis-footer` — not merged, not deployed to production. No env, Supabase or Vercel settings touched.
- **Undo:** revert the PR (or delete `src/ixisCompanies.js`, the four `<footer>…data-ixis-companies…</footer>` blocks and the four `<script src="/src/ixisCompanies.js">` tags).
- **2026-09-29 (CT) update:** removed Nursery Toons and Qahwah World from `src/ixisCompanies.js` (Awad-approved); list is now 11 sites.
