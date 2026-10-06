# Apixis family: shared Wallet (read before touching Ixis, billing or login)

Lead developer: Claude (backend). Owner: Awad. The source of truth for the whole family is **ApixisWallet → `AGENTS.md`**.

## Rules
1. **There is one Ixis balance: Apixis Wallet.** This site never stores, grants or computes its own Ixis balance and never runs its own Stripe checkout for plans or Ixis. It redeems from the Wallet (`/api/v1/reservations` → capture, or release).
2. **Who pays** is the person's verified email today. Once this site gets "Sign in with Apixis", it becomes their Apixis ID `sub`. Never use this site's own Supabase uid, and never take an email from the request body.
3. **A captured hold means the customer was charged,** so keep their access. If a release returns `409 already_captured`, the charge went through. Only a released hold means "not charged".
4. **Buy Ixis** links go to `https://apixis-wallet.vercel.app/buy?product=<app>&return_url=<this page>`. The Wallet sells the pack and sends the person back here with the Ixis.

## Status (2026-10-05)
- Apixis sign-in is implemented by `/api/auth/apixis/start` and `/api/auth/apixis/callback`, with public rewrites in `vercel.json`. New accounts use Apixis ID; magic links and password sign-in remain available to existing users.
- World provisioning uses verified server Auth metadata and requires `APIXIS_WORLD_KEY`. A failed metadata write leaves onboarding retryable.
- Browser fleet polling sends its bearer token to `/api/assets`, so signed-in users see tenant data.
- Plans and reports remain unavailable for purchase. Entitlement provisioning and enforcement must be completed before enabling redemption.
- See `spatial-dashboard/.env.example` for server configuration names and `spatial-dashboard/README.md` for local verification.
