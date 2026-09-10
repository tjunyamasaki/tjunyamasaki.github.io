import * as THREE from '../vendor/three/three.module.js';
import { createCameraRig } from '../src/scene/camera.mjs';
import { createFarmHabitat, setFarmFog } from '../src/scene/habitat-farm.mjs';
import { createPointerRouter } from '../src/input/pointer-router.mjs';

const root = document.getElementById('farm-root');
const stage = root.querySelector('[data-stage]');
const errorEl = root.querySelector('[data-error]');
const readoutEl = root.querySelector('[data-readout]');
const pickEl = root.querySelector('[data-pick]');
const orbitHint = root.querySelector('[data-orbit-hint]');
const reducedEl = root.querySelector('[data-reduced]');

function showError(error) {
  errorEl.hidden = false;
  errorEl.textContent =
    'The farm harness could not load. ' +
    (error && error.message ? error.message : String(error));
}

function formatNum(n, digits = 3) {
  return Number.isFinite(n) ? n.toFixed(digits) : String(n);
}

function formatHit(hit) {
  if (!hit || hit.kind === 'none') {
    const occluder = hit && hit.occluder ? ` (occluder ${hit.occluder})` : '';
    return `kind none${occluder}`;
  }
  if (hit.kind === 'object') {
    return `kind object · interactableId ${hit.interactableId}`;
  }
  if (hit.kind === 'ground') {
    return `kind ground · (${formatNum(hit.point.x, 2)}, ${formatNum(hit.point.z, 2)})`;
  }
  return JSON.stringify(hit);
}

function boot() {
  const prefersReduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  reducedEl.checked = prefersReduced;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xeaf0d6, 1);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeaf0d6);
  scene.fog = new THREE.Fog(0xeaf0d6, 28, 80);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80);
  const habitat = createFarmHabitat(THREE, scene, { capacity: 6, shrubLevel: 0 });

  const rig = createCameraRig({
    reducedMotion: prefersReduced,
    getAspect: () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      return h > 0 ? w / h : 16 / 9;
    },
  });

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  /** @type {'care' | 'orbit'} */
  let mode = 'care';
  let capacity = 6;
  let shrubLevel = 0;
  /** @type {object | null} */
  let lastIntent = null;
  /** @type {object | null} */
  let lastPick = null;
  /** @type {object | null} */
  let hoverPick = null;
  let raf = 0;
  let previous = performance.now();
  let stopped = false;

  function pickClient(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { kind: 'none' };
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    return habitat.pick(raycaster);
  }

  const router = createPointerRouter({
    getMode: () => mode,
    getTool: () => 'berry',
    pick: (clientX, clientY) => {
      const hit = pickClient(clientX, clientY);
      if (hit.kind === 'object') {
        return { kind: 'object', upgradeId: hit.interactableId };
      }
      if (hit.kind === 'ground') {
        return { kind: 'ground', point: hit.point, valid: true };
      }
      return { kind: 'none' };
    },
    onIntent: (intent) => {
      lastIntent = intent;
      if (intent && intent.type === 'WORLD_CLICK') lastPick = intent.hit;
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
    orbitHint.hidden = mode !== 'orbit';
  }

  function syncCapacityButtons() {
    root.querySelectorAll('button[data-capacity]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.capacity) === capacity));
    });
  }

  function syncShrubButtons() {
    root.querySelectorAll('button[data-shrub]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.shrub) === shrubLevel));
    });
  }

  function setMode(next) {
    const modeNext = next === 'orbit' ? 'orbit' : 'care';
    if (modeNext === mode) return;
    mode = modeNext;
    router.notifyModeChange();
    syncModeButtons();
  }

  function setCapacity(next) {
    const n = next === 10 ? 10 : 6;
    capacity = n;
    habitat.setCapacity(n);
    syncCapacityButtons();
  }

  function setShrubLevel(next) {
    const n = Math.max(0, Math.min(3, next | 0));
    shrubLevel = n;
    habitat.setShrubLevel(n);
    syncShrubButtons();
  }

  function writeReadout() {
    const view = rig.getView();
    const intent = lastIntent ? JSON.stringify(lastIntent) : 'none';
    readoutEl.textContent = [
      `mode ${mode} · framing ${view.framing} · capacity ${capacity} · shrub ${shrubLevel}`,
      `yaw ${formatNum(view.yaw)} · pitch ${formatNum(view.pitch)} · distance ${formatNum(view.distance)}`,
      `target (${formatNum(view.target.x)}, ${formatNum(view.target.y)}, ${formatNum(view.target.z)})`,
      `fog ${formatNum(scene.fog.near, 1)}–${formatNum(scene.fog.far, 1)} · far ${formatNum(camera.far, 1)}`,
      `last intent ${intent}`,
    ].join('\n');
    pickEl.textContent = [
      `hover ${formatHit(hoverPick)}`,
      `click ${formatHit(lastPick)}`,
    ].join('\n');
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!(w > 0) || !(h > 0)) return;
    renderer.setSize(w, h, false);
    rig.resize(w, h);
    rig.applyTo(camera);
    setFarmFog(scene.fog, rig.getView().distance, rig.getFarPlane());
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  syncModeButtons();
  syncCapacityButtons();
  syncShrubButtons();

  stage.addEventListener('contextmenu', (event) => {
    if (mode === 'orbit') event.preventDefault();
  });
  stage.addEventListener('pointermove', (event) => {
    hoverPick = pickClient(event.clientX, event.clientY);
  });

  root.querySelectorAll('button[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
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
  root.querySelectorAll('button[data-capacity]').forEach((btn) => {
    btn.addEventListener('click', () => setCapacity(Number(btn.dataset.capacity)));
  });
  root.querySelectorAll('button[data-shrub]').forEach((btn) => {
    btn.addEventListener('click', () => setShrubLevel(Number(btn.dataset.shrub)));
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
    } else if (event.key === '1') {
      setMode('care');
    } else if (event.key === '2') {
      setMode('orbit');
    } else if (event.key === '6') {
      setCapacity(6);
    } else if (event.key === '0') {
      setCapacity(10);
    }
  });

  function animate(now) {
    if (stopped) return;
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
    previous = now;
    rig.update(dt);
    rig.applyTo(camera);
    setFarmFog(scene.fog, rig.getView().distance, rig.getFarPlane());
    habitat.updateFenceFade(camera.position);
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
    habitat.dispose();
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
