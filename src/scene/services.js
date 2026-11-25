import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { IDU } from '../core/hvac.js';
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
    water: new THREE.MeshBasicMaterial({ color: '#3d8bff', depthTest: false, transparent: true, opacity: 0.95 })
  };
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
  bags.forEach((b, i) => b.flush(perLevel[i]));
  rb.flush(roof);
  const common = new THREE.Group(); common.userData.li = -1; ob.flush(common, { cast: false }); overlay.add(common);
  obs.forEach((b, i) => { const g = new THREE.Group(); g.userData.li = i; b.flush(g, { cast: false }); overlay.add(g); });
  overlay.visible = false; overlay.userData.noAO = true; overlay.traverse((o) => { o.renderOrder = 5; });
  return { perLevel, roof, overlay, cassettesByLevel };
}
