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

## 2026-09-29 — Geoxis Lead (Grok)
- Changed: `spatial-dashboard/lib/apixis-world.js` (new), `lib/apixis-login.js`, `api/wallet/balance.js`, `src/walletPill.js`, `login.html`, `test/apixis-world.test.mjs` (new), `.env.example`; `WORKBOARD.md` (new), `NOTES/GROK.md`
- Why: one Apixis ID = one Apixis Wallet = one Apixis world agent: provision the user's own world agent at first Apixis ID sign-in (idempotent, id stored in app_metadata), "Your agent is in the Apixis world" link next to the Wallet balance pill, "Log in with Apixis ID" as the main sign-in. Branch `geoxis-lead/one-account`, not merged.
