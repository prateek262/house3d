import * as THREE from 'three';
import * as TX from './textures.js';

// ----------------------------------------------------------------------------------------------- themes
// Themes only change finishes, fabrics, colours and decor. Geometry, layout and furniture positions are
// identical in all themes. Exterior finishes follow the supplied renders (white plaster, timber cladding)
// and are not themed.
const WOOD = (base, dark, light, extra = {}) => ({ kind: 'wood', base, dark, light, planks: 4, rows: 2, ...extra });

export const THEMES = {
  luxury: {
    name: 'Modern Luxury',
    blurb: 'Calacatta marble, smoked walnut, brass and deep jewel tones',
    swatch: ['#efe9e1', '#5b3a26', '#b8975a', '#24453f'],
    wall: '#ebe5dc', ceiling: '#f7f4ef', kelvin: 2850,
    floors: {
      marble: { kind: 'marble', base: '#f1ede7', vein: '#8f877c', vein2: '#b59a6a', tiles: 2, gloss: 0.06, veins: 1, repeat: 8 },
      wood: WOOD('#6a4a33', '#3f2a1d', '#8a6646', { gloss: 0.35, repeat: 2.6 }),
      tile: { kind: 'marble', base: '#e9e4dd', vein: '#9b9184', vein2: '#c2a777', tiles: 2, gloss: 0.08, veins: 0.7, repeat: 4 }
    },
    accent: { kind: 'flute', base: '#5b3a26', dark: '#38231a', light: '#7a5235', count: 14, gloss: 0.45 },
    fabric: '#e6dfd3', fabricBoucle: true, fabric2: '#24453f', linen: '#f3efe8', throw: '#8b6a4a',
    furnWood: { base: '#4a3022', dark: '#2c1c14', light: '#6b4a33' },
    cabinet: { color: '#2b2622', roughness: 0.35, metalness: 0.05 },
    counter: { base: '#f3efe9', vein: '#7f776c', vein2: '#b59a6a' },
    metal: { color: '#b8975a', roughness: 0.28, metalness: 1 },
    rug: { base: '#cfc4b4', accent: '#8a6f4e', style: 'border' },
    decor: '#20302d', curtain: '#e8e0d4',
    art: ['#e9e2d6', '#24453f', '#b8975a', '#5b3a26', '#c9b9a3', '#1e1e1e'],
    kitchen: { gloss: '#e6d0bf', top: ['#22201f', '#3a3532', '#5c4a38'], splash: ['#121110', '#c9a14b', '#e9c46a'], bronze: '#8c6a43', shelf: '#6b4a33' }
  },
  minimal: {
    name: 'Minimalist Contemporary',
    blurb: 'Soft greys, matte white joinery, pale ash and black detailing',
    swatch: ['#f2f1ee', '#cfc9bf', '#1c1c1c', '#8c8a86'],
    wall: '#f1f0ec', ceiling: '#fbfbf9', kelvin: 3500,
    floors: {
      marble: { kind: 'stone', base: '#d8d5cf', tilesX: 1, tilesY: 2, gloss: 0.22, speck: 0.3, repeat: 8 },
      wood: WOOD('#cdbfa8', '#a8977d', '#e0d5c2', { gloss: 0.5, grain: 0.7, repeat: 2.6 }),
      tile: { kind: 'stone', base: '#cbc8c2', tilesX: 2, tilesY: 4, gloss: 0.3, speck: 0.4, repeat: 4 }
    },
    accent: { kind: 'paint', color: '#d6d2cb' },
    fabric: '#cfcac2', fabricBoucle: false, fabric2: '#4a4a48', linen: '#fafaf8', throw: '#9a958d',
    furnWood: { base: '#c2b29a', dark: '#9a8a72', light: '#d8cbb6' },
    cabinet: { color: '#ecebe7', roughness: 0.55, metalness: 0 },
    counter: { base: '#f4f3f0', vein: '#c9c6c0', vein2: '#dcdad5' },
    metal: { color: '#1c1c1c', roughness: 0.45, metalness: 0.6 },
    rug: { base: '#d9d5ce', accent: '#b9b4ab', style: 'plain' },
    decor: '#1d1d1d', curtain: '#f2f1ee',
    art: ['#f3f2ef', '#1c1c1c', '#9a958d', '#cfc9bf', '#6e6b66', '#e2ded6'],
    kitchen: { gloss: '#eeedea', top: ['#1d1d1d', '#2f2f2f', '#454545'], splash: ['#2a2a2a', '#d9d9d9', '#f2f2f2'], bronze: '#1c1c1c', shelf: '#c2b29a' }
  },
  scandi: {
    name: 'Warm Scandinavian',
    blurb: 'Natural oak, oatmeal textiles, sage and terracotta accents',
    swatch: ['#f4efe7', '#c9a57a', '#9aa58c', '#b86f50'],
    wall: '#f4efe6', ceiling: '#fbf8f3', kelvin: 2700,
    floors: {
      marble: WOOD('#c9a57a', '#a98457', '#dcbf98', { planks: 3, rows: 1, gloss: 0.5, seed: 17, repeat: 2.9 }),
      wood: WOOD('#c39e72', '#a17e55', '#d8b98f', { gloss: 0.5, seed: 9, repeat: 2.6 }),
      tile: { kind: 'stone', base: '#e5ddd0', tilesX: 2, tilesY: 4, gloss: 0.3, speck: 0.4, repeat: 4 }
    },
    accent: { kind: 'slat', base: '#c49c6c', dark: '#a37a4d', light: '#d8b88e', count: 12, gloss: 0.55 },
    fabric: '#ddd2bf', fabricBoucle: true, fabric2: '#9aa58c', linen: '#f6f1e8', throw: '#b86f50',
    furnWood: { base: '#c79f70', dark: '#a37c50', light: '#dbbb90' },
    cabinet: { color: '#e9e3d8', roughness: 0.6, metalness: 0 },
    counter: { base: '#efe9df', vein: '#cfc4b3', vein2: '#ddd3c4' },
    metal: { color: '#2a2a28', roughness: 0.5, metalness: 0.5 },
    rug: { base: '#e3d8c6', accent: '#b86f50', style: 'stripe' },
    decor: '#b86f50', curtain: '#efe7da',
    art: ['#f2ebe0', '#9aa58c', '#b86f50', '#c9a57a', '#3d4a44', '#e2d3bd'],
    kitchen: { gloss: '#ece3d4', top: ['#efe9df', '#cfc4b3', '#ddd3c4'], splash: ['#e8e0d2', '#c9b9a0', '#b86f50'], bronze: '#a47b4f', shelf: '#c79f70' }
  }
};
export const DEFAULT_THEME = 'luxury';

// ----------------------------------------------------------------------------------------------- registry
let SIZE = 1024; let ANISO = 8; let HIGH = true;
const cache = new Map(); // key -> texture | generated canvases
function tex(key, make, repeatFt, srgb = true) {
  const k = `${key}|${SIZE}`;
  if (cache.has(k)) return cache.get(k);
  const t = new THREE.CanvasTexture(make());
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / repeatFt, 1 / repeatFt); t.anisotropy = ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.userData.key = k; cache.set(k, t); return t;
}
/** Generates the maps of a PBR generator once and returns {map, normalMap, roughnessMap} textures. */
function pbr(key, gen, repeatFt) {
  const k = `pbr:${key}|${SIZE}`;
  let maps = cache.get(k);
  if (!maps) { maps = gen(SIZE); cache.set(k, maps); }
  const out = {};
  out.map = tex(key + ':a', () => maps.map, repeatFt, true);
  if (maps.normalMap) out.normalMap = tex(key + ':n', () => maps.normalMap, repeatFt, false);
  if (maps.roughnessMap) out.roughnessMap = tex(key + ':r', () => maps.roughnessMap, repeatFt, false);
  return out;
}

export function configureTextures({ size, anisotropy, high }) { SIZE = size; ANISO = anisotropy; HIGH = high; }
export function textureSize() { return SIZE; }

const PHYS_ONLY = ['sheen', 'sheenRoughness', 'sheenColor', 'clearcoat', 'clearcoatRoughness', 'ior', 'specularIntensity'];
const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => (HIGH ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(Object.fromEntries(Object.entries(o).filter(([k]) => !PHYS_ONLY.includes(k)))));
const half = (s, max = 512) => Math.min(s, max);

export function createMaterials() {
  const m = {
    wall: std({ roughness: 0.92 }),
    wall_ext: std({ color: '#3b3c3f', roughness: 0.85 }),
    ceiling: std({ roughness: 0.96, emissiveIntensity: 0.16 }),
    accent_panel: std({ roughness: 0.6 }),
    floor_wood: phys({ roughness: 1, clearcoat: 0.15, clearcoatRoughness: 0.35 }),
    floor_marble: phys({ roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.08 }),
    floor_tile: std({ roughness: 1 }),
    floor_deck: std({ roughness: 1 }),
    floor_stone: std({ roughness: 0.9 }),
    floor_grass: std({ roughness: 1 }),
    floor_concrete: std({ roughness: 0.9 }),
    floor_terrazzo: std({ roughness: 0.32 }),
    glass: phys({ color: '#dfeef0', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6, ior: 1.5, specularIntensity: 1 }),
    rail_glass: phys({ color: '#d8f0ee', roughness: 0.03, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
    frame: std({ color: '#2a2b2c', roughness: 0.38, metalness: 0.7 }),
    door: std({ roughness: 0.55 }),
    fabric: phys({ roughness: 0.95, sheen: 0.6, sheenRoughness: 0.6, sheenColor: '#ffffff' }),
    fabric2: phys({ roughness: 0.85, sheen: 0.8, sheenRoughness: 0.45, sheenColor: '#ffffff' }),
    linen: phys({ roughness: 0.95, sheen: 0.4, sheenRoughness: 0.7, sheenColor: '#ffffff' }),
    throw: phys({ roughness: 0.95, sheen: 0.6, sheenRoughness: 0.6, sheenColor: '#ffffff' }),
    furn_wood: std({ roughness: 1 }),
    cabinet: std({ roughness: 0.5 }),
    counter: phys({ roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.1 }),
    metal: std({ roughness: 0.3, metalness: 1 }),
    chrome: std({ color: '#e8e8e8', roughness: 0.08, metalness: 1 }),
    steel: std({ color: '#b9bcbf', roughness: 0.32, metalness: 1 }),
    ceramic: phys({ color: '#fbfbfa', roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.05 }),
    decor: std({ roughness: 0.55 }),
    leaf: std({ color: '#3d6a2e', roughness: 0.65, side: THREE.DoubleSide }),
    leaf2: std({ color: '#5a8a3c', roughness: 0.65, side: THREE.DoubleSide }),
    leaf3: std({ color: '#2f5527', roughness: 0.65, side: THREE.DoubleSide }),
    trunk: std({ color: '#5b4331', roughness: 0.9 }),
    soil: std({ color: '#3b2e24', roughness: 1 }),
    pot: std({ color: '#3a3b3e', roughness: 0.7 }),
    car_paint: phys({ color: '#1f3346', roughness: 0.25, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05 }),
    tyre: std({ color: '#151515', roughness: 0.9 }),
    dark_glass: std({ color: '#0b0e11', roughness: 0.06, metalness: 0.5 }),
    rug: std({ roughness: 1 }),
    screen: std({ color: '#050607', roughness: 0.12, metalness: 0.3 }),
    mirror: std({ color: '#e4ecef', roughness: 0.02, metalness: 1 }),
    lamp: std({ color: '#fff3dc', emissive: '#ffd9a0', emissiveIntensity: 1.2, roughness: 0.6 }),
    shade: std({ color: '#f3ece0', emissive: '#ffcf8a', emissiveIntensity: 0.15, roughness: 0.9, side: THREE.DoubleSide }),
    fixture: std({ color: '#ffffff', emissive: '#fff1d6', emissiveIntensity: 1, roughness: 0.4 }),
    wood_clad: std({ roughness: 0.6 }),
    jali: std({ color: '#2b2622', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide, alphaTest: 0.5 }),
    road: std({ color: '#ffffff', roughness: 0.95 }),
    sidewalk: std({ color: '#a9a49b', roughness: 0.9 }),
    water: std({ color: '#7fb6c9', roughness: 0.05, metalness: 0.2 }),
    laundry: std({ color: '#efede8', roughness: 0.45 }),
    seam: std({ color: '#c4c0b9', roughness: 0.6 }),
    appliance: std({ color: '#141516', roughness: 0.3, metalness: 0.25 }),
    baize: std({ color: '#1d6b3c', roughness: 0.95 }),
    leather: std({ color: '#7a1f1f', roughness: 0.45 }),
    pad: std({ color: '#1b1b1c', roughness: 0.55 }),
    rubber: std({ roughness: 0.92 }),
    yoga: std({ color: '#3d8c8a', roughness: 0.9 }),
    yoga2: std({ color: '#7d5aa6', roughness: 0.9 }),
    curtain: phys({ roughness: 0.95, side: THREE.DoubleSide, sheen: 0.5, sheenRoughness: 0.7, sheenColor: '#ffffff' }),
    grass_far: std({ color: '#557a3b', roughness: 1 }),
    neighbor: std({ color: '#e7e4de', roughness: 0.9 }),
    ext_stone: phys({ roughness: 1, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    ext_dark: std({ color: '#323336', roughness: 0.85 }),
    ext_frame: std({ color: '#2a2b2e', roughness: 0.7 }),
    gate_metal: std({ color: '#1b1c1e', roughness: 0.45, metalness: 0.6 }),
    fin_wood: phys({ roughness: 1, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
    k_gloss: phys({ roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04 }),
    k_top: phys({ roughness: 1, clearcoat: 0.5, clearcoatRoughness: 0.06 }),
    k_splash: phys({ roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.04 }),
    k_bronze: std({ roughness: 0.3, metalness: 1 }),
    k_shelf: std({ roughness: 0.6, emissiveIntensity: 0.25 }),
    k_fluted: phys({ color: '#d8d4cc', roughness: 0.35, transparent: true, opacity: 0.75, metalness: 0 }),
    k_glass: phys({ color: '#3a2c20', roughness: 0.08, transparent: true, opacity: 0.35, depthWrite: false }),
    tv: std({ roughness: 0.16, metalness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.32 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffc47a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    glowIn: new THREE.MeshBasicMaterial({ color: '#ffcf8f', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    glowRadial: new THREE.MeshBasicMaterial({ color: '#ffcf8f', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    books: ['#7a2e2e', '#2e4a7a', '#d8c9a8', '#3c5e3c', '#c9a24a', '#444444', '#e9e4da'].map((c) => std({ color: c, roughness: 0.8 })),
    art: [0, 1, 2, 3, 4, 5].map(() => std({ roughness: 0.85 })),
    path: new THREE.MeshBasicMaterial({ color: '#29d3c2', transparent: true, opacity: 0.85, depthWrite: false }),
    highlight: new THREE.MeshBasicMaterial({ color: '#29d3c2', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })
  };
  // theme-independent maps (capped at 512 px)
  m.floor_grass.map = tex('grass', () => TX.grass(half(SIZE)).map, 6);
  m.jali.alphaMap = tex('jali', () => TX.jaliStar(512).map, 3.2, false);
  Object.assign(m.ext_stone, pbr('extstone', (s) => TX.marble(half(s, 1024), { base: '#5a5b5f', vein: '#a3a4a7', vein2: '#36373a', tiles: 2, gloss: 0.35, veins: 0.8, seed: 83 }), 8));
  Object.assign(m.fin_wood, pbr('finwood', (s) => TX.wood(half(s), { base: '#8a5a32', dark: '#5c3a1e', light: '#a8743f', planks: 1, rows: 1, seed: 97, gloss: 0.4 }), 3));
  m.glow.map = tex('glowUp', () => TX.glowRamp(128, 'up').map, 1); m.glow.map.repeat.set(1, 1);
  m.glowIn.map = tex('glowDown', () => TX.glowRamp(128, 'down').map, 1); m.glowIn.map.repeat.set(1, 1);
  m.glowRadial.map = tex('glowRad', () => TX.glowRamp(128, 'radial').map, 1); m.glowRadial.map.repeat.set(1, 1);
  const tvt = tex('tvimg', () => TX.tvImage(512, 288).map, 1); tvt.repeat.set(1, 1); m.tv.map = tvt; m.tv.emissiveMap = tvt;
  Object.assign(m.road, pbr('road', (s) => TX.concrete(half(s), { base: '#45474a', seed: 31 }), 12));
  Object.assign(m.floor_stone, pbr('paving', (s) => TX.paving(half(s)), 6));
  Object.assign(m.floor_concrete, pbr('concrete', (s) => TX.concrete(half(s)), 8));
  m.floor_terrazzo.map = tex('terrazzo', () => TX.terrazzo(half(SIZE, 1024)).map, 4);
  Object.assign(m.floor_deck, pbr('deck', (s) => TX.wood(half(s), { base: '#8c6646', dark: '#6b4c33', light: '#a57c58', planks: 6, rows: 2, seed: 41, gloss: 0.7 }), 4));
  Object.assign(m.wood_clad, pbr('clad', (s) => TX.wood(half(s), { base: '#8a5c3a', dark: '#5e3c24', light: '#a87650', planks: 8, rows: 1, seed: 91, gloss: 0.55 }), 4));
  Object.assign(m.rubber, pbr('rubber', (s) => TX.ceramicTiles(half(s), { base: '#2a2c2e', grout: '#17181a', n: 2, seed: 43, gloss: 0.9 }), 4));
  return m;
}

function floorMaps(spec, key) {
  const r = spec.repeat || 6;
  if (spec.kind === 'wood') return pbr(key, (s) => TX.wood(s, spec), r);
  if (spec.kind === 'marble') return pbr(key, (s) => TX.marble(s, spec), r);
  return pbr(key, (s) => TX.stoneTile(s, spec), r);
}
function setMaps(mat, maps, { color = '#ffffff', roughness } = {}) {
  mat.map = maps.map || null; mat.normalMap = maps.normalMap || null; mat.roughnessMap = maps.roughnessMap || null;
  mat.color.set(color);
  if (roughness !== undefined) mat.roughness = roughness; else if (maps.roughnessMap) mat.roughness = 1;
}

/** Applies a theme by mutating the shared materials in place (no scene rebuild, no reload). */
export function applyTheme(m, key) {
  const T = THEMES[key] || THEMES[DEFAULT_THEME]; const K = 'th:' + key + ':';
  const used = new Set();
  const track = (o) => { for (const t of Object.values(o)) if (t && t.userData) used.add(t.userData.key); return o; };

  setMaps(m.wall, track(pbr(K + 'wall', (s) => TX.plaster(half(s), { base: T.wall }), 8)), { roughness: 0.92 });
  m.ceiling.color.set(T.ceiling); m.ceiling.emissive.set(T.ceiling);
  setMaps(m.floor_marble, track(floorMaps(T.floors.marble, K + 'fm')));
  setMaps(m.floor_wood, track(floorMaps(T.floors.wood, K + 'fw')));
  setMaps(m.floor_tile, track(floorMaps(T.floors.tile, K + 'ft')));
  if (m.floor_marble.isMeshPhysicalMaterial) m.floor_marble.clearcoat = T.floors.marble.kind === 'marble' ? 0.35 : 0.12;

  const A = T.accent;
  if (A.kind === 'paint') setMaps(m.accent_panel, track(pbr(K + 'acc', (s) => TX.plaster(half(s), { base: A.color, amount: 0.06, seed: 77 }), 6)), { roughness: 0.85 });
  else setMaps(m.accent_panel, track(pbr(K + 'acc', (s) => TX.panel(half(s, 1024), A), A.kind === 'flute' ? 3.2 : 3.0)));

  setMaps(m.fabric, track(pbr(K + 'fab', (s) => TX.fabric(half(s), { base: T.fabric, boucle: T.fabricBoucle, seed: 19 }), 1.2)), { roughness: 0.95 });
  setMaps(m.fabric2, track(pbr(K + 'fab2', (s) => TX.fabric(half(s), { base: T.fabric2, seed: 23, weave: 64 }), 1.0)), { roughness: 0.85 });
  setMaps(m.throw, track(pbr(K + 'thr', (s) => TX.fabric(half(s, 256), { base: T.throw, seed: 29, weave: 24 }), 0.8)), { roughness: 0.95 });
  m.linen.color.set(T.linen); m.curtain.color.set(T.curtain);
  setMaps(m.furn_wood, track(pbr(K + 'fwood', (s) => TX.wood(half(s), { ...T.furnWood, planks: 2, rows: 1, seed: 51, gloss: 0.45, grain: 0.9 }), 2.2)));
  setMaps(m.door, track(pbr(K + 'door', (s) => TX.wood(half(s), { ...T.furnWood, planks: 1, rows: 1, seed: 57, gloss: 0.5 }), 3.5)));
  m.cabinet.color.set(T.cabinet.color); m.cabinet.roughness = T.cabinet.roughness; m.cabinet.metalness = T.cabinet.metalness;
  setMaps(m.counter, track(pbr(K + 'ctr', (s) => TX.marble(half(s), { ...T.counter, tiles: 1, gloss: 0.08, seed: 61 }), 3)));
  m.metal.color.set(T.metal.color); m.metal.roughness = T.metal.roughness; m.metal.metalness = T.metal.metalness;
  setMaps(m.rug, track(pbr(K + 'rug', (s) => TX.rug(half(s), { ...T.rug, seed: 71 }), 1)));
  m.decor.color.set(T.decor);
  m.art.forEach((mat, i) => { const t = tex(K + 'art' + i, () => TX.art(half(SIZE), T.art, i, 3).map, 1); used.add(t.userData.key); mat.map = t; mat.color.set('#ffffff'); });
  const KT = T.kitchen;
  m.k_gloss.color.set(KT.gloss); m.k_bronze.color.set(KT.bronze); m.k_shelf.color.set(KT.shelf); m.k_shelf.emissive.set(KT.shelf);
  setMaps(m.k_top, track(pbr(K + 'ktop', (s) => TX.marble(half(s), { base: KT.top[0], vein: KT.top[1], vein2: KT.top[2], tiles: 0, gloss: 0.1, veins: 0.5, seed: 87 }), 10)));
  setMaps(m.k_splash, track(pbr(K + 'ksplash', (s) => TX.marble(half(s, 1024), { base: KT.splash[0], vein: KT.splash[1], vein2: KT.splash[2], tiles: 0, gloss: 0.06, veins: 1.2, seed: 89 }), 6)));
  const warm = new THREE.Color(kelvinToRGB(T.kelvin));
  m.lamp.emissive.copy(warm); m.fixture.emissive.copy(warm); m.shade.emissive.copy(warm);

  for (const v of Object.values(m)) { if (Array.isArray(v)) v.forEach((x) => { x.needsUpdate = true; }); else v.needsUpdate = true; }
  // free GPU textures of themes that are no longer in use (keeps mobile memory flat when switching)
  for (const [k, t] of [...cache.entries()]) {
    if (!k.startsWith('th:')) continue;
    if (t.isTexture && !used.has(t.userData.key)) { t.dispose(); cache.delete(k); }
  }
  for (const k of [...cache.keys()]) if (k.startsWith('pbr:th:') && !k.startsWith('pbr:' + K)) cache.delete(k);
  return T;
}

/** Approximate blackbody colour (Tanner Helland) for 1000-12000 K. */
export function kelvinToRGB(k) {
  const t = k / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
