# Geoxis

A live map of everything a company has moving in the real world, on a 3D globe.

App lives in `spatial-dashboard/`. The globe polls `GET /api/assets` — company fleet positions from the server clock, plus live ADS-B over Rotterdam from OpenSky when that network answers.

```bash
cd spatial-dashboard
npm install
npm run dev
```

No keys required for the default globe and the live feed. Google Map Tiles and OpenAI are optional (settings gear).
