// Unit handling. house.json is authored in METRES. The simulation core (collision, navigation, builders)
// works in internal scene units of feet, so the model is converted exactly once at load time here.
// All user-facing numbers are reported back in metres.

export const M_PER_FT = 0.3048;
export const FT_PER_M = 1 / M_PER_FT;

const UNITLESS = new Set(['rot', 'seats', 'sinks', 'risersPerFlight', 'version', 'art', 'orbit', 'kw', 'hp', 'kg', 'litres', 'emptyKg', 'cushions', 'wp', 'tilt', 'az', 'lat', 'lon', 'structureKgM2', 'specificYield']);
const TEXT_SECTIONS = new Set(['meta', 'assumptions', 'inconsistencies']);

function scale(v, key, k) {
  if (Array.isArray(v)) return v.map((x) => scale(x, key, k));
  if (v && typeof v === 'object') { const o = {}; for (const [kk, x] of Object.entries(v)) o[kk] = scale(x, kk, k); return o; }
  if (typeof v === 'number' && !UNITLESS.has(key)) return v * k;
  return v;
}

/** Returns a deep copy of a metric house model expressed in internal scene units (feet). */
export function toSceneUnits(houseMetres) {
  if (houseMetres.meta?.units !== 'm') throw new Error('house.json must be authored in metres (meta.units = "m")');
  const out = {};
  for (const [k, v] of Object.entries(houseMetres)) out[k] = TEXT_SECTIONS.has(k) ? v : scale(v, k, FT_PER_M);
  out.meta = { ...houseMetres.meta, sceneUnits: 'ft' };
  return out;
}

/** Scene length (ft) -> "4.70 m" */
export function fmtM(ft, digits = 2) { return `${(ft * M_PER_FT).toFixed(digits)} m`; }
/** Scene area (sq ft) -> "20.5 m²" */
export function fmtArea(sqft) { return `${(sqft * M_PER_FT * M_PER_FT).toFixed(1)} m²`; }
export function fmtDims(wFt, dFt) { return `${(wFt * M_PER_FT).toFixed(2)} × ${(dFt * M_PER_FT).toFixed(2)} m`; }
export function toM(ft) { return ft * M_PER_FT; }
