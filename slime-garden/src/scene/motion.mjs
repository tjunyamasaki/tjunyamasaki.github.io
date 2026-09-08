/**
 * Bounded garden locomotion. One walker at a time. Cosmetic only: never
 * writes Glow, berries, or save data. Feeding/arrival presentation is P09;
 * this module still interrupts a walk and releases its reservation.
 */

import { WALK_CYCLE_SEC } from './slime-pose.mjs';
import {
  GAIT_UNITS_PER_CYCLE,
  HOME_SLOTS,
  MAX_WANDER_ATTEMPTS,
  MIN_SEPARATION,
  MIN_WANDER_DISTANCE,
  TRAVEL_PHASE_END,
  TRAVEL_PHASE_START,
  WALK_RADIUS,
  WANDER_DELAY_MAX_SEC,
  WANDER_DELAY_MIN_SEC,
  WANDER_HOME_RADIUS,
  isInsideWalkRadius,
} from './layout.mjs';

/**
 * @typedef {object} Occupant
 * @property {number} x
 * @property {number} z
 *
 * @typedef {object} WalkReservation
 * @property {number} fromX
 * @property {number} fromZ
 * @property {number} toX
 * @property {number} toZ
 * @property {number} cycles
 * @property {number} startedSec
 * @property {number} targetYaw
 *
 * @typedef {object} ResidentMotion
 * @property {string} id
 * @property {number} homeSlot
 * @property {number} homeX
 * @property {number} homeZ
 * @property {number} x
 * @property {number} z
 * @property {number} yaw
 * @property {'idle' | 'walking' | 'feeding' | 'arriving'} mode
 * @property {number} waitUntilSec
 * @property {number} attempt
 * @property {WalkReservation | null} walk
 */

/**
 * @param {number} t 0..1, unclamped
 * @returns {number}
 */
export function smoothstep01(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/**
 * Shortest signed yaw delta in (−π, π].
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
export function shortestYawDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Face looks toward local +Z; travel (dx, dz) → yaw atan2(dx, dz).
 * @param {number} dx
 * @param {number} dz
 * @returns {number}
 */
export function yawFromDirection(dx, dz) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return Math.atan2(dx, dz);
}

/**
 * @param {number} current
 * @param {number} target
 * @param {number} dt
 * @param {number} [rate]
 * @returns {number}
 */
export function dampYaw(current, target, dt, rate = 6) {
  const delta = shortestYawDelta(current, target);
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return current + delta * k;
}

/**
 * @param {number} px
 * @param {number} pz
 * @param {number} ax
 * @param {number} az
 * @param {number} bx
 * @param {number} bz
 * @returns {number}
 */
export function pointToSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 <= 1e-12) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), pz - (az + t * abz));
}

/**
 * Full swept segment vs stationary occupants. Endpoint-only checks are not enough.
 *
 * @param {number} ax
 * @param {number} az
 * @param {number} bx
 * @param {number} bz
 * @param {readonly Occupant[]} occupants
 * @param {number} [minDistance]
 * @returns {boolean}
 */
export function segmentClearsOccupants(
  ax,
  az,
  bx,
  bz,
  occupants,
  minDistance = MIN_SEPARATION,
) {
  for (let i = 0; i < occupants.length; i++) {
    const other = occupants[i];
    if (pointToSegmentDistance(other.x, other.z, ax, az, bx, bz) < minDistance) {
      return false;
    }
  }
  return true;
}

/**
 * @param {number} distance
 * @param {number} [unitsPerCycle]
 * @returns {number}
 */
export function gaitCycleCount(distance, unitsPerCycle = GAIT_UNITS_PER_CYCLE) {
  if (!(distance > 0)) return 1;
  return Math.max(1, Math.ceil(distance / unitsPerCycle));
}

/**
 * Horizontal travel fraction 0..1 over `cycleCount` gait cycles. Motion is
 * applied during phase 0.29–0.68 of each cycle; the slime holds otherwise.
 *
 * @param {number} elapsedSec
 * @param {number} cycleCount
 * @returns {number}
 */
export function gaitTravelProgress(elapsedSec, cycleCount) {
  const cycles = Math.max(1, cycleCount | 0);
  const total = cycles * WALK_CYCLE_SEC;
  if (elapsedSec >= total) return 1;
  if (elapsedSec <= 0) return 0;
  const raw = elapsedSec / WALK_CYCLE_SEC;
  const cycleIndex = Math.min(cycles - 1, Math.floor(raw));
  const phase = raw - Math.floor(raw);
  const span = TRAVEL_PHASE_END - TRAVEL_PHASE_START;
  const u = smoothstep01((phase - TRAVEL_PHASE_START) / span);
  return (cycleIndex + u) / cycles;
}

/**
 * FNV-1a 32-bit. Stable visual seed from a resident id; not a security hash.
 * @param {string} id
 * @returns {number}
 */
export function hashSlimeId(id) {
  let h = 2166136261;
  const text = String(id);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Idle/blink phase offset in seconds. Gameplay desynchronizes residents;
 * inspection pages force phase zero separately.
 * @param {string} id
 * @returns {number}
 */
export function idlePhaseOffsetSec(id) {
  return (hashSlimeId(id) % 10007) / 1000;
}

/**
 * Next wander wait in [5, 12] visual seconds.
 * @param {string} id
 * @param {number} attempt
 * @returns {number}
 */
export function wanderDelaySec(id, attempt) {
  const rng = mulberry32(hashSlimeId(id) ^ ((attempt + 1) * 0x9e3779b9));
  return (
    WANDER_DELAY_MIN_SEC +
    rng() * (WANDER_DELAY_MAX_SEC - WANDER_DELAY_MIN_SEC)
  );
}

/**
 * @param {{
 *   fromX: number,
 *   fromZ: number,
 *   homeX: number,
 *   homeZ: number,
 *   occupants: readonly Occupant[],
 *   rng: () => number,
 *   walkRadius?: number,
 *   homeRadius?: number,
 *   minSeparation?: number,
 *   maxAttempts?: number,
 * }} args
 * @returns {{ x: number, z: number } | null}
 */
export function pickWanderDestination(args) {
  const walkRadius = args.walkRadius ?? WALK_RADIUS;
  const homeRadius = args.homeRadius ?? WANDER_HOME_RADIUS;
  const minSeparation = args.minSeparation ?? MIN_SEPARATION;
  const maxAttempts = args.maxAttempts ?? MAX_WANDER_ATTEMPTS;
  for (let i = 0; i < maxAttempts; i++) {
    const angle = args.rng() * Math.PI * 2;
    const dist = args.rng() * homeRadius;
    const x = args.homeX + Math.cos(angle) * dist;
    const z = args.homeZ + Math.sin(angle) * dist;
    if (!isInsideWalkRadius(x, z, walkRadius)) continue;
    if (Math.hypot(x - args.fromX, z - args.fromZ) < MIN_WANDER_DISTANCE) continue;
    if (
      !segmentClearsOccupants(
        args.fromX,
        args.fromZ,
        x,
        z,
        args.occupants,
        minSeparation,
      )
    ) {
      continue;
    }
    return { x, z };
  }
  return null;
}

function homeForSlot(slot) {
  const index = Math.max(0, Math.min(HOME_SLOTS.length - 1, slot | 0));
  return HOME_SLOTS[index];
}

/**
 * @param {string} id
 * @param {number} homeSlot
 * @param {number} visualSec
 * @returns {ResidentMotion}
 */
export function createResidentMotion(id, homeSlot, visualSec) {
  const home = homeForSlot(homeSlot);
  return {
    id,
    homeSlot,
    homeX: home.x,
    homeZ: home.z,
    x: home.x,
    z: home.z,
    yaw: 0,
    mode: 'idle',
    waitUntilSec: visualSec + wanderDelaySec(id, 0),
    attempt: 0,
    walk: null,
  };
}

/**
 * @param {ResidentMotion} motion
 */
export function releaseWalk(motion) {
  motion.walk = null;
  if (motion.mode === 'walking') motion.mode = 'idle';
}

/**
 * Snap to the stable home pad and drop any reservation.
 * @param {ResidentMotion} motion
 * @param {number} visualSec
 */
export function restAtHome(motion, visualSec) {
  releaseWalk(motion);
  motion.x = motion.homeX;
  motion.z = motion.homeZ;
  motion.yaw = 0;
  motion.mode = 'idle';
  motion.waitUntilSec = visualSec + wanderDelaySec(motion.id, motion.attempt);
}

/**
 * @returns {{
 *   visualSec: number,
 *   walkerId: string | null,
 *   wanderSuspended: boolean,
 *   residents: Map<string, ResidentMotion>,
 *   syncRoster: (slimes: readonly { id: string, homeSlot: number }[], options?: { resetPositions?: boolean }) => void,
 *   interruptWalk: (id: string, faceYaw: number) => void,
 *   setWanderSuspended: (value: boolean) => void,
 *   restAll: () => void,
 *   placeAt: (id: string, x: number, z: number, yaw?: number) => void,
 *   setMode: (id: string, mode: 'idle' | 'walking' | 'feeding' | 'arriving') => void,
 *   beginDirectedWalk: (id: string, toX: number, toZ: number, mode?: 'walking' | 'arriving') => boolean,
 *   step: (dt: number, view: { cameraX: number, cameraZ: number, reducedMotion: boolean, animationsPaused: boolean }) => void,
 *   occupantsExcept: (id: string) => Occupant[],
 *   dispose: () => void,
 * }}
 */
export function createMotionWorld() {
  /** @type {Map<string, ResidentMotion>} */
  const residents = new Map();
  let visualSec = 0;
  /** @type {string | null} */
  let walkerId = null;
  let wanderSuspended = false;

  function occupantsExcept(id) {
    /** @type {Occupant[]} */
    const list = [];
    for (const motion of residents.values()) {
      if (motion.id === id) continue;
      list.push({ x: motion.x, z: motion.z });
    }
    return list;
  }

  function finishWalk(motion) {
    if (walkerId === motion.id) walkerId = null;
    if (motion.walk) {
      motion.x = motion.walk.toX;
      motion.z = motion.walk.toZ;
      motion.yaw = motion.walk.targetYaw;
    }
    releaseWalk(motion);
    motion.attempt += 1;
    motion.waitUntilSec = visualSec + wanderDelaySec(motion.id, motion.attempt);
  }

  /**
   * @param {readonly { id: string, homeSlot: number }[]} slimes
   * @param {{ resetPositions?: boolean }} [options]
   */
  function syncRoster(slimes, options = {}) {
    const resetPositions = !!options.resetPositions;
    const seen = new Set();
    for (const slime of slimes) {
      seen.add(slime.id);
      let motion = residents.get(slime.id);
      if (!motion) {
        motion = createResidentMotion(slime.id, slime.homeSlot, visualSec);
        residents.set(slime.id, motion);
        continue;
      }
      const home = homeForSlot(slime.homeSlot);
      motion.homeSlot = slime.homeSlot;
      motion.homeX = home.x;
      motion.homeZ = home.z;
      if (resetPositions) restAtHome(motion, visualSec);
    }
    for (const id of [...residents.keys()]) {
      if (seen.has(id)) continue;
      if (walkerId === id) walkerId = null;
      residents.delete(id);
    }
    if (resetPositions) walkerId = null;
  }

  /**
   * Stop on the spot, release the reservation, face `faceYaw`.
   * @param {string} id
   * @param {number} faceYaw
   */
  function interruptWalk(id, faceYaw) {
    const motion = residents.get(id);
    if (!motion) return;
    if (walkerId === id) walkerId = null;
    releaseWalk(motion);
    motion.yaw = faceYaw;
    motion.mode = 'idle';
    motion.waitUntilSec = visualSec + wanderDelaySec(motion.id, motion.attempt);
  }

  function restAll() {
    walkerId = null;
    for (const motion of residents.values()) restAtHome(motion, visualSec);
  }

  /**
   * @param {string} id
   * @param {number} x
   * @param {number} z
   * @param {number} [yaw]
   */
  function placeAt(id, x, z, yaw) {
    const motion = residents.get(id);
    if (!motion) return;
    if (walkerId === id) walkerId = null;
    releaseWalk(motion);
    motion.x = x;
    motion.z = z;
    if (yaw !== undefined) motion.yaw = yaw;
  }

  /**
   * @param {string} id
   * @param {'idle' | 'walking' | 'feeding' | 'arriving'} mode
   */
  function setMode(id, mode) {
    const motion = residents.get(id);
    if (!motion) return;
    motion.mode = mode;
  }

  /**
   * Reserve a straight gait-matched walk. Interrupts any other walker in place.
   * @param {string} id
   * @param {number} toX
   * @param {number} toZ
   * @param {'walking' | 'arriving'} [mode]
   * @returns {boolean}
   */
  function beginDirectedWalk(id, toX, toZ, mode = 'walking') {
    const motion = residents.get(id);
    if (!motion) return false;
    const dx = toX - motion.x;
    const dz = toZ - motion.z;
    const dist = Math.hypot(dx, dz);
    if (dist < MIN_WANDER_DISTANCE) return false;
    if (walkerId && walkerId !== id) {
      const other = residents.get(walkerId);
      if (other) interruptWalk(walkerId, other.yaw);
    }
    motion.mode = mode;
    motion.walk = {
      fromX: motion.x,
      fromZ: motion.z,
      toX,
      toZ,
      cycles: gaitCycleCount(dist),
      startedSec: visualSec,
      targetYaw: yawFromDirection(dx, dz),
    };
    walkerId = id;
    return true;
  }

  /**
   * @param {number} dt
   * @param {{ cameraX: number, cameraZ: number, reducedMotion: boolean, animationsPaused: boolean }} view
   */
  function step(dt, view) {
    const clamped = Math.max(0, Math.min(0.05, dt));
    if (view.reducedMotion || view.animationsPaused) {
      if (walkerId) restAll();
      return;
    }
    visualSec += clamped;

    if (walkerId) {
      const walking = residents.get(walkerId);
      if (!walking || !walking.walk) {
        walkerId = null;
      } else {
        const elapsed = visualSec - walking.walk.startedSec;
        const progress = gaitTravelProgress(elapsed, walking.walk.cycles);
        walking.x =
          walking.walk.fromX + (walking.walk.toX - walking.walk.fromX) * progress;
        walking.z =
          walking.walk.fromZ + (walking.walk.toZ - walking.walk.fromZ) * progress;
        walking.yaw = dampYaw(walking.yaw, walking.walk.targetYaw, clamped, 8);
        if (progress >= 1) finishWalk(walking);
      }
    }

    if (!walkerId && !wanderSuspended) {
      for (const motion of residents.values()) {
        if (motion.mode !== 'idle') continue;
        if (visualSec < motion.waitUntilSec) continue;
        const dest = pickWanderDestination({
          fromX: motion.x,
          fromZ: motion.z,
          homeX: motion.homeX,
          homeZ: motion.homeZ,
          occupants: occupantsExcept(motion.id),
          rng: mulberry32(hashSlimeId(motion.id) ^ ((motion.attempt + 3) * 0x85ebca6b)),
        });
        motion.attempt += 1;
        if (!dest) {
          motion.waitUntilSec = visualSec + wanderDelaySec(motion.id, motion.attempt);
          continue;
        }
        const dx = dest.x - motion.x;
        const dz = dest.z - motion.z;
        motion.mode = 'walking';
        motion.walk = {
          fromX: motion.x,
          fromZ: motion.z,
          toX: dest.x,
          toZ: dest.z,
          cycles: gaitCycleCount(Math.hypot(dx, dz)),
          startedSec: visualSec,
          targetYaw: yawFromDirection(dx, dz),
        };
        walkerId = motion.id;
        break;
      }
    }

    for (const motion of residents.values()) {
      if (motion.mode !== 'idle') continue;
      const face = yawFromDirection(view.cameraX - motion.x, view.cameraZ - motion.z);
      motion.yaw = dampYaw(motion.yaw, face, clamped, 1.8);
    }
  }

  return {
    get visualSec() {
      return visualSec;
    },
    get walkerId() {
      return walkerId;
    },
    get wanderSuspended() {
      return wanderSuspended;
    },
    residents,
    syncRoster,
    interruptWalk,
    setWanderSuspended(value) {
      wanderSuspended = !!value;
    },
    restAll,
    placeAt,
    setMode,
    beginDirectedWalk,
    step,
    occupantsExcept,
    dispose() {
      residents.clear();
      walkerId = null;
      wanderSuspended = false;
      visualSec = 0;
    },
  };
}
