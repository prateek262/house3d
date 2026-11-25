// Air-conditioning (VRV/VRF) + roof water-tank engineering helpers. Pure JS, shared by the app and the validator.
// Works on the scene-unit model (feet); reports metric/kW. All figures are indicative design estimates, not a
// substitute for an HVAC consultant's heat-load calculation (see assumptions A25-A29 in house.json).
import { pointInRect, roomArea, roomAt, openingWithDefaults, wallAxis, wallHeight, rectArea, rectIntersect } from './geometry.js';
import { M_PER_FT } from './units.js';

const SQM = M_PER_FT * M_PER_FT;

/** Conditioned space types. Toilets, utility, stores, stair, shafts and open-air spaces are ventilated, not cooled. */
export const CONDITIONED = new Set(['living', 'dining', 'kitchen', 'bedroom', 'office', 'gym', 'dressing', 'corridor']);

/** Internal + envelope load density (W per m² floor) for the Bilaspur summer design day (~44 °C DB). */
export const LOAD_DENSITY = { bedroom: 215, living: 245, dining: 245, kitchen: 340, office: 245, gym: 310, dressing: 160, corridor: 150 };
export const GLAZING_W_M2 = 230;     // solar + conduction per m² of glazing, internal curtains/blinds
export const ROOF_W_M2 = 80;         // extra per m² of floor where the ceiling is an exposed roof
export const ATRIUM_W_M2 = 60;       // per m² of atrium plan area per extra storey of volume
export const SAFETY = 1.1;
export const DIVERSITY = 0.75;       // residential block-load diversity on the outdoor units

/** Indoor unit catalogue (nominal cooling kW). 'compact' = 600×600 four-way cassette, 'roundflow' = 840×840 body / 950 panel. */
export const IDU = {
  compact: { label: '4-way compact cassette (600×600)', panel: 0.62, throw: 2.6, sizes: [1.7, 2.2, 2.8, 3.6, 4.5, 5.6] },
  roundflow: { label: 'Round-flow cassette (950×950 panel)', panel: 0.95, throw: 3.6, sizes: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 9.0, 11.2, 14.0] }
};
/** Top-discharge VRV/VRF outdoor modules (indicative class sizes & casing dimensions, m). */
export const ODU = [
  { hp: 8, kw: 22.4, w: 0.93, d: 0.765, h: 1.657, kg: 190 }, { hp: 10, kw: 28.0, w: 0.93, d: 0.765, h: 1.657, kg: 200 },
  { hp: 12, kw: 33.5, w: 0.93, d: 0.765, h: 1.657, kg: 210 }, { hp: 14, kw: 40.0, w: 1.24, d: 0.765, h: 1.657, kg: 280 },
  { hp: 16, kw: 45.0, w: 1.24, d: 0.765, h: 1.657, kg: 300 }, { hp: 18, kw: 50.0, w: 1.24, d: 0.765, h: 1.657, kg: 310 },
  { hp: 20, kw: 56.0, w: 1.24, d: 0.765, h: 1.657, kg: 320 }
];
export const CONNECTION_RATIO = [0.5, 1.3];

function glazingArea(house, L, room) {
  let a = 0;
  for (const w of L.walls) {
    if (w.mat) continue; const axis = wallAxis(w);
    for (const o0 of w.openings || []) {
      const o = openingWithDefaults(house, o0); if (!['window', 'glazing', 'slide'].includes(o.type)) continue;
      const touches = room.rects.some((q) => axis === 'x'
        ? (Math.abs(w.z1 - q[3]) < 0.1 || Math.abs(w.z2 - q[1]) < 0.1) && o.to > q[0] && o.from < q[2]
        : (Math.abs(w.x1 - q[2]) < 0.1 || Math.abs(w.x2 - q[0]) < 0.1) && o.to > q[1] && o.from < q[3]);
      if (touches) a += (o.to - o.from) * (Math.min(o.head, wallHeight(house, L, w)) - o.sill);
    }
  }
  return a;
}

/** Fraction of the room's ceiling that is an exposed roof (nothing conditioned/enclosed above). */
function roofExposure(house, li, room) {
  const up = house.levels[li + 1]; let n = 0, e = 0;
  for (const r of room.rects) for (let x = r[0] + 0.5; x < r[2]; x += 1) for (let z = r[1] + 0.5; z < r[3]; z += 1) {
    n++; if (!up) { e++; continue; }
    const above = roomAt(up, x, z); if (!above || above.outdoor) e++;
  }
  return n ? e / n : 0;
}

/** Cooling load per conditioned room (W) with a transparent breakdown. */
export function roomLoads(house) {
  const out = [];
  house.levels.forEach((L, li) => {
    for (const r of L.rooms) {
      if (!CONDITIONED.has(r.type) || r.outdoor) continue;
      const A = roomArea(r) * SQM; const G = glazingArea(house, L, r) * SQM; const roof = roofExposure(house, li, r);
      const parts = { internal: A * LOAD_DENSITY[r.type], glazing: G * GLAZING_W_M2, roof: A * roof * ROOF_W_M2, atrium: 0 };
      out.push({ li, level: L.id, room: r, areaM2: A, glazingM2: G, roofExposure: roof, parts });
    }
  });
  // atrium (multi-storey void) volume + its glazing is carried by the occupied room(s) beneath it
  house.levels.forEach((L, li) => {
    for (const v of L.rooms.filter((r) => r.type === 'void')) {
      const vA = roomArea(v) * SQM; const vG = glazingArea(house, L, v) * SQM;
      const below = out.filter((o) => o.li === 0).map((o) => ({ o, ov: v.rects.reduce((a, p) => a + o.room.rects.reduce((b, q) => { const i = rectIntersect(p, q); return b + (i ? rectArea(i) : 0); }, 0), 0) })).filter((x) => x.ov > 0);
      const tot = below.reduce((a, b) => a + b.ov, 0);
      for (const { o, ov } of below) o.parts.atrium += (vA * ATRIUM_W_M2 + vG * GLAZING_W_M2 * 0.6) * (ov / tot);
    }
  });
  for (const o of out) { o.loadW = Object.values(o.parts).reduce((a, b) => a + b, 0); o.designKW = (o.loadW * SAFETY) / 1000; }
  return out;
}

/** Recommended indoor units for a load (kW) and floor area (m²): count + family + nominal size. */
export function recommendUnits(designKW, areaM2) {
  let n = Math.max(1, Math.ceil(designKW / 14.0), Math.ceil(areaM2 / 30));
  for (;;) {
    const per = designKW / n; const fam = per <= 4.5 && areaM2 / n < 22 ? 'compact' : 'roundflow';
    const size = IDU[fam].sizes.find((s) => s >= per - 1e-6);
    if (size) return { n, family: fam, kw: size };
    n++;
  }
}

/** Smallest ODU whose capacity covers the diversified block load and keeps the connection ratio within limits. */
export function selectODU(idukw, blockKW) {
  for (const o of ODU) { const cr = idukw / o.kw; if (o.kw >= blockKW && cr <= CONNECTION_RATIO[1] && cr >= CONNECTION_RATIO[0]) return { ...o, cr }; }
  return null;
}

/** Full system summary from house.hvac (indoor units as authored in the JSON). */
export function hvacSummary(house) {
  const loads = roomLoads(house); const H = house.hvac; if (!H) return null;
  const byRoom = new Map(); for (const u of H.indoorUnits) { if (!byRoom.has(u.room)) byRoom.set(u.room, []); byRoom.get(u.room).push(u); }
  const rooms = loads.map((l) => { const units = byRoom.get(l.room.id) || []; return { ...l, units, installedKW: units.reduce((a, u) => a + u.kw, 0) }; });
  const systems = H.outdoorUnits.map((o) => {
    const rs = rooms.filter((r) => o.serves.includes(r.level));
    const idukw = rs.reduce((a, r) => a + r.installedKW, 0); const peakKW = rs.reduce((a, r) => a + r.designKW, 0);
    return { ...o, rooms: rs, idukw, peakKW, blockKW: peakKW * DIVERSITY, cr: idukw / o.kw, iduCount: rs.reduce((a, r) => a + r.units.length, 0) };
  });
  return { rooms, systems, totalIDU: rooms.reduce((a, r) => a + r.installedKW, 0), totalODU: systems.reduce((a, s) => a + s.kw, 0) };
}

/** Points inside a room (1 ft grid) used for throw-coverage checks. */
export function roomSamples(room, step = 1) {
  const pts = []; for (const r of room.rects) for (let x = r[0] + step / 2; x < r[2]; x += step) for (let z = r[1] + step / 2; z < r[3]; z += step) pts.push([x, z]);
  return pts;
}
export function wallClearance(room, x, z) {
  // distance from the point to the room boundary (union of rects; inner seams between rects are not walls)
  let best = Infinity;
  for (const r of room.rects) {
    if (!pointInRect(r, x, z)) continue;
    const edges = [[x - r[0], [r[0] - 0.05, z]], [r[2] - x, [r[2] + 0.05, z]], [z - r[1], [x, r[1] - 0.05]], [r[3] - z, [x, r[3] + 0.05]]];
    for (const [d, p] of edges) if (!room.rects.some((q) => pointInRect(q, p[0], p[1]))) best = Math.min(best, d);
  }
  return best;
}

/** Tank: water + empty weight (kg) and footprint pressure on the slab (kN/m²) over its pedestal. t.diameter in scene units. */
export function tankLoad(t) {
  const kg = t.litres + (t.emptyKg || 45); const r = (t.diameter * M_PER_FT) / 2; const fp = Math.PI * r * r;
  return { kg, kN: (kg * 9.81) / 1000, kNm2: (kg * 9.81) / 1000 / fp, footprintM2: fp };
}
