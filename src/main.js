import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import houseMetric from './data/house.json';
import { toSceneUnits, fmtArea, fmtDims, M_PER_FT } from './core/units.js';
import * as G from './core/geometry.js';
import { createMaterials, applyTheme, THEMES, DEFAULT_THEME, configureTextures } from './scene/materials.js';
import { configureFurniture } from './scene/furniture.js';
import { buildHouse } from './scene/builder.js';
import { Lighting, EnvBaker, TIMES } from './scene/lighting.js';
import { Post } from './scene/post.js';
import { Walker, setupTouch } from './controls/walker.js';
import { hvacSummary, IDU, DIVERSITY, tankLoad } from './core/hvac.js';
import { solarSummary, SPECIFIC_YIELD } from './core/solar.js';

// The structured model is authored in metres; the engine runs in internal feet units (see core/units.js).
const house = toSceneUnits(houseMetric);
const LV = house.levels;
const $ = (id) => document.getElementById(id);
const SHORT = { GF: 'GF', FF: 'FF', SF: 'SF', TR: 'Terrace' };
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

// ------------------------------------------------------------------ quality tiers
const TIERS = {
  high: { label: 'High (desktop)', dpr: 2, minDpr: 1, shadow: 2048, soft: true, post: true, msaa: 4, ao: true, bloom: true, points: 8, rects: 4, tex: 1024 },
  balanced: { label: 'Balanced', dpr: 1.5, minDpr: 0.9, shadow: 2048, soft: true, post: true, msaa: 4, ao: false, bloom: true, points: 6, rects: 2, tex: 1024 },
  performance: { label: 'Performance (mobile)', dpr: 1.25, minDpr: 0.7, shadow: 1024, soft: false, post: false, msaa: 0, ao: false, bloom: false, points: 3, rects: 0, tex: 512 }
};
function detectTier() {
  const q = new URLSearchParams(location.search).get('quality'); if (TIERS[q]) return q;
  const saved = localStorage.getItem('tr-quality'); if (TIERS[saved]) return saved;
  if (isTouch || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency || 8) <= 4) return 'performance';
  return 'high';
}
let tierKey = detectTier(); let tier = TIERS[tierKey];
configureTextures({ size: tier.tex, anisotropy: isTouch ? 4 : 8, high: tierKey !== 'performance' });
configureFurniture({ lowPoly: tierKey === 'performance' });

// ------------------------------------------------------------------ renderer / cameras
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
let maxDpr = Math.min(devicePixelRatio, tier.dpr); let curDpr = maxDpr;
renderer.setPixelRatio(curDpr); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
$('viewport').appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none' });
$('viewport').appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.25, 1500);
const presentCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.25, 2000);
const orbitCam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 5000);
orbitCam.position.set(96, 58, 128);
const planCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
/** Vertical FOV that keeps roughly `hfov` degrees horizontally, clamped for portrait screens. */
function fitFov(cam, hfov, min, max) {
  const a = innerWidth / innerHeight; const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov) / 2) / a));
  cam.fov = Math.max(min, Math.min(max, v)); cam.aspect = a; cam.updateProjectionMatrix();
}
function fitCameras() { fitFov(camera, 84, 50, 80); fitFov(presentCam, 78, 46, 76); orbitCam.aspect = innerWidth / innerHeight; orbitCam.updateProjectionMatrix(); }
fitCameras();

const orbit = new OrbitControls(orbitCam, renderer.domElement);
orbit.target.set(20.5, 14, 26); orbit.enableDamping = true; orbit.dampingFactor = 0.06; orbit.maxPolarAngle = Math.PI * 0.49;
orbit.minDistance = 20; orbit.maxDistance = 420; orbit.autoRotateSpeed = 0.35; orbit.enabled = false;
orbit.addEventListener('start', () => { orbit.autoRotate = false; });

// ------------------------------------------------------------------ state & helpers
const state = { mode: 'orbit', viewLevel: LV.length, playerLi: 0, selected: null, tour: null, showPath: true, started: false };
const levelOfRoom = new Map(); LV.forEach((L, li) => L.rooms.forEach((r) => levelOfRoom.set(r.id, li)));
const roomById = new Map(); LV.forEach((L) => L.rooms.forEach((r) => roomById.set(r.id, r)));
let M, built, colliders, surfaces, nav, walker, lighting, baker, post, themeKey = localStorage.getItem('tr-theme') || DEFAULT_THEME, timeKey = 'day';
if (!THEMES[themeKey]) themeKey = DEFAULT_THEME;
let forceFrames = 2; const forceRender = (n = 2) => { forceFrames = Math.max(forceFrames, n); };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const reflectors = [];

function toast(msg, ms = 2200) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function caption(msg) { const c = $('caption'); if (!msg) { c.classList.add('hidden'); return; } c.innerHTML = msg; c.classList.remove('hidden'); }
function fade(cb, hold = 120) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { cb(); forceRender(4); setTimeout(() => f.classList.remove('on'), hold); }, 460); }
function roomDims(room) { const bb = G.roomBBox(room); return { w: bb[2] - bb[0], d: bb[3] - bb[1], area: G.roomArea(room) }; }
const HV = hvacSummary(house); const acByRoom = new Map((HV?.rooms || []).map((r) => [r.room.id, r]));
function acText(room) {
  const r = acByRoom.get(room.id); if (!r || !r.units.length) return '';
  const groups = {}; for (const u of r.units) { const k = `${u.kw} kW ${u.family === 'compact' ? 'compact' : 'round-flow'}`; groups[k] = (groups[k] || 0) + 1; }
  return ` · AC: ${Object.entries(groups).map(([k, n]) => `${n}× ${k}`).join(' + ')} cassette`;
}
function roomMeta(room, li) {
  const d = roomDims(room); const label = room.planLabel ? ` · drawing: ${room.planLabel.text}` : '';
  return `${LV[li].name} · ${fmtDims(d.w, d.d)} · ${fmtArea(d.area)}${acText(room)}${label}`;
}
const currentCam = () => (state.mode === 'walk' ? camera : state.mode === 'present' ? presentCam : state.mode === 'plan' ? planCam : orbitCam);

// player marker (plan/orbit), route dots, room highlight
const marker = new THREE.Group();
const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 20), new THREE.MeshBasicMaterial({ color: '#c9a36b' }));
cone.rotation.x = -Math.PI / 2; cone.position.y = 1.2; marker.add(cone);
const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 32), new THREE.MeshBasicMaterial({ color: '#c9a36b', side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; marker.add(ring); marker.userData.noAO = true; scene.add(marker);
const MAX_DOTS = 1500; let dots; const highlight = new THREE.Group(); scene.add(highlight);

// room labels for the plan view (metric)
const labels = [];
LV.forEach((L, li) => {
  for (const room of L.rooms) {
    if (room.type === 'shaft') continue;
    const div = document.createElement('div'); div.className = 'room-label';
    const d = roomDims(room);
    div.innerHTML = `<b>${room.name}</b><span>${room.rects.length === 1 ? fmtDims(d.w, d.d) : fmtArea(d.area)}</span>`;
    const [ax, az] = G.roomAnchor(room);
    const o = new CSS2DObject(div); o.position.set(ax, L.y + 0.5, az); o.visible = false; o.userData.li = li;
    scene.add(o); labels.push(o);
  }
});

// ------------------------------------------------------------------ init (staged so the loader can show progress)
async function init() {
  const timings = (window.__timings = []); let tPrev = performance.now();
  const step = async (label, p) => { const now = performance.now(); timings.push([label, Math.round(now - tPrev)]); tPrev = now; $('loadState').textContent = label; $('loadBar').style.width = `${Math.round(p * 100)}%`; await nextFrame(); tPrev = performance.now(); };
  await step('Generating materials…', 0.08);
  M = createMaterials();
  await step('Applying interior theme…', 0.22);
  const T = applyTheme(M, themeKey);
  await step('Building architecture & furniture…', 0.45);
  built = buildHouse(house, M);
  built.levelGroups.forEach((g) => scene.add(g)); scene.add(built.roofGroup); scene.add(built.exterior); scene.add(built.exteriorUpper); scene.add(built.servicesOverlay);
  built.levelGroups.forEach((g) => g.traverse((o) => { if (o.userData.isReflector) reflectors.push(o); }));
  dots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), M.path, MAX_DOTS);
  dots.count = 0; dots.frustumCulled = false; dots.renderOrder = 3; dots.userData.noAO = true; scene.add(dots);
  await step('Computing navigation…', 0.62);
  colliders = G.buildColliders(house); surfaces = G.buildSurfaces(house); nav = G.buildNav(house, colliders, surfaces);
  walker = new Walker(camera, renderer.domElement, { colliders, surfaces });
  walker.onManualInput = () => stopTour('Tour stopped — you have control');
  setupTouch(walker, $('joy'), $('knob'), $('lookPad'));
  walker.teleport(17.0, 47.5, 0, 0);
  await step('Setting up lighting…', 0.74);
  lighting = new Lighting(scene, renderer, { pointLights: tier.points, rectLights: tier.rects, shadowSize: tier.shadow, softShadows: tier.soft });
  lighting.setSources(built.fixtures, built.windowLights, M); lighting.setKelvin(T.kelvin); lighting.setTime(timeKey); lighting.assign(0);
  post = new Post(renderer, scene); post.setTier(tier, currentCam());
  baker = new EnvBaker(renderer, scene);
  baker.hide = () => { const list = [marker, dots, highlight, built.servicesOverlay, ...reflectors].filter((o) => o.visible); list.forEach((o) => { o.visible = false; }); return list; };
  baker.setProbe('out', built.outdoorProbe);
  for (const p of built.probes) baker.setProbe('L' + p.li, p);
  await step('Baking reflections…', 0.86);
  baker.bake('out'); scene.environment = baker.get('out');
  await step('Baking interior light…', 0.95);
  baker.bake('L0');
  await step('Ready', 1);
  $('loadState').textContent = `${LV.length} levels · ${LV.reduce((a, L) => a + L.rooms.length, 0)} spaces · ${THEMES[themeKey].name}`;
  ['startPresent', 'startWalk', 'startOrbit'].forEach((id) => { $(id).disabled = false; });
  buildThemeCards(); buildTimeSeg(); buildQuality(); buildFacts();
  orbit.enabled = true; orbit.autoRotate = true; setMode('orbit', true);
  forceRender(4);
}

// ------------------------------------------------------------------ visibility & modes
function updateVisibility() {
  if (!built) return;
  const m = state.mode; const v = state.viewLevel; const full = m === 'walk' || m === 'present' || v >= LV.length;
  built.levelGroups.forEach((g, i) => { g.visible = full || i <= v; });
  built.roofGroup.visible = full;
  built.exteriorUpper.visible = full || v >= 2;
  built.servicesOverlay.children.forEach((g) => { g.visible = full || g.userData.li < 0 || g.userData.li === Math.min(v, LV.length - 1) || (m === 'orbit' && g.userData.li <= v); });
  labels.forEach((o) => { o.visible = m === 'plan' && o.userData.li === Math.min(v, LV.length - 1); });
  marker.visible = m === 'plan' || m === 'orbit';
  highlight.visible = m === 'plan' || m === 'orbit';
  lighting?.invalidateShadows(); forceRender(3);
}

function setMode(mode, silent) {
  if (state.mode === 'present' && mode !== 'present') endPresentation(true);
  state.mode = mode;
  document.body.classList.remove('mode-walk', 'mode-plan', 'mode-orbit', 'mode-present'); document.body.classList.add('mode-' + mode);
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  if (walker) walker.enabled = mode === 'walk';
  orbit.enabled = mode === 'orbit';
  if (mode !== 'walk' && document.pointerLockElement) document.exitPointerLock();
  if (mode === 'walk') state.viewLevel = state.playerLi;
  if (mode === 'plan' && state.viewLevel >= LV.length) state.viewLevel = state.playerLi;
  $('touchUI').classList.toggle('hidden', !(isTouch && mode === 'walk' && state.started));
  post?.setCamera(currentCam());
  if (!silent) { buildLevelButtons(); renderRoomList(); }
  updateVisibility(); fitPlan();
}

function buildLevelButtons() {
  const wrap = $('levels'); wrap.innerHTML = '';
  const items = LV.map((L, i) => [i, SHORT[L.id] || L.id]);
  if (state.mode !== 'walk') items.push([LV.length, 'All']);
  for (const [i, name] of items) {
    const b = document.createElement('button'); b.textContent = name;
    b.classList.toggle('active', state.mode === 'walk' ? i === state.playerLi : i === state.viewLevel);
    b.title = i < LV.length ? LV[i].name : 'Whole building';
    b.onclick = () => { if (state.mode === 'walk') goToLevel(i); else { state.viewLevel = i; buildLevelButtons(); updateVisibility(); renderRoomList(); } };
    wrap.appendChild(b);
  }
  requestAnimationFrame(layoutTop);
}

function renderRoomList() {
  const li = Math.min(state.mode === 'walk' ? state.playerLi : state.viewLevel, LV.length - 1);
  $('roomsLevel').textContent = '· ' + LV[li].name;
  const ul = $('roomList'); ul.innerHTML = '';
  for (const room of LV[li].rooms) {
    if (room.accessible === false || room.type === 'void' || room.type === 'shaft') continue;
    const d = roomDims(room);
    const el = document.createElement('li');
    el.innerHTML = `<div><div class="nm">${room.name}</div><div class="dm">${fmtDims(d.w, d.d)} · ${fmtArea(d.area)}</div></div>`;
    const tp = document.createElement('button'); tp.className = 'tp'; tp.textContent = 'Go'; tp.title = 'Guided walk to this room';
    tp.onclick = (e) => { e.stopPropagation(); navigateTo(li, room); };
    el.appendChild(tp); el.onclick = () => selectRoom(li, room);
    if (state.selected && state.selected.room === room) el.classList.add('sel');
    ul.appendChild(el);
  }
}

function selectRoom(li, room) {
  state.selected = { li, room }; highlight.clear();
  for (const r of room.rects) {
    const g = new THREE.PlaneGeometry(r[2] - r[0], r[3] - r[1]); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, M.highlight); m.position.set((r[0] + r[2]) / 2, LV[li].y + 0.08, (r[1] + r[3]) / 2); m.renderOrder = 4; highlight.add(m);
  }
  $('rcTitle').textContent = room.name; $('rcMeta').textContent = roomMeta(room, li);
  $('roomCard').classList.remove('hidden'); renderRoomList(); forceRender();
}

// ------------------------------------------------------------------ navigation
function targetFor(li, room) { return room.type === 'stair' ? house.stairs.entry : G.roomTarget(nav, li, room); }
function samplePath(route) {
  const pts = []; let y = LV[route[0].li].y;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i]; const d = Math.hypot(b.x - a.x, b.z - a.z); const n = Math.max(1, Math.floor(d / 0.9));
    for (let k = 0; k < n; k++) { const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n; const g = G.groundAt(surfaces, x, z, y + 0.9); if (g !== -Infinity) y = g; pts.push([x, y, z]); }
  }
  return pts;
}
function showRoute(route) {
  if (!route || !state.showPath) { dots.count = 0; return; }
  const pts = samplePath(route).slice(0, MAX_DOTS); const m = new THREE.Matrix4();
  pts.forEach((p, i) => { m.makeTranslation(p[0], p[1] + 0.07, p[2]); dots.setMatrixAt(i, m); });
  dots.count = pts.length; dots.instanceMatrix.needsUpdate = true;
}
function navigateTo(li, room, onDone) {
  const t = targetFor(li, room); if (!t) { toast('No reachable point inside ' + room.name); return; }
  const route = G.planRoute(nav, { li: state.playerLi, x: walker.pos.x, z: walker.pos.z }, { li, x: t[0], z: t[1] });
  if (!route) { toast('No route found to ' + room.name); if (onDone) onDone(false); return; }
  if (state.mode !== 'walk') setMode('walk');
  showRoute(route); $('roomCard').classList.add('hidden');
  toast(`Walking to ${room.name} (${(G.pathLength(route) * M_PER_FT).toFixed(0)} m)`);
  walker.follow(route, (ok) => { dots.count = 0; if (ok) toast('Arrived: ' + room.name); if (onDone) onDone(ok); });
}
function teleportTo(li, room) {
  const t = targetFor(li, room); if (!t) return;
  fade(() => {
    setMode('walk'); const [ax, az] = G.roomAnchor(room);
    walker.teleport(t[0], t[1], LV[li].y, Math.atan2(-(ax - t[0]) || -0.001, -(az - t[1]) || -1), -0.05);
    dots.count = 0; $('roomCard').classList.add('hidden');
  });
}
function goToLevel(li) {
  if (li < 0 || li >= LV.length || li === state.playerLi) return;
  const st = house.stairs; const p = li > state.playerLi ? st.exit : st.entry;
  const route = G.planRoute(nav, { li: state.playerLi, x: walker.pos.x, z: walker.pos.z }, { li, x: p[0], z: p[1] });
  if (!route) { toast('No route to ' + LV[li].name); return; }
  showRoute(route); toast(`Taking the stairs to the ${LV[li].name}`);
  walker.follow(route, (ok) => { dots.count = 0; if (ok) toast('Arrived: ' + LV[li].name); });
}

// ------------------------------------------------------------------ guided walk
const TOUR = [
  ['gf-porch', 'Entrance porch under the cantilevered first-floor balcony.'],
  ['gf-living', 'Living & foyer beside the courtyard garden.'],
  ['gf-dining', 'Dining under the triple-height atrium with full-height courtyard glazing.'],
  ['gf-kitchen', 'Open kitchen with a peninsula, sink and breakfast ledge.'],
  ['gf-store', 'Utility / laundry with a second door to the courtyard.'],
  ['gf-bedroom', 'Ground-floor bedroom with walk-through dressing and toilet.'],
  ['ff-living', 'First-floor family lounge opening to the front balcony.'],
  ['ff-office', 'Home office.'],
  ['ff-bedroom', 'Master bedroom with dressing and bath.'],
  ['sf-balcony', 'Covered balcony staged as a snooker lounge.'],
  ['sf-bedroom', 'Second-floor bedroom with a round bed.'],
  ['tr-living', 'Terrace room staged as a home gym.'],
  ['tr-pergola', 'Pergola deck overlooking the street.']
];
function stopTour(msg) { if (!state.tour) return; state.tour = null; $('tourBtn').textContent = 'Guided walk'; caption(null); clearTimeout(stopTour._t); if (msg) toast(msg); }
function runTour(i = 0) {
  if (!state.tour) return;
  if (i >= TOUR.length) { stopTour('Tour complete'); return; }
  const [id, text] = TOUR[i]; const room = roomById.get(id); const li = levelOfRoom.get(id);
  caption(`<b>${i + 1}/${TOUR.length} · ${room.name}</b><br><span class="muted">${text}</span>`);
  navigateTo(li, room, (ok) => { if (!state.tour) return; if (!ok) { stopTour('Tour stopped'); return; } stopTour._t = setTimeout(() => runTour(i + 1), 2400); });
}

// ------------------------------------------------------------------ cinematic presentation
const SHOTS = house.presentation || [];
const pres = { i: 0, t: 0, playing: true, dur: 8.5, switching: false };
const ease = (x) => x * x * (3 - 2 * x);
function buildDots() {
  const d = $('ptDots'); d.innerHTML = '';
  SHOTS.forEach((s, i) => { const e = document.createElement('i'); e.title = s.title; e.onclick = () => goShot(i); d.appendChild(e); });
}
function startPresentation(i = 0) {
  leaveIntro(); stopTour(); if (document.pointerLockElement) document.exitPointerLock();
  $('roomCard').classList.add('hidden'); document.body.classList.remove('panel-open');
  fade(() => {
    if (state.mode !== 'present') { state.prevMode = state.mode; }
    state.mode = 'present'; document.body.classList.remove('mode-walk', 'mode-plan', 'mode-orbit'); document.body.classList.add('mode-present');
    walker.enabled = false; orbit.enabled = false; $('touchUI').classList.add('hidden'); $('presentBar').classList.remove('hidden');
    post.setCamera(presentCam); updateVisibility(); pres.playing = true; $('ptPause').textContent = '❚❚';
    setShot(i);
  }, 300);
}
function setShot(i) {
  pres.i = (i + SHOTS.length) % SHOTS.length; pres.t = 0; pres.switching = false;
  const s = SHOTS[pres.i]; const li = s.level ? LV.findIndex((L) => L.id === s.level) : 0;
  pres.li = Math.max(0, li); lighting.assign(pres.li);
  $('ptKicker').textContent = s.kind === 'exterior' ? 'Exterior' : LV[pres.li].name;
  $('ptTitle').textContent = s.title; $('ptCaption').textContent = s.caption;
  const lt = document.querySelector('.lower-third'); lt.classList.add('out'); setTimeout(() => lt.classList.remove('out'), 250);
  [...$('ptDots').children].forEach((e, k) => e.classList.toggle('on', k === pres.i));
  updatePresentCamera(0);
}
function goShot(i) { if (pres.switching) return; pres.switching = true; fade(() => setShot(i)); }
function updatePresentCamera(dt) {
  const s = SHOTS[pres.i]; if (!s) return;
  if (pres.playing && !pres.switching) pres.t += dt;
  const k = ease(Math.min(1, pres.t / pres.dur));
  if (s.kind === 'exterior') {
    const [tx, ty, tz] = s.target; const [cx, cy, cz] = s.camera; const a = (s.orbit || 0.15) * (k - 0.5) * 2;
    const dx = cx - tx, dz = cz - tz; const ca = Math.cos(a), sa = Math.sin(a);
    presentCam.position.set(tx + dx * ca - dz * sa, cy - k * 4, tz + dx * sa + dz * ca); presentCam.lookAt(tx, ty, tz);
    presentCam.fov = 38; presentCam.updateProjectionMatrix();
  } else {
    const y = LV[pres.li].y + G.PLAYER.eye; const [ex, ez] = s.eye; const [lx, lz] = s.look;
    const dx = lx - ex, dz = lz - ez; const d = Math.hypot(dx, dz) || 1; const ux = dx / d, uz = dz / d;
    const dist = (s.dolly || 1.5) * k; const yaw = Math.atan2(-ux, -uz) + Math.sin((k - 0.5) * Math.PI) * 0.06;
    presentCam.position.set(ex + ux * dist, y, ez + uz * dist); presentCam.rotation.order = 'YXZ'; presentCam.rotation.set(-0.07, yaw, 0);
    fitFov(presentCam, 78, 46, 76);
  }
  if (pres.playing && !pres.switching && pres.t > pres.dur) goShot(pres.i + 1);
}
function endPresentation(silent) {
  $('presentBar').classList.add('hidden'); document.body.classList.remove('mode-present');
  if (!silent) setMode(state.prevMode && state.prevMode !== 'present' ? state.prevMode : 'orbit');
}
function exploreFromShot() {
  const s = SHOTS[pres.i];
  fade(() => {
    endPresentation(true);
    if (s.kind === 'exterior') { setMode('orbit'); return; }
    const [ex, ez] = s.eye; const [lx, lz] = s.look;
    state.started = true; setMode('walk'); walker.teleport(ex, ez, LV[pres.li].y, Math.atan2(-(lx - ex), -(lz - ez)), -0.05);
    if (!isTouch) walker.requestLock();
  });
}

// ------------------------------------------------------------------ plan view
const plan = { zoom: 1, cx: 20.5, cz: 25.5 };
function fitPlan() {
  const aspect = innerWidth / innerHeight; let halfH = 31; if (halfH * aspect < 26) halfH = 26 / aspect; halfH /= plan.zoom;
  planCam.left = -halfH * aspect; planCam.right = halfH * aspect; planCam.top = halfH; planCam.bottom = -halfH;
  planCam.position.set(plan.cx, 150, plan.cz); planCam.up.set(0, 0, -1); planCam.lookAt(plan.cx, 0, plan.cz); planCam.updateProjectionMatrix(); forceRender();
}
const pointers = new Map(); let downAt = null; let pinch0 = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (state.mode === 'walk' && e.pointerType === 'mouse' && state.started) walker.requestLock();
  if (state.mode !== 'plan') return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]); downAt = [e.clientX, e.clientY];
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = [Math.hypot(a[0] - b[0], a[1] - b[1]), plan.zoom]; }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (state.mode !== 'plan' || !pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2 && pinch0) { const [a, b] = [...pointers.values()]; plan.zoom = Math.max(0.6, Math.min(5, pinch0[1] * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0[0])); }
  else if (pointers.size === 1) { const wpp = (planCam.right - planCam.left) / innerWidth; plan.cx -= (e.clientX - prev[0]) * wpp; plan.cz -= (e.clientY - prev[1]) * wpp; }
  fitPlan();
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (state.mode !== 'plan') return;
  if (pointers.size === 1 && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) planPick(e.clientX, e.clientY);
  pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = null;
});
renderer.domElement.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinch0 = null; });
renderer.domElement.addEventListener('wheel', (e) => { if (state.mode !== 'plan') return; e.preventDefault(); plan.zoom = Math.max(0.6, Math.min(5, plan.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); fitPlan(); }, { passive: false });
renderer.domElement.addEventListener('dblclick', () => { if (state.mode === 'plan' && state.selected) teleportTo(state.selected.li, state.selected.room); });
function planPick(cx, cy) {
  const li = Math.min(state.viewLevel, LV.length - 1); const L = LV[li];
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), planCam);
  const p = new THREE.Vector3(); rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -L.y), p);
  const room = G.roomAt(L, p.x, p.z); if (room && room.accessible !== false && room.type !== 'void') selectRoom(li, room);
}

// ------------------------------------------------------------------ minimap
const mm = $('minimap'); const mctx = mm.getContext('2d');
const MMB = [-1.5, -1.5, 42.5, 52.5];
const wallPiecesByLevel = LV.map((L) => L.walls.flatMap((w) => G.wallPieces(house, L, w)).filter((p) => p.y1 <= L.y + 1));
const ROOM_COL = { living: '#c9a27a', dining: '#c9a27a', kitchen: '#d6b98e', bedroom: '#8fb1c9', bathroom: '#9fd0d0', toilet: '#9fd0d0', dressing: '#a9a3c9', store: '#999', office: '#b5c98f', corridor: '#bbb', stair: '#777', garden: '#6f9a54', porch: '#a59c8e', parking: '#8b8b8b', balcony: '#b79874', terrace: '#a59c8e', utility: '#c9c3a8', gym: '#c98f8f', shaft: '#444', void: '#222' };
function mmTransform() {
  const dpr = window.devicePixelRatio || 1; const cw = mm.clientWidth, ch = mm.clientHeight;
  if (mm.width !== cw * dpr) { mm.width = cw * dpr; mm.height = ch * dpr; }
  const s = Math.min((cw - 16) / (MMB[2] - MMB[0]), (ch - 16) / (MMB[3] - MMB[1]));
  return { dpr, s, ox: (cw - s * (MMB[2] - MMB[0])) / 2 - MMB[0] * s, oz: (ch - s * (MMB[3] - MMB[1])) / 2 - MMB[1] * s };
}
function drawMinimap() {
  if (mm.classList.contains('hidden') || !walker || document.body.classList.contains('intro') || state.mode === 'present') return;
  const T = mmTransform(); const c = mctx; const li = state.mode === 'walk' ? state.playerLi : Math.min(state.viewLevel, LV.length - 1); const L = LV[li];
  c.setTransform(T.dpr, 0, 0, T.dpr, 0, 0); c.clearRect(0, 0, mm.clientWidth, mm.clientHeight);
  const X = (x) => T.ox + x * T.s, Z = (z) => T.oz + z * T.s;
  for (const r of L.rooms) { c.fillStyle = ROOM_COL[r.type] || '#888'; c.globalAlpha = state.selected && state.selected.room === r ? 0.75 : 0.35; for (const q of r.rects) c.fillRect(X(q[0]), Z(q[1]), (q[2] - q[0]) * T.s, (q[3] - q[1]) * T.s); }
  c.globalAlpha = 1;
  for (const p of wallPiecesByLevel[li]) { if (p.kind === 'glass' && p.y1 > L.y + 0.5) continue; c.fillStyle = p.kind === 'glass' ? '#9fd8d2' : (p.y2 - p.y1 < 3.6 ? '#cfcac2' : '#f4f1ea'); c.fillRect(X(p.x1), Z(p.z1), Math.max(1, (p.x2 - p.x1) * T.s), Math.max(1, (p.z2 - p.z1) * T.s)); }
  for (const r of L.railings || []) { c.fillStyle = '#9fd8d2'; c.fillRect(X(r.x1), Z(r.z1), Math.max(1, (r.x2 - r.x1) * T.s), Math.max(1, (r.z2 - r.z1) * T.s)); }
  c.strokeStyle = 'rgba(255,255,255,.35)'; const sc = house.stairs.core; c.strokeRect(X(sc[0]), Z(sc[1]), (sc[2] - sc[0]) * T.s, (sc[3] - sc[1]) * T.s);
  if (walker.auto) {
    c.strokeStyle = '#c9a36b'; c.lineWidth = 2; c.beginPath(); let first = true;
    for (let i = walker.auto.i - 1; i < walker.auto.path.length; i++) { const p = i === walker.auto.i - 1 ? walker.pos : walker.auto.path[i]; if (first) { c.moveTo(X(p.x), Z(p.z)); first = false; } else c.lineTo(X(p.x), Z(p.z)); }
    c.stroke();
  }
  if (state.playerLi === li) {
    const px = X(walker.pos.x), pz = Z(walker.pos.z); const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
    c.fillStyle = 'rgba(201,163,107,.28)'; c.beginPath(); c.moveTo(px, pz); c.arc(px, pz, 26, Math.atan2(fz, fx) - 0.6, Math.atan2(fz, fx) + 0.6); c.fill();
    c.fillStyle = '#e3c79b'; c.beginPath(); c.arc(px, pz, 4.5, 0, 7); c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,.8)'; c.font = '600 11px system-ui'; c.fillText(L.name, 8, 14);
  c.font = '10px system-ui'; c.fillStyle = 'rgba(255,255,255,.5)'; c.fillText('Road / Front ↓', 8, mm.clientHeight - 6);
}
mm.addEventListener('click', (e) => {
  const T = mmTransform(); const r = mm.getBoundingClientRect();
  const x = (e.clientX - r.left - T.ox) / T.s, z = (e.clientY - r.top - T.oz) / T.s;
  const li = state.mode === 'walk' ? state.playerLi : Math.min(state.viewLevel, LV.length - 1);
  const room = G.roomAt(LV[li], x, z); if (room && room.accessible !== false && room.type !== 'void') selectRoom(li, room);
});

// ------------------------------------------------------------------ HUD
let lastRoom = null;
function updateHud() {
  const li = state.playerLi; const room = G.roomAt(LV[li], walker.pos.x, walker.pos.z);
  const onStair = G.pointInRect(house.stairs.core, walker.pos.x, walker.pos.z) && Math.abs(walker.pos.y - LV[li].y) > 0.3;
  const key = (room ? room.id : 'none') + li + onStair; if (key === lastRoom) return; lastRoom = key;
  if (onStair) { $('hudRoom').textContent = 'Staircase'; $('hudMeta').textContent = `Between ${LV[li].name} and ${LV[Math.min(li + 1, LV.length - 1)].name}`; return; }
  $('hudRoom').textContent = room ? room.name : (li === 0 ? 'Outside' : LV[li].name);
  $('hudMeta').textContent = room ? roomMeta(room, li) : LV[li].name;
}

// ------------------------------------------------------------------ specs / info modal
function indicativeArea() {
  let a = 0; for (const L of LV) for (const r of L.rooms) if (!r.outdoor && !['void', 'shaft'].includes(r.type)) a += G.roomArea(r);
  return a;
}
function buildFacts() {
  const rooms = LV.flatMap((L) => L.rooms);
  const beds = rooms.filter((r) => r.type === 'bedroom').length;
  const wcs = rooms.filter((r) => /toilet/i.test(r.name)).length;
  const facts = [['Levels', 'G+2 + terrace'], ['Bedrooms', beds], ['Toilets', wcs], ['Internal area', `≈ ${Math.round(indicativeArea() * M_PER_FT * M_PER_FT)} m²*`], ['', 'Courtyard garden'], ['', 'Car parking'], ['', 'Roof terrace'], ['', `Rooftop solar provision ≈ ${SOL ? SOL.kwp.toFixed(1) : '5'} kWp`]];
  $('facts').innerHTML = facts.map(([k, v]) => `<li>${k ? `<b>${v}</b> ${k.toLowerCase()}` : v}</li>`).join('');
}
const SOL = solarSummary(house);
function solarHtml() { return ''; }
function solarSection() {
  if (!SOL) return '';
  const S = house.solar; const sh = SOL.shading;
  return `<h4>Rooftop solar PV (provision)</h4>
    <table class="dims"><tr><th>Array</th><td>${SOL.count} × ${S.module.wp} Wp ${S.module.tech} = <b>${SOL.kwp.toFixed(2)} kWp</b> (${SOL.areaM2.toFixed(1)} m² of modules)</td></tr>
    <tr><th>Mounting</th><td>Elevated hot-dip GI structure on RCC blocks over the terrace-room roof, ${S.tilt}° tilt facing south (assumed orientation), low edge ${(S.lowEdge * M_PER_FT).toFixed(2)} m above the roof, 3 rows with shade-free spacing</td></tr>
    <tr><th>Shading</th><td>${sh.worst.frac > 0 ? `max ${Math.round(sh.worst.frac * 100)}% at ${sh.worst.label}` : 'shade-free 09:00–15:00 on all four reference days'} · annual shading loss ≈ ${(sh.loss * 100).toFixed(1)}% (tanks and inter-row)</td></tr>
    <tr><th>Inverter</th><td>${S.inverter.label}, on the solid north face of the stair-cabin wall behind the VRV outdoor units</td></tr>
    <tr><th>Grid</th><td>${S.meter}; ${S.earthing}</td></tr>
    <tr><th>Est. generation</th><td>≈ ${Math.round(SOL.annualKWh).toLocaleString('en-IN')} kWh/yr (≈ ${Math.round(SOL.annualKWh / 365)} kWh/day), indicative at ${SPECIFIC_YIELD} kWh/kWp/yr</td></tr>
    <tr><th>Future</th><td>${S.future}</td></tr></table>`;
}
function hvacHtml() {
  if (!HV) return '';
  const H = house.hvac; const rows = HV.rooms.map((r) => `<tr><td>${SHORT[r.level]}</td><td>${r.room.name}</td><td>${r.areaM2.toFixed(1)} m²</td><td>${r.designKW.toFixed(1)} kW (${(r.designKW / 3.517).toFixed(2)} TR)</td><td>${r.units.map((u) => `${u.id} · ${u.kw} kW ${u.family === 'compact' ? 'compact' : 'round-flow'}`).join('<br>')}</td></tr>`).join('');
  const sys = HV.systems.map((s) => `<tr><td>${s.id}</td><td>${s.serves.map((x) => SHORT[x]).join(' + ')}</td><td>${s.hp} HP · ${s.kw} kW</td><td>${s.iduCount} units · ${s.idukw.toFixed(1)} kW</td><td>${(s.cr * 100).toFixed(0)}%</td></tr>`).join('');
  const tanks = (house.water?.tanks || []).map((t) => { const l = tankLoad(t); return `<tr><td>${t.id}</td><td>${t.litres} L</td><td>${(t.diameter * M_PER_FT).toFixed(2)} m Ø × ${(t.height * M_PER_FT).toFixed(2)} m</td><td>${l.kg} kg full · ${l.kNm2.toFixed(1)} kN/m² on pedestal</td></tr>`; }).join('');
  return `<h4>Central air-conditioning — ${H.system}</h4>
    <p class="muted small">Refrigerant ${H.refrigerant}. Outdoor design ${H.designOutdoor}, indoor ${H.indoorDesign}. Cooled: living, dining, kitchens, bedrooms, dressings, office, lobbies and the terrace gym. Toilets, utility, stores, stair and open balconies are ventilated, not cooled. Outdoor units are sized on the diversified block load (diversity ${DIVERSITY}); indicative estimate pending a full heat-load calculation.</p>
    <table class="dims"><tr><th>Level</th><th>Room</th><th>Area</th><th>Design load</th><th>Indoor units</th></tr>${rows}</table>
    <table class="dims" style="margin-top:8px"><tr><th>Outdoor unit</th><th>Serves</th><th>Capacity</th><th>Connected</th><th>Conn. ratio</th></tr>${sys}</table>
    <p class="muted small">Total ${HV.rooms.reduce((a, r) => a + r.units.length, 0)} cassettes = ${HV.totalIDU.toFixed(1)} kW · outdoor ${HV.totalODU.toFixed(0)} kW (${(HV.totalODU / 3.517).toFixed(1)} TR) on the rear open terrace. Refrigerant risers run in the plumbing shaft. Cassettes need a ~300 mm false ceiling (finished ≈ ${H.falseCeiling.toFixed(2)} m). ${IDU.roundflow.label}; ${IDU.compact.label}.</p>
    <h4>Overhead water storage</h4>
    <table class="dims"><tr><th>Tank</th><th>Capacity</th><th>Size</th><th>Load</th></tr>${tanks}</table>
    <p class="muted small">Two 2,000 L tanks on RCC pedestals over the beams of the stair-cabin and toilet roof, directly above the plumbing shaft (short downtake). Access by steel cat ladder from the open terrace.</p>`;
}
function buildInfo() {
  const rows = [];
  LV.forEach((L) => L.rooms.forEach((r) => {
    if (r.type === 'shaft') return; const d = roomDims(r); let flag = '';
    if (r.planLabel) {
      const near = (v) => v == null || Math.abs(v - d.w) <= 0.25 || Math.abs(v - d.d) <= 0.25;
      flag = near(r.planLabel.w) && near(r.planLabel.d) ? '✓' : '⚠︎ differs';
    }
    rows.push(`<tr><td>${SHORT[L.id]}</td><td>${r.name}</td><td>${fmtDims(d.w, d.d)}</td><td>${fmtArea(d.area)}</td><td>${r.planLabel ? r.planLabel.text : '—'}</td><td>${flag}</td></tr>`);
  }));
  $('infoBody').innerHTML = `
    <p class="muted">Source: ${house.meta.source}. Units: metres (data authored in ${houseMetric.meta.units}). ${house.meta.scaleCalibration}</p>
    <p class="muted">${house.meta.staging}</p>
    <h4>Room schedule (modelled clear size vs. drawing label)</h4>
    <table class="dims"><tr><th>Level</th><th>Room</th><th>Modelled (clear)</th><th>Area</th><th>Drawing label</th><th></th></tr>${rows.join('')}</table>
    <p class="muted small">* Indicative internal area = sum of modelled clear room areas (excl. walls, voids, shafts, open areas): ${fmtArea(indicativeArea())}. Not a surveyed or saleable area.</p>
    ${hvacHtml()}
    ${solarSection()}
    <h4>Architectural inconsistencies found in the drawings</h4>
    <ul>${house.inconsistencies.map((i) => `<li><span class="sev ${i.severity}">${i.severity}</span><b>${i.id}</b> ${i.text}</li>`).join('')}</ul>
    <h4>Assumptions</h4>
    <ul>${house.assumptions.map((a) => `<li>${a}</li>`).join('')}</ul>
    <p class="muted small">Run <code>npm run validate</code> for the automated validation report.</p>`;
}

// ------------------------------------------------------------------ theme / time / quality UI
function buildThemeCards() {
  const wrap = $('themeCards'); wrap.innerHTML = '';
  for (const [k, T] of Object.entries(THEMES)) {
    const b = document.createElement('button'); b.className = 'theme-card' + (k === themeKey ? ' active' : '');
    b.innerHTML = `<div class="sw">${T.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</div><div><b>${T.name}</b><span>${T.blurb}</span></div>`;
    b.onclick = () => setTheme(k); wrap.appendChild(b);
  }
}
function setTheme(k) {
  if (k === themeKey) return; themeKey = k; localStorage.setItem('tr-theme', k); buildThemeCards(); toast('Applying ' + THEMES[k].name + '…', 4000);
  setTimeout(() => {
    const T = applyTheme(M, k); lighting.setKelvin(T.kelvin);
    baker.invalidateAll(); const key = envKey(); baker.bake(key); scene.environment = baker.get(key);
    forceRender(4); toast(T.name);
  }, 40);
}
function buildTimeSeg() {
  const seg = $('timeSeg'); seg.innerHTML = '';
  for (const [k, t] of Object.entries(TIMES)) {
    const b = document.createElement('button'); b.textContent = t.label; b.classList.toggle('active', k === timeKey);
    b.onclick = () => { timeKey = k; lighting.setTime(k); baker.invalidateAll(); const key = envKey(); baker.bake(key); scene.environment = baker.get(key); seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); forceRender(4); };
    seg.appendChild(b);
  }
}
function buildQuality() {
  const sel = $('qualitySel'); sel.innerHTML = '';
  for (const [k, t] of Object.entries(TIERS)) { const o = document.createElement('option'); o.value = k; o.textContent = t.label; sel.appendChild(o); }
  sel.value = tierKey; sel.onchange = () => setTier(sel.value);
}
function setTier(k) {
  tierKey = k; tier = TIERS[k]; localStorage.setItem('tr-quality', k);
  maxDpr = Math.min(devicePixelRatio, tier.dpr); curDpr = maxDpr; renderer.setPixelRatio(curDpr); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.type = tier.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  lighting.setShadowSize(tier.shadow);
  const keep = { li: lighting.li };
  lighting.points.forEach((p) => scene.remove(p)); lighting.rects.forEach((r) => scene.remove(r));
  lighting.points = Array.from({ length: tier.points }, () => { const p = new THREE.PointLight('#ffd8a8', 0, 26, 1.5); scene.add(p); return p; });
  lighting.rects = Array.from({ length: tier.rects }, () => { const r = new THREE.RectAreaLight('#e8f0ff', 0, 4, 4); scene.add(r); return r; });
  lighting.assign(keep.li); post.setTier(tier, currentCam()); forceRender(4); toast('Quality: ' + tier.label);
}

// ------------------------------------------------------------------ intro / start
function leaveIntro() { if (!document.body.classList.contains('intro')) return; document.body.classList.remove('intro'); $('intro').classList.add('hidden'); state.started = true; orbit.autoRotate = false; buildLevelButtons(); renderRoomList(); }
$('startPresent').onclick = () => startPresentation(0);
$('startWalk').onclick = () => fade(() => { leaveIntro(); walker.teleport(17.0, 47.5, 0, 0, -0.04); setMode('walk'); if (!isTouch) walker.requestLock(); });
$('startOrbit').onclick = () => { leaveIntro(); state.viewLevel = LV.length; setMode('orbit'); orbit.autoRotate = true; };

document.querySelectorAll('#modes button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
$('presentTop').onclick = () => startPresentation(0);
$('tourBtn').onclick = () => { if (state.tour) { stopTour('Tour stopped'); return; } state.tour = { i: 0 }; $('tourBtn').textContent = '■ Stop walk'; document.body.classList.remove('panel-open'); runTour(0); };
$('infoBtn').onclick = () => { buildInfo(); $('infoModal').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); };
$('infoClose').onclick = () => $('infoModal').classList.add('hidden');
$('tglMap').onchange = (e) => mm.classList.toggle('hidden', !e.target.checked);
$('tglPath').onchange = (e) => { state.showPath = e.target.checked; if (!e.target.checked) dots.count = 0; };
$('tglServices').onchange = (e) => { built.servicesOverlay.visible = e.target.checked; $('svcLegend').classList.toggle('hidden', !e.target.checked); forceRender(3); };
$('menuBtn').onclick = () => document.body.classList.toggle('panel-open');
$('rcGo').onclick = () => { if (state.selected) navigateTo(state.selected.li, state.selected.room); };
$('rcTp').onclick = () => { if (state.selected) teleportTo(state.selected.li, state.selected.room); };
$('rcClose').onclick = () => { $('roomCard').classList.add('hidden'); state.selected = null; highlight.clear(); renderRoomList(); forceRender(); };
$('flUp').onclick = () => goToLevel(state.playerLi + 1);
$('flDown').onclick = () => goToLevel(state.playerLi - 1);
$('ptPrev').onclick = () => goShot(pres.i - 1);
$('ptNext').onclick = () => goShot(pres.i + 1);
$('ptPause').onclick = () => { pres.playing = !pres.playing; $('ptPause').textContent = pres.playing ? '❚❚' : '▶'; };
$('ptExit').onclick = () => fade(() => endPresentation(false));
$('ptExplore').onclick = () => exploreFromShot();
buildDots();

window.addEventListener('keydown', (e) => {
  if (e.target && ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
  if (!walker) return;
  if (state.mode === 'present') {
    if (e.code === 'ArrowRight') goShot(pres.i + 1);
    if (e.code === 'ArrowLeft') goShot(pres.i - 1);
    if (e.code === 'Space') { e.preventDefault(); $('ptPause').onclick(); }
    if (e.code === 'Escape') fade(() => endPresentation(false));
    return;
  }
  if (document.body.classList.contains('intro')) return;
  if (e.code === 'Digit1') setMode('walk');
  if (e.code === 'Digit2') setMode('plan');
  if (e.code === 'Digit3') setMode('orbit');
  if (e.code === 'KeyP') startPresentation(0);
  if (e.code === 'PageUp') { e.preventDefault(); if (state.mode === 'walk') goToLevel(state.playerLi + 1); else { state.viewLevel = Math.min(LV.length, state.viewLevel + 1); setMode(state.mode); } }
  if (e.code === 'PageDown') { e.preventDefault(); if (state.mode === 'walk') goToLevel(state.playerLi - 1); else { state.viewLevel = Math.max(0, state.viewLevel - 1); setMode(state.mode); } }
});

function layoutTop() { document.documentElement.style.setProperty('--top', Math.round($('topbar').getBoundingClientRect().bottom + 8) + 'px'); }
window.addEventListener('resize', () => {
  layoutTop(); renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
  fitCameras(); post?.setSize(innerWidth, innerHeight); fitPlan(); forceRender(3);
});

// ------------------------------------------------------------------ frame loop
function envKey() {
  if (state.mode === 'walk' || state.mode === 'present') {
    const cam = currentCam(); const li = state.mode === 'present' ? pres.li : state.playerLi;
    const room = G.roomAt(LV[li], cam.position.x, cam.position.z);
    return room && !room.outdoor ? 'L' + li : 'out';
  }
  return 'out';
}
const lastSig = new Float64Array(17); let stillTime = 0; let envT = 0, hudT = 0, mmT = 0;
const perf = { acc: 0, n: 0, cool: 0 };
function cameraChanged(cam) {
  const e = cam.matrixWorld.elements; let changed = cam.projectionMatrix.elements[0] !== lastSig[16];
  for (let i = 0; i < 16; i++) if (Math.abs(e[i] - lastSig[i]) > 1e-6) { changed = true; lastSig[i] = e[i]; }
  lastSig[16] = cam.projectionMatrix.elements[0];
  return changed;
}
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!built || !walker || !post || !baker?.maps.size) return;
  if (state.mode === 'walk' || walker.auto) walker.update(dt);
  const li = G.levelAtY(house, walker.pos.y);
  if (li !== state.playerLi) {
    state.playerLi = li; if (state.mode === 'walk') { lighting.assign(li); state.viewLevel = li; buildLevelButtons(); renderRoomList(); }
  }
  if (state.mode === 'present') updatePresentCamera(dt);
  if (state.mode === 'orbit') orbit.update(dt);
  marker.position.set(walker.pos.x, walker.pos.y + 0.1, walker.pos.z); marker.rotation.y = walker.yaw;
  const camLi = state.mode === 'present' ? pres.li : state.playerLi;
  for (const r of reflectors) r.visible = (state.mode === 'walk' || state.mode === 'present') && camLi === levelOfRoom.get('tr-living');
  envT += dt; if (envT > 0.2) { envT = 0; const k = envKey(); if (!baker.has(k)) baker.bake(k); if (scene.environment !== baker.get(k)) { scene.environment = baker.get(k); forceRender(); } }
  if (dots.count) M.path.opacity = 0.55 + 0.35 * Math.sin(performance.now() / 250);
  if (state.mode === 'walk') { hudT += dt; if (hudT > 0.2) { hudT = 0; updateHud(); } }
  mmT += dt; if (mmT > 0.1) { mmT = 0; drawMinimap(); }

  const cam = currentCam(); cam.updateMatrixWorld();
  const moving = cameraChanged(cam);
  const need = moving || forceFrames > 0 || dots.count > 0 || state.mode === 'present';
  if (!need) {
    stillTime += dt;
    // use idle time to refresh other floors' reflections in the background
    if (stillTime > 0.6 && baker.bakeNextDirty([envKey()])) { scene.environment = baker.get(envKey()); forceRender(); }
    return;
  }
  stillTime = 0; if (forceFrames > 0) forceFrames--;
  post.render(dt); labelRenderer.render(scene, cam);
  // dynamic resolution: keep frame time near 60 fps by scaling the pixel ratio within the tier's range
  perf.acc += dt; perf.n++; perf.cool -= dt;
  if (perf.n >= 40) {
    const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
    if (perf.cool <= 0) {
      let next = curDpr;
      if (avg > 1 / 42 && curDpr > tier.minDpr) next = Math.max(tier.minDpr, curDpr - 0.15);
      else if (avg < 1 / 57 && curDpr < maxDpr) next = Math.min(maxDpr, curDpr + 0.1);
      if (next !== curDpr) { curDpr = next; renderer.setPixelRatio(curDpr); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); perf.cool = 2; }
    }
    $('perfInfo').textContent = `${Math.round(1 / Math.max(avg, 1e-3))} fps · ${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris · res ×${curDpr.toFixed(2)}`;
  }
}
requestAnimationFrame(frame);
layoutTop();
init().catch((err) => { console.error(err); $('loadState').textContent = 'Failed to initialise: ' + err.message; });

// exposed for automated testing / debugging
window.__app = {
  house, state, get walker() { return walker; }, get nav() { return nav; }, get lighting() { return lighting; }, get renderer() { return renderer; }, get baker() { return baker; },
  setMode, navigateTo, teleportTo, goToLevel, selectRoom, startPresentation, goShot: setShot, roomById, levelOfRoom, setTheme, setTier, leaveIntro, pres,
  setTime: (k) => { const b = [...$('timeSeg').children].find((x) => x.textContent === TIMES[k].label); b?.onclick(); }, forceRender, get ready() { return !!built && !$('startWalk').disabled; }
};
