import { defineConfig } from "vite";
import { resolve } from "path";
import cesium from "vite-plugin-cesium";
import { loadEnv } from "vite";

function geoxisApi() {
  const routes = {
    "/api/assets": () => import("./api/assets.js"),
    "/api/config": () => import("./api/config.js"),
    "/api/me": () => import("./api/me.js"),
    "/api/cixy": () => import("./api/cixy.js"),
    "/api/support": () => import("./api/support.js"),
    "/api/admin/support": () => import("./api/admin/support.js"),
    "/api/redeem": () => import("./api/redeem.js"),
    "/api/wallet/balance": () => import("./api/wallet/balance.js"),
    "/api/world/provision": () => import("./api/world/provision.js"),
    "/auth/apixis/start": () => import("./api/auth/apixis/start.js"),
    "/auth/apixis/callback": () => import("./api/auth/apixis/callback.js"),
  };
  const install = (server) => { server.middlewares.use(async (req, res, next) => {
    const load = routes[req.url?.split("?")[0]];
    if (!load) return next();
    try {
      const { default: handler } = await load();
      await handler(req, res);
    } catch (err) {
      res.statusCode = err.status || 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "request_failed" }));
    }
  });
  };
  return { name: "geoxis-api", configureServer: install, configurePreviewServer: install };
}

function cesiumInBody() {
  return {
    name: "geoxis-cesium-body",
    transformIndexHtml(html) {
      const withoutHeadCesium = html.replace(
        /<script src="[^"]*Cesium\.js"><\/script>\s*/g,
        "",
      );
      if (withoutHeadCesium.includes("Cesium.js")) return withoutHeadCesium;
      return withoutHeadCesium.replace(
        '<script type="module"',
        '<script src="/cesium/Cesium.js" defer></script>\n  <script type="module"',
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
  return {
    plugins: [cesium(), geoxisApi(), cesiumInBody()],
    server: { port: 5173, open: false },
    preview: { port: 4173 },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
        support: resolve(__dirname, "support.html"),
        admin: resolve(__dirname, "admin.html"),
        pricing: resolve(__dirname, "pricing.html"),
        password: resolve(__dirname, "set-password.html"),
        callback: resolve(__dirname, "auth/callback.html"),
      },
    },
  },
  };
});
