/**
 * Feeding and companion-arrival presentation. Cosmetic only: never writes Glow,
 * berries, or save data, and never dispatches economic commands.
 *
 * `visitor-v1` walks a gait-matched approach from the sheltered entrance when
 * the swept corridor is clear and the walk fits in five seconds. Otherwise the
 * newcomer appears at its pad (stationary reveal).
 */

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
