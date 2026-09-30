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

## 2026-09-29 (CT) — One Apixis ID = one Wallet = one world agent (Geoxis Lead (Grok))
- **What (branch `geoxis-lead/one-account`, PR not merged, not deployed):** all under `spatial-dashboard/`:
  - `lib/apixis-world.js` (new): JS port of Apixis.dev `sdk/apixis-world-provision.ts` + Renoxis `lib/renoxis/world-agent.ts`. Calls `POST https://www.apixis.dev/api/agent/provision` (Bearer `APIXIS_WORLD_KEY`, `from: "geoxis"`) and stores `apixis_world_agent_at` / `_id` / `_name` on the Supabase auth user's **app_metadata** (server-only; no migration, no table change). Skips when the id is already stored; Apixis.dev is idempotent by verified email, so never a second agent or a second 1000-Ixis starter grant (the grant happens on Apixis.dev; Geoxis grants nothing locally).
  - `lib/apixis-login.js`: the Apixis ID callback provisions on first sign-in. On Vercel **preview** only, the sign-in round trip stays on `VERCEL_BRANCH_URL` (prod unchanged).
  - `api/wallet/balance.js`: returns `agent { ready, id, name, enterUrl }` and retries provisioning if the first sign-in could not.
  - `src/walletPill.js`: "Your agent is in the Apixis world ↗" (→ `https://www.apixis.dev/enter?from=geoxis`) next to the balance pill; "Log in with Apixis ID" label.
  - `login.html`: "Log in with Apixis ID" is the primary button at the top; email options stay below for existing accounts.
  - `test/apixis-world.test.mjs`, `.env.example` (`APIXIS_WORLD_KEY`). Repo `WORKBOARD.md` created.
- **Needs from hub:** `APIXIS_WORLD_KEY` is NOT set on Vercel `spatial-dashboard` (Apixis.dev already has `geoxis` in `APIXIS_WORLD_KEYS`: a probe returns 401 not 503). Until it is set, no agent is provisioned (header links to /enter, which creates it).
- **No** Wallet code/settings, Stripe, env vars, protection settings or DB changes.
- **Undo:** close the PR / delete the branch; after a merge, revert the merge commit. Stored app_metadata keys are harmless and can be left or cleared.
