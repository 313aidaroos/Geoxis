import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

// vite-plugin-cesium copies Cesium's static assets (Workers, Assets, Widgets)
// into the build and sets window.CESIUM_BASE_URL so the viewer can find them.
export default defineConfig({
  plugins: [cesium()],
  server: { port: 5173, open: true },
  build: { target: "es2022", sourcemap: true },
});
