/**
 * Server-side live asset snapshot.
 * Company fleet is dead-reckoned from UTC along fixed routes (same positions
 * for every client). Air traffic is live OpenSky Network ADS-B when reachable.
 */

const EARTH_RADIUS_M = 6_371_000;
const ORIGIN = { latitude: 51.9486, longitude: 4.1444 };

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

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
    longitude: ((toDeg(λ2) + 540) % 360) - 180,
  };
}

export function bearingBetween(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceBetween(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const P = (bearing, km) => destinationPoint(ORIGIN.latitude, ORIGIN.longitude, bearing, km * 1000);

const RISK_ZONES = [
  { name: "Maasvlakte anchorage congestion", lat: 51.93, lon: 3.98, radiusM: 4000 },
  { name: "Restricted exercise area", lat: 52.02, lon: 3.85, radiusM: 7000 },
  { name: "Dredging corridor", lat: 51.985, lon: 4.05, radiusM: 1500 },
];

const FLEET = [
  {
    id: "IMO9811000",
    name: "MSC Aurora",
    type: "vessel",
    operator: "MSC",
    cruiseSpeed: 7.2,
    altitudeMeters: 0,
    destination: "Maasvlakte II, Rotterdam",
    cargo: "14,200 TEU containers",
    route: [P(250, 42), P(265, 28), P(275, 14), P(285, 4), P(240, 12), P(250, 42)],
  },
  {
    id: "IMO9455312",
    name: "Nordic Tide",
    type: "vessel",
    operator: "Stena Bulk",
    cruiseSpeed: 5.8,
    altitudeMeters: 0,
    destination: "Europoort, Rotterdam",
    cargo: "Crude oil, 96,000 t",
    route: [P(300, 46), P(290, 30), P(280, 16), P(260, 8), P(320, 22), P(300, 46)],
  },
  {
    id: "IMO9702170",
    name: "Delta Pilot 3",
    type: "vessel",
    operator: "Loodswezen",
    cruiseSpeed: 11.5,
    altitudeMeters: 0,
    destination: "Pilot boarding area",
    cargo: "—",
    route: [P(270, 8), P(240, 18), P(300, 20), P(270, 8)],
  },
  {
    id: "GX-TR-4471",
    name: "Truck 4471",
    type: "truck",
    operator: "Geoxis Demo",
    cruiseSpeed: 22,
    altitudeMeters: 0,
    destination: "DC Waalhaven",
    cargo: "2 × 40ft reefer",
    route: [P(95, 6), P(110, 18), P(120, 30), P(100, 38), P(85, 26), P(95, 6)],
  },
  {
    id: "GX-TR-4488",
    name: "Truck 4488",
    type: "truck",
    operator: "Geoxis Demo",
    cruiseSpeed: 20,
    altitudeMeters: 0,
    destination: "Terminal Maasvlakte",
    cargo: "Empty return",
    route: [P(130, 34), P(120, 22), P(105, 12), P(90, 4), P(140, 20), P(130, 34)],
  },
  {
    id: "UAV-INSP-07",
    name: "Inspection drone 07",
    type: "drone",
    operator: "Port Authority",
    cruiseSpeed: 14,
    altitudeMeters: 120,
    destination: "Breakwater survey",
    cargo: "Optical / thermal payload",
    route: [P(200, 3), P(230, 7), P(190, 9), P(160, 6), P(200, 3)],
  },
];

function routeLength(route) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += distanceBetween(route[i].latitude, route[i].longitude, route[i + 1].latitude, route[i + 1].longitude);
  }
  return total;
}

function interpolateRoute(route, distanceM) {
  const loop = routeLength(route);
  if (loop <= 0) return { ...route[0], heading: 0 };
  let remain = ((distanceM % loop) + loop) % loop;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const seg = distanceBetween(a.latitude, a.longitude, b.latitude, b.longitude);
    if (remain <= seg || i === route.length - 2) {
      const t = seg === 0 ? 0 : Math.min(1, remain / seg);
      const heading = bearingBetween(a.latitude, a.longitude, b.latitude, b.longitude);
      return {
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
        heading,
      };
    }
    remain -= seg;
  }
  const last = route[route.length - 1];
  return { latitude: last.latitude, longitude: last.longitude, heading: 0 };
}

function riskZoneAt(lat, lon) {
  for (const z of RISK_ZONES) {
    if (distanceBetween(lat, lon, z.lat, z.lon) <= z.radiusM) return z.name;
  }
  return null;
}

function fleetFrames(nowMs) {
  const tSec = nowMs / 1000;
  return FLEET.map((def) => {
    const pos = interpolateRoute(def.route, def.cruiseSpeed * tSec);
    const zone = riskZoneAt(pos.latitude, pos.longitude);
    const speed = def.cruiseSpeed;
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      operator: def.operator,
      latitude: +pos.latitude.toFixed(6),
      longitude: +pos.longitude.toFixed(6),
      altitudeMeters: def.altitudeMeters,
      heading: +pos.heading.toFixed(1),
      course: +pos.heading.toFixed(1),
      headingChange: 0,
      speedMps: +speed.toFixed(2),
      speedKnots: +(speed * 1.943844).toFixed(1),
      speedKph: +(speed * 3.6).toFixed(1),
      destination: def.destination,
      cargo: def.cargo,
      odometerKm: +((speed * tSec) / 1000).toFixed(2),
      alarm: Boolean(zone),
      alarmReason: zone ? `Inside risk zone: ${zone}` : null,
      source: "geoxis-fleet",
      timestamp: new Date(nowMs).toISOString(),
    };
  });
}

let airCache = { at: 0, assets: [], ok: false };
const AIR_TTL_MS = 10_000;

async function fetchOpenSky(nowMs) {
  if (nowMs - airCache.at < AIR_TTL_MS) return airCache;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const url =
      "https://opensky-network.org/api/states/all?lamin=51.4&lomin=3.5&lamax=52.4&lomax=5.0";
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Geoxis/0.1 (operations globe)",
      },
    });
    if (!res.ok) throw new Error(`opensky ${res.status}`);
    const json = await res.json();
    const states = Array.isArray(json?.states) ? json.states : [];
    const assets = [];
    for (const s of states) {
      const lon = s[5];
      const lat = s[6];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const icao = String(s[0] || "").trim();
      if (!icao) continue;
      const callsign = String(s[1] || "").trim() || icao.toUpperCase();
      const alt = Number.isFinite(s[13]) ? s[13] : Number.isFinite(s[7]) ? s[7] : 0;
      const vel = Number.isFinite(s[9]) ? s[9] : 0;
      const track = Number.isFinite(s[10]) ? s[10] : 0;
      assets.push({
        id: `ICAO-${icao}`,
        name: callsign,
        type: "aircraft",
        operator: s[2] || "ADS-B",
        latitude: +lat.toFixed(6),
        longitude: +lon.toFixed(6),
        altitudeMeters: Math.round(alt || 0),
        heading: +track.toFixed(1),
        course: +track.toFixed(1),
        headingChange: 0,
        speedMps: +vel.toFixed(2),
        speedKnots: +(vel * 1.943844).toFixed(1),
        speedKph: +(vel * 3.6).toFixed(1),
        destination: s[8] ? "On ground" : "In flight",
        cargo: "Live ADS-B (OpenSky)",
        odometerKm: 0,
        alarm: false,
        alarmReason: null,
        source: "opensky",
        timestamp: new Date(nowMs).toISOString(),
      });
      if (assets.length >= 20) break;
    }
    airCache = { at: nowMs, assets, ok: true };
  } catch {
    airCache = { at: nowMs, assets: airCache.assets, ok: false };
  } finally {
    clearTimeout(timer);
  }
  return airCache;
}

export async function snapshot() {
  const sentAt = Date.now();
  const fleet = fleetFrames(sentAt);
  const air = await fetchOpenSky(sentAt);
  return {
    sentAt,
    origin: ORIGIN,
    sources: {
      fleet: "geoxis",
      air: air.ok ? "opensky" : air.assets.length ? "opensky-stale" : "none",
    },
    assets: [...fleet, ...air.assets],
  };
}
