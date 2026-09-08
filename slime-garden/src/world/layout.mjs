/**
 * Pure farm geometry for phase 2. No Three, DOM, wall-clock APIs, or randomness.
 * Scene `layout.mjs` remains the v1 six-pad circle; this module is the ten-slot farm.
 *
 * Coordinates are finite world-unit floats. Compare with GEOM_EPS; do not
 * integer-round positions.
 */

import {
  EAT_APPROACH_MAX,
  EAT_APPROACH_MIN,
  GEOM_EPS,
  HABITAT_ID_V2,
} from '../core/balance.mjs';

/**
 * @typedef {{ x: number, z: number }} PointXZ
 * @typedef {{ occupied?: readonly PointXZ[], reserved?: readonly PointXZ[] }} FreePositionQuery
 */

export const FENCE_CENTERLINE_X = 12;
export const FENCE_CENTERLINE_Z = 10;
export const FARM_INTERIOR_WIDTH = 24;
export const FARM_INTERIOR_DEPTH = 20;

export const RESIDENT_MIN_X = -10.8;
export const RESIDENT_MAX_X = 10.8;
export const RESIDENT_MIN_Z = -8.8;
export const RESIDENT_MAX_Z = 8.8;

export const FOOD_MIN_X = -10.5;
export const FOOD_MAX_X = 10.5;
export const FOOD_MIN_Z = -8.5;
export const FOOD_MAX_Z = 8.5;

/** Protected gate lane for food: abs(x)<1.8 && z<-6.8. */
export const GATE_LANE_HALF_WIDTH = 1.8;
export const GATE_LANE_MAX_Z = -6.8;

export const SLIME_FOOTPRINT_RADIUS = 1.2;
export const MIN_SEPARATION = 2.4;
export const PROP_RADIUS = 0.5;
export const PROP_MOVEMENT_INFLATE = 1.2;
export const PROP_FOOD_EXCLUDE_PAD = 0.15;
export const PROP_MOVEMENT_RADIUS = PROP_RADIUS + PROP_MOVEMENT_INFLATE;
export const PROP_FOOD_EXCLUDE_RADIUS = PROP_RADIUS + PROP_FOOD_EXCLUDE_PAD;

export const GATE_OPENING_MIN_X = -1.8;
export const GATE_OPENING_MAX_X = 1.8;
export const GATE_OPENING_Z = -10;
export const GATE_STAGING = Object.freeze({ x: 0, z: -12 });
export const GATE_INSIDE_WAYPOINT = Object.freeze({ x: 0, z: -7 });

export const ARRIVAL_CORRIDOR_MIN_X = -0.6;
export const ARRIVAL_CORRIDOR_MAX_X = 0.6;
export const ARRIVAL_CORRIDOR_MIN_Z = -12;
export const ARRIVAL_CORRIDOR_MAX_Z = -8.8;

/** Keyboard / first-throw helper radius around a resident. */
export const NEAR_SELECTED_TARGET_RADIUS = 1.5;
export const FOOD_APPROACH_SAMPLE_COUNT = 16;

/**
 * Ten ordered home slots (plan 03 §2). Adjacent pair distance is 3;
 * required minimum is 2.4.
 */
export const HOME_SLOTS = Object.freeze([
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

export const STATIC_PROPS = Object.freeze([
  Object.freeze({ id: 'shrub', x: -10.8, z: -5.5, radius: PROP_RADIUS }),
  Object.freeze({ id: 'pantry', x: -10.8, z: 5.5, radius: PROP_RADIUS }),
  Object.freeze({ id: 'bloom', x: 10.8, z: -4.5, radius: PROP_RADIUS }),
]);

const EAT_APPROACH_MID = (EAT_APPROACH_MIN + EAT_APPROACH_MAX) / 2;
const EAT_APPROACH_RADII = Object.freeze([
  EAT_APPROACH_MIN,
  EAT_APPROACH_MID,
  EAT_APPROACH_MAX,
]);

/**
 * @param {unknown} point
 * @returns {point is PointXZ}
 */
export function isFinitePoint(point) {
  if (point === null || typeof point !== 'object' || Array.isArray(point)) {
    return false;
  }
  const x = /** @type {{ x?: unknown, z?: unknown }} */ (point).x;
  const z = /** @type {{ x?: unknown, z?: unknown }} */ (point).z;
  return typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z);
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @returns {number}
 */
export function pairDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Minimum pairwise home-slot distance. Designed ≥ 3; requirement is 2.4.
 *
 * @param {readonly PointXZ[]} [slots]
 * @returns {number}
 */
export function minHomeSlotSeparation(slots = HOME_SLOTS) {
  let min = Infinity;
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const distance = pairDistance(slots[i], slots[j]);
      if (distance < min) min = distance;
    }
  }
  return min;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function inClosedRange(value, min, max) {
  return value + GEOM_EPS >= min && value - GEOM_EPS <= max;
}

/**
 * @param {PointXZ} point
 * @param {PointXZ} center
 * @param {number} radius
 * @returns {boolean}
 */
function inDisk(point, center, radius) {
  return pairDistance(point, center) < radius + GEOM_EPS;
}

/**
 * @param {PointXZ} point
 * @returns {boolean}
 */
export function isInFoodRect(point) {
  return (
    inClosedRange(point.x, FOOD_MIN_X, FOOD_MAX_X) &&
    inClosedRange(point.z, FOOD_MIN_Z, FOOD_MAX_Z)
  );
}

/**
 * @param {PointXZ} point
 * @returns {boolean}
 */
export function isInProtectedGateLane(point) {
  return Math.abs(point.x) < GATE_LANE_HALF_WIDTH && point.z < GATE_LANE_MAX_Z;
}

/**
 * Arrival corridor is not a food target. Ordinary centers do not use it.
 *
 * @param {PointXZ} point
 * @returns {boolean}
 */
export function isInArrivalCorridor(point) {
  return (
    inClosedRange(point.x, ARRIVAL_CORRIDOR_MIN_X, ARRIVAL_CORRIDOR_MAX_X) &&
    inClosedRange(point.z, ARRIVAL_CORRIDOR_MIN_Z, ARRIVAL_CORRIDOR_MAX_Z)
  );
}

/**
 * @param {PointXZ} point
 * @returns {boolean}
 */
export function isInResidentDomain(point) {
  return (
    inClosedRange(point.x, RESIDENT_MIN_X, RESIDENT_MAX_X) &&
    inClosedRange(point.z, RESIDENT_MIN_Z, RESIDENT_MAX_Z)
  );
}

/**
 * @param {PointXZ} point
 * @returns {boolean}
 */
function hitsPropFoodExclusion(point) {
  for (const prop of STATIC_PROPS) {
    if (inDisk(point, prop, PROP_FOOD_EXCLUDE_RADIUS)) return true;
  }
  return false;
}

/**
 * @param {PointXZ} point
 * @returns {boolean}
 */
function hitsPropMovementInflation(point) {
  for (const prop of STATIC_PROPS) {
    if (inDisk(point, prop, PROP_MOVEMENT_RADIUS)) return true;
  }
  return false;
}

/**
 * Legal slime center: finite, in the resident domain, outside movement-inflated
 * static prop circles. Temporary residents are ignored (no dynamic actors).
 *
 * @param {unknown} point
 * @returns {boolean}
 */
export function isValidResidentCenter(point) {
  if (!isFinitePoint(point)) return false;
  if (!isInResidentDomain(point)) return false;
  if (hitsPropMovementInflation(point)) return false;
  return true;
}

/**
 * @param {PointXZ} food
 * @param {number} radius
 * @param {number} index
 * @returns {PointXZ}
 */
function approachSample(food, radius, index) {
  const angle = (index * 2 * Math.PI) / FOOD_APPROACH_SAMPLE_COUNT;
  return {
    x: food.x + radius * Math.cos(angle),
    z: food.z + radius * Math.sin(angle),
  };
}

/**
 * @param {PointXZ} food
 * @returns {boolean}
 */
function hasValidEatingApproach(food) {
  for (const radius of EAT_APPROACH_RADII) {
    for (let index = 0; index < FOOD_APPROACH_SAMPLE_COUNT; index += 1) {
      if (isValidResidentCenter(approachSample(food, radius, index))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Legal food landing point. Does not clamp invalid coordinates.
 * Dynamic actors are ignored so a player can throw near a slime.
 *
 * @param {unknown} point
 * @returns {boolean}
 */
export function isValidFoodTarget(point) {
  if (!isFinitePoint(point)) return false;
  if (!isInFoodRect(point)) return false;
  if (isInProtectedGateLane(point)) return false;
  if (isInArrivalCorridor(point)) return false;
  if (hitsPropFoodExclusion(point)) return false;
  return hasValidEatingApproach(point);
}

/**
 * @param {number} slot
 * @returns {PointXZ | null}
 */
export function homePosition(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= HOME_SLOTS.length) {
    return null;
  }
  const home = HOME_SLOTS[slot];
  return { x: home.x, z: home.z };
}

/**
 * @param {PointXZ} point
 * @param {readonly PointXZ[]} others
 * @param {number} [minSep]
 * @returns {boolean}
 */
export function isSeparatedFrom(point, others, minSep = MIN_SEPARATION) {
  for (const other of others) {
    if (!isFinitePoint(other)) continue;
    if (pairDistance(point, other) < minSep - GEOM_EPS) return false;
  }
  return true;
}

/**
 * Home slots first, then a bounded deterministic grid of legal centers.
 *
 * @returns {readonly PointXZ[]}
 */
function buildFreePositionCandidates() {
  /** @type {PointXZ[]} */
  const points = [];

  /**
   * @param {PointXZ} point
   */
  function add(point) {
    if (!isValidResidentCenter(point)) return;
    for (const existing of points) {
      if (pairDistance(point, existing) < GEOM_EPS) return;
    }
    points.push(Object.freeze({ x: point.x, z: point.z }));
  }

  for (const slot of HOME_SLOTS) add(slot);

  const xSpan = RESIDENT_MAX_X - RESIDENT_MIN_X;
  const zSpan = RESIDENT_MAX_Z - RESIDENT_MIN_Z;
  const xCount = 19;
  const zCount = 16;
  for (let zi = 0; zi < zCount; zi += 1) {
    const z = RESIDENT_MIN_Z + (zi * zSpan) / (zCount - 1);
    for (let xi = 0; xi < xCount; xi += 1) {
      const x = RESIDENT_MIN_X + (xi * xSpan) / (xCount - 1);
      add({ x, z });
    }
  }

  return Object.freeze(points);
}

const FREE_POSITION_CANDIDATES = buildFreePositionCandidates();

/**
 * Ordered scan list: home pads, then the deterministic interior grid.
 *
 * @returns {readonly PointXZ[]}
 */
export function freePositionCandidates() {
  return FREE_POSITION_CANDIDATES;
}

/**
 * First legal candidate clear of occupied/reserved footprints, or null.
 *
 * @param {FreePositionQuery} [query]
 * @returns {PointXZ | null}
 */
export function findFreePosition(query = {}) {
  const occupied = query.occupied ?? [];
  const reserved = query.reserved ?? [];
  const blockers = [...occupied, ...reserved];
  for (const candidate of FREE_POSITION_CANDIDATES) {
    if (!isSeparatedFrom(candidate, blockers)) continue;
    return { x: candidate.x, z: candidate.z };
  }
  return null;
}

export const FARM_LAYOUT = Object.freeze({
  id: HABITAT_ID_V2,
  fenceCenterlineX: FENCE_CENTERLINE_X,
  fenceCenterlineZ: FENCE_CENTERLINE_Z,
  interiorWidth: FARM_INTERIOR_WIDTH,
  interiorDepth: FARM_INTERIOR_DEPTH,
  homeSlots: HOME_SLOTS,
  staticProps: STATIC_PROPS,
  gateStaging: GATE_STAGING,
  gateInsideWaypoint: GATE_INSIDE_WAYPOINT,
  slimeFootprintRadius: SLIME_FOOTPRINT_RADIUS,
  minSeparation: MIN_SEPARATION,
});
