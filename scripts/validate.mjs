#!/usr/bin/env node
// Architectural + model validation for src/data/house.json. Usage: npm run validate
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as G from '../src/core/geometry.js';
import { toSceneUnits, M_PER_FT } from '../src/core/units.js';
import * as HV from '../src/core/hvac.js';
import * as SO from '../src/core/solar.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// house.json is authored in metres; checks run in the engine's internal units and are reported in metres.
const houseM = JSON.parse(readFileSync(join(root, 'src/data/house.json'), 'utf8'));
const house = toSceneUnits(houseM);
const SQ = M_PER_FT * M_PER_FT;
const sqm = (a) => `${(a * SQ).toFixed(2)} m²`;
const issues = []; // {level: error|warn|info, check, msg}
const add = (level, check, msg) => issues.push({ level, check, msg });
const TOL = 0.05;
const f = (v) => `${(v * M_PER_FT).toFixed(2)} m`;
const mm = (v) => `${Math.round(v * M_PER_FT * 1000)} mm`;
const overlapArea = (a, b) => { const r = G.rectIntersect(a, b); return r ? G.rectArea(r) : 0; };

// ---------------------------------------------------------------- 1. schema / ids
if (houseM.meta.units !== 'm') add('error', 'schema', 'meta.units must be "m" (metres)');
const ids = new Set();
for (const L of house.levels) {
  for (const k of ['rooms', 'walls']) if (!Array.isArray(L[k])) add('error', 'schema', `${L.id}: missing ${k}`);
  for (const r of L.rooms) { if (ids.has(r.id)) add('error', 'schema', `duplicate room id ${r.id}`); ids.add(r.id); }
  for (const w of L.walls) { if (ids.has(w.id)) add('error', 'schema', `duplicate wall id ${w.id}`); ids.add(w.id); if (w.x2 <= w.x1 || w.z2 <= w.z1) add('error', 'schema', `${w.id}: degenerate wall box`); }
  for (const fu of L.furniture || []) if (!L.rooms.some((r) => r.id === fu.room)) add('error', 'schema', `${L.id}: furniture ${fu.type} references unknown room ${fu.room}`);
}

// ---------------------------------------------------------------- 2. openings
for (const L of house.levels) for (const w of L.walls) {
  const axis = G.wallAxis(w); const a1 = axis === 'x' ? w.x1 : w.z1; const a2 = axis === 'x' ? w.x2 : w.z2; const H = G.wallHeight(house, L, w);
  const ops = (w.openings || []).map((o) => G.openingWithDefaults(house, o)).sort((a, b) => a.from - b.from);
  ops.forEach((o, i) => {
    if (o.from < a1 - TOL || o.to > a2 + TOL) add('error', 'openings', `${L.id}/${w.id}: ${o.type} ${f(o.from)}-${f(o.to)} extends beyond wall (${f(a1)}-${f(a2)})`);
    if (o.to - o.from < 1.5 && o.type !== 'vent') add('warn', 'openings', `${L.id}/${w.id}: ${o.type} only ${f(o.to - o.from)} wide`);
    if (o.head > H + TOL) add('warn', 'openings', `${L.id}/${w.id}: ${o.type} head ${f(o.head)} above wall height ${f(H)}`);
    if (['door', 'door2'].includes(o.type) && o.to - o.from < 2.5 - TOL) add('warn', 'openings', `${L.id}/${w.id}: door clear width ${f(o.to - o.from)} < 0.76 m`);
    if (i > 0 && o.from < ops[i - 1].to - TOL) add('error', 'openings', `${L.id}/${w.id}: overlapping openings`);
  });
}

// ---------------------------------------------------------------- 3. room overlaps / rooms vs walls / rooms on slab
for (const L of house.levels) {
  const rs = L.rooms;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    let a = 0; for (const p of rs[i].rects) for (const q of rs[j].rects) a += overlapArea(p, q);
    if (a > TOL) add('error', 'rooms', `${L.id}: rooms ${rs[i].id} and ${rs[j].id} overlap by ${sqm(a)}`);
  }
  for (const r of rs) for (const w of L.walls) {
    if (w.mat === 'glass' || r.type === 'stair') continue;
    let a = 0; for (const p of r.rects) a += overlapArea(p, [w.x1, w.z1, w.x2, w.z2]);
    if (a > 0.3) add('warn', 'rooms', `${L.id}: room ${r.id} overlaps wall ${w.id} by ${sqm(a)}`);
  }
  if (!L.slab.ground) {
    const slab = G.decomposeRects(L.slab.rects, L.slab.holes);
    for (const r of rs) {
      if (r.floor === 'none') continue;
      const area = G.roomArea(r); let cov = 0; for (const p of r.rects) for (const s of slab) cov += overlapArea(p, s);
      if (cov < area - 0.1) add('error', 'slab', `${L.id}: room ${r.id} floor is not fully supported by the slab (${sqm(cov)} of ${sqm(area)})`);
    }
  }
}

// ---------------------------------------------------------------- 4. furniture placement
const colliders = G.buildColliders(house); const surfaces = G.buildSurfaces(house);
house.levels.forEach((L, li) => {
  const wallCols = colliders.filter((c) => c.li === li && c.src === 'wall');
  const furn = (L.furniture || []).map((fu) => ({ fu, b: G.furnitureBox(L, fu), boxes: G.furnitureBoxes(L, fu), spec: G.FURNITURE_SPECS[fu.type] || {} }));
  for (const { fu, b, spec } of furn) {
    const room = L.rooms.find((r) => r.id === fu.room); if (!room) continue;
    const full = [fu.x - fu.w / 2, fu.z - fu.d / 2, fu.x + fu.w / 2, fu.z + fu.d / 2];
    let inside = 0; for (const r of room.rects) inside += overlapArea(full, r);
    if (inside < G.rectArea(full) - 0.1 && fu.type !== 'wall_panel') add('warn', 'furniture', `${L.id}: ${fu.type} at (${fu.x}, ${fu.z}) extends outside ${room.name}`);
    if (spec.overhead || fu.type === 'rug' || fu.type === 'wall_panel') continue;
    for (const c of wallCols) {
      if (c.y1 > b.y2 || c.y2 < b.y1) continue;
      const a = overlapArea(full, [c.x1, c.z1, c.x2, c.z2]);
      if (a > 0.05) { add('error', 'furniture', `${L.id}: ${fu.type} at (${fu.x}, ${fu.z}) intersects wall ${c.wall}`); break; }
    }
  }
  for (let i = 0; i < furn.length; i++) for (let j = i + 1; j < furn.length; j++) {
    const A = furn[i], B = furn[j];
    if ([A, B].some((o) => o.spec.collide === false || o.spec.overhead)) continue;
    let a = 0; for (const p of A.boxes) for (const q of B.boxes) a += overlapArea([p.x1, p.z1, p.x2, p.z2], [q.x1, q.z1, q.x2, q.z2]);
    if (a > 0.05) add('warn', 'furniture', `${L.id}: ${A.fu.type} and ${B.fu.type} overlap (${sqm(a)})`);
  }
});

// ---------------------------------------------------------------- 5. plan label vs model
const labelRows = [];
house.levels.forEach((L) => L.rooms.forEach((r) => {
  if (!r.planLabel) return; const bb = G.roomBBox(r); const w = bb[2] - bb[0], d = bb[3] - bb[1];
  const near = (v) => v == null || Math.abs(v - w) <= 0.25 || Math.abs(v - d) <= 0.25;
  const ok = near(r.planLabel.w) && near(r.planLabel.d);
  labelRows.push({ level: L.id, room: r.name, label: r.planLabel.text, model: `${f(w)} x ${f(d)}`, ok });
  if (!ok) add('warn', 'labels', `${L.id}: ${r.name} modelled ${f(w)} x ${f(d)} vs plan label ${r.planLabel.text}`);
}));

// ---------------------------------------------------------------- 6. circulation / reachability
const nav = G.buildNav(house, colliders, surfaces);
const start = { li: 0, x: 17, z: 47.5 };
const reach = [];
house.levels.forEach((L, li) => L.rooms.forEach((r) => {
  if (r.accessible === false || ['void', 'shaft', 'stair'].includes(r.type)) return;
  const t = G.roomTarget(nav, li, r);
  const route = t ? G.planRoute(nav, start, { li, x: t[0], z: t[1] }) : null;
  reach.push({ level: L.id, room: r.name, ok: !!route, dist: route ? G.pathLength(route) : null });
  if (!route) add('error', 'circulation', `${L.id}: ${r.name} is not reachable from the main entrance (blocked doorway or missing opening)`);
}));

// ---------------------------------------------------------------- 7. stairs
{
  const st = house.stairs; const n = st.risersPerFlight; const R = 10.5 / 2 / n; const T = (st.runX2 - st.runX1) / n;
  const rIn = R * 12, tIn = T * 12; const blondel = 2 * rIn + tIn;
  const width = st.flight1Z[1] - st.flight1Z[0];
  add(rIn > 7.5 ? 'error' : 'info', 'stairs', `Riser ${mm(R)} (${2 * n} per floor), going ${mm(T)}, flight width ${f(width)}, 2R+G = ${Math.round(blondel * 25.4)} mm (comfort range 600-640 mm)`);
  if (tIn < 10) {
    // comfortable alternative: risers <= 7", goings 10", landing as wide as the flight
    const rPerFlight = Math.ceil((10.5 * 12) / 2 / 7); const run = (rPerFlight - 1) * (10 / 12); const need = run + width;
    add('warn', 'stairs', `Going ${mm(T)} is below the 250 mm minimum recommended by NBC 2016 for residential stairs. A compliant dog-leg (${rPerFlight} risers of ${mm(10.5 / 2 / rPerFlight)} per flight, 254 mm goings, ${f(width)} landing) needs a core ~${f(need)} long vs ${f(st.landingX2 - st.runX1)} available.`);
  }
  if (width < 3.0) add('warn', 'stairs', `Flight width ${f(width)} below 0.90 m`);
  // headroom: lowest overhead element above each flight
  const fl = G.stairGeometry(house);
  let minHead = Infinity;
  for (const s of fl) for (const flight of [s.flight1, s.flight2]) {
    for (let x = flight.x1 + 0.1; x < flight.x2; x += 0.25) {
      const zc = (flight.z1 + flight.z2) / 2; const yStep = G.surfaceHeight({ kind: 'ramp', ...flight }, x);
      let over = Infinity;
      for (const o of fl) for (const f2 of [o.flight1, o.flight2, o.landing]) {
        if (x < f2.x1 || x > f2.x2 || zc < f2.z1 || zc > f2.z2) continue;
        const y = (f2.kind === undefined && f2.y !== undefined) ? f2.y : G.surfaceHeight({ kind: 'ramp', ...f2 }, x);
        const underside = y - 0.9; if (underside > yStep + 0.5 && underside < over) over = underside;
      }
      for (const L of house.levels) if (!L.slab.ground) for (const r of G.decomposeRects(L.slab.rects, L.slab.holes)) {
        if (x >= r[0] && x <= r[2] && zc >= r[1] && zc <= r[3]) { const u = L.y - 0.5; if (u > yStep + 0.5 && u < over) over = u; }
      }
      minHead = Math.min(minHead, over - yStep);
    }
  }
  add(minHead < 6.9 ? 'warn' : 'info', 'stairs', `Minimum headroom over the flights ${f(minHead)} (NBC minimum 2.20 m)`);
}

// ---------------------------------------------------------------- 8. plumbing stack alignment
const WET = new Set(['bathroom', 'toilet', 'kitchen', 'utility', 'shaft']);
for (let li = 1; li < house.levels.length; li++) {
  const up = house.levels[li], dn = house.levels[li - 1];
  for (const r of up.rooms.filter((x) => WET.has(x.type) && x.type !== 'shaft')) {
    let a = 0; const area = G.roomArea(r);
    for (const p of r.rects) for (const q of dn.rooms.filter((x) => WET.has(x.type))) for (const qq of q.rects) a += overlapArea(p, qq);
    const ratio = a / area;
    if (ratio < 0.5) add('warn', 'plumbing', `${up.id}: ${r.name} sits ${Math.round((1 - ratio) * 100)}% over dry rooms of ${dn.id} - needs sunken slab / offset drainage`);
  }
  const shafts = up.rooms.filter((x) => x.type === 'shaft'); const shDn = dn.rooms.filter((x) => x.type === 'shaft');
  for (const s of shafts) {
    let a = 0; for (const p of s.rects) for (const q of shDn) for (const qq of q.rects) a += overlapArea(p, qq);
    if (a < G.roomArea(s) * 0.9) add('warn', 'plumbing', `${up.id}: shaft ${s.id} is only ${Math.round((a / G.roomArea(s)) * 100)}% aligned with the shaft below`);
  }
}

// ---------------------------------------------------------------- 9. structural continuity (walls without a wall below)
for (let li = 1; li < house.levels.length; li++) {
  const L = house.levels[li], D = house.levels[li - 1];
  for (const w of L.walls) {
    if (w.mat === 'glass' || w.mat === 'parapet' || (w.x2 - w.x1) < 0.5 && (w.z2 - w.z1) < 0.5) continue;
    const thick = Math.min(w.x2 - w.x1, w.z2 - w.z1); if (thick < 0.5) continue;
    const box = [w.x1 - 0.1, w.z1 - 0.1, w.x2 + 0.1, w.z2 + 0.1]; const len = Math.max(w.x2 - w.x1, w.z2 - w.z1);
    let supported = 0;
    for (const d of D.walls) if (d.mat !== 'glass' && d.mat !== 'compound') { const r = G.rectIntersect(box, [d.x1, d.z1, d.x2, d.z2]); if (r) supported += Math.max(r[2] - r[0], r[3] - r[1]); }
    const ratio = Math.min(1, supported / len);
    if (ratio < 0.5) add('info', 'structure', `${L.id}/${w.id} (${f(len)} long) has only ${Math.round(ratio * 100)}% wall support below - requires beam/transfer (RCC frame assumed)`);
  }
}

// ---------------------------------------------------------------- 10. daylight & ventilation
const daylight = [];
house.levels.forEach((L) => L.rooms.forEach((r) => {
  if (r.outdoor || ['void', 'shaft', 'stair', 'corridor'].includes(r.type)) return;
  let glaze = 0; let vent = 0;
  for (const w of L.walls) {
    const axis = G.wallAxis(w);
    for (const o0 of w.openings || []) {
      const o = G.openingWithDefaults(house, o0);
      if (!['window', 'glazing', 'slide', 'vent'].includes(o.type)) continue;
      const touches = r.rects.some((q) => {
        if (axis === 'x') return (Math.abs(w.z1 - q[3]) < 0.1 || Math.abs(w.z2 - q[1]) < 0.1) && o.to > q[0] && o.from < q[2];
        return (Math.abs(w.x1 - q[2]) < 0.1 || Math.abs(w.x2 - q[0]) < 0.1) && o.to > q[1] && o.from < q[3];
      });
      if (!touches) continue;
      const a = (o.to - o.from) * (Math.min(o.head, G.wallHeight(house, L, w)) - o.sill);
      if (o.type === 'vent') vent += a; else glaze += a;
    }
  }
  const area = G.roomArea(r); const ratio = (glaze + vent) / area;
  daylight.push({ level: L.id, room: r.name, area, glaze, vent, ratio });
  const habitable = ['living', 'dining', 'bedroom', 'office', 'kitchen', 'gym'].includes(r.type);
  if (habitable && glaze / area < 0.1) add('warn', 'daylight', `${L.id}: ${r.name} glazing ${sqm(glaze)} = ${(100 * glaze / area).toFixed(0)}% of floor area (< 10% NBC guideline${r.type === 'dining' || r.type === 'kitchen' ? '; borrows light from adjoining open spaces' : ''})`);
  if (['bathroom', 'toilet'].includes(r.type) && glaze + vent === 0) add('warn', 'daylight', `${L.id}: ${r.name} has no window/ventilator on an external wall - needs mechanical exhaust`);
}));

// ---------------------------------------------------------------- 11. air-conditioning (VRV) and roof water tanks
const hv = HV.hvacSummary(house); const hvacRows = []; const sysRows = [];
if (hv) {
  for (const r of hv.rooms) {
    const L = house.levels[r.li]; const room = r.room; const holes = L.slab.holes || [];
    if (!r.units.length) add('error', 'hvac', `${L.id}: ${room.name} is a conditioned space with no indoor unit`);
    if (r.installedKW + 1e-6 < r.designKW) add('error', 'hvac', `${L.id}: ${room.name} installed ${r.installedKW.toFixed(1)} kW < design load ${r.designKW.toFixed(1)} kW`);
    if (r.installedKW > r.designKW * 1.6 && r.installedKW - r.designKW > 1.5) add('warn', 'hvac', `${L.id}: ${room.name} oversized (${r.installedKW.toFixed(1)} kW for ${r.designKW.toFixed(1)} kW)`);
    for (const u of r.units) {
      const fam = HV.IDU[u.family]; const half = fam.panel / 2 / M_PER_FT;
      if (!room.rects.some((q) => G.pointInRect(q, u.x, u.z))) add('error', 'hvac', `${u.id} is not inside ${room.name}`);
      if (holes.some((h) => G.pointInRect(h, u.x, u.z, half))) add('error', 'hvac', `${u.id} (${room.name}) is over the stair/atrium void - no ceiling to mount it`);
      const wc = HV.wallClearance(room, u.x, u.z) * M_PER_FT;
      if (wc < fam.panel / 2 + 0.35) add('warn', 'hvac', `${u.id} (${room.name}) panel edge only ${(wc - fam.panel / 2).toFixed(2)} m from a wall - use a blank-off (3-way) kit`);
      if (!fam.sizes.includes(u.kw)) add('error', 'hvac', `${u.id}: ${u.kw} kW is not a catalogue size for ${u.family}`);
      for (const f of L.furniture.filter((ff) => ff.room === room.id && ['pendant', 'chandelier', 'ceiling_fan'].includes(ff.type))) {
        if (Math.hypot(f.x - u.x, f.z - u.z) * M_PER_FT < fam.panel / 2 + 0.3) add('warn', 'hvac', `${u.id} clashes with the ${f.type} in ${room.name}`);
      }
    }
    // throw coverage of the occupied floor (atrium void excluded)
    const pts = HV.roomSamples(room, 1).filter((p) => !holes.some((h) => G.pointInRect(h, p[0], p[1])));
    const unc = pts.filter((p) => !r.units.some((u) => Math.hypot(p[0] - u.x, p[1] - u.z) * M_PER_FT <= HV.IDU[u.family].throw)).length;
    if (r.units.length && unc) add('warn', 'hvac', `${L.id}: ${room.name} ${Math.round((unc / pts.length) * 100)}% of the floor is outside the cassette throw radius`);
    hvacRows.push({ level: L.id, room: room.name, area: r.areaM2, glz: r.glazingM2, roof: r.roofExposure, load: r.loadW / 1000, design: r.designKW, units: r.units.map((u) => `${u.id} ${u.kw} kW ${u.family === 'compact' ? 'compact' : 'round-flow'}`).join(', '), inst: r.installedKW });
  }
  for (const s of hv.systems) {
    if (s.cr < HV.CONNECTION_RATIO[0] || s.cr > HV.CONNECTION_RATIO[1]) add('error', 'hvac', `${s.id}: connection ratio ${(s.cr * 100).toFixed(0)}% outside ${HV.CONNECTION_RATIO.map((x) => x * 100).join('-')}%`);
    if (s.kw < s.blockKW) add('error', 'hvac', `${s.id}: ${s.kw} kW below diversified block load ${s.blockKW.toFixed(1)} kW`);
    add('info', 'hvac', `${s.id} (${s.serves.join('+')}): ${s.hp} HP / ${s.kw} kW, ${s.iduCount} indoor units = ${s.idukw.toFixed(1)} kW, connection ratio ${(s.cr * 100).toFixed(0)}%, peak ${s.peakKW.toFixed(1)} kW, block ${s.blockKW.toFixed(1)} kW (diversity ${HV.DIVERSITY})`);
    sysRows.push(s);
    // placement on the open terrace, service clearances
    const TR = house.levels[house.levels.length - 1]; const half = [s.w / 2, s.d / 2];
    const fp = [s.x - half[0], s.z - half[1], s.x + half[0], s.z + half[1]];
    const corners = [[fp[0], fp[1]], [fp[2], fp[1]], [fp[0], fp[3]], [fp[2], fp[3]]];
    if (!corners.every(([x, z]) => { const r = G.roomAt(TR, x, z); return r && r.outdoor; })) add('error', 'hvac', `${s.id} footprint is not fully on the open terrace`);
    for (const w of TR.walls) { const i = G.rectIntersect(fp, [w.x1, w.z1, w.x2, w.z2]); if (i) add('error', 'hvac', `${s.id} intersects ${w.id}`); }
    const front = [fp[0], fp[3], fp[2], fp[3] + 0.5 / M_PER_FT];
    if (TR.walls.some((w) => G.rectIntersect(front, [w.x1, w.z1, w.x2, w.z2]))) add('warn', 'hvac', `${s.id}: less than 500 mm front service clearance`);
  }
  // refrigerant riser must pass through every floor's shaft
  const rs = house.hvac.riser;
  house.levels.forEach((L) => { const inShaft = L.rooms.some((r) => r.type === 'shaft' && r.rects.some((q) => G.pointInRect(q, rs.x, rs.z))); if (!inShaft) add('error', 'hvac', `refrigerant riser is not inside a shaft on ${L.id}`); });
}
const tankRows = [];
if (house.water) {
  const roofRects = house.roof.rects;
  for (const t of house.water.tanks) {
    const r = t.diameter / 2; const fp = [t.x - r, t.z - r, t.x + r, t.z + r];
    const covered = [[fp[0], t.z], [fp[2], t.z], [t.x, fp[1]], [t.x, fp[3]]].every(([x, z]) => roofRects.some((q) => G.pointInRect(q, x, z)));
    if (!covered) add('error', 'water', `${t.id} is not fully on the terrace-room / stair-cabin roof`);
    const ld = HV.tankLoad(t);
    add('info', 'water', `${t.id}: ${t.litres} L, ${ld.kg} kg full, ${ld.kN.toFixed(1)} kN on ${ld.footprintM2.toFixed(2)} m² = ${ld.kNm2.toFixed(1)} kN/m² - place on beams / RCC pedestal (typical roof live load 1.5 kN/m²)`);
    tankRows.push({ ...t, ...ld });
  }
  for (let i = 0; i < house.water.tanks.length; i++) for (let j = i + 1; j < house.water.tanks.length; j++) {
    const a = house.water.tanks[i], b = house.water.tanks[j]; const gap = (Math.hypot(a.x - b.x, a.z - b.z) - (a.diameter + b.diameter) / 2) * M_PER_FT;
    if (gap < 0.3) add('warn', 'water', `${a.id} and ${b.id} are only ${gap.toFixed(2)} m apart (min 0.3 m for maintenance)`);
  }
  const total = house.water.tanks.reduce((a, t) => a + t.litres, 0);
  add('info', 'water', `Roof storage ${total} L in ${house.water.tanks.length} tanks; roof access by steel cat ladder from the open terrace`);
}

// ---------------------------------------------------------------- 12. rooftop solar PV
const solarRows = []; let solarSum = null;
if (house.solar) {
  const S = house.solar; const roof = house.roof.rects; const clr = (0.3 / M_PER_FT) * 0.98; solarSum = SO.solarSummary(house);
  const inRoof = (x, z) => roof.some((q) => G.pointInRect(q, x, z));
  const fps = S.panels.map((p) => { const g = SO.panelGeom(p, S.module, S.tilt, S.lowEdge, house.roof.y); return { id: p.id, r: [p.x - g.w / 2, p.z - g.dz / 2, p.x + g.w / 2, p.z + g.dz / 2], g }; });
  for (const f of fps) {
    const [x1, z1, x2, z2] = f.r;
    if (![[x1 - clr, z1 - clr], [x2 + clr, z1 - clr], [x1 - clr, z2 + clr], [x2 + clr, z2 + clr]].every(([x, z]) => inRoof(x, z))) add('error', 'solar', `${f.id} is not on the roof with >= 0.30 m edge clearance`);
    for (const t of house.water?.tanks || []) {
      const r = t.diameter / 2 + 0.6 / M_PER_FT; const cx = Math.max(x1, Math.min(t.x, x2)), cz = Math.max(z1, Math.min(t.z, z2));
      if (Math.hypot(t.x - cx, t.z - cz) < r) add('error', 'solar', `${f.id} is within 0.6 m of tank ${t.id} (maintenance access)`);
    }
    const lad = house.water?.ladder; if (lad && G.rectIntersect(f.r, [lad.x1 - 3, lad.z1 - 3, lad.x2 + 3, lad.z2 + 3])) add('error', 'solar', `${f.id} blocks the roof-ladder landing`);
    if (f.g.low.y - house.roof.y < 0.45 / M_PER_FT) add('warn', 'solar', `${f.id} low edge < 450 mm above the roof (cleaning / waterproofing access)`);
  }
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) if (G.rectIntersect(fps[i].r, fps[j].r)) add('error', 'solar', `${fps[i].id} overlaps ${fps[j].id}`);
  const sh = solarSum.shading;
  if (sh.worst.frac > 0) add('warn', 'solar', `Array shading reaches ${Math.round(sh.worst.frac * 100)}% at ${sh.worst.label} (target: shade-free 09:00-15:00 all year)`);
  const dcac = solarSum.kwp / S.inverter.kw; if (dcac < 0.9 || dcac > 1.3) add('warn', 'solar', `DC/AC ratio ${dcac.toFixed(2)} outside 0.9-1.3`);
  const loadKNm2 = (solarSum.kg * 9.81) / 1000 / solarSum.areaM2;
  add('info', 'solar', `${solarSum.count} x ${S.module.wp} Wp = ${solarSum.kwp.toFixed(2)} kWp at ${S.tilt} deg tilt facing south; inverter ${S.inverter.kw} kW (DC/AC ${dcac.toFixed(2)}); shading loss ${(sh.loss * 100).toFixed(1)}%; est. ${Math.round(solarSum.annualKWh).toLocaleString('en-IN')} kWh/yr (~${Math.round(solarSum.annualKWh / 365)} kWh/day); dead load ~${loadKNm2.toFixed(2)} kN/m² over the array`);
  for (const [label, doy] of Object.entries(SO.DAYS)) {
    const row = { day: label, cells: [] };
    for (const h of [9, 10, 11, 12, 13, 14, 15]) {
      const one = SO.shadingAnalysis(S.panels, S.module, S.tilt, S.lowEdge, house.roof.y, SO.tankObstacles(house), { hours: [h], days: { [label]: doy } });
      const d = SO.sunDir(doy, h); row.cells.push(d.elev < 8 ? '-' : `${Math.round(d.elev)} deg / ${Math.round(one.loss * 100)}%`);
    }
    solarRows.push(row);
  }
}

// ---------------------------------------------------------------- report
const counts = { error: 0, warn: 0, info: 0 }; issues.forEach((i) => counts[i.level]++);
const lines = [];
lines.push('# Validation report — Tandon Residence 3D model', '');
lines.push(`Generated by \`npm run validate\` on ${new Date().toISOString().slice(0, 10)}. Errors: **${counts.error}**, warnings: **${counts.warn}**, info: **${counts.info}**.`, '');
lines.push('## Automated findings', '');
for (const lvl of ['error', 'warn', 'info']) {
  const list = issues.filter((i) => i.level === lvl); if (!list.length) continue;
  lines.push(`### ${lvl === 'error' ? 'Errors' : lvl === 'warn' ? 'Warnings' : 'Information'}`, '');
  for (const i of list) lines.push(`- **[${i.check}]** ${i.msg}`);
  lines.push('');
}
lines.push('## Inconsistencies identified in the source drawings', '');
for (const i of house.inconsistencies) lines.push(`- **${i.id} (${i.severity})** ${i.text}`);
lines.push('', '## Plan labels vs. model', '', '| Level | Room | Plan label | Modelled clear size | Match |', '|---|---|---|---|---|');
for (const r of labelRows) lines.push(`| ${r.level} | ${r.room} | ${r.label} | ${r.model} | ${r.ok ? 'yes' : '**no**'} |`);
lines.push('', '## Circulation (route length from main gate)', '', '| Level | Room | Reachable | Walking distance |', '|---|---|---|---|');
for (const r of reach) lines.push(`| ${r.level} | ${r.room} | ${r.ok ? 'yes' : '**NO**'} | ${r.dist ? (r.dist * M_PER_FT).toFixed(1) + ' m' : '-'} |`);
lines.push('', '## Natural light (opening area vs. floor area)', '', '| Level | Room | Floor m² | Glazing m² | Vent m² | Ratio |', '|---|---|---|---|---|---|');
for (const d of daylight) lines.push(`| ${d.level} | ${d.room} | ${(d.area * SQ).toFixed(1)} | ${(d.glaze * SQ).toFixed(1)} | ${(d.vent * SQ).toFixed(1)} | ${(d.ratio * 100).toFixed(0)}% |`);
if (hvacRows.length) {
  lines.push('', '## Air-conditioning (VRV) sizing', '', `Design: ${house.hvac.designOutdoor}, indoor ${house.hvac.indoorDesign}. Load = floor area x type density + glazing x ${HV.GLAZING_W_M2} W/m² + exposed roof x ${HV.ROOF_W_M2} W/m² (+ atrium); design = load x ${HV.SAFETY}.`, '', '| Level | Room | Area m² | Glazing m² | Roof exp. | Load kW | Design kW | Indoor units | Installed kW |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of hvacRows) lines.push(`| ${r.level} | ${r.room} | ${r.area.toFixed(1)} | ${r.glz.toFixed(1)} | ${Math.round(r.roof * 100)}% | ${r.load.toFixed(2)} | ${r.design.toFixed(2)} | ${r.units} | ${r.inst.toFixed(1)} |`);
  lines.push('', '| Outdoor unit | Serves | Capacity | Indoor units | Connection ratio | Peak / block load |', '|---|---|---|---|---|---|');
  for (const s of sysRows) lines.push(`| ${s.id} | ${s.serves.join(' + ')} | ${s.hp} HP / ${s.kw} kW | ${s.iduCount} = ${s.idukw.toFixed(1)} kW | ${(s.cr * 100).toFixed(0)}% | ${s.peakKW.toFixed(1)} / ${s.blockKW.toFixed(1)} kW |`);
}
if (tankRows.length) {
  lines.push('', '## Overhead water tanks', '', '| Tank | Capacity | Size (dia x h) | Full weight | Bearing on pedestal |', '|---|---|---|---|---|');
  for (const t of tankRows) lines.push(`| ${t.id} | ${t.litres} L | ${(t.diameter * M_PER_FT).toFixed(2)} x ${(t.height * M_PER_FT).toFixed(2)} m | ${t.kg} kg | ${t.kNm2.toFixed(1)} kN/m² |`);
}
if (solarSum) {
  const S = house.solar;
  lines.push('', '## Rooftop solar PV', '', `${solarSum.count} x ${S.module.wp} Wp ${S.module.tech} = **${solarSum.kwp.toFixed(2)} kWp**, tilt ${S.tilt} deg, facing south (assumed, A5), low edge ${(S.lowEdge * M_PER_FT).toFixed(2)} m above the roof. Inverter ${S.inverter.kw} kW. Estimated yield **${Math.round(solarSum.annualKWh).toLocaleString('en-IN')} kWh/yr** (indicative: ${SO.SPECIFIC_YIELD} kWh/kWp/yr x tilt factor x (1 - shading loss ${(solarSum.shading.loss * 100).toFixed(1)}%)).`, '', 'Sun elevation / share of array shaded (solar time):', '', '| Day | 09:00 | 10:00 | 11:00 | 12:00 | 13:00 | 14:00 | 15:00 |', '|---|---|---|---|---|---|---|---|');
  for (const r of solarRows) lines.push(`| ${r.day} | ${r.cells.join(' | ')} |`);
}
writeFileSync(join(root, 'VALIDATION_REPORT.md'), lines.join('\n') + '\n');

for (const i of issues) console.log(`${i.level.toUpperCase().padEnd(5)} [${i.check}] ${i.msg}`);
console.log(`\n${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} info. Reachable rooms: ${reach.filter((r) => r.ok).length}/${reach.length}. Report: VALIDATION_REPORT.md`);
process.exit(counts.error ? 1 : 0);
