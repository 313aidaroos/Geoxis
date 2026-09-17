import { authHeader } from "./authClient.js";

export class SpatialAIAgent {
  constructor({ bus, state, map }) {
    this.bus = bus;
    this.state = state;
    this.map = map;
    this.status = "offline";
    this.history = [];
  }

  reconfigure() {}

  connect() {
    this.#setStatus("connected");
    return true;
  }

  disconnect() {
    this.#setStatus("offline");
  }

  get isConnected() {
    return this.status === "connected" || this.status === "streaming";
  }

  sendText(text) {
    const clean = String(text || "").trim();
    if (!clean) return false;
    this.connect();
    this.bus.emit("ai:message", { role: "user", text: clean });
    this.history.push({ role: "user", content: clean });
    this.#ask();
    return true;
  }

  async #ask() {
    this.#setStatus("streaming");
    try {
      const res = await fetch("/api/cixy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ messages: this.history.slice(-20) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        this.#assistant("Cixy is not connected yet. ANTHROPIC_API_KEY is missing on the server, so I will not fake an answer.");
        return;
      }
      if (!res.ok) {
        this.#assistant(data.message || data.error || "Cixy could not answer right now.");
        return;
      }
      this.#assistant(data.text || "No answer returned.");
    } catch (err) {
      this.#assistant("Cixy could not reach the server right now.");
    } finally {
      this.#setStatus("connected");
    }
  }

  #assistant(text) {
    this.history.push({ role: "assistant", content: text });
    this.bus.emit("ai:message", { role: "assistant", text });
  }

  startListening() {
    this.#assistant("Voice is not enabled yet. Type your question to Cixy here.");
    return false;
  }

  stopListening() {}

  #setStatus(status) {
    this.status = status;
    this.bus.emit("ai:status", status);
  }
}
