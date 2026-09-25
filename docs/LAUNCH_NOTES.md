# Geoxis: launch notes

_Updated 2026-09-25. One notes file per repo: what was changed, file by file, and everything you need to connect. The full family report: https://claude.ai/artifact/QERxA6PMsFK1vdR51Ex2NQ_

## Status

Ready after keys. Plans are not on sale (`PLANS_ON_SALE=false`).

## Connect (in order)

1. **Apixis Wallet key.** In the ApixisWallet repo run `npm run family-keys` once. It prints one SQL block (paste it in the Wallet's Supabase SQL editor) and one env block per site. Paste this site's block: `WALLET_API_KEY`, `APIXIS_CLIENT_ID`, `APIXIS_WALLET_API_URL`.
2. Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. AI: `ANTHROPIC_API_KEY`.
4. `RESEND_API_KEY` for support email.

Every key this repo reads is listed in `spatial-dashboard/.env.example` (required, optional, and legacy names to leave unset).

## Apixis Wallet

App `geoxis`. Catalog has `geoxis.tracking.*`. Redeem answers 'not on sale' until you flip `PLANS_ON_SALE`.

## Database

`002_lock_current_asset_positions.sql` applied live (2026-09-23).

## Open items

- Root 'Meridian' prototype files next to `spatial-dashboard/`: keep or delete (your call).

## What changed, file by file

Each changed backend code file also starts with a one-line `Change note (Claude, Sep 2026)` comment saying the same thing.

| File | Change |
|---|---|
| `docs/LAUNCH_NOTES.md` | This file. |
| `spatial-dashboard/.env.example` | Added 9 key(s) the code reads that were missing: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `WALLET_API_KEY`, `APIXIS_WALLET_API_URL`, `APP_URL`, `APIXIS_WALLET_API_KEY`. |
| `spatial-dashboard/api/cixy.js` | Rate limited. |
| `spatial-dashboard/api/redeem.js` | 'Not on sale' instead of an error. |
| `spatial-dashboard/api/support.js` | Rate limited. |
| `spatial-dashboard/lib/rateLimit.js` | New. Per-IP limiter. |
| `spatial-dashboard/sql/002_lock_current_asset_positions.sql` | View is `security_invoker`; browser roles revoked (closed cross-customer read). |

_Changes are backend and plumbing only. Pages, design and UI are not changed except where noted as a build or lint fix with no visual change._
