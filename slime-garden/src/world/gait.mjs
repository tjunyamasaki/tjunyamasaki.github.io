/**
 * Authoritative world gait and polyline progress. Same travel-phase shape as
 * scene motion (0.29–0.68 smoothstep) with stride 1.0, not the v1 0.65 cosmetic
 * scale. Pure: no DOM, Three, wall-clock APIs, randomness, or scene.
 */

import { GAIT_CYCLE_MS, GEOM_EPS, STRIDE_UNITS } from '../core/balance.mjs';
import { copyPoint, segmentLength } from './geom.mjs';

/**
 * @typedef {{ x: number, z: number }} PointXZ
 * @typedef {{ position: PointXZ, yaw: number, segmentIndex: number }} PolylinePose
 */

export const TRAVEL_PHASE_START = 0.29;
export const TRAVEL_PHASE_END = 0.68;

/**
 * @param {number} t Unclamped.
 * @returns {number}
 */
export function smoothstep01(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/**
 * @param {number} length
 * @param {number} [stride]
 * @returns {number}
 */
export function gaitCycleCount(length, stride = STRIDE_UNITS) {
  if (!(length > 0)) return 1;
  const units = stride > 0 ? stride : STRIDE_UNITS;
  return Math.max(1, Math.ceil(length / units));
}

/**
 * Fraction of path length completed after `elapsedMs` of world time.
 * Hold (no translation) outside phase 0.29–0.68 of each 1250 ms cycle.
 *
 * @param {number} elapsedMs
 * @param {number} cycleCount
 * @returns {number}
 */
export function gaitFraction(elapsedMs, cycleCount) {
  const cycles = Math.max(1, cycleCount);
  const total = cycles * GAIT_CYCLE_MS;
  if (!(elapsedMs > 0)) return 0;
  if (elapsedMs >= total) return 1;
  const raw = elapsedMs / GAIT_CYCLE_MS;
  const cycleIndex = Math.min(cycles - 1, Math.floor(raw));
  const phase = raw - Math.floor(raw);
  const span = TRAVEL_PHASE_END - TRAVEL_PHASE_START;
  const u = smoothstep01((phase - TRAVEL_PHASE_START) / span);
  return (cycleIndex + u) / cycles;
}

/**
 * Face looks toward local +Z; travel (dx, dz) → yaw atan2(dx, dz).
 *
 * @param {number} dx
 * @param {number} dz
 * @returns {number}
 */
export function yawFromDirection(dx, dz) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return Math.atan2(dx, dz);
}

/**
 * Normalize to (−π, π].
 *
 * @param {number} yaw
 * @returns {number}
 */
export function normalizeYaw(yaw) {
  if (!Number.isFinite(yaw)) return 0;
  const tau = Math.PI * 2;
  let wrapped = ((yaw + Math.PI) % tau + tau) % tau - Math.PI;
  if (wrapped <= -Math.PI) wrapped += tau;
  return wrapped;
}

/**
 * Position at cumulative arc length `distance`. Does not skip segments.
 *
 * @param {readonly PointXZ[]} points
 * @param {number} distance
 * @returns {PolylinePose}
 */
export function poseAlongPolyline(points, distance) {
  if (!Array.isArray(points) || points.length === 0) {
    return { position: { x: 0, z: 0 }, yaw: 0, segmentIndex: 0 };
  }
  if (points.length === 1) {
    return { position: copyPoint(points[0]), yaw: 0, segmentIndex: 0 };
  }
  const first = points[0];
  const second = points[1];
  const startYaw = normalizeYaw(yawFromDirection(second.x - first.x, second.z - first.z));
  if (!(distance > GEOM_EPS)) {
    return { position: copyPoint(first), yaw: startYaw, segmentIndex: 0 };
  }
  let remaining = distance;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = segmentLength(a, b);
    const isLast = index === points.length - 1;
    if (remaining <= length + GEOM_EPS || isLast) {
      const t = length > GEOM_EPS ? Math.max(0, Math.min(1, remaining / length)) : 1;
      const yaw = normalizeYaw(yawFromDirection(b.x - a.x, b.z - a.z));
      if (isLast && remaining >= length - GEOM_EPS) {
        return { position: copyPoint(b), yaw, segmentIndex: index - 1 };
      }
      return {
        position: {
          x: a.x + t * (b.x - a.x),
          z: a.z + t * (b.z - a.z),
        },
        yaw,
        segmentIndex: index - 1,
      };
    }
    remaining -= length;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return {
    position: copyPoint(last),
    yaw: normalizeYaw(yawFromDirection(last.x - prev.x, last.z - prev.z)),
    segmentIndex: points.length - 2,
  };
}
