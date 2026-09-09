import * as THREE from '../vendor/three/three.module.js';
import { createCameraRig } from '../src/scene/camera.mjs';
import { createPointerRouter } from '../src/input/pointer-router.mjs';
import {
  FENCE_CENTERLINE_X,
  FENCE_CENTERLINE_Z,
  GATE_STAGING,
  HOME_SLOTS,
} from '../src/world/layout.mjs';

const FOCUS_SLOT = HOME_SLOTS[3];

const root = document.getElementById('camera-root');
const stage = root.querySelector('[data-stage]');
const errorEl = root.querySelector('[data-error]');
const readoutEl = root.querySelector('[data-readout]');
const orbitHint = root.querySelector('[data-orbit-hint]');
const reducedEl = root.querySelector('[data-reduced]');

function showError(error) {
  errorEl.hidden = false;
  errorEl.textContent =
    'The camera harness could not load. ' +
    (error && error.message ? error.message : String(error));
}

function formatNum(n, digits = 3) {
  return Number.isFinite(n) ? n.toFixed(digits) : String(n);
}

function createGraybox(scene) {
  const disposers = [];
  const floorMat = new THREE.MeshBasicMaterial({ color: 0xd5ddcf });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 32), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  disposers.push(() => {
    floor.geometry.dispose();
    floorMat.dispose();
  });

  const y = 0.8;
  const positions = new Float32Array([
    -FENCE_CENTERLINE_X, y, -FENCE_CENTERLINE_Z,
    FENCE_CENTERLINE_X, y, -FENCE_CENTERLINE_Z,
    FENCE_CENTERLINE_X, y, FENCE_CENTERLINE_Z,
    -FENCE_CENTERLINE_X, y, FENCE_CENTERLINE_Z,
    -FENCE_CENTERLINE_X, y, -FENCE_CENTERLINE_Z,
  ]);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x5c6e64 });
  const fence = new THREE.Line(lineGeo, lineMat);
  scene.add(fence);
  disposers.push(() => {
    lineGeo.dispose();
    lineMat.dispose();
  });

  const gateGeo = new THREE.SphereGeometry(0.35, 12, 8);
  const gateMat = new THREE.MeshBasicMaterial({ color: 0xc45c3e });
  const gate = new THREE.Mesh(gateGeo, gateMat);
  gate.position.set(GATE_STAGING.x, 0.35, GATE_STAGING.z);
  scene.add(gate);
  disposers.push(() => {
    gateGeo.dispose();
    gateMat.dispose();
  });

  const padGeo = new THREE.CircleGeometry(0.45, 16);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshBasicMaterial({ color: 0x8aa390 });
  const focusMat = new THREE.MeshBasicMaterial({ color: 0x8fe6c9 });
  for (const slot of HOME_SLOTS) {
    const isFocus = slot.x === FOCUS_SLOT.x && slot.z === FOCUS_SLOT.z;
    const pad = new THREE.Mesh(padGeo, isFocus ? focusMat : padMat);
    pad.position.set(slot.x, 0.02, slot.z);
    scene.add(pad);
  }
  disposers.push(() => {
    padGeo.dispose();
    padMat.dispose();
    focusMat.dispose();
  });

  return {
    dispose() {
      for (const fn of disposers) fn();
    },
  };
}

function boot() {
  const prefersReduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  reducedEl.checked = prefersReduced;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xcfd6c8, 1);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80);
  const graybox = createGraybox(scene);

  const rig = createCameraRig({
    reducedMotion: prefersReduced,
    getAspect: () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      return h > 0 ? w / h : 16 / 9;
    },
  });

  /** @type {'care' | 'orbit'} */
  let mode = 'care';
  /** @type {object | null} */
  let lastIntent = null;
  let raf = 0;
  let previous = performance.now();
  let stopped = false;

  const router = createPointerRouter({
    getMode: () => mode,
    getTool: () => 'berry',
    pick: () => ({ kind: 'ground', point: { x: 0, z: 0 }, valid: true }),
    onIntent: (intent) => {
      lastIntent = intent;
    },
    onCamera: (intent) => {
      lastIntent = intent;
      rig.applyIntent(intent);
    },
    isOverPlaySurface: (event) => {
      const rect = stage.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    },
  });
  router.attach(stage);

  function syncModeButtons() {
    root.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
    stage.dataset.mode = mode;
    const orbitOn = mode === 'orbit';
    orbitHint.hidden = !orbitOn;
  }

  function setMode(next) {
    const modeNext = next === 'orbit' ? 'orbit' : 'care';
    if (modeNext === mode) return;
    mode = modeNext;
    router.notifyModeChange();
    syncModeButtons();
  }

  function writeReadout() {
    const view = rig.getView();
    const intent = lastIntent
      ? JSON.stringify(lastIntent)
      : 'none';
    readoutEl.textContent = [
      `mode ${mode} · framing ${view.framing}`,
      `yaw ${formatNum(view.yaw)} · pitch ${formatNum(view.pitch)} · distance ${formatNum(view.distance)}`,
      `target (${formatNum(view.target.x)}, ${formatNum(view.target.y)}, ${formatNum(view.target.z)})`,
      `last intent ${intent}`,
    ].join('\n');
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!(w > 0) || !(h > 0)) return;
    renderer.setSize(w, h, false);
    rig.resize(w, h);
    rig.applyTo(camera);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  syncModeButtons();

  stage.addEventListener('contextmenu', (event) => {
    if (mode === 'orbit') event.preventDefault();
  });

  root.querySelectorAll('button[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
  root.querySelector('[data-back-to-care]').addEventListener('click', () => setMode('care'));
  root.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      rig.zoomStep(Number(btn.dataset.zoom));
      lastIntent = { type: 'ZOOM', factor: btn.dataset.zoom === '-1' ? 'in' : 'out' };
    });
  });
  root.querySelector('[data-reset]').addEventListener('click', () => {
    rig.reset();
    lastIntent = { type: 'RESET_VIEW' };
  });
  root.querySelector('[data-focus]').addEventListener('click', () => {
    rig.focusResident(FOCUS_SLOT);
    lastIntent = { type: 'FOCUS_SELECTED' };
  });
  reducedEl.addEventListener('change', () => {
    rig.setReducedMotion(reducedEl.checked);
  });

  window.addEventListener('keydown', (event) => {
    if (event.target && /** @type {HTMLElement} */ (event.target).closest('input, textarea, select')) {
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      rig.zoomStep(-1);
      lastIntent = { type: 'ZOOM', factor: 'in' };
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      rig.zoomStep(1);
      lastIntent = { type: 'ZOOM', factor: 'out' };
    } else if (event.key === 'r' || event.key === 'R') {
      rig.reset();
      lastIntent = { type: 'RESET_VIEW' };
    } else if (event.key === 'f' || event.key === 'F') {
      rig.focusResident(FOCUS_SLOT);
      lastIntent = { type: 'FOCUS_SELECTED' };
    } else if (event.key === '1') {
      setMode('care');
    } else if (event.key === '2') {
      setMode('orbit');
    }
  });

  function animate(now) {
    if (stopped) return;
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
    previous = now;
    rig.update(dt);
    rig.applyTo(camera);
    renderer.render(scene, camera);
    writeReadout();
  }
  raf = requestAnimationFrame(animate);

  window.addEventListener('pagehide', () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    router.dispose();
    rig.dispose();
    graybox.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }, { once: true });
}

try {
  boot();
} catch (error) {
  showError(error);
  throw error;
}
