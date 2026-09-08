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

/**
 * Phase-2 home pads from slime-phase-2-plan/03 §2. Copied here so P2-01 does
 * not edit layout.mjs (v1 six HOME_SLOTS stay the six-actor comparison).
 * Adjacent pair distance is 3.
 */
const PHASE2_HOME_SLOTS = Object.freeze([
  Object.freeze({ x: 0, z: 2 }),
  Object.freeze({ x: -3, z: 2 }),
  Object.freeze({ x: 3, z: 2 }),
  Object.freeze({ x: -6, z: 2 }),
  Object.freeze({ x: 6, z: 2 }),
  Object.freeze({ x: -6, z: -3 }),
  Object.freeze({ x: -3, z: -3 }),
  Object.freeze({ x: 0, z: -3 }),
  Object.freeze({ x: 3, z: -3 }),
  Object.freeze({ x: 6, z: -3 }),
]);

const POPULATION_ALLOWED = Object.freeze([1, 6, 10]);
const DEFAULT_POPULATION = 10;
const SCENARIOS = Object.freeze(['actors-only', 'graybox-farm', 'crowded-placeholders']);
const LOOK_AT = CAMERA_TARGET;
const DEFAULT_YAW = CAMERA_YAW;
const DEFAULT_PITCH = CAMERA_PITCH;
const ORBIT_YAW_LIMIT = 0.4;
/** Independent idle clocks for up to ten actors (0.85 s stagger, same as v1 six). */
const IDLE_PHASES = Object.freeze([0, 0.85, 1.7, 2.55, 3.4, 4.25, 5.1, 5.95, 6.8, 7.65]);
const MAX_STRETCH = Object.freeze({ timeSec: 0.29 * 1.25, walkPhase: 0.29, walkBlend: 1 });
/** 60 fps × 60 s = 3600; headroom so a warmed record is not truncated. */
const STATS_CAP = 4500;
const STATS_SHORT_WARMUP_MS = 2500;
const STATS_RECORD_WARMUP_MS = 10_000;
const STATS_RECORD_DURATION_MS = 60_000;
const FENCE_X = 12;
const FENCE_Z = 10;

/** Local high-quality shadow frustum for ten pads. Does not touch HABITAT_SHADOW_CAMERA. */
const STRESS_TEN_SHADOW_CAMERA = Object.freeze({
  left: -14,
  right: 14,
  top: 14,
  bottom: -14,
  near: 0.1,
  far: 40,
});
/** Local frustum covering the 24×20 graybox. Live garden still uses habitat ±8. */
const STRESS_FARM_SHADOW_CAMERA = Object.freeze({
  left: -18,
  right: 18,
  top: 18,
  bottom: -18,
  near: 0.1,
  far: 50,
});

/** Inert crowded-food stand-ins. Not food, not claims, not THROW_FOOD. */
const DIAGNOSTIC_PLACEHOLDERS = Object.freeze([
  Object.freeze({ x: -9.5, z: 6.5, label: 'P1' }),
  Object.freeze({ x: -4, z: 6.5, label: 'P2' }),
  Object.freeze({ x: 0, z: 6.5, label: 'P3' }),
  Object.freeze({ x: 4, z: 6.5, label: 'P4' }),
  Object.freeze({ x: 9.5, z: 6.5, label: 'P5' }),
  Object.freeze({ x: -9.5, z: 0.5, label: 'P6' }),
  Object.freeze({ x: 9.5, z: 0.5, label: 'P7' }),
  Object.freeze({ x: -9.5, z: -6.5, label: 'P8' }),
  Object.freeze({ x: -4.5, z: -6.5, label: 'P9' }),
  Object.freeze({ x: 4.5, z: -6.5, label: 'P10' }),
  Object.freeze({ x: 9.5, z: -6.5, label: 'P11' }),
  Object.freeze({ x: 0, z: -0.5, label: 'P12' }),
]);

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

/**
 * @param {number} n
 * @returns {readonly { x: number, z: number }[]}
 */
function slotsForPopulation(n) {
  if (n === 6) return HOME_SLOTS;
  if (n === 1) return PHASE2_HOME_SLOTS.slice(0, 1);
  return PHASE2_HOME_SLOTS;
}

function slotsNameForPopulation(n) {
  if (n === 6) return 'v1 HOME_SLOTS (layout.mjs)';
  if (n === 1) return 'PHASE2_HOME_SLOTS[0] (stress copy)';
  return 'PHASE2_HOME_SLOTS (stress copy; layout.mjs unchanged)';
}

function minPairDistance(slots) {
  let min = Infinity;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const d = Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z);
      if (d < min) min = d;
    }
  }
  return min === Infinity ? NaN : min;
}

function parsePopulation(raw) {
  const n = Number(raw);
  return POPULATION_ALLOWED.includes(n) ? n : DEFAULT_POPULATION;
}

function parseScenario(raw) {
  return SCENARIOS.includes(raw) ? raw : 'actors-only';
}

function parseMotion(raw) {
  return raw === 'walk' || raw === 'mixed' ? raw : 'idle';
}

function parsePageParams() {
  const params = new URLSearchParams(location.search);
  const autotest = params.get('autotest');
  const sampleRaw = params.get('sample');
  const record60 = autotest === 'sample60' || sampleRaw === '60';
  const runAutotest = autotest === '1' || autotest === 'sample60';
  const requested = params.get('quality');
  return {
    population: parsePopulation(params.get('n')),
    qualityPreference: isQualityMode(requested) ? requested : 'auto',
    scenario: parseScenario(params.get('scenario')),
    motion: parseMotion(params.get('motion')),
    record60,
    runAutotest,
    pause: params.get('pause') === '1' || params.get('paused') === '1',
  };
}

function mixedModeForIndex(index, population) {
  if (population <= 1) return 'walk';
  return index < Math.ceil(population / 2) ? 'idle' : 'walk';
}

function motionForActor(index, motionMode, population) {
  if (motionMode === 'walk') return 'walk';
  if (motionMode === 'mixed') return mixedModeForIndex(index, population);
  return 'idle';
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

function applyLocalShadowFrustum(sun, population, scenario, appliedTier) {
  if (appliedTier !== 'high' || !sun || !sun.shadow || !sun.shadow.camera) return;
  const farm = scenario === 'graybox-farm' || scenario === 'crowded-placeholders';
  if (!farm && population !== 10) return;
  const cfg = farm ? STRESS_FARM_SHADOW_CAMERA : STRESS_TEN_SHADOW_CAMERA;
  const cam = sun.shadow.camera;
  cam.left = cfg.left;
  cam.right = cfg.right;
  cam.top = cfg.top;
  cam.bottom = cfg.bottom;
  cam.near = cfg.near;
  cam.far = cfg.far;
  if (typeof cam.updateProjectionMatrix === 'function') cam.updateProjectionMatrix();
}

function makeLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 32);
  ctx.fillStyle = '#3d534a';
  ctx.font = '20px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 16);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 0.55;
  sprite.userData.role = 'diagnostic-placeholder-label';
  return {
    sprite,
    dispose() {
      tex.dispose();
      mat.dispose();
    },
  };
}

function createGrayboxFence() {
  const group = new THREE.Group();
  group.name = 'p2-graybox-fence';
  const y = 0.8;
  const positions = new Float32Array([
    -FENCE_X, y, -FENCE_Z,
    FENCE_X, y, -FENCE_Z,
    FENCE_X, y, FENCE_Z,
    -FENCE_X, y, FENCE_Z,
    -FENCE_X, y, -FENCE_Z,
  ]);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x6d7f74 });
  const line = new THREE.Line(lineGeo, lineMat);
  line.userData.role = 'diagnostic-graybox';
  group.add(line);

  const postGeo = new THREE.BoxGeometry(0.16, 0.8, 0.16);
  const postMat = new THREE.MeshBasicMaterial({ color: 0x5c6e64 });
  const corners = [
    [-FENCE_X, -FENCE_Z],
    [FENCE_X, -FENCE_Z],
    [FENCE_X, FENCE_Z],
    [-FENCE_X, FENCE_Z],
  ];
  const posts = [];
  for (const [x, z] of corners) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0.4, z);
    post.userData.role = 'diagnostic-graybox';
    group.add(post);
    posts.push(post);
  }
  return {
    group,
    dispose() {
      lineGeo.dispose();
      lineMat.dispose();
      postGeo.dispose();
      postMat.dispose();
    },
  };
}

function createPlaceholderMarkers() {
  const group = new THREE.Group();
  group.name = 'p2-diagnostic-placeholders';
  const markerGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x9aa398 });
  /** @type {{ dispose: () => void }[]} */
  const labels = [];
  for (const spec of DIAGNOSTIC_PLACEHOLDERS) {
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(spec.x, 0.06, spec.z);
    marker.userData.role = 'diagnostic-placeholder';
    marker.userData.label = spec.label;
    group.add(marker);
    const label = makeLabelSprite(`${spec.label} placeholder`);
    label.sprite.position.set(spec.x, 0.55, spec.z);
    group.add(label.sprite);
    labels.push(label);
  }
  return {
    group,
    dispose() {
      markerGeo.dispose();
      markerMat.dispose();
      for (const label of labels) label.dispose();
    },
  };
}

let pageState = parsePageParams();
let session = null;

function writeUrlFromPageState() {
  const url = new URL(location.href);
  url.searchParams.set('n', String(pageState.population));
  url.searchParams.set('quality', pageState.qualityPreference);
  url.searchParams.set('scenario', pageState.scenario);
  if (pageState.motion !== 'idle') url.searchParams.set('motion', pageState.motion);
  else url.searchParams.delete('motion');
  if (pageState.record60) url.searchParams.set('sample', '60');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function syncPopulationButtons(n) {
  root.querySelectorAll('[data-n]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.n) === n));
  });
}

function syncScenarioButtons(scenario) {
  root.querySelectorAll('[data-scenario]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.scenario === scenario));
  });
}

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

function syncDocumentMeta() {
  document.documentElement.dataset.population = String(pageState.population);
  document.documentElement.dataset.scenario = pageState.scenario;
}

/**
 * @param {{
 *   population: number,
 *   qualityPreference: string,
 *   scenario: string,
 *   motion: string,
 *   sampleKind: 'short' | 'record60',
 * }} options
 */
function createSession(options) {
  const population = POPULATION_ALLOWED.includes(options.population)
    ? options.population
    : DEFAULT_POPULATION;
  const activeSlots = slotsForPopulation(population);
  const scenario = parseScenario(options.scenario);
  const slotLabel = slotsNameForPopulation(population);
  const pairMin = minPairDistance(activeSlots);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VFOV_DEG, 1, 0.05, 80);
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

  /** @type {{ group: THREE.Group, dispose: () => void }[]} */
  const extras = [];
  if (scenario === 'graybox-farm' || scenario === 'crowded-placeholders') {
    const fence = createGrayboxFence();
    scene.add(fence.group);
    extras.push(fence);
  }
  if (scenario === 'crowded-placeholders') {
    const markers = createPlaceholderMarkers();
    scene.add(markers.group);
    extras.push(markers);
  }

  let qualityPreference = isQualityMode(options.qualityPreference) ? options.qualityPreference : 'auto';
  let appliedTier = qualityPreference === 'low' ? 'low' : 'high';
  const governor = createAutoQualityGovernor();
  if (qualityPreference !== 'auto') governor.reset();

  let sampleKind = options.sampleKind === 'record60' ? 'record60' : 'short';
  let recordFrozen = false;

  function qualityState() {
    const result = applyQuality(renderer, camera, sun, appliedTier, {
      devicePixelRatio,
      shadowMapType: THREE.PCFSoftShadowMap,
    });
    applyLocalShadowFrustum(sun, population, scenario, appliedTier);
    return result;
  }

  qualityState();

  /** @type {ReturnType<typeof createSlimeActor>[]} */
  const actors = [];
  for (let i = 0; i < population; i++) {
    const slot = activeSlots[i];
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
  let mode = parseMotion(options.motion);
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

  function warmupMs() {
    return sampleKind === 'record60' ? STATS_RECORD_WARMUP_MS : STATS_SHORT_WARMUP_MS;
  }

  function resetSampleStats(nextKind) {
    if (nextKind === 'record60' || nextKind === 'short') sampleKind = nextKind;
    renderIntervals.length = 0;
    statsStartedAt = 0;
    lastRenderAt = 0;
    sampleDurationMs = 0;
    recordFrozen = false;
    if (sampleKind === 'record60') {
      document.documentElement.dataset.sampleRecord = 'collecting';
    }
  }

  function applyTier(nextTier, { resetGovernor } = {}) {
    appliedTier = nextTier === 'low' ? 'low' : 'high';
    qualityState();
    poseAcc = 0;
    renderAcc = 0;
    resetSampleStats(sampleKind);
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

  function sampleNoteLine(stats) {
    const warm = warmupMs();
    if (sampleKind === 'record60') {
      if (recordFrozen) {
        return `60s warmed record after ${warm}ms warmup, n=${stats.count} over ${formatMs(sampleDurationMs)}ms — not a desktop or phone pass unless the GPU line says so`;
      }
      if (!stats.count) {
        return `60s warmed record: waiting for ${warm}ms warmup`;
      }
      return `60s warmed record: collecting after ${warm}ms warmup, n=${stats.count} over ${formatMs(sampleDurationMs)}ms (need ≥${STATS_RECORD_DURATION_MS}ms)`;
    }
    if (stats.count) {
      return `short sample after ${warm}ms warmup, n=${stats.count} over ${formatMs(sampleDurationMs)}ms — not a 60s warmed record; not a mobile claim`;
    }
    return `frame interval: waiting for ${warm}ms warmup (short sample)`;
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
    const farmNote = scenario === 'actors-only'
      ? 'scenario: actors-only (no farm/food fakes)'
      : scenario === 'graybox-farm'
        ? 'scenario: graybox-farm (24×20 fence rectangle only; not gameplay)'
        : 'scenario: crowded-placeholders (fence + 12 inert labeled markers; not food/claims/THROW_FOOD)';
    diagEl.textContent = [
      `actors: ${actors.length} (requested ${population}; cap not lowered)`,
      `slots: ${slotLabel} · min pair distance ${Number.isFinite(pairMin) ? pairMin.toFixed(3) : 'n/a'}`,
      farmNote,
      `renderer.info.render.calls: ${info.calls}`,
      `renderer.info.render.triangles: ${info.triangles}`,
      `${sampleNoteLine(stats)}`,
      `median: ${formatMs(stats.median)} ms · p90: ${formatMs(stats.p90)} ms · p95: ${formatMs(stats.p95)} ms`,
      `viewport: ${cssW}×${cssH} css px · drawingBuffer DPR: ${renderer.getPixelRatio()} (devicePixelRatio ${devicePixelRatio}, cap via dprFor=${dprFor(appliedTier, devicePixelRatio)})`,
      qualityLine,
      `pose ${1 / posePeriodSec(appliedTier)} Hz · render ${1 / renderPeriodSec(appliedTier)} Hz · ${shadowDiagnosticsLine(appliedTier)}`,
      `comparison travel: ${travelOff ? 'OFF' : 'ON (unexpected)'}`,
      `userAgent: ${navigator.userAgent}`,
      `hardwareConcurrency: ${navigator.hardwareConcurrency ?? 'n/a'} · gpu vendor: ${gpu.vendor} · gpu renderer: ${gpu.renderer}`,
      'Do not treat SwiftShader or this VM as a desktop or phone performance pass.',
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
      activeSlots,
      SLOT_MARGIN,
      FRAME_PADDING,
    );
    placeCamera(camera, yaw, pitch, distance, LOOK_AT);
    setGameplayFog(scene.fog, distance);
    camera.far = Math.max(80, distance + 32, scene.fog.far + 4);
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

  function markRecordComplete(stats) {
    recordFrozen = true;
    document.documentElement.dataset.sampleRecord = 'complete';
    document.documentElement.dataset.sampleReport = JSON.stringify({
      population,
      scenario,
      sampleKind,
      warmupMs: warmupMs(),
      sampleDurationMs,
      sampleCount: stats.count,
      median: stats.median,
      p90: stats.p90,
      p95: stats.p95,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      qualityPreference,
      appliedTier,
      viewport: { w: stage.clientWidth, h: stage.clientHeight },
      dpr: renderer.getPixelRatio(),
      gpu,
      userAgent: navigator.userAgent,
    });
  }

  function present(now) {
    placeCamera(camera, yaw, pitch, distance, LOOK_AT);
    renderer.render(scene, camera);
    if (!statsStartedAt) statsStartedAt = now;
    const warm = warmupMs();
    if (now - statsStartedAt >= warm) {
      if (!recordFrozen && lastRenderAt > 0) {
        const interval = now - lastRenderAt;
        if (interval > 0 && interval < 10_000 && !document.hidden) {
          if (renderIntervals.length >= STATS_CAP) renderIntervals.shift();
          renderIntervals.push(interval);
          sampleDurationMs = now - statsStartedAt - warm;
          if (sampleKind === 'record60' && sampleDurationMs >= STATS_RECORD_DURATION_MS) {
            markRecordComplete(frameIntervalStats(renderIntervals));
          }
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
        for (let i = 0; i < actors.length; i++) {
          actors[i].update(step, {
            mode: motionForActor(i, mode, population),
            paused,
          });
        }
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
  syncPopulationButtons(population);
  syncScenarioButtons(scenario);
  syncDocumentMeta();
  if (sampleKind === 'record60') {
    document.documentElement.dataset.sampleRecord = 'collecting';
  }
  raf = requestAnimationFrame(animate);

  return {
    renderer,
    scene,
    camera,
    sun,
    floor,
    floorMat,
    extras,
    actors,
    bodies,
    observer,
    governor,
    gpu,
    activeSlots,
    population,
    scenario,
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
    get sampleKind() { return sampleKind; },
    get recordFrozen() { return recordFrozen; },
    setLive(nextLive, nextMode) {
      live = nextLive;
      if (nextMode) mode = parseMotion(nextMode) || nextMode;
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
    resetSampleStats,
    resetView() {
      yaw = DEFAULT_YAW;
      pitch = DEFAULT_PITCH;
      resize();
    },
    diagSnapshot() {
      const stats = frameIntervalStats(renderIntervals);
      return {
        actorCount: actors.length,
        population,
        scenario,
        slotsName: slotLabel,
        minPairDistance: pairMin,
        slotPositions: actors.map((a) => {
          const p = a.getPose();
          return { id: a.id, x: p.x, z: p.z };
        }),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        median: stats.median,
        p90: stats.p90,
        p95: stats.p95,
        sampleCount: stats.count,
        sampleDurationMs,
        sampleKind,
        warmupMs: warmupMs(),
        recordComplete: recordFrozen,
        viewport: { w: stage.clientWidth, h: stage.clientHeight },
        dpr: renderer.getPixelRatio(),
        qualityPreference,
        appliedTier,
        shadowNote: shadowDiagnosticsLine(appliedTier),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        gpu,
        comparisonTravel: actors.map((a) => a.getPose().comparisonTravelEnabled),
        selectedId,
        cameraFar: camera.far,
        fitDistance: distance,
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
  if (current.extras) {
    for (const extra of current.extras) {
      if (extra.group && extra.group.parent) extra.group.removeFromParent();
      extra.dispose();
    }
    current.extras.length = 0;
  }
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

function positionsMatchSlots(actors, slots) {
  if (actors.length !== slots.length) return false;
  for (let i = 0; i < actors.length; i++) {
    const p = actors[i].getPose();
    if (Math.abs(p.x - slots[i].x) > 1e-6 || Math.abs(p.z - slots[i].z) > 1e-6) return false;
  }
  return true;
}

function mountSession() {
  const sampleKind = pageState.record60 && !pageState.runAutotest ? 'record60' : 'short';
  return createSession({
    population: pageState.population,
    qualityPreference: pageState.qualityPreference,
    scenario: pageState.scenario,
    motion: pageState.motion,
    sampleKind,
  });
}

async function runPacketChecks() {
  const report = { ok: false, steps: [] };
  function step(name, ok, detail) {
    report.steps.push({ name, ok, detail });
  }
  const expectedN = pageState.population;
  try {
    if (!session || session.actors.length !== expectedN) {
      step('mount', false, `actors=${session ? session.actors.length : 0} expected=${expectedN}`);
      return report;
    }
    step('mount', true, `actors=${session.actors.length} n=${expectedN}`);
    const travelOff = session.actors.every((a) => a.getPose().comparisonTravelEnabled === false);
    step('travel-off', travelOff, travelOff ? 'all false' : 'someone still travelling');
    if (expectedN === 6) {
      const onV1 = positionsMatchSlots(session.actors, HOME_SLOTS);
      step('v1-home-slots', onV1, JSON.stringify(session.actors.map((a) => {
        const p = a.getPose();
        return { id: a.id, x: p.x, z: p.z };
      })));
    } else if (expectedN === 10) {
      const onP2 = positionsMatchSlots(session.actors, PHASE2_HOME_SLOTS);
      step('phase2-home-slots', onP2, JSON.stringify(session.diagSnapshot().slotPositions));
      const pair = minPairDistance(PHASE2_HOME_SLOTS);
      step('pair-distance', pair >= 3 - 1e-9, `min=${pair}`);
    }
    const remountLog = [];
    let remountTenOk = true;
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const before = countStageCanvases();
      root.querySelector('[data-dispose]').click();
      const afterDispose = countStageCanvases();
      const disposeOk = afterDispose === 0 && !session;
      root.querySelector('[data-remount]').click();
      await waitFrames(2);
      const afterRemount = countStageCanvases();
      const remountOk = !!(session && session.actors.length === expectedN && afterRemount === 1);
      remountLog.push({
        cycle,
        before,
        afterDispose,
        afterRemount,
        actors: session ? session.actors.length : 0,
      });
      if (!disposeOk || !remountOk) remountTenOk = false;
    }
    step('remount-10', remountTenOk, JSON.stringify(remountLog));
    if (!session) return report;
    if (session.actors.length >= 2) {
      const a0 = session.actors[0].getBodyPositionArray();
      const a1 = session.actors[1].getBodyPositionArray();
      let differ = false;
      if (a0 !== a1) {
        for (let i = 0; i < a0.length; i++) {
          if (a0[i] !== a1[i]) { differ = true; break; }
        }
      }
      step('independent-buffers', a0 !== a1 && differ, `sharedRef=${a0 === a1} differ=${differ}`);
    } else {
      step('independent-buffers', true, 'skipped (n=1)');
    }

    session.setLive(true, 'walk');
    await waitFrames(4);
    const walkAll = session.actors.every((a) => a.getPose().mode === 'walk');
    step('walk-all', walkAll, session.actors.map((a) => a.getPose().mode).join(','));
    session.setLive(true, 'mixed');
    await waitFrames(4);
    const mixedModes = session.actors.map((a) => a.getPose().mode);
    const mixedOk = expectedN <= 1
      ? mixedModes[0] === 'walk'
      : mixedModes.some((m) => m === 'walk') && mixedModes.some((m) => m === 'idle');
    step('mixed-phases', mixedOk, mixedModes.join(','));
    session.setLive(true, 'idle');
    await waitFrames(4);
    const idleAll = session.actors.every((a) => a.getPose().mode === 'idle');
    step('idle-all', idleAll, session.actors.map((a) => a.getPose().mode).join(','));

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
    while (performance.now() - waitStart < 20_000) {
      await waitFrames(2);
      if (session.diagSnapshot().sampleCount >= 30) break;
    }
    report.diag = session.diagSnapshot();
    if (pageState.record60) {
      session.setLive(true, 'idle');
      session.setPaused(false);
      session.resetSampleStats('record60');
      const recordStart = performance.now();
      const recordBudget = STATS_RECORD_WARMUP_MS + STATS_RECORD_DURATION_MS + 20_000;
      while (performance.now() - recordStart < recordBudget) {
        await waitFrames(2);
        const snap = session.diagSnapshot();
        if (snap.recordComplete) {
          report.sampleRecord = snap;
          break;
        }
      }
      if (!report.sampleRecord) report.sampleRecord = session.diagSnapshot();
    }
    report.ok = report.steps.every((s) => s.ok);
  } catch (error) {
    step('exception', false, error && error.message ? error.message : String(error));
  }
  return report;
}

try {
  session = mountSession();

  if (pageState.pause) {
    session.setPaused(true);
  }

  root.querySelectorAll('[data-n]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = parsePopulation(btn.dataset.n);
      pageState.population = n;
      writeUrlFromPageState();
      if (session) disposeSession(session, { removeCanvas: true });
      session = mountSession();
      disposeEl.textContent = `Population ${n} remounted; stage canvases ${countStageCanvases()}.`;
    });
  });

  root.querySelectorAll('[data-scenario]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pageState.scenario = parseScenario(btn.dataset.scenario);
      writeUrlFromPageState();
      if (session) disposeSession(session, { removeCanvas: true });
      session = mountSession();
      disposeEl.textContent = `Scenario ${pageState.scenario} remounted; stage canvases ${countStageCanvases()}.`;
    });
  });

  root.querySelectorAll('[data-motion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!session || !session.actors.length) return;
      pageState.motion = parseMotion(btn.dataset.motion);
      session.setLive(true, pageState.motion);
    });
  });

  pauseBtn.addEventListener('click', () => {
    if (!session) return;
    session.setPaused(!session.paused);
  });

  root.querySelectorAll('[data-quality]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!session) return;
      pageState.qualityPreference = btn.dataset.quality;
      session.setQualityPreference(btn.dataset.quality);
      writeUrlFromPageState();
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
      const n = session.actors.length;
      disposeSession(session, { removeCanvas: true });
      session = null;
      const after = countStageCanvases();
      const ok = after === 0;
      disposeEl.dataset.ok = String(ok);
      disposeEl.textContent = ok
        ? `Dispose: PASS — ${n} actors disposed; stage canvases ${before} → ${after}. Press Remount to restore.`
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
      session = mountSession();
      disposeEl.dataset.ok = 'true';
      disposeEl.textContent = `Remount: PASS — ${pageState.population} actors restored; stage canvases ${countStageCanvases()}.`;
    } catch (error) {
      disposeEl.dataset.ok = 'false';
      disposeEl.textContent = 'Remount: FAIL — ' + (error && error.message ? error.message : String(error));
      showError(error);
    }
  });

  window.__slimeStress = {
    get session() { return session; },
    HOME_SLOTS,
    PHASE2_HOME_SLOTS,
    get POPULATION() { return pageState.population; },
    DEFAULT_POPULATION,
    fitDistanceForSlots,
    slotsForPopulation,
    runPacketChecks,
    tierFor,
  };

  if (pageState.runAutotest) {
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
