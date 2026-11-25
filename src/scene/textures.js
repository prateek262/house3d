// Procedural, tileable PBR texture generators (albedo / normal / roughness) rendered into canvases.
// Everything is generated at runtime, so the app has no external texture downloads. Resolution is chosen
// per device tier (mobile 512, desktop 1024), which keeps GPU memory small on phones.

export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Periodic value noise: n(x, y) in [0,1], tiling every px x py lattice units. */
function lattice(seed, px, py) {
  const r = mulberry(seed); const g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = g[y0 * px + x0], b = g[y0 * px + x1], c = g[y1 * px + x0], d = g[y1 * px + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
/** Tileable fBm over the unit square; periodX/periodY = base lattice cells across each axis. */
function fbm(seed, periodX, periodY, octaves = 4) {
  const layers = []; for (let o = 0; o < octaves; o++) layers.push([lattice(seed + o * 101, periodX << o, periodY << o), periodX << o, periodY << o]);
  let norm = 0; for (let o = 0, a = 0.5; o < octaves; o++, a *= 0.5) norm += a;
  return (u, v) => {
    let s = 0, a = 0.5;
    for (let o = 0; o < octaves; o++) { const [n, px, py] = layers[o]; s += a * n(u * px, v * py); a *= 0.5; }
    return s / norm;
  };
}
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

class Surface {
  constructor(size) { this.size = size; this.col = new Float32Array(size * size * 3); this.h = new Float32Array(size * size); this.r = new Float32Array(size * size).fill(0.5); }
  set(i, rgb, h, r) { this.col[i * 3] = rgb[0]; this.col[i * 3 + 1] = rgb[1]; this.col[i * 3 + 2] = rgb[2]; this.h[i] = h; this.r[i] = r; }
  albedo() {
    const S = this.size; const c = canvas(S); const ctx = c.getContext('2d'); const img = ctx.createImageData(S, S); const d = img.data;
    for (let i = 0; i < S * S; i++) { d[i * 4] = this.col[i * 3]; d[i * 4 + 1] = this.col[i * 3 + 1]; d[i * 4 + 2] = this.col[i * 3 + 2]; d[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0); return c;
  }
  normal(strength = 2) {
    const S = this.size; const c = canvas(S); const ctx = c.getContext('2d'); const img = ctx.createImageData(S, S); const d = img.data; const H = this.h;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const xl = (x - 1 + S) % S, xr = (x + 1) % S, yu = (y - 1 + S) % S, yd = (y + 1) % S;
      const dx = (H[y * S + xr] - H[y * S + xl]) * strength; const dy = (H[yd * S + x] - H[yu * S + x]) * strength;
      const l = Math.hypot(dx, dy, 1); const i = (y * S + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); return c;
  }
  rough() {
    const S = this.size; const c = canvas(S); const ctx = c.getContext('2d'); const img = ctx.createImageData(S, S); const d = img.data;
    for (let i = 0; i < S * S; i++) { const v = clamp01(this.r[i]) * 255; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0); return c;
  }
}

/**
 * Wood planks running along v. Texture covers `planks` boards across and `rows` staggered butt joints.
 * opts: { base, dark, light, planks, rows, seed, gloss, grain }
 */
export function wood(size, o) {
  const S = new Surface(size); const rnd = mulberry(o.seed || 7);
  const N = o.planks || 4, R = o.rows || 2;
  const tints = []; for (let i = 0; i < N * R * 2; i++) tints.push(0.88 + rnd() * 0.24);
  const offs = []; for (let i = 0; i < N; i++) offs.push(rnd());
  const grain = fbm((o.seed || 7) + 11, 48, 3, 4); const fleck = fbm((o.seed || 7) + 23, 64, 64, 2);
  const rings = fbm((o.seed || 7) + 31, 6, 2, 3);
  const base = hex(o.base), dark = hex(o.dark || o.base), light = hex(o.light || o.base);
  const gloss = o.gloss ?? 0.45; const gAmt = o.grain ?? 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; const pi = Math.floor(u * N); const pu = u * N - pi;
    const vv = (v + offs[pi]) % 1; const ri = Math.floor(vv * R); const pv = vv * R - ri;
    const t = tints[(pi * R + ri) % tints.length];
    const g = grain(u + pi * 0.13, v); const ringv = Math.sin((pu * 3 + rings(u, v) * 4 + pi) * 6.0) * 0.5 + 0.5;
    let f = clamp01(0.5 + (g - 0.5) * 1.6 * gAmt + (ringv - 0.5) * 0.18 * gAmt);
    let c0 = f < 0.5 ? [mix(dark[0], base[0], f * 2), mix(dark[1], base[1], f * 2), mix(dark[2], base[2], f * 2)]
      : [mix(base[0], light[0], (f - 0.5) * 2), mix(base[1], light[1], (f - 0.5) * 2), mix(base[2], light[2], (f - 0.5) * 2)];
    const fl = fleck(u, v) > 0.72 ? 0.94 : 1;
    const edgeU = Math.min(pu, 1 - pu) * size / N; const edgeV = Math.min(pv, 1 - pv) * size / R;
    const gap = edgeU < 1.2 || edgeV < 1.0; const bevel = smooth(0, 3.0, Math.min(edgeU, edgeV * 1.5));
    const k = t * fl * (gap ? 0.45 : mix(0.9, 1, bevel));
    S.set(y * size + x, [c0[0] * k, c0[1] * k, c0[2] * k], (gap ? 0 : 0.35 + bevel * 0.5) + g * 0.12 * gAmt, gap ? 0.9 : clamp01(gloss + (0.5 - f) * 0.15 + (1 - bevel) * 0.2));
  }
  return { map: S.albedo(), normalMap: S.normal(1.6), roughnessMap: S.rough() };
}

/** Large-format marble slabs with domain-warped veining. opts: { base, vein, vein2, tiles, seed, gloss, veins } */
export function marble(size, o) {
  const S = new Surface(size); const n = o.tiles ?? 2; const seed = o.seed || 5;
  const warp = fbm(seed, 3, 3, 4); const warp2 = fbm(seed + 7, 5, 5, 3); const cloud = fbm(seed + 13, 4, 4, 4);
  const base = hex(o.base), vein = hex(o.vein), vein2 = hex(o.vein2 || o.vein);
  const vAmt = o.veins ?? 1; const gloss = o.gloss ?? 0.1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const w = warp(u, v), w2 = warp2(u, v);
    const t1 = (u * 1.0 + v * 0.55) * 3 + w * 3.2; const t2 = (u * -0.4 + v * 1.0) * 5 + w2 * 4.0;
    const v1 = Math.pow(1 - Math.abs(Math.sin(t1 * Math.PI)), 18) * vAmt; const v2 = Math.pow(1 - Math.abs(Math.sin(t2 * Math.PI)), 40) * 0.6 * vAmt;
    const cl = (cloud(u, v) - 0.5) * 0.12;
    let c = [base[0] * (1 + cl), base[1] * (1 + cl), base[2] * (1 + cl)];
    c = [mix(c[0], vein[0], v1 * 0.75), mix(c[1], vein[1], v1 * 0.75), mix(c[2], vein[2], v1 * 0.75)];
    c = [mix(c[0], vein2[0], v2), mix(c[1], vein2[1], v2), mix(c[2], vein2[2], v2)];
    const eu = Math.min((u * n) % 1, 1 - ((u * n) % 1)) * size / n; const ev = Math.min((v * n) % 1, 1 - ((v * n) % 1)) * size / n;
    const grout = n > 0 && Math.min(eu, ev) < 1.1;
    if (grout) c = [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72];
    S.set(y * size + x, c, grout ? 0 : 1, grout ? 0.8 : gloss + v1 * 0.05);
  }
  return { map: S.albedo(), normalMap: S.normal(3), roughnessMap: S.rough() };
}

/** Large-format porcelain / limestone (subtle cloudiness, fine grout). opts: { base, tilesX, tilesY, seed, gloss, speck } */
export function stoneTile(size, o) {
  const S = new Surface(size); const seed = o.seed || 9; const nx = o.tilesX || 1, ny = o.tilesY || 2;
  const cloud = fbm(seed, 4, 4, 5); const sp = fbm(seed + 3, 128, 128, 1);
  const base = hex(o.base); const gloss = o.gloss ?? 0.3; const speck = o.speck ?? 0.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; const cl = (cloud(u, v) - 0.5) * 0.14; const s = sp(u, v) > 0.8 ? -0.06 * speck : 0;
    const eu = Math.min((u * nx) % 1, 1 - ((u * nx) % 1)) * size / nx; const ev = Math.min((v * ny) % 1, 1 - ((v * ny) % 1)) * size / ny;
    const grout = Math.min(eu, ev) < 1.0; const k = grout ? 0.8 : 1 + cl + s;
    S.set(y * size + x, [base[0] * k, base[1] * k, base[2] * k], grout ? 0 : 1, grout ? 0.85 : gloss + cl * 0.5);
  }
  return { map: S.albedo(), normalMap: S.normal(2.5), roughnessMap: S.rough() };
}

/** Square ceramic tiles with grout relief. opts: { base, grout, n, seed, gloss } */
export function ceramicTiles(size, o) {
  const S = new Surface(size); const n = o.n || 4; const rnd = mulberry(o.seed || 9); const cl = fbm((o.seed || 9) + 1, 8, 8, 3);
  const tint = []; for (let i = 0; i < n * n; i++) tint.push(0.96 + rnd() * 0.08);
  const base = hex(o.base), grout = hex(o.grout);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; const tu = (u * n) % 1, tv = (v * n) % 1;
    const e = Math.min(tu, 1 - tu, tv, 1 - tv) * size / n; const g = e < 1.6; const bev = smooth(1.6, 4, e);
    const k = tint[Math.floor(v * n) * n + Math.floor(u * n)] * (1 + (cl(u, v) - 0.5) * 0.06);
    S.set(y * size + x, g ? grout : [base[0] * k, base[1] * k, base[2] * k], g ? 0 : 0.6 + bev * 0.4, g ? 0.9 : o.gloss ?? 0.2);
  }
  return { map: S.albedo(), normalMap: S.normal(2.5), roughnessMap: S.rough() };
}

/** Woven fabric (plain weave / boucle). opts: { base, seed, weave (threads across), boucle } */
export function fabric(size, o) {
  const S = new Surface(size); const seed = o.seed || 19; const F = o.weave || 48;
  const nz = fbm(seed, 16, 16, 3); const lump = fbm(seed + 5, 40, 40, 2); const base = hex(o.base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const wx = Math.sin(u * F * Math.PI * 2), wy = Math.sin(v * F * Math.PI * 2);
    const weave = (wx * 0.5 + 0.5) * (wy > 0 ? 1 : 0.6) * 0.5 + (wy * 0.5 + 0.5) * (wx > 0 ? 0.6 : 1) * 0.5;
    const b = o.boucle ? lump(u, v) : 0.5; const h = o.boucle ? b * 0.8 + weave * 0.2 : weave;
    const k = 0.9 + (nz(u, v) - 0.5) * 0.18 + (h - 0.5) * 0.18;
    S.set(y * size + x, [base[0] * k, base[1] * k, base[2] * k], h, 0.9);
  }
  return { map: S.albedo(), normalMap: S.normal(o.boucle ? 3 : 1.5) };
}

/** Subtle limewash / matte paint mottling. */
export function plaster(size, o) {
  const S = new Surface(size); const nz = fbm(o.seed || 29, 6, 6, 5); const base = hex(o.base); const amt = o.amount ?? 0.035;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; const n = nz(u, v) - 0.5; const k = 1 + n * amt * 2;
    S.set(y * size + x, [base[0] * k, base[1] * k, base[2] * k], n, 0.92);
  }
  return { map: S.albedo(), normalMap: S.normal(0.6) };
}

/** Vertical fluted / slatted panel (walnut flutes, oak slats). opts: { base, dark, light, count, kind: 'flute'|'slat', seed } */
export function panel(size, o) {
  const w = wood(size, { base: o.base, dark: o.dark, light: o.light, planks: 1, rows: 1, seed: o.seed || 41, gloss: o.gloss ?? 0.5, grain: 0.8 });
  const S = new Surface(size); const n = o.count || 12;
  const ctx = w.map.getContext('2d'); const img = ctx.getImageData(0, 0, size, size).data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * n % 1; const i = y * size + x;
    let h, k;
    if (o.kind === 'slat') { const gap = u < 0.16; h = gap ? 0 : 1 - Math.pow(Math.abs(u - 0.58) / 0.42, 8) * 0.3; k = gap ? 0.18 : 1; }
    else { h = Math.sin(u * Math.PI); k = 0.78 + h * 0.22; }
    S.set(i, [img[i * 4] * k, img[i * 4 + 1] * k, img[i * 4 + 2] * k], h, o.kind === 'slat' && u < 0.16 ? 1 : (o.gloss ?? 0.5));
  }
  return { map: S.albedo(), normalMap: S.normal(o.kind === 'slat' ? 4 : 6), roughnessMap: S.rough() };
}

/** Rug with border and heathered field. opts: { base, accent, seed, style: 'border'|'stripe'|'plain' } */
export function rug(size, o) {
  const S = new Surface(size); const nz = fbm(o.seed || 71, 64, 64, 2); const cl = fbm((o.seed || 71) + 2, 5, 5, 3);
  const base = hex(o.base), acc = hex(o.accent || o.base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; const e = Math.min(u, 1 - u, v, 1 - v);
    let t = 0;
    if (o.style === 'border') t = (e > 0.045 && e < 0.075) || (e > 0.1 && e < 0.108) ? 1 : 0;
    if (o.style === 'stripe') t = Math.sin(v * Math.PI * 14) > 0.92 ? 1 : 0;
    const k = 0.9 + (nz(u, v) - 0.5) * 0.25 + (cl(u, v) - 0.5) * 0.1;
    const c = [mix(base[0], acc[0], t) * k, mix(base[1], acc[1], t) * k, mix(base[2], acc[2], t) * k];
    S.set(y * size + x, c, nz(u, v), 1);
  }
  return { map: S.albedo(), normalMap: S.normal(1.5) };
}

/** Terrazzo (utility room, per reference photo). */
export function terrazzo(size, o = {}) {
  const c = canvas(size); const x = c.getContext('2d'); const r = mulberry(o.seed || 37);
  x.fillStyle = o.base || '#cbc7c0'; x.fillRect(0, 0, size, size);
  const chips = ['#8d8a85', '#e9e6e1', '#5f5c58', '#a9a49c', '#ffffff', '#b8b1a6', '#77736d'];
  const k = size / 1024;
  for (let i = 0; i < 26000 * k * k; i++) {
    x.fillStyle = chips[Math.floor(r() * chips.length)]; x.globalAlpha = 0.55 + r() * 0.45;
    const px = r() * size, py = r() * size, sz = (0.8 + r() * r() * 5) * k;
    x.beginPath(); x.moveTo(px, py); for (let j = 1; j < 5; j++) { const a = (j / 5) * Math.PI * 2 + r(); x.lineTo(px + Math.cos(a) * sz, py + Math.sin(a) * sz); } x.fill();
  }
  x.globalAlpha = 1; x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 2 * k;
  for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo((i * size) / 2, 0); x.lineTo((i * size) / 2, size); x.stroke(); x.beginPath(); x.moveTo(0, (i * size) / 2); x.lineTo(size, (i * size) / 2); x.stroke(); }
  return { map: c };
}

export function grass(size) {
  const c = canvas(size); const x = c.getContext('2d'); const r = mulberry(13); const k = size / 512;
  x.fillStyle = '#4c7533'; x.fillRect(0, 0, size, size);
  for (let i = 0; i < 16000 * k * k; i++) {
    x.strokeStyle = `hsl(${85 + r() * 30},${38 + r() * 25}%,${20 + r() * 22}%)`; x.lineWidth = k;
    const px = r() * size, py = r() * size; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3 * k, py - (3 + r() * 5) * k); x.stroke();
  }
  return { map: c };
}

export function paving(size, o = {}) {
  const S = new Surface(size); const rnd = mulberry(o.seed || 17); const nz = fbm(19, 32, 32, 3); const base = hex(o.base || '#b9b2a6');
  const rows = 4; const tints = []; for (let i = 0; i < 64; i++) tints.push(0.92 + rnd() * 0.12);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; const row = Math.floor(v * rows); const uo = (u + (row % 2) * 0.25) % 1;
    const col = Math.floor(uo * 2); const tu = (uo * 2) % 1, tv = (v * rows) % 1;
    const e = Math.min(tu * size / 2, (1 - tu) * size / 2, tv * size / rows, (1 - tv) * size / rows); const g = e < 1.5;
    const k = g ? 0.6 : tints[(row * 2 + col) % 64] * (1 + (nz(u, v) - 0.5) * 0.2);
    S.set(y * size + x, [base[0] * k, base[1] * k, base[2] * k], g ? 0 : 1, 0.85);
  }
  return { map: S.albedo(), normalMap: S.normal(2) };
}

export function concrete(size, o = {}) {
  const S = new Surface(size); const nz = fbm(o.seed || 11, 8, 8, 5); const base = hex(o.base || '#bdb8b0');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const u = x / size, v = y / size; const n = nz(u, v); const k = 0.9 + (n - 0.5) * 0.3; S.set(y * size + x, [base[0] * k, base[1] * k, base[2] * k], n, 0.9); }
  return { map: S.albedo(), normalMap: S.normal(1) };
}

export function jali(size) {
  const c = canvas(size); const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); x.fillStyle = '#000';
  const n = 4; const t = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = i * t + t / 2, cy = j * t + t / 2;
    x.beginPath(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; x.ellipse(cx + Math.cos(a) * t * 0.2, cy + Math.sin(a) * t * 0.2, t * 0.17, t * 0.08, a, 0, Math.PI * 2); } x.fill();
  }
  return { map: c };
}

/** Abstract art compositions in a theme palette (index selects the composition). */
export function art(size, palette, index, seed = 1) {
  const c = canvas(size); const x = c.getContext('2d'); const r = mulberry(seed * 977 + index * 31);
  const P = palette; const pick = (i) => P[i % P.length];
  const w = size, h = size;
  x.fillStyle = pick(0); x.fillRect(0, 0, w, h);
  const kind = index % 6;
  if (kind === 0) { // layered arches
    for (let i = 0; i < 4; i++) { x.fillStyle = pick(i + 1); const cx = w * (0.25 + i * 0.17), rr = w * (0.18 - i * 0.02); x.beginPath(); x.moveTo(cx - rr, h * 0.85); x.lineTo(cx - rr, h * 0.85 - rr * 1.2); x.arc(cx, h * 0.85 - rr * 1.2, rr, Math.PI, 0); x.lineTo(cx + rr, h * 0.85); x.fill(); }
  } else if (kind === 1) { // sun + horizon
    x.fillStyle = pick(1); x.fillRect(0, h * 0.62, w, h * 0.38); x.fillStyle = pick(2); x.beginPath(); x.arc(w * 0.62, h * 0.48, w * 0.16, 0, Math.PI * 2); x.fill();
    x.fillStyle = pick(3); x.fillRect(0, h * 0.74, w, h * 0.04);
  } else if (kind === 2) { // brush strokes
    for (let i = 0; i < 7; i++) { x.strokeStyle = pick(i + 1); x.globalAlpha = 0.65; x.lineWidth = w * (0.03 + r() * 0.06); x.lineCap = 'round'; x.beginPath(); const y0 = h * (0.15 + r() * 0.7); x.moveTo(w * 0.1, y0); x.bezierCurveTo(w * 0.4, y0 - h * 0.2 * r(), w * 0.6, y0 + h * 0.2 * r(), w * 0.9, y0 + (r() - 0.5) * h * 0.2); x.stroke(); }
    x.globalAlpha = 1;
  } else if (kind === 3) { // blocks
    for (let i = 0; i < 5; i++) { x.fillStyle = pick(i + 1); x.fillRect(w * r() * 0.6, h * r() * 0.6, w * (0.2 + r() * 0.3), h * (0.2 + r() * 0.3)); }
  } else if (kind === 4) { // circles
    for (let i = 0; i < 3; i++) { x.fillStyle = pick(i + 1); x.globalAlpha = 0.85; x.beginPath(); x.arc(w * (0.3 + i * 0.2), h * (0.4 + (i % 2) * 0.2), w * (0.22 - i * 0.04), 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1;
  } else { // lines
    x.strokeStyle = pick(2); x.lineWidth = w * 0.006; for (let i = 0; i < 26; i++) { x.beginPath(); x.moveTo(w * 0.2, h * (0.1 + i * 0.03)); x.quadraticCurveTo(w * 0.5, h * (0.1 + i * 0.03 + r() * 0.1), w * 0.8, h * (0.1 + i * 0.03)); x.stroke(); }
  }
  // canvas texture
  const img = x.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const k = 0.96 + r() * 0.06; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  x.putImageData(img, 0, 0);
  return { map: c };
}

/** Vertical/radial glow ramps (white -> black) used with additive blending for LED washes and uplights. */
export function glowRamp(size, kind = 'up') {
  const c = canvas(size); const x = c.getContext('2d');
  let g;
  if (kind === 'radial') { g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#888'); g.addColorStop(1, '#000'); }
  else { g = x.createLinearGradient(0, kind === 'up' ? size : 0, 0, kind === 'up' ? 0 : size); g.addColorStop(0, '#fff'); g.addColorStop(0.15, '#bbb'); g.addColorStop(0.6, '#333'); g.addColorStop(1, '#000'); }
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  if (kind !== 'radial') { // soften the sides
    const s2 = x.createLinearGradient(0, 0, size, 0); s2.addColorStop(0, 'rgba(0,0,0,1)'); s2.addColorStop(0.18, 'rgba(0,0,0,0)'); s2.addColorStop(0.82, 'rgba(0,0,0,0)'); s2.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = s2; x.fillRect(0, 0, size, size);
  }
  return { map: c };
}

/** TV "ambient mode" picture: soft landscape so screens read as TVs without being distracting. */
export function tvImage(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#1d3557'); sky.addColorStop(0.55, '#e9a46a'); sky.addColorStop(1, '#2b2d42');
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,236,200,0.9)'; x.beginPath(); x.arc(w * 0.68, h * 0.5, h * 0.09, 0, Math.PI * 2); x.fill();
  const r = mulberry(5);
  for (const [base, col] of [[0.62, '#3d405b'], [0.72, '#2b2d42'], [0.84, '#1b1c2a']]) {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, h); let y = h * base;
    for (let i = 0; i <= 24; i++) { y = h * base + Math.sin(i * 0.9 + r() * 2) * h * 0.05 - r() * h * 0.04; x.lineTo((i / 24) * w, y); }
    x.lineTo(w, h); x.fill();
  }
  return { map: c };
}

/** Geometric laser-cut jali (alpha mask): dense interlocking star lattice after the client's reference. */
export function jaliStar(size) {
  const c = canvas(size); const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); x.fillStyle = '#000';
  const n = 4; const t = size / n;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const cx = i * t, cy = j * t;
    for (let k = 0; k < 8; k++) { // eight petals around each lattice node
      const a = (k * Math.PI) / 4; x.beginPath();
      x.ellipse(cx + Math.cos(a) * t * 0.27, cy + Math.sin(a) * t * 0.27, t * 0.15, t * 0.055, a, 0, Math.PI * 2); x.fill();
    }
    // diamond between nodes
    x.save(); x.translate(cx + t / 2, cy + t / 2); x.rotate(Math.PI / 4); x.fillRect(-t * 0.1, -t * 0.1, t * 0.2, t * 0.2); x.restore();
  }
  return { map: c };
}
