# Geoxis — operations globe

## Run and verify

```bash
npm ci
npm run dev
npm run check
npm run preview
```

Dev runs on port 5173; preview runs on 4173 and serves the built pages. Both use the same API handlers as the deployed Vercel functions. Copy `.env.example` to `.env.local` for local integrations; values remain server-side unless explicitly returned by `/api/config`.

`npm run check` runs unit and API regression tests, creates the production build, verifies all nine shipped pages and bundled fallback imagery, and imports every server handler. The existing CI runs the same tests and build checks. Auth and onboarding tests stub upstream services and never create live accounts or charge a Wallet.

## Data and map

- Public `/api/assets`: six simulated fleet assets, plus OpenSky aircraft when available.
- Authenticated `/api/assets`: tenant-scoped recorded positions from `current_asset_positions`. The browser sends its bearer token; auth failures do not fall back to the public demo.
- Aircraft retain their source observation time. Cached observations are marked stale after an upstream error or one minute, and removed after five minutes.
- The globe starts with packaged Natural Earth imagery, then adds ArcGIS satellite imagery. External imagery failure leaves the overview map available. Provider attribution remains visible.
- Risk zones are fixed demonstration zones around Rotterdam.

## Accounts and services

New accounts use Sign in with Apixis. Email links and password sign-in are for existing accounts. Supabase URL, anon key, and server service-role key are required for account-backed features. Apixis sign-in uses `WALLET_API_KEY`, `APIXIS_CLIENT_ID`, and the registered callback URL; world onboarding additionally needs `APIXIS_WORLD_KEY`.

Cixy uses `ANTHROPIC_API_KEY` on the server, with optional `AI_MODEL`. The browser no longer asks for an unused OpenAI key. Google Map Tiles is optional and uses a browser-restricted Google key in settings. Support email delivery uses `RESEND_API_KEY`.

## Deployment and remaining work

Use `spatial-dashboard` as the Vercel root, `npm run build` as the build command, and `dist` as the output directory. Pricing, password setup, and `auth/callback` are explicit build entries.

Plans and map reports are **not on sale**. Pricing displays the existing planned amounts and disabled buttons. Keep the server redemption gate closed until Wallet catalog readiness, provisioned access, and feature enforcement have been verified together. This repository still needs real customer telemetry ingestion and asset-management workflows before selling fleet tracking. No database or production environment changes are included in the readiness fixes.
