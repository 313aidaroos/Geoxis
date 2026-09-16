/**
 * streamSimulator.js — Real-time telemetry pipeline.
 *
 * Models a production ingestion path: a transport (`MockTransponderSocket`,
 * which mimics the browser WebSocket interface) emits JSON frames on a fixed
 * tick; `AssetDataStreamer` parses, validates, and re-broadcasts them on the
 * app bus. Swapping in a real WebSocket/SSE endpoint means replacing only the
 * transport class — the streamer and everything downstream stay the same.
 *
 * Movement is dead-reckoned each tick from a velocity vector (speed + course)
 * using the spherical destination formula, and the true bearing is recomputed
 * from the last two fixes so heading reflects actual track, not commanded
 * course.
 */

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/* ------------------------------------------------------------------ */
/*  Geodesy                                                            */
/* ------------------------------------------------------------------ */

/** Destination point given start, initial bearing (deg) and distance (m). */
export function destinationPoint(lat, lon, bearingDeg, distanceM) {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);

  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return {
    latitude: toDeg(φ2),
    longitude: ((toDeg(λ2) + 540) % 360) - 180, // normalise to [-180, 180)
  };
}

/** Initial (forward) bearing from A to B in degrees, 0..360. */
export function bearingBetween(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle distance in meters (haversine). */
export function distanceBetween(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Smallest signed difference between two headings, in degrees (-180..180]. */
export function headingDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

/* ------------------------------------------------------------------ */
/*  Simulated entities                                                  */
/* ------------------------------------------------------------------ */

/**
 * A moving target with a waypoint route. Speeds are in m/s. Each entity
 * turns toward its next waypoint at a bounded rate so course changes look
 * physical rather than snapping.
 */
class SimulatedTarget {
  constructor(def) {
    Object.assign(this, def);
    this.waypointIndex = 1;
    this.heading = bearingBetween(this.latitude, this.longitude, ...this.#nextWaypoint());
    this.course = this.heading;
    this.prev = { latitude: this.latitude, longitude: this.longitude };
    this.alarm = false;
    this.alarmReason = null;
    this.odometerM = 0;
  }

  #nextWaypoint() {
    const wp = this.route[this.waypointIndex];
    return [wp.latitude, wp.longitude];
  }

  /**
   * Advance the target by dtSeconds. Returns a telemetry frame.
   * @param {number} dtSeconds
   * @param {(lat:number, lon:number)=>string|null} riskLookup
   */
  step(dtSeconds, riskLookup) {
    const [wLat, wLon] = this.#nextWaypoint();
    const distToWp = distanceBetween(this.latitude, this.longitude, wLat, wLon);

    // Arrive at waypoint → advance (loop the route).
    if (distToWp < this.speed * dtSeconds * 1.5) {
      this.waypointIndex = (this.waypointIndex + 1) % this.route.length;
    }

    // Steer toward the waypoint, limited by turn rate (deg/s).
    const desired = bearingBetween(this.latitude, this.longitude, ...this.#nextWaypoint());
    const delta = headingDelta(this.course, desired);
    const maxTurn = this.turnRate * dtSeconds;
    this.course = (this.course + Math.max(-maxTurn, Math.min(maxTurn, delta)) + 360) % 360;

    // Speed wanders ±3% per tick around cruise speed, clamped.
    const wander = (Math.random() - 0.5) * 0.06 * this.cruiseSpeed;
    this.speed = Math.max(this.cruiseSpeed * 0.7, Math.min(this.cruiseSpeed * 1.25, this.speed + wander));

    // Dead reckoning: displacement = velocity × dt along current course.
    const distanceM = this.speed * dtSeconds;
    this.prev = { latitude: this.latitude, longitude: this.longitude };
    const next = destinationPoint(this.latitude, this.longitude, this.course, distanceM);
    this.latitude = next.latitude;
    this.longitude = next.longitude;
    this.odometerM += distanceM;

    // True heading is derived from the realised track between fixes.
    const trackHeading = bearingBetween(this.prev.latitude, this.prev.longitude, this.latitude, this.longitude);
    this.headingChange = headingDelta(this.heading, trackHeading);
    this.heading = trackHeading;

    // Alarms: over-speed or presence inside a risk zone.
    const zone = riskLookup(this.latitude, this.longitude);
    if (zone) {
      this.alarm = true;
      this.alarmReason = `Inside risk zone: ${zone}`;
    } else if (this.speed > this.cruiseSpeed * 1.2) {
      this.alarm = true;
      this.alarmReason = "Speed above operating envelope";
    } else {
      this.alarm = false;
      this.alarmReason = null;
    }

    return this.toFrame();
  }

  toFrame() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      operator: this.operator,
      latitude: +this.latitude.toFixed(6),
      longitude: +this.longitude.toFixed(6),
      altitudeMeters: this.altitudeMeters,
      heading: +this.heading.toFixed(1),
      course: +this.course.toFixed(1),
      headingChange: +(this.headingChange ?? 0).toFixed(2),
      speedMps: +this.speed.toFixed(2),
      speedKnots: +(this.speed * 1.943844).toFixed(1),
      speedKph: +(this.speed * 3.6).toFixed(1),
      destination: this.destination,
      cargo: this.cargo,
      odometerKm: +(this.odometerM / 1000).toFixed(2),
      alarm: this.alarm,
      alarmReason: this.alarmReason,
      timestamp: new Date().toISOString(),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Fleet definition                                                    */
/* ------------------------------------------------------------------ */

/** Builds a fleet of demo targets within `radiusKm` of the origin. */
function buildFleet(origin, radiusKm, count) {
  const { latitude: oLat, longitude: oLon } = origin;
  // Helper: point at (bearing, distance km) from origin.
  const P = (bearing, km) => destinationPoint(oLat, oLon, bearing, km * 1000);

  const catalog = [
    {
      id: "IMO9811000", name: "MSC Aurora", type: "vessel", operator: "MSC",
      cruiseSpeed: 7.2, turnRate: 0.6, altitudeMeters: 0,
      destination: "Maasvlakte II, Rotterdam", cargo: "14,200 TEU containers",
      route: [P(250, 42), P(265, 28), P(275, 14), P(285, 4), P(240, 12), P(250, 42)],
    },
    {
      id: "IMO9455312", name: "Nordic Tide", type: "vessel", operator: "Stena Bulk",
      cruiseSpeed: 5.8, turnRate: 0.5, altitudeMeters: 0,
      destination: "Europoort, Rotterdam", cargo: "Crude oil, 96,000 t",
      route: [P(300, 46), P(290, 30), P(280, 16), P(260, 8), P(320, 22), P(300, 46)],
    },
    {
      id: "IMO9702170", name: "Delta Pilot 3", type: "vessel", operator: "Loodswezen",
      cruiseSpeed: 11.5, turnRate: 2.5, altitudeMeters: 0,
      destination: "Pilot boarding area", cargo: "—",
      route: [P(270, 8), P(240, 18), P(300, 20), P(270, 8)],
    },
    {
      id: "NL-TR-4471", name: "Truck 4471", type: "truck", operator: "Northwind Logistics",
      cruiseSpeed: 22, turnRate: 6, altitudeMeters: 0,
      destination: "DC Waalhaven", cargo: "2 × 40ft reefer",
      route: [P(95, 6), P(110, 18), P(120, 30), P(100, 38), P(85, 26), P(95, 6)],
    },
    {
      id: "NL-TR-4488", name: "Truck 4488", type: "truck", operator: "Northwind Logistics",
      cruiseSpeed: 20, turnRate: 6, altitudeMeters: 0,
      destination: "Terminal Maasvlakte", cargo: "Empty return",
      route: [P(130, 34), P(120, 22), P(105, 12), P(90, 4), P(140, 20), P(130, 34)],
    },
    {
      id: "UAV-INSP-07", name: "Inspection drone 07", type: "drone", operator: "Port Authority",
      cruiseSpeed: 14, turnRate: 12, altitudeMeters: 120,
      destination: "Breakwater survey", cargo: "Optical / thermal payload",
      route: [P(200, 3), P(230, 7), P(190, 9), P(160, 6), P(200, 3)],
    },
  ];

  // Every route point lies within radiusKm by construction; assert anyway.
  const fleet = catalog.slice(0, Math.max(3, Math.min(count, catalog.length)));
  for (const t of fleet) {
    for (const wp of t.route) {
      const d = distanceBetween(oLat, oLon, wp.latitude, wp.longitude) / 1000;
      if (d > radiusKm) throw new Error(`${t.id} waypoint ${d.toFixed(1)} km exceeds ${radiusKm} km radius`);
    }
  }
  return fleet.map((def) => new SimulatedTarget({ ...def, latitude: def.route[0].latitude, longitude: def.route[0].longitude, speed: def.cruiseSpeed }));
}

/* ------------------------------------------------------------------ */
/*  Mock transport                                                      */
/* ------------------------------------------------------------------ */

/**
 * Implements the subset of the WebSocket interface the streamer relies on
 * (readyState, onopen/onmessage/onclose/onerror, close()). Frames are JSON
 * strings so the parse path is identical to a real socket.
 */
export class MockTransponderSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor({ fleet, intervalMs, riskLookup }) {
    this.readyState = MockTransponderSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;

    this.#fleet = fleet;
    this.#intervalMs = intervalMs;
    this.#riskLookup = riskLookup;
    this.#lastTick = performance.now();

    // Simulate a handshake before OPEN.
    setTimeout(() => {
      this.readyState = MockTransponderSocket.OPEN;
      this.onopen?.({ type: "open" });
      this.#timer = setInterval(() => this.#tick(), this.#intervalMs);
    }, 350);
  }

  #fleet; #intervalMs; #riskLookup; #timer; #lastTick;

  #tick() {
    const now = performance.now();
    const dt = (now - this.#lastTick) / 1000;
    this.#lastTick = now;

    // Emit one message per asset, staggered by a few ms of jitter to mimic
    // independent transponders rather than a batched snapshot.
    for (const target of this.#fleet) {
      const frame = target.step(dt, this.#riskLookup);
      const sentAt = Date.now();
      const jitter = 5 + Math.random() * 40;
      setTimeout(() => {
        if (this.readyState !== MockTransponderSocket.OPEN) return;
        this.onmessage?.({
          data: JSON.stringify({ channel: "telemetry", sentAt, payload: frame }),
        });
      }, jitter);
    }
  }

  close(code = 1000, reason = "client closed") {
    if (this.readyState === MockTransponderSocket.CLOSED) return;
    this.readyState = MockTransponderSocket.CLOSING;
    clearInterval(this.#timer);
    this.readyState = MockTransponderSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: true });
  }
}

/* ------------------------------------------------------------------ */
/*  HTTP poller (real /api/assets feed)                                 */
/* ------------------------------------------------------------------ */

/**
 * Mimics the WebSocket subset AssetDataStreamer uses, but pulls JSON
 * snapshots from a REST endpoint. Each asset in the payload becomes one
 * telemetry frame so the rest of the pipeline stays unchanged.
 */
export class HttpTelemetryPoller {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor({ url, intervalMs }) {
    this.readyState = HttpTelemetryPoller.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.#url = url;
    this.#intervalMs = intervalMs;
    this.#timer = setTimeout(() => this.#open(), 40);
  }

  #url;
  #intervalMs;
  #timer;
  #closed = false;
  #inflight = false;
  #failures = 0;

  async #open() {
    if (this.#closed) return;
    this.readyState = HttpTelemetryPoller.OPEN;
    this.onopen?.({ type: "open" });
    await this.#tick();
    if (!this.#closed) this.#timer = setInterval(() => this.#tick(), this.#intervalMs);
  }

  async #tick() {
    if (this.readyState !== HttpTelemetryPoller.OPEN || this.#inflight) return;
    this.#inflight = true;
    try {
      const res = await fetch(this.#url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const sentAt = typeof json.sentAt === "number" ? json.sentAt : Date.now();
      const assets = Array.isArray(json.assets) ? json.assets : [];
      for (const frame of assets) {
        this.onmessage?.({
          data: JSON.stringify({ channel: "telemetry", sentAt, payload: frame }),
        });
      }
      this.#failures = 0;
    } catch (err) {
      this.#failures += 1;
      if (this.#failures >= 3) this.onerror?.(err);
    } finally {
      this.#inflight = false;
    }
  }

  close(code = 1000, reason = "client closed") {
    if (this.readyState === HttpTelemetryPoller.CLOSED) return;
    this.#closed = true;
    this.readyState = HttpTelemetryPoller.CLOSING;
    clearTimeout(this.#timer);
    clearInterval(this.#timer);
    this.readyState = HttpTelemetryPoller.CLOSED;
    this.onclose?.({ code, reason, wasClean: true });
  }
}

/* ------------------------------------------------------------------ */
/*  Streamer                                                            */
/* ------------------------------------------------------------------ */

export class AssetDataStreamer {
  /**
   * @param {object} opts
   * @param {import("./main.js").EventBus} opts.bus
   * @param {{latitude:number, longitude:number}} opts.origin
   * @param {number} opts.radiusKm
   * @param {number} opts.intervalMs
   * @param {number} opts.targetCount
   * @param {string} [opts.endpoint]  http(s) poll URL or wss:// socket
   */
  constructor({ bus, origin, radiusKm = 50, intervalMs = 2000, targetCount = 6, endpoint = "/api/assets" }) {
    this.bus = bus;
    this.origin = origin;
    this.radiusKm = radiusKm;
    this.intervalMs = intervalMs;
    this.targetCount = targetCount;
    this.endpoint = endpoint;

    this.socket = null;
    this.reconnectAttempts = 0;
    this.#msgCounter = 0;
    this.#rateTimer = null;
    this.#reconnectTimer = null;
    this.#manuallyClosed = false;

    // Mirrors the demo zones in mapController so alarms line up visually.
    this.riskZones = [
      { name: "Maasvlakte anchorage congestion", lat: 51.93, lon: 3.98, radiusM: 4000 },
      { name: "Restricted exercise area", lat: 52.02, lon: 3.85, radiusM: 7000 },
      { name: "Dredging corridor", lat: 51.985, lon: 4.05, radiusM: 1500 },
    ];
  }

  #msgCounter; #rateTimer; #reconnectTimer; #manuallyClosed;

  connect() {
    this.#manuallyClosed = false;
    this.bus.emit("stream:status", { connected: false, text: "Connecting to feed…" });

    const endpoint = this.endpoint;
    if (endpoint && (endpoint.startsWith("ws://") || endpoint.startsWith("wss://"))) {
      this.socket = new WebSocket(endpoint);
    } else if (endpoint) {
      this.socket = new HttpTelemetryPoller({ url: endpoint, intervalMs: this.intervalMs });
    } else {
      const fleet = buildFleet(this.origin, this.radiusKm, this.targetCount);
      this.socket = new MockTransponderSocket({
        fleet,
        intervalMs: this.intervalMs,
        riskLookup: (lat, lon) => this.#riskZoneAt(lat, lon),
      });
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.bus.emit("stream:status", { connected: true, text: "Feed connected" });
      this.#startRateMeter();
    };

    this.socket.onmessage = (evt) => this.#handleMessage(evt);

    this.socket.onerror = (err) => {
      console.error("[stream] transport error", err);
      this.bus.emit("stream:status", { connected: false, text: "Feed error" });
    };

    this.socket.onclose = ({ code, reason }) => {
      this.#stopRateMeter();
      this.bus.emit("stream:status", { connected: false, text: `Feed closed (${code})`, messagesPerSecond: 0 });
      if (!this.#manuallyClosed) this.#scheduleReconnect();
    };
  }

  disconnect() {
    this.#manuallyClosed = true;
    clearTimeout(this.#reconnectTimer);
    this.#stopRateMeter();
    this.socket?.close(1000, "shutdown");
    this.socket = null;
  }

  #handleMessage(evt) {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch (err) {
      console.warn("[stream] dropped malformed frame", err);
      return;
    }
    if (msg?.channel !== "telemetry" || !this.#isValidFrame(msg.payload)) {
      console.warn("[stream] dropped invalid frame", msg);
      return;
    }

    this.#msgCounter += 1;
    if (typeof msg.sentAt === "number") {
      this.bus.emit("stream:latency", Math.max(0, Date.now() - msg.sentAt));
    }
    this.bus.emit("stream:frame", msg.payload);
  }

  #isValidFrame(f) {
    return (
      f && typeof f.id === "string" &&
      Number.isFinite(f.latitude) && Math.abs(f.latitude) <= 90 &&
      Number.isFinite(f.longitude) && Math.abs(f.longitude) <= 180 &&
      Number.isFinite(f.heading)
    );
  }

  #riskZoneAt(lat, lon) {
    for (const z of this.riskZones) {
      if (distanceBetween(lat, lon, z.lat, z.lon) <= z.radiusM) return z.name;
    }
    return null;
  }

  #scheduleReconnect() {
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.bus.emit("stream:status", { connected: false, text: `Reconnecting in ${Math.round(delay / 1000)}s…` });
    this.#reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  #startRateMeter() {
    this.#stopRateMeter();
    this.#rateTimer = setInterval(() => {
      this.bus.emit("stream:status", { messagesPerSecond: this.#msgCounter });
      this.#msgCounter = 0;
    }, 1000);
  }

  #stopRateMeter() {
    clearInterval(this.#rateTimer);
    this.#rateTimer = null;
  }
}
