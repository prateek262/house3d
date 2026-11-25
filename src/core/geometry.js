// Pure geometry / navigation core. No three.js dependency so it can run in Node (validator) and the browser.
// Works in internal scene units (feet); see units.js for the metric <-> scene conversion.

// eye 5.25 ft = 1.60 m (standing eye height used for architectural walkthroughs)
export const PLAYER = { radius: 0.6, navRadius: 0.75, step: 1.25, bodyBottom: 0.5, bodyTop: 5.6, eye: 5.25 };

export const FURNITURE_SPECS = {
  sofa: { h: 2.8 }, armchair: { h: 2.8 }, coffee_table: { h: 1.4 }, tv_unit: { h: 1.6 },
  dining_table: { h: 2.6 }, bed: { h: 2.2 }, round_bed: { h: 2.0 }, nightstand: { h: 1.8 },
  wardrobe: { h: 8 }, dressing_table: { h: 2.6 }, desk: { h: 2.5 }, bookshelf: { h: 7 }, shelf: { h: 7 },
  counter: { h: 3 }, island: { h: 3 }, fridge: { h: 6 }, stool: { h: 2.4, collide: false },
  wc: { h: 1.4 }, basin: { h: 2.8 }, bathtub: { h: 1.8 }, shower: { h: 7, collide: false },
  plant: { h: 3 }, tree: { h: 15 }, rug: { h: 0.05, collide: false }, car: { h: 5 }, lounger: { h: 1.4 },
  outdoor_table: { h: 2.5 }, washing_machine: { h: 3 }, floor_lamp: { h: 5.5, collide: false },
  sideboard: { h: 2.8 }, bench: { h: 1.5 }, ottoman: { h: 1.4 }, chandelier: { h: 0, collide: false, overhead: true },
  pendant: { h: 0, collide: false, overhead: true }, wall_panel: { h: 9, collide: false }, planter: { h: 2 },
  sofa_l: { h: 2.8 }, laundry_unit: { h: 7.6 }, snooker_table: { h: 2.8 }, cue_rack: { h: 5.2, collide: false },
  punching_bag: { h: 6 }, treadmill: { h: 4.8 }, weight_bench: { h: 1.6 }, dumbbell_rack: { h: 2.6 },
  yoga_mat: { h: 0.05, collide: false }, gym_mat: { h: 0.05, collide: false }, mirror_wall: { h: 8, collide: false },
  side_table: { h: 1.8 }, art: { h: 0, collide: false, wallMounted: true },
  kitchen_run: { h: 7.6 }, tv_wall: { h: 0, collide: false, wallMounted: true }, fabric_panel: { h: 9, collide: false, wallMounted: true },
  ceiling_cove: { h: 0, collide: false, overhead: true }, rug_round: { h: 0.05, collide: false }, shoe_bench: { h: 1.6 }
};

const OPENING_PANE = new Set(['window', 'vent', 'glazing']);

export function rectArea(r) { return Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]); }
export function rectIntersect(a, b) {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] > r[0] && r[3] > r[1] ? r : null;
}
export function pointInRect(r, x, z, m = 0) { return x >= r[0] - m && x <= r[2] + m && z >= r[1] - m && z <= r[3] + m; }
export function boxRect(b) { return [b.x1, b.z1, b.x2, b.z2]; }

export function levelIndexById(house, id) { return house.levels.findIndex((l) => l.id === id); }

export function openingWithDefaults(house, o) {
  const d = house.defaults.openings[o.type] || { sill: 0, head: 7 };
  return { ...o, sill: o.sill ?? d.sill, head: o.head ?? d.head };
}

export function wallAxis(w) { return (w.x2 - w.x1) >= (w.z2 - w.z1) ? 'x' : 'z'; }
export function wallHeight(house, level, w) { return w.h ?? level.wallHeight ?? house.defaults.wallHeight; }

/**
 * Splits a wall into solid pieces around its openings plus thin glass panes.
 * Returned boxes are in absolute coordinates.
 */
export function wallPieces(house, level, w) {
  const H = wallHeight(house, level, w);
  const y0 = level.y + (w.y0 ?? 0);
  const axis = wallAxis(w);
  const a1 = axis === 'x' ? w.x1 : w.z1;
  const a2 = axis === 'x' ? w.x2 : w.z2;
  const b1 = axis === 'x' ? w.z1 : w.x1;
  const b2 = axis === 'x' ? w.z2 : w.x2;
  const mat = w.mat || 'plaster';
  const mk = (s, e, yb, yt, kind, c1 = b1, c2 = b2) => {
    const p = axis === 'x'
      ? { x1: s, x2: e, z1: c1, z2: c2 }
      : { x1: c1, x2: c2, z1: s, z2: e };
    return { ...p, y1: y0 + yb, y2: y0 + yt, kind, wall: w.id };
  };
  const pieces = [];
  if (mat === 'glass') { pieces.push(mk(a1, a2, 0, H, 'glass')); return pieces; }
  const ops = (w.openings || []).map((o) => openingWithDefaults(house, o)).sort((a, b) => a.from - b.from);
  const mid = (b1 + b2) / 2;
  let cur = a1;
  for (const o of ops) {
    const f = Math.max(a1, Math.min(a2, o.from));
    const t = Math.max(a1, Math.min(a2, o.to));
    if (t <= f) continue;
    if (f > cur) pieces.push(mk(cur, f, 0, H, mat));
    const sill = Math.min(o.sill, H);
    const head = Math.min(o.head, H);
    if (sill > 0) pieces.push(mk(f, t, 0, sill, mat));
    if (head < H) pieces.push(mk(f, t, head, H, mat));
    if (OPENING_PANE.has(o.type)) pieces.push(mk(f, t, sill, head, 'glass', mid - 0.03, mid + 0.03));
    if (o.type === 'slide') {
      // fixed half of the sliding glass door (outer side), other half is open
      pieces.push(mk(f, f + (t - f) * 0.5, 0, head, 'glass', mid + 0.06, mid + 0.12));
    }
    cur = Math.max(cur, t);
  }
  if (cur < a2) pieces.push(mk(cur, a2, 0, H, mat));
  return pieces;
}

/** Decompose (union of rects) minus holes into non-overlapping rects via a coordinate grid. */
export function decomposeRects(rects, holes = []) {
  const xs = new Set(); const zs = new Set();
  for (const r of [...rects, ...holes]) { xs.add(r[0]); xs.add(r[2]); zs.add(r[1]); zs.add(r[3]); }
  const X = [...xs].sort((a, b) => a - b); const Z = [...zs].sort((a, b) => a - b);
  const solid = [];
  for (let j = 0; j < Z.length - 1; j++) {
    const row = [];
    for (let i = 0; i < X.length - 1; i++) {
      const cx = (X[i] + X[i + 1]) / 2; const cz = (Z[j] + Z[j + 1]) / 2;
      row.push(rects.some((r) => pointInRect(r, cx, cz)) && !holes.some((h) => pointInRect(h, cx, cz)));
    }
    solid.push(row);
  }
  // merge horizontal runs, then merge identical runs vertically
  const out = []; let open = new Map();
  for (let j = 0; j < Z.length - 1; j++) {
    const runs = [];
    let i = 0;
    while (i < X.length - 1) {
      if (!solid[j][i]) { i++; continue; }
      let k = i; while (k + 1 < X.length - 1 && solid[j][k + 1]) k++;
      runs.push([i, k]); i = k + 1;
    }
    const next = new Map();
    for (const [i0, i1] of runs) {
      const key = `${i0}:${i1}`;
      if (open.has(key)) { const r = open.get(key); r[3] = Z[j + 1]; next.set(key, r); open.delete(key); }
      else next.set(key, [X[i0], Z[j], X[i1 + 1], Z[j + 1]]);
    }
    for (const r of open.values()) out.push(r);
    open = next;
  }
  for (const r of open.values()) out.push(r);
  return out;
}

export function furnitureBox(level, f) {
  const spec = FURNITURE_SPECS[f.type] || { h: 2 };
  let w = f.w, d = f.d;
  if (f.type === 'tree') { w = 1.0; d = 1.0; }
  return { x1: f.x - w / 2, x2: f.x + w / 2, z1: f.z - d / 2, z2: f.z + d / 2, y1: level.y, y2: level.y + spec.h };
}

/** Seat depth of an L-shaped sofa (shared by the renderer and the colliders). */
export function lSofaDepth(f, D) { return f.seat ?? Math.min(3, D * 0.6); }

/** Collision footprints of a furniture item (L-sofas get two boxes so the inside corner stays walkable). */
export function furnitureBoxes(level, f) {
  const box = furnitureBox(level, f);
  if (f.type !== 'sofa_l') return [box];
  const rot = (((f.rot || 0) % 360) + 360) % 360; const swap = rot === 90 || rot === 270;
  const W = swap ? f.d : f.w; const D = swap ? f.w : f.d; const dep = lSofaDepth(f, D);
  const a = (rot * Math.PI) / 180; const c = Math.round(Math.cos(a)); const s = Math.round(Math.sin(a));
  const local = [[-W / 2, -D / 2, W / 2, -D / 2 + dep], [-W / 2, -D / 2 + dep, -W / 2 + dep, D / 2]];
  return local.map(([lx1, lz1, lx2, lz2]) => {
    const pts = [[lx1, lz1], [lx2, lz2]].map(([lx, lz]) => [f.x + lx * c + lz * s, f.z - lx * s + lz * c]);
    return { x1: Math.min(pts[0][0], pts[1][0]), x2: Math.max(pts[0][0], pts[1][0]), z1: Math.min(pts[0][1], pts[1][1]), z2: Math.max(pts[0][1], pts[1][1]), y1: box.y1, y2: box.y2 };
  });
}

export function stairGeometry(house) {
  const s = house.stairs;
  const rise = 10.5 / 2;
  const out = [];
  for (const id of s.fromLevels) {
    const L = house.levels[levelIndexById(house, id)];
    const y = L.y;
    out.push({
      level: id, y,
      flight1: { x1: s.runX1, x2: s.runX2, z1: s.flight1Z[0], z2: s.flight1Z[1], yAtX1: y, yAtX2: y + rise },
      landing: { x1: s.runX2, x2: s.landingX2, z1: s.core[1], z2: s.core[3], y: y + rise },
      flight2: { x1: s.runX1, x2: s.runX2, z1: s.flight2Z[0], z2: s.flight2Z[1], yAtX1: y + 2 * rise, yAtX2: y + rise },
      well: { x1: s.runX1, x2: s.runX2, z1: s.wellZ[0], z2: s.wellZ[1], y1: y, y2: y + 10.5 + 3.5 }
    });
  }
  return out;
}

export function buildColliders(house) {
  const cols = [];
  house.levels.forEach((L, li) => {
    for (const w of L.walls) for (const p of wallPieces(house, L, w)) cols.push({ ...p, li, src: 'wall' });
    for (const r of L.railings || []) cols.push({ ...r, y1: L.y, y2: L.y + (r.h ?? house.defaults.railingHeight), li, src: 'railing' });
    for (const f of L.features || []) if (f.type === 'pergola' && f.posts) for (const [x, z] of [[f.x1, f.z1], [f.x2, f.z1], [f.x1, f.z2], [f.x2, f.z2]]) {
      const px = x === f.x1 ? x + 0.3 : x - 0.3, pz = z === f.z1 ? z + 0.3 : z - 0.3;
      cols.push({ x1: px - 0.3, x2: px + 0.3, z1: pz - 0.3, z2: pz + 0.3, y1: L.y, y2: L.y + f.h, li, src: 'feature:pergola-post' });
    }
    for (const f of L.features || []) if (f.collide) cols.push({ x1: f.x1, z1: f.z1, x2: f.x2, z2: f.z2, y1: L.y + (f.y1 || 0), y2: L.y + f.y2, li, src: 'feature:' + f.type });
    for (const f of L.furniture || []) {
      const spec = FURNITURE_SPECS[f.type] || {};
      if (spec.collide === false) continue;
      for (const b of furnitureBoxes(L, f)) cols.push({ ...b, li, src: 'furniture:' + f.type });
    }
  });
  for (const s of stairGeometry(house)) cols.push({ ...s.well, li: levelIndexById(house, s.level), src: 'stairwell' });
  return cols;
}

export function buildSurfaces(house) {
  const surfaces = [];
  house.levels.forEach((L, li) => {
    if (L.slab.ground) {
      const g = house.site.ground;
      surfaces.push({ kind: 'flat', x1: g[0], z1: g[1], x2: g[2], z2: g[3], y: L.y, li });
    } else {
      for (const r of decomposeRects(L.slab.rects, L.slab.holes)) surfaces.push({ kind: 'flat', x1: r[0], z1: r[1], x2: r[2], z2: r[3], y: L.y, li });
    }
  });
  for (const s of stairGeometry(house)) {
    const li = levelIndexById(house, s.level);
    surfaces.push({ kind: 'ramp', ...s.flight1, li, stair: true });
    surfaces.push({ kind: 'flat', ...s.landing, li, stair: true });
    surfaces.push({ kind: 'ramp', ...s.flight2, li, stair: true });
  }
  return surfaces;
}

export function surfaceHeight(s, x) {
  if (s.kind === 'flat') return s.y;
  const t = Math.max(0, Math.min(1, (x - s.x1) / (s.x2 - s.x1)));
  return s.yAtX1 + (s.yAtX2 - s.yAtX1) * t;
}

/** Highest walkable surface at (x,z) that is not more than `step` above y. */
export function groundAt(surfaces, x, z, y, step = PLAYER.step) {
  let best = -Infinity;
  for (const s of surfaces) {
    if (x < s.x1 || x > s.x2 || z < s.z1 || z > s.z2) continue;
    const h = surfaceHeight(s, x);
    if (h <= y + step && h > best) best = h;
  }
  return best;
}

export function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.x1, Math.min(x, b.x2));
  const cz = Math.max(b.z1, Math.min(z, b.z2));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function collides(colliders, x, z, y, r = PLAYER.radius) {
  const lo = y + PLAYER.bodyBottom, hi = y + PLAYER.bodyTop;
  for (const c of colliders) {
    if (c.y2 <= lo || c.y1 >= hi) continue;
    if (circleHitsBox(x, z, r, c)) return c;
  }
  return null;
}

// ---------------------------------------------------------------- navigation

export function buildNav(house, colliders, surfaces, cell = 0.5) {
  const s = house.stairs;
  const grids = house.levels.map((L, li) => {
    let bx = house.site.bounds;
    if (!L.slab.ground) {
      const xs = L.slab.rects.flatMap((r) => [r[0], r[2]]); const zs = L.slab.rects.flatMap((r) => [r[1], r[3]]);
      bx = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    }
    const nx = Math.ceil((bx[2] - bx[0]) / cell); const nz = Math.ceil((bx[3] - bx[1]) / cell);
    const walk = new Uint8Array(nx * nz);
    const flats = surfaces.filter((sf) => sf.kind === 'flat' && !sf.stair && sf.li === li);
    const cols = colliders.filter((c) => c.y2 > L.y + PLAYER.bodyBottom && c.y1 < L.y + PLAYER.bodyTop);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = bx[0] + (i + 0.5) * cell; const z = bx[1] + (j + 0.5) * cell;
      if (pointInRect(s.core, x, z, 0.05)) continue;
      if (!flats.some((f) => x >= f.x1 && x <= f.x2 && z >= f.z1 && z <= f.z2)) continue;
      let hit = false;
      for (const c of cols) if (circleHitsBox(x, z, PLAYER.navRadius, c)) { hit = true; break; }
      if (!hit) walk[j * nx + i] = 1;
    }
    return { li, x0: bx[0], z0: bx[1], nx, nz, cell, walk };
  });
  return { grids, house };
}

function cellOf(g, x, z) { return [Math.floor((x - g.x0) / g.cell), Math.floor((z - g.z0) / g.cell)]; }
function centerOf(g, i, j) { return [g.x0 + (i + 0.5) * g.cell, g.z0 + (j + 0.5) * g.cell]; }
function isWalk(g, i, j) { return i >= 0 && j >= 0 && i < g.nx && j < g.nz && g.walk[j * g.nx + i] === 1; }

export function nearestWalkable(g, x, z, maxR = 14) {
  const [ci, cj] = cellOf(g, x, z);
  if (isWalk(g, ci, cj)) return [ci, cj];
  const R = Math.ceil(maxR / g.cell);
  let best = null, bd = Infinity;
  for (let r = 1; r <= R; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (!isWalk(g, ci + di, cj + dj)) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = [ci + di, cj + dj]; }
    }
    if (best) return best;
  }
  return null;
}

class Heap {
  constructor() { this.a = []; }
  push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
  get size() { return this.a.length; }
}

function lineWalkable(g, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(d / (g.cell * 0.4)));
  for (let k = 0; k <= n; k++) {
    const t = k / n; const [i, j] = cellOf(g, ax + (bx - ax) * t, az + (bz - az) * t);
    if (!isWalk(g, i, j)) return false;
  }
  return true;
}

/** A* on one level grid. Returns array of [x,z] or null. */
export function astar(g, from, to) {
  const s = nearestWalkable(g, from[0], from[1]); const t = nearestWalkable(g, to[0], to[1]);
  if (!s || !t) return null;
  const N = g.nx * g.nz; const gs = new Float32Array(N).fill(Infinity); const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const si = s[1] * g.nx + s[0]; const ti = t[1] * g.nx + t[0];
  const h = (i, j) => { const dx = Math.abs(i - t[0]), dz = Math.abs(j - t[1]); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  const heap = new Heap(); gs[si] = 0; heap.push(si, h(s[0], s[1]));
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let found = false;
  while (heap.size) {
    const cur = heap.pop(); if (closed[cur]) continue; closed[cur] = 1;
    if (cur === ti) { found = true; break; }
    const ci = cur % g.nx, cj = (cur / g.nx) | 0;
    for (const [di, dj, c] of D) {
      const ni = ci + di, nj = cj + dj; if (!isWalk(g, ni, nj)) continue;
      if (di && dj && (!isWalk(g, ci + di, cj) || !isWalk(g, ci, cj + dj))) continue;
      const n = nj * g.nx + ni; if (closed[n]) continue;
      const ng = gs[cur] + c; if (ng < gs[n]) { gs[n] = ng; came[n] = cur; heap.push(n, ng + h(ni, nj)); }
    }
  }
  if (!found) return null;
  const cells = []; for (let c = ti; c !== -1; c = came[c]) cells.push(c); cells.reverse();
  const pts = cells.map((c) => centerOf(g, c % g.nx, (c / g.nx) | 0));
  // string pulling
  const out = [pts[0]]; let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && !lineWalkable(g, pts[a][0], pts[a][1], pts[b][0], pts[b][1])) b--;
    out.push(pts[b]); a = b;
  }
  return out;
}

/**
 * Route between two points possibly on different levels using the stair core.
 * from/to: {li, x, z}. Returns [{x,z,li}] or null.
 */
export function planRoute(nav, from, to) {
  const { house, grids } = nav; const st = house.stairs;
  const fromIds = st.fromLevels.map((id) => levelIndexById(house, id));
  const path = []; let cur = { ...from };
  const pushPts = (pts, li) => { for (const p of pts) path.push({ x: p[0], z: p[1], li }); };
  let guard = 0;
  while (cur.li !== to.li && guard++ < 10) {
    const up = to.li > cur.li;
    const target = up ? st.entry : st.exit;
    if (up && !fromIds.includes(cur.li)) return null;
    if (!up && !fromIds.includes(cur.li - 1)) return null;
    const seg = astar(grids[cur.li], [cur.x, cur.z], target); if (!seg) return null;
    pushPts(seg, cur.li);
    const wps = up ? st.waypointsUp : [...st.waypointsUp].reverse();
    const baseLi = up ? cur.li : cur.li - 1;
    wps.forEach((w) => path.push({ x: w[0], z: w[1], li: baseLi, stair: true }));
    const nextLi = up ? cur.li + 1 : cur.li - 1;
    const arrive = up ? st.exit : st.entry;
    cur = { li: nextLi, x: arrive[0], z: arrive[1] };
  }
  const seg = astar(grids[cur.li], [cur.x, cur.z], [to.x, to.z]); if (!seg) return null;
  pushPts(seg, cur.li);
  return path;
}

export function pathLength(path) {
  let d = 0; for (let i = 1; i < path.length; i++) d += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return d;
}

// ---------------------------------------------------------------- rooms

export function roomBBox(room) {
  const xs = room.rects.flatMap((r) => [r[0], r[2]]); const zs = room.rects.flatMap((r) => [r[1], r[3]]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}
export function roomArea(room) { return room.rects.reduce((a, r) => a + rectArea(r), 0); }
export function roomAnchor(room) {
  const r = [...room.rects].sort((a, b) => rectArea(b) - rectArea(a))[0];
  return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
}
export function roomAt(level, x, z) {
  for (const r of level.rooms) if (r.rects.some((rc) => pointInRect(rc, x, z))) return r;
  return null;
}
export function levelAtY(house, y) {
  let li = 0; house.levels.forEach((L, i) => { if (L.y <= y + 1.0) li = i; }); return li;
}

/** Find a walkable point inside a room, as close to its anchor as possible. */
export function roomTarget(nav, li, room) {
  const g = nav.grids[li]; const [ax, az] = roomAnchor(room);
  const inside = (i, j) => { const [x, z] = centerOf(g, i, j); return room.rects.some((r) => pointInRect(r, x, z)); };
  const [ci, cj] = cellOf(g, ax, az);
  const R = Math.ceil(30 / g.cell);
  for (let r = 0; r <= R; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj; if (!isWalk(g, i, j) || !inside(i, j)) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = centerOf(g, i, j); }
    }
    if (best) return best;
  }
  return null;
}

export function fmtFt(v) {
  const ft = Math.floor(v + 1e-6); let inch = Math.round((v - ft) * 12);
  if (inch === 12) return `${ft + 1}'-0"`;
  return `${ft}'-${inch}"`;
}
