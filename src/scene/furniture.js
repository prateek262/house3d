import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lSofaDepth } from '../core/geometry.js';

// Procedural furniture & decor. Local frame: front faces +z, back at -z, y up from the floor, internal units ft.
// UVs are box-projected in real units so fabric / wood textures keep a physical scale on every piece.

let SEG = 24; let LEAF_DENSITY = 1;
export function configureFurniture({ lowPoly }) { SEG = lowPoly ? 14 : 24; LEAF_DENSITY = lowPoly ? 0.6 : 1; }

const geoCache = new Map();
function projUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
function cached(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
const q = (v) => Math.round(v * 1000) / 1000;
function boxG(w, h, d, r = 0) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return cached(`b${q(w)}:${q(h)}:${q(d)}:${q(r)}`, () => projUV(r > 0.005 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)));
}
export const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
const leafGeo = new THREE.IcosahedronGeometry(0.5, 0);
const sphGeoD = [0, 1, 2].map((d) => new THREE.IcosahedronGeometry(0.5, d));

function addMesh(g, geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; }
function box(g, mat, w, h, d, x, y, z, ry = 0) { const m = addMesh(g, boxG(w, h, d), mat); m.position.set(x, y + h / 2, z); m.rotation.y = ry; return m; }
function rbox(g, mat, w, h, d, x, y, z, r = 0.08, ry = 0) { const m = addMesh(g, boxG(w, h, d, r), mat); m.position.set(x, y + h / 2, z); m.rotation.y = ry; return m; }
function cyl(g, mat, r, h, x, y, z, rTop, seg = SEG) {
  const rt = rTop ?? r;
  const geo = cached(`c${q(r)}:${q(rt)}:${q(h)}:${seg}`, () => projUV(new THREE.CylinderGeometry(rt, r, h, seg)));
  const m = addMesh(g, geo, mat); m.position.set(x, y + h / 2, z); return m;
}
function openCyl(g, mat, r, rTop, h, x, y, z) {
  const geo = cached(`oc${q(r)}:${q(rTop)}:${q(h)}`, () => projUV(new THREE.CylinderGeometry(rTop, r, h, SEG, 1, true)));
  const m = addMesh(g, geo, mat); m.position.set(x, y + h / 2, z); return m;
}
function sph(g, mat, r, x, y, z, sy = 1, detail = 2) { const m = addMesh(g, sphGeoD[detail], mat); m.scale.set(r * 2, r * 2 * sy, r * 2); m.position.set(x, y, z); return m; }
function torus(g, mat, R, r, x, y, z, rx = Math.PI / 2, arc = Math.PI * 2) {
  const geo = cached(`t${q(R)}:${q(r)}:${q(arc)}`, () => projUV(new THREE.TorusGeometry(R, r, 8, 32, arc)));
  const m = addMesh(g, geo, mat); m.position.set(x, y, z); m.rotation.x = rx; return m;
}
function flat(m) { m.castShadow = false; return m; }
/** Additive light-wash plane (LED strips, uplights). Faces +z in local space. */
function glowPlane(g, mat, w, h, x, y, z, ry = 0, rx = 0) {
  const geo = cached(`gp${q(w)}:${q(h)}`, () => new THREE.PlaneGeometry(w, h));
  const m = addMesh(g, geo, mat, false); m.receiveShadow = false; m.position.set(x, y + h / 2, z); m.rotation.set(rx, ry, 0); m.renderOrder = 3; return m;
}

// ------------------------------------------------------------------------------------------------ decor
function books(g, M, x, y, z, n, rnd, ry = 0) {
  let yy = y;
  for (let i = 0; i < n; i++) { const w = 0.75 + rnd() * 0.25, d = 0.55 + rnd() * 0.15, t = 0.08 + rnd() * 0.05; box(g, M.books[Math.floor(rnd() * M.books.length)], w, t, d, x + (rnd() - 0.5) * 0.06, yy, z, ry + (rnd() - 0.5) * 0.2); yy += t; }
  return yy;
}
function vase(g, M, x, y, z, s = 1, stems = true, rnd = Math.random) {
  cyl(g, M.decor, 0.16 * s, 0.75 * s, x, y, z, 0.1 * s);
  sph(g, M.decor, 0.2 * s, x, y + 0.22 * s, z, 0.9, 1);
  if (stems) for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2; const st = cyl(g, M.trunk, 0.012, 1.4 * s, x, y + 0.6 * s, z, 0.01, 5);
    st.rotation.set(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
    const lx = x + Math.sin(a) * 0.35 * s, lz = z - Math.cos(a) * 0.35 * s;
    sph(g, i % 2 ? M.leaf2 : M.leaf, 0.09 * s, lx, y + (1.9 + rnd() * 0.2) * s, lz, 1.4, 0);
  }
}
function bowl(g, M, x, y, z, s = 1, fruit = false) {
  const m = sph(g, M.decor, 0.42 * s, x, y + 0.02, z, 0.42, 2);
  if (fruit) for (let i = 0; i < 5; i++) { const a = i * 1.3; sph(g, i % 2 ? M.leaf2 : M.throw, 0.13 * s, x + Math.cos(a) * 0.16 * s, y + 0.2 * s, z + Math.sin(a) * 0.16 * s, 1, 1); }
  return m;
}
function candle(g, M, x, y, z) { cyl(g, M.ceramic, 0.08, 0.35, x, y, z); }
function sculpture(g, M, x, y, z) { cyl(g, M.metal, 0.12, 0.08, x, y, z); torus(g, M.metal, 0.22, 0.04, x, y + 0.32, z, 0); }
function tableLamp(g, M, x, y, z, s = 1) {
  cyl(g, M.decor, 0.22 * s, 0.75 * s, x, y, z, 0.14 * s);
  cyl(g, M.metal, 0.025, 0.25 * s, x, y + 0.75 * s, z);
  openCyl(g, M.shade, 0.5 * s, 0.38 * s, 0.6 * s, x, y + 0.95 * s, z);
}

/** Leaf cloud: `count` flattened ellipsoids around a centre (shared geometry, merged later). */
function foliage(g, M, cx, cy, cz, rad, hgt, count, rnd, leafSize = 0.38) {
  const mats = [M.leaf, M.leaf2, M.leaf3]; const n = Math.max(6, Math.round(count * LEAF_DENSITY));
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * rad, h = rnd() * hgt;
    const m = addMesh(g, leafGeo, mats[i % 3]);
    const s = leafSize * (0.7 + rnd() * 0.6); m.scale.set(s * 1.5, s * 0.14, s * 0.7);
    m.position.set(cx + Math.cos(a) * r, cy + h, cz + Math.sin(a) * r);
    m.rotation.set((rnd() - 0.5) * 1.4, a + (rnd() - 0.5), (rnd() - 0.5) * 1.2);
  }
}

function chair(g, M, x, z, ry) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
  for (const [lx, lz] of [[-0.58, -0.55], [0.58, -0.55], [-0.58, 0.58], [0.58, 0.58]]) cyl(c, M.furn_wood, 0.05, 1.3, lx, 0, lz, 0.04, 8);
  rbox(c, M.fabric2, 1.55, 0.24, 1.5, 0, 1.28, 0.02, 0.09);
  const back = rbox(c, M.fabric2, 1.5, 1.3, 0.2, 0, 1.55, -0.68, 0.09); back.rotation.x = -0.1;
  return c;
}
function officeChair(g, M, x, z, ry) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
  for (let i = 0; i < 5; i++) { const m = box(c, M.metal, 0.08, 0.08, 1.05, 0, 0.15, 0, (i / 5) * Math.PI * 2); m.position.x = Math.sin((i / 5) * Math.PI * 2) * 0.5; m.position.z = Math.cos((i / 5) * Math.PI * 2) * 0.5; }
  cyl(c, M.metal, 0.07, 1.3, 0, 0.2, 0);
  rbox(c, M.fabric2, 1.6, 0.3, 1.55, 0, 1.45, 0, 0.12);
  const b = rbox(c, M.fabric2, 1.5, 1.8, 0.22, 0, 1.85, -0.72, 0.1); b.rotation.x = -0.12;
}

function tvPanel(g, M, tw, th, x, y, zBack) {
  box(g, M.screen, tw + 0.06, th + 0.06, 0.09, x, y - 0.03, zBack + 0.045);
  const geo = cached(`tv${q(tw)}:${q(th)}`, () => new THREE.PlaneGeometry(tw, th));
  const m = addMesh(g, geo, M.tv, false); m.position.set(x, y + th / 2, zBack + 0.092);
  glowPlane(g, M.glowIn, tw + 1.2, th * 0.5, x, y + th - 0.1, zBack + 0.005);
}

// ------------------------------------------------------------------------------------------------ builders
const B = {
  sofa(g, M, W, D, f, rnd) {
    const legH = 0.4, armW = Math.min(0.62, W * 0.14), backT = 0.62;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.metal, 0.05, legH, sx * (W / 2 - 0.3), 0, sz * (D / 2 - 0.3), 0.04, 10);
    rbox(g, M.fabric, W, 0.65, D, 0, legH, 0, 0.1);
    rbox(g, M.fabric, W, 2.25, backT, 0, legH, -D / 2 + backT / 2, 0.14);
    for (const sx of [-1, 1]) rbox(g, M.fabric, armW, 1.65, D, sx * (W / 2 - armW / 2), legH, 0, 0.14);
    const n = Math.max(2, Math.round((W - 2 * armW) / 2.5)); const cw = (W - 2 * armW) / n;
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + armW + cw * (i + 0.5);
      rbox(g, M.fabric, cw - 0.05, 0.42, D - backT - 0.04, cx, 1.05, backT / 2, 0.15);
      const b = rbox(g, M.fabric, cw - 0.07, 1.3, 0.5, cx, 1.44, -D / 2 + backT + 0.2, 0.2); b.rotation.x = -0.14;
    }
    const p1 = rbox(g, M.fabric2, 1.35, 1.3, 0.34, -W / 2 + armW + 0.8, 1.45, -D / 2 + backT + 0.6, 0.16); p1.rotation.set(-0.2, 0.25, 0.06);
    const p2 = rbox(g, M.throw, 1.2, 1.15, 0.32, W / 2 - armW - 0.75, 1.45, -D / 2 + backT + 0.6, 0.15); p2.rotation.set(-0.2, -0.3, -0.05);
    rbox(g, M.throw, armW + 0.12, 0.06, 1.7, W / 2 - armW / 2, 2.04, 0.2, 0.03);
    void rnd;
  },
  sofa_l(g, M, W, D, f) {
    const dep = lSofaDepth(f, D); const z0 = -D / 2; const rl = D - dep; const legH = 0.4; const backT = 0.62; const armW = 0.6;
    for (const [lx, lz] of [[-W / 2 + 0.3, z0 + 0.3], [W / 2 - 0.3, z0 + 0.3], [W / 2 - 0.3, z0 + dep - 0.3], [-W / 2 + 0.3, D / 2 - 0.3], [-W / 2 + dep - 0.3, D / 2 - 0.3]]) cyl(g, M.metal, 0.05, legH, lx, 0, lz, 0.04, 10);
    rbox(g, M.fabric, W, 0.65, dep, 0, legH, z0 + dep / 2, 0.1);
    rbox(g, M.fabric, dep, 0.65, rl, -W / 2 + dep / 2, legH, z0 + dep + rl / 2, 0.1);
    rbox(g, M.fabric, W, 2.25, backT, 0, legH, z0 + backT / 2, 0.14);
    rbox(g, M.fabric, backT, 2.25, D - backT, -W / 2 + backT / 2, legH, z0 + backT + (D - backT) / 2, 0.14);
    rbox(g, M.fabric, armW, 1.65, dep, W / 2 - armW / 2, legH, z0 + dep / 2, 0.14);
    rbox(g, M.fabric, dep, 1.65, armW, -W / 2 + dep / 2, legH, D / 2 - armW / 2, 0.14);
    const runA = W - backT - armW; const nA = Math.max(2, Math.round(runA / 2.4)); const cwA = runA / nA;
    for (let i = 0; i < nA; i++) {
      const cx = -W / 2 + backT + cwA * (i + 0.5);
      rbox(g, M.fabric, cwA - 0.05, 0.42, dep - backT - 0.04, cx, 1.05, z0 + backT + (dep - backT) / 2, 0.15);
      const b = rbox(g, M.fabric, cwA - 0.07, 1.3, 0.5, cx, 1.44, z0 + backT + 0.2, 0.2); b.rotation.x = -0.14;
    }
    const runB = rl - armW; const nB = Math.max(1, Math.round(runB / 2.4)); const cwB = runB / nB;
    for (let i = 0; i < nB; i++) {
      const cz = z0 + dep + cwB * (i + 0.5);
      rbox(g, M.fabric, dep - backT - 0.04, 0.42, cwB - 0.05, -W / 2 + backT + (dep - backT) / 2, 1.05, cz, 0.15);
      const b = rbox(g, M.fabric, 0.5, 1.3, cwB - 0.07, -W / 2 + backT + 0.2, 1.44, cz, 0.2); b.rotation.z = 0.14;
    }
    const p1 = rbox(g, M.fabric2, 1.35, 1.3, 0.34, -W / 2 + backT + 0.8, 1.45, z0 + backT + 0.55, 0.16); p1.rotation.set(-0.2, 0.75, 0.05);
    const p2 = rbox(g, M.throw, 1.2, 1.15, 0.32, W / 2 - armW - 0.8, 1.45, z0 + backT + 0.55, 0.15); p2.rotation.set(-0.2, -0.25, -0.04);
    const p3 = rbox(g, M.fabric2, 1.2, 1.15, 0.32, -W / 2 + backT + 0.55, 1.45, D / 2 - armW - 0.8, 0.15); p3.rotation.set(0, Math.PI / 2 + 0.2, 0.2);
  },
  armchair(g, M, W, D) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.furn_wood, 0.06, 0.45, sx * (W / 2 - 0.25), 0, sz * (D / 2 - 0.25), 0.045, 10);
    rbox(g, M.fabric2, W, 0.65, D, 0, 0.45, 0, 0.14);
    const back = rbox(g, M.fabric2, W, 1.85, 0.5, 0, 0.45, -D / 2 + 0.25, 0.2); back.rotation.x = -0.08;
    for (const sx of [-1, 1]) rbox(g, M.fabric2, 0.45, 1.25, D - 0.1, sx * (W / 2 - 0.225), 0.45, 0.05, 0.18);
    rbox(g, M.fabric2, W - 0.9, 0.36, D - 0.6, 0, 1.1, 0.22, 0.14);
    const p = rbox(g, M.fabric, 1.1, 1.0, 0.3, 0, 1.45, -D / 2 + 0.6, 0.14); p.rotation.x = -0.25;
  },
  coffee_table(g, M, W, D, f, rnd) {
    rbox(g, M.counter, W, 0.14, D, 0, 1.22, 0, 0.05);
    rbox(g, M.furn_wood, W - 0.7, 1.22, D - 0.7, 0, 0, 0, 0.04);
    const top = books(g, M, -W * 0.22, 1.36, D * 0.08, 2, rnd, 0.3);
    candle(g, M, -W * 0.22, top, D * 0.08);
    vase(g, M, W * 0.25, 1.36, -D * 0.12, 0.6, true, rnd);
    bowl(g, M, W * 0.05, 1.36, D * 0.22, 0.7);
  },
  side_table(g, M, W) {
    const r = W / 2 - 0.05;
    cyl(g, M.metal, r * 0.55, 0.06, 0, 0, 0); cyl(g, M.metal, 0.08, 1.6, 0, 0.06, 0);
    cyl(g, M.counter, r, 0.1, 0, 1.66, 0);
    vase(g, M, 0.15, 1.76, 0.1, 0.5, true);
  },
  tv_unit(g, M, W, D, f, rnd) {
    rbox(g, M.furn_wood, W, 1.15, D, 0, 0.35, 0, 0.03);
    box(g, M.screen, W - 0.4, 0.35, D - 0.3, 0, 0, -0.1);
    for (let i = 1; i < 3; i++) box(g, M.frame, 0.02, 0.95, 0.01, -W / 2 + (W / 3) * i, 0.45, D / 2 + 0.002);
    const tw = Math.min(W * 0.82, 5.4), th = tw * 0.5625;
    tvPanel(g, M, tw, th, 0, 4.4 - th / 2, -D / 2 + 0.02);
    rbox(g, M.screen, Math.min(tw * 0.55, 3), 0.2, 0.32, 0, 1.5, -D / 2 + 0.3, 0.06);
    vase(g, M, W / 2 - 0.6, 1.5, 0, 0.8, true, rnd);
    books(g, M, -W / 2 + 0.7, 1.5, 0.05, 3, rnd);
  },
  wall_panel(g, M, W, D) { box(g, M.accent_panel, W, 9.4, D, 0, 0.3, 0); box(g, M.lamp, W - 0.3, 0.04, 0.06, 0, 9.0, D / 2 + 0.02); },
  dining_table(g, M, W, D, f, rnd) {
    const seats = f.seats || 6; const per = Math.ceil(seats / 2);
    const long = W >= D; const tl = long ? W - 1.0 : W - 2.6; const td = long ? D - 2.6 : D - 1.0;
    rbox(g, M.counter, tl, 0.14, td, 0, 2.32, 0, 0.05);
    for (const sx of [-1, 1]) { rbox(g, M.metal, 0.25, 2.32, td * 0.62, sx * (tl / 2 - 0.9), 0, 0, 0.04); rbox(g, M.metal, 0.6, 0.08, td * 0.7, sx * (tl / 2 - 0.9), 0, 0, 0.03); }
    for (let i = 0; i < per; i++) { const a = -tl / 2 + (tl / per) * (i + 0.5); chair(g, M, a, td / 2 + 0.55, Math.PI); chair(g, M, a, -td / 2 - 0.55, 0); }
    flat(rbox(g, M.throw, tl * 0.55, 0.02, td * 0.38, 0, 2.46, 0, 0.01));
    vase(g, M, 0, 2.48, 0, 0.9, true, rnd); candle(g, M, -0.9, 2.48, 0.1); candle(g, M, 0.9, 2.48, -0.1);
  },
  bed(g, M, W, D, f, rnd) {
    box(g, M.screen, W - 0.5, 0.3, D - 0.6, 0, 0, 0.05);
    rbox(g, M.fabric, W, 0.8, D - 0.3, 0, 0.3, 0.15, 0.1);
    rbox(g, M.linen, W - 0.25, 0.62, D - 0.6, 0, 1.1, 0.25, 0.16);
    rbox(g, M.linen, W - 0.12, 0.2, D * 0.64, 0, 1.6, D / 2 - D * 0.32 - 0.08, 0.09);
    rbox(g, M.throw, W + 0.04, 0.09, 1.35, 0, 1.76, D / 2 - 0.85, 0.04);
    const pw = (W - 0.8) / 2;
    for (const sx of [-1, 1]) {
      const p = rbox(g, M.linen, pw, 0.5, 1.25, sx * (pw / 2 + 0.2), 1.72, -D / 2 + 1.05, 0.2); p.rotation.x = -0.3;
      const e = rbox(g, M.fabric2, pw * 0.72, 1.15, 0.36, sx * (pw / 2 + 0.15), 1.75, -D / 2 + 1.5, 0.16); e.rotation.set(-0.3, sx * -0.12, 0);
    }
    const n = Math.max(4, Math.round(W / 0.75)); const cw = W / n;
    for (let i = 0; i < n; i++) rbox(g, M.fabric, cw - 0.04, 3.8, 0.38, -W / 2 + cw * (i + 0.5), 0.3, -D / 2 + 0.19, 0.12);
    void rnd;
  },
  round_bed(g, M, W, D, f, rnd) {
    // round upholstered platform with channel segments, round mattress, rectangular channel/tufted headboard
    const hbT = 0.5; const r = Math.min(W, D - hbT) / 2 - 0.02; const cz = -D / 2 + hbT + r;
    cyl(g, M.screen, r - 0.35, 0.18, 0, 0, cz);
    const N = Math.max(18, Math.round((2 * Math.PI * r) / 1.15));
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2; const segW = (2 * Math.PI * (r - 0.22)) / N - 0.035;
      const m = rbox(g, M.fabric, segW, 1.15, 0.46, Math.sin(a) * (r - 0.23), 0.15, cz + Math.cos(a) * (r - 0.23), 0.1, a);
      void m;
    }
    cyl(g, M.fabric, r - 0.4, 1.2, 0, 0.12, cz);
    cyl(g, M.linen, r - 0.5, 0.62, 0, 1.3, cz);
    torus(g, M.linen, r - 0.52, 0.12, 0, 1.9, cz);
    cyl(g, M.linen, r - 0.48, 0.12, 0, 1.92, cz + 0.05);
    const thr = rbox(g, M.fabric2, 2 * r - 1.3, 0.07, 1.4, 0, 2.02, cz + r * 0.35, 0.03); thr.rotation.y = -0.18;
    // headboard: tall panel, channel-tufted upper, square tufted lower
    rbox(g, M.fabric, W, 4.5, hbT, 0, 0, -D / 2 + hbT / 2, 0.08);
    const nC = Math.max(6, Math.round(W / 0.62)); const cw = (W - 0.3) / nC;
    for (let i = 0; i < nC; i++) {
      const x = -W / 2 + 0.15 + cw * (i + 0.5);
      rbox(g, M.fabric, cw - 0.04, 1.35, 0.14, x, 3.0, -D / 2 + hbT + 0.06, 0.06);
      rbox(g, M.fabric, cw - 0.04, 0.6, 0.14, x, 2.32, -D / 2 + hbT + 0.06, 0.06);
    }
    // pillows: white sleeping pillows, accent cushions, small bolster
    const zp = cz - r + 0.95;
    for (const sx of [-1, 1]) {
      const p = rbox(g, M.linen, 2.1, 0.55, 1.05, sx * 1.15, 2.0, zp, 0.22); p.rotation.x = -0.35;
      const a1 = rbox(g, M.fabric2, 1.55, 1.15, 0.36, sx * 1.45, 2.05, zp + 0.55, 0.16); a1.rotation.set(-0.3, sx * -0.15, 0);
      const a2 = rbox(g, M.linen, 1.3, 1.0, 0.32, sx * 0.55, 2.05, zp + 0.75, 0.15); a2.rotation.set(-0.3, sx * -0.1, 0);
    }
    const c = rbox(g, M.fabric2, 1.2, 0.85, 0.3, 0, 2.05, zp + 1.05, 0.14); c.rotation.x = -0.25;
    void rnd;
  },

  nightstand(g, M, W, D, f, rnd) {
    box(g, M.screen, W - 0.2, 0.12, D - 0.2, 0, 0, 0);
    rbox(g, M.furn_wood, W, 1.55, D, 0, 0.12, 0, 0.04);
    box(g, M.frame, W - 0.2, 0.02, 0.01, 0, 0.9, D / 2 + 0.002);
    box(g, M.metal, 0.45, 0.04, 0.05, 0, 1.25, D / 2 + 0.02); box(g, M.metal, 0.45, 0.04, 0.05, 0, 0.55, D / 2 + 0.02);
    tableLamp(g, M, -W * 0.12, 1.67, -D * 0.1, 1);
    books(g, M, W * 0.18, 1.67, D * 0.15, 2, rnd, 0.4);
  },
  wardrobe(g, M, W, D) {
    rbox(g, M.cabinet, W, 7.85, D, 0, 0.15, 0, 0.02); box(g, M.screen, W - 0.1, 0.15, D - 0.15, 0, 0, -0.05);
    const n = Math.max(2, Math.round(W / 1.9)); const dw = W / n;
    for (let i = 1; i < n; i++) box(g, M.frame, 0.02, 7.75, 0.01, -W / 2 + dw * i, 0.2, D / 2 + 0.002);
    for (let i = 0; i < n; i++) box(g, M.metal, 0.05, 2.6, 0.06, -W / 2 + dw * (i + 0.5) + (i % 2 ? -dw * 0.4 : dw * 0.4), 2.8, D / 2 + 0.04);
  },
  dressing_table(g, M, W, D, f, rnd) {
    rbox(g, M.furn_wood, W, 0.14, D, 0, 2.42, 0, 0.03);
    rbox(g, M.cabinet, W, 2.42, D * 0.4, 0, 0, -D * 0.3, 0.02); rbox(g, M.cabinet, W, 2.42, D * 0.3, 0, 0, D * 0.35, 0.02);
    rbox(g, M.mirror, W * 0.82, 3.6, 0.05, 0, 3.0, -D / 2 + 0.04, 0.04);
    box(g, M.lamp, W * 0.85, 0.04, 0.06, 0, 6.65, -D / 2 + 0.06);
    vase(g, M, 0, 2.56, D * 0.25, 0.5, true, rnd);
  },
  desk(g, M, W, D, f, rnd) {
    rbox(g, M.furn_wood, W, 0.12, D, 0, 2.34, 0, 0.03);
    for (const sx of [-1, 1]) { box(g, M.metal, 0.12, 2.34, 0.12, sx * (W / 2 - 0.2), 0, -D / 2 + 0.2); box(g, M.metal, 0.12, 2.34, 0.12, sx * (W / 2 - 0.2), 0, D / 2 - 0.2); box(g, M.metal, 0.1, 0.1, D - 0.4, sx * (W / 2 - 0.2), 2.24, 0); }
    // laptop + task lamp + books
    rbox(g, M.metal, 1.1, 0.04, 0.75, -0.2, 2.46, 0.1, 0.02);
    const lid = rbox(g, M.screen, 1.1, 0.75, 0.03, -0.2, 2.47, -0.28, 0.02); lid.rotation.x = -0.25;
    cyl(g, M.metal, 0.2, 0.05, W / 2 - 0.5, 2.46, -D / 2 + 0.4); const arm = cyl(g, M.metal, 0.03, 1.4, W / 2 - 0.5, 2.5, -D / 2 + 0.4); arm.rotation.z = 0.3;
    openCyl(g, M.shade, 0.22, 0.12, 0.35, W / 2 - 0.85, 3.6, -D / 2 + 0.4);
    books(g, M, -W / 2 + 0.6, 2.46, -0.1, 3, rnd);
    officeChair(g, M, 0, D / 2 + 0.8, Math.PI);
  },
  bookshelf(g, M, W, D, f, rnd) {
    box(g, M.furn_wood, W, 0.1, D, 0, 0, 0); box(g, M.furn_wood, W, 0.1, D, 0, 6.9, 0);
    box(g, M.furn_wood, 0.1, 7, D, -W / 2 + 0.05, 0, 0); box(g, M.furn_wood, 0.1, 7, D, W / 2 - 0.05, 0, 0);
    box(g, M.cabinet, W, 7, 0.06, 0, 0, -D / 2 + 0.03);
    for (let s = 0; s < 5; s++) {
      const y = 0.1 + s * 1.38; if (s) box(g, M.furn_wood, W, 0.08, D, 0, y, 0);
      let x = -W / 2 + 0.2; const lim = s === 2 ? -0.2 : W / 2 - 0.4;
      while (x < lim) { const bw = 0.12 + rnd() * 0.12; const bh = 0.75 + rnd() * 0.4; if (rnd() > 0.12) box(g, M.books[Math.floor(rnd() * M.books.length)], bw, bh, D * 0.7, x + bw / 2, y + 0.08, 0); x += bw + 0.01; }
      if (s === 2) vase(g, M, W / 2 - 0.45, y + 0.08, 0, 0.5, false, rnd);
    }
  },
  shelf(g, M, W, D, f, rnd) {
    for (let s = 0; s < 5; s++) box(g, M.metal, W, 0.06, D, 0, s * 1.6, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, M.metal, 0.08, 7, 0.08, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05));
    for (let s = 0; s < 4; s++) for (let k = 0; k < 3; k++) rbox(g, M.pot, W * 0.25, 0.6 + rnd() * 0.4, D * 0.6, -W / 3 + k * W / 3, s * 1.6 + 0.06, 0, 0.04);
  },
  counter(g, M, W, D, f) {
    box(g, M.screen, W - 0.05, 0.35, D - 0.35, 0, 0, -0.2);
    rbox(g, M.cabinet, W, 2.55, D - 0.1, 0, 0.35, -0.05, 0.02);
    const n = Math.max(1, Math.round(W / 2)); for (let i = 1; i < n; i++) box(g, M.frame, 0.015, 2.45, 0.01, -W / 2 + (W / n) * i, 0.4, D / 2 - 0.094);
    box(g, M.frame, W - 0.02, 0.015, 0.01, 0, 2.35, D / 2 - 0.094);
    for (let i = 0; i < n; i++) box(g, M.metal, Math.min(1.0, W / n - 0.4), 0.04, 0.05, -W / 2 + (W / n) * (i + 0.5), 2.62, D / 2 - 0.06);
    rbox(g, M.counter, W, 0.12, D, 0, 2.9, 0, 0.02);
    if (f.sink !== undefined) { const sx = (f.rot === 0 ? f.sink - f.x : 0); box(g, M.dark_glass, 1.9, 0.02, 1.15, sx, 3.015, 0.05); cyl(g, M.metal, 0.05, 1.0, sx, 3.02, -D / 2 + 0.25); torus(g, M.metal, 0.3, 0.04, sx, 4.02, -D / 2 + 0.55, 0, Math.PI).rotation.y = Math.PI / 2; }
    if (f.hob !== undefined) { const hx = (f.rot === 0 ? f.hob - f.x : 0); box(g, M.dark_glass, 2.0, 0.02, 1.6, hx, 3.02, 0); for (const [ox, oz] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) torus(g, M.seam, 0.24, 0.012, hx + ox, 3.045, oz); }
  },
  island(g, M, W, D, f, rnd) {
    const deep = f.ledge || D < 2.3; const cab = f.kstyle ? M.k_gloss : M.cabinet; const top = f.kstyle ? M.k_top : M.counter;
    if (f.kstyle) box(g, M.screen, W - 0.5, 0.3, D - 0.4, 0, 0, 0);
    rbox(g, cab, W - 0.3, f.kstyle ? 2.55 : 2.8, deep ? D - 0.2 : D - 1.0, 0, f.kstyle ? 0.33 : 0.1, deep ? 0 : -0.3, 0.02);
    rbox(g, top, W, 0.14, D, 0, 2.9, 0, 0.02);
    rbox(g, top, 0.14, 2.9, D, -W / 2 + 0.07, 0, 0, 0.02); rbox(g, top, 0.14, 2.9, D, W / 2 - 0.07, 0, 0, 0.02);
    if (f.kstyle) for (const sz of [-1, 1]) for (const y of [2.72, 1.72]) box(g, M.k_bronze, W - 0.6, 0.05, 0.05, 0, y, sz * (D / 2 - 0.08));
    if (f.sink !== undefined) { const sx = f.sink - f.x; box(g, M.dark_glass, 1.9, 0.02, 1.15, sx, 3.035, 0); cyl(g, M.metal, 0.05, 1.0, sx, 3.04, -D / 2 + 0.3); torus(g, M.metal, 0.3, 0.04, sx, 4.04, -D / 2 + 0.6, 0, Math.PI).rotation.y = Math.PI / 2; }
    if (f.hob !== undefined) { const hx = f.hob - f.x; box(g, M.dark_glass, 2.0, 0.02, 1.6, hx, 3.04, 0); }
    if (f.ledge) {
      const [a, b, dep] = f.ledge; const lx = (a + b) / 2 - f.x; const len = b - a;
      rbox(g, M.furn_wood, len, 0.12, dep, lx, 2.42, D / 2 + dep / 2, 0.03);
      for (const sx of [-1, 1]) box(g, M.metal, 0.1, 2.42, 0.1, lx + sx * (len / 2 - 0.2), 0, D / 2 + dep - 0.15);
      bowl(g, M, lx + len * 0.25, 2.54, D / 2 + dep / 2, 0.8, true);
    } else bowl(g, M, W * 0.25, 3.04, 0, 0.8, true);
    rbox(g, M.furn_wood, 1.3, 0.06, 0.9, -W * 0.25, 3.04, 0.1, 0.03);
    void rnd;
  },
  pendant(g, M, W) {
    const n = 3; for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W / n) * (i + 0.5);
      cyl(g, M.metal, 0.012, 2.1, x, 7.9, 0, 0.012, 6);
      const dome = sph(g, M.metal, 0.42, x, 7.55, 0, 0.75, 2); dome.castShadow = false;
      flat(cyl(g, M.lamp, 0.3, 0.03, x, 7.3, 0));
    }
  },
  chandelier(g, M, W, D, f) {
    const y = f.hang || 9;
    box(g, M.metal, 0.025, 10 - y + 0.5, 0.025, 0, y, 0);
    flat(torus(g, M.lamp, W / 2, 0.05, 0, y, 0)); flat(torus(g, M.lamp, W / 3, 0.045, 0, y + 0.8, 0));
    flat(torus(g, M.metal, W / 2 + 0.06, 0.02, 0, y + 0.03, 0));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const c = box(g, M.metal, 0.01, 1.0, 0.01, Math.cos(a) * W / 4, y, Math.sin(a) * W / 4); c.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); }
  },
  fridge(g, M, W, D) {
    rbox(g, M.steel, W, 6.2, D, 0, 0, 0, 0.04);
    box(g, M.frame, 0.02, 6.1, 0.01, 0, 0.05, D / 2 + 0.002); box(g, M.frame, W, 0.02, 0.01, 0, 2.2, D / 2 + 0.002);
    for (const sx of [-1, 1]) box(g, M.frame, 0.05, 1.6, 0.08, sx * 0.15, 3.0, D / 2 + 0.05);
  },
  stool(g, M) {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; const l = cyl(g, M.metal, 0.035, 2.35, Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38, 0.03, 8); l.rotation.set(Math.sin(a) * -0.08, 0, Math.cos(a) * 0.08); }
    torus(g, M.metal, 0.4, 0.025, 0, 0.85, 0);
    cyl(g, M.fabric2, 0.5, 0.22, 0, 2.3, 0); torus(g, M.fabric2, 0.47, 0.08, 0, 2.5, 0);
  },
  wc(g, M, W, D) {
    box(g, M.ceramic, W * 0.9, 0.04, 0.4, 0, 2.7, -D / 2 + 0.02);
    rbox(g, M.chrome, 0.7, 0.45, 0.04, 0, 3.0, -D / 2 + 0.03, 0.04);
    const b = rbox(g, M.ceramic, W * 0.85, 0.95, D - 0.15, 0, 0.55, 0.05, 0.3); b.scale.x = 1;
    rbox(g, M.ceramic, W * 0.87, 0.06, D - 0.2, 0, 1.5, 0.06, 0.25);
  },
  basin(g, M, W, D, f) {
    rbox(g, M.furn_wood, W, 1.0, D * 0.92, 0, 1.45, -D * 0.04, 0.03);
    rbox(g, M.counter, W, 0.1, D, 0, 2.45, 0, 0.02);
    const n = f.sinks ?? (W > 2.6 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const x = f.sinkOffset ?? (n === 1 ? 0 : (i - 0.5) * W * 0.5);
      cyl(g, M.ceramic, 0.6, 0.38, x, 2.55, 0.05, 0.66);
      const sp = cyl(g, M.metal, 0.035, 0.8, x, 2.55, -D / 2 + 0.22); sp.rotation.x = 0;
      box(g, M.metal, 0.06, 0.06, 0.45, x, 3.3, -D / 2 + 0.42);
    }
    if (f.mirror !== false) {
      const mw = Math.min(W * 0.85, 3.2);
      flat(rbox(g, M.lamp, mw + 0.1, 2.9, 0.02, 0, 3.55, -D / 2 + 0.01, 0.12));
      rbox(g, M.mirror, mw, 2.8, 0.05, 0, 3.6, -D / 2 + 0.05, 0.12);
    }
  },
  bathtub(g, M, W, D) {
    rbox(g, M.ceramic, W, 1.8, D, 0, 0, 0, 0.12);
    box(g, M.water, W - 0.5, 0.02, D - 0.5, 0, 1.55, 0);
    cyl(g, M.metal, 0.05, 0.6, 0, 1.8, -D / 2 + 0.2);
    rbox(g, M.linen, W * 0.6, 0.12, 0.8, 0, 1.8, D / 2 - 0.6, 0.05);
  },
  shower(g, M, W, D) {
    flat(box(g, M.floor_tile, W, 0.04, D, 0, 0, 0));
    const gl = new THREE.Mesh(boxG(W, 6.8, 0.04), M.glass); gl.position.set(0, 3.5, D / 2); g.add(gl);
    box(g, M.metal, W, 0.05, 0.05, 0, 6.9, D / 2);
    box(g, M.metal, 0.05, 1.6, 0.05, 0, 6.2, -D / 2 + 0.6);
    rbox(g, M.metal, 1.1, 0.05, 1.1, 0, 6.2, -D / 2 + 1.0, 0.04);
    cyl(g, M.metal, 0.12, 0.08, 0.6, 3.6, -D / 2 + 0.06).rotation.x = Math.PI / 2;
  },
  plant(g, M, W, D, f, rnd) {
    const r = Math.min(W, D) / 2;
    cyl(g, M.pot, r * 0.62, 1.25, 0, 0, 0, r * 0.75); cyl(g, M.soil, r * 0.68, 0.04, 0, 1.18, 0);
    for (let i = 0; i < 4; i++) { const s = cyl(g, M.trunk, 0.03, 1.6 + rnd() * 1.2, (rnd() - 0.5) * r * 0.4, 1.1, (rnd() - 0.5) * r * 0.4, 0.02, 5); s.rotation.set((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4); }
    foliage(g, M, 0, 1.8, 0, r * 1.1, 1.9, 46, rnd, 0.42);
  },
  planter(g, M, W, D, f, rnd) {
    rbox(g, M.pot, W, 1.4, D, 0, 0, 0, 0.06); box(g, M.soil, W - 0.15, 0.04, D - 0.15, 0, 1.33, 0);
    const n = Math.max(2, Math.round(W / 1.3));
    for (let i = 0; i < n; i++) foliage(g, M, -W / 2 + (W / n) * (i + 0.5), 1.45, 0, Math.min(D, 1.2) * 0.55, 0.9, 16, rnd, 0.36);
  },
  tree(g, M, W, D, f, rnd) {
    const c = f.canopy || 5;
    cyl(g, M.trunk, 0.36, 8.5, 0, 0, 0, 0.2, 10);
    for (let i = 0; i < 4; i++) { const b = cyl(g, M.trunk, 0.1, 3.5, 0, 7.2, 0, 0.05, 6); const a = (i / 4) * Math.PI * 2 + rnd(); b.rotation.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7); }
    for (let k = 0; k < 6; k++) { const a = rnd() * Math.PI * 2, r = rnd() * c * 0.45; foliage(g, M, Math.cos(a) * r, 8.6 + rnd() * 2.5, Math.sin(a) * r, c * 0.35, 2.4, 34, rnd, 0.75); }
  },
  rug(g, M, W, D) {
    const geo = cached(`rug${q(W)}:${q(D)}`, () => new THREE.BoxGeometry(W, 0.03, D));
    const m = addMesh(g, geo, M.rug, false); m.position.set(0, 0.035, 0); m.userData.uv01 = true;
  },
  car(g, M, W, D) {
    rbox(g, M.car_paint, W - 0.2, 1.75, D, 0, 0.95, 0, 0.45);
    rbox(g, M.car_paint, W - 0.6, 0.9, D * 0.52, 0, 2.5, -D * 0.06, 0.35);
    rbox(g, M.dark_glass, W - 0.55, 0.75, D * 0.5, 0, 2.55, -D * 0.06, 0.32);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(cylGeo, M.tyre); w.scale.set(2.2, 0.75, 2.2); w.rotation.z = Math.PI / 2; w.position.set(sx * (W / 2 - 0.42), 1.1, sz * D * 0.32); w.castShadow = true; g.add(w);
      const hub = new THREE.Mesh(cylGeo, M.chrome); hub.scale.set(1.3, 0.78, 1.3); hub.rotation.z = Math.PI / 2; hub.position.set(sx * (W / 2 - 0.42), 1.1, sz * D * 0.32); g.add(hub);
    }
    flat(box(g, M.lamp, 1.2, 0.25, 0.04, -W / 2 + 0.9, 1.9, D / 2 + 0.01)); flat(box(g, M.lamp, 1.2, 0.25, 0.04, W / 2 - 0.9, 1.9, D / 2 + 0.01));
  },
  lounger(g, M, W, D) {
    box(g, M.furn_wood, W, 0.12, D, 0, 0.8, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, M.furn_wood, 0.15, 0.8, 0.15, sx * (W / 2 - 0.15), 0, sz * (D / 2 - 0.3));
    rbox(g, M.fabric, W - 0.1, 0.3, D * 0.65, 0, 0.92, D * 0.17, 0.1);
    const back = rbox(g, M.fabric, W - 0.1, 0.3, D * 0.35, 0, 1.25, -D * 0.27, 0.1); back.rotation.x = 0.6;
  },
  outdoor_table(g, M, W, D) {
    const r = Math.min(W, D) / 2 - 1.2;
    cyl(g, M.furn_wood, r, 0.12, 0, 2.35, 0); cyl(g, M.metal, 0.12, 2.35, 0, 0, 0); cyl(g, M.metal, r * 0.5, 0.06, 0, 0, 0);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; chair(g, M, Math.sin(a) * (r + 0.55), Math.cos(a) * (r + 0.55), a + Math.PI); }
  },
  washing_machine(g, M, W, D) {
    rbox(g, M.ceramic, W, 2.9, D, 0, 0, 0, 0.05);
    const door = cyl(g, M.dark_glass, 0.55, 0.05, 0, 1.5, D / 2); door.rotation.x = Math.PI / 2; door.position.y = 1.5;
  },
  floor_lamp(g, M) {
    cyl(g, M.metal, 0.4, 0.06, 0, 0, 0); cyl(g, M.metal, 0.03, 4.6, 0, 0.06, 0);
    openCyl(g, M.shade, 0.62, 0.5, 0.85, 0, 4.4, 0);
  },
  sideboard(g, M, W, D, f, rnd) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.metal, 0.04, 0.5, sx * (W / 2 - 0.25), 0, sz * (D / 2 - 0.2), 0.04, 8);
    rbox(g, M.furn_wood, W, 2.2, D, 0, 0.5, 0, 0.03);
    const n = Math.max(2, Math.round(W / 1.6)); for (let i = 1; i < n; i++) box(g, M.frame, 0.015, 2.0, 0.01, -W / 2 + (W / n) * i, 0.6, D / 2 + 0.002);
    vase(g, M, -W * 0.28, 2.7, 0, 1.0, true, rnd);
    const t = books(g, M, W * 0.12, 2.7, 0.05, 2, rnd, 0.1); sculpture(g, M, W * 0.12, t, 0.05);
    bowl(g, M, W * 0.36, 2.7, 0, 0.6);
  },
  bench(g, M, W, D) { rbox(g, M.furn_wood, W, 0.22, D, 0, 1.28, 0, 0.04); box(g, M.metal, W - 0.3, 1.28, 0.15, 0, 0, -D / 2 + 0.4); box(g, M.metal, W - 0.3, 1.28, 0.15, 0, 0, D / 2 - 0.4); },
  ottoman(g, M, W) { cyl(g, M.fabric2, W / 2, 1.35, 0, 0, 0); torus(g, M.fabric2, W / 2 - 0.05, 0.08, 0, 1.33, 0); },
  art(g, M, W, D, f) {
    const h = f.h || 2.5; const y = (f.y || 5.2) - h / 2; const i = (f.art || 0) % M.art.length;
    box(g, M.furn_wood, W + 0.16, h + 0.16, 0.12, 0, y - 0.08, -D / 2 + 0.06);
    const geo = cached(`art${q(W)}:${q(h)}`, () => new THREE.PlaneGeometry(W, h));
    const m = addMesh(g, geo, M.art[i], false); m.position.set(0, y + h / 2, -D / 2 + 0.125); m.userData.uv01 = true;
  },
  shoe_bench(g, M, W, D, f, rnd) {
    // open-cubby shoe rack (ref photo) with an upholstered seat pad and scatter cushions. Back at -z.
    const H = 1.45, t = 0.06; const zb = -D / 2;
    box(g, M.furn_wood, W, t, D, 0, 0.12, 0); box(g, M.screen, W - 0.1, 0.12, D - 0.15, 0, 0, -0.05);
    box(g, M.furn_wood, W, t, D, 0, H - t, 0); box(g, M.furn_wood, W, H - 0.12, t, 0, 0.12, zb + t / 2);
    box(g, M.furn_wood, W, t, D - 0.1, 0, 0.72, -0.05);
    const n = Math.max(1, Math.round(W / 1.25)); const cw = W / n;
    for (let i = 0; i <= n; i++) { if (i === 0 && f.endPanel === 'none') continue; box(g, M.furn_wood, t, H - 0.12, D, -W / 2 + cw * i + (i === 0 ? t / 2 : i === n ? -t / 2 : 0), 0.12, 0); }
    const pairs = [M.decor, M.fabric2, M.throw, M.screen, M.linen, M.k_bronze || M.metal];
    for (let i = 0; i < n; i++) for (const [y, k] of [[0.18, 0], [0.78, 1]]) {
      if (rnd() < 0.25) continue; const cx = -W / 2 + cw * (i + 0.5); const mat = pairs[Math.floor(rnd() * pairs.length)];
      for (const sx of [-0.13, 0.13]) { rbox(g, mat, 0.22, 0.28 + k * 0.05, 0.78, cx + sx, y, 0.02, 0.08); rbox(g, M.linen, 0.23, 0.06, 0.25, cx + sx, y, 0.28, 0.03); }
    }
    rbox(g, M.fabric, W - 0.04, 0.28, D - 0.06, 0, H, 0.02, 0.1);
    for (let i = 0; i < (f.cushions || 0); i++) {
      const p = rbox(g, i % 2 ? M.throw : M.fabric2, 1.35, 1.3, 0.34, -W / 2 + W * ((i + 0.5) / f.cushions), H + 0.28, zb + 0.35, 0.15);
      p.rotation.set(-0.18, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.15);
    }
  },
  kitchen_run(g, M, W, D, f, rnd) {
    // modular kitchen along a wall: back at -z. Heights in ft: plinth 0.33, worktop 3.0, uppers 4.7-7.6
    const zb = -D / 2, zf = D / 2, UP = 1.15, Y0 = 4.7, Y1 = 7.6, YT = 2.88, H = Y1 - Y0;
    box(g, M.screen, W - 0.02, 0.33, D - 0.25, 0, 0, -0.12);
    const seam = (w, h, x, y, z) => box(g, M.screen, w, h, 0.012, x, y, z);
    let x0 = -W / 2; let topA = null, topB = null;
    for (const md of f.modules) {
      const w = md.w; const xa = x0, xb = x0 + w, xc = (xa + xb) / 2; x0 = xb;
      if (md.t === 'tall_open') {
        const ow = 0.62;
        box(g, M.k_gloss, 0.06, Y1 - 0.33, D, xa + 0.03, 0.33, 0);
        box(g, M.k_shelf, ow - 0.06, Y1 - 0.33, 0.05, xa + 0.06 + (ow - 0.06) / 2, 0.33, zb + 0.03);
        flat(glowPlane(g, M.glowIn, ow - 0.1, Y1 - 0.5, xa + ow / 2 + 0.03, 0.4, zb + 0.07));
        for (let k = 0; k < 6; k++) {
          const y = 0.4 + k * 1.2;
          box(g, M.k_shelf, ow - 0.06, 0.05, D - 0.1, xa + 0.03 + ow / 2, y, -0.05);
          flat(box(g, M.lamp, ow - 0.12, 0.02, 0.04, xa + 0.03 + ow / 2, y + 1.12, zf - 0.15));
          if (k > 0 && k < 5) { if (k % 2) bowl(g, M, xa + 0.03 + ow / 2, y + 0.05, -0.05, 0.6); else cyl(g, M.ceramic, 0.18, 0.5, xa + 0.03 + ow / 2, y + 0.05, -0.05, 0.15); }
        }
        rbox(g, M.k_gloss, w - ow, Y1 - 0.33, D, xa + ow + (w - ow) / 2, 0.33, 0, 0.015);
        for (const y of [2.88, 4.7]) seam(w - ow - 0.04, 0.012, xa + ow + (w - ow) / 2, y, zf + 0.002);
        box(g, M.k_bronze, 0.05, 1.8, 0.06, xb - 0.12, 2.9, zf + 0.02);
        continue;
      }
      if (md.t === 'tall_fridge') {
        rbox(g, M.k_gloss, w - 0.02, Y1 - 0.33, D, xc, 0.33, 0, 0.015);
        seam(0.012, 4.6, xc, 0.4, zf + 0.002); seam(w - 0.06, 0.012, xc, 5.0, zf + 0.002);
        for (const sx of [-1, 1]) box(g, M.k_bronze, 0.05, 2.2, 0.06, xc + sx * 0.12, 2.2, zf + 0.02);
        // fluted glass top section (lit inside) with bronze frame
        const fx1 = xa + 0.12, fx2 = xb - 0.12, fy1 = 5.1, fy2 = Y1 - 0.12;
        box(g, M.k_shelf, fx2 - fx1, fy2 - fy1, 0.05, xc, fy1, zf - 0.12);
        flat(glowPlane(g, M.glowIn, fx2 - fx1, fy2 - fy1, xc, fy1, zf - 0.09));
        for (let x = fx1 + 0.05; x < fx2 - 0.02; x += 0.09) flat(box(g, M.k_fluted, 0.075, fy2 - fy1, 0.05, x, fy1, zf + 0.01));
        for (const [bw, bh, bx, by] of [[fx2 - fx1 + 0.1, 0.05, xc, fy1 - 0.05], [fx2 - fx1 + 0.1, 0.05, xc, fy2], [0.05, fy2 - fy1, fx1 - 0.025, fy1], [0.05, fy2 - fy1, fx2 + 0.025, fy1]]) box(g, M.k_bronze, bw, bh, 0.07, bx, by, zf + 0.02);
        continue;
      }
      // base unit with drawers (J-profile handles), worktop, backsplash, upper
      topA = topA ?? xa; topB = xb;
      rbox(g, M.k_gloss, w - 0.012, YT - 0.33, D - 0.08, xc, 0.33, -0.04, 0.012);
      for (const y of [2.62, 1.6]) { box(g, M.k_bronze, w - 0.1, 0.05, 0.05, xc, y, zf - 0.06); seam(w - 0.06, 0.012, xc, y + 0.07, zf - 0.078); }
      if (w > 2.2) seam(0.012, 1.25, xc, 0.36, zf - 0.078);
      box(g, M.k_splash, w, (md.t === 'hood' ? Y1 + 0.3 : Y0) - 3.0, 0.05, xc, 3.0, zb + 0.025);
      if (md.t === 'hood') {
        box(g, M.dark_glass, w - 0.12, 0.02, 1.7, xc, 3.0, -0.05);
        for (const [ox, oz, rr] of [[-0.5, -0.35, 0.28], [0.5, -0.35, 0.22], [-0.5, 0.35, 0.22], [0.5, 0.35, 0.28], [0, 0, 0.16]]) torus(g, M.k_bronze, rr, 0.025, xc + ox, 3.04, oz);
        const canopy = box(g, M.dark_glass, w - 0.35, 0.06, 1.75, xc, 5.75, zb + 0.95); canopy.rotation.x = 0.42;
        box(g, M.steel, w - 0.6, 0.35, 1.0, xc, 5.85, zb + 0.5);
        box(g, M.steel, 1.05, 9.95 - 6.2, 0.95, xc, 6.2, zb + 0.48);
        flat(box(g, M.lamp, 0.6, 0.02, 0.25, xc, 5.83, zb + 0.9));
        flat(glowPlane(g, M.glowIn, w - 0.4, 2.4, xc, 3.05, zb + 0.06));
        continue;
      }
      const zu = zb + UP / 2;
      if (md.upper === 'glass') {
        box(g, M.k_gloss, w, 0.08, UP, xc, Y0, zu); box(g, M.k_gloss, w, 0.08, UP, xc, Y1 - 0.08, zu);
        box(g, M.k_gloss, 0.08, H, UP, xa + 0.04, Y0, zu); box(g, M.k_gloss, 0.08, H, UP, xb - 0.04, Y0, zu);
        box(g, M.k_shelf, w - 0.16, H - 0.16, 0.05, xc, Y0 + 0.08, zb + 0.06);
        box(g, M.k_shelf, w - 0.16, 0.04, UP - 0.15, xc, Y0 + 1.42, zu - 0.05);
        flat(glowPlane(g, M.glowIn, w - 0.2, H - 0.2, xc, Y0 + 0.1, zb + 0.09));
        flat(box(g, M.lamp, w - 0.25, 0.02, 0.04, xc, Y1 - 0.11, zb + UP - 0.15));
        for (const yy of [Y0 + 0.08, Y0 + 1.46]) for (let i = 0; i < 2; i++) { const px = xc + (i - 0.5) * (w * 0.42); sph(g, M.ceramic, 0.36, px, yy + 0.2, zu - 0.1, 0.6, 2); }
        for (const [bw, bh, bx, by] of [[w - 0.1, 0.06, xc, Y0 + 0.02], [w - 0.1, 0.06, xc, Y1 - 0.08], [0.06, H - 0.06, xa + 0.05, Y0 + 0.02], [0.06, H - 0.06, xb - 0.05, Y0 + 0.02]]) box(g, M.k_bronze, bw, bh, 0.07, bx, by, zb + UP + 0.01);
        flat(box(g, M.k_glass, w - 0.16, H - 0.16, 0.02, xc, Y0 + 0.08, zb + UP));
      } else {
        rbox(g, M.k_gloss, w - 0.015, H, UP, xc, Y0, zu, 0.012);
        if (w > 2.2) seam(0.012, H - 0.1, xc, Y0 + 0.05, zb + UP + 0.002);
        box(g, M.k_bronze, w - 0.1, 0.05, 0.06, xc, Y0 + 0.03, zb + UP + 0.01);
      }
      flat(box(g, M.lamp, w - 0.15, 0.02, 0.05, xc, Y0 - 0.03, zb + UP - 0.12));
      flat(glowPlane(g, M.glowIn, w - 0.1, Y0 - 3.05, xc, 3.03, zb + 0.06));
    }
    if (topA !== null) rbox(g, M.k_top, topB - topA, 0.12, D + 0.06, (topA + topB) / 2, YT, 0.03, 0.02);
    // worktop styling (ref: canisters, bowl, potted plant)
    const tx = topA ?? 0;
    cyl(g, M.ceramic, 0.28, 0.75, tx + 0.6, 3.0, zb + 0.55); cyl(g, M.ceramic, 0.2, 0.55, tx + 1.15, 3.0, zb + 0.5);
    bowl(g, M, (topB ?? 0) - 0.9, 3.0, zb + 0.7, 0.8, true);
    cyl(g, M.pot, 0.25, 0.4, (topB ?? 0) - 0.35, 3.0, zb + 0.45, 0.2); foliage(g, M, (topB ?? 0) - 0.35, 3.45, zb + 0.45, 0.3, 0.35, 10, rnd, 0.22);
  },
  tv_wall(g, M, W, D) {
    const tw = Math.min(W, 4.75), th = tw * 0.5625;
    tvPanel(g, M, tw, th, 0, 4.6 - th / 2, -D / 2);
    rbox(g, M.furn_wood, Math.min(W, tw + 0.6), 0.22, 0.95, 0, 2.15, -D / 2 + 0.48, 0.03);
    flat(glowPlane(g, M.glowIn, tw * 0.8, 0.5, 0, 1.7, -D / 2 + 0.005));
  },
  fabric_panel(g, M, W, D) {
    const H = 9.2; const n = Math.max(3, Math.round(W / 2.3)); const pw = W / n;
    for (let i = 0; i < n; i++) rbox(g, M.fabric, pw - 0.06, H - 0.4, 0.14, -W / 2 + pw * (i + 0.5), 0.3, -D / 2 + 0.07, 0.05);
    for (const sx of [-1, 1]) { flat(box(g, M.lamp, 0.05, H - 0.4, 0.03, sx * (W / 2 + 0.05), 0.3, -D / 2 + 0.03)); flat(glowPlane(g, M.glowIn, 0.9, H - 0.6, sx * (W / 2 + 0.3), 0.4, -D / 2 + 0.01)); }
  },
  ceiling_cove(g, M, W, D, f) {
    const ceil = f.ceil ?? 10; const R = Math.min(W, D) / 2; const drop = 0.35;
    const ring = cached(`cove${q(R)}`, () => { const geo = new THREE.RingGeometry(R - 1.1, R, 64, 1); geo.rotateX(Math.PI / 2); return geo; });
    const m = addMesh(g, ring, M.ceiling, false); m.position.y = ceil - drop;
    openCyl(g, M.ceiling, R, R, drop, 0, ceil - drop, 0);
    flat(torus(g, M.lamp, R - 1.1, 0.03, 0, ceil - drop + 0.01, 0));
    const pg = cached(`covegl${q(R)}`, () => { const geo = new THREE.PlaneGeometry(2 * R - 0.6, 2 * R - 0.6); geo.rotateX(Math.PI / 2); return geo; });
    const gl = addMesh(g, pg, M.glowRadial, false); gl.position.y = ceil - 0.02; gl.renderOrder = 3;
    void D;
  },
  rug_round(g, M, W) {
    const geo = cached(`rr${q(W)}`, () => new THREE.CylinderGeometry(W / 2, W / 2, 0.03, 48));
    const m = addMesh(g, geo, M.rug, false); m.position.y = 0.035;
  },
  palm(g, M, W, D, f, rnd) {
    const h = f.h || 16; const n = 7; let x = 0, z = 0; const lean = (rnd() - 0.5) * 0.12;
    cyl(g, M.trunk, 0.38, h, x, 0, z, 0.26, 10); void n; void lean;
    for (let i = 1; i < 9; i++) torus(g, M.trunk, 0.36 - i * 0.012, 0.025, x, (i * h) / 9, z);
    torus(g, M.trunk, 0.32, 0.06, x, h * 0.98, z);
    const top = h; const fronds = Math.round(11 * LEAF_DENSITY) + 3;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + rnd() * 0.3; const L = 6 + rnd() * 2.5; const droop = 0.35 + rnd() * 0.5;
      for (let k = 0; k < 7; k++) {
        const t = (k + 0.5) / 7; const dist = t * L; const y = top + Math.sin(t * Math.PI * 0.8) * 1.2 - t * t * droop * 4;
        const m = addMesh(g, leafGeo, k % 2 ? M.leaf : M.leaf2); const s = (1 - t * 0.6) * 1.6;
        m.scale.set(s * 1.4, 0.05, s * 0.9); m.position.set(x + Math.cos(a) * dist, y, z + Math.sin(a) * dist); m.rotation.set(0, -a, (t - 0.3) * droop);
      }
    }
  },
  ceiling_fan(g, M, W, D, f) {
    const y = f.ceil ?? 9.97;
    cyl(g, M.metal, 0.03, 0.9, 0, y - 0.9, 0); cyl(g, M.metal, 0.25, 0.3, 0, y - 1.15, 0, 0.2);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const b = rbox(g, M.furn_wood, 2.1, 0.03, 0.4, Math.cos(a) * 1.25, y - 1.05, Math.sin(a) * 1.25, 0.02, -a); b.rotation.z = 0.06; }
    void W; void D;
  },
  laundry_unit(g, M, W, D) {
    // modules from local -x to +x: tall store | sink | tall broom | stacked washer-dryer (as in the reference photo)
    const mods = [['tall', 1.6], ['sink', 2.6], ['tall', 1.3], ['wd', 2.3]]; const sc = W / mods.reduce((a, m) => a + m[1], 0);
    const H = 7.6; let x = -W / 2;
    box(g, M.appliance, W, 0.25, D - 0.15, 0, 0, -0.08);
    for (const [kind, w0] of mods) {
      const w = w0 * sc; const cx = x + w / 2;
      if (kind === 'tall') {
        box(g, M.laundry, w - 0.02, H - 0.25, D, cx, 0.25, 0);
        box(g, M.seam, 0.02, H - 0.35, 0.02, cx, 0.3, D / 2 + 0.005);
      } else if (kind === 'sink') {
        box(g, M.laundry, w - 0.02, 2.6, D - 0.1, cx, 0.25, -0.05);
        box(g, M.seam, 0.02, 2.4, 0.02, cx, 0.3, D / 2 - 0.04); box(g, M.seam, w - 0.1, 0.02, 0.02, cx, 2.2, D / 2 - 0.04);
        box(g, M.floor_terrazzo, w, 0.14, D, cx, 2.85, 0);
        box(g, M.ceramic, w * 0.6, 0.05, D * 0.5, cx, 2.97, 0.05);
        box(g, M.appliance, 0.06, 0.7, 0.06, cx + w * 0.2, 2.99, -D / 2 + 0.25); box(g, M.appliance, 0.05, 0.05, 0.45, cx + w * 0.2, 3.62, -D / 2 + 0.45);
        box(g, M.floor_terrazzo, w, 2.4, 0.06, cx, 2.99, -D / 2 + 0.03);
        box(g, M.ceramic, 1.2, 1.1, 0.5, cx - w * 0.1, 3.9, -D / 2 + 0.31);
        cyl(g, M.dark_glass, 0.38, 0.04, cx - w * 0.1, 4.45, -D / 2 + 0.58).rotation.x = Math.PI / 2;
        box(g, M.laundry, w - 0.02, H - 5.4, D * 0.6, cx, 5.4, -D * 0.2);
        box(g, M.lamp, w - 0.2, 0.04, 0.08, cx, 5.37, D * 0.08);
      } else {
        box(g, M.laundry, 0.08, H - 0.25, D, x + 0.04, 0.25, 0); box(g, M.laundry, 0.08, H - 0.25, D, x + w - 0.04, 0.25, 0);
        for (const y of [0.25, 2.95]) {
          box(g, M.appliance, w - 0.2, 2.65, D - 0.15, cx, y, -0.05);
          const door = cyl(g, M.dark_glass, 0.62, 0.06, cx, 0, D / 2 - 0.1); door.rotation.x = Math.PI / 2; door.position.y = y + 1.25;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.06, 10, 32), M.chrome); ring.position.set(cx, y + 1.25, D / 2 - 0.06); g.add(ring);
          box(g, M.dark_glass, w * 0.5, 0.12, 0.02, cx, y + 2.3, D / 2 - 0.12);
        }
        box(g, M.laundry, w - 0.02, H - 5.75, D, cx, 5.75, 0);
      }
      x += w;
    }
    box(g, M.seam, W, 0.02, 0.02, 0, 5.75, D / 2 + 0.005);
  },
  snooker_table(g, M, W, D, f, rnd) {
    for (const lx of [-1, 0, 1]) for (const lz of [-1, 1]) box(g, M.furn_wood, 0.5, 2.0, 0.5, lx * (W / 2 - 0.7), 0, lz * (D / 2 - 0.6));
    box(g, M.furn_wood, W - 0.3, 0.55, D - 0.3, 0, 2.0, 0);
    box(g, M.baize, W - 0.9, 0.08, D - 0.9, 0, 2.5, 0);
    box(g, M.furn_wood, W, 0.25, 0.45, 0, 2.45, D / 2 - 0.225); box(g, M.furn_wood, W, 0.25, 0.45, 0, 2.45, -D / 2 + 0.225);
    box(g, M.furn_wood, 0.45, 0.25, D - 0.9, W / 2 - 0.225, 2.45, 0); box(g, M.furn_wood, 0.45, 0.25, D - 0.9, -W / 2 + 0.225, 2.45, 0);
    box(g, M.baize, W - 1.1, 0.14, 0.12, 0, 2.56, D / 2 - 0.51); box(g, M.baize, W - 1.1, 0.14, 0.12, 0, 2.56, -D / 2 + 0.51);
    box(g, M.baize, 0.12, 0.14, D - 1.1, W / 2 - 0.51, 2.56, 0); box(g, M.baize, 0.12, 0.14, D - 1.1, -W / 2 + 0.51, 2.56, 0);
    for (const px of [-1, 0, 1]) for (const pz of [-1, 1]) cyl(g, M.screen, 0.2, 0.07, px * (W / 2 - 0.42), 2.64, pz * (D / 2 - 0.42));
    // baulk line + D
    box(g, M.linen, 0.02, 0.005, D - 1.0, -W / 2 + 0.45 + (W - 0.9) * 0.2, 2.585, 0);
    const ballR = 0.086; const y = 2.58 + ballR;
    const mk = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.05 });
    const red = mk('#b3121b'); const ball = (mat, x, z) => { sph(g, mat, ballR, x, y, z); };
    const apex = W / 2 - 0.45 - (W - 0.9) * 0.28;
    for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) ball(red, apex + row * ballR * 1.75, (k - row / 2) * ballR * 2.02);
    [['#111111', W / 2 - 0.85, 0], ['#e85d9b', apex - ballR * 2.4, 0], ['#1d4fb8', 0, 0], ['#6b3d1c', -W / 2 + 0.45 + (W - 0.9) * 0.2, 0],
      ['#d8c21a', -W / 2 + 0.45 + (W - 0.9) * 0.2, -0.55], ['#1f8a3d', -W / 2 + 0.45 + (W - 0.9) * 0.2, 0.55], ['#f7f4ea', -W / 2 + 1.2, 0.25]]
      .forEach(([c, x, z]) => ball(mk(c), x, z));
    const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 4.8, 10), M.furn_wood); cue.rotation.z = Math.PI / 2; cue.rotation.y = 0.12;
    cue.position.set(-W / 2 + 2.6, y + 0.02, D / 2 - 0.75); cue.castShadow = true; g.add(cue);
    void rnd;
  },
  cue_rack(g, M, W, D) {
    box(g, M.furn_wood, W, 4.6, 0.08, 0, 0.6, -D / 2 + 0.04);
    box(g, M.furn_wood, W, 0.12, D, 0, 0.6, 0); box(g, M.furn_wood, W, 0.12, D * 0.7, 0, 4.4, -D * 0.15);
    const n = 6; for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.045, 4.8, 10), M.furn_wood);
      c.position.set(-W / 2 + (W / n) * (i + 0.5), 0.72 + 2.4, -D / 2 + 0.17); c.castShadow = true; g.add(c);
    }
    box(g, M.screen, W * 0.8, 1.2, 0.05, 0, 5.4, -D / 2 + 0.06);
  },
  punching_bag(g, M, W, D, f) {
    const ceil = f.ceil ?? 10; const r = Math.min(W, D) * 0.45; const top = 5.6;
    box(g, M.steel, 0.6, 0.08, 0.6, 0, ceil - 0.08, 0);
    box(g, M.steel, 0.05, ceil - 0.08 - (top + 0.9), 0.05, 0, top + 0.9, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2; const ch = box(g, M.steel, 0.03, 1.0, 0.03, Math.cos(a) * r * 0.45, top - 0.05, Math.sin(a) * r * 0.45);
      ch.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    }
    cyl(g, M.leather, r, top - 2.0, 0, 2.0, 0);
    cyl(g, M.pad, r * 1.02, 0.18, 0, 2.0, 0); cyl(g, M.pad, r * 1.02, 0.18, 0, top - 0.18, 0);
    cyl(g, M.linen, r * 1.025, 0.5, 0, 3.4, 0);
  },
  treadmill(g, M, W, D) {
    box(g, M.appliance, W - 0.3, 0.55, D - 0.5, 0, 0, -0.25);
    box(g, M.pad, W - 0.9, 0.04, D - 1.4, 0, 0.55, -0.3);
    for (const sx of [-1, 1]) {
      box(g, M.steel, 0.2, 0.58, D - 0.6, sx * (W / 2 - 0.3), 0, -0.25);
      const up = box(g, M.steel, 0.18, 4.0, 0.25, sx * (W / 2 - 0.25), 0.2, D / 2 - 0.55); up.rotation.x = -0.12;
      box(g, M.pad, 0.1, 0.1, 1.7, sx * (W / 2 - 0.25), 3.5, D / 2 - 1.35);
    }
    box(g, M.appliance, W - 0.2, 0.55, 0.9, 0, 4.0, D / 2 - 0.65);
    const scr = box(g, M.dark_glass, 1.3, 0.55, 0.06, 0, 4.2, D / 2 - 1.08); scr.rotation.x = 0.5;
  },
  weight_bench(g, M, W, D) {
    box(g, M.steel, 0.25, 1.2, D - 0.8, 0, 0, 0);
    box(g, M.steel, W + 0.4, 0.15, 0.3, 0, 0, D / 2 - 0.3); box(g, M.steel, W + 0.4, 0.15, 0.3, 0, 0, -D / 2 + 0.3);
    box(g, M.pad, W * 0.85, 0.3, D - 0.4, 0, 1.2, 0.1);
    for (const sx of [-1, 1]) box(g, M.steel, 0.15, 4.0, 0.15, sx * (W / 2 + 0.3), 0, -D / 2 + 0.25);
    const bar = new THREE.Mesh(cylGeo, M.chrome); bar.scale.set(0.09, 5.2, 0.09); bar.rotation.z = Math.PI / 2; bar.position.set(0, 3.9, -D / 2 + 0.25); g.add(bar);
    for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const p = new THREE.Mesh(cylGeo, M.pad); p.scale.set(1.45 - k * 0.4, 0.14, 1.45 - k * 0.4); p.rotation.z = Math.PI / 2;
      p.position.set(sx * (2.0 + k * 0.16), 3.9, -D / 2 + 0.25); p.castShadow = true; g.add(p);
    }
  },
  dumbbell_rack(g, M, W, D) {
    for (const sx of [-1, 1]) { box(g, M.steel, 0.15, 2.4, D - 0.2, sx * (W / 2 - 0.08), 0, 0); }
    box(g, M.steel, W, 0.08, D * 0.45, 0, 0.95, D * 0.22); box(g, M.steel, W, 0.08, D * 0.45, 0, 1.95, -D * 0.2);
    const n = Math.floor((W - 0.4) / 0.62);
    for (const [y, z, s0] of [[1.03, D * 0.22, 0.16], [2.03, -D * 0.2, 0.11]]) for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.35 + i * 0.62; const r = s0 + i * 0.012;
      for (const dz of [-0.33, 0.33]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 6), M.pad); h.rotation.x = Math.PI / 2; h.position.set(x, y + r, z + dz); h.castShadow = true; g.add(h); }
      const hd = new THREE.Mesh(cylGeo, M.chrome); hd.scale.set(0.07, 0.5, 0.07); hd.rotation.x = Math.PI / 2; hd.position.set(x, y + r, z); g.add(hd);
    }
  },
  yoga_mat(g, M, W, D, f) {
    const m = box(g, f.alt ? M.yoga2 : M.yoga, W, 0.025, D - 0.4, 0, 0.04, -0.2); m.castShadow = false;
    const roll = new THREE.Mesh(cylGeo, f.alt ? M.yoga2 : M.yoga); roll.scale.set(0.4, W, 0.4); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.24, D / 2 - 0.2); g.add(roll);
  },
  gym_mat(g, M, W, D) { const m = box(g, M.rubber, W, 0.03, D, 0, 0.004, 0); m.castShadow = false; },
  mirror_wall(g, M, W, D, f) {
    const y0 = f.y0 ?? 0.5; const h = f.mh ?? 7.2;
    box(g, M.steel, W + 0.12, h + 0.12, 0.05, 0, y0 - 0.06, -D / 2 + 0.025);
    box(g, M.mirror, W, h, 0.03, 0, y0, -D / 2 + 0.06);
    const refl = new Reflector(new THREE.PlaneGeometry(W, h), {
      textureWidth: 1536, textureHeight: Math.round((1536 * h) / W), color: 0xd2d6d8, clipBias: 0.003
    });
    refl.position.set(0, y0 + h / 2, -D / 2 + 0.085); refl.userData.isReflector = true; refl.userData.noMerge = true; g.add(refl);
    for (let i = 1; i < Math.round(W / 3); i++) box(g, M.steel, 0.03, h, 0.03, -W / 2 + (W / Math.round(W / 3)) * i, y0, -D / 2 + 0.1);
  },
};

/**
 * Build a furniture item. In data, w/d are world (post-rotation) extents and rot is the facing direction
 * (0 = front faces +z, 90 = +x, 180 = -z, 270 = -x).
 */
export function buildFurniture(item, M, levelY, seed = 1) {
  const g = new THREE.Group();
  const rot = ((item.rot || 0) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const W = swap ? item.d : item.w; const D = swap ? item.w : item.d;
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const fn = B[item.type];
  if (fn) fn(g, M, W, D, item, rnd);
  else box(g, M.cabinet, W, 2, D, 0, 0, 0);
  g.position.set(item.x, levelY, item.z);
  g.rotation.y = (rot * Math.PI) / 180;
  g.userData.furniture = item;
  return g;
}

/**
 * Bakes a static hierarchy into one mesh per (material, castShadow) pair: hundreds of furniture parts become a
 * few dozen draw calls. Objects flagged userData.noMerge (live mirrors) are kept as-is.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(); const keep = [];
  root.traverse((o) => {
    if (o.userData.noMerge) { keep.push(o); return; }
    if (!o.isMesh || keep.some((k) => isDescendant(o, k))) return;
    const key = o.material.uuid + (o.castShadow ? ':c' : ':n');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(g);
  });
  const out = new THREE.Group(); out.name = root.name;
  for (const { mat, cast, geos } of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.castShadow = cast; m.receiveShadow = true;
    m.matrixAutoUpdate = false; if (mat.transparent) m.renderOrder = 2; out.add(m);
    geos.forEach((x) => x.dispose());
  }
  for (const k of keep) { const wm = k.matrixWorld.clone(); k.parent.remove(k); wm.decompose(k.position, k.quaternion, k.scale); out.add(k); }
  return out;
}
function isDescendant(o, root) { for (let p = o.parent; p; p = p.parent) if (p === root) return true; return false; }
