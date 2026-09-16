import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";
import { snapshot } from "./lib/fleetEngine.js";

function geoxisApi() {
  return {
    name: "geoxis-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/assets") return next();
        try {
          const body = await snapshot();
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(body));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: String(err?.message || err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [cesium(), geoxisApi()],
  server: { port: 5173, open: false },
  preview: { port: 4173 },
  build: { target: "es2022", sourcemap: true },
});
