import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { IDU } from '../core/hvac.js';
import { panelGeom } from '../core/solar.js';
import { M_PER_FT } from '../core/units.js';

// Building services: VRV indoor cassettes, outdoor units, refrigerant/water routing overlay, roof tanks, cat ladder.
// Everything is merged per material so it adds only a handful of draw calls.

class Bag {
  constructor() { this.m = new Map(); }
  add(mat, geo) { if (!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat).push(geo.index ? geo.toNonIndexed() : geo); }
  flush(group, { cast = true } = {}) {
    for (const [mat, geos] of this.m) {
      for (const g of geos) for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      for (const g of geos) if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat); mesh.castShadow = cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; group.add(mesh);
    }
  }
}
const B = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
const C = (r, h, x, y, z, seg = 24, rTop = r) => { const g = new THREE.CylinderGeometry(rTop, r, h, seg); g.translate(x, y + h / 2, z); return g; };
/** Straight pipe between two points (cylinder). */
function pipe(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); if (len < 1e-3) return null;
  const g = new THREE.CylinderGeometry(r, r, len, 8, 1, true); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); return g;
}

export function serviceMaterials() {
  return {
    cassette: new THREE.MeshStandardMaterial({ color: '#f3f3f1', roughness: 0.45 }),
    grille: new THREE.MeshStandardMaterial({ color: '#d9dad8', roughness: 0.6 }),
    slot: new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.7 }),
    odu: new THREE.MeshStandardMaterial({ color: '#e3e4e2', roughness: 0.5, metalness: 0.1 }),
    oduDark: new THREE.MeshStandardMaterial({ color: '#2a2c2f', roughness: 0.6, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: '#6f7377', roughness: 0.5, metalness: 0.7 }),
    tank: new THREE.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.55 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#a7a39c', roughness: 0.9 }),
    pvc: new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.5 }),
    // overlay pipes render in X-ray mode so the routing reads through walls and ceilings
    ref1: new THREE.MeshBasicMaterial({ color: '#ff8a3d', depthTest: false, transparent: true, opacity: 0.95 }),
    ref2: new THREE.MeshBasicMaterial({ color: '#21c7b7', depthTest: false, transparent: true, opacity: 0.95 }),
    water: new THREE.MeshBasicMaterial({ color: '#3d8bff', depthTest: false, transparent: true, opacity: 0.95 }),
    dc: new THREE.MeshBasicMaterial({ color: '#f5d90a', depthTest: false, transparent: true, opacity: 0.95 }),
    ac: new THREE.MeshBasicMaterial({ color: '#e23c64', depthTest: false, transparent: true, opacity: 0.95 }),
    pv: new THREE.MeshPhysicalMaterial({ map: pvTexture(), roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 }),
    pvFrame: new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.35, metalness: 0.9 }),
    gi: new THREE.MeshStandardMaterial({ color: '#9ea3a7', roughness: 0.45, metalness: 0.85 }),
    box: new THREE.MeshStandardMaterial({ color: '#e9eaeb', roughness: 0.5 }),
    led: new THREE.MeshBasicMaterial({ color: '#3cff7a' })
  };
}

/** 144 half-cell mono module face: 6 columns x 24 half-cells, silver busbars, white cell gaps. */
function pvTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#d8dde2'; x.fillRect(0, 0, 256, 512);
  const cols = 6, rows = 24, m = 4, gw = (256 - 2 * m) / cols, gh = (512 - 2 * m) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const g = x.createLinearGradient(0, m + j * gh, 0, m + (j + 1) * gh); g.addColorStop(0, '#16233b'); g.addColorStop(1, '#0d1628');
    x.fillStyle = g; x.fillRect(m + i * gw + 1, m + j * gh + 1, gw - 2, gh - 2);
    x.fillStyle = 'rgba(190,200,215,0.55)'; for (let k = 1; k <= 3; k++) x.fillRect(m + i * gw + (k * gw) / 4 - 0.5, m + j * gh + 1, 1, gh - 2);
  }
  x.fillStyle = '#c4cad1'; x.fillRect(0, 254, 256, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function solarArray(bag, S, house) {
  const So = house.solar; const roofY = house.roof.y; const mod = So.module; const tilt = So.tilt * Math.PI / 180;
  const geoms = So.panels.map((p) => panelGeom(p, mod, So.tilt, So.lowEdge, roofY));
  const th = 0.1; // ~30 mm frame in ft
  for (const g of geoms) {
    const cy = (g.low.y + g.high.y) / 2, cz = (g.low.z + g.high.z) / 2;
    const frame = new THREE.BoxGeometry(g.w, th, g.l); frame.rotateX(tilt); frame.translate(g.x, cy - th / 2 * Math.cos(tilt), cz - th / 2 * Math.sin(tilt)); bag.add(S.pvFrame, frame);
    const face = new THREE.PlaneGeometry(g.w - 0.1, g.l - 0.1); face.rotateX(-Math.PI / 2); face.rotateX(tilt); face.translate(g.x, cy + 0.01 * Math.cos(tilt), cz + 0.01 * Math.sin(tilt)); bag.add(S.pv, face);
  }
  // GI structure: posts on RCC blocks at panel-column lines, rafters along the slope, two purlins per row
  const rows = new Map(); for (const g of geoms) { const k = g.low.z.toFixed(2); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(g); }
  for (const rg of rows.values()) {
    const x1 = Math.min(...rg.map((g) => g.x - g.w / 2)), x2 = Math.max(...rg.map((g) => g.x + g.w / 2)); const g0 = rg[0];
    const nb = rg.length; const lines = []; for (let i = 0; i <= nb; i++) lines.push(x1 + 0.25 + ((x2 - x1 - 0.5) * i) / nb);
    const zf = g0.low.z - 0.35 * Math.cos(tilt) * 1, zr = g0.high.z + 0.35 * Math.cos(tilt);
    const yf = g0.low.y + 0.35 * Math.sin(tilt) - 0.12, yr = g0.high.y - 0.35 * Math.sin(tilt) - 0.12;
    for (const x of lines) {
      bag.add(S.concrete, B(1.0, 0.5, 1.0, x, roofY, zf)); bag.add(S.concrete, B(1.0, 0.5, 1.0, x, roofY, zr));
      bag.add(S.gi, B(0.14, yf - roofY - 0.5, 0.14, x, roofY + 0.5, zf)); bag.add(S.gi, B(0.14, yr - roofY - 0.5, 0.14, x, roofY + 0.5, zr));
      const raf = pipeBox(new THREE.Vector3(x, g0.low.y - 0.12, g0.low.z), new THREE.Vector3(x, g0.high.y - 0.12, g0.high.z), 0.16, 0.12); bag.add(S.gi, raf);
      const br = pipeBox(new THREE.Vector3(x, roofY + 0.5, zf), new THREE.Vector3(x, yr - 0.2, zr), 0.1, 0.1); bag.add(S.gi, br);
    }
    for (const f of [0.22, 0.78]) {
      const y = g0.low.y + (g0.high.y - g0.low.y) * f - 0.05, z = g0.low.z + (g0.high.z - g0.low.z) * f;
      bag.add(S.gi, B(x2 - x1, 0.14, 0.12, (x1 + x2) / 2, y - 0.14, z));
    }
  }
}
/** Rectangular-section member between two points. */
function pipeBox(a, b, w, h) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); const g = new THREE.BoxGeometry(w, h, len); g.translate(0, 0, len / 2);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize())); g.translate(a.x, a.y, a.z); return g;
}

function cassette(bag, S, fam, x, y, z) {
  const p = IDU[fam].panel / M_PER_FT; const t = 0.11;
  bag.add(S.cassette, B(p, t, p, x, y - t, z));
  const g = p * (fam === 'compact' ? 0.5 : 0.46);
  bag.add(S.grille, B(g, 0.02, g, x, y - t - 0.02, z));
  for (let i = -3; i <= 3; i++) bag.add(S.slot, B(g * 0.92, 0.012, 0.025, x, y - t - 0.03, z + (i * g) / 8));
  const so = p * 0.39, sl = p * 0.62, sw = p * 0.07;
  bag.add(S.slot, B(sl, 0.02, sw, x, y - t - 0.015, z - so)); bag.add(S.slot, B(sl, 0.02, sw, x, y - t - 0.015, z + so));
  bag.add(S.slot, B(sw, 0.02, sl, x - so, y - t - 0.015, z)); bag.add(S.slot, B(sw, 0.02, sl, x + so, y - t - 0.015, z));
}

function odu(bag, S, o, y0) {
  const { x, z } = o; const w = o.w, d = o.d, h = o.h; const pl = o.plinth;
  // galvanised steel frame on rubber pads
  for (const sx of [-1, 1]) bag.add(S.steel, B(0.25, pl, d + 0.3, x + sx * (w / 2 - 0.3), y0, z));
  bag.add(S.odu, B(w, h - 0.35, d, x, y0 + pl, z));
  bag.add(S.odu, B(w + 0.04, 0.12, d + 0.04, x, y0 + pl + h - 0.35, z));
  // louvred side/front coil guards
  for (let yy = y0 + pl + 0.4; yy < y0 + pl + h - 0.6; yy += 0.22) { bag.add(S.oduDark, B(w * 0.86, 0.06, 0.02, x, yy, z + d / 2 + 0.005)); bag.add(S.oduDark, B(0.02, 0.06, d * 0.8, x - w / 2 - 0.005, yy, z)); bag.add(S.oduDark, B(0.02, 0.06, d * 0.8, x + w / 2 + 0.005, yy, z)); }
  // top fan(s) with guard
  const nf = w > 3.5 ? 2 : 1; const fr = Math.min(d, w / nf) * 0.42;
  for (let i = 0; i < nf; i++) {
    const fx = x + (nf === 1 ? 0 : (i - 0.5) * (w / 2)); const top = y0 + pl + h - 0.23;
    bag.add(S.oduDark, C(fr, 0.25, fx, top, z, 28)); 
    for (let k = 1; k <= 4; k++) { const tg = new THREE.TorusGeometry((fr * k) / 4.2, 0.02, 4, 28); tg.rotateX(Math.PI / 2); tg.translate(fx, top + 0.27, z); bag.add(S.steel, tg); }
    for (let k = 0; k < 4; k++) { const sp = B(fr * 2, 0.03, 0.04, fx, top + 0.25, z); sp.rotateY(0); const g2 = sp.clone(); g2.translate(-fx, 0, -z); g2.rotateY((k * Math.PI) / 4); g2.translate(fx, 0, z); bag.add(S.steel, g2); }
  }
  // service / brand plate (generic)
  bag.add(S.oduDark, B(0.6, 0.25, 0.01, x - w * 0.25, y0 + pl + h * 0.55, z + d / 2 + 0.01));
}

function tank(bag, S, t, y0) {
  const r = t.diameter / 2; const ped = t.pedestal; const H = t.height;
  // RCC pedestal (beam-supported) with steel channel cradle
  bag.add(S.concrete, B(t.diameter + 0.6, ped, t.diameter + 0.6, t.x, y0, t.z));
  bag.add(S.steel, B(t.diameter + 0.2, 0.12, 0.3, t.x, y0 + ped, t.z - r * 0.5)); bag.add(S.steel, B(t.diameter + 0.2, 0.12, 0.3, t.x, y0 + ped, t.z + r * 0.5));
  const yb = y0 + ped + 0.12;
  bag.add(S.tank, C(r, H, t.x, yb, t.z, 40, r * 0.98));
  for (let k = 1; k < 6; k++) { const tg = new THREE.TorusGeometry(r * 1.005, 0.05, 6, 40); tg.rotateX(Math.PI / 2); tg.translate(t.x, yb + (k * H) / 6, t.z); bag.add(S.tank, tg); }
  const dome = new THREE.SphereGeometry(r * 0.98, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.32, 1); dome.translate(t.x, yb + H, t.z); bag.add(S.tank, dome);
  bag.add(S.tank, C(r * 0.32, 0.35, t.x, yb + H + r * 0.28, t.z, 24)); // lid
  bag.add(S.pvc, C(0.12, 0.6, t.x + r * 0.6, yb + H + r * 0.05, t.z, 10)); // vent / inlet
}

function ladder(bag, S, l, y0, y1) {
  const xm = l.x1 + 0.35; const zA = l.z1 + 0.1, zB = l.z2 - 0.1;
  for (const z of [zA, zB]) bag.add(S.steel, B(0.12, y1 - y0 + 3.4, 0.12, xm, y0, z));
  for (let y = y0 + 1; y < y1; y += 1.0) bag.add(S.steel, B(0.06, 0.06, zB - zA, xm, y, (zA + zB) / 2));
  for (let y = y0 + 7.2; y < y1 + 3.3; y += 2.2) { const tg = new THREE.TorusGeometry((zB - zA) / 2 + 0.35, 0.04, 4, 20, Math.PI); tg.rotateZ(Math.PI / 2); tg.rotateY(Math.PI / 2); tg.rotateY(Math.PI); tg.translate(xm + 0.05, y, (zA + zB) / 2); bag.add(S.steel, tg); }
  bag.add(S.steel, B(0.1, 3.3, 0.1, xm - 0.3, y1, zA)); bag.add(S.steel, B(0.1, 3.3, 0.1, xm - 0.3, y1, zB));
}

/**
 * Builds services. Returns { perLevel: Group[], roof: Group, overlay: Group } (overlay hidden by default),
 * plus `cassettesByLevel` for clearing light fixtures under the units.
 */
export function buildServices(house, S) {
  const perLevel = house.levels.map(() => new THREE.Group()); const roof = new THREE.Group(); const overlay = new THREE.Group(); overlay.name = 'services-overlay';
  const H = house.hvac; const Wt = house.water; const TR = house.levels.length - 1;
  if (!H) return { perLevel, roof, overlay, cassettesByLevel: new Map() };
  const LI = Object.fromEntries(house.levels.map((L, i) => [L.id, i]));
  const bags = house.levels.map(() => new Bag()); const obs = house.levels.map(() => new Bag()); const ob = new Bag(); const rb = new Bag();
  const cassettesByLevel = new Map();
  const sysOf = (lvl) => H.outdoorUnits.findIndex((o) => o.serves.includes(lvl));
  const riser = H.riser; const pr = 0.1;
  for (const u of H.indoorUnits) {
    const li = LI[u.level]; const L = house.levels[li]; const ceil = L.y + (L.wallHeight ?? 10);
    cassette(bags[li], S, u.family, u.x, ceil, u.z);
    if (!cassettesByLevel.has(li)) cassettesByLevel.set(li, []); cassettesByLevel.get(li).push(u);
    // refrigerant branch in the ceiling void: unit -> along z -> along x -> riser
    const mat = sysOf(u.level) === 0 ? S.ref1 : S.ref2; const y = ceil - 0.35 - sysOf(u.level) * 0.15;
    const pts = [new THREE.Vector3(u.x, ceil - 0.15, u.z), new THREE.Vector3(u.x, y, u.z), new THREE.Vector3(u.x, y, riser.z + sysOf(u.level) * 0.3), new THREE.Vector3(riser.x + sysOf(u.level) * 0.3, y, riser.z + sysOf(u.level) * 0.3)];
    for (let i = 1; i < pts.length; i++) { const g = pipe(pts[i - 1], pts[i], pr); if (g) obs[li].add(mat, g); }
  }
  // risers (one pair per system) from the lowest served level to the terrace, then to each ODU
  const yT = house.levels[TR].y;
  H.outdoorUnits.forEach((o, k) => {
    const mat = k === 0 ? S.ref1 : S.ref2; const lows = o.serves.map((s) => LI[s]); const y0 = house.levels[Math.min(...lows)].y + 9.4;
    const rx = riser.x + k * 0.3, rz = riser.z + k * 0.3;
    ob.add(mat, pipe(new THREE.Vector3(rx, y0, rz), new THREE.Vector3(rx, yT + 1.0 + k * 0.3, rz), pr * 1.6));
    const pts = [new THREE.Vector3(rx, yT + 1.0 + k * 0.3, rz), new THREE.Vector3(o.x, yT + 1.0 + k * 0.3, rz), new THREE.Vector3(o.x, yT + 1.0 + k * 0.3, o.z), new THREE.Vector3(o.x, yT + o.plinth + 0.6, o.z)];
    for (let i = 1; i < pts.length; i++) { const g = pipe(pts[i - 1], pts[i], pr * 1.6); if (g) ob.add(mat, g); }
    odu(bags[TR], S, o, yT);
  });
  // water: tanks on the roof, inter-connection and downtake through the shaft
  if (Wt) {
    const yR = house.roof.y;
    for (const t of Wt.tanks) tank(rb, S, t, yR);
    const dt = Wt.downtake; const yo = yR + Wt.tanks[0].pedestal + 0.3;
    for (const t of Wt.tanks) { const a = new THREE.Vector3(t.x, yo, t.z); const b = new THREE.Vector3(t.x, yo, dt.z); const c = new THREE.Vector3(dt.x, yo, dt.z); [pipe(a, b, 0.12), pipe(b, c, 0.12)].forEach((g) => g && ob.add(S.water, g)); }
    ob.add(S.water, pipe(new THREE.Vector3(dt.x, yo, dt.z), new THREE.Vector3(dt.x, 0.5, dt.z), 0.14));
    if (Wt.ladder) ladder(bags[TR], S, Wt.ladder, yT, yR);
  }
  if (house.solar) {
    solarArray(rb, S, house);
    const inv = house.solar.inverter; const L = house.levels[TR]; const y0 = L.y + inv.y;
    // inverter + DCDB/ACDB boxes on the solid north face of the stair-cabin wall (facing -z, behind the ODUs)
    const zf = inv.z; const bw = 1.0, bh = 1.3, bd = 0.45;
    bags[TR].add(S.box, B(inv.w, inv.h, inv.d, inv.x, y0, zf - inv.d / 2));
    bags[TR].add(S.oduDark, B(inv.w * 0.6, inv.h * 0.35, 0.02, inv.x, y0 + inv.h * 0.55, zf - inv.d - 0.01));
    bags[TR].add(S.led, B(0.06, 0.06, 0.02, inv.x + inv.w * 0.2, y0 + inv.h * 0.45, zf - inv.d - 0.02));
    for (const sx of [-1, 1]) bags[TR].add(S.box, B(bw, bh, bd, inv.x + sx * (inv.w / 2 + bw / 2 + 0.25), y0 + 0.2, zf - bd / 2));
    bags[TR].add(S.pvc, C(0.08, house.roof.y - (y0 + inv.h), inv.x, y0 + inv.h, zf - 0.12, 8));
    // overlay: DC from array to inverter (yellow), AC from inverter down the shaft to the GF main DB / net meter (magenta)
    const xs = house.solar.panels.map((p) => p.x); const ax = Math.max(...xs) + house.solar.module.w / 2; const yR = house.roof.y + 0.2;
    const zs = [...new Set(house.solar.panels.map((p) => p.z))].sort((a, b) => a - b); const zm = zs[Math.floor(zs.length / 2)];
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const dcPts = [V(ax, yR + 1.2, zm), V(ax, yR, zm), V(ax, yR, 8.8), V(inv.x, yR, 8.8), V(inv.x, yR, inv.z - 0.12), V(inv.x, y0 + inv.h, inv.z - 0.12)];
    for (let i = 1; i < dcPts.length; i++) { const g = pipe(dcPts[i - 1], dcPts[i], 0.13); if (g) ob.add(S.dc, g); }
    const yF = L.y + 0.4; const sx = 28.8, sz = 2.0;
    const acPts = [V(inv.x - 0.9, y0 + 0.2, inv.z - 0.3), V(inv.x - 0.9, yF, inv.z - 0.3), V(30.45, yF, inv.z - 0.3), V(30.45, yF, sz), V(sx, yF, sz), V(sx, 0.6, sz)];
    for (let i = 1; i < acPts.length; i++) { const g = pipe(acPts[i - 1], acPts[i], 0.13); if (g) ob.add(S.ac, g); }
  }
  bags.forEach((b, i) => b.flush(perLevel[i]));
  rb.flush(roof);
  const common = new THREE.Group(); common.userData.li = -1; ob.flush(common, { cast: false }); overlay.add(common);
  obs.forEach((b, i) => { const g = new THREE.Group(); g.userData.li = i; b.flush(g, { cast: false }); overlay.add(g); });
  overlay.visible = false; overlay.userData.noAO = true; overlay.traverse((o) => { o.renderOrder = 5; });
  return { perLevel, roof, overlay, cassettesByLevel };
}
