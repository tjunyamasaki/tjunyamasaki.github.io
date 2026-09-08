/**
 * Gameplay habitat scene. Reconciles actors by resident id, fits the camera
 * to enabled pads, and owns picking / quality / context restore. Never writes
 * Glow, berries, or save keys.
 */

import * as THREE from '../../vendor/three/three.module.js';
import { getResidentCapacity } from '../core/selectors.mjs';
import { createHabitat } from './habitat.mjs';
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  CAMERA_PITCH,
  CAMERA_TARGET,
  CAMERA_YAW,
  DRAG_THRESHOLD_PX,
  ENTRY_POINT,
  fitDistanceForSlots,
  FLOOR_RADIUS,
  FOOD_POINT,
  FRAME_PADDING,
  HABITAT_RADIUS,
  HOME_SLOTS,
  placeCamera,
  setGameplayFog,
  SHRUB_POINT,
  SLOT_MARGIN,
  VFOV_DEG,
} from './layout.mjs';
import {
  createMotionWorld,
  idlePhaseOffsetSec,
  yawFromDirection,
} from './motion.mjs';
import {
  ARRIVAL_REVEAL_SEC,
  createPresentationPool,
  feedPresentationAt,
  planArrival,
  quadraticBezier,
  STILL_BERRY_SEC,
} from './arrivals.mjs';
import {
  applyQuality,
  createAutoQualityGovernor,
  posePeriodSec,
  renderPeriodSec,
} from './quality.mjs';
import { createSlimeActor } from './slime-actor.mjs';

/**
 * @typedef {import('../core/state.mjs').GameState} GameState
 * @typedef {import('../core/state.mjs').SlimeId} SlimeId
 * @typedef {import('../core/commands.mjs').GameEvent} GameEvent
 * @typedef {'auto' | 'high' | 'low'} Quality
 *
 * @typedef {object} SceneOptions
 * @property {boolean} reducedMotion
 * @property {boolean} animationsPaused
 * @property {Quality} quality
 * @property {boolean} [inspectionMode]
 *
 * @typedef {object} SceneCallbacks
 * @property {(id: SlimeId) => void} onSelect
 * @property {(message: string) => void} onError
 *
 * @typedef {object} SyncOptions
 * @property {boolean} [resetPositions]
 */

const LARGE_SIM_JUMP_MS = 5_000;
const CAMERA_DAMP = 4;

/**
 * @returns {{
 *   sync: (state: GameState, options?: SyncOptions) => void,
 *   play: (events: readonly GameEvent[]) => void,
 *   select: (slimeId: SlimeId | null) => void,
 *   setOptions: (options: SceneOptions) => void,
 *   setVisible: (visible: boolean) => void,
 *   resize: (widthCssPx: number, heightCssPx: number) => void,
 *   update: (renderNowMs: number, frameDeltaMs: number) => void,
 *   render: () => void,
 *   dispose: () => void,
 * }}
 */
function inertController() {
  return {
    sync() {},
    play() {},
    select() {},
    setOptions() {},
    setVisible() {},
    resize() {},
    update() {},
    render() {},
    dispose() {},
  };
}

/**
 * @param {HTMLElement} container
 * @param {SceneOptions} initialOptions
 * @param {SceneCallbacks} callbacks
 */
export function createScene(container, initialOptions, callbacks) {
  if (!container) {
    callbacks?.onError?.('Missing garden container.');
    return inertController();
  }

  let canvasProbe = null;
  try {
    canvasProbe = document.createElement('canvas');
    const gl = canvasProbe.getContext('webgl2');
    if (!gl) {
      callbacks?.onError?.('WebGL2 is unavailable, so the 3D garden cannot start.');
      return inertController();
    }
  } catch (error) {
    const text = error && error.message ? String(error.message) : String(error);
    callbacks?.onError?.(text);
    return inertController();
  } finally {
    canvasProbe = null;
  }

  /** @type {THREE.WebGLRenderer | null} */
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    const text = error && error.message ? String(error.message) : String(error);
    callbacks?.onError?.(text);
    return inertController();
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'pan-y';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.setAttribute('role', 'presentation');
  renderer.domElement.tabIndex = -1;
  container.appendChild(renderer.domElement);

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0xeaf0d6);
  threeScene.fog = new THREE.Fog(0xeaf0d6, 24, 52);

  const camera = new THREE.PerspectiveCamera(VFOV_DEG, 1, CAMERA_NEAR, CAMERA_FAR);

  const habitat = createHabitat(THREE, threeScene, {
    habitatRadius: HABITAT_RADIUS,
    floorRadius: FLOOR_RADIUS,
    homeSlots: HOME_SLOTS,
    entryPoint: ENTRY_POINT,
    foodPoint: FOOD_POINT,
    shrubPoint: SHRUB_POINT,
  });

  const motion = createMotionWorld();
  const fx = createPresentationPool(THREE, threeScene);
  const mouthWorld = new THREE.Vector3();
  const faceForward = new THREE.Vector3();
  /** @type {Map<string, ReturnType<typeof createSlimeActor>>} */
  const actors = new Map();
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  /** @type {SceneOptions} */
  let options = {
    reducedMotion: !!initialOptions.reducedMotion,
    animationsPaused: !!initialOptions.animationsPaused,
    quality: initialOptions.quality === 'low' || initialOptions.quality === 'high'
      ? initialOptions.quality
      : 'auto',
  };

  const governor = createAutoQualityGovernor();
  let appliedTier = options.quality === 'low' ? 'low' : 'high';
  let lastCapacity = -1;
  let lastShrubLevel = -1;
  /** @type {GameState | null} */
  let lastState = null;
  /** @type {number | null} */
  let lastSimTimeMs = null;
  /** @type {SlimeId | null} */
  let selectedId = null;
  let visible = true;
  let disposed = false;
  let contextLost = false;
  let restoreOnce = false;
  let needsPresent = true;
  let poseAcc = 0;
  let renderAcc = 0;
  let displayDistance = 8;
  let targetDistance = 8;
  let lastCssW = 0;
  let lastCssH = 0;
  /** @type {{ slimeId: string, elapsed: number, still: boolean, startX: number, startY: number, startZ: number, controlX: number, controlY: number, controlZ: number } | null} */
  let feedFx = null;
  /** @type {{ slimeId: string, style: 'walk' | 'reveal', elapsed: number, duration: number } | null} */
  let arrivalFx = null;

  /** @type {number | null} */
  let pointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerMoved = false;

  function qualityModeForApply() {
    if (options.quality === 'auto') return appliedTier;
    return options.quality;
  }

  function applyTier(nextTier) {
    appliedTier = nextTier === 'low' ? 'low' : 'high';
    applyQuality(renderer, camera, habitat.sun, appliedTier, {
      devicePixelRatio: globalThis.devicePixelRatio,
      shadowMapType: THREE.PCFSoftShadowMap,
    });
    poseAcc = 0;
    renderAcc = 0;
    needsPresent = true;
    resizeToContainer();
  }

  applyTier(appliedTier);

  function poseFrozen() {
    return options.reducedMotion || options.animationsPaused;
  }

  function bodies() {
    return [...actors.values()].map((actor) => actor.body);
  }

  function placeActor(actor, resident) {
    actor.setComparisonTravelEnabled(false);
    actor.setWorldPose({ x: resident.x, z: resident.z, yaw: resident.yaw });
    actor.setSelected(actor.id === selectedId);
  }

  /**
   * @param {string} id
   * @param {ResidentLike} resident
   * @typedef {{ x: number, z: number, yaw: number, mode: string }} ResidentLike
   */
  function spawnActor(id, resident) {
    const actor = createSlimeActor(THREE, {
      parent: threeScene,
      id,
      x: resident.x,
      z: resident.z,
      yaw: resident.yaw,
      timeSec: idlePhaseOffsetSec(id),
      comparisonTravelEnabled: false,
      selected: id === selectedId,
    });
    actor.setComparisonTravelEnabled(false);
    actor.setPose({
      timeSec: idlePhaseOffsetSec(id),
      walkBlend: 0,
      paused: poseFrozen(),
    });
    placeActor(actor, resident);
    actors.set(id, actor);
  }

  function disposeActors() {
    for (const actor of actors.values()) actor.dispose();
    actors.clear();
  }

  function cameraXZ() {
    return { x: camera.position.x, z: camera.position.z };
  }

  function faceCameraYaw(x, z) {
    const cam = cameraXZ();
    return yawFromDirection(cam.x - x, cam.z - z);
  }

  function resetActorScale(id) {
    const actor = actors.get(id);
    if (actor) actor.worldRoot.scale.set(1, 1, 1);
  }

  function clearPresentation() {
    if (feedFx) {
      const feeding = motion.residents.get(feedFx.slimeId);
      if (feeding && feeding.mode === 'feeding') motion.setMode(feedFx.slimeId, 'idle');
    }
    if (arrivalFx) {
      resetActorScale(arrivalFx.slimeId);
      motion.setWanderSuspended(false);
    }
    feedFx = null;
    arrivalFx = null;
    fx.hideAll();
  }

  /**
   * @param {string} slimeId
   * @param {{ still: boolean }} how
   */
  function startFeed(slimeId, how) {
    const actor = actors.get(slimeId);
    const resident = motion.residents.get(slimeId);
    if (!actor || !resident) return;
    actor.getMouthWorldPosition(mouthWorld);
    actor.getFaceForward(faceForward);
    const startX = mouthWorld.x + faceForward.x * 0.38;
    const startY = mouthWorld.y + 0.1;
    const startZ = mouthWorld.z + faceForward.z * 0.38;
    feedFx = {
      slimeId,
      elapsed: 0,
      still: how.still,
      startX,
      startY,
      startZ,
      controlX: (startX + mouthWorld.x) * 0.5,
      controlY: Math.max(startY, mouthWorld.y) + 0.28,
      controlZ: (startZ + mouthWorld.z) * 0.5,
    };
    motion.setMode(slimeId, 'feeding');
    needsPresent = true;
  }

  /**
   * @param {string} slimeId
   * @param {number} homeSlot
   */
  function startArrival(slimeId, homeSlot) {
    const actor = actors.get(slimeId);
    const resident = motion.residents.get(slimeId);
    if (!actor || !resident) return;
    const frozen = poseFrozen();
    const plan = planArrival({
      home: { x: resident.homeX, z: resident.homeZ },
      occupants: motion.occupantsExcept(slimeId),
      reducedMotion: options.reducedMotion,
      animationsPaused: options.animationsPaused,
    });
    motion.setWanderSuspended(true);
    if (motion.walkerId && motion.walkerId !== slimeId) {
      const other = motion.residents.get(motion.walkerId);
      if (other) motion.interruptWalk(motion.walkerId, other.yaw);
    }
    void homeSlot;
    if (plan.style === 'walk' && !frozen) {
      const yaw = yawFromDirection(plan.toX - plan.fromX, plan.toZ - plan.fromZ);
      motion.placeAt(slimeId, plan.fromX, plan.fromZ, yaw);
      placeActor(actor, motion.residents.get(slimeId));
      motion.beginDirectedWalk(slimeId, plan.toX, plan.toZ, 'arriving');
      arrivalFx = {
        slimeId,
        style: 'walk',
        elapsed: 0,
        duration: plan.durationSec,
      };
    } else {
      motion.placeAt(slimeId, resident.homeX, resident.homeZ, faceCameraYaw(resident.homeX, resident.homeZ));
      motion.setMode(slimeId, 'idle');
      placeActor(actor, motion.residents.get(slimeId));
      arrivalFx = {
        slimeId,
        style: 'reveal',
        elapsed: 0,
        duration: frozen ? 0 : ARRIVAL_REVEAL_SEC,
      };
      if (frozen || arrivalFx.duration === 0) {
        motion.setWanderSuspended(false);
        arrivalFx = null;
      }
    }
    needsPresent = true;
  }

  function retargetCamera(capacity, cssW, cssH) {
    const aspect = Math.max(1e-6, cssW / Math.max(1, cssH));
    camera.aspect = aspect;
    const slots = HOME_SLOTS.slice(0, Math.max(1, Math.min(HOME_SLOTS.length, capacity)));
    targetDistance = fitDistanceForSlots(
      aspect,
      VFOV_DEG,
      CAMERA_YAW,
      CAMERA_PITCH,
      CAMERA_TARGET,
      slots,
      SLOT_MARGIN,
      FRAME_PADDING,
    );
    if (options.reducedMotion || displayDistance <= 0.5) displayDistance = targetDistance;
    applyCamera(displayDistance);
  }

  /**
   * @param {number} distance
   */
  function applyCamera(distance) {
    placeCamera(camera, CAMERA_YAW, CAMERA_PITCH, distance, CAMERA_TARGET);
    setGameplayFog(threeScene.fog, distance);
    camera.near = CAMERA_NEAR;
    camera.far = Math.max(CAMERA_FAR, distance + 24, threeScene.fog.far + 4);
    camera.updateProjectionMatrix();
  }

  /**
   * @param {number} [widthCssPx]
   * @param {number} [heightCssPx]
   */
  function resizeToContainer(widthCssPx, heightCssPx) {
    if (!renderer || disposed) return;
    const w = Math.max(1, Math.floor(widthCssPx ?? container.clientWidth));
    const h = Math.max(1, Math.floor(heightCssPx ?? container.clientHeight));
    lastCssW = w;
    lastCssH = h;
    renderer.setSize(w, h, false);
    const capacity = lastCapacity > 0 ? lastCapacity : 2;
    retargetCamera(capacity, w, h);
    needsPresent = true;
  }

  /**
   * @param {GameState} state
   * @param {SyncOptions} [syncOptions]
   */
  function sync(state, syncOptions = {}) {
    if (disposed || !state) return;
    lastState = state;
    const capacity = getResidentCapacity(state);
    const shrubLevel = state.upgrades?.shrub ?? 0;
    if (capacity !== lastCapacity) {
      lastCapacity = capacity;
      habitat.setCapacity(capacity);
      resizeToContainer(lastCssW || undefined, lastCssH || undefined);
    }
    if (shrubLevel !== lastShrubLevel) {
      lastShrubLevel = shrubLevel;
      habitat.setShrubLevel(shrubLevel);
    }

    const simTime = state.simTimeMs;
    const jumped =
      lastSimTimeMs != null && Math.abs(simTime - lastSimTimeMs) > LARGE_SIM_JUMP_MS;
    const resetPositions = !!syncOptions.resetPositions || jumped;
    lastSimTimeMs = simTime;

    motion.syncRoster(state.slimes, { resetPositions });

    const living = new Set(state.slimes.map((slime) => slime.id));
    for (const [id, actor] of actors) {
      if (living.has(id)) continue;
      actor.dispose();
      actors.delete(id);
    }
    for (const slime of state.slimes) {
      const resident = motion.residents.get(slime.id);
      if (!resident) continue;
      let actor = actors.get(slime.id);
      if (!actor) {
        spawnActor(slime.id, resident);
        continue;
      }
      if (resetPositions) {
        actor.setPose({
          walkBlend: 0,
          paused: poseFrozen(),
        });
        placeActor(actor, resident);
      }
    }
    if (resetPositions) clearPresentation();
    needsPresent = true;
  }

  /**
   * @param {readonly GameEvent[]} events
   */
  function play(events) {
    if (disposed || !events) return;
    if (!visible) return;
    for (const event of events) {
      if (event.type === 'FED' && event.slimeId) {
        const resident = motion.residents.get(event.slimeId);
        const yaw = resident ? faceCameraYaw(resident.x, resident.z) : 0;
        motion.interruptWalk(event.slimeId, yaw);
        if (arrivalFx && arrivalFx.slimeId === event.slimeId) {
          resetActorScale(event.slimeId);
          arrivalFx = null;
          motion.setWanderSuspended(false);
        }
        const actor = actors.get(event.slimeId);
        if (actor && resident) {
          const next = motion.residents.get(event.slimeId);
          if (next) placeActor(actor, next);
        }
        startFeed(event.slimeId, { still: poseFrozen() });
      }
      if (event.type === 'COMPANION_ADDED' && event.slimeId) {
        startArrival(event.slimeId, event.homeSlot);
      }
    }
    needsPresent = true;
  }

  /**
   * @param {SlimeId | null} slimeId
   */
  function select(slimeId) {
    selectedId = slimeId;
    for (const actor of actors.values()) actor.setSelected(actor.id === slimeId);
    needsPresent = true;
  }

  /**
   * @param {SceneOptions} next
   */
  function setOptions(next) {
    const prevReduced = options.reducedMotion;
    const prevPaused = options.animationsPaused;
    const prevQuality = options.quality;
    options = {
      reducedMotion: !!next.reducedMotion,
      animationsPaused: !!next.animationsPaused,
      quality: next.quality === 'low' || next.quality === 'high' || next.quality === 'auto'
        ? next.quality
        : options.quality,
    };
    if (options.quality !== prevQuality) {
      if (options.quality === 'auto') {
        governor.reset();
        applyTier('high');
      } else {
        governor.reset();
        applyTier(options.quality);
      }
    }
    if (
      options.reducedMotion !== prevReduced ||
      options.animationsPaused !== prevPaused
    ) {
      if (options.reducedMotion || options.animationsPaused) {
        motion.restAll();
        clearPresentation();
        for (const [id, actor] of actors) {
          const resident = motion.residents.get(id);
          if (!resident) continue;
          actor.setPose({ walkBlend: 0, paused: true });
          actor.worldRoot.scale.set(1, 1, 1);
          placeActor(actor, resident);
        }
      }
      needsPresent = true;
    }
  }

  /**
   * @param {boolean} nextVisible
   */
  function setVisible(nextVisible) {
    visible = !!nextVisible;
    if (!visible) clearPresentation();
    if (visible) needsPresent = true;
  }

  /**
   * @param {number} widthCssPx
   * @param {number} heightCssPx
   */
  function resize(widthCssPx, heightCssPx) {
    resizeToContainer(widthCssPx, heightCssPx);
  }

  function updateActors(dt) {
    const frozen = poseFrozen();
    if (!frozen) {
      motion.step(dt, {
        cameraX: camera.position.x,
        cameraZ: camera.position.z,
        reducedMotion: options.reducedMotion,
        animationsPaused: options.animationsPaused,
      });
    }
    for (const [id, actor] of actors) {
      const resident = motion.residents.get(id);
      if (!resident) continue;
      actor.setWorldPose({ x: resident.x, z: resident.z, yaw: resident.yaw });
      const walking = resident.mode === 'walking' || resident.mode === 'arriving';
      actor.update(dt, {
        mode: walking ? 'walk' : 'idle',
        paused: frozen,
      });
    }
    tickPresentation(dt);
  }

  /**
   * @param {number} dt
   */
  function tickPresentation(dt) {
    if (feedFx) {
      const actor = actors.get(feedFx.slimeId);
      if (!actor) {
        fx.hideAll();
        feedFx = null;
      } else {
        actor.getMouthWorldPosition(mouthWorld);
        feedFx.elapsed += dt;
        if (feedFx.still) {
          fx.placeBerry({ x: mouthWorld.x, y: mouthWorld.y, z: mouthWorld.z }, 0.1);
          fx.placeParticles(mouthWorld, 0, feedFx.slimeId);
          if (feedFx.elapsed >= STILL_BERRY_SEC) {
            motion.setMode(feedFx.slimeId, 'idle');
            fx.hideAll();
            feedFx = null;
          }
        } else {
          const phase = feedPresentationAt(feedFx.elapsed);
          if (phase.berryVisible) {
            const pos = quadraticBezier(
              feedFx.startX,
              feedFx.startY,
              feedFx.startZ,
              feedFx.controlX,
              feedFx.controlY,
              feedFx.controlZ,
              mouthWorld.x,
              mouthWorld.y,
              mouthWorld.z,
              phase.berryT,
            );
            fx.placeBerry(pos, phase.berryScale);
          } else {
            fx.placeBerry(mouthWorld, 0);
          }
          fx.placeParticles(mouthWorld, phase.particleT, feedFx.slimeId);
          actor.setFeedSquash(phase.squash);
          if (phase.done) {
            motion.setMode(feedFx.slimeId, 'idle');
            fx.hideAll();
            feedFx = null;
          }
        }
      }
    }

    if (arrivalFx) {
      const actor = actors.get(arrivalFx.slimeId);
      arrivalFx.elapsed += dt;
      if (!actor) {
        motion.setWanderSuspended(false);
        arrivalFx = null;
      } else if (arrivalFx.style === 'walk') {
        const walking = motion.residents.get(arrivalFx.slimeId);
        const done =
          arrivalFx.elapsed >= arrivalFx.duration ||
          !walking ||
          walking.mode !== 'arriving';
        if (done) {
          if (walking) {
            motion.placeAt(
              arrivalFx.slimeId,
              walking.homeX,
              walking.homeZ,
              walking.yaw,
            );
            motion.setMode(arrivalFx.slimeId, 'idle');
            placeActor(actor, motion.residents.get(arrivalFx.slimeId));
          }
          motion.setWanderSuspended(false);
          arrivalFx = null;
        }
      } else {
        const u = arrivalFx.duration <= 0 ? 1 : Math.min(1, arrivalFx.elapsed / arrivalFx.duration);
        const s = 0.82 + 0.18 * u;
        actor.worldRoot.scale.set(s, s, s);
        if (u >= 1) {
          actor.worldRoot.scale.set(1, 1, 1);
          motion.setWanderSuspended(false);
          arrivalFx = null;
        }
      }
    }
    if (feedFx || arrivalFx) needsPresent = true;
  }

  /**
   * @param {number} renderNowMs
   * @param {number} frameDeltaMs
   */
  function update(renderNowMs, frameDeltaMs) {
    if (disposed || contextLost || !visible) return;
    const dt = Math.min(0.05, Math.max(0, frameDeltaMs / 1000));

    if (options.quality === 'auto' && appliedTier === 'high') {
      const next = governor.observe(renderNowMs, frameDeltaMs);
      if (next === 'low') applyTier('low');
    }

    if (!options.reducedMotion && Math.abs(displayDistance - targetDistance) > 0.02) {
      const k = 1 - Math.exp(-CAMERA_DAMP * dt);
      displayDistance += (targetDistance - displayDistance) * k;
      applyCamera(displayDistance);
    } else if (Math.abs(displayDistance - targetDistance) <= 0.02) {
      displayDistance = targetDistance;
    }

    poseAcc += dt;
    const posePeriod = posePeriodSec(appliedTier);
    const poseSteps = posePeriod > 0 ? Math.floor(poseAcc / posePeriod) : 1;
    if (poseSteps > 0) {
      const step = posePeriod > 0 ? posePeriod : dt;
      for (let i = 0; i < poseSteps; i++) updateActors(step);
      poseAcc -= poseSteps * (posePeriod > 0 ? posePeriod : poseAcc);
    } else if (needsPresent && dt === 0) {
      updateActors(0);
    }

    renderAcc += dt;
  }

  function render() {
    if (disposed || contextLost || !visible || !renderer) return;
    const period = renderPeriodSec(appliedTier);
    if (!needsPresent && renderAcc < period) return;
    renderAcc = 0;
    needsPresent = false;
    renderer.render(threeScene, camera);
  }

  function pickFromClient(clientX, clientY) {
    if (!actors.size || !renderer) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(bodies(), false);
    const hit = hits[0];
    if (!hit || hit.object.userData.role !== 'slime-body') return null;
    const id = hit.object.userData.slimeId;
    return typeof id === 'string' && id ? id : null;
  }

  function onPointerDown(event) {
    if (event.isPrimary === false) return;
    if (event.button != null && event.button !== 0) return;
    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerMoved = false;
  }

  function onPointerMove(event) {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const total = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
    if (total > DRAG_THRESHOLD_PX) pointerMoved = true;
  }

  function onPointerUp(event) {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const wasClick = !pointerMoved;
    pointerId = null;
    if (!wasClick) return;
    const id = pickFromClient(event.clientX, event.clientY);
    if (id) callbacks.onSelect(/** @type {SlimeId} */ (id));
  }

  function onPointerCancel(event) {
    if (pointerId === null || event.pointerId !== pointerId) return;
    pointerId = null;
    pointerMoved = true;
  }

  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    restoreOnce = false;
  }

  function onContextRestored() {
    if (disposed || restoreOnce) return;
    restoreOnce = true;
    contextLost = false;
    applyTier(appliedTier);
    if (lastState) sync(lastState, { resetPositions: true });
    if (selectedId) select(selectedId);
    resizeToContainer();
    needsPresent = true;
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const box = entry.contentRect;
    resizeToContainer(box.width, box.height);
  });
  observer.observe(container);
  resizeToContainer();

  function dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('webglcontextlost', onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
    disposeActors();
    motion.dispose();
    fx.dispose();
    habitat.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
      renderer = null;
    }
    lastState = null;
  }

  return {
    sync,
    play,
    select,
    setOptions,
    setVisible,
    resize,
    update,
    render,
    dispose,
  };
}
