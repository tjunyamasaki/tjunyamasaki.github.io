/**
 * Physical food: landing on the world clock and exclusive claims.
 * Eating completion / FED is P2-08. Pure: no DOM, Three, wall-clock APIs,
 * randomness, or scene.
 *
 * Approach samples (plan 02 §5 / 03): 16 headings, angle 0 toward +X
 * (`cos/sin`, k=0 → +X), radii 1.0, mid 1.125, and 1.25. Plus the resident's
 * current point when already in range (distance ≤ 1.25 + GEOM_EPS, valid
 * center, swept-clear segment to the berry). Line of sight is
 * `segmentClearsStatic`. `permitGate` is always false for food travel.
 */

import {
  EAT_APPROACH_MAX,
  EAT_APPROACH_MIN,
  GEOM_EPS,
  MAX_ACTIVE_ROUTES,
} from '../core/balance.mjs';
import {
  BLOCKED_RECOMPUTE_MS,
  REPLAN_MS,
  assignRoute,
  fairCompare,
  movingRouteCount,
  scheduleIdleWait,
  stopRouteAtCurrent,
} from './behavior.mjs';
import { yawFromDirection } from './gait.mjs';
import { copyPoint } from './geom.mjs';
import {
  FOOD_APPROACH_SAMPLE_COUNT,
  isValidResidentCenter,
  pairDistance,
} from './layout.mjs';
import { planRoute, segmentClearsStatic } from './navigation.mjs';
import { slimeNumericId } from './state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').WorldState} WorldState
 * @typedef {import('./state.mjs').WorldResident} WorldResident
 * @typedef {import('./state.mjs').FoodState} FoodState
 * @typedef {import('./layout.mjs').PointXZ} PointXZ
 * @typedef {{ points: PointXZ[], length: number }} RouteResult
 *
 * @typedef {object} ApproachOption
 * @property {number} length
 * @property {number} approachIndex
 * @property {boolean} inRange
 * @property {RouteResult | null} route
 */

export const CLAIM_RELEASE_MS = 5000;
export const FOOD_APPROACH_HEADINGS = FOOD_APPROACH_SAMPLE_COUNT;

const EAT_APPROACH_MID = (EAT_APPROACH_MIN + EAT_APPROACH_MAX) / 2;
/** 1.0 and 1.25 are required; mid matches `layout.mjs` food-target sampling. */
const EAT_APPROACH_RADII = Object.freeze([
  EAT_APPROACH_MIN,
  EAT_APPROACH_MID,
  EAT_APPROACH_MAX,
]);

/**
 * @param {string} id
 * @returns {number}
 */
export function foodNumericId(id) {
  if (typeof id !== 'string' || !id.startsWith('food-')) {
    return Number.MAX_SAFE_INTEGER;
  }
  const n = Number(id.slice('food-'.length));
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * @param {WorldResident} resident
 * @param {number} timeMs
 * @returns {boolean}
 */
export function isEligibleFoodClaimant(resident, timeMs) {
  if (resident.activity === 'arriving') return false;
  if (resident.activity === 'eating') return false;
  if (resident.targetFoodId != null) return false;
  if (resident.restUntilWorldMs > timeMs) return false;
  return true;
}

/**
 * @param {PointXZ} from
 * @param {PointXZ} food
 * @returns {boolean}
 */
export function hasLineOfSightToFood(from, food) {
  if (!isValidResidentCenter(from)) return false;
  return segmentClearsStatic(from, food, false);
}

/**
 * In eating range: distance ≤ 1.25 + GEOM_EPS, legal center, unobstructed
 * static segment to the berry. Does not require standing on a sample ring.
 *
 * @param {PointXZ} position
 * @param {PointXZ} food
 * @returns {boolean}
 */
export function isInEatingRange(position, food) {
  if (!isValidResidentCenter(position)) return false;
  if (pairDistance(position, food) > EAT_APPROACH_MAX + GEOM_EPS) return false;
  return hasLineOfSightToFood(position, food);
}

/**
 * @param {PointXZ} food
 * @param {number} radius
 * @param {number} index
 * @returns {PointXZ}
 */
export function approachSample(food, radius, index) {
  const angle = (index * 2 * Math.PI) / FOOD_APPROACH_HEADINGS;
  return {
    x: food.x + radius * Math.cos(angle),
    z: food.z + radius * Math.sin(angle),
  };
}

/**
 * Ordered approach samples: radii 1.0, mid, 1.25, each with headings k=0…15.
 * Index is stable for equal-length tie-breaks (lower wins).
 *
 * @param {PointXZ} food
 * @returns {{ point: PointXZ, index: number, radius: number }[]}
 */
export function eatingApproachSamples(food) {
  /** @type {{ point: PointXZ, index: number, radius: number }[]} */
  const samples = [];
  let index = 0;
  for (const radius of EAT_APPROACH_RADII) {
    for (let heading = 0; heading < FOOD_APPROACH_HEADINGS; heading += 1) {
      samples.push({
        point: approachSample(food, radius, heading),
        index,
        radius,
      });
      index += 1;
    }
  }
  return samples;
}

/**
 * @param {WorldResident} resident
 * @param {PointXZ} food
 */
function faceFood(resident, food) {
  resident.yaw = yawFromDirection(
    food.x - resident.position.x,
    food.z - resident.position.z,
  );
}

/**
 * @param {ApproachOption | null} current
 * @param {ApproachOption} next
 * @returns {boolean}
 */
function isBetterApproach(current, next) {
  if (current == null) return true;
  if (next.length < current.length - GEOM_EPS) return true;
  if (current.length < next.length - GEOM_EPS) return false;
  if (Math.abs(next.length - current.length) <= GEOM_EPS) {
    return next.approachIndex < current.approachIndex;
  }
  return false;
}

/**
 * Shortest feasible route to a legal eating approach. Length 0 / `inRange`
 * means claim in place; no RouteState is stored for that case.
 *
 * @param {WorldState} world
 * @param {WorldResident} resident
 * @param {PointXZ} food
 * @returns {ApproachOption | null}
 */
export function bestApproachFor(world, resident, food) {
  /** @type {ApproachOption | null} */
  let best = null;

  if (isInEatingRange(resident.position, food)) {
    best = {
      length: 0,
      approachIndex: -1,
      inRange: true,
      route: null,
    };
    return best;
  }

  for (const sample of eatingApproachSamples(food)) {
    if (!isValidResidentCenter(sample.point)) continue;
    if (!hasLineOfSightToFood(sample.point, food)) continue;
    const planned = planRoute({
      world,
      residentId: resident.id,
      destination: sample.point,
      permitGate: false,
    });
    if (!planned) continue;
    const inRange = planned.length <= GEOM_EPS;
    /** @type {ApproachOption} */
    const option = {
      length: planned.length,
      approachIndex: sample.index,
      inRange,
      route: inRange ? null : planned,
    };
    if (isBetterApproach(best, option)) {
      best = option;
    }
  }

  return best;
}

/**
 * @param {GameState} state
 * @param {WorldResident} resident
 * @returns {number}
 */
function remainingBoostMs(state, resident) {
  const slime = state.slimes.find((entry) => entry.id === resident.id);
  if (!slime) return 0;
  return Math.max(0, slime.boostUntilMs - state.simTimeMs);
}

/**
 * @param {GameState} state
 * @param {WorldState} world
 * @param {FoodState} food
 * @returns {{ resident: WorldResident, option: ApproachOption, boostLeft: number, numericId: number } | null}
 */
function bestClaimant(state, world, food) {
  const timeMs = world.timeMs;
  /** @type {{ resident: WorldResident, option: ApproachOption, boostLeft: number, numericId: number } | null} */
  let best = null;
  for (const resident of world.residents) {
    if (!isEligibleFoodClaimant(resident, timeMs)) continue;
    const option = bestApproachFor(world, resident, food.target);
    if (!option) continue;
    const boostLeft = remainingBoostMs(state, resident);
    const numericId = slimeNumericId(resident.id);
    if (best == null) {
      best = { resident, option, boostLeft, numericId };
      continue;
    }
    if (option.length < best.option.length - GEOM_EPS) {
      best = { resident, option, boostLeft, numericId };
      continue;
    }
    if (best.option.length < option.length - GEOM_EPS) continue;
    if (boostLeft < best.boostLeft) {
      best = { resident, option, boostLeft, numericId };
      continue;
    }
    if (best.boostLeft < boostLeft) continue;
    if (numericId < best.numericId) {
      best = { resident, option, boostLeft, numericId };
    }
  }
  return best;
}

/**
 * @param {WorldState} world
 * @returns {boolean}
 */
export function hasUnclaimedLandedFood(world) {
  for (const food of world.foods) {
    if (food.stage === 'landed' && food.claimedBy == null) return true;
  }
  return false;
}

/**
 * Stop the fairest wanderer at their current point so a food seeker can take
 * a mover slot. Does not snap to the wander destination.
 *
 * @param {WorldState} world
 * @returns {boolean}
 */
export function stopWandererForFoodSlot(world) {
  const wanderers = world.residents
    .filter(
      (resident) =>
        resident.activity === 'wandering' &&
        resident.route != null &&
        resident.route.points.length >= 2,
    )
    .sort(fairCompare);
  if (wanderers.length === 0) return false;
  stopRouteAtCurrent(wanderers[0], world.timeMs);
  return true;
}

/**
 * @param {FoodState} food
 * @param {WorldResident} resident
 */
function bindClaim(food, resident) {
  food.claimedBy = resident.id;
  food.stage = 'claimed';
  food.eatUntilWorldMs = null;
  resident.targetFoodId = food.id;
  resident.activity = 'seekingFood';
}

/**
 * @param {FoodState} food
 * @param {WorldResident} resident
 * @param {number} timeMs
 */
function releaseClaimPair(food, resident, timeMs) {
  food.claimedBy = null;
  food.stage = 'landed';
  food.eatUntilWorldMs = null;
  resident.targetFoodId = null;
  resident.route = null;
  if (resident.activity === 'seekingFood') {
    resident.activity = 'idle';
    scheduleIdleWait(resident, timeMs);
  }
}

/**
 * @param {WorldState} world
 * @param {FoodState} food
 * @param {WorldResident} resident
 * @param {ApproachOption} option
 * @param {object[]} events
 * @param {number} atMs
 * @returns {boolean}
 */
function assignClaim(world, food, resident, option, events, atMs) {
  if (option.inRange || option.length <= GEOM_EPS) {
    resident.route = null;
    bindClaim(food, resident);
    faceFood(resident, food.target);
    resident.blockedSinceWorldMs = null;
    resident.nextReplanWorldMs = world.timeMs;
    events.push({
      type: 'FOOD_CLAIMED',
      foodId: food.id,
      slimeId: resident.id,
      atMs,
    });
    return true;
  }

  let route = option.route;
  if (
    (!route || route.points.length < 2 || !(route.length > GEOM_EPS)) &&
    movingRouteCount(world, resident.id) >= MAX_ACTIVE_ROUTES
  ) {
    if (stopWandererForFoodSlot(world)) {
      const retried = bestApproachFor(world, resident, food.target);
      if (retried) {
        if (retried.inRange || retried.length <= GEOM_EPS) {
          return assignClaim(world, food, resident, retried, events, atMs);
        }
        route = retried.route;
      }
    }
  }

  if (!route || route.points.length < 2 || !(route.length > GEOM_EPS)) {
    return false;
  }

  assignRoute(resident, route, world.timeMs, 'seekingFood');
  bindClaim(food, resident);
  events.push({
    type: 'FOOD_CLAIMED',
    foodId: food.id,
    slimeId: resident.id,
    atMs,
  });
  return true;
}

/**
 * Land every flying berry whose world deadline is due. `atMs` is sim time.
 *
 * @param {WorldState} world
 * @param {number} atMs
 * @param {object[]} events
 */
export function landDueFood(world, atMs, events) {
  for (const food of world.foods) {
    if (food.stage !== 'flying') continue;
    if (world.timeMs < food.landAtWorldMs) continue;
    food.stage = 'landed';
    food.claimedBy = null;
    food.eatUntilWorldMs = null;
    events.push({ type: 'FOOD_LANDED', foodId: food.id, atMs });
  }
}

/**
 * @param {WorldState} world
 * @param {WorldResident} resident
 * @returns {FoodState | null}
 */
function claimedFoodFor(world, resident) {
  if (resident.targetFoodId == null) return null;
  return world.foods.find((food) => food.id === resident.targetFoodId) ?? null;
}

/**
 * Release claims that have not progressed for 5000 world ms. Never deletes
 * food and never remote-eats.
 *
 * @param {WorldState} world
 */
export function releaseStaleClaims(world) {
  const timeMs = world.timeMs;
  for (const resident of world.residents) {
    if (resident.activity !== 'seekingFood') continue;
    const food = claimedFoodFor(world, resident);
    if (!food || food.claimedBy !== resident.id) {
      resident.targetFoodId = null;
      resident.route = null;
      resident.activity = 'idle';
      scheduleIdleWait(resident, timeMs);
      continue;
    }
    if (isInEatingRange(resident.position, food.target)) {
      resident.blockedSinceWorldMs = null;
      continue;
    }
    const hasWalk =
      resident.route != null &&
      resident.route.points.length >= 2 &&
      resident.route.length > GEOM_EPS;
    if (hasWalk) {
      resident.blockedSinceWorldMs = null;
      continue;
    }
    if (resident.blockedSinceWorldMs == null) {
      resident.blockedSinceWorldMs = timeMs;
    }
    if (timeMs - resident.blockedSinceWorldMs >= CLAIM_RELEASE_MS) {
      releaseClaimPair(food, resident, timeMs);
    }
  }
}

/**
 * Replan a seeking resident who is not in range and has no walk, on the
 * 500 ms / 2000 ms blockage schedule.
 *
 * @param {WorldState} world
 * @param {WorldResident} resident
 * @param {FoodState} food
 */
function replanSeeker(world, resident, food) {
  const timeMs = world.timeMs;
  if (timeMs < resident.nextReplanWorldMs) return;
  const blockedFor =
    resident.blockedSinceWorldMs == null
      ? 0
      : timeMs - resident.blockedSinceWorldMs;
  if (
    blockedFor < BLOCKED_RECOMPUTE_MS &&
    resident.route != null &&
    resident.route.points.length >= 2
  ) {
    return;
  }

  const option = bestApproachFor(world, resident, food.target);
  resident.nextReplanWorldMs = timeMs + REPLAN_MS;
  if (!option) {
    if (resident.blockedSinceWorldMs == null) {
      resident.blockedSinceWorldMs = timeMs;
    }
    return;
  }
  if (option.inRange || option.length <= GEOM_EPS) {
    resident.route = null;
    faceFood(resident, food.target);
    resident.blockedSinceWorldMs = null;
    return;
  }
  if (!option.route || option.route.points.length < 2) {
    if (
      movingRouteCount(world, resident.id) >= MAX_ACTIVE_ROUTES &&
      stopWandererForFoodSlot(world)
    ) {
      replanSeeker(world, resident, food);
    } else if (resident.blockedSinceWorldMs == null) {
      resident.blockedSinceWorldMs = timeMs;
    }
    return;
  }
  assignRoute(resident, option.route, timeMs, 'seekingFood');
}

/**
 * Oldest unclaimed landed food first. Reciprocal exclusive claims.
 *
 * @param {GameState} state
 * @param {WorldState} world
 * @param {object[]} events
 */
export function allocateFoodClaims(state, world, events) {
  const atMs = state.simTimeMs;
  const pending = world.foods
    .filter((food) => food.stage === 'landed' && food.claimedBy == null)
    .sort((a, b) => foodNumericId(a.id) - foodNumericId(b.id));

  for (const food of pending) {
    let choice = bestClaimant(state, world, food);
    if (!choice) {
      const eligible = world.residents.some((resident) =>
        isEligibleFoodClaimant(resident, world.timeMs),
      );
      if (
        eligible &&
        movingRouteCount(world) >= MAX_ACTIVE_ROUTES &&
        stopWandererForFoodSlot(world)
      ) {
        choice = bestClaimant(state, world, food);
      }
    }
    if (!choice) continue;
    assignClaim(world, food, choice.resident, choice.option, events, atMs);
  }

  for (const resident of world.residents) {
    if (resident.activity !== 'seekingFood') continue;
    const food = claimedFoodFor(world, resident);
    if (!food) continue;
    if (isInEatingRange(resident.position, food.target)) continue;
    const hasWalk =
      resident.route != null &&
      resident.route.points.length >= 2 &&
      resident.route.length > GEOM_EPS;
    if (hasWalk) continue;
    replanSeeker(world, resident, food);
  }
}

/**
 * Face the claimed berry and keep `seekingFood` when a seeker finishes walking.
 * Does not enter `eating` and does not schedule a wander idle.
 *
 * @param {WorldResident} resident
 * @param {WorldState} world
 */
export function completeSeekingFoodTravel(resident, world) {
  const route = resident.route;
  if (route && route.points.length > 0) {
    resident.position = copyPoint(route.points[route.points.length - 1]);
  }
  resident.route = null;
  resident.activity = 'seekingFood';
  resident.blockedSinceWorldMs = null;
  const food = claimedFoodFor(world, resident);
  if (food) {
    faceFood(resident, food.target);
  }
}
