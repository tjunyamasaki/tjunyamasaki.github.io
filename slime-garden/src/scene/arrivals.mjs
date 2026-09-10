/**
 * Feeding and companion-arrival presentation. Cosmetic only: never writes Glow,
 * berries, or save data, and never dispatches economic commands.
 *
 * v1 (`feedPresentationAt`, `planArrival`, `createPresentationPool`) remains
 * for the live circular garden. P2-12 eating is 800 ms and world-driven; the
 * 1.1 s `FEED_DURATION_SEC` helper is unused on the farm path.
 *
 * v2 (`arrivalVisualPlan`, `createWorldFxPool`) consumes core snapshots and
 * does not call `planRoute`.
 */

import { PET_FEEDBACK_COOLDOWN_MS } from '../core/balance.mjs';
import { WALK_CYCLE_SEC } from './slime-pose.mjs';
import {
  ENTRY_POINT,
  GAIT_UNITS_PER_CYCLE,
  MIN_WANDER_DISTANCE,
} from './layout.mjs';
import {
  gaitCycleCount,
  hashSlimeId,
  segmentClearsOccupants,
} from './motion.mjs';

export const FEED_DURATION_SEC = 1.1;
export const BERRY_TRAVEL_END_SEC = 0.35;
export const BERRY_SHRINK_END_SEC = 0.65;
export const STILL_BERRY_SEC = 0.7;
export const ARRIVAL_STYLE_ID = 'visitor-v1';
export const ARRIVAL_TARGET_SEC = 2.5;
export const ARRIVAL_WALK_MAX_SEC = 5;
export const ARRIVAL_REVEAL_SEC = 0.7;
export const PARTICLE_COUNT = 8;

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} az
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @param {number} t
 * @returns {{ x: number, y: number, z: number }}
 */
export function quadraticBezier(ax, ay, az, cx, cy, cz, bx, by, bz, t) {
  const u = 1 - t;
  return {
    x: u * u * ax + 2 * u * t * cx + t * t * bx,
    y: u * u * ay + 2 * u * t * cy + t * t * by,
    z: u * u * az + 2 * u * t * cz + t * t * bz,
  };
}

/**
 * @param {number} elapsedSec
 * @returns {{
 *   done: boolean,
 *   berryVisible: boolean,
 *   berryT: number,
 *   berryScale: number,
 *   squash: number,
 *   particleT: number,
 * }}
 */
export function feedPresentationAt(elapsedSec) {
  const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;
  if (t >= FEED_DURATION_SEC) {
    return {
      done: true,
      berryVisible: false,
      berryT: 1,
      berryScale: 0,
      squash: 0,
      particleT: 1,
    };
  }
  if (t < BERRY_TRAVEL_END_SEC) {
    return {
      done: false,
      berryVisible: true,
      berryT: t / BERRY_TRAVEL_END_SEC,
      berryScale: 0.11,
      squash: 0,
      particleT: 0,
    };
  }
  if (t < BERRY_SHRINK_END_SEC) {
    const u = (t - BERRY_TRAVEL_END_SEC) / (BERRY_SHRINK_END_SEC - BERRY_TRAVEL_END_SEC);
    return {
      done: false,
      berryVisible: true,
      berryT: 1,
      berryScale: 0.11 * (1 - u),
      squash: Math.sin(Math.PI * u),
      particleT: 0,
    };
  }
  const u = (t - BERRY_SHRINK_END_SEC) / (FEED_DURATION_SEC - BERRY_SHRINK_END_SEC);
  return {
    done: false,
    berryVisible: false,
    berryT: 1,
    berryScale: 0,
    squash: Math.max(0, 1 - u * 3) * 0.2,
    particleT: u,
  };
}

/**
 * How far a gait-matched walk may cover without exceeding `maxWalkSec`.
 * @param {number} [maxWalkSec]
 * @returns {number}
 */
export function maxGaitDistance(maxWalkSec = ARRIVAL_WALK_MAX_SEC) {
  const cycles = Math.max(1, Math.floor(maxWalkSec / WALK_CYCLE_SEC));
  return cycles * GAIT_UNITS_PER_CYCLE;
}

/**
 * @typedef {object} ArrivalPlan
 * @property {'walk' | 'reveal'} style
 * @property {string} reason
 * @property {number} fromX
 * @property {number} fromZ
 * @property {number} toX
 * @property {number} toZ
 * @property {number} cycles
 * @property {number} durationSec
 */

/**
 * Visitor-v1 approach. Occupants must omit the arriving resident.
 *
 * @param {{
 *   home: { x: number, z: number },
 *   occupants: readonly { x: number, z: number }[],
 *   entry?: { x: number, z: number },
 *   reducedMotion?: boolean,
 *   animationsPaused?: boolean,
 *   maxWalkSec?: number,
 * }} args
 * @returns {ArrivalPlan}
 */
export function planArrival(args) {
  const entry = args.entry ?? ENTRY_POINT;
  const home = args.home;
  const maxWalkSec = args.maxWalkSec ?? ARRIVAL_WALK_MAX_SEC;
  const reveal = (reason) => ({
    style: 'reveal',
    reason,
    fromX: home.x,
    fromZ: home.z,
    toX: home.x,
    toZ: home.z,
    cycles: 0,
    durationSec: args.reducedMotion || args.animationsPaused ? 0 : ARRIVAL_REVEAL_SEC,
  });

  if (args.reducedMotion || args.animationsPaused) return reveal('reduced-motion');

  const fullDx = home.x - entry.x;
  const fullDz = home.z - entry.z;
  const fullDist = Math.hypot(fullDx, fullDz);
  const budget = maxGaitDistance(maxWalkSec);
  let fromX = entry.x;
  let fromZ = entry.z;
  if (fullDist > budget && fullDist > 1e-6) {
    const u = budget / fullDist;
    fromX = home.x - fullDx * u;
    fromZ = home.z - fullDz * u;
  }
  const walkDist = Math.hypot(home.x - fromX, home.z - fromZ);
  if (walkDist < MIN_WANDER_DISTANCE) return reveal('too-short');

  const cycles = gaitCycleCount(walkDist);
  const durationSec = cycles * WALK_CYCLE_SEC;
  if (durationSec > maxWalkSec + 1e-6) return reveal('too-long');

  if (!segmentClearsOccupants(fromX, fromZ, home.x, home.z, args.occupants)) {
    return reveal('blocked');
  }

  return {
    style: 'walk',
    reason: 'clear',
    fromX,
    fromZ,
    toX: home.x,
    toZ: home.z,
    cycles,
    durationSec,
  };
}

/**
 * Stable particle offset in actor-ish space. No Math.random.
 * @param {string} slimeId
 * @param {number} index
 * @returns {{ x: number, y: number, z: number }}
 */
export function particleOffset(slimeId, index) {
  const h = hashSlimeId(`${slimeId}:${index}`);
  const a = (h % 360) * (Math.PI / 180);
  const r = 0.08 + ((h >>> 8) % 100) / 400;
  return {
    x: Math.cos(a) * r,
    y: 0.04 * (index % 3),
    z: Math.sin(a) * r,
  };
}

/**
 * @param {import('../../vendor/three/three.module.js').Object3D} object
 */
function skipRaycastTree(object) {
  object.traverse((node) => {
    if (node.isMesh) node.raycast = function skipRaycastImpl() {};
  });
}

/**
 * One pooled berry and eight particles. Scene owns the update loop.
 *
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @param {import('../../vendor/three/three.module.js').Object3D} parent
 */
export function createPresentationPool(THREE, parent) {
  const group = new THREE.Group();
  group.name = 'presentation-fx';
  parent.add(group);

  const berryGeom = new THREE.SphereGeometry(1, 12, 10);
  const berryMat = new THREE.MeshStandardMaterial({
    color: 0xd45b6a,
    roughness: 0.72,
    metalness: 0.05,
  });
  const berry = new THREE.Mesh(berryGeom, berryMat);
  berry.visible = false;
  berry.castShadow = false;
  group.add(berry);

  const particleGeom = new THREE.SphereGeometry(1, 8, 6);
  const particleMat = new THREE.MeshBasicMaterial({
    color: 0xf4e2b0,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const puff = new THREE.Mesh(particleGeom, particleMat);
    puff.visible = false;
    particles.push(puff);
    group.add(puff);
  }
  skipRaycastTree(group);

  function hideAll() {
    berry.visible = false;
    for (let i = 0; i < particles.length; i++) particles[i].visible = false;
  }

  /**
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} scale
   */
  function placeBerry(position, scale) {
    if (scale <= 0.001) {
      berry.visible = false;
      return;
    }
    berry.visible = true;
    berry.position.set(position.x, position.y, position.z);
    berry.scale.setScalar(scale);
  }

  /**
   * @param {{ x: number, y: number, z: number }} mouth
   * @param {number} particleT
   * @param {string} slimeId
   */
  function placeParticles(mouth, particleT, slimeId) {
    if (particleT <= 0 || particleT >= 1) {
      for (let i = 0; i < particles.length; i++) particles[i].visible = false;
      return;
    }
    const fade = 1 - particleT;
    particleMat.opacity = 0.18 + fade * 0.4;
    for (let i = 0; i < particles.length; i++) {
      const off = particleOffset(slimeId, i);
      const puff = particles[i];
      puff.visible = true;
      puff.position.set(
        mouth.x + off.x,
        mouth.y + off.y + particleT * 0.42,
        mouth.z + off.z,
      );
      puff.scale.setScalar(0.028 * (0.7 + fade));
    }
  }

  function dispose() {
    hideAll();
    group.removeFromParent();
    berryGeom.dispose();
    berryMat.dispose();
    particleGeom.dispose();
    particleMat.dispose();
    particles.length = 0;
  }

  return {
    group,
    hideAll,
    placeBerry,
    placeParticles,
    dispose,
  };
}

/** P2-12 world path: at most ten brief reactions and 40 celebration particles. */
export const MAX_BRIEF_REACTIONS = 10;
export const MAX_CELEBRATION_PARTICLES = 40;
export const PARTICLES_PER_REACTION = 4;
export const FEED_CUE_MIN_INTERVAL_MS = 150;

/**
 * Whether to capture throw origins, enqueue particles, or freeze travel.
 * Hidden callers must not enqueue. Pause skips new FX; reduced motion skips
 * arcs / particles / squash bursts.
 *
 * @param {{
 *   visible?: boolean,
 *   reducedMotion?: boolean,
 *   animationsPaused?: boolean,
 * }} [options]
 */
export function presentationGate(options = {}) {
  const visible = options.visible !== false;
  const reducedMotion = !!options.reducedMotion;
  const animationsPaused = !!options.animationsPaused;
  return {
    visible,
    reducedMotion,
    animationsPaused,
    captureThrowOrigin: visible && !reducedMotion && !animationsPaused,
    enqueueReaction: visible && !animationsPaused,
    animateArcs: visible && !reducedMotion && !animationsPaused,
    animateParticles: visible && !reducedMotion && !animationsPaused,
    animateSquash: visible && !reducedMotion && !animationsPaused,
    followTravel: !reducedMotion && !animationsPaused,
  };
}

/**
 * Consume a core resident snapshot. Never plans a gate walk.
 *
 * @param {import('../world/state.mjs').WorldResident | null | undefined} resident
 * @returns {{ style: 'follow-route' | 'still-greeting' | 'none' }}
 */
export function arrivalVisualPlan(resident) {
  if (!resident) return { style: 'none' };
  const route = resident.route;
  if (
    resident.activity === 'arriving' &&
    route &&
    Array.isArray(route.points) &&
    route.points.length >= 2
  ) {
    return { style: 'follow-route' };
  }
  return { style: 'still-greeting' };
}

/**
 * Cosmetic pet plan. Reads GameState only to confirm the id exists.
 * Never writes Glow, berries, foods, or routes.
 *
 * @param {{
 *   state?: import('../core/state.mjs').GameState | null,
 *   slimeId?: string | null,
 *   nowMs?: number,
 *   lastPetAtMs?: number,
 *   visible?: boolean,
 *   reducedMotion?: boolean,
 *   animationsPaused?: boolean,
 *   cooldownMs?: number,
 * }} args
 */
export function planPetReaction(args) {
  const visible = args.visible !== false;
  const slimeId = args.slimeId;
  if (!visible) {
    return { ok: false, reason: 'hidden', squash: 0, particles: false, playSound: false };
  }
  if (typeof slimeId !== 'string' || !slimeId) {
    return { ok: false, reason: 'none', squash: 0, particles: false, playSound: false };
  }
  const state = args.state;
  if (state) {
    const inSlimes = Array.isArray(state.slimes)
      ? state.slimes.some((slime) => slime.id === slimeId)
      : false;
    const inWorld = Array.isArray(state.world?.residents)
      ? state.world.residents.some((resident) => resident.id === slimeId)
      : false;
    if (!inSlimes && !inWorld) {
      return { ok: false, reason: 'missing', squash: 0, particles: false, playSound: false };
    }
  }
  const cooldown = args.cooldownMs ?? PET_FEEDBACK_COOLDOWN_MS;
  const now = Number(args.nowMs);
  const last = Number(args.lastPetAtMs);
  if (Number.isFinite(now) && Number.isFinite(last) && now - last < cooldown) {
    return {
      ok: false,
      reason: 'cooldown',
      squash: 0,
      particles: false,
      playSound: false,
      message: 'Already enjoying a pat',
    };
  }
  const motion = !args.reducedMotion && !args.animationsPaused;
  return {
    ok: true,
    reason: 'ok',
    squash: motion ? 0.55 : 0,
    particles: motion,
    playSound: true,
  };
}

/**
 * Bounded per-id reactions + pooled particles. Replaces single feedFx /
 * arrivalFx on the v2 path. Does not grant economy.
 *
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @param {import('../../vendor/three/three.module.js').Object3D} parent
 */
export function createWorldFxPool(THREE, parent) {
  const group = new THREE.Group();
  group.name = 'world-presentation-fx';
  parent.add(group);

  const particleGeom = new THREE.SphereGeometry(1, 8, 6);
  const particleMat = new THREE.MeshBasicMaterial({
    color: 0xf4e2b0,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const ringGeom = new THREE.RingGeometry(0.55, 0.78, 28);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf4e2b0,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
  const particles = [];
  for (let i = 0; i < MAX_CELEBRATION_PARTICLES; i += 1) {
    const puff = new THREE.Mesh(particleGeom, particleMat);
    puff.visible = false;
    particles.push(puff);
    group.add(puff);
  }
  /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
  const rings = [];
  for (let i = 0; i < MAX_BRIEF_REACTIONS; i += 1) {
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.visible = false;
    ring.rotation.x = -Math.PI / 2;
    rings.push(ring);
    group.add(ring);
  }
  skipRaycastTree(group);

  /**
   * @typedef {{ slimeId: string, kind: string, age: number, duration: number, squash: number }} Reaction
   * @type {Reaction[]}
   */
  const reactions = [];

  function hideAll() {
    for (let i = 0; i < particles.length; i += 1) particles[i].visible = false;
    for (let i = 0; i < rings.length; i += 1) rings[i].visible = false;
  }

  function clearReactions() {
    reactions.length = 0;
    hideAll();
  }

  /**
   * @param {string} slimeId
   * @param {'feed' | 'pet' | 'arrive'} kind
   */
  function beginReaction(slimeId, kind) {
    if (reactions.length >= MAX_BRIEF_REACTIONS) reactions.shift();
    const duration = kind === 'pet' ? 0.42 : kind === 'arrive' ? 0.5 : 0.55;
    const squash = kind === 'arrive' ? 0.32 : kind === 'pet' ? 0.4 : 0.72;
    reactions.push({ slimeId, kind, age: 0, duration, squash });
  }

  /**
   * @returns {number}
   */
  function activeParticleCount() {
    let n = 0;
    for (let i = 0; i < particles.length; i += 1) {
      if (particles[i].visible) n += 1;
    }
    return n;
  }

  /**
   * @param {number} dt
   * @param {(id: string) => { x: number, z: number, y?: number } | null} getGround
   * @param {boolean} [paused]
   * @param {boolean} [reducedMotion]
   * @returns {Map<string, number>}
   */
  function tick(dt, getGround, paused, reducedMotion) {
    /** @type {Map<string, number>} */
    const squashById = new Map();
    if (reducedMotion) {
      clearReactions();
      return squashById;
    }
    hideAll();
    if (!paused) {
      const step = Math.max(0, dt);
      for (let i = reactions.length - 1; i >= 0; i -= 1) {
        reactions[i].age += step;
        if (reactions[i].age >= reactions[i].duration) reactions.splice(i, 1);
      }
    }
    const shown = reactions.slice(0, MAX_BRIEF_REACTIONS);
    for (let r = 0; r < shown.length; r += 1) {
      const reaction = shown[r];
      const u = reaction.duration <= 0 ? 1 : Math.min(1, reaction.age / reaction.duration);
      const squash = reaction.squash * Math.sin(Math.PI * Math.min(1, u * 1.6));
      const prev = squashById.get(reaction.slimeId) ?? 0;
      if (squash > prev) squashById.set(reaction.slimeId, squash);
      const ground = getGround(reaction.slimeId);
      if (!ground) continue;
      const ring = rings[r];
      if (ring) {
        ring.visible = true;
        ring.position.set(ground.x, 0.02, ground.z);
        ring.scale.setScalar(0.85 + u * 0.4);
        ring.material = ringMat;
        ringMat.opacity = 0.35 * (1 - u);
      }
      const particleT = u;
      const start = r * PARTICLES_PER_REACTION;
      for (let p = 0; p < PARTICLES_PER_REACTION; p += 1) {
        const puff = particles[start + p];
        if (!puff) continue;
        const off = particleOffset(reaction.slimeId, p);
        puff.visible = particleT > 0 && particleT < 1;
        if (!puff.visible) continue;
        puff.position.set(
          ground.x + off.x,
          (ground.y ?? 0.7) + off.y + particleT * 0.42,
          ground.z + off.z,
        );
        puff.scale.setScalar(0.028 * (0.7 + (1 - particleT)));
      }
    }
    return squashById;
  }

  function dispose() {
    clearReactions();
    group.removeFromParent();
    particleGeom.dispose();
    particleMat.dispose();
    ringGeom.dispose();
    ringMat.dispose();
    particles.length = 0;
    rings.length = 0;
  }

  return {
    group,
    beginReaction,
    tick,
    hideAll,
    clearReactions,
    get size() {
      return reactions.length;
    },
    activeParticleCount,
    dispose,
  };
}
