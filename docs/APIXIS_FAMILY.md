# Apixis family: shared Wallet (read before touching Ixis, billing or login)

Lead developer: Claude (backend). Owner: Awad. The source of truth for the whole family is **ApixisWallet → `AGENTS.md`**.

## Rules
1. **There is one Ixis balance: Apixis Wallet.** This site never stores, grants or computes its own Ixis balance and never runs its own Stripe checkout for plans or Ixis. It redeems from the Wallet (`/api/v1/reservations` → capture, or release).
2. **Who pays** is the person's verified email today. Once this site gets "Sign in with Apixis", it becomes their Apixis ID `sub`. Never use this site's own Supabase uid, and never take an email from the request body.
3. **A captured hold means the customer was charged,** so keep their access. If a release returns `409 already_captured`, the charge went through. Only a released hold means "not charged".
4. **Buy Ixis** links go to `https://apixis-wallet.vercel.app/buy?product=<app>&return_url=<this page>`. The Wallet sells the pack and sends the person back here with the Ixis.

## Status (2026-10-06)
- "Sign in with Apixis" is live (serverless `/auth/apixis/start` + `/auth/apixis/callback`, `spatial-dashboard/lib/apixis-login.js`, PR #5 and #22). Apixis ID is the only way to create an account; magic links and passwords are for existing accounts.
- Billing identity is the Apixis ID `sub` saved at sign-in (`app_metadata.apixis_sub`), else the verified email (`api/redeem.js`).
- Redeem writes an access row in `public.entitlements` (sql/004) before capture; `PLANS_ON_SALE` stays `false` until Awad flips it.
- Env (Vercel): `WALLET_API_KEY` (this site's own `apx_live_…` key from `npm run family-keys` in ApixisWallet), `APIXIS_CLIENT_ID=geoxis`, `APIXIS_WALLET_API_URL=https://apixis-wallet.vercel.app`. Full list: `spatial-dashboard/.env.example`.
