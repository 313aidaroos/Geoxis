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
