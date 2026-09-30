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
