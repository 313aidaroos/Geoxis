/**
 * aiController.js — Conversational spatial agent over the OpenAI Realtime API.
 *
 * Opens a persistent WebSocket to the Realtime endpoint, keeps the session's
 * instructions synchronised with the live map context (camera, viewport
 * bounds, selected asset, visible assets), streams text/audio responses back
 * to the UI, and exposes map actions to the model as tools.
 *
 * Security note: the browser-side "insecure API key" subprotocol is used here
 * so the boilerplate runs with no backend. For production, mint an ephemeral
 * client secret server-side (POST /v1/realtime/client_secrets) and pass it via
 * `getApiKey()` instead of the raw key.
 */

const REALTIME_URL = "wss://api.openai.com/v1/realtime";
const AUDIO_SAMPLE_RATE = 24_000; // Realtime API expects 24 kHz PCM16 mono
const CONTEXT_REFRESH_MS = 4000;

export class SpatialAIAgent {
  /**
   * @param {object} opts
   * @param {import("./main.js").EventBus} opts.bus
   * @param {import("./main.js").AppState} opts.state
   * @param {import("./mapController.js").GeospatialMap} opts.map
   * @param {() => string} opts.getApiKey
   * @param {string} [opts.model]
   * @param {string} [opts.voice]
   */
  constructor({ bus, state, map, getApiKey, model = "gpt-realtime", voice = "marin" }) {
    this.bus = bus;
    this.state = state;
    this.map = map;
    this.getApiKey = getApiKey;
    this.model = model;
    this.voice = voice;

    this.socket = null;
    this.status = "offline"; // offline | connecting | connected | listening | streaming | error
    this.sessionReady = false;

    this.#pendingResponseText = "";
    this.#contextTimer = null;
    this.#lastContextHash = "";

    // Audio in/out
    this.#audioCtx = null;
    this.#micStream = null;
    this.#micNode = null;
    this.#playbackQueueTime = 0;
  }

  #pendingResponseText; #contextTimer; #lastContextHash;
  #audioCtx; #micStream; #micNode; #playbackQueueTime;

  /* ---------------------------------------------------------------- */
  /*  Connection                                                       */
  /* ---------------------------------------------------------------- */

  reconfigure({ apiKey, model } = {}) {
    if (model) this.model = model;
    if (this.socket) {
      this.disconnect();
      if (apiKey) this.connect();
    }
  }

  connect() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.#setStatus("offline");
      this.#system("Add an OpenAI API key in settings to enable the assistant.");
      return false;
    }
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return true;

    this.#setStatus("connecting");
    const url = `${REALTIME_URL}?model=${encodeURIComponent(this.model)}`;

    // Browsers can't set Authorization headers on WebSockets; the Realtime API
    // accepts the key via subprotocol for client-side use.
    this.socket = new WebSocket(url, [
      "realtime",
      `openai-insecure-api-key.${apiKey}`,
      "openai-beta.realtime-v1",
    ]);

    this.socket.onopen = () => {
      this.#setStatus("connected");
      this.#sendSessionUpdate();
      this.#startContextRefresh();
    };
    this.socket.onmessage = (evt) => this.#handleServerEvent(evt);
    this.socket.onerror = (err) => {
      console.error("[ai] socket error", err);
      this.#setStatus("error");
    };
    this.socket.onclose = ({ code, reason }) => {
      this.#stopContextRefresh();
      this.sessionReady = false;
      this.#setStatus(code === 1000 ? "offline" : "error");
      if (code !== 1000) this.#system(`Assistant disconnected (${code}${reason ? `: ${reason}` : ""}).`);
    };
    return true;
  }

  disconnect() {
    this.stopListening();
    this.#stopContextRefresh();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close(1000, "client disconnect");
      this.socket = null;
    }
    this.sessionReady = false;
    this.#setStatus("offline");
  }

  get isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  #send(event) {
    if (!this.isConnected) return false;
    this.socket.send(JSON.stringify(event));
    return true;
  }

  /* ---------------------------------------------------------------- */
  /*  Spatial context                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Snapshot of everything the model needs to reason about the viewport:
   * camera pose, center point, bounding box, selected asset, visible assets.
   */
  getCurrentViewContext() {
    const cam = this.map.getCameraState();
    const visible = this.map.getVisibleAssets().map(SpatialAIAgent.#compactAsset);
    const selected = this.state.selectedAssetId
      ? SpatialAIAgent.#compactAsset(this.state.assets.get(this.state.selectedAssetId))
      : null;

    return {
      generatedAt: new Date().toISOString(),
      camera: cam?.camera ?? null,
      viewCenter: cam?.center ?? null,
      boundingBox: cam?.boundingBox ?? null,
      selectedAsset: selected,
      visibleAssets: visible,
      totalTrackedAssets: this.state.assets.size,
      activeAlarms: this.state.metrics.activeAlarms,
      layers: { ...this.state.layers },
    };
  }

  static #compactAsset(a) {
    if (!a) return null;
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      operator: a.operator,
      latitude: a.latitude,
      longitude: a.longitude,
      headingDeg: a.heading,
      speedKnots: a.speedKnots,
      speedKph: a.speedKph,
      destination: a.destination,
      cargo: a.cargo,
      alarm: a.alarm ? a.alarmReason : null,
    };
  }

  /** Builds the developer/system instructions with the live context embedded. */
  buildInstructions() {
    const ctx = this.getCurrentViewContext();
    const fmt = (n, d = 4) => (typeof n === "number" ? n.toFixed(d) : "unknown");
    const bbox = ctx.boundingBox
      ? `north ${fmt(ctx.boundingBox.north)}, south ${fmt(ctx.boundingBox.south)}, east ${fmt(ctx.boundingBox.east)}, west ${fmt(ctx.boundingBox.west)}`
      : "unknown";

    return [
      "You are Geoxis, the spatial assistant inside a live operations globe.",
      "You answer questions about assets on a 3D map of the Port of Rotterdam region and can move the camera using tools.",
      "Be concise and operational: lead with the answer, use plain units (knots for vessels, km/h for road assets), and name assets by their display name and ID.",
      "Only report assets present in the context below. If the viewport is empty, say so and offer to widen the view.",
      "When the user asks to see, go to, or focus on an asset, call fly_to_asset. When they ask what is visible, use the context directly.",
      "",
      "## Live map context",
      `Generated: ${ctx.generatedAt}`,
      `Camera: lat ${fmt(ctx.camera?.latitude)}, lon ${fmt(ctx.camera?.longitude)}, altitude ${ctx.camera?.altitudeMeters ?? "?"} m, heading ${ctx.camera?.headingDeg ?? "?"}°, pitch ${ctx.camera?.pitchDeg ?? "?"}°`,
      `View center: lat ${fmt(ctx.viewCenter?.latitude)}, lon ${fmt(ctx.viewCenter?.longitude)}`,
      `Viewport bounding box (degrees): ${bbox}`,
      `Tracked assets total: ${ctx.totalTrackedAssets}; active alarms: ${ctx.activeAlarms}`,
      `Layers: ${Object.entries(ctx.layers).map(([k, v]) => `${k}=${v ? "on" : "off"}`).join(", ")}`,
      `Selected asset: ${ctx.selectedAsset ? JSON.stringify(ctx.selectedAsset) : "none"}`,
      `Assets currently inside the viewport (${ctx.visibleAssets.length}):`,
      ctx.visibleAssets.length ? JSON.stringify(ctx.visibleAssets) : "[]",
    ].join("\n");
  }

  #toolDefinitions() {
    return [
      {
        type: "function",
        name: "fly_to_asset",
        description: "Move the map camera to an asset by ID and select it.",
        parameters: {
          type: "object",
          properties: {
            asset_id: { type: "string", description: "The asset ID, e.g. IMO9811000 or NL-TR-4471" },
            altitude_meters: { type: "number", description: "Camera height above the asset. Default 3000." },
          },
          required: ["asset_id"],
        },
      },
      {
        type: "function",
        name: "list_all_assets",
        description: "Return every tracked asset, not just those in the viewport.",
        parameters: { type: "object", properties: {} },
      },
      {
        type: "function",
        name: "set_layer",
        description: "Toggle a map layer on or off.",
        parameters: {
          type: "object",
          properties: {
            layer: { type: "string", enum: ["fleet", "weather", "risk", "trails"] },
            enabled: { type: "boolean" },
          },
          required: ["layer", "enabled"],
        },
      },
    ];
  }

  #sendSessionUpdate() {
    const instructions = this.buildInstructions();
    this.#lastContextHash = SpatialAIAgent.#hash(instructions);
    this.#send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions,
        output_modalities: ["audio"],
        tools: this.#toolDefinitions(),
        tool_choice: "auto",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: AUDIO_SAMPLE_RATE },
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: null, // push-to-talk; we commit manually
          },
          output: {
            format: { type: "audio/pcm", rate: AUDIO_SAMPLE_RATE },
            voice: this.voice,
          },
        },
      },
    });
  }

  /** Re-sends instructions only when the viewport context has changed. */
  #startContextRefresh() {
    this.#stopContextRefresh();
    this.#contextTimer = setInterval(() => {
      if (!this.isConnected || this.status === "streaming") return;
      const next = this.buildInstructions();
      const h = SpatialAIAgent.#hash(next);
      if (h !== this.#lastContextHash) {
        this.#lastContextHash = h;
        this.#send({ type: "session.update", session: { type: "realtime", instructions: next } });
      }
    }, CONTEXT_REFRESH_MS);
  }

  #stopContextRefresh() {
    clearInterval(this.#contextTimer);
    this.#contextTimer = null;
  }

  static #hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return String(h);
  }

  /* ---------------------------------------------------------------- */
  /*  Text turns                                                       */
  /* ---------------------------------------------------------------- */

  sendText(text) {
    const clean = text.trim();
    if (!clean) return false;
    if (!this.isConnected && !this.connect()) return false;
    if (!this.isConnected) {
      // Socket still opening: queue the turn for onopen.
      const once = () => { this.socket.removeEventListener("open", once); this.sendText(clean); };
      this.socket.addEventListener("open", once);
      return true;
    }

    this.bus.emit("ai:message", { role: "user", text: clean });
    // Fresh context right before the turn so the answer reflects the current view.
    this.#send({ type: "session.update", session: { type: "realtime", instructions: this.buildInstructions() } });
    this.#send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: clean }] },
    });
    this.#send({ type: "response.create", response: { output_modalities: ["text"] } });
    this.#setStatus("streaming");
    return true;
  }

  /* ---------------------------------------------------------------- */
  /*  Voice turns (push-to-talk)                                       */
  /* ---------------------------------------------------------------- */

  async startListening() {
    if (!this.isConnected && !this.connect()) return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.#system("Microphone access isn't available in this browser.");
      return false;
    }
    try {
      this.#audioCtx ??= new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      if (this.#audioCtx.state === "suspended") await this.#audioCtx.resume();

      this.#micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, sampleRate: AUDIO_SAMPLE_RATE },
      });
      const source = this.#audioCtx.createMediaStreamSource(this.#micStream);

      // ScriptProcessorNode is deprecated but universally supported and
      // sufficient for 24 kHz mono capture without a separate worklet file.
      const processor = this.#audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (this.status !== "listening") return;
        const float32 = e.inputBuffer.getChannelData(0);
        this.#send({ type: "input_audio_buffer.append", audio: SpatialAIAgent.#floatToPcm16Base64(float32) });
      };
      source.connect(processor);
      processor.connect(this.#audioCtx.destination); // required for onaudioprocess to fire
      this.#micNode = { source, processor };

      this.#send({ type: "input_audio_buffer.clear" });
      this.#setStatus("listening");
      return true;
    } catch (err) {
      console.error("[ai] microphone error", err);
      this.#system(err.name === "NotAllowedError" ? "Microphone permission was denied." : "Couldn't start the microphone.");
      this.#setStatus(this.isConnected ? "connected" : "error");
      return false;
    }
  }

  stopListening({ submit = true } = {}) {
    const wasListening = this.status === "listening";
    if (this.#micNode) {
      this.#micNode.processor.disconnect();
      this.#micNode.source.disconnect();
      this.#micNode = null;
    }
    this.#micStream?.getTracks().forEach((t) => t.stop());
    this.#micStream = null;

    if (wasListening && submit && this.isConnected) {
      this.#send({ type: "session.update", session: { type: "realtime", instructions: this.buildInstructions() } });
      this.#send({ type: "input_audio_buffer.commit" });
      this.#send({ type: "response.create" });
      this.#setStatus("streaming");
    } else if (wasListening) {
      this.#setStatus(this.isConnected ? "connected" : "offline");
    }
  }

  static #floatToPcm16Base64(float32) {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(pcm.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  #playPcm16Base64(b64) {
    this.#audioCtx ??= new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    const buffer = this.#audioCtx.createBuffer(1, pcm.length, AUDIO_SAMPLE_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;

    const src = this.#audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.#audioCtx.destination);
    const startAt = Math.max(this.#audioCtx.currentTime, this.#playbackQueueTime);
    src.start(startAt);
    this.#playbackQueueTime = startAt + buffer.duration;
  }

  /* ---------------------------------------------------------------- */
  /*  Server events                                                    */
  /* ---------------------------------------------------------------- */

  #handleServerEvent(evt) {
    let event;
    try {
      event = JSON.parse(evt.data);
    } catch {
      return;
    }

    switch (event.type) {
      case "session.created":
      case "session.updated":
        this.sessionReady = true;
        break;

      // Text streaming (GA and beta event names).
      case "response.output_text.delta":
      case "response.text.delta":
        this.#pendingResponseText += event.delta ?? "";
        this.bus.emit("ai:delta", { text: this.#pendingResponseText });
        break;

      // Audio streaming + its transcript.
      case "response.output_audio.delta":
      case "response.audio.delta":
        if (event.delta) this.#playPcm16Base64(event.delta);
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        this.#pendingResponseText += event.delta ?? "";
        this.bus.emit("ai:delta", { text: this.#pendingResponseText });
        break;

      // User speech transcript, shown as the user's message.
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) this.bus.emit("ai:message", { role: "user", text: event.transcript.trim() });
        break;

      case "response.function_call_arguments.done":
        this.#runTool(event.name, event.arguments, event.call_id);
        break;

      case "response.done": {
        const text = this.#pendingResponseText.trim();
        this.#pendingResponseText = "";
        if (text) this.bus.emit("ai:message", { role: "assistant", text });
        // If tools ran, the follow-up response.create keeps status at streaming.
        if (this.status === "streaming") this.#setStatus("connected");
        break;
      }

      case "error":
        console.error("[ai] server error", event.error);
        this.#system(`Assistant error: ${event.error?.message ?? "unknown"}`);
        this.#setStatus("connected");
        break;

      default:
        break;
    }
  }

  async #runTool(name, rawArgs, callId) {
    let args = {};
    try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { /* leave empty */ }

    let output;
    switch (name) {
      case "fly_to_asset": {
        const asset = this.state.assets.get(args.asset_id)
          ?? [...this.state.assets.values()].find((a) => a.name?.toLowerCase() === String(args.asset_id).toLowerCase());
        if (!asset) {
          output = { ok: false, error: `No tracked asset with id ${args.asset_id}` };
        } else {
          this.state.selectAsset(asset.id);
          this.map.refreshAssetStyle(asset.id);
          await this.map.flyToAsset(asset.latitude, asset.longitude, args.altitude_meters ?? 3000);
          output = { ok: true, asset: SpatialAIAgent.#compactAsset(asset) };
        }
        break;
      }
      case "list_all_assets":
        output = { assets: [...this.state.assets.values()].map(SpatialAIAgent.#compactAsset) };
        break;
      case "set_layer":
        this.state.setLayer(args.layer, Boolean(args.enabled));
        this.bus.emit("ui:syncLayers");
        output = { ok: true, layers: { ...this.state.layers } };
        break;
      default:
        output = { ok: false, error: `Unknown tool ${name}` };
    }

    this.#send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
    });
    this.#send({ type: "response.create" });
    this.#setStatus("streaming");
  }

  /* ---------------------------------------------------------------- */
  /*  Status                                                           */
  /* ---------------------------------------------------------------- */

  #setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.bus.emit("ai:status", status);
  }

  #system(text) {
    this.bus.emit("ai:message", { role: "system", text });
  }
}
