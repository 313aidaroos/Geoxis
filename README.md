# Geoxis

A 3D operations dashboard for company assets, built with Vite, vanilla JavaScript, Cesium, and Vercel functions.

The active application is in `spatial-dashboard/`. The public demo has six **simulated** fleet assets around Rotterdam and optional live OpenSky aircraft. Signed-in users request their own tenant’s recorded positions from Supabase. Cixy uses a server-side Anthropic credential.

```bash
cd spatial-dashboard
npm ci
npm run dev
npm run check
```

The default map needs no API key. Google photorealistic tiles are optional. See [`spatial-dashboard/README.md`](spatial-dashboard/README.md) for configuration and current limits.

Root-level HTML/JavaScript and `README-2.md` are historical Meridian prototype files; they are not deployed. The Vercel project root must be `spatial-dashboard`.
