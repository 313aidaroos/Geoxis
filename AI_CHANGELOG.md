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
  - lib/apixis-world.js: World provision client (calls https://www.apixis.dev/api/agent/provision)
  - api/world/provision.js: Server endpoint to provision + persist in user app_metadata
  - src/apixisWorld.js: Client module to show welcome card with "Enter the Apixis world" link
  - src/main.js: Wire provision call into engine start (1s delay after globe init)
- Why: Awad's family rule (2026-09-30): every new account gets wallet + avatar agent + welcome card linking to Apixis virtual world
