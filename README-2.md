# Meridian — Spatial Intelligence Dashboard (boilerplate)

Framework-free B2B geospatial dashboard: Vanilla JS + Vite + Tailwind + CesiumJS,
with a simulated live transponder feed and an OpenAI Realtime voice/text assistant
that knows what's in your viewport.

## Run it

```bash
npm install
npm run dev
```

Open the settings gear (top of the sidebar) and paste:

- **Google Maps Platform key** — needs the *Map Tiles API* enabled. Optional;
  without it the app uses Cesium's built-in globe.
- **OpenAI API key** — enables the assistant. Optional.

Keys live only in this browser's `localStorage`.

## Structure

| File | Role |
|---|---|
| `index.html` | Layout: sidebar, globe viewport, metrics bar, AI panel, settings modal |
| `src/main.js` | `B2BSaasEngine` bootstrapper, `AppState`, `EventBus`, `SettingsManager` |
| `src/mapController.js` | `GeospatialMap` — Cesium viewer, Google 3D tiles, markers, layers, camera |
| `src/streamSimulator.js` | `AssetDataStreamer` + `MockTransponderSocket` — dead-reckoned telemetry |
| `src/aiController.js` | `SpatialAIAgent` — OpenAI Realtime WebSocket, context injection, tools |
| `src/uiController.js` | DOM binding for everything above |

Modules communicate only through the event bus; none imports another at runtime
except type references.

## Swapping in real data

`AssetDataStreamer` accepts `endpoint: "wss://…"`. Any socket that sends
`{ "channel": "telemetry", "sentAt": <ms>, "payload": { id, name, type, latitude,
longitude, heading, speedMps, … } }` works unchanged.

## Production notes

- The assistant connects from the browser using OpenAI's insecure-key subprotocol,
  which is fine for a single-user demo. Before shipping, mint ephemeral client
  secrets on a backend and return them from `getApiKey()`.
- Google 3D Tiles billing is per tile request; `maximumScreenSpaceError` in
  `mapController.js` is the main lever on cost.
- Tailwind is loaded from the CDN for transparency. For production builds, install
  Tailwind locally and purge unused classes.
