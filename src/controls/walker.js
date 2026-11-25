import { groundAt, collides, PLAYER } from '../core/geometry.js';

// Speeds in scene units (ft/s): walk 1.35 m/s, run 2.7 m/s, guided 1.25 m/s.
const WALK = 4.4, RUN = 8.8, AUTO = 4.1, GRAVITY = 32;

function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export class Walker {
  constructor(camera, dom, world) {
    this.camera = camera; this.dom = dom; this.world = world;
    this.pos = { x: 17, y: 0, z: 47.5 }; this.yaw = 0; this.pitch = -0.05; this.vy = 0;
    this.vel = { x: 0, z: 0 }; this.view = { yaw: 0, pitch: -0.05, y: PLAYER.eye };
    this.keys = new Set(); this.touchMove = { x: 0, y: 0 }; this.enabled = true;
    this.auto = null; this.onAutoDone = null; this.onManualInput = null;
    this.dragging = false; this.lastMouse = null;
    camera.rotation.order = 'YXZ';
    this._bind();
  }

  get locked() { return document.pointerLockElement === this.dom; }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const k = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
        this.keys.add(k); if (this.enabled) { this.cancelAuto(true); e.preventDefault(); }
      }
      if (k === 'ShiftLeft' || k === 'ShiftRight') this.keys.add('Shift');
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code.startsWith('Shift')) this.keys.delete('Shift'); });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) this.look(e.movementX, e.movementY, 0.0021);
      else if (this.dragging && this.lastMouse) {
        this.look(e.clientX - this.lastMouse[0], e.clientY - this.lastMouse[1], 0.0038);
        this.lastMouse = [e.clientX, e.clientY];
      }
    });
    this.dom.addEventListener('mousedown', (e) => { if (e.button === 0) { this.dragging = true; this.lastMouse = [e.clientX, e.clientY]; } });
    window.addEventListener('mouseup', () => { this.dragging = false; });
  }

  look(dx, dy, s) {
    this.yaw -= dx * s; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy * s));
    if (this.auto && Math.abs(dx) + Math.abs(dy) > 2) this.auto.userLook = 1.5;
  }

  requestLock() {
    if (!this.dom.requestPointerLock || matchMedia('(pointer: coarse)').matches) return;
    try { const p = this.dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* unsupported */ }
  }

  teleport(x, z, y, yaw, pitch) {
    this.cancelAuto(false);
    this.pos.x = x; this.pos.z = z; this.pos.y = y; this.vy = 0; this.vel.x = this.vel.z = 0;
    if (yaw !== undefined) this.yaw = yaw; if (pitch !== undefined) this.pitch = pitch;
    this.view.yaw = this.yaw; this.view.pitch = this.pitch; this.view.y = y + PLAYER.eye;
  }

  follow(path, onDone) {
    this.cancelAuto(false);
    if (!path || path.length < 2) { if (onDone) onDone(false); return; }
    let total = 0; for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    this.auto = { path, i: 1, stuck: 0, userLook: 0, t: 0, total, done: 0 }; this.onAutoDone = onDone || null;
  }

  cancelAuto(manual) {
    if (!this.auto) return; this.auto = null;
    const cb = this.onAutoDone; this.onAutoDone = null; if (cb) cb(false);
    if (manual && this.onManualInput) this.onManualInput();
  }

  _tryMove(dx, dz) {
    const { colliders, surfaces } = this.world; const p = this.pos;
    const inside = collides(colliders, p.x, p.z, p.y, PLAYER.radius);
    let blockedX = false, blockedZ = false;
    for (const axis of ['x', 'z']) {
      const d = axis === 'x' ? dx : dz; if (Math.abs(d) < 1e-6) continue;
      const nx = axis === 'x' ? p.x + d : p.x; const nz = axis === 'z' ? p.z + d : p.z;
      const g = groundAt(surfaces, nx, nz, p.y);
      if (g === -Infinity) { if (axis === 'x') blockedX = true; else blockedZ = true; continue; }
      const hit = collides(colliders, nx, nz, Math.max(p.y, g), PLAYER.radius);
      if (hit && !(inside && hit === inside)) { if (axis === 'x') blockedX = true; else blockedZ = true; continue; }
      p.x = nx; p.z = nz;
    }
    return { blockedX, blockedZ };
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const p = this.pos;
    if (this.enabled) {
      let fwd = 0, str = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) str += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) str -= 1;
      fwd += this.touchMove.y; str += this.touchMove.x;
      if (Math.abs(this.touchMove.x) + Math.abs(this.touchMove.y) > 0.15) this.cancelAuto(true);
      const len = Math.hypot(fwd, str);
      let tx = 0, tz = 0;
      if (len > 0.01) {
        const sp = (this.keys.has('Shift') ? RUN : WALK) * Math.min(1, len) / len;
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        tx = (fx * fwd + rx * str) * sp; tz = (fz * fwd + rz * str) * sp;
      } else if (this.auto) {
        [tx, tz] = this._autoVelocity(dt);
      }
      // ease velocity towards the target (accelerate gently, brake a little faster)
      const k = damp(Math.hypot(tx, tz) > 0.01 ? 7 : 10, dt);
      this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
      if (Math.hypot(this.vel.x, this.vel.z) > 0.01) {
        const b = this._tryMove(this.vel.x * dt, this.vel.z * dt);
        if (b.blockedX) this.vel.x = 0; if (b.blockedZ) this.vel.z = 0;
      }
      if (this.auto) this._autoProgress(dt);
    }
    const g = groundAt(this.world.surfaces, p.x, p.z, p.y);
    if (g !== -Infinity && g >= p.y - 0.6) { p.y = g; this.vy = 0; }
    else { this.vy -= GRAVITY * dt; p.y += this.vy * dt; if (g !== -Infinity && p.y < g) { p.y = g; this.vy = 0; } }
    // smoothed camera: eye height glides over stair risers, look is lightly damped (removes mouse jitter)
    const eyeY = p.y + PLAYER.eye;
    this.view.y = Math.abs(eyeY - this.view.y) > 3 ? eyeY : this.view.y + (eyeY - this.view.y) * damp(12, dt);
    this.view.yaw += angDiff(this.view.yaw, this.yaw) * damp(22, dt);
    this.view.pitch += (this.pitch - this.view.pitch) * damp(22, dt);
    this.camera.position.set(p.x, this.view.y, p.z);
    this.camera.rotation.set(this.view.pitch, this.view.yaw, 0);
  }

  /** Point `dist` ahead along the remaining path (for smooth look-ahead steering). */
  _ahead(dist) {
    const a = this.auto; let px = this.pos.x, pz = this.pos.z; let left = dist;
    for (let i = a.i; i < a.path.length; i++) {
      const q = a.path[i]; const d = Math.hypot(q.x - px, q.z - pz);
      if (d >= left) return { x: px + ((q.x - px) * left) / d, z: pz + ((q.z - pz) * left) / d };
      left -= d; px = q.x; pz = q.z;
    }
    return { x: px, z: pz };
  }

  _autoVelocity(dt) {
    const a = this.auto; const p = this.pos;
    let t = a.path[a.i];
    while (t && Math.hypot(t.x - p.x, t.z - p.z) < 0.45) { a.i++; t = a.path[a.i]; }
    if (!t) { this.vel.x = this.vel.z = 0; this.auto = null; const cb = this.onAutoDone; this.onAutoDone = null; if (cb) cb(true); return [0, 0]; }
    a.t += dt;
    let remaining = Math.hypot(t.x - p.x, t.z - p.z); for (let i = a.i + 1; i < a.path.length; i++) remaining += Math.hypot(a.path[i].x - a.path[i - 1].x, a.path[i].z - a.path[i - 1].z);
    const speed = AUTO * Math.min(1, 0.25 + a.t * 0.9, 0.3 + remaining / 4);
    const dx = t.x - p.x, dz = t.z - p.z; const d = Math.hypot(dx, dz) || 1;
    a.userLook = Math.max(0, a.userLook - dt);
    if (a.userLook <= 0) {
      const look = this._ahead(3.2); const want = Math.atan2(-(look.x - p.x), -(look.z - p.z));
      if (Math.hypot(look.x - p.x, look.z - p.z) > 0.3) this.yaw += angDiff(this.yaw, want) * damp(3.2, dt);
      this.pitch += (-0.06 - this.pitch) * damp(2, dt);
    }
    return [(dx / d) * speed, (dz / d) * speed];
  }

  _autoProgress(dt) {
    const a = this.auto; if (!a) return;
    const moved = Math.hypot(this.vel.x, this.vel.z) * dt;
    const t = a.path[a.i];
    if (t && moved < AUTO * dt * 0.1 && a.t > 0.6) { a.stuck += dt; if (a.stuck > 0.8) { this.pos.x = t.x; this.pos.z = t.z; a.stuck = 0; } } else a.stuck = 0;
  }
}

/** Virtual joystick + look pad for touch devices. */
export function setupTouch(walker, joyEl, knobEl, lookEl) {
  let joyId = null, joyOrigin = null; const R = 55;
  joyEl.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; joyId = t.identifier; const r = joyEl.getBoundingClientRect();
    joyOrigin = [r.left + r.width / 2, r.top + r.height / 2]; e.preventDefault();
  }, { passive: false });
  joyEl.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === joyId) {
      let dx = t.clientX - joyOrigin[0], dy = t.clientY - joyOrigin[1]; const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      walker.touchMove.x = dx / R; walker.touchMove.y = -dy / R;
    }
    e.preventDefault();
  }, { passive: false });
  const endJoy = (e) => { for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; walker.touchMove.x = 0; walker.touchMove.y = 0; knobEl.style.transform = ''; } };
  joyEl.addEventListener('touchend', endJoy); joyEl.addEventListener('touchcancel', endJoy);

  const looks = new Map();
  lookEl.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) looks.set(t.identifier, [t.clientX, t.clientY]); }, { passive: true });
  lookEl.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (looks.has(t.identifier)) {
      const [lx, ly] = looks.get(t.identifier); walker.look(t.clientX - lx, t.clientY - ly, 0.0055); looks.set(t.identifier, [t.clientX, t.clientY]);
    }
    e.preventDefault();
  }, { passive: false });
  const endLook = (e) => { for (const t of e.changedTouches) looks.delete(t.identifier); };
  lookEl.addEventListener('touchend', endLook); lookEl.addEventListener('touchcancel', endLook);
}
