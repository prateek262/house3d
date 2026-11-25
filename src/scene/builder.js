import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  wallPieces, wallAxis, wallHeight, openingWithDefaults, decomposeRects, stairGeometry, roomAnchor, rectArea, roomAt, pointInRect,
  furnitureBoxes, FURNITURE_SPECS, roomBBox
} from '../core/geometry.js';
import { buildFurniture, mergeStatic } from './furniture.js';
import { buildServices, serviceMaterials } from './services.js';

const CURTAIN_ROOMS = new Set(['bedroom', 'office', 'living']);
const LIGHT_TYPES = new Set(['window', 'slide', 'glazing']);
const INDOOR_EXCLUDE = new Set(['shaft', 'stair']);

/** Looks at both faces of a wall opening and returns {inside, outside} rooms (null = outside the building). */
function openingSides(L, w, o) {
  const axis = wallAxis(w); const m = (o.from + o.to) / 2; const th = axis === 'x' ? w.z2 - w.z1 : w.x2 - w.x1;
  const mid = axis === 'x' ? (w.z1 + w.z2) / 2 : (w.x1 + w.x2) / 2; const off = th / 2 + 0.6;
  const at = (side) => (axis === 'x' ? roomAt(L, m, mid + side * off) : roomAt(L, mid + side * off, m));
  return { neg: at(-1), pos: at(1), axis, mid, th };
}
const isIndoor = (r) => r && !r.outdoor && !INDOOR_EXCLUDE.has(r.type);

/** Ceiling-hung sheer curtain panels stacked beside windows of bedrooms / living rooms / office. */
function buildCurtains(house, L, M, furn) {
  const g = new THREE.Group(); const H = (L.wallHeight ?? 10) - 0.2;
  const blocks = furn.filter((f) => { const s = FURNITURE_SPECS[f.type] || {}; return s.collide !== false && !s.wallMounted; })
    .flatMap((f) => furnitureBoxes(L, f));
  for (const w of L.walls) {
    if (w.mat) continue;
    const ops = (w.openings || []).map((o) => openingWithDefaults(house, o));
    for (const o of ops) {
      if (!LIGHT_TYPES.has(o.type) || o.head < 6.5 || o.to - o.from < 2.5) continue;
      const sd = openingSides(L, w, o);
      for (const side of [-1, 1]) {
        const room = side < 0 ? sd.neg : sd.pos;
        if (!room || room.outdoor || !CURTAIN_ROOMS.has(room.type)) continue;
        const bb = roomBBox(room); const [rmin, rmax] = sd.axis === 'x' ? [bb[0], bb[2]] : [bb[1], bb[3]];
        const face = sd.mid + side * sd.th / 2; const c = face + side * 0.3;
        const pw0 = Math.max(1.0, Math.min(1.5, 0.2 * (o.to - o.from)));
        for (const end of [-1, 1]) {
          let a1 = end < 0 ? o.from - pw0 + 0.35 : o.to - 0.35; let a2 = a1 + pw0;
          a1 = Math.max(a1, rmin + 0.06); a2 = Math.min(a2, rmax - 0.06);
          if (a2 - a1 < 0.7) continue;
          if (ops.some((p) => p !== o && ['door', 'door2', 'slide', 'opening'].includes(p.type) && a2 > p.from - 0.1 && a1 < p.to + 0.1)) continue;
          const rect = sd.axis === 'x' ? [a1, c - 0.3, a2, c + 0.3] : [c - 0.3, a1, c + 0.3, a2];
          if (blocks.some((b) => b.x1 < rect[2] && b.x2 > rect[0] && b.z1 < rect[3] && b.z2 > rect[1])) continue;
          const len = a2 - a1; const folds = Math.max(3, Math.round(len / 0.32));
          const geo = new THREE.PlaneGeometry(len, H, folds * 4, 1); const pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(((pos.getX(i) + len / 2) / len) * folds * Math.PI * 2) * 0.09);
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, M.curtain); mesh.castShadow = true; mesh.receiveShadow = true;
          const am = (a1 + a2) / 2; const y = L.y + 0.05 + H / 2;
          if (sd.axis === 'x') mesh.position.set(am, y, c); else { mesh.position.set(c, y, am); mesh.rotation.y = Math.PI / 2; }
          g.add(mesh);
          const track = new THREE.Mesh(new THREE.BoxGeometry(sd.axis === 'x' ? len + 0.2 : 0.12, 0.08, sd.axis === 'x' ? 0.12 : len + 0.2), M.metal);
          track.position.set(sd.axis === 'x' ? am : c, L.y + H + 0.12, sd.axis === 'x' ? c : am); g.add(track);
        }
      }
    }
  }
  return g;
}

/** Glazed openings between an indoor room and the outside: used to place window daylight (area) lights. */
function windowLightCandidates(house, L, li) {
  const out = [];
  for (const w of L.walls) {
    if (w.mat) continue;
    for (const o0 of w.openings || []) {
      const o = openingWithDefaults(house, o0); if (!LIGHT_TYPES.has(o.type)) continue;
      const head = Math.min(o.head, wallHeight(house, L, w)); const area = (o.to - o.from) * (head - o.sill); if (area < 10) continue;
      const sd = openingSides(L, w, o); const inNeg = isIndoor(sd.neg), inPos = isIndoor(sd.pos);
      if (inNeg === inPos) continue;
      const side = inPos ? 1 : -1; const room = inPos ? sd.pos : sd.neg;
      const face = sd.mid + side * (sd.th / 2 + 0.05); const m = (o.from + o.to) / 2; const y = L.y + (o.sill + head) / 2;
      out.push({ li, room: room.id, area, w: o.to - o.from, h: head - o.sill, y,
        x: sd.axis === 'x' ? m : face, z: sd.axis === 'x' ? face : m, nx: sd.axis === 'x' ? 0 : side, nz: sd.axis === 'x' ? side : 0 });
    }
  }
  return out;
}

/** Box geometry with UVs expressed in feet (so tiling textures keep real-world scale). */
function worldBox(x1, y1, z1, x2, y2, z2) {
  const w = x2 - x1, h = y2 - y1, d = z2 - z1;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  g.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  return g;
}
function floorPlane(x1, z1, x2, z2, y) {
  const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; const p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + (x1 + x2) / 2, -(p.getZ(i) + (z1 + z2) / 2));
  g.translate((x1 + x2) / 2, y, (z1 + z2) / 2);
  return g;
}
function mergedMesh(geos, mat, { cast = true, receive = true } = {}) {
  if (!geos.length) return null;
  if (geos.some((g) => g.index) && geos.some((g) => !g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
  m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}
class Bucket {
  constructor() { this.map = new Map(); }
  add(key, geo) { if (!this.map.has(key)) this.map.set(key, []); this.map.get(key).push(geo); }
  flush(group, M, opts = {}) {
    for (const [k, geos] of this.map) {
      const light = k.startsWith('glow') || k === 'fixture' || k === 'lamp';
      const mesh = mergedMesh(geos, M[k], { cast: !(opts.noShadow || []).includes(k) && !k.includes('glass') && !light, receive: !light });
      if (mesh) { mesh.userData.matKey = k; if (k.includes('glass')) mesh.renderOrder = 2; if (k.startsWith('glow')) { mesh.renderOrder = 3; mesh.userData.noAO = true; } group.add(mesh); }
    }
  }
}

const FLOOR_MAT = { wood: 'floor_wood', marble: 'floor_marble', tile: 'floor_tile', deck: 'floor_deck', stone: 'floor_stone', grass: 'floor_grass', concrete: 'floor_concrete', terrazzo: 'floor_terrazzo' };
const WALL_MAT = { plaster: 'wall', compound: 'wall_ext', parapet: 'wall_ext', glass: 'glass' };

function addOpeningDetails(bucket, group, M, house, L, w) {
  const axis = wallAxis(w); const H = wallHeight(house, L, w);
  const b1 = axis === 'x' ? w.z1 : w.x1; const b2 = axis === 'x' ? w.z2 : w.x2; const mid = (b1 + b2) / 2; const th = b2 - b1;
  const y0 = L.y + (w.y0 ?? 0);
  const B = (a1, a2, c1, c2, yb, yt, key) => {
    const g = axis === 'x' ? worldBox(a1, y0 + yb, c1, a2, y0 + yt, c2) : worldBox(c1, y0 + yb, a1, c2, y0 + yt, a2);
    bucket.add(key, g);
  };
  for (const o0 of w.openings || []) {
    const o = openingWithDefaults(house, o0); const f = o.from, t = o.to; const fr = 0.12;
    if (['window', 'vent', 'glazing', 'slide'].includes(o.type)) {
      const head = Math.min(o.head, H);
      B(f, f + fr, mid - 0.1, mid + 0.1, o.sill, head, 'frame'); B(t - fr, t, mid - 0.1, mid + 0.1, o.sill, head, 'frame');
      B(f, t, mid - 0.1, mid + 0.1, head - fr, head, 'frame');
      if (o.sill > 0) B(f - 0.1, t + 0.1, b1 - 0.08, b2 + 0.08, o.sill - 0.08, o.sill, 'counter');
      else B(f, t, mid - 0.1, mid + 0.1, 0, fr * 0.5, 'frame');
      const span = t - f; const n = Math.max(1, Math.round(span / (o.type === 'glazing' ? 4 : 3)));
      for (let i = 1; i < n; i++) { const a = f + (span / n) * i; B(a - 0.05, a + 0.05, mid - 0.08, mid + 0.08, o.sill, head, 'frame'); }
      if (o.type === 'slide') B(f + span * 0.5 - 0.06, f + span * 0.5 + 0.06, mid + 0.04, mid + 0.14, 0, head, 'frame');
    }
    if (o.type === 'door' || o.type === 'door2') {
      // frame (architrave) and an open leaf rotated 90deg into the +normal side
      B(f, f + 0.12, b1 - 0.04, b2 + 0.04, 0, o.head, 'door'); B(t - 0.12, t, b1 - 0.04, b2 + 0.04, 0, o.head, 'door');
      B(f, t, b1 - 0.04, b2 + 0.04, o.head - 0.12, o.head, 'door');
      const leaves = o.type === 'door2' ? [[f + 0.12, 1], [t - 0.12, -1]] : [[f + 0.12, 1]];
      const lw = (t - f - 0.24) / leaves.length;
      for (const [hinge] of leaves) {
        const geo = axis === 'x'
          ? worldBox(hinge - 0.08, y0, b2, hinge + 0.08, y0 + o.head - 0.14, b2 + lw)
          : worldBox(b2, y0, hinge - 0.08, b2 + lw, y0 + o.head - 0.14, hinge + 0.08);
        bucket.add('door', geo);
      }
    }
  }
  void th; void group;
}

/** Box sheared along x so its bottom/top follow a stair pitch: y += slope * (x - x1). */
function slopedBox(x1, x2, yAtX1, slope, h, z1, z2, yOff = 0) {
  const g = worldBox(x1, yAtX1 + yOff, z1, x2, yAtX1 + yOff + h, z2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + slope * (p.getX(i) - x1));
  g.computeVertexNormals();
  return g;
}

function buildStairs(house, M, bucket, s) {
  const st = house.stairs; const n = st.risersPerFlight; const R = 10.5 / 2 / n; const T = (st.runX2 - st.runX1) / n;
  const flight = (fl, up) => {
    for (let i = 0; i < n; i++) {
      const x1 = up ? fl.x1 + i * T : fl.x2 - (i + 1) * T; const x2 = x1 + T;
      const top = (up ? fl.yAtX1 : fl.yAtX2) + (i + 1) * R;
      bucket.add('floor_marble', worldBox(x1, top - 0.12, fl.z1, x2, top, fl.z2));
      bucket.add('ceiling', worldBox(x1, top - R - 0.12, fl.z1 + 0.05, x2, top - 0.12, fl.z2 - 0.05));
    }
    // sloped waist slab (soffit), glass balustrade and handrail along the well side
    const slope = (fl.yAtX2 - fl.yAtX1) / (fl.x2 - fl.x1);
    bucket.add('ceiling', slopedBox(fl.x1, fl.x2, fl.yAtX1, slope, 0.55, fl.z1 + 0.05, fl.z2 - 0.05, -0.9));
    const zEdge = up ? fl.z2 - 0.06 : fl.z1 + 0.06;
    bucket.add('rail_glass', slopedBox(fl.x1, fl.x2, fl.yAtX1, slope, 3.0, zEdge - 0.02, zEdge + 0.02, 0.2));
    bucket.add('metal', slopedBox(fl.x1, fl.x2, fl.yAtX1, slope, 0.1, zEdge - 0.06, zEdge + 0.06, 3.2));
  };
  flight(s.flight1, true); flight(s.flight2, false);
  const l = s.landing;
  bucket.add('floor_marble', worldBox(l.x1, l.y - 0.12, l.z1, l.x2, l.y, l.z2));
  bucket.add('ceiling', worldBox(l.x1, l.y - 0.6, l.z1, l.x2, l.y - 0.12, l.z2));
  bucket.add('rail_glass', worldBox(l.x1 - 0.04, l.y, st.wellZ[0], l.x1 + 0.04, l.y + 3.2, st.wellZ[1]));
  bucket.add('metal', worldBox(l.x1 - 0.06, l.y + 3.2, st.wellZ[0], l.x1 + 0.06, l.y + 3.3, st.wellZ[1]));
}

function glowQuad(bucket, x1, x2, y1, y2, z, key = 'glow') {
  const g = new THREE.PlaneGeometry(x2 - x1, y2 - y1); g.translate((x1 + x2) / 2, (y1 + y2) / 2, z); bucket.add(key, g);
}
function buildFeature(group, bucket, M, L, f) {
  if (f.type === 'fins') {
    // vertical timber/bronze fins with an uplight wash on each fin (as the reference elevation)
    const y1 = L.y + f.y1, y2 = L.y + f.y2; const zc = (f.z1 + f.z2) / 2;
    for (let x = f.x1 + 0.12; x < f.x2 - 0.05; x += f.spacing) {
      bucket.add('fin_wood', worldBox(x - 0.12, y1, f.z1, x + 0.12, y2, f.z2));
      bucket.add('fixture', worldBox(x - 0.08, y1, f.z2, x + 0.08, y1 + 0.12, f.z2 + 0.1));
      glowQuad(bucket, x - 0.3, x + 0.3, y1, y1 + 7.5, f.z2 + 0.02);
    }
    bucket.add('gate_metal', worldBox(f.x1, y1 - 0.05, f.z1 - 0.05, f.x2, y1 + 0.08, f.z2 + 0.05));
    bucket.add('gate_metal', worldBox(f.x1, y2 - 0.1, f.z1 - 0.05, f.x2, y2, f.z2 + 0.05));
    for (const yy of [y1 + 10.0]) bucket.add('gate_metal', worldBox(f.x1, yy, zc - 0.05, f.x2, yy + 0.1, zc + 0.05));
  }
  if (f.type === 'jali_panel') {
    const y1 = L.y + f.y1, y2 = L.y + f.y2; const alongZ = (f.z2 - f.z1) > (f.x2 - f.x1);
    const len = alongZ ? f.z2 - f.z1 : f.x2 - f.x1; const H = y2 - y1;
    const geo = new THREE.PlaneGeometry(len, H);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * H);
    const m = new THREE.Mesh(geo, M.jali);
    if (alongZ) { m.rotation.y = Math.PI / 2; m.position.set((f.x1 + f.x2) / 2, (y1 + y2) / 2, (f.z1 + f.z2) / 2); }
    else m.position.set((f.x1 + f.x2) / 2, (y1 + y2) / 2, (f.z1 + f.z2) / 2);
    m.castShadow = true; m.receiveShadow = true;
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: M.jali.alphaMap, alphaTest: 0.5 });
    group.add(m);
    if (alongZ) {
      for (const [a1, a2, b1, b2] of [[f.z1 - 0.12, f.z1, y1, y2], [f.z2, f.z2 + 0.12, y1, y2], [f.z1 - 0.12, f.z2 + 0.12, y2 - 0.12, y2], [f.z1 - 0.12, f.z2 + 0.12, y1, y1 + 0.12]]) bucket.add('gate_metal', worldBox(f.x1, b1, a1, f.x2, b2, a2));
      for (let z = f.z1 + 2.2; z < f.z2 - 1; z += 2.2) bucket.add('gate_metal', worldBox(f.x1, y1, z - 0.05, f.x2, y2, z + 0.05));
      const gq = new THREE.PlaneGeometry(len, 4); gq.rotateY(-Math.PI / 2); gq.translate(f.x1 - 0.03, y1 + 2, (f.z1 + f.z2) / 2); bucket.add('glow', gq);
    } else {
      for (const [a1, a2, b1, b2] of [[f.x1 - 0.12, f.x1, y1, y2], [f.x2, f.x2 + 0.12, y1, y2], [f.x1 - 0.12, f.x2 + 0.12, y2, y2 + 0.12], [f.x1 - 0.12, f.x2 + 0.12, y1, y1 + 0.12]]) bucket.add('gate_metal', worldBox(a1, b1, f.z1, a2, b2, f.z2));
      glowQuad(bucket, f.x1, f.x2, y1, y1 + 4, f.z1 - 0.03);
    }
  }
  if (f.type === 'proj_balcony') {
    // dark fascia band, LED wash along the railing base and downlights in the soffit (as the reference)
    const y = L.y;
    bucket.add('ext_frame', worldBox(f.x1 - 0.05, y - 0.75, f.z2 - 0.05, f.x2 + 0.05, y + 0.12, f.z2 + 0.05));
    for (const x of [f.x1, f.x2]) bucket.add('ext_frame', worldBox(x - 0.05, y - 0.75, f.z1, x + 0.05, y + 0.12, f.z2));
    glowQuad(bucket, f.x1 + 0.2, f.x2 - 0.2, y + 0.12, y + 2.6, f.z2 - 0.25);
    for (let x = f.x1 + 1.6; x < f.x2 - 1; x += 3.2) { const g = new THREE.CylinderGeometry(0.15, 0.15, 0.03, 12); g.translate(x, y - 0.77, (f.z1 + f.z2) / 2 + 0.6); bucket.add('fixture', g); }
  }
  if (f.type === 'pergola') {
    const y = L.y; const h = f.h;
    const posts = f.posts ? [[f.x1 + 0.3, f.z1 + 0.3], [f.x2 - 0.3, f.z1 + 0.3], [f.x1 + 0.3, f.z2 - 0.3], [f.x2 - 0.3, f.z2 - 0.3]] : [[f.x1 + 0.3, f.z2 - 0.3], [f.x2 - 0.3, f.z2 - 0.3]];
    for (const [x, z] of posts) bucket.add('ext_frame', worldBox(x - 0.3, y, z - 0.3, x + 0.3, y + h, z + 0.3));
    if (f.slats === 'x') for (let z = f.z1 + 0.9; z < f.z2 - 0.6; z += 1.25) bucket.add('wood_clad', worldBox(f.x1, y + h - 0.6, z - 0.12, f.x2, y + h, z + 0.12));
    else for (let x = f.x1 + 0.6; x < f.x2; x += 1.25) bucket.add('wood_clad', worldBox(x - 0.12, y + h - 0.6, f.z1, x + 0.12, y + h, f.z2));
    bucket.add('ext_frame', worldBox(f.x1, y + h, f.z2 - 0.6, f.x2, y + h + 0.5, f.z2));
    if (f.posts) {
      bucket.add('ext_frame', worldBox(f.x1, y + h, f.z1, f.x2, y + h + 0.5, f.z1 + 0.6));
      bucket.add('ext_frame', worldBox(f.x1, y + h - 0.6, f.z1, f.x1 + 0.6, y + h, f.z2)); bucket.add('ext_frame', worldBox(f.x2 - 0.6, y + h - 0.6, f.z1, f.x2, y + h, f.z2));
      for (const [x, z] of posts) { const g = new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12); g.translate(x + (x < (f.x1 + f.x2) / 2 ? 1.2 : -1.2), y + h - 0.62, z + (z < (f.z1 + f.z2) / 2 ? 1.2 : -1.2)); bucket.add('fixture', g); }
    }
  }
  if (f.type === 'jali') {
    const geo = new THREE.PlaneGeometry(f.x2 - f.x1, f.y2 - f.y1);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (f.x2 - f.x1), uv.getY(i) * (f.y2 - f.y1));
    const m = new THREE.Mesh(geo, M.jali); m.position.set((f.x1 + f.x2) / 2, L.y + (f.y1 + f.y2) / 2, f.z);
    m.castShadow = true; m.receiveShadow = true;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: M.jali.alphaMap, alphaTest: 0.5 });
    m.customDepthMaterial = depth; group.add(m);
    bucket.add('wall_ext', worldBox(f.x1, L.y + f.y1, f.z - 0.15, f.x2, L.y + f.y1 + 0.3, f.z + 0.15));
  }
}

/** Cladding skins on the outward faces of walls that separate an indoor room from the outside. */
function addSkins(bucket, house, L) {
  const T = 0.05;
  const outside = (x, z) => { const r = roomAt(L, x, z); return !r || r.outdoor; };
  for (const w of L.walls) {
    if (w.mat) continue;
    const axis = wallAxis(w);
    for (const p of wallPieces(house, L, w)) {
      if (p.kind === 'glass') continue;
      const m = axis === 'x' ? (p.x1 + p.x2) / 2 : (p.z1 + p.z2) / 2;
      const sides = axis === 'x' ? [[-1, outside(m, p.z1 - 0.6)], [1, outside(m, p.z2 + 0.6)]] : [[-1, outside(p.x1 - 0.6, m)], [1, outside(p.x2 + 0.6, m)]];
      // every face that is seen from outside gets the dark exterior finish (stone on street-facing faces)
      for (const [dir, out] of sides) {
        if (!out) continue;
        const key = axis === 'x' && dir > 0 ? 'ext_stone' : 'ext_dark';
        if (axis === 'x') bucket.add(key, dir > 0 ? worldBox(p.x1, p.y1, p.z2, p.x2, p.y2, p.z2 + T) : worldBox(p.x1, p.y1, p.z1 - T, p.x2, p.y2, p.z1));
        else bucket.add(key, dir > 0 ? worldBox(p.x2, p.y1, p.z1, p.x2 + T, p.y2, p.z2) : worldBox(p.x1 - T, p.y1, p.z1, p.x1, p.y2, p.z2));
      }
    }
  }
  // dark soffits under slab areas that are open-air below (balcony / porch / overhang undersides seen from outside)
  const li = house.levels.indexOf(L); const below = house.levels[li - 1];
  if (below && !L.slab.ground) {
    const xs = new Set(), zs = new Set();
    for (const r of [...L.slab.rects, ...L.slab.holes, ...below.rooms.flatMap((q) => q.rects)]) { xs.add(r[0]); xs.add(r[2]); zs.add(r[1]); zs.add(r[3]); }
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b); const yS = L.y - house.defaults.slabThickness;
    for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      if (!L.slab.rects.some((r) => pointInRect(r, cx, cz)) || L.slab.holes.some((r) => pointInRect(r, cx, cz))) continue;
      const rb = roomAt(below, cx, cz); if (rb && !rb.outdoor) continue;
      if (rb && ['porch', 'parking'].includes(rb.type) && li === 1) continue; // timber soffits already there
      bucket.add('ext_dark', worldBox(X[i], yS - 0.03, Z[j], X[i + 1], yS - 0.01, Z[j + 1]));
    }
  }
  // dark bands on exposed slab edges
  if (!L.slab.ground) {
    const cells = decomposeRects(L.slab.rects, L.slab.holes); const y1 = L.y - house.defaults.slabThickness, y2 = L.y;
    const solid = (x, z) => L.slab.rects.some((r) => pointInRect(r, x, z)) && !L.slab.holes.some((r) => pointInRect(r, x, z, 0.01));
    const inHole = (x, z) => L.slab.holes.some((r) => pointInRect(r, x, z, 0.01));
    for (const r of cells) {
      const sides = [[r[0], r[1], r[2], r[1], 0, -1], [r[0], r[3], r[2], r[3], 0, 1], [r[0], r[1], r[0], r[3], -1, 0], [r[2], r[1], r[2], r[3], 1, 0]];
      for (const [ax, az, bx, bz, nx, nz] of sides) {
        const mx = (ax + bx) / 2 + nx * 0.05, mz = (az + bz) / 2 + nz * 0.05;
        if (solid(mx, mz) || inHole(mx, mz)) continue;
        bucket.add('ext_frame', nz ? worldBox(ax, y1 - 0.02, Math.min(az, az + nz * 0.04), bx, y2 + 0.02, Math.max(az, az + nz * 0.04)) : worldBox(Math.min(ax, ax + nx * 0.04), y1 - 0.02, az, Math.max(ax, ax + nx * 0.04), y2 + 0.02, bz));
      }
    }
  }
}

/** Custom geometry: wedge under the roof frame's left end whose soffit rises from the building to the thin outer edge. */
function wedgeGeometry(x1, x2, z1, z2, yTop, yOuter, yInner) {
  // vertices: outer edge at x1 (yOuter..yTop), inner at x2 (yInner..yTop)
  const v = [
    [x1, yOuter, z1], [x2, yInner, z1], [x2, yInner, z2], [x1, yOuter, z2], // soffit (bottom)
    [x1, yTop, z1], [x2, yTop, z1], [x2, yTop, z2], [x1, yTop, z2]
  ];
  const quads = { soffit: [0, 1, 2, 3], front: [3, 2, 6, 7], back: [0, 4, 5, 1], inner: [1, 5, 6, 2] };
  const out = {};
  for (const [k, [a, b, c, d]] of Object.entries(quads)) {
    const pos = [...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const uv = []; for (let i = 0; i < 6; i++) { const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; uv.push(k === 'soffit' ? p[2] : k === 'inner' ? p[2] : p[0], k === 'soffit' ? p[0] : p[1]); }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); out[k] = g;
  }
  return out;
}
/** Sloped soffit panel spanning x1..x2, from (zBack, yBack) up to (zFront, yFront). Faces down. */
function slopedSoffit(x1, x2, zBack, yBack, zFront, yFront) {
  const pos = [x1, yBack, zBack, x2, yBack, zBack, x2, yFront, zFront, x1, yBack, zBack, x2, yFront, zFront, x1, yFront, zFront];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < 6; i++) uv.push(pos[i * 3 + 2], pos[i * 3]); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
function downlight(bucket, x, y, z) { const g = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12); g.translate(x, y - 0.015, z); bucket.add('fixture', g); }

function plaqueMaterial() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#1c1d1f'; x.fillRect(0, 0, 256, 160); x.strokeStyle = '#b8975a'; x.lineWidth = 4; x.strokeRect(8, 8, 240, 144);
  x.fillStyle = '#e3c79b'; x.font = '600 40px Georgia, serif'; x.textAlign = 'center'; x.fillText('TANDON', 128, 95);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.3, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.15 });
}

/** Slatted gate leaf: black frame with vertical timber slats. Leaf spans local x 0..w, hinged at x=0. */
function gateLeaf(bucket, w, h, place) {
  const parts = [[0, 0.15, 0, w, 0.25], [0, h - 0.25, 0, w, h], [0, 0.15, 0, 0.18, h], [w - 0.18, 0.15, 0, w, h], [0, h * 0.5 - 0.06, 0, w, h * 0.5 + 0.06]];
  for (const [a, y1, , b, y2] of parts) bucket.add('gate_metal', place(a, y1, -0.08, b, y2, 0.08));
  for (let x = 0.3; x < w - 0.25; x += 0.42) bucket.add('wood_clad', place(x, 0.3, -0.05, x + 0.26, h - 0.3, 0.05));
}

function buildExterior(house, M) {
  const group = new THREE.Group(); group.name = 'exterior';
  const bucket = new Bucket();
  const g = house.site.ground;
  // ground (grass) and road
  bucket.add('floor_grass', floorPlane(g[0], g[1], g[2], house.site.road.z1, -0.02));
  const rz1 = house.site.road.z1; const sw = house.site.road.sidewalk;
  bucket.add('sidewalk', worldBox(g[0], -0.3, rz1, g[2], 0.0, rz1 + sw));
  const road = floorPlane(g[0], rz1 + sw, g[2], house.site.road.z2, -0.25); bucket.add('road', road);
  for (let x = g[0]; x < g[2]; x += 10) bucket.add('ceramic', worldBox(x, -0.24, rz1 + sw + 11, x + 5, -0.22, rz1 + sw + 11.4));
  bucket.add('grass_far', floorPlane(g[0] - 200, g[1] - 200, g[2] + 200, house.site.road.z2 + 200, -0.4));
  const ex = house.exterior;
  const upper = new THREE.Group(); upper.name = 'exterior-upper'; const ub = new Bucket();
  // --- terrace-level roof frame with slanted timber soffit (architect's render + client reference)
  if (ex.eave) {
    const e = ex.eave; const w = e.wedge;
    ub.add('ext_frame', worldBox(e.x1, e.top - e.plate, e.zBack, e.x2, e.top, e.zFront));
    ub.add('ext_frame', worldBox(e.x1, e.soffitOuter, e.zFront - 0.25, e.x2, e.top - e.plate, e.zFront));
    ub.add('wood_clad', slopedSoffit(w.x2, ex.frameRight ? ex.frameRight.x1 : e.x2, e.zBack, e.soffitInner, e.zFront - 0.25, e.soffitOuter));
    ub.add('ext_frame', worldBox(w.x2, e.soffitInner, e.zBack - 0.05, ex.frameRight ? ex.frameRight.x1 : e.x2, e.top - e.plate, e.zBack));
    ub.add('ext_frame', worldBox(w.x1, e.top - e.plate, w.z1, w.x2, e.top, e.zBack));
    const wg = wedgeGeometry(w.x1, w.x2, w.z1, e.zFront - 0.25, e.top - e.plate, w.outer, w.inner);
    ub.add('wood_clad', wg.soffit); ub.add('wood_clad', wg.front); ub.add('ext_frame', wg.back); ub.add('ext_frame', wg.inner);
    ub.add('ext_frame', worldBox(w.x1 - 0.05, w.outer, w.z1, w.x1, e.top, e.zFront));
    const span = (ex.frameRight ? ex.frameRight.x1 : e.x2) - w.x2;
    for (let i = 0; i < 7; i++) {
      const x = w.x2 + (span * (i + 0.5)) / 7; const z = e.zBack + (e.zFront - e.zBack) * 0.45;
      downlight(ub, x, e.soffitInner + (e.soffitOuter - e.soffitInner) * 0.45, z);
    }
    for (let i = 0; i < 2; i++) downlight(ub, w.x1 + 1.2 + i * 1.6, w.outer + (w.inner - w.outer) * ((1.2 + i * 1.6) / (w.x2 - w.x1)), e.zFront - 3);
    // planted edge on the frame top (outside the terrace railing), as rendered
    const tg = new THREE.Group();
    for (let x = e.x1 + 3; x < e.x2 - 2; x += 3.4) tg.add(buildFurniture({ type: 'planter', x, z: e.zFront - 1.0, w: 2.6, d: 0.9, rot: 0 }, M, e.top, 300 + Math.round(x)));
    upper.add(mergeStatic(tg));
  }
  if (ex.frameRight) {
    const f = ex.frameRight;
    ub.add('ext_frame', worldBox(f.x1 + 0.12, f.y1, f.z1, f.x2, f.y2, f.z2));
    ub.add('wood_clad', worldBox(f.x1, f.y1, f.z1, f.x1 + 0.12, f.y2 - 0.6, f.z2 - 0.1));
    const gq = new THREE.PlaneGeometry(f.z2 - f.z1, 6); gq.rotateY(-Math.PI / 2); gq.translate(f.x1 - 0.03, f.y1 + 3, (f.z1 + f.z2) / 2); ub.add('glow', gq);
  }
  if (ex.fin) { const f = ex.fin; ub.add('wood_clad', worldBox(f.x1, f.y1, f.z1, f.x2, f.y2, f.z2)); }
  ub.flush(upper, M); group.userData.upper = upper;

  // --- first-floor balcony slab: dark fascia, trailing planter, timber soffit with downlights over porch & parking
  if (ex.fascia) for (const r of ex.fascia) bucket.add('ext_frame', worldBox(r[0], ex.fasciaY[0], r[1], r[2], ex.fasciaY[1], r[3]));
  if (ex.soffits) for (const r of ex.soffits) {
    const flip = new THREE.PlaneGeometry(r[2] - r[0], r[3] - r[1]); flip.rotateX(Math.PI / 2); flip.translate((r[0] + r[2]) / 2, ex.soffitY, (r[1] + r[3]) / 2);
    const uv = flip.attributes.uv; const p = flip.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getZ(i), p.getX(i));
    bucket.add('wood_clad', flip);
    const nx = Math.max(1, Math.round((r[2] - r[0]) / 6)), nz = Math.max(1, Math.round((r[3] - r[1]) / 6));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) downlight(bucket, r[0] + ((r[2] - r[0]) * (i + 0.5)) / nx, ex.soffitY, r[1] + ((r[3] - r[1]) * (j + 0.5)) / nz);
  }
  const deco = new THREE.Group();
  if (ex.ledgePlanter) {
    const l = ex.ledgePlanter;
    bucket.add('ext_frame', worldBox(l.x1, l.y, l.z1, l.x2, l.y + 1.0, l.z2));
    for (let x = l.x1 + 1.2; x < l.x2 - 0.8; x += 2.6) deco.add(buildFurniture({ type: 'planter', x, z: (l.z1 + l.z2) / 2, w: 2.2, d: 0.6, rot: 0 }, M, l.y + 0.1, 400 + Math.round(x)));
  }
  for (const [x, z] of ex.fans || []) deco.add(buildFurniture({ type: 'ceiling_fan', x, z, w: 4, d: 4, rot: 0, ceil: ex.soffitY }, M, 0, 7));

  // --- front boundary: stone pillars, slatted panels, planter with uplights; gates
  const fe = ex.fence; const fw = house.levels[0].walls.find((w) => w.mat === 'fence');
  if (fe && fw) {
    const z1 = fw.z1, z2 = fw.z2; const solidTo = Math.min(...(fw.openings || []).map((o) => o.from));
    const pillar = (x1, x2, h) => { bucket.add('ext_stone', worldBox(x1, 0, z1 - 0.1, x2, h, z2 + 0.1)); bucket.add('ext_frame', worldBox(x1 - 0.04, h, z1 - 0.14, x2 + 0.04, h + 0.15, z2 + 0.14)); };
    const n = Math.max(1, Math.round((solidTo - fw.x1 - fe.pillar) / fe.pitch)); const step = (solidTo - fw.x1 - fe.pillar) / n;
    for (let i = 0; i < n; i++) {
      const px1 = fw.x1 + i * step, px2 = px1 + fe.pillar, nx = fw.x1 + (i + 1) * step;
      pillar(px1, px2, fe.h);
      bucket.add('ext_dark', worldBox(px2, 0, z1 + 0.15, nx, fe.panelY[0], z2 - 0.15));
      const zc = (z1 + z2) / 2; const h = fe.panelY[1] - fe.panelY[0];
      gateLeaf(bucket, nx - px2, h, (a, y1, c, b, y2, d) => worldBox(px2 + a, fe.panelY[0] + y1, zc + c, px2 + b, fe.panelY[0] + y2, zc + d));
      glowQuad(bucket, px2 + 0.2, nx - 0.2, 0.1, 4.0, z2 + 0.12);
    }
    pillar(solidTo - fe.pillar, solidTo, fe.h);
    // number pillar (stone) with vertical wall light and name plaque
    if (ex.numberPillar) {
      const [a1, b1, a2, b2] = ex.numberPillar; bucket.add('ext_stone', worldBox(a1, 0, b1 - 0.1, a2, fe.h + 0.4, b2 + 0.1));
      bucket.add('ext_frame', worldBox(a1 - 0.04, fe.h + 0.4, b1 - 0.14, a2 + 0.04, fe.h + 0.55, b2 + 0.14));
      bucket.add('lamp', worldBox((a1 + a2) / 2 - 0.05, 4.3, b2 + 0.1, (a1 + a2) / 2 + 0.05, 5.4, b2 + 0.16));
      glowQuad(bucket, a1 + 0.02, a2 - 0.02, 3.2, 6.6, b2 + 0.17);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), plaqueMaterial()); plaque.position.set((a1 + a2) / 2, 3.6, b2 + 0.17); group.add(plaque);
    }
    // end pillar at the east boundary
    pillar(fw.x2, fw.x2 + 0.75, fe.h);
    if (fe.planter) {
      const [p1, q1, p2, q2] = fe.planter; bucket.add('ext_frame', worldBox(p1, 0, q1, p2, 1.3, q2)); bucket.add('soil', worldBox(p1 + 0.1, 1.22, q1 + 0.1, p2 - 0.1, 1.27, q2 - 0.1));
      for (let px = p1 + 1.0; px < p2 - 0.6; px += 2.1) deco.add(buildFurniture({ type: 'plant', x: px, z: (q1 + q2) / 2, w: 1.3, d: 1.3, rot: 0 }, M, 0.1, 500 + Math.round(px * 3)));
      for (let px = p1 + 0.6; px < p2; px += 4.15) bucket.add('fixture', worldBox(px - 0.08, 1.3, q2 - 0.25, px + 0.08, 1.36, q2 - 0.1));
    }
  }
  const P = (x0, zc, hinge, ang) => (a, y1, c, b, y2, d) => {
    // leaf local x along gate, rotated about the hinge (x0) by ang (radians, +ve opens inward to -z)
    const g3 = worldBox(a, y1, c, b, y2, d); g3.rotateY(hinge * ang); g3.translate(x0, 0, zc); return g3;
  };
  if (ex.pedGate) {
    const gt = ex.pedGate; const w = (gt.x2 - gt.x1) / 2;
    gateLeaf(bucket, w, gt.h, (a, y1, c, b, y2, d) => { const g3 = worldBox(a, y1, c, b, y2, d); g3.rotateY(1.25); g3.translate(gt.x1, 0, gt.z); return g3; });
    gateLeaf(bucket, w, gt.h, (a, y1, c, b, y2, d) => { const g3 = worldBox(-b, y1, c, -a, y2, d); g3.rotateY(-1.25); g3.translate(gt.x2, 0, gt.z); return g3; });
  }
  if (ex.carGate) {
    const gt = ex.carGate; const w = (gt.x2 - gt.x1) / 2;
    gateLeaf(bucket, w - 0.05, gt.h, P(gt.x1, gt.z, 1, 0));
    gateLeaf(bucket, w - 0.05, gt.h, P(gt.x1 + w + 0.05, gt.z, 1, 0));
  }
  // simple neighbour masses for context
  bucket.add('neighbor', worldBox(-30, 0, -2, -1.5, 24, 45));
  bucket.add('neighbor', worldBox(42.5, 0, -2, 72, 18, 44));
  bucket.flush(group, M);
  // trees & palms
  const tg = new THREE.Group();
  (ex.trees || []).forEach(([x, z], i) => tg.add(buildFurniture({ type: 'tree', x, z, w: 1, d: 1, rot: 0, canopy: 7 }, M, 0, 100 + i)));
  (ex.palms || []).forEach(([x, z], i) => tg.add(buildFurniture({ type: 'palm', x, z, w: 1, d: 1, rot: 0, h: 17 + (i % 3) * 3 }, M, 0, 200 + i)));
  tg.add(deco);
  group.add(mergeStatic(tg));
  return group;
}

/**
 * Builds the whole house. Returns per-level groups so the UI can hide/show storeys.
 */
export function buildHouse(house, M) {
  const levelGroups = []; const fixtures = []; const floorsByRoom = new Map(); const windowLights = []; const probes = [];
  const services = buildServices(house, serviceMaterials());
  const roomArea = (r) => r.rects.reduce((a, q) => a + rectArea(q), 0);
  const stairs = stairGeometry(house);
  house.levels.forEach((L, li) => {
    const group = new THREE.Group(); group.name = L.id; group.userData.li = li;
    const bucket = new Bucket();
    // slab (top at L.y, underside = ceiling of level below)
    if (!L.slab.ground) for (const r of decomposeRects(L.slab.rects, L.slab.holes)) bucket.add('ceiling', worldBox(r[0], L.y - house.defaults.slabThickness, r[1], r[2], L.y, r[3]));
    // room floors
    for (const room of L.rooms) {
      if (room.floor === 'none') continue;
      const key = FLOOR_MAT[room.floor] || 'floor_concrete';
      const geos = room.rects.map((r) => floorPlane(r[0], r[1], r[2], r[3], L.y + 0.015));
      const mesh = mergedMesh(geos, M[key], { cast: false });
      mesh.userData.room = room.id; group.add(mesh); floorsByRoom.set(room.id, mesh);
    }
    // walls
    addSkins(bucket, house, L);
    for (const w of L.walls) {
      if (w.mat === 'gate') continue; // rendered as slatted gate leaves in the exterior
      if (w.mat === 'fence') { for (const p of wallPieces(house, L, w)) if (p.y2 - p.y1 > 0.01) bucket.add('ext_dark', worldBox(p.x1, p.y1, p.z1 + 0.15, p.x2, Math.min(p.y2, p.y1 + 1.2), p.z2 - 0.15)); continue; }
      for (const p of wallPieces(house, L, w)) {
        const key = p.kind === 'glass' ? 'glass' : (WALL_MAT[p.kind] || 'wall');
        bucket.add(key, worldBox(p.x1, p.y1, p.z1, p.x2, p.y2, p.z2));
      }
      addOpeningDetails(bucket, group, M, house, L, w);
      // skirting on plaster walls
      if (!w.mat || w.mat === 'plaster') {
        const axis = wallAxis(w);
        if (axis === 'x') { bucket.add('cabinet', worldBox(w.x1, L.y, w.z1 - 0.03, w.x2, L.y + 0.3, w.z2 + 0.03)); }
        else { bucket.add('cabinet', worldBox(w.x1 - 0.03, L.y, w.z1, w.x2 + 0.03, L.y + 0.3, w.z2)); }
      }
    }
    // railings
    for (const r of L.railings || []) {
      const h = r.h ?? house.defaults.railingHeight;
      bucket.add('rail_glass', worldBox(r.x1, L.y, r.z1, r.x2, L.y + h, r.z2));
      const along = (r.x2 - r.x1) > (r.z2 - r.z1);
      bucket.add('metal', along ? worldBox(r.x1, L.y + h, r.z1 - 0.04, r.x2, L.y + h + 0.1, r.z2 + 0.04) : worldBox(r.x1 - 0.04, L.y + h, r.z1, r.x2 + 0.04, L.y + h + 0.1, r.z2));
    }
    // stairs that start on this level
    for (const s of stairs.filter((s) => s.level === L.id)) buildStairs(house, M, bucket, s);
    // features
    for (const f of L.features || []) buildFeature(group, bucket, M, L, f);
    bucket.flush(group, M);
    // furniture
    const fgroup = new THREE.Group(); fgroup.name = 'furniture-' + L.id;
    (L.furniture || []).forEach((f, i) => fgroup.add(buildFurniture(f, M, L.y, 1000 + li * 100 + i)));
    fgroup.add(buildCurtains(house, L, M, L.furniture || []));
    group.add(mergeStatic(fgroup));
    windowLights.push(...windowLightCandidates(house, L, li));
    const indoor = L.rooms.filter((r) => isIndoor(r) && r.accessible !== false && r.type !== 'void');
    const pr = indoor.find((r) => r.type === 'living') || indoor.sort((a, b) => roomArea(b) - roomArea(a))[0];
    if (pr) { const [px, pz] = roomAnchor(pr); probes.push({ li, x: px, y: L.y + 5.0, z: pz, room: pr.id }); }
    // ceiling fixtures
    const fixGeos = [];
    for (const room of L.rooms) {
      if (room.light === false || room.type === 'void' || room.type === 'shaft') continue;
      if (room.outdoor && !['porch', 'balcony'].includes(room.type)) continue;
      const ceil = L.y + (L.wallHeight ?? 10) - 0.02;
      for (const r of room.rects) {
        const w = r[2] - r[0], d = r[3] - r[1]; if (w < 2 || d < 2) continue;
        const nx = Math.max(1, Math.round(w / 5.5)), nz = Math.max(1, Math.round(d / 5.5));
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const x = r[0] + (w / nx) * (i + 0.5), z = r[1] + (d / nz) * (j + 0.5);
          if (L.slab.holes.some((h) => x > h[0] && x < h[2] && z > h[1] && z < h[3])) continue;
          if ((services.cassettesByLevel.get(li) || []).some((u) => Math.hypot(u.x - x, u.z - z) < 2.4)) continue;
          const g = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16); g.translate(x, ceil, z); fixGeos.push(g);
        }
      }
      const [ax, az] = roomAnchor(room);
      fixtures.push({ li, room: room.id, x: ax, z: az, y: L.y + (L.wallHeight ?? 10) - 0.9, area: room.rects.reduce((a, r) => a + rectArea(r), 0), outdoor: !!room.outdoor });
    }
    const fx = mergedMesh(fixGeos, M.fixture, { cast: false, receive: false }); if (fx) group.add(fx);
    group.add(services.perLevel[li]);
    levelGroups.push(group);
  });
  // terrace room roof
  const roofGroup = new THREE.Group(); roofGroup.name = 'roof';
  const rb = new Bucket();
  for (const r of house.roof.rects) rb.add('ceiling', worldBox(r[0], house.roof.y - 0.5, r[1], r[2], house.roof.y, r[3]));
  for (const r of house.roof.rects) rb.add('wall_ext', worldBox(r[0], house.roof.y, r[1], r[2], house.roof.y + 0.05, r[3]));
  rb.flush(roofGroup, M);
  roofGroup.add(services.roof);
  const exterior = buildExterior(house, M);
  return { levelGroups, roofGroup, exterior, exteriorUpper: exterior.userData.upper, fixtures, floorsByRoom, windowLights, probes, servicesOverlay: services.overlay,
    outdoorProbe: { x: 20.5, y: 6, z: 47.5 } };
}
