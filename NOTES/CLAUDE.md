# Claude notes (Geoxis)

Dated notes from Claude (Claude Code), same purpose as `NOTES/GROK.md`: what Claude checked or changed here, what it found, what is still open and who owns it. The one family status board is `ApixisWallet/docs/FAMILY_STATUS.md`.

## 2026-10-04 (UTC) — Claude: full-portfolio review (read-only; this note and the AI_CHANGELOG line are the only changes)

### Snapshot
- Reviewed `main` @ `2c0f0e1`; the owner admin allowlist merged → `main` is `cd656ff`. The app is `spatial-dashboard/`; Vercel project `spatial-dashboard` (alias `spatial-dashboard-xi.vercel.app`) production READY.
- Supabase `ncifprfgastofurrlsko`: 2 tracked migrations, applied — `lock_admin_emails` (the 09-23 critical fix) and `lock_current_asset_positions_view`.
- Open PR per the family board: #7 footer.

### Verified this session (`spatial-dashboard/`, on 2c0f0e1)
- `npm test` (node --test) and `npm run build` (vite): pass on Node 22. No lint / typecheck scripts. This repo has its own CI workflow (working-directory `spatial-dashboard`) rather than the shared caller.
- `api/redeem.js` has `PLANS_ON_SALE = false` ✓ (nothing sells).
- SDK: `apixis-cixy.js` and the world kit identical to canonical; `lib/apixis-wallet.js` / `lib/apixis-login.js` are JS ports (no canonical JS SDK exists).
- Advisors: `is_admin_user()` and `is_member()` are SECURITY DEFINER and executable by anon + authenticated (open since the 09-23 scan — revoke from anon); `admin_emails` RLS on, no policy (INFO); leaked-password WARN.

### Done (live)
3D globe with fleet positions + OpenSky ADS-B, login / set-password / admin / pricing / support pages, Apixis ID start + callback, Wallet balance + redeem route (gated off), world agent + welcome card, Cixy on the shared core, admin_emails locked, CI.

### Open — needs Awad
- What Geoxis sells — the `geoxis.tracking.*` and `geoxis.export.report` SKUs already exist in the Wallet catalog; `PLANS_ON_SALE` stays false until you say.
- PR #7 footer.

### Open — Claude can do on your go
- Archive or remove the root-level legacy "Meridian" demo (`index.html`, `main.js`, `aiController.js` with OpenAI Realtime, `mapController.js`, `streamSimulator.js`, `uiController.js`, `README-2.md`) — it is not deployed and confuses every reader.
- Revoke anon EXECUTE on `is_admin_user()` / `is_member()`.
- `spatial-dashboard/public/companies.html` links Ominix to `nexxis-tau.vercel.app`; `spatial-dashboard/docs/PROVISION_KIT.md` still says 200 starter Ixis.
- The Wallet's return-host list includes `geoxis.vercel.app`, which is not this project (harmless; tidy).
