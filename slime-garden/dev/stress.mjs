import * as THREE from '../vendor/three/three.module.js';
import { createSlimeActor } from '../src/scene/slime-actor.mjs';
import { BODY_BOUNDS_CENTER, BODY_BOUNDS_RADIUS } from '../src/scene/slime-pose.mjs';
import {
  CAMERA_PITCH,
  CAMERA_TARGET,
  CAMERA_YAW,
  DRAG_THRESHOLD_PX,
  fitDistanceForSlots,
  FRAME_PADDING,
  HOME_SLOTS,
  placeCamera,
  setGameplayFog,
  SLOT_MARGIN,
  VFOV_DEG,
} from '../src/scene/layout.mjs';
import {
  applyQuality,
  createAutoQualityGovernor,
  dprFor,
  frameIntervalStats,
  isQualityMode,
  posePeriodSec,
  renderPeriodSec,
  shadowDiagnosticsLine,
  tierFor,
} from '../src/scene/quality.mjs';

/** Scene spec §4 home slots. Population cap stays at six. */
const POPULATION = HOME_SLOTS.length;
const LOOK_AT = CAMERA_TARGET;
const DEFAULT_YAW = CAMERA_YAW;
const DEFAULT_PITCH = CAMERA_PITCH;
const ORBIT_YAW_LIMIT = 0.4;
const IDLE_PHASES = Object.freeze([0, 0.85, 1.7, 2.55, 3.4, 4.25]);
const MAX_STRETCH = Object.freeze({ timeSec: 0.29 * 1.25, walkPhase: 0.29, walkBlend: 1 });
const STATS_CAP = 1200;
const STATS_WARMUP_MS = 2500;

const root = document.getElementById('stress-root');
const stage = root.querySelector('.slime-stage');
const errorEl = root.querySelector('[data-error]');
const pauseBtn = root.querySelector('[data-pause]');
const selectionEl = root.querySelector('[data-selection]');
const disposeEl = root.querySelector('[data-dispose-status]');
const diagEl = root.querySelector('[data-diag]');

function showError(error) {
  errorEl.hidden = false;
  errorEl.textContent = 'The 3D stress page could not load. ' + (error && error.message ? error.message : String(error));
}

function formatMs(n) {
  return Number.isFinite(n) ? n.toFixed(2) : 'n/a';
}

function gpuInfo(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (!gl || !ext) {
      return { vendor: 'not exposed', renderer: 'not exposed' };
    }
    return {
      vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'not exposed'),
      renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'not exposed'),
    };
  } catch {
    return { vendor: 'not exposed', renderer: 'not exposed' };
  }
}


function bodyWorldCenter(actor, out) {
  out.set(BODY_BOUNDS_CENTER[0], BODY_BOUNDS_CENTER[1], BODY_BOUNDS_CENTER[2]);
  actor.body.localToWorld(out);
  return out;
}

function conservativeBoundsOk(actor) {
  const arr = actor.getBodyPositionArray();
  const cx = BODY_BOUNDS_CENTER[0];
  const cy = BODY_BOUNDS_CENTER[1];
  const cz = BODY_BOUNDS_CENTER[2];
  let maxDist = 0;
  for (let i = 0; i < arr.length; i += 3) {
    const dx = arr[i] - cx;
    const dy = arr[i + 1] - cy;
    const dz = arr[i + 2] - cz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > maxDist) maxDist = d;
  }
  return { maxDist, ok: maxDist <= BODY_BOUNDS_RADIUS + 1e-3 };
}

let session = null;

function syncMotionButtons(mode, live) {
  root.querySelectorAll('[data-motion]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.motion === mode && live));
  });
}

function syncQualityButtons(preference) {
  root.querySelectorAll('[data-quality]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.quality === preference));
  });
}

function syncPauseButton(paused) {
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  pauseBtn.setAttribute('aria-pressed', String(paused));
}

function createSession() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VFOV_DEG, 1, 0.05, 60);
  scene.background = new THREE.Color(0xeaf0d6);
  scene.fog = new THREE.Fog(0xeaf0d6, 24, 52);

  const hemi = new THREE.HemisphereLight(0xf3ffff, 0x719c78, 2.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1ca, 3.1);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0xbffff2, 1.3);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0xe2eacc, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const params = new URLSearchParams(location.search);
  const requested = params.get('quality');
  let qualityPreference = isQualityMode(requested) ? requested : 'auto';
  let appliedTier = qualityPreference === 'low' ? 'low' : 'high';
  const governor = createAutoQualityGovernor();
  if (qualityPreference !== 'auto') governor.reset();

  applyQuality(renderer, camera, sun, appliedTier, {
    devicePixelRatio,
    shadowMapType: THREE.PCFSoftShadowMap,
  });

  /** @type {ReturnType<typeof createSlimeActor>[]} */
  const actors = [];
  for (let i = 0; i < POPULATION; i++) {
    const slot = HOME_SLOTS[i];
    const actor = createSlimeActor(THREE, {
      parent: scene,
      id: `slime-${i + 1}`,
      x: slot.x,
      z: slot.z,
      yaw: 0,
      timeSec: IDLE_PHASES[i],
      comparisonTravelEnabled: false,
    });
    actor.setComparisonTravelEnabled(false);
    actors.push(actor);
  }

  const bodies = actors.map((a) => a.body);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const world = new THREE.Vector3();
  const pointerNdc = new THREE.Vector2();

  let live = true;
  let mode = 'idle';
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selectedId = null;
  let yaw = DEFAULT_YAW;
  let pitch = DEFAULT_PITCH;
  let distance = 8;
  let previous = performance.now();
  let poseAcc = 0;
  let renderAcc = 0;
  let raf = 0;
  let stopped = false;
  let lastRenderAt = 0;
  const renderIntervals = [];
  let statsStartedAt = 0;
  let sampleDurationMs = 0;
  const gpu = gpuInfo(renderer);

  let pointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerLastX = 0;
  let pointerLastY = 0;
  let pointerMoved = false;
  let orbiting = false;

  function qualityState() {
    return applyQuality(renderer, camera, sun, appliedTier, {
      devicePixelRatio,
      shadowMapType: THREE.PCFSoftShadowMap,
    });
  }

  function applyTier(nextTier, { resetGovernor } = {}) {
    appliedTier = nextTier === 'low' ? 'low' : 'high';
    qualityState();
    poseAcc = 0;
    renderAcc = 0;
    renderIntervals.length = 0;
    statsStartedAt = 0;
    if (resetGovernor) governor.reset();
    resize();
  }

  function setQualityPreference(next) {
    if (!isQualityMode(next)) return;
    qualityPreference = next;
    syncQualityButtons(qualityPreference);
    if (next === 'auto') {
      applyTier('high', { resetGovernor: true });
    } else {
      applyTier(next, { resetGovernor: true });
    }
  }

  function setSelected(id) {
    selectedId = id;
    for (const actor of actors) actor.setSelected(actor.id === id);
    selectionEl.textContent = id
      ? `Selection: ${id} (ring on; body-mesh raycast).`
      : 'Selection: none. Click a slime or run the selection test.';
    delete selectionEl.dataset.ok;
  }

  function runSelectionTest() {
    if (!actors.length) {
      selectionEl.dataset.ok = 'false';
      selectionEl.textContent = 'Selection test: FAIL — no actors.';
      return { ok: false, results: [] };
    }
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const results = [];
    let ok = true;
    for (const actor of actors) {
      bodyWorldCenter(actor, world);
      world.project(camera);
      const onScreen = Math.abs(world.x) <= 1 && Math.abs(world.y) <= 1 && world.z <= 1;
      ndc.set(world.x, world.y);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(bodies, false);
      const first = hits[0];
      const hitId = first && first.object.userData.slimeId;
      const roles = hits.map((h) => h.object.userData.role);
      const hitOk = onScreen && hitId === actor.id && roles.every((r) => r === 'slime-body');
      if (!hitOk) ok = false;
      results.push({
        id: actor.id,
        onScreen,
        hitId: hitId || null,
        roles,
        ok: hitOk,
      });
    }
    selectionEl.dataset.ok = String(ok);
    selectionEl.textContent = ok
      ? `Selection test: PASS — raycast hit each of ${results.length} body meshes only.`
      : `Selection test: FAIL — ${results.filter((r) => !r.ok).map((r) => r.id).join(', ') || 'unknown'}.`;
    return { ok, results };
  }

  function snapMaxStretch() {
    live = false;
    paused = true;
    syncPauseButton(paused);
    syncMotionButtons(mode, live);
    const bounds = [];
    for (const actor of actors) {
      actor.setPose({
        timeSec: MAX_STRETCH.timeSec,
        walkPhase: MAX_STRETCH.walkPhase,
        walkBlend: MAX_STRETCH.walkBlend,
        paused: true,
      });
      bounds.push({ id: actor.id, ...conservativeBoundsOk(actor) });
    }
    const boundsOk = bounds.every((b) => b.ok);
    selectionEl.dataset.ok = String(boundsOk);
    selectionEl.textContent = boundsOk
      ? `Snapped to walk phase 0.29 blend 1 (max stretch). Conservative bounds OK (r≤${BODY_BOUNDS_RADIUS}). Click each slime or run Selection test.`
      : `Snap stretch: bounds overflow — ${bounds.filter((b) => !b.ok).map((b) => `${b.id} d=${b.maxDist.toFixed(3)}`).join(', ')}`;
    return bounds;
  }

  function pickFromClient(clientX, clientY) {
    if (!actors.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(bodies, false);
    const hit = hits[0];
    if (!hit || hit.object.userData.role !== 'slime-body') return null;
    return hit.object.userData.slimeId || null;
  }

  function writeDiag() {
    const stats = frameIntervalStats(renderIntervals);
    const info = renderer.info.render;
    const travel = actors.map((a) => a.getPose().comparisonTravelEnabled);
    const travelOff = travel.length === 0 || travel.every((v) => v === false);
    const cssW = stage.clientWidth;
    const cssH = stage.clientHeight;
    const qualityLine = qualityPreference === 'auto'
      ? `quality: auto (applied ${appliedTier}${governor.dropped ? ', dropped after two slow windows; no oscillation' : ', starts high'})`
      : `quality: ${qualityPreference} (applied ${appliedTier})`;
    const sampleNote = stats.count
      ? `frame interval after ${STATS_WARMUP_MS}ms warmup, n=${stats.count} over ${formatMs(sampleDurationMs)}ms (short local sample — not a 60s mobile claim)`
      : `frame interval: waiting for ${STATS_WARMUP_MS}ms warmup`;
    diagEl.textContent = [
      `actors: ${actors.length} (cap ${POPULATION}; not lowered)`,
      `renderer.info.render.calls: ${info.calls}`,
      `renderer.info.render.triangles: ${info.triangles}`,
      `${sampleNote}`,
      `median: ${formatMs(stats.median)} ms · p90: ${formatMs(stats.p90)} ms · p95: ${formatMs(stats.p95)} ms`,
      `viewport: ${cssW}×${cssH} css px · drawingBuffer DPR: ${renderer.getPixelRatio()} (devicePixelRatio ${devicePixelRatio}, cap via dprFor=${dprFor(appliedTier, devicePixelRatio)})`,
      qualityLine,
      `pose ${1 / posePeriodSec(appliedTier)} Hz · render ${1 / renderPeriodSec(appliedTier)} Hz · ${shadowDiagnosticsLine(appliedTier)}`,
      `comparison travel: ${travelOff ? 'OFF' : 'ON (unexpected)'}`,
      `userAgent: ${navigator.userAgent}`,
      `hardwareConcurrency: ${navigator.hardwareConcurrency ?? 'n/a'} · gpu vendor: ${gpu.vendor} · gpu renderer: ${gpu.renderer}`,
      'Do not treat this page as evidence of generic mobile support.',
    ].join('\n');
  }

  function resize() {
    const w = stage.clientWidth;
    const h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    distance = fitDistanceForSlots(
      camera.aspect,
      camera.fov,
      DEFAULT_YAW,
      DEFAULT_PITCH,
      LOOK_AT,
      HOME_SLOTS,
      SLOT_MARGIN,
      FRAME_PADDING,
    );
    placeCamera(camera, yaw, pitch, distance, LOOK_AT);
    setGameplayFog(scene.fog, distance);
    camera.far = Math.max(60, distance + 24, scene.fog.far + 4);
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  function onPointerDown(e) {
    if (e.isPrimary === false) return;
    if (e.button != null && e.button !== 0) return;
    pointerId = e.pointerId;
    pointerStartX = pointerLastX = e.clientX;
    pointerStartY = pointerLastY = e.clientY;
    pointerMoved = false;
    orbiting = false;
  }

  function onPointerMove(e) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const dx = e.clientX - pointerLastX;
    const dy = e.clientY - pointerLastY;
    pointerLastX = e.clientX;
    pointerLastY = e.clientY;
    const total = Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY);
    if (total > DRAG_THRESHOLD_PX) pointerMoved = true;
    if (e.pointerType === 'touch') return;
    if (!pointerMoved) return;
    orbiting = true;
    yaw = THREE.MathUtils.clamp(yaw - dx * 0.008, -ORBIT_YAW_LIMIT, ORBIT_YAW_LIMIT);
    pitch = THREE.MathUtils.clamp(pitch + dy * 0.006, 0.35, 0.95);
    placeCamera(camera, yaw, pitch, distance, LOOK_AT);
  }

  function onPointerUp(e) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const wasClick = !pointerMoved && !orbiting;
    pointerId = null;
    orbiting = false;
    if (!wasClick) return;
    const id = pickFromClient(e.clientX, e.clientY);
    if (id) setSelected(id);
  }

  function onPointerCancel(e) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    pointerId = null;
    orbiting = false;
    pointerMoved = true;
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerCancel);

  function present(now) {
    placeCamera(camera, yaw, pitch, distance, LOOK_AT);
    renderer.render(scene, camera);
    if (!statsStartedAt) statsStartedAt = now;
    if (now - statsStartedAt >= STATS_WARMUP_MS) {
      if (lastRenderAt > 0) {
        const interval = now - lastRenderAt;
        if (interval > 0 && interval < 1000 && !document.hidden) {
          if (renderIntervals.length >= STATS_CAP) renderIntervals.shift();
          renderIntervals.push(interval);
          sampleDurationMs = now - statsStartedAt - STATS_WARMUP_MS;
        }
      }
    }
    lastRenderAt = now;
    writeDiag();
  }

  function animate(now) {
    if (stopped) return;
    if (!root.isConnected) {
      disposeSession(session);
      return;
    }
    raf = requestAnimationFrame(animate);
    const rawDt = (now - previous) / 1000;
    previous = now;
    const dt = Math.min(0.05, Math.max(0, rawDt));

    if (qualityPreference === 'auto' && appliedTier === 'high' && !document.hidden) {
      const next = governor.observe(now, rawDt * 1000);
      if (next === 'low' && appliedTier !== 'low') applyTier('low');
    }

    if (document.hidden) return;

    poseAcc += dt;
    const posePeriod = posePeriodSec(appliedTier);
    if (actors.length && poseAcc >= posePeriod) {
      const step = Math.min(0.05, poseAcc);
      if (live) {
        for (let i = 0; i < actors.length; i++) actors[i].update(step, { mode, paused });
      }
      poseAcc = 0;
    }

    if (appliedTier === 'low') {
      renderAcc += dt;
      if (renderAcc < renderPeriodSec('low')) return;
      renderAcc = 0;
    }
    present(now);
  }

  syncPauseButton(paused);
  syncMotionButtons(mode, live);
  syncQualityButtons(qualityPreference);
  raf = requestAnimationFrame(animate);

  return {
    renderer,
    scene,
    camera,
    sun,
    floor,
    floorMat,
    actors,
    bodies,
    observer,
    governor,
    gpu,
    stopLoop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    get live() { return live; },
    get mode() { return mode; },
    get paused() { return paused; },
    get qualityPreference() { return qualityPreference; },
    get appliedTier() { return appliedTier; },
    get selectedId() { return selectedId; },
    setLive(nextLive, nextMode) {
      live = nextLive;
      if (nextMode) mode = nextMode;
      syncMotionButtons(mode, live);
    },
    setPaused(next) {
      paused = next;
      syncPauseButton(paused);
    },
    setQualityPreference,
    setSelected,
    pickFromClient,
    runSelectionTest,
    snapMaxStretch,
    resetView() {
      yaw = DEFAULT_YAW;
      pitch = DEFAULT_PITCH;
      resize();
    },
    diagSnapshot() {
      const stats = frameIntervalStats(renderIntervals);
      return {
        actorCount: actors.length,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        median: stats.median,
        p90: stats.p90,
        p95: stats.p95,
        sampleCount: stats.count,
        sampleDurationMs,
        viewport: { w: stage.clientWidth, h: stage.clientHeight },
        dpr: renderer.getPixelRatio(),
        qualityPreference,
        appliedTier,
        shadowNote: shadowDiagnosticsLine(appliedTier),
        userAgent: navigator.userAgent,
        gpu,
        comparisonTravel: actors.map((a) => a.getPose().comparisonTravelEnabled),
        selectedId,
      };
    },
    listeners: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}

function disposeSession(current, { removeCanvas = true } = {}) {
  if (!current) return;
  current.stopLoop();
  current.observer.disconnect();
  stage.removeEventListener('pointerdown', current.listeners.onPointerDown);
  stage.removeEventListener('pointermove', current.listeners.onPointerMove);
  stage.removeEventListener('pointerup', current.listeners.onPointerUp);
  stage.removeEventListener('pointercancel', current.listeners.onPointerCancel);
  try {
    for (const actor of current.actors.splice(0, current.actors.length)) actor.dispose();
  } catch (error) {
    throw error;
  }
  current.bodies.length = 0;
  current.floor.geometry.dispose();
  current.floorMat.dispose();
  if (current.sun && current.sun.shadow && current.sun.shadow.map) {
    current.sun.shadow.map.dispose();
    current.sun.shadow.map = null;
  }
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

function waitFrames(n) {
  return new Promise((resolve) => {
    let left = n;
    function tick() {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

async function runPacketChecks() {
  const report = { ok: false, steps: [] };
  function step(name, ok, detail) {
    report.steps.push({ name, ok, detail });
  }
  try {
    if (!session || session.actors.length !== POPULATION) {
      step('mount-six', false, `actors=${session ? session.actors.length : 0}`);
      return report;
    }
    step('mount-six', true, `actors=${session.actors.length}`);
    const travelOff = session.actors.every((a) => a.getPose().comparisonTravelEnabled === false);
    step('travel-off', travelOff, travelOff ? 'all false' : 'someone still travelling');
    const before = countStageCanvases();
    root.querySelector('[data-dispose]').click();
    const afterDispose = countStageCanvases();
    step('dispose', afterDispose === 0 && !session, `canvases ${before} → ${afterDispose}`);
    root.querySelector('[data-remount]').click();
    await waitFrames(3);
    step('remount', !!(session && session.actors.length === POPULATION), `actors=${session ? session.actors.length : 0}`);
    if (!session) return report;
    const a0 = session.actors[0].getBodyPositionArray();
    const a1 = session.actors[1].getBodyPositionArray();
    let differ = false;
    if (a0 !== a1) {
      for (let i = 0; i < a0.length; i++) {
        if (a0[i] !== a1[i]) { differ = true; break; }
      }
    }
    step('independent-buffers', a0 !== a1 && differ, `sharedRef=${a0 === a1} differ=${differ}`);
    const pickId = session.actors[0].id;
    session.setSelected(pickId);
    step('select', session.selectedId === pickId, String(session.selectedId));
    const bounds = session.snapMaxStretch();
    step('max-stretch-bounds', bounds.every((b) => b.ok), JSON.stringify(bounds));
    const sel = session.runSelectionTest();
    step('raycast-bodies', sel.ok, JSON.stringify(sel.results));
    const clickHits = [];
    let clicksOk = true;
    session.scene.updateMatrixWorld(true);
    session.camera.updateMatrixWorld();
    for (const actor of session.actors) {
      const center = new THREE.Vector3();
      bodyWorldCenter(actor, center);
      center.project(session.camera);
      const rect = session.renderer.domElement.getBoundingClientRect();
      const clientX = (center.x * 0.5 + 0.5) * rect.width + rect.left;
      const clientY = (-center.y * 0.5 + 0.5) * rect.height + rect.top;
      const hit = session.pickFromClient(clientX, clientY);
      const okClick = hit === actor.id;
      if (!okClick) clicksOk = false;
      clickHits.push({ id: actor.id, hit, ok: okClick });
    }
    step('click-each-at-stretch', clicksOk, JSON.stringify(clickHits));
    const waitStart = performance.now();
    while (performance.now() - waitStart < STATS_WARMUP_MS + 1200) {
      await waitFrames(2);
    }
    report.diag = session.diagSnapshot();
    report.ok = report.steps.every((s) => s.ok);
  } catch (error) {
    step('exception', false, error && error.message ? error.message : String(error));
  }
  return report;
}

try {
  session = createSession();

  const params = new URLSearchParams(location.search);
  if (params.get('pause') === '1' || params.get('paused') === '1') {
    session.setPaused(true);
  }

  root.querySelectorAll('[data-motion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!session || !session.actors.length) return;
      session.setLive(true, btn.dataset.motion);
    });
  });

  pauseBtn.addEventListener('click', () => {
    if (!session) return;
    session.setPaused(!session.paused);
  });

  root.querySelectorAll('[data-quality]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!session) return;
      session.setQualityPreference(btn.dataset.quality);
    });
  });

  root.querySelector('[data-reset-view]').addEventListener('click', () => {
    if (session) session.resetView();
  });

  root.querySelector('[data-snap-stretch]').addEventListener('click', () => {
    if (session) session.snapMaxStretch();
  });

  root.querySelector('[data-selection-test]').addEventListener('click', () => {
    if (session) session.runSelectionTest();
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
        ? `Dispose: PASS — six actors disposed; stage canvases ${before} → ${after}. Press Remount to restore.`
        : `Dispose: FAIL — ${after} canvas(es) remain (started with ${before}).`;
      selectionEl.textContent = 'Actors disposed.';
      diagEl.textContent = 'Actors disposed. Remount to restore diagnostics.';
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
      disposeEl.textContent = `Remount: PASS — ${POPULATION} actors restored; stage canvases ${countStageCanvases()}.`;
    } catch (error) {
      disposeEl.dataset.ok = 'false';
      disposeEl.textContent = 'Remount: FAIL — ' + (error && error.message ? error.message : String(error));
      showError(error);
    }
  });

  window.__slimeStress = {
    get session() { return session; },
    HOME_SLOTS,
    POPULATION,
    fitDistanceForSlots,
    runPacketChecks,
    tierFor,
  };

  if (params.get('autotest') === '1') {
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        const report = await runPacketChecks();
        document.documentElement.dataset.autotest = report.ok ? 'true' : 'false';
        document.documentElement.dataset.autotestReport = JSON.stringify(report);
        disposeEl.textContent = (disposeEl.textContent || '') + `\nAutotest: ${report.ok ? 'PASS' : 'FAIL'}`;
      });
    });
  }
} catch (error) {
  console.error(error);
  showError(error);
}
