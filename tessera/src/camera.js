// Orbiting board camera. Drag to pan, right-drag (or two fingers) to turn and
// tilt, wheel or pinch to zoom. Taps are reported separately from drags.
import * as T from '../vendor/three.module.min.js';

export const VIEWS = {
  tabletop: { pitch: 0.82, dist: 7.5, label: 'Tabletop' },
  overhead: { pitch: 1.42, dist: 10, label: 'Map' },
  street: { pitch: 0.2, dist: 2.3, label: 'Street' },
  cinematic: { pitch: 0.5, dist: 9, label: 'Cinematic' },
};

const LIMITS = { minDist: 1.1, maxDist: 34, minPitch: 0.1, maxPitch: 1.5 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createRig(camera, dom, { onTap, onHover, onRightTap } = {}) {
  const now = { target: new T.Vector3(0, 0, 0), yaw: 0.55, pitch: 0.82, dist: 7.5 };
  const goal = { target: now.target.clone(), yaw: now.yaw, pitch: now.pitch, dist: now.dist };
  const bounds = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
  let auto = 0;
  let view = 'tabletop';
  const pointers = new Map();
  let gesture = null;
  const keys = new Set();

  function apply() {
    const cp = Math.cos(now.pitch);
    camera.position.set(
      now.target.x + now.dist * cp * Math.sin(now.yaw),
      now.target.y + now.dist * Math.sin(now.pitch),
      now.target.z + now.dist * cp * Math.cos(now.yaw),
    );
    camera.lookAt(now.target);
  }

  function clampGoal() {
    goal.dist = clamp(goal.dist, LIMITS.minDist, LIMITS.maxDist);
    goal.pitch = clamp(goal.pitch, LIMITS.minPitch, LIMITS.maxPitch);
    goal.target.x = clamp(goal.target.x, bounds.minX - 3, bounds.maxX + 3);
    goal.target.z = clamp(goal.target.z, bounds.minZ - 3, bounds.maxZ + 3);
  }

  const worldPerPixel = () => 2 * now.dist * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, dom.clientHeight);

  function pan(dx, dy) {
    const k = worldPerPixel() * (1 + (1 - Math.sin(now.pitch)) * 0.8);
    const right = [Math.cos(goal.yaw), -Math.sin(goal.yaw)];
    const forward = [-Math.sin(goal.yaw), -Math.cos(goal.yaw)];
    goal.target.x += -right[0] * dx * k + forward[0] * dy * k;
    goal.target.z += -right[1] * dx * k + forward[1] * dy * k;
    clampGoal();
  }
  function turn(dx, dy) {
    goal.yaw -= dx * 0.0065;
    goal.pitch += dy * 0.0055;
    clampGoal();
  }
  function zoom(factor) {
    goal.dist *= factor;
    clampGoal();
  }
  function interrupt() {
    if (auto) { auto = 0; view = 'free'; }
  }

  const local = e => {
    const r = dom.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  dom.addEventListener('contextmenu', e => e.preventDefault());
  dom.addEventListener('pointerdown', e => {
    dom.setPointerCapture?.(e.pointerId);
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now(), button: e.button });
    if (pointers.size === 1) {
      const orbit = e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey || e.altKey;
      gesture = { mode: orbit ? 'turn' : 'pan', moved: 0, button: e.button };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { mode: 'pinch', moved: 99, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2 };
    }
  });
  dom.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    const p = pointers.get(e.pointerId);
    if (!p) { onHover?.(x, y, e); return; }
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (!gesture) return;
    if (gesture.mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
      if (d > 0 && gesture.d > 0) zoom(gesture.d / d);
      let da = ang - gesture.ang;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      goal.yaw -= da;
      goal.pitch = clamp(goal.pitch + (my - gesture.my) * 0.006, LIMITS.minPitch, LIMITS.maxPitch);
      Object.assign(gesture, { d, ang, my });
      interrupt();
      return;
    }
    gesture.moved = Math.max(gesture.moved, Math.hypot(x - p.sx, y - p.sy));
    if (gesture.moved < 5) { onHover?.(x, y, e); return; }
    interrupt();
    if (gesture.mode === 'pan') pan(dx, dy); else turn(dx, dy);
  });
  const release = e => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p || !gesture) return;
    const quick = performance.now() - p.t < 650;
    if (pointers.size === 0) {
      if (gesture.moved < 6 && quick && e.type === 'pointerup') {
        if (gesture.button === 2) onRightTap?.(p.x, p.y, e); else onTap?.(p.x, p.y, e);
      }
      gesture = null;
    } else if (pointers.size === 1) {
      gesture = { mode: 'pan', moved: 99 };
    }
  };
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointercancel', release);
  dom.addEventListener('pointerleave', e => { if (!pointers.size) onHover?.(-1, -1, e); });
  dom.addEventListener('wheel', e => {
    e.preventDefault();
    interrupt();
    if (e.ctrlKey) zoom(Math.exp(e.deltaY * 0.01));
    else zoom(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  function update(dt) {
    if (document.querySelector('dialog[open]')) keys.clear();
    const k = 360 * dt;
    if (keys.has('arrowleft') || keys.has('a')) { pan(k, 0); interrupt(); }
    if (keys.has('arrowright') || keys.has('d')) { pan(-k, 0); interrupt(); }
    if (keys.has('arrowup') || keys.has('w')) { pan(0, k); interrupt(); }
    if (keys.has('arrowdown') || keys.has('s')) { pan(0, -k); interrupt(); }
    if (keys.has('q')) { goal.yaw += 1.6 * dt; interrupt(); }
    if (keys.has('e')) { goal.yaw -= 1.6 * dt; interrupt(); }
    if (keys.has('z')) { goal.pitch = clamp(goal.pitch + dt, LIMITS.minPitch, LIMITS.maxPitch); interrupt(); }
    if (keys.has('x')) { goal.pitch = clamp(goal.pitch - dt, LIMITS.minPitch, LIMITS.maxPitch); interrupt(); }
    if (keys.has('=') || keys.has('+')) { zoom(Math.exp(-1.5 * dt)); interrupt(); }
    if (keys.has('-') || keys.has('_')) { zoom(Math.exp(1.5 * dt)); interrupt(); }
    if (auto) goal.yaw += auto * dt;
    const s = 1 - Math.exp(-dt * 7);
    now.target.lerp(goal.target, s);
    now.yaw += (goal.yaw - now.yaw) * s;
    now.pitch += (goal.pitch - now.pitch) * s;
    now.dist += (goal.dist - now.dist) * s;
    apply();
  }

  function boardSize() {
    return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) + 1;
  }

  function setView(name) {
    const v = VIEWS[name];
    if (!v) return;
    view = name;
    goal.pitch = v.pitch;
    const size = boardSize();
    goal.dist = name === 'street' ? v.dist : name === 'overhead' ? Math.max(v.dist, size * 1.25) : Math.max(v.dist, size * 0.95);
    auto = name === 'cinematic' ? 0.13 : 0;
    if (name !== 'street') goal.target.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    clampGoal();
  }

  return {
    update, setView, pan, turn, zoom,
    get view() { return view; },
    get target() { return now.target; },
    get dist() { return now.dist; },
    setBounds(b) { Object.assign(bounds, b); },
    focus(x, z, dist) {
      goal.target.set(x, 0, z);
      if (dist) goal.dist = dist;
      clampGoal();
    },
    turnBy(a) { goal.yaw += a; interrupt(); },
    tiltBy(a) { goal.pitch = clamp(goal.pitch + a, LIMITS.minPitch, LIMITS.maxPitch); interrupt(); },
    orbit(speed) { auto = speed; },
    snap() { now.target.copy(goal.target); Object.assign(now, { yaw: goal.yaw, pitch: goal.pitch, dist: goal.dist }); apply(); },
    isVisible(x, z) {
      const v = new T.Vector3(x, 0, z).project(camera);
      return Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.75 && v.z < 1;
    },
  };
}
