import * as THREE from '../vendor/three/three.module.js';
import { createSlimeActor } from '../src/scene/slime-actor.mjs';
import { WALK_CYCLE_SEC, WALK_KEYS } from '../src/scene/slime-pose.mjs';

const SPEC_POSES = [
  { id: 'idle-0', label: 'Idle t=0', timeSec: 0, walkBlend: 0, walkPhase: 0 },
  { id: 'idle-1', label: 'Idle t=1.0', timeSec: 1, walkBlend: 0, walkPhase: 0 },
  { id: 'blink-mid', label: 'Blink midpoint t=4.775', timeSec: 4.775, walkBlend: 0, walkPhase: 0 },
];

for (let i = 0; i < WALK_KEYS.length - 1; i++) {
  const phase = WALK_KEYS[i][0];
  SPEC_POSES.push({
    id: `walk-${phase}`,
    label: `Walk phase ${phase}`,
    timeSec: phase * WALK_CYCLE_SEC,
    walkBlend: 1,
    walkPhase: phase,
  });
}

const root = document.getElementById('inspection-root');
const stage = root.querySelector('.slime-stage');
const errorEl = root.querySelector('[data-error]');
const pauseBtn = root.querySelector('[data-pause]');
const idleTimeInput = root.querySelector('[data-idle-time]');
const walkPhaseInput = root.querySelector('[data-walk-phase]');
const walkBlendInput = root.querySelector('[data-walk-blend]');
const presetSelect = root.querySelector('[data-preset-select]');
const poseReadout = root.querySelector('[data-pose-readout]');
const independenceEl = root.querySelector('[data-independence]');
const disposeEl = root.querySelector('[data-dispose-status]');
const selectABtn = root.querySelector('[data-select-a]');

for (const pose of SPEC_POSES) {
  const opt = document.createElement('option');
  opt.value = pose.id;
  opt.textContent = pose.label;
  presetSelect.appendChild(opt);
}

function showError(error) {
  errorEl.hidden = false;
  errorEl.textContent = 'The 3D inspection page could not load. ' + (error && error.message ? error.message : String(error));
}

let session = null;

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function formatNum(n) {
  return Number.isFinite(n) ? n.toFixed(4) : String(n);
}

function syncPauseButton(paused) {
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  pauseBtn.setAttribute('aria-pressed', String(paused));
}

function findPreset(id) {
  return SPEC_POSES.find((p) => p.id === id) || null;
}

function createSession() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 60);
  scene.background = new THREE.Color(0xeaf0d6);
  scene.fog = new THREE.Fog(0xeaf0d6, 12, 30);

  const hemi = new THREE.HemisphereLight(0xf3ffff, 0x719c78, 2.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1ca, 3.1);
  sun.position.set(-3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 20 });
  sun.shadow.normalBias = .025;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xbffff2, 1.3);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0xe2eacc, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const actorA = createSlimeActor(THREE, {
    parent: scene,
    id: 'A',
    x: 0,
    z: 0,
    yaw: 0,
    timeSec: 0,
    comparisonTravelEnabled: true,
  });
  const actorB = createSlimeActor(THREE, {
    parent: scene,
    id: 'B',
    x: 2.8,
    z: 0,
    yaw: 0,
    timeSec: 1.85,
    comparisonTravelEnabled: true,
  });

  const snapshotB = new Float32Array(actorB.getBodyPositionArray().length);
  const snapshotA = new Float32Array(actorA.getBodyPositionArray().length);

  let live = true;
  let mode = 'idle';
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selectedA = false;
  let yaw = .23, pitch = .31, distance = 5.8, desiredDistance = 5.8, dragging = false, px = 0, py = 0;
  let previous = performance.now();
  let raf = 0;
  let stopped = false;

  function fitCamera(dt) {
    distance = THREE.MathUtils.damp(distance, desiredDistance, 7, dt);
    const fit = Math.max(1, .85 / camera.aspect);
    const d = distance * fit;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, .65 + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    camera.lookAt(0, .65, 0);
  }

  function writeReadout() {
    if (!actorA) return;
    const a = actorA.getPose();
    const b = actorB ? actorB.getPose() : null;
    poseReadout.textContent = b
      ? `A t=${formatNum(a.timeSec)} phase=${formatNum(a.walkPhase)} blend=${formatNum(a.walkBlend)} lift=${formatNum(a.lift)} · B t=${formatNum(b.timeSec)} phase=${formatNum(b.walkPhase)} · live=${live ? 'on' : 'snap'} travel=on`
      : `Actors disposed.`;
  }

  function syncMotionButtons() {
    root.querySelectorAll('[data-motion]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.motion === mode && live));
    });
  }

  function setLive(nextLive, nextMode) {
    live = nextLive;
    if (nextMode) mode = nextMode;
    syncMotionButtons();
  }

  function applySnapToA(spec) {
    setLive(false, mode);
    paused = true;
    syncPauseButton(paused);
    actorA.setPose({
      timeSec: spec.timeSec,
      walkPhase: spec.walkPhase,
      walkBlend: spec.walkBlend,
      paused: true,
    });
    idleTimeInput.value = String(spec.timeSec);
    walkPhaseInput.value = String(spec.walkPhase);
    walkBlendInput.value = String(spec.walkBlend);
    presetSelect.value = spec.id;
    writeReadout();
  }

  function snapFromInputs() {
    if (!actorA) return;
    setLive(false, mode);
    const timeSec = Number(idleTimeInput.value);
    const walkPhase = Number(walkPhaseInput.value);
    const walkBlend = Number(walkBlendInput.value);
    actorA.setPose({
      timeSec: Number.isFinite(timeSec) ? timeSec : 0,
      walkPhase: Number.isFinite(walkPhase) ? walkPhase : 0,
      walkBlend: Number.isFinite(walkBlend) ? walkBlend : 0,
    });
    writeReadout();
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  function onPointerDown(e) {
    dragging = true;
    px = e.clientX;
    py = e.clientY;
    stage.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    yaw -= (e.clientX - px) * .008;
    pitch = THREE.MathUtils.clamp(pitch + (e.clientY - py) * .006, .06, 1.35);
    px = e.clientX;
    py = e.clientY;
  }
  function onPointerUp() { dragging = false; }
  function onWheel(e) {
    e.preventDefault();
    desiredDistance = THREE.MathUtils.clamp(desiredDistance * Math.exp(e.deltaY * .001), 3, 10);
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('wheel', onWheel, { passive: false });

  function animate(now) {
    if (stopped) return;
    if (!root.isConnected) {
      disposeSession(session);
      return;
    }
    raf = requestAnimationFrame(animate);
    const dt = Math.min(.05, (now - previous) / 1000);
    previous = now;
    if (actorA && actorB && live) {
      actorA.update(dt, { mode, paused });
      actorB.update(dt, { mode, paused });
      if (!paused) {
        const a = actorA.getPose();
        idleTimeInput.value = String(a.timeSec.toFixed(3));
        walkPhaseInput.value = String(a.walkPhase.toFixed(3));
        walkBlendInput.value = String(a.walkBlend.toFixed(3));
      }
    }
    fitCamera(dt);
    renderer.render(scene, camera);
    writeReadout();
  }

  function stopLoop() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  syncPauseButton(paused);
  syncMotionButtons();
  raf = requestAnimationFrame(animate);

  const sameBuffer = actorA.getBodyPositionArray() === actorB.getBodyPositionArray();
  independenceEl.textContent = sameBuffer
    ? 'Independence: FAIL — actors share a body position buffer.'
    : 'Independence: buffers are distinct. Press “Pose actor A only” to verify A’s update does not move B.';
  independenceEl.dataset.ok = String(!sameBuffer);
  disposeEl.textContent = 'Dispose: not yet tested.';
  delete disposeEl.dataset.ok;

  return {
    renderer,
    scene,
    camera,
    floor,
    floorMat,
    actorA,
    actorB,
    snapshotA,
    snapshotB,
    observer,
    stopLoop,
    get live() { return live; },
    setLive,
    get mode() { return mode; },
    get paused() { return paused; },
    setPaused(next) {
      paused = next;
      syncPauseButton(paused);
    },
    applySnapToA,
    snapFromInputs,
    get selectedA() { return selectedA; },
    setSelectedA(next) {
      selectedA = next;
      if (this.actorA) this.actorA.setSelected(selectedA);
      selectABtn.setAttribute('aria-pressed', String(selectedA));
    },
    listeners: { onPointerDown, onPointerMove, onPointerUp, onWheel },
  };
}

function disposeSession(current, { removeCanvas = true } = {}) {
  if (!current) return;
  current.stopLoop();
  current.observer.disconnect();
  stage.removeEventListener('pointerdown', current.listeners.onPointerDown);
  stage.removeEventListener('pointermove', current.listeners.onPointerMove);
  stage.removeEventListener('pointerup', current.listeners.onPointerUp);
  stage.removeEventListener('pointercancel', current.listeners.onPointerUp);
  stage.removeEventListener('wheel', current.listeners.onWheel);
  try {
    if (current.actorA) current.actorA.dispose();
    if (current.actorB) current.actorB.dispose();
  } catch (error) {
    throw error;
  }
  current.actorA = null;
  current.actorB = null;
  current.floor.geometry.dispose();
  current.floorMat.dispose();
  if (removeCanvas) {
    current.renderer.dispose();
    if (current.renderer.domElement && current.renderer.domElement.parentNode) {
      current.renderer.domElement.parentNode.removeChild(current.renderer.domElement);
    }
  }
}

function countStageCanvases() {
  return stage.querySelectorAll('canvas').length;
}

try {
  session = createSession();

  const params = new URLSearchParams(location.search);
  const presetId = params.get('preset');
  if (presetId) {
    const spec = findPreset(presetId);
    if (spec) session.applySnapToA(spec);
  }
  if (params.get('pause') === '1' || params.get('paused') === '1') {
    session.setPaused(true);
  }
  if (params.get('autotest') === '1') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const btn = root.querySelector('[data-pose-a-only]');
        if (btn) btn.click();
        document.documentElement.dataset.autotest = independenceEl.dataset.ok || 'missing';
      });
    });
  } else if (params.get('autotest') === 'dispose') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.querySelector('[data-dispose]').click();
        const afterDispose = disposeEl.dataset.ok;
        root.querySelector('[data-remount]').click();
        document.documentElement.dataset.autotest = String(afterDispose === 'true' && disposeEl.dataset.ok === 'true');
      });
    });
  }

  root.querySelectorAll('[data-motion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!session || !session.actorA || !session.actorB) return;
      session.setLive(true, btn.dataset.motion);
    });
  });

  pauseBtn.addEventListener('click', () => {
    if (!session) return;
    session.setPaused(!session.paused);
  });

  idleTimeInput.addEventListener('change', () => { if (session) session.snapFromInputs(); });
  walkPhaseInput.addEventListener('change', () => { if (session) session.snapFromInputs(); });
  walkBlendInput.addEventListener('change', () => { if (session) session.snapFromInputs(); });
  idleTimeInput.addEventListener('input', () => { if (session && !session.live) session.snapFromInputs(); });
  walkPhaseInput.addEventListener('input', () => { if (session && !session.live) session.snapFromInputs(); });
  walkBlendInput.addEventListener('input', () => { if (session && !session.live) session.snapFromInputs(); });

  presetSelect.addEventListener('change', () => {
    const spec = findPreset(presetSelect.value);
    if (spec && session && session.actorA) session.applySnapToA(spec);
  });

  root.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spec = findPreset(btn.dataset.preset);
      if (spec && session && session.actorA) session.applySnapToA(spec);
    });
  });

  selectABtn.addEventListener('click', () => {
    if (!session || !session.actorA) return;
    session.setSelectedA(!session.selectedA);
  });

  root.querySelector('[data-pose-a-only]').addEventListener('click', () => {
    if (!session || !session.actorA || !session.actorB) {
      independenceEl.textContent = 'Independence: FAIL — actors are missing (dispose them first?).';
      independenceEl.dataset.ok = 'false';
      return;
    }
    session.setLive(false, session.mode);
    session.setPaused(true);
    const arrA = session.actorA.getBodyPositionArray();
    const arrB = session.actorB.getBodyPositionArray();
    const sharedRef = arrA === arrB;
    session.actorB.copyBodyPositions(session.snapshotB);
    session.actorA.copyBodyPositions(session.snapshotA);
    session.actorA.setPose({ timeSec: 4.775, walkPhase: .29, walkBlend: 1, paused: true });
    idleTimeInput.value = '4.775';
    walkPhaseInput.value = '0.29';
    walkBlendInput.value = '1';
    const bUnchanged = arraysEqual(arrB, session.snapshotB);
    const aChanged = !arraysEqual(arrA, session.snapshotA);
    const ok = !sharedRef && bUnchanged && aChanged;
    independenceEl.dataset.ok = String(ok);
    independenceEl.textContent = ok
      ? 'Independence: PASS — posing A left B’s body positions unchanged; buffers are distinct; A’s vertices moved.'
      : `Independence: FAIL — sharedRef=${sharedRef} BUnchanged=${bUnchanged} AChanged=${aChanged}.`;
  });

  root.querySelector('[data-dispose]').addEventListener('click', () => {
    if (!session) {
      disposeEl.textContent = 'Dispose: FAIL — no session.';
      disposeEl.dataset.ok = 'false';
      return;
    }
    try {
      const before = countStageCanvases();
      disposeSession(session, { removeCanvas: true });
      session = null;
      const after = countStageCanvases();
      const ok = after === 0;
      disposeEl.dataset.ok = String(ok);
      disposeEl.textContent = ok
        ? `Dispose: PASS — both actors disposed without throw; stage canvases ${before} → ${after}. Press Remount to restore.`
        : `Dispose: FAIL — actors disposed but ${after} canvas(es) remain (started with ${before}).`;
      poseReadout.textContent = 'Actors disposed.';
    } catch (error) {
      disposeEl.dataset.ok = 'false';
      disposeEl.textContent = 'Dispose: FAIL — ' + (error && error.message ? error.message : String(error));
    }
  });

  root.querySelector('[data-remount]').addEventListener('click', () => {
    try {
      if (session) disposeSession(session, { removeCanvas: true });
      session = createSession();
      disposeEl.dataset.ok = 'true';
      disposeEl.textContent = `Remount: PASS — actors restored; stage canvases ${countStageCanvases()}.`;
    } catch (error) {
      disposeEl.dataset.ok = 'false';
      disposeEl.textContent = 'Remount: FAIL — ' + (error && error.message ? error.message : String(error));
      showError(error);
    }
  });

  window.__slimeInspection = {
    get session() { return session; },
    SPEC_POSES,
    applyPreset(id) {
      const spec = findPreset(id);
      if (spec && session && session.actorA) session.applySnapToA(spec);
      return spec;
    },
  };
} catch (error) {
  console.error(error);
  showError(error);
}
