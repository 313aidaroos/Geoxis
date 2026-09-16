import { snapshot } from "../lib/fleetEngine.js";

const s = await snapshot();
const types = [...new Set(s.assets.map((a) => a.type))];
const sample = s.assets.slice(0, 3).map((a) => ({
  id: a.id,
  name: a.name,
  lat: a.latitude,
  lon: a.longitude,
  src: a.source,
}));
console.log(JSON.stringify({ count: s.assets.length, sources: s.sources, types, sample }, null, 2));
if (s.assets.length < 6) {
  console.error("expected at least 6 fleet assets");
  process.exit(1);
}
