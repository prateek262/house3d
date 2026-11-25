import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { kelvinToRGB } from './materials.js';

// Time-of-day presets. Sun azimuth: 0 = south (+z, road side, assumed), 90 = east (+x), 270 = west.
export const TIMES = {
  day: { glow: 0.12, label: 'Day', elev: 40, azim: 322, sun: 3.0, sunColor: '#fff4e6', hemi: 0.32, env: 1.0, lamps: 0, fixture: 0.2, window: 2.2, windowColor: '#e8f0ff', exposure: 1.0, turbidity: 4.5, rayleigh: 1.2, bg: null },
  golden: { glow: 0.55, label: 'Golden hour', elev: 8, azim: 262, sun: 2.4, sunColor: '#ffae66', hemi: 0.16, env: 0.7, lamps: 5, fixture: 1.4, window: 1.0, windowColor: '#ffd8b0', exposure: 0.98, turbidity: 8, rayleigh: 2.6, bg: null },
  twilight: { glow: 1.0, label: 'Twilight', elev: 1.5, azim: 250, sun: 0.12, sunColor: '#8ea2ff', hemi: 0.06, env: 0.42, lamps: 9, fixture: 3.0, window: 0.15, windowColor: '#8ea0d0', exposure: 0.95, turbidity: 1.5, rayleigh: 3.5, bg: null }
};

const SHADOW_BOX = { cx: 20.5, cy: 10, cz: 28, half: 44 };

export class Lighting {
  constructor(scene, renderer, { pointLights = 8, rectLights = 4, shadowSize = 2048, softShadows = true } = {}) {
    this.scene = scene; this.renderer = renderer; this.time = 'day'; this.kelvin = 2850; this.mats = null;
    renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    RectAreaLightUniformsLib.init();

    this.sky = new Sky(); this.sky.scale.setScalar(6000); this.sky.userData.noAO = true; scene.add(this.sky);
    const u = this.sky.material.uniforms; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;

    this.hemi = new THREE.HemisphereLight('#e6eefc', '#b9a68c', 0.3); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e5', 3); this.sun.castShadow = true;
    const c = this.sun.shadow.camera; c.left = -SHADOW_BOX.half; c.right = SHADOW_BOX.half; c.top = SHADOW_BOX.half; c.bottom = -SHADOW_BOX.half; c.near = 1; c.far = 500;
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.05;
    this.sun.target.position.set(SHADOW_BOX.cx, SHADOW_BOX.cy, SHADOW_BOX.cz); scene.add(this.sun); scene.add(this.sun.target);
    this.setShadowSize(shadowSize);

    this.points = []; for (let i = 0; i < pointLights; i++) { const p = new THREE.PointLight('#ffd8a8', 0, 26, 1.5); scene.add(p); this.points.push(p); }
    this.rects = []; for (let i = 0; i < rectLights; i++) { const r = new THREE.RectAreaLight('#e8f0ff', 0, 4, 4); scene.add(r); this.rects.push(r); }
    this.fixtures = []; this.windows = []; this.li = 0;
  }

  setShadowSize(n) {
    this.sun.shadow.mapSize.set(n, n);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.invalidateShadows();
  }
  invalidateShadows() { this.renderer.shadowMap.needsUpdate = true; }

  setSources(fixtures, windows, mats) { this.fixtures = fixtures; this.windows = windows; this.mats = mats; }

  /** Re-targets the fixed light pools to the given level (no shader recompiles: pool sizes never change). */
  assign(li) {
    this.li = li;
    const order = [...this.fixtures].filter((f) => !f.outdoor || f.li === li).sort((a, b) => (Math.abs(a.li - li) - Math.abs(b.li - li)) || (b.area - a.area));
    this.points.forEach((p, i) => { const f = order[i]; p.visible = !!f; if (f) p.position.set(f.x, f.y, f.z); });
    const perRoom = new Map();
    const win = [...this.windows].filter((w) => w.li === li).sort((a, b) => b.area - a.area).filter((w) => { const n = perRoom.get(w.room) || 0; perRoom.set(w.room, n + 1); return n < 1; });
    this.rects.forEach((r, i) => {
      const w = win[i]; r.visible = !!w; if (!w) return;
      r.width = w.w; r.height = w.h; r.position.set(w.x, w.y, w.z); r.lookAt(w.x + w.nx, w.y, w.z + w.nz);
      r.userData.area = w.area;
    });
    this.applyIntensities();
  }

  applyIntensities() {
    const T = TIMES[this.time]; const warm = new THREE.Color(kelvinToRGB(this.kelvin));
    this.points.forEach((p) => { p.intensity = T.lamps; p.color.copy(warm); });
    this.rects.forEach((r) => { r.intensity = T.window * Math.min(1.2, 0.55 + (r.userData.area || 20) / 60); r.color.set(T.windowColor); });
  }

  setKelvin(k) { this.kelvin = k; this.applyIntensities(); }

  setTime(key) {
    this.time = key; const T = TIMES[key];
    const phi = THREE.MathUtils.degToRad(90 - T.elev); const theta = THREE.MathUtils.degToRad(T.azim);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 220);
    this.sun.color.set(T.sunColor); this.sun.intensity = T.elev > 0 ? T.sun : 0; this.sun.castShadow = T.elev > 0;
    this.hemi.intensity = T.hemi; this.scene.environmentIntensity = T.env;
    const u = this.sky.material.uniforms; u.sunPosition.value.copy(dir); u.turbidity.value = T.turbidity; u.rayleigh.value = T.rayleigh;
    this.renderer.toneMappingExposure = T.exposure;
    if (this.mats) { this.mats.glow.color.set('#ffc47a').multiplyScalar(T.glow); this.mats.glowIn.color.set('#ffcf8f').multiplyScalar(0.45 + T.glow * 0.4); this.mats.glowRadial.color.set('#ffcf8f').multiplyScalar(0.35 + T.glow * 0.4); this.mats.tv.emissiveIntensity = 0.3 + T.glow * 0.15; this.mats.ceiling.emissiveIntensity = key === 'day' ? 0.16 : key === 'golden' ? 0.12 : 0.05; this.mats.fixture.emissiveIntensity = T.fixture; this.mats.lamp.emissiveIntensity = Math.max(0.8, T.fixture * 0.9); this.mats.shade.emissiveIntensity = T.lamps > 0 ? 0.9 : 0.12; }
    this.scene.fog = new THREE.Fog(key === 'twilight' ? '#2a3550' : '#d3dce4', 260, 1100);
    this.applyIntensities(); this.invalidateShadows();
  }
}

/**
 * Bakes environment maps (reflections + image-based ambient light) from the actual model at one probe per floor,
 * plus an outdoor probe. Maps are re-baked lazily after theme / time-of-day changes.
 */
export class EnvBaker {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene; this.pmrem = new THREE.PMREMGenerator(renderer);
    this.base = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    this.cam = new THREE.CubeCamera(0.4, 1500, this.rt);
    this.maps = new Map(); this.dirty = new Set(); this.probes = new Map(); this.hide = () => [];
  }
  setProbe(key, p) { this.probes.set(key, p); this.dirty.add(key); }
  invalidateAll() { for (const k of this.probes.keys()) this.dirty.add(k); }
  has(key) { return this.maps.has(key) && !this.dirty.has(key); }
  get(key) { return this.maps.get(key)?.texture || this.maps.get('out')?.texture || this.base; }
  bake(key) {
    const p = this.probes.get(key); if (!p) return this.base;
    const hidden = this.hide(); const prevEnv = this.scene.environment; const prevFog = this.scene.fog;
    this.scene.environment = this.maps.get(key)?.texture || this.maps.get('out')?.texture || this.base; this.scene.fog = null;
    this.cam.position.set(p.x, p.y, p.z); this.cam.update(this.renderer, this.scene);
    const old = this.maps.get(key); const rt = this.pmrem.fromCubemap(this.rt.texture); this.maps.set(key, rt);
    if (old) old.dispose();
    this.scene.environment = prevEnv === old?.texture ? rt.texture : prevEnv; this.scene.fog = prevFog;
    hidden.forEach((o) => { o.visible = true; });
    this.dirty.delete(key);
    return rt.texture;
  }
  /** Bakes at most one dirty probe (call from idle frames to spread the cost). */
  bakeNextDirty(priority = []) {
    const k = priority.find((x) => this.dirty.has(x)) || [...this.dirty][0];
    if (k !== undefined) { this.bake(k); return true; }
    return false;
  }
}
