Grok Bot (Developer Bot hub + product leads) notes. Every change Grok Bot makes to this product (code, env, database, deploys) gets a dated entry here so Claude, Hermes and Codex stay on the same page.

## 2026-10-04 summary (corrected 2026-10-04 19:00 CT)

- **Grok:** two-owner admin allowlist (PR #17), Gmail owner row in prod `admin_emails` (PR #18 note), notes catch-up (`dd294cc`, direct to main), and the claude-review-fixes PR (entry at the bottom).
- **Claude:** PR #20 (notes only: `NOTES/CLAUDE.md` + `AI_CHANGELOG.md`), merged 18:31 CT. The earlier line here said Claude had no commits on 10-04; that was written before #20 merged.
- **Hermes/Codex/Juno:** no commits or PRs in this repo since 2026-10-02.

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

## Backfill 2026-10-02 (by Geoxis Lead / Grok)
Read-only backfill of everything that changed after the 2026-09-27 entries above and was not yet logged here. Sources: GitHub commits/PRs/timeline API, `AI_CHANGELOG.md`, Vercel (env var **names** and production deploys only, no values), and the 2026-10-02 status audit. All times are CT. Every commit, merge, closure and env edit was made through the `313aidaroos` GitHub/Vercel account. The agent named comes from branch names, `AI_CHANGELOG.md`, PR bodies and comments; **[inferred]** marks attributions that are not confirmed. Already logged above and not repeated: the 09-27 hub entry (`APIXIS_CLIENT_ID` added and `WALLET_API_KEY` updated at 22:35, prod redeploy of `0bdd7d6` at 22:39) and PR #5 (`5c1b077` / merge `ceca075`).

### 2026-09-27 13:52 CT — empty "trigger deploy" commit
- What: empty commit "chore: trigger deploy for QA verification" (no files). Prod deploy `dpl_5P9WkDQREw1WByv5aF98JVoWWXiX` READY.
- Where: main `6a68024`.
- Who: **unattributed**. The git author is "Awad Alaidaroos" (noreply email), and no agent note exists.
- Undo: nothing to undo (no file changes). `git revert 6a68024` would also be a no-op.

### 2026-09-27 13:56 CT — Cixy model string + clean URLs
- What: `spatial-dashboard/lib/core.js` model `claude-sonnet-4-5` → `claude-sonnet-4-20250514`. `spatial-dashboard/vercel.json` gets `"cleanUrls": true, "trailingSlash": false`. Prod deploy `dpl_uZcvqsxArJjejcEqgCGjRew62dpn`. (The 10-02 audit says this model is now retired, and Cixy shows the calm "unavailable" fallback from PR #10.)
- Where: main `0bdd7d6`, pushed direct (no PR).
- Who: **unattributed**. The git author is "Awad Alaidaroos" (noreply email), and there is no `AI_CHANGELOG.md` entry.
- Undo: `git revert 0bdd7d6`. Better: set an active model in `lib/core.js`.

### 2026-09-27 23:19 / 2026-09-28 00:11 CT — notes-only commits
- What: created this file (`e6b23c9`) and added the PR #5 entry (`99376d8`). Both are `[skip ci]`, but Vercel still deployed (`dpl_HH5fziKHyZi4w1ubViewUwJUxnTz`, `dpl_8HQ9V7NH4xKp74YgD8qBZ44gqayW`).
- Where: main, `NOTES/GROK.md` only.
- Who: Developer Bot hub / Grok (per the entries themselves).
- Undo: `git revert 99376d8 e6b23c9` (notes only).

### 2026-09-28 04:08 CT — PR #6 `AI_CHANGELOG.md` rule (Juno)
- What: added `AI_CHANGELOG.md`. Every AI that touches the repo must append a dated entry. Prod deploy `dpl_2w4hcrQJZiYYCtvBAk6ufPh99Ew6`.
- Where: PR #6, branch `junoai/ai-changelog` (opened 03:48 CT, squash-merged as main `ded0171`). The branch is still present (tip `ccd81c8`, the pre-squash commit). No `juno/*` branches exist.
- Who: JunoAI (confirmed by the first `AI_CHANGELOG.md` entry). Merged through the `313aidaroos` account.
- Undo: `git revert ded0171`; delete branch `junoai/ai-changelog`.

### 2026-09-28 04:47 CT — PR #1 Apixis family notes (Claude)
- What: added `CLAUDE.md` + `docs/APIXIS_FAMILY.md` (shared Wallet rules, status, env). Prod deploy `dpl_6w9zdEzn3CSPNZBTQf6tE8nWFfZi`. The status section in `APIXIS_FAMILY.md` is dated 09-23 and is now stale.
- Where: PR #1, branch `claude/apixis-family-notes` (opened 09-23), merged as main `3f489f0`.
- Who: Claude (branch name).
- Undo: `git revert 3f489f0`.

### 2026-09-29 20:33–20:40 CT — PR #7 "Other Ixis companies" footer (branch only, NOT on main)
- What: commits `8b83623` (20:33) + `705f485` (20:40; the list was cut to 11 sites, though the PR body still says 13). Adds `spatial-dashboard/src/ixisCompanies.js`, edits index/login/support/admin, and adds `WORKBOARD.md`, `AI_CHANGELOG.md` and `NOTES/GROK.md` entries **on the branch only**.
- Where: PR #7, branch `geoxis-lead/ixis-footer`. **Still OPEN** and now conflicting (2 ahead / 13 behind main). Body: "Do not merge until Awad reviews."
- Who: Geoxis Lead / Grok **[inferred]** from the `geoxis-lead/` branch prefix.
- Undo: nothing is on main. To drop the work, close PR #7 and delete the branch (needs Awad's decision; not done here).

### 2026-09-29 20:53–20:55 CT — PR #8 one account / world agent (branch only, NOT on main)
- What: commits `834aa5f` (20:53) + `8af9d0d` (20:55). Provisioning at the Apixis ID callback, `agent{}` in `/api/wallet/balance`, the "Your agent is in the Apixis world ↗" link, "Log in with Apixis ID", and 5 tests. Also adds `WORKBOARD.md`, `AI_CHANGELOG.md` and `NOTES/GROK.md` entries **on the branch only**.
- Where: PR #8, branch `geoxis-lead/one-account` (2 ahead / 13 behind). It was closed on 10-01 (see below).
- Who: Geoxis Lead (Grok). Confirmed by the PR body.
- Undo: nothing is on main. The branch is kept.

### 2026-09-29 23:16–23:17 CT — Vercel env: world-agent vars + redeploy
- What: added `APIXIS_WORLD_KEY` (encrypted, prod/preview/dev, 23:16:57) and `APIXIS_WORLD_API` (plain, prod/preview/dev, 23:16:58). Production was then redeployed from the same commit `3f489f0` (`dpl_CE2JqWsw7cNsiyjzN4WT7HyFsY3D`, 23:17). Names only; values were not read.
- Where: Vercel project `spatial-dashboard`.
- Who: Hermes (Geoxis Bot) **[inferred]**. The edits were made through the `313aidaroos` Vercel account 11 minutes before Hermes's provision commits, which read these vars.
- Undo: remove env vars `APIXIS_WORLD_KEY` and `APIXIS_WORLD_API`, then redeploy. This breaks world provisioning, so revert the provision code first.

### 2026-09-29 23:28–23:33 CT — world-agent provision on first signup (direct to main, no PR)
- What: `2bd6638` (23:28) added `api/world/provision.js`, `lib/apixis-world.js`, `src/apixisWorld.js`, the `src/main.js` hook, and an `AI_CHANGELOG.md` entry. `aa5235c` (23:30) added error handling + a `readBody` helper. `794f7d3` (23:33) switched to the Apixis.dev SDK copies (`lib/apixis-world-agent.ts`, `lib/apixis-world-provision.ts`, `lib/apixis-world.ts`, `docs/PROVISION_KIT.md`; `lib/apixis-world.js` removed). All paths are under `spatial-dashboard/`. Prod deploys: `dpl_8UTJu9UsZTGKcRCvGpyA28qza1AZ`, `dpl_ABoBPVj7WEBYwjpH8qmWdgAtkrWT`, `dpl_46w4kQkpjAh5jrNQUZjHiXHtu9DR`.
- Where: main `2bd6638`, `aa5235c`, `794f7d3`. Pushed straight to main with no PR.
- Who: Hermes ("Geoxis Bot (Hermes Agent)"), confirmed by `AI_CHANGELOG.md` (dated 09-30).
- Undo: first revert the later commits that touch these files (`f9be377`, `3953987`, `9f41c33`, `2fdac6f`), then `git revert 794f7d3 aa5235c 2bd6638`.

### 2026-09-30 02:34 CT — PR #9 bill the Apixis ID sub first; OTP type email (Claude)
- What: `lib/apixis-wallet.js` reserve/entitlements/redeem take the Apixis `sub` or the verified email; `api/redeem.js` bills the `sub` first; `lib/apixis-login.js` verifies with type `email`; the world-kit `.ts` copies were re-synced. Prod deploy `dpl_ACTvpZX4iedsxFadxM8hewMaEBGx`.
- Where: PR #9, branch `claude/awesome-newton-3tygzi` (opened 02:27), merged as main `2fdac6f`.
- Who: Claude. Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert 2fdac6f`.

### 2026-09-30 02:56 CT — PR #10 Cixy shared family persona + calm fallback (Claude)
- What: new `lib/apixis-cixy.js` (shared family core); `lib/core.js` prompt now starts from it, with the family greeting rule; on provider failure `api/cixy.js` returns `cixyUnavailableReply()` (503/429). Prod deploy `dpl_FJFMAe5FSVDKmb89ERbpbGTxg3MR`.
- Where: PR #10, same branch, merged as main `b3c445a`.
- Who: Claude. Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert b3c445a`.

### 2026-09-30 03:27 CT — PR #11 GitHub Actions CI (Claude)
- What: added `.github/workflows/ci.yml` (calls `313aidaroos/github-actions/node-ci`) and adjusted `spatial-dashboard/test/core.test.mjs`. Prod deploy `dpl_3SzWMwuyaNPycWntfHfA8EPRvSNS`. Note: the changelog says a `typecheck` script was added, but the PR's file list has no `package.json` change.
- Where: PR #11, same branch, merged as main `5428a5a`.
- Who: Claude. Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert 5428a5a`.

### 2026-09-30 04:11–04:13 CT — provision endpoint rewritten in plain JS (direct to main, no PR)
- What: `3953987` (04:11, "use JS logic instead of TS imports", committer "Awad Alaidaroos") and `f9be377` (04:13, "simplify world provision endpoint logic") both rewrite `spatial-dashboard/api/world/provision.js`. Prod deploys: `dpl_DuKMrzkJm9giiZJdqk3jhssEBdhd`, `dpl_35FNhKTrYoR3FGiQKiLaBPF8rUu9`. **Known issue (10-02 audit):** `/api/world/provision` returns 500 FUNCTION_INVOCATION_FAILED in prod (wrong `../lib` import path, no auth header from the client, wrong config field names, `@supabase/supabase-js` missing from `package.json`).
- Where: main `3953987`, `f9be377`. No PR and no `AI_CHANGELOG.md` entry.
- Who: Hermes **[inferred]**. These follow up Hermes's 09-29 provision commits, and no agent logged them.
- Undo: `git revert f9be377 3953987`.

### 2026-10-01 20:56 CT — PR #12 root `.env.example` (Claude)
- What: added `.env.example` at the repo root, listing every env var the code reads (names only), plus an `AI_CHANGELOG.md` entry. Prod deploy `dpl_cvXMzPWWnU4Zg3urXXhAxMAG9jLm`.
- Where: PR #12, branch `claude/awesome-newton-3tygzi` (opened 20:55), merged as main `57f1465`.
- Who: Claude (Claude Code). Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert 57f1465`.

### 2026-10-01 23:10 CT — PR #13 starter in-world Ixis wording 1,000 (Claude)
- What: `spatial-dashboard/lib/apixis-world-agent.ts` comment/wording changed from 200 to 1,000 Ixis (D11), plus an `AI_CHANGELOG.md` entry. Prod deploy `dpl_E4pkiQEXxeuUEC8GgWwr721JX5ne`.
- Where: PR #13, same branch, merged as main `9f41c33` (open to merge took 25 s).
- Who: Claude. Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert 9f41c33`.

### 2026-10-01 23:18 CT — PR #8 closed unmerged as "superseded" (mass closure)
- What: PR #8 (`geoxis-lead/one-account`) was closed **without merging** at 23:18:39. Closing comment: "Closing: superseded. `main` already has Log in with Apixis ID and the world agent at sign-in (shared kits). The branch is kept." (signed "Generated by Claude Code"). **Only partly true:** main has no "Log in with Apixis ID" label, and main's provision endpoint is broken (see 09-30 04:11).
- Mass closure: family-wide, 51 unmerged PRs were closed between 23:17:36 and 23:20:22 CT on 10-01 (this matches Developer Bot's count of 51). **This repo: 1 (PR #8 only).** PR #7 was not closed.
- Where: PR #8. The branch was not deleted.
- Who: Claude (Claude Code), per the comment signature, acting through the `313aidaroos` account. Developer Bot reported the 51. It is **[inferred]** that Claude ran the whole sweep.
- Undo: reopen PR #8 (needs Awad's decision; not done here).

### 2026-10-02 02:22 CT — PR #14 Apixis Companies page (Codex)
- What: new `spatial-dashboard/public/companies.html` + `companies.css` and 6 images in `public/companies/` (15 illustrated company cards with reduced-motion support); an "Apixis Companies →" nav link in `index.html`. `/companies` is live (200). Prod deploy `dpl_6zWsvKFrPvh9mLU8qM1rXi3vJ1CN`.
- Where: PR #14, branch `codex/apixis-companies-20261002` (opened 01:29), merged as main `32b5ac9`. The branch is still present.
- Who: Codex **[inferred]** from the `codex/` branch prefix. There is **no `AI_CHANGELOG.md` entry** (breaks the repo rule).
- Undo: `git revert 8935e34 be61d32 32b5ac9` (newest first); delete branch `codex/apixis-companies-20261002`.

### 2026-10-02 02:47 CT — PR #15 Companies card motion + copy (Codex)
- What: removed the orbit/spark overlays and the badge bounce; card descriptions and links now match the approved mockup (`public/companies.html`, `companies.css`). Prod deploy `dpl_DfbEuZqqJnpCm18FoW6Ss4Xh8oYp`.
- Where: PR #15, branch `codex/refine-companies-motion-20261002` (opened 02:41), merged as main `be61d32`.
- Who: Codex **[inferred]** (branch prefix). No `AI_CHANGELOG.md` entry.
- Undo: `git revert be61d32` (after reverting `8935e34`); delete the branch.

### 2026-10-02 03:19 CT — PR #16 Recovra link fix (Codex)
- What: the Recovra card now points to `recovra-three.vercel.app` (`recovra.vercel.app` serves a different app) in `public/companies.html`. Prod deploy `dpl_CjemvWTyPmTFA1E46gRR6Q4pqLcp` READY. This is the current production (main HEAD `8935e34`).
- Where: PR #16, branch `codex/fix-recovra-company-link-20261002` (opened 03:16), merged as main `8935e34`.
- Who: Codex **[inferred]** (branch prefix). No `AI_CHANGELOG.md` entry.
- Undo: `git revert 8935e34`; delete the branch.

### 2026-10-02 (this commit) — NOTES backfill
- What: appended this backfill section. Existing content is unchanged. No code, env, DB, PR, branch or deploy was changed (change freeze; this was the one approved narrow task).
- Where: main, `NOTES/GROK.md` only. Commit message `docs(notes): backfill NOTES/GROK.md through 2026-10-02 [notes only]`.
- Who: Geoxis Lead / Grok.
- Undo: `git revert <this commit>` (notes only).

## 2026-10-04 (CT) — Grok: owner admin allowlist (alaidaroosawad@gmail.com, awad@apixis.dev)
- What: Awad's rule — both owner emails are the Geoxis owner/admin as soon as they sign in with a verified email (magic link, password, Apixis ID). How it works: `isOwner(email)` (`spatial-dashboard/lib/core.js`) decides `ctx.admin`, which opens the owner support queue (`/api/admin/support`) and puts the person in the `geoxis-owner` tenant as `owner`; RLS `public.is_admin_user()` reads `public.admin_emails`. `isOwner` was only awad@apixis.dev; now both owner emails + optional `ADMIN_EMAILS` env (comma-separated), case-insensitive. `ensureUserTenant()` now also needs a confirmed email before granting admin. `sql/001_auth_support.sql` seeds both emails into `admin_emails`. Nobody else's access changed. No accounts or passwords were created.
- Where: `spatial-dashboard/lib/core.js`, `spatial-dashboard/lib/supabaseServer.js`, `spatial-dashboard/sql/001_auth_support.sql`, `spatial-dashboard/test/core.test.mjs`; Vercel env `ADMIN_EMAILS` on project `spatial-dashboard` (production + preview).
- Needs Awad: prod `public.admin_emails` still has only awad@apixis.dev (the app uses the service role, so the app side works for both now; only direct RLS reads differ). Run `insert into public.admin_emails (email, role) values ('alaidaroosawad@gmail.com','owner') on conflict (email) do update set role = excluded.role;` in the Geoxis Supabase SQL editor.
- Who: Grok.
- Undo: `git revert <squash SHA>` and delete `ADMIN_EMAILS` in Vercel → spatial-dashboard → Settings → Environment Variables.

## 2026-10-04 — Owner admin row in prod (Grok)
- What: inserted ('alaidaroosawad@gmail.com','owner') into prod public.admin_emails on Supabase ncifprfgastofurrlsko via the MCP. Both owner emails are now present. Owner bypass check: Geoxis has no product paywalls to skip, since plans are not on sale (api/redeem.js returns not_on_sale) and nothing reads entitlements. No code change.
- Who: Grok.
- Undo: delete from public.admin_emails where email='alaidaroosawad@gmail.com';
## 2026-10-04 catch-up provenance (CT)

The entries below record the day's observed commits and merged PRs. Existing detailed entries above remain the change descriptions; this section supplies exact provenance and undo pointers.

### Commits
- `9a477c6` (2026-10-04T18:14:47-05:00, 313aidaroos; alaidaroosawad@gmail.com) — NOTES: gmail owner row added to prod admin_emails (#18). Undo: undo via the merged PR below: git revert 9a477c6.
- `cd656ff` (2026-10-04T17:47:42-05:00, 313aidaroos; alaidaroosawad@gmail.com) — Owner admin allowlist: both owner emails are Geoxis owner (verified only) (#17). Undo: undo via the merged PR below: git revert cd656ff.

### Merged PRs
- PR #18, merge `9a477c6`, `grok/notes-admin-row` → `main`, merged 2026-10-04 CT by 313aidaroos: NOTES: gmail owner row added to prod admin_emails. Undo: `git revert 9a477c6`.
- PR #17, merge `cd656ff`, `grok/owner-admin-allowlist` → `main`, merged 2026-10-04 CT by 313aidaroos: Owner admin allowlist for alaidaroosawad@gmail.com and awad@apixis.dev. Undo: `git revert cd656ff`.

## 2026-10-04 (CT) — Grok: provenance for unlogged items since 2026-10-02
- `dd294cc` (18:24 CT, 313aidaroos, **pushed straight to main, no PR**, during the freeze): "notes: 2026-10-04 catch-up", `NOTES/GROK.md` only. Side effect: it deleted this file's intro line and duplicated the "2026-10-04 summary" heading; both repaired in the claude-review-fixes PR. Who: Grok (catch-up job). Undo: `git revert dd294cc`.
- PR #20 / `4c09ca2` (18:31 CT, branch `claude/great-fermi-6brq7a`): Claude's full-portfolio review, adds `NOTES/CLAUDE.md` + an `AI_CHANGELOG.md` line. Notes only, no code/env/DB. Who: Claude (Claude Code). Undo: `git revert 4c09ca2`.
- Vercel env `ANTHROPIC_API_KEY` on project `spatial-dashboard` was updated 2026-10-04 12:00 CT by the 313aidaroos account (seen in env metadata; value not read). Status: **unattributed, under hub review**. It looks family-wide (Deduxis and PersonalContentBot saw the same change), but who did it and why is unconfirmed. The key itself was not touched. Undo: none from here; the hub decides after its review.
- Vercel env `ADMIN_EMAILS` created 17:44 CT (production + preview) — already logged under PR #17 above.

## 2026-10-04 (CT) — Grok: claude-review-fixes (branch `geoxis-lead/claude-review-fixes`, one PR, NOT merged/deployed)
- What / where:
  1. `spatial-dashboard/api/world/provision.js`: import `../../lib/supabaseServer.js` (was `../lib/…`, which doesn't exist, so the function crashed on load: live GET/POST = 500 FUNCTION_INVOCATION_FAILED). Metadata save now uses the Supabase Auth admin REST endpoint with `envConfig().url/serviceKey` (it used `@supabase/supabase-js`, which isn't a dependency, and wrong field names). Error body no longer echoes `err.message`.
  2. `spatial-dashboard/src/apixisWorld.js`: sends the session Bearer token (it sent none, so it always got 401); skips the call when signed out.
  3. `spatial-dashboard/lib/core.js`: Cixy model = `process.env.AI_MODEL || "claude-sonnet-5"` (new `cixyModel()`); it was `claude-sonnet-4-20250514`, retired 2026-06-15 — live POST /api/cixy answered 503 "Cixy is resting".
  4. `spatial-dashboard/lib/apixis-cixy.js`: per Awad's lock (corrected 2026-10-04 18:52 CT), the character still draws on Arab and Muslim culture. The line now reads "Your character draws on Arab and Muslim culture: warm hospitality, generosity, respect and directness." Removed (Halaxis-only): religious greetings (Salam / As-salamu alaykum), religious phrases (Insha'Allah / alhamdulillah), halal/religious rules (alcohol/pork/gambling/interest), the religious-ruling line, and the "faith" wording. Kept honesty and the Ixis/Wallet rules. This Geoxis copy now differs from the canonical `ApixisWallet/docs/CIXY.md` text.
  5. `spatial-dashboard/test/core.test.mjs`: tests now require the culture line and assert that the banned greetings, phrases, rules, rulings and the labels "Muslim AI" / "Muslim identity" are absent (the word "Muslim" in the culture line is allowed). New test for `cixyModel()`.
  6. `spatial-dashboard/docs/PROVISION_KIT.md`: "200 starter Ixis" → 1,000 (granted once on Apixis.dev). `spatial-dashboard/admin.html`: subtitle names both owner emails (text only, same styling).
- Not changed: the owner admin allowlist (already both emails since PR #17; `ADMIN_EMAILS` env holds both), Vercel env/protection, Supabase, Wallet, Stripe. No SVGs were removed: Claude added none since 10-02.
- Who: Grok (Geoxis Lead), at Awad's request via the Developer Bot hub, 2026-10-04 18:43 CT.
- Undo: close the PR without merging; after a merge, `git revert <squash SHA>`.
