# AI Change Log

## Rules for AI models, bots, and agents

If you are an AI (Claude, ChatGPT, Grok, Gemini, Copilot, Cursor, JunoAI, or any other model, bot, or agent) and you add, modify, or delete anything in this repository, you **must** append a dated entry to this file describing what you changed and why — one entry per work session, no exceptions. This log is how the repository owner tracks what every AI did. Human commits do not need entries.

Entry format:

## YYYY-MM-DD — <your name/model>
- Changed: <files or area>
- Why: <reason>

---

## 2026-09-28 — JunoAI
- Changed: created this file
- Why: owner's standing rule — every AI that touches this repo must log its changes here

## 2026-09-30 — Geoxis Bot (Hermes Agent)
- Changed: Added Apixis world agent provision on first sign-in (family signup rule)
  - lib/apixis-world-agent.ts, lib/apixis-world-provision.ts, lib/apixis-world.ts: Official SDK from Apixis.dev (copied verbatim via gh api)
  - docs/PROVISION_KIT.md: SDK documentation
  - api/world/provision.js: Server endpoint using ensureWorldAgent() from SDK
  - src/apixisWorld.js: Client module to show welcome card (Geoxis theme: Special Elite, emerald green, dark card)
  - src/main.js: Wire provision call into engine start (1s delay after globe init)
- Why: Awad's family rule (2026-09-30): every new account gets wallet + avatar agent + welcome card linking to Apixis virtual world. Used official Grok SDK instead of custom implementation.

## 2026-09-30 — Claude (branch claude/awesome-newton-3tygzi)
- Changed: `spatial-dashboard/lib/apixis-wallet.js` `reserve`/`entitlements`/`redeem` take the Apixis ID `sub` or verified email (`owner_id` / `owner_email`); `spatial-dashboard/api/redeem.js` bills the Apixis `sub` first. `spatial-dashboard/lib/apixis-login.js` verifies with type `email` (D16). World kit re-synced.
- Why: family backend pass per Awad's 2026-09-30 decisions (ApixisWallet/AGENTS.md §0c D11–D16; live board: ApixisWallet/docs/FAMILY_STATUS.md). One SDK, one login kit, one world kit — copied from canonical, never patched by hand.

## 2026-09-30 (night pass) — Claude
- Changed: Cixy prompt now starts with the shared family core from `lib/apixis-cixy` (copied from `ApixisWallet/sdk/apixis-cixy`); only the product role stays site-specific. Greeting policy is the family rule (match the person, never open with salaam). Provider failures (no key, out of credit, 429, 5xx) answer `cixyUnavailableReply()` — a calm sentence with HTTP 503/429, never the vendor error. (`spatial-dashboard/lib/core.js` + `api/cixy.js`.)
- Why: Awad's overnight instruction — all backend and security done, one Cixy persona everywhere (ApixisWallet/docs/CIXY.md, sdk/apixis-cixy.*), agents on the same page (ApixisWallet/docs/FAMILY_STATUS.md).

## 2026-10-01 (early) — Claude
- Changed: `.github/workflows/ci.yml` — this repo had no CI on `main` (the shared-CI PR was never merged); it now calls `313aidaroos/github-actions/node-ci` on push/PR. `typecheck` script added where missing so CI type-checks (verified 0 errors, build green).
- Why: overnight second pass — every repo must prove itself on every push. (spatial-dashboard/ subdirectory workflow.)

## 2026-10-02 — Claude (Claude Code)
- Changed: `.env.example` now lists every env var the code reads (missing names appended with a one-line note each; file created).
- Why: so the owner can add keys in Vercel from one complete list. No code changed.

## 2026-10-02 (late night) — Claude
- Changed: new-account wording now says the Apixis world agent starts with **1,000** in-world Ixis (was 200). Apixis.dev really grants 1,000 (D11, `STARTER_IXIS_DEFAULTS.visitor`); shared world-kit comments changed identically in every copy.
- Why: the site was telling new people the wrong number.

## 2026-10-04 — Claude (Claude Code, full-portfolio review)
- Changed: `NOTES/CLAUDE.md` — this repo's slice of the 24-repo review (what is live, what is open, who owns each item, drift found). No code, env, database or deploy changes.
- Why: Awad asked for every repo to be read twice with a done / to-do / owner status, and for the notes in each repo to be updated. Notes only; Awad approved the merge on 2026-10-04.

## 2026-09-29 — Grok (Geoxis Lead)
- Changed: `spatial-dashboard/src/ixisCompanies.js` (new), `spatial-dashboard/index.html`, `login.html`, `support.html`, `admin.html`, `WORKBOARD.md`, `NOTES/GROK.md`
- Why: Awad-approved "Other Ixis companies" footer links (branch `geoxis-lead/ixis-footer`, PR #7)
- 2026-09-29 update (Grok, Geoxis Lead): removed Nursery Toons and Qahwah World from `spatial-dashboard/src/ixisCompanies.js` (Awad-approved), now 11 sites
- 2026-10-04 update (Grok, Geoxis Lead): branch brought up to date with main (`cca2d9e`); footer re-applied onto the current pages, unchanged.

## 2026-10-04 (evening) — Grok (Geoxis Lead, claude-review-fixes)
- Changed: `spatial-dashboard/api/world/provision.js` (import path + REST metadata save; it 500ed on every call), `src/apixisWorld.js` (Bearer token), `lib/core.js` (Cixy model `AI_MODEL` or `claude-sonnet-5`; old one retired), `lib/apixis-cixy.js` + `test/core.test.mjs` (culture line is Arab culture only; "Muslim", religious greetings, phrases, halal rules and rulings removed), `docs/PROVISION_KIT.md` (1,000 starter Ixis), `admin.html` (both owner emails in the subtitle), `NOTES/GROK.md` (entries for every unlogged change since 10-02).
- Why: Awad's review of Claude's work against his locks: fix only what's broken or breaks a lock. Not merged or deployed.

## 2026-10-04 (night) — Geoxis Lead (Grok)
- Changed: Vercel env `AI_MODEL=claude-sonnet-5` (plain, production + preview, id `rKc55dZWD1YNEtvC`) on `spatial-dashboard`; PR #21 squash-merged to `main` (prod auto-deploy).
- Why: Developer Bot hub order (relaying Awad, 18:55 CT) to ship the claude-review fixes. Undo: delete the env var in Vercel; `git revert` the #21 squash commit.

## 2026-10-04 (night, later) — Geoxis Lead (Grok)
- Changed: PR #21 deployed to production (squash `14b3481`, deploy `dpl_aTi5evjQuBD6yCVKLqmB78dt5eeU`); PR #7 "Other Ixis companies" footer updated with main (append conflicts in notes kept both sides) and squash-merged to `main`.
- Why: Developer Bot hub order (relaying Awad, 18:55 CT). Undo: `git revert` the PR #7 squash commit; `git revert 14b3481` for #21.

## 2026-10-04 (evening) — Grok (Geoxis Lead, apixis-only-signup)
- Changed: `spatial-dashboard/src/authClient.js` (magic link `create_user:false`, clear "no account, use Apixis" message), `spatial-dashboard/login.html` (one hint line), `NOTES/GROK.md`.
- Why: Awad's lock: one Apixis ID; Apixis is the only way to sign up. PR only, not merged.

## 2026-10-04 (night) — Geoxis Lead (Grok), PR #22 merge
- Changed: PR #22 (Apixis ID is the only signup; magic links `create_user: false`) updated with main and squash-merged. Supabase "Allow new users to sign up" left ON (hub decision).
- Why: Developer Bot hub order 19:19 CT. Undo: `git revert` the #22 squash commit.

## 2026-10-04 (night, record) — Geoxis Lead (Grok)
- Changed: notes only — PR #7 squash `d471ddd`, prod deploy `dpl_ELY6dUmxSUWuV5pALhSYa8pMhf93` READY, live footer confirmed.
- Why: record the merge SHA after the fact (notes PR, no direct push). Undo: `git revert d471ddd`.

## 2026-10-04 (night, record 2) — Geoxis Lead (Grok)
- Changed: notes only — PR #22 squash `4e9da19`, prod deploy `dpl_FFnaKREhNFJh8HGQMKtTt6A4a9uK` READY; signup setting stays ON (hub decision).
- Why: record merge SHAs after the fact. Undo: `git revert 4e9da19`.
