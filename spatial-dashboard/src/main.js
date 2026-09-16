/**
 * main.js — Application bootstrapper and global state.
 *
 * Owns the lifecycle of the three runtime modules (map, stream, AI) and the
 * UI controller, exposes a single event bus so modules never import each
 * other, and manages persisted user settings (API keys, layer visibility).
 */

import { GeospatialMap } from "./mapController.js";
import { AssetDataStreamer } from "./streamSimulator.js";
import { SpatialAIAgent } from "./aiController.js";
import { UIController } from "./uiController.js";

/* ------------------------------------------------------------------ */
/*  Event bus                                                          */
/* ------------------------------------------------------------------ */

export class EventBus {
  #listeners = new Map();

  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.#listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const handlers = this.#listeners.get(event);
    if (!handlers) return;
    for (const h of handlers) {
      try {
        h(payload);
      } catch (err) {
        console.error(`[bus] handler for "${event}" threw`, err);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Settings manager                                                   */
/* ------------------------------------------------------------------ */

const STORAGE_NS = "geoxis.v1";

const KEY_RULES = {
  googleMapsKey: {
    label: "Google Maps Platform key",
    optional: true,
    // Google API keys are 39 chars, begin with "AIza".
    validate: (v) => /^AIza[0-9A-Za-z_-]{35}$/.test(v),
    hint: "Google keys start with AIza and are 39 characters long.",
  },
  openaiKey: {
    label: "OpenAI API key",
    optional: true,
    // Accept classic sk-… and project keys sk-proj-…; only shape is checked.
    validate: (v) => /^sk-[A-Za-z0-9_-]{20,}$/.test(v),
    hint: "OpenAI keys start with sk- followed by at least 20 characters.",
  },
};

export class SettingsManager {
  #cache = null;

  constructor(namespace = STORAGE_NS) {
    this.namespace = namespace;
  }

  #storageKey(name) {
    return `${this.namespace}.${name}`;
  }

  #read(name, fallback = null) {
    try {
      const raw = localStorage.getItem(this.#storageKey(name));
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  #write(name, value) {
    try {
      if (value === null || value === undefined || value === "") {
        localStorage.removeItem(this.#storageKey(name));
      } else {
        localStorage.setItem(this.#storageKey(name), JSON.stringify(value));
      }
      this.#cache = null;
      return true;
    } catch (err) {
      console.warn("[settings] localStorage unavailable", err);
      return false;
    }
  }

  /** Returns a snapshot of all persisted settings. */
  getAll() {
    if (!this.#cache) {
      this.#cache = {
        googleMapsKey: this.#read("googleMapsKey", ""),
        openaiKey: this.#read("openaiKey", ""),
        layers: this.#read("layers", { fleet: true, weather: false, risk: true, trails: true }),
        aiModel: this.#read("aiModel", "gpt-realtime"),
      };
    }
    return { ...this.#cache };
  }

  getKey(name) {
    return this.getAll()[name] || "";
  }

  hasKey(name) {
    return Boolean(this.getKey(name));
  }

  /**
   * Validates and stores a set of keys. Returns { ok, errors } where errors
   * maps field name -> human-readable message. Nothing is written if any
   * provided field fails validation.
   */
  saveKeys(input) {
    const errors = {};
    const clean = {};

    for (const [name, rule] of Object.entries(KEY_RULES)) {
      const value = (input[name] ?? "").trim();
      if (!value) {
        if (!rule.optional) errors[name] = `${rule.label} is required.`;
        clean[name] = "";
        continue;
      }
      if (!rule.validate(value)) {
        errors[name] = `That doesn't look like a valid ${rule.label.toLowerCase()}. ${rule.hint}`;
        continue;
      }
      clean[name] = value;
    }

    if (Object.keys(errors).length) return { ok: false, errors };

    for (const [name, value] of Object.entries(clean)) this.#write(name, value);
    return { ok: true, errors: {} };
  }

  clearKeys() {
    for (const name of Object.keys(KEY_RULES)) this.#write(name, null);
  }

  setLayers(layers) {
    this.#write("layers", { ...this.getAll().layers, ...layers });
  }

  /** Masks a key for display: sk-proj-…Kq2 */
  static mask(key) {
    if (!key) return "";
    return key.length <= 10 ? "••••" : `${key.slice(0, 7)}…${key.slice(-3)}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Application state                                                  */
/* ------------------------------------------------------------------ */

export class AppState {
  constructor(bus) {
    this.bus = bus;
    /** @type {Map<string, object>} id -> latest telemetry frame */
    this.assets = new Map();
    this.selectedAssetId = null;
    this.followingAssetId = null;
    this.metrics = { totalAssets: 0, latencyMs: null, activeAlarms: 0 };
    this.layers = { fleet: true, weather: false, risk: true, trails: true };
    this.feed = { connected: false, messagesPerSecond: 0 };
  }

  upsertAsset(frame) {
    const prev = this.assets.get(frame.id);
    const next = { ...prev, ...frame, lastSeen: Date.now() };
    this.assets.set(frame.id, next);
    this.#recomputeMetrics();
    this.bus.emit("asset:updated", next);
    return next;
  }

  removeAsset(id) {
    if (!this.assets.delete(id)) return;
    if (this.selectedAssetId === id) this.selectAsset(null);
    this.#recomputeMetrics();
    this.bus.emit("asset:removed", id);
  }

  selectAsset(id) {
    if (this.selectedAssetId === id) return;
    this.selectedAssetId = id;
    if (id === null) this.followingAssetId = null;
    this.bus.emit("asset:selected", id ? this.assets.get(id) ?? null : null);
  }

  setFollowing(id) {
    this.followingAssetId = id;
    this.bus.emit("asset:following", id);
  }

  setLayer(name, enabled) {
    if (this.layers[name] === enabled) return;
    this.layers[name] = enabled;
    this.bus.emit("layer:changed", { name, enabled });
  }

  setLatency(ms) {
    this.metrics.latencyMs = ms;
    this.bus.emit("metrics:changed", { ...this.metrics });
  }

  setFeedStatus(partial) {
    this.feed = { ...this.feed, ...partial };
    this.bus.emit("feed:status", { ...this.feed });
  }

  #recomputeMetrics() {
    let alarms = 0;
    for (const a of this.assets.values()) if (a.alarm) alarms += 1;
    this.metrics.totalAssets = this.assets.size;
    this.metrics.activeAlarms = alarms;
    this.bus.emit("metrics:changed", { ...this.metrics });
  }
}

/* ------------------------------------------------------------------ */
/*  Engine                                                             */
/* ------------------------------------------------------------------ */

export class B2BSaasEngine {
  static DEFAULT_CONFIG = Object.freeze({
    // Port of Rotterdam — Maasvlakte approaches.
    origin: { latitude: 51.9486, longitude: 4.1444 },
    initialCameraAltitudeMeters: 18_000,
    initialCameraPitchDegrees: -45,
    streamIntervalMs: 2000,
    streamTargetCount: 6,
    streamRadiusKm: 50,
    assetStaleAfterMs: 15_000,
  });

  constructor(userConfig = {}) {
    this.config = { ...B2BSaasEngine.DEFAULT_CONFIG, ...userConfig };
    this.env = B2BSaasEngine.detectEnvironment();
    this.bus = new EventBus();
    this.settings = new SettingsManager();
    this.state = new AppState(this.bus);
    this.state.layers = this.settings.getAll().layers;

    this.map = null;
    this.stream = null;
    this.ai = null;
    this.ui = null;
    this.#staleSweep = null;
  }

  #staleSweep;

  static detectEnvironment() {
    const isDev = import.meta.env?.DEV ?? false;
    return {
      mode: isDev ? "development" : "production",
      secureContext: window.isSecureContext,
      hasWebSocket: typeof WebSocket !== "undefined",
      hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      hasWebGL: (() => {
        try {
          const c = document.createElement("canvas");
          return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
        } catch {
          return false;
        }
      })(),
    };
  }

  async start() {
    if (!this.env.hasWebGL) {
      throw new Error("This browser does not support WebGL, which the 3D globe requires.");
    }

    // 1. UI first so status is visible while heavier modules boot.
    this.ui = new UIController(this);
    this.ui.mount();

    // 2. Globe.
    this.map = new GeospatialMap({
      containerId: "cesiumContainer",
      bus: this.bus,
      state: this.state,
      origin: this.config.origin,
      altitude: this.config.initialCameraAltitudeMeters,
      pitch: this.config.initialCameraPitchDegrees,
    });
    await this.map.initialize({ googleMapsKey: this.settings.getKey("googleMapsKey") });

    // 3. Telemetry pipeline.
    this.stream = new AssetDataStreamer({
      bus: this.bus,
      origin: this.config.origin,
      radiusKm: this.config.streamRadiusKm,
      intervalMs: this.config.streamIntervalMs,
      targetCount: this.config.streamTargetCount,
      endpoint: "/api/assets",
    });
    this.#wireStream();
    this.stream.connect();

    // 4. AI agent (lazy-connects when the panel is opened and a key exists).
    this.ai = new SpatialAIAgent({
      bus: this.bus,
      state: this.state,
      map: this.map,
      getApiKey: () => this.settings.getKey("openaiKey"),
      model: this.settings.getAll().aiModel,
    });

    this.#wireLayers();
    this.#startStaleSweep();

    if (!this.settings.hasKey("googleMapsKey")) {
      this.ui.toast("Globe is live on the default tiles. Optional: add a Google Maps key for photorealistic 3D.");
    }

    window.addEventListener("beforeunload", () => this.shutdown());
    return this;
  }

  #wireStream() {
    this.bus.on("stream:frame", (frame) => {
      const asset = this.state.upsertAsset(frame);
      if (this.state.layers.fleet) {
        this.map.upsertAssetMarker(
          asset.id, asset.type, asset.latitude, asset.longitude, asset.heading, asset,
        );
      }
      if (this.state.followingAssetId === asset.id) {
        this.map.trackAsset(asset.id);
      }
    });
    this.bus.on("stream:latency", (ms) => this.state.setLatency(ms));
    this.bus.on("stream:status", (status) => this.state.setFeedStatus(status));
  }

  #wireLayers() {
    this.bus.on("layer:changed", ({ name, enabled }) => {
      this.settings.setLayers({ [name]: enabled });
      this.map.setLayerVisible(name, enabled);
      if (name === "fleet" && enabled) {
        // Re-sync every asset in state when the layer comes back on.
        for (const a of this.state.assets.values()) {
          this.map.upsertAssetMarker(a.id, a.type, a.latitude, a.longitude, a.heading, a);
        }
      }
    });
    for (const [name, enabled] of Object.entries(this.state.layers)) {
      this.map.setLayerVisible(name, enabled);
    }
  }

  #startStaleSweep() {
    this.#staleSweep = setInterval(() => {
      const cutoff = Date.now() - this.config.assetStaleAfterMs;
      for (const a of this.state.assets.values()) {
        if (a.lastSeen < cutoff) {
          this.map.removeAssetMarker(a.id);
          this.state.removeAsset(a.id);
        }
      }
    }, 5000);
  }

  /** Called by the UI after keys are saved so live modules pick them up. */
  async applySettings() {
    const { googleMapsKey } = this.settings.getAll();
    await this.map.setGoogleTiles(googleMapsKey);
    this.ai?.reconfigure({ apiKey: this.settings.getKey("openaiKey") });
  }

  shutdown() {
    clearInterval(this.#staleSweep);
    this.stream?.disconnect();
    this.ai?.disconnect();
    this.map?.destroy();
  }
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

const engine = new B2BSaasEngine();
window.geoxis = engine;

engine.start().catch((err) => {
  console.error("[engine] fatal boot error", err);
  const status = document.getElementById("mapStatus");
  if (status) status.textContent = err.message;
});
