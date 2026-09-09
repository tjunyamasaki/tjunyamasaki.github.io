/**
 * Wander, yield, and active-arrival planning. Pure world decisions; no food
 * claims (P2-07). No DOM, Three, wall-clock APIs, randomness, or scene.
 */

import {
  GEOM_EPS,
  MAX_ACTIVE_ROUTES,
} from '../core/balance.mjs';
import { copyPoint, pointToSegmentDistance } from './geom.mjs';
import { gaitCycleCount, poseAlongPolyline } from './gait.mjs';
import { hashIntInclusive, hashUnit } from './hash.mjs';
import {
  GATE_STAGING,
  MIN_SEPARATION,
  findFreePosition,
  homePosition,
  isInArrivalCorridor,
  isSeparatedFrom,
  isValidResidentCenter,
  pairDistance,
} from './layout.mjs';
import {
  planRoute,
  pointClearsStations,
  rebuildReservations,
} from './navigation.mjs';
import { cloneGameState, slimeNumericId } from './state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').WorldState} WorldState
 * @typedef {import('./state.mjs').WorldResident} WorldResident
 * @typedef {import('./state.mjs').RouteState} RouteState
 * @typedef {import('./layout.mjs').PointXZ} PointXZ
 * @typedef {import('./state.mjs').SlimeId} SlimeId
 * @typedef {{ points: PointXZ[], length: number }} RouteResult
 */

export const WANDER_CANDIDATE_COUNT = 8;
export const WANDER_MIN_DISTANCE = 2.5;
export const WANDER_MAX_DISTANCE = 6;
export const IDLE_WAIT_MIN_MS = 2000;
export const IDLE_WAIT_MAX_MS = 5000;
export const REST_MIN_MS = 1000;
export const REST_MAX_MS = 2000;
export const REPLAN_MS = 500;
export const BLOCKED_RECOMPUTE_MS = 2000;
export const YIELD_RADII = Object.freeze([3, 4.5]);
export const YIELD_HEADING_COUNT = 8;

/**
 * @param {WorldState} world
 * @param {string} [exceptId]
 * @returns {number}
 */
export function movingRouteCount(world, exceptId) {
  let count = 0;
  for (const resident of world.residents) {
    if (exceptId && resident.id === exceptId) continue;
    if (resident.route != null && Array.isArray(resident.route.points) && resident.route.points.length >= 2) {
      count += 1;
    }
  }
  return count;
}

/**
 * @param {WorldResident} a
 * @param {WorldResident} b
 * @returns {number}
 */
export function fairCompare(a, b) {
  if (a.behaviorCounter !== b.behaviorCounter) {
    return a.behaviorCounter - b.behaviorCounter;
  }
  return slimeNumericId(a.id) - slimeNumericId(b.id);
}

/**
 * @param {RouteResult} result
 * @param {number} timeMs
 * @returns {RouteState}
 */
export function toRouteState(result, timeMs) {
  const points = result.points.map((point) => copyPoint(point));
  const length = result.length;
  return {
    points,
    length,
    startedWorldMs: timeMs,
    cycleCount: gaitCycleCount(length),
    distanceAlong: 0,
  };
}

/**
 * @param {WorldResident} resident
 * @param {RouteResult} result
 * @param {number} timeMs
 * @param {WorldResident['activity']} activity
 */
export function assignRoute(resident, result, timeMs, activity) {
  const route = toRouteState(result, timeMs);
  resident.route = route;
  resident.activity = activity;
  resident.blockedSinceWorldMs = null;
  resident.nextReplanWorldMs = timeMs;
  const pose = poseAlongPolyline(route.points, 0);
  resident.yaw = pose.yaw;
}

/**
 * Eight hash-derived wander targets 2.5–6 from the current position.
 * Callers still validate legality and reservations.
 *
 * @param {WorldResident} resident
 * @returns {PointXZ[]}
 */
export function wanderCandidatePoints(resident) {
  const origin = resident.position;
  const spin = hashUnit(resident.id, resident.behaviorCounter, 'spin') * Math.PI * 2;
  /** @type {PointXZ[]} */
  const points = [];
  for (let index = 0; index < WANDER_CANDIDATE_COUNT; index += 1) {
    const angle = spin + (index * Math.PI) / 4;
    const unit = hashUnit(resident.id, resident.behaviorCounter, index);
    // Lower indices prefer the far band so clustered homes are less likely to
    // sit on every candidate.
    const far = WANDER_MAX_DISTANCE - index * 0.2;
    const dist = Math.min(
      WANDER_MAX_DISTANCE,
      Math.max(WANDER_MIN_DISTANCE, far - unit * 1.1),
    );
    points.push({
      x: origin.x + dist * Math.sin(angle),
      z: origin.z + dist * Math.cos(angle),
    });
  }
  return points;
}

/**
 * @param {PointXZ} point
 * @returns {boolean}
 */
function isWanderDestinationLegal(point) {
  if (!isValidResidentCenter(point)) return false;
  if (isInArrivalCorridor(point)) return false;
  if (pairDistance(point, GATE_STAGING) <= MIN_SEPARATION) return false;
  return true;
}

/**
 * @param {PointXZ} origin
 * @returns {PointXZ[]}
 */
export function yieldCandidatePoints(origin) {
  /** @type {PointXZ[]} */
  const points = [];
  for (const radius of YIELD_RADII) {
    for (let index = 0; index < YIELD_HEADING_COUNT; index += 1) {
      const angle = (index * 2 * Math.PI) / YIELD_HEADING_COUNT;
      points.push({
        x: origin.x + radius * Math.cos(angle),
        z: origin.z + radius * Math.sin(angle),
      });
    }
  }
  return points;
}

/**
 * @param {WorldResident} resident
 * @param {number} timeMs
 */
export function scheduleIdleWait(resident, timeMs) {
  const wait = hashIntInclusive(
    resident.id,
    resident.behaviorCounter,
    'idle',
    IDLE_WAIT_MIN_MS,
    IDLE_WAIT_MAX_MS,
  );
  resident.nextDecisionWorldMs = timeMs + wait;
  resident.restUntilWorldMs = timeMs;
  resident.nextReplanWorldMs = timeMs;
}

/**
 * @param {WorldResident} resident
 * @param {number} timeMs
 */
function markWanderFailed(resident, timeMs) {
  resident.behaviorCounter += 1;
  const rest = hashIntInclusive(
    resident.id,
    resident.behaviorCounter,
    'rest',
    REST_MIN_MS,
    REST_MAX_MS,
  );
  resident.nextDecisionWorldMs = timeMs + rest;
  resident.restUntilWorldMs = timeMs + rest;
  resident.nextReplanWorldMs = timeMs + REPLAN_MS;
  if (resident.blockedSinceWorldMs == null) {
    resident.blockedSinceWorldMs = timeMs;
  }
}

/**
 * @param {WorldResident} resident
 * @param {number} timeMs
 * @returns {boolean}
 */
function isBusyActivity(resident) {
  return (
    resident.activity === 'arriving' ||
    resident.activity === 'eating' ||
    resident.activity === 'seekingFood' ||
    resident.activity === 'yielding'
  );
}

/**
 * @param {WorldResident} resident
 * @param {number} timeMs
 * @returns {boolean}
 */
export function isDueForWanderAttempt(resident, timeMs) {
  if (resident.route != null && resident.route.points.length >= 2) return false;
  if (isBusyActivity(resident)) return false;
  const blockedFor =
    resident.blockedSinceWorldMs == null ? 0 : timeMs - resident.blockedSinceWorldMs;
  if (blockedFor >= BLOCKED_RECOMPUTE_MS && timeMs >= resident.nextReplanWorldMs) {
    return true;
  }
  if (timeMs < resident.nextDecisionWorldMs) return false;
  if (timeMs < resident.restUntilWorldMs) return false;
  if (timeMs < resident.nextReplanWorldMs) return false;
  return true;
}

/**
 * @param {WorldState} world
 * @param {WorldResident} resident
 * @returns {RouteResult | null}
 */
export function planWanderRoute(world, resident) {
  if (movingRouteCount(world, resident.id) >= MAX_ACTIVE_ROUTES) return null;
  const candidates = wanderCandidatePoints(resident);
  for (const dest of candidates) {
    if (!isWanderDestinationLegal(dest)) continue;
    const span = pairDistance(resident.position, dest);
    if (span < WANDER_MIN_DISTANCE - GEOM_EPS || span > WANDER_MAX_DISTANCE + GEOM_EPS) {
      continue;
    }
    if (!pointClearsStations(dest, world, resident.id)) continue;
    const planned = planRoute({
      world,
      residentId: resident.id,
      destination: dest,
      permitGate: false,
    });
    if (planned && planned.points.length >= 2 && planned.length > GEOM_EPS) {
      return planned;
    }
  }
  return null;
}

/**
 * @param {WorldState} world
 * @param {WorldResident} resident
 * @returns {boolean}
 */
export function tryStartWander(world, resident) {
  const planned = planWanderRoute(world, resident);
  if (!planned) return false;
  assignRoute(resident, planned, world.timeMs, 'wandering');
  resident.behaviorCounter += 1;
  return true;
}

/**
 * @param {WorldResident} blocker
 * @param {WorldResident} requester
 * @param {readonly PointXZ[]} candidates
 * @returns {boolean}
 */
function isLikelyBlocker(blocker, requester, candidates) {
  const from = requester.position;
  if (pairDistance(blocker.position, from) < MIN_SEPARATION + 1) return true;
  for (const dest of candidates) {
    if (pairDistance(dest, blocker.position) < MIN_SEPARATION - GEOM_EPS) return true;
    if (pointToSegmentDistance(blocker.position, from, dest) < MIN_SEPARATION - GEOM_EPS) {
      return true;
    }
  }
  return false;
}

/**
 * @param {WorldState} world
 * @param {WorldResident} blocker
 * @returns {boolean}
 */
export function tryStartYield(world, blocker) {
  if (movingRouteCount(world, blocker.id) >= MAX_ACTIVE_ROUTES) return false;
  if (blocker.route != null) return false;
  if (blocker.activity !== 'idle') return false;
  for (const dest of yieldCandidatePoints(blocker.position)) {
    if (!isWanderDestinationLegal(dest)) continue;
    if (!pointClearsStations(dest, world, blocker.id)) continue;
    const planned = planRoute({
      world,
      residentId: blocker.id,
      destination: dest,
      permitGate: false,
    });
    if (planned && planned.points.length >= 2 && planned.length > GEOM_EPS) {
      assignRoute(blocker, planned, world.timeMs, 'yielding');
      blocker.behaviorCounter += 1;
      return true;
    }
  }
  return false;
}

/**
 * @param {WorldState} world
 * @param {WorldResident} requester
 * @returns {boolean}
 */
function tryYieldForRequester(world, requester) {
  if (movingRouteCount(world) >= MAX_ACTIVE_ROUTES) return false;
  const candidates = wanderCandidatePoints(requester);
  const idles = world.residents
    .filter(
      (resident) =>
        resident.id !== requester.id &&
        resident.route == null &&
        resident.activity === 'idle',
    )
    .sort(fairCompare);
  for (const blocker of idles) {
    if (!isLikelyBlocker(blocker, requester, candidates)) continue;
    if (tryStartYield(world, blocker)) return true;
  }
  return false;
}

/**
 * @param {WorldState} world
 * @returns {number} New path starts this tick.
 */
export function applyIdleDecisions(world) {
  const timeMs = world.timeMs;
  let starts = 0;

  /**
   * @returns {boolean}
   */
  function canStart() {
    return starts < MAX_ACTIVE_ROUTES && movingRouteCount(world) < MAX_ACTIVE_ROUTES;
  }

  const due = world.residents.filter((resident) => isDueForWanderAttempt(resident, timeMs));
  due.sort(fairCompare);

  let yielded = false;
  for (const resident of due) {
    const blockedFor =
      resident.blockedSinceWorldMs == null
        ? 0
        : timeMs - resident.blockedSinceWorldMs;
    if (blockedFor < BLOCKED_RECOMPUTE_MS) continue;
    if (!canStart()) break;
    if (tryStartWander(world, resident)) {
      starts += 1;
      continue;
    }
    if (!yielded && canStart() && tryYieldForRequester(world, resident)) {
      starts += 1;
      yielded = true;
      if (canStart() && tryStartWander(world, resident)) {
        starts += 1;
      } else {
        resident.nextReplanWorldMs = timeMs + REPLAN_MS;
        if (resident.blockedSinceWorldMs == null) {
          resident.blockedSinceWorldMs = timeMs;
        }
      }
      break;
    }
  }

  for (const resident of due) {
    if (resident.route != null) continue;
    if (!canStart()) {
      resident.nextReplanWorldMs = timeMs + REPLAN_MS;
      if (resident.blockedSinceWorldMs == null) {
        resident.blockedSinceWorldMs = timeMs;
      }
      continue;
    }
    if (tryStartWander(world, resident)) {
      starts += 1;
    } else {
      markWanderFailed(resident, timeMs);
    }
  }

  return starts;
}

/**
 * @param {WorldState} world
 * @param {string} exceptId
 * @returns {boolean}
 */
export function gateOccupied(world, exceptId) {
  for (const resident of world.residents) {
    if (resident.id === exceptId) continue;
    if (resident.activity === 'arriving') return true;
    if (isInArrivalCorridor(resident.position)) return true;
  }
  return false;
}

/**
 * @param {WorldState} world
 * @param {WorldResident} resident
 * @param {number} homeSlot
 * @returns {PointXZ | null}
 */
function arrivalDestination(world, resident, homeSlot) {
  const slot = Number.isInteger(homeSlot) ? homeSlot : slimeNumericId(resident.id) - 1;
  const others = world.residents
    .filter((entry) => entry.id !== resident.id)
    .map((entry) => entry.position);
  const reserved = [];
  for (const corridor of rebuildReservations(world)) {
    if (corridor.residentId === resident.id) continue;
    for (const point of corridor.points) reserved.push(point);
  }
  const home = homePosition(slot);
  if (home && isValidResidentCenter(home) && isSeparatedFrom(home, others)) {
    return copyPoint(home);
  }
  return findFreePosition({ occupied: others, reserved });
}

/**
 * One-time active membership gate plan. Relocates `id` to staging only when
 * the route reserves and the corridor is free. Never moves other residents.
 *
 * @param {GameState} state
 * @param {string} id
 * @returns {GameState}
 */
export function planActiveArrival(state, id) {
  const next = cloneGameState(state);
  const world = next.world;
  const resident = world.residents.find((entry) => entry.id === id);
  if (!resident) return next;
  if (resident.activity === 'arriving' && resident.route != null) return next;
  if (gateOccupied(world, id)) return next;

  const slime = next.slimes.find((entry) => entry.id === id);
  const dest = arrivalDestination(world, resident, slime ? slime.homeSlot : slimeNumericId(id) - 1);
  if (!dest) return next;

  const saved = copyPoint(resident.position);
  resident.position = copyPoint(GATE_STAGING);
  const planned = planRoute({
    world,
    residentId: id,
    destination: dest,
    permitGate: true,
  });
  if (
    !planned ||
    planned.points.length < 2 ||
    !(planned.length > GEOM_EPS) ||
    movingRouteCount(world, id) >= MAX_ACTIVE_ROUTES
  ) {
    resident.position = saved;
    return next;
  }

  assignRoute(resident, planned, world.timeMs, 'arriving');
  resident.position = copyPoint(GATE_STAGING);
  return next;
}
