/**
 * Visual farm construction data derived from `world/layout.mjs`.
 * Collision/food/resident numbers stay in that module; this file must not
 * invent a second 24×20. No Three, DOM, or wall-clock APIs.
 */

import {
  FENCE_CENTERLINE_X,
  FENCE_CENTERLINE_Z,
  FARM_INTERIOR_DEPTH,
  FARM_INTERIOR_WIDTH,
  GATE_INSIDE_WAYPOINT,
  GATE_OPENING_MAX_X,
  GATE_OPENING_MIN_X,
  GATE_OPENING_Z,
  GATE_STAGING,
  HOME_SLOTS,
  PROP_RADIUS,
  STATIC_PROPS,
  isInResidentDomain,
} from '../world/layout.mjs';

/** Fence board height in world units (plan: 0.7–0.9). */
export const FENCE_HEIGHT = 0.8;
export const FENCE_FADE_OPACITY = 0.25;

/** Visible pad disc; pads are decoration, not collision. */
export const PAD_RADIUS = 0.55;
/** Small dormant mark for unpurchased slots — not a lock mesh. */
export const DORMANT_PAD_RADIUS = 0.26;

export const SHRUB_LEVEL_MIN = 0;
export const SHRUB_LEVEL_MAX = 3;

/**
 * Same extents as `world/layout.mjs`. Exported so tests can compare mesh
 * sizes to the collision module without a second hardcoded 24×20.
 */
export const FARM_VISUAL = Object.freeze({
  width: FARM_INTERIOR_WIDTH,
  depth: FARM_INTERIOR_DEPTH,
  fenceX: FENCE_CENTERLINE_X,
  fenceZ: FENCE_CENTERLINE_Z,
  gateOpeningMinX: GATE_OPENING_MIN_X,
  gateOpeningMaxX: GATE_OPENING_MAX_X,
  gateOpeningZ: GATE_OPENING_Z,
  propRadius: PROP_RADIUS,
});

/**
 * Perimeter rails. South wall (z = −10) is split around the real gate gap.
 *
 * @returns {readonly { id: string, side: 'north' | 'east' | 'west' | 'south', from: { x: number, z: number }, to: { x: number, z: number } }[]}
 */
export function fenceRailSegments() {
  const x = FENCE_CENTERLINE_X;
  const z = FENCE_CENTERLINE_Z;
  return Object.freeze([
    Object.freeze({
      id: 'north',
      side: /** @type {const} */ ('north'),
      from: Object.freeze({ x: -x, z }),
      to: Object.freeze({ x, z }),
    }),
    Object.freeze({
      id: 'east',
      side: /** @type {const} */ ('east'),
      from: Object.freeze({ x, z: -z }),
      to: Object.freeze({ x, z }),
    }),
    Object.freeze({
      id: 'west',
      side: /** @type {const} */ ('west'),
      from: Object.freeze({ x: -x, z: -z }),
      to: Object.freeze({ x: -x, z }),
    }),
    Object.freeze({
      id: 'south-west',
      side: /** @type {const} */ ('south'),
      from: Object.freeze({ x: -x, z: -z }),
      to: Object.freeze({ x: GATE_OPENING_MIN_X, z: GATE_OPENING_Z }),
    }),
    Object.freeze({
      id: 'south-east',
      side: /** @type {const} */ ('south'),
      from: Object.freeze({ x: GATE_OPENING_MAX_X, z: GATE_OPENING_Z }),
      to: Object.freeze({ x, z: -z }),
    }),
  ]);
}

/**
 * Gate posts sit on the gap edges. Not inside x ∈ (−1.8, +1.8).
 *
 * @returns {readonly { id: string, x: number, z: number }[]}
 */
export function gatePostPositions() {
  return Object.freeze([
    Object.freeze({ id: 'west', x: GATE_OPENING_MIN_X, z: GATE_OPENING_Z }),
    Object.freeze({ id: 'east', x: GATE_OPENING_MAX_X, z: GATE_OPENING_Z }),
  ]);
}

/**
 * Corner + mid-wall posts. Gate posts are listed separately.
 *
 * @returns {readonly { x: number, z: number }[]}
 */
export function fenceCornerAndMidPosts() {
  const x = FENCE_CENTERLINE_X;
  const z = FENCE_CENTERLINE_Z;
  return Object.freeze([
    Object.freeze({ x: -x, z: -z }),
    Object.freeze({ x, z: -z }),
    Object.freeze({ x, z }),
    Object.freeze({ x: -x, z }),
    Object.freeze({ x: -6, z }),
    Object.freeze({ x: 0, z }),
    Object.freeze({ x: 6, z }),
    Object.freeze({ x: -6, z: -z }),
    Object.freeze({ x: 6, z: -z }),
    Object.freeze({ x, z: -5 }),
    Object.freeze({ x, z: 0 }),
    Object.freeze({ x, z: 5 }),
    Object.freeze({ x: -x, z: -5 }),
    Object.freeze({ x: -x, z: 0 }),
    Object.freeze({ x: -x, z: 5 }),
  ]);
}

/**
 * Open leaves hinged at the gap posts, swinging outward (−Z) so the opening
 * stays clear.
 *
 * @returns {readonly { id: string, x: number, z: number, yaw: number }[]}
 */
export function gateLeafSpecs() {
  return Object.freeze([
    Object.freeze({ id: 'west', x: GATE_OPENING_MIN_X, z: GATE_OPENING_Z, yaw: 1.05 }),
    Object.freeze({ id: 'east', x: GATE_OPENING_MAX_X, z: GATE_OPENING_Z, yaw: -1.05 }),
  ]);
}

/**
 * Resting-area marker beside the north pad row. Visual / pick only — not a
 * static collision prop.
 *
 * @returns {{ x: number, z: number }}
 */
export function bedsMarkerPosition() {
  return { x: 0, z: 4.55 };
}

/**
 * Dirt stepping-stones from staging through the gate toward the pad field.
 *
 * @returns {readonly { x: number, z: number, radius: number }[]}
 */
export function dirtPathCenters() {
  return Object.freeze([
    Object.freeze({ x: GATE_STAGING.x, z: GATE_STAGING.z, radius: 0.72 }),
    Object.freeze({ x: 0.12, z: -11.05, radius: 0.64 }),
    Object.freeze({ x: 0, z: GATE_OPENING_Z, radius: 0.7 }),
    Object.freeze({ x: -0.22, z: -8.55, radius: 0.62 }),
    Object.freeze({ x: GATE_INSIDE_WAYPOINT.x, z: GATE_INSIDE_WAYPOINT.z, radius: 0.68 }),
    Object.freeze({ x: 0.38, z: -5.15, radius: 0.58 }),
    Object.freeze({ x: -0.28, z: -3.35, radius: 0.55 }),
    Object.freeze({ x: 0.08, z: -1.15, radius: 0.52 }),
  ]);
}

/**
 * Distant scenery, always outside the fence and resident domain.
 *
 * @returns {readonly { x: number, z: number }[]}
 */
export function distantBushPositions() {
  const x = FENCE_CENTERLINE_X + 2.55;
  const z = FENCE_CENTERLINE_Z + 2.35;
  return Object.freeze([
    Object.freeze({ x: -x, z }),
    Object.freeze({ x, z }),
    Object.freeze({ x: -x - 0.9, z: -z }),
    Object.freeze({ x: x + 0.9, z: -z }),
    Object.freeze({ x: -x - 1.1, z: 1.4 }),
    Object.freeze({ x: x + 1.1, z: -1.2 }),
  ]);
}

/**
 * @param {{ x: number, z: number }} point
 * @returns {boolean}
 */
export function isOutsideFence(point) {
  return (
    Math.abs(point.x) > FENCE_CENTERLINE_X + 1e-9 ||
    Math.abs(point.z) > FENCE_CENTERLINE_Z + 1e-9
  );
}

/**
 * @param {number} capacity
 * @returns {number}
 */
export function enabledPadCount(capacity) {
  const n = Math.floor(Number(capacity));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(HOME_SLOTS.length, n);
}

/**
 * @param {number} capacity
 * @param {number} index
 * @returns {boolean}
 */
export function padIsEnabled(capacity, index) {
  return index >= 0 && index < enabledPadCount(capacity);
}

/**
 * @param {number} level
 * @returns {number}
 */
export function clampShrubLevel(level) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n < SHRUB_LEVEL_MIN) return SHRUB_LEVEL_MIN;
  if (n > SHRUB_LEVEL_MAX) return SHRUB_LEVEL_MAX;
  return n;
}

/**
 * @param {{ x: number, z: number }} point
 * @returns {boolean}
 */
function tooCloseToService(point) {
  const pathHalf = 1.15;
  if (Math.abs(point.x) < pathHalf && point.z < -0.4) return true;
  if (Math.abs(point.x) < GATE_OPENING_MAX_X + 0.45 && point.z < GATE_OPENING_Z + 1.6) {
    return true;
  }
  for (const slot of HOME_SLOTS) {
    if (Math.hypot(point.x - slot.x, point.z - slot.z) < 1.15) return true;
  }
  for (const prop of STATIC_PROPS) {
    if (Math.hypot(point.x - prop.x, point.z - prop.z) < 1.25) return true;
  }
  const beds = bedsMarkerPosition();
  if (Math.hypot(point.x - beds.x, point.z - beds.z) < 0.9) return true;
  return false;
}

/**
 * Sparse edge tufts inside the fence. Decorative; not pick targets.
 *
 * @returns {readonly { x: number, z: number }[]}
 */
export function decorativeGrassPatches() {
  const inset = 0.9;
  const xMin = -FENCE_CENTERLINE_X + inset;
  const xMax = FENCE_CENTERLINE_X - inset;
  const zMin = -FENCE_CENTERLINE_Z + inset;
  const zMax = FENCE_CENTERLINE_Z - inset;
  /** @type {{ x: number, z: number }[]} */
  const points = [];
  const step = 1.7;
  for (let x = xMin; x <= xMax + 1e-6; x += step) {
    points.push({ x, z: zMin }, { x, z: zMax });
  }
  for (let z = zMin + step; z <= zMax - step + 1e-6; z += step) {
    points.push({ x: xMin, z }, { x: xMax, z });
  }
  return Object.freeze(
    points.filter((point) => !tooCloseToService(point)).map((point) => Object.freeze(point)),
  );
}

/**
 * Tiny flower accents along the inner edge. Height stays under 0.15.
 *
 * @returns {readonly { x: number, z: number }[]}
 */
export function decorativeFlowerPatches() {
  const grass = decorativeGrassPatches();
  /** @type {{ x: number, z: number }[]} */
  const points = [];
  for (let i = 0; i < grass.length; i += 3) {
    const g = grass[i];
    const inwardX = g.x * 0.92;
    const inwardZ = g.z * 0.92;
    if (tooCloseToService({ x: inwardX, z: inwardZ })) continue;
    points.push(Object.freeze({ x: inwardX, z: inwardZ }));
  }
  return Object.freeze(points);
}

/**
 * @param {readonly { x: number, z: number }[]} [positions]
 * @returns {boolean}
 */
export function distantBushesAreOutside(positions = distantBushPositions()) {
  for (const bush of positions) {
    if (!isOutsideFence(bush)) return false;
    if (isInResidentDomain(bush)) return false;
  }
  return true;
}
