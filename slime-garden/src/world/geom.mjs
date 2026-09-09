/**
 * Pure 2D swept geometry for farm navigation. No Three, DOM, clocks, or RNG.
 * Scene `motion.mjs` point-to-segment helpers are v1 cosmetic; this module is
 * the world-authority copy for phase-2 planning.
 */

import { GEOM_EPS } from '../core/balance.mjs';

/**
 * @typedef {{ x: number, z: number }} PointXZ
 */

const LEN2_EPS = 1e-12;

/**
 * @param {PointXZ} point
 * @returns {PointXZ}
 */
export function copyPoint(point) {
  return { x: point.x, z: point.z };
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @returns {boolean}
 */
export function samePoint(a, b) {
  return Math.abs(a.x - b.x) <= GEOM_EPS && Math.abs(a.z - b.z) <= GEOM_EPS;
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @returns {number}
 */
export function segmentLength(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * Euclidean polyline length (sum of segment hypotenuses).
 *
 * @param {readonly PointXZ[]} points
 * @returns {number}
 */
export function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += segmentLength(points[index - 1], points[index]);
  }
  return length;
}

/**
 * Distance from `point` to closed segment ab.
 *
 * @param {PointXZ} point
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @returns {number}
 */
export function pointToSegmentDistance(point, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 <= LEN2_EPS) {
    return Math.hypot(point.x - a.x, point.z - a.z);
  }
  let t = ((point.x - a.x) * abx + (point.z - a.z) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + t * abx), point.z - (a.z + t * abz));
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Distance between closed segments ab and cd. Crossing segments have
 * distance 0. Degenerate (point) segments are allowed.
 *
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @param {PointXZ} c
 * @param {PointXZ} d
 * @returns {number}
 */
export function segmentSegmentDistance(a, b, c, d) {
  const d1x = b.x - a.x;
  const d1z = b.z - a.z;
  const d2x = d.x - c.x;
  const d2z = d.z - c.z;
  const rx = a.x - c.x;
  const rz = a.z - c.z;
  const aa = d1x * d1x + d1z * d1z;
  const ee = d2x * d2x + d2z * d2z;
  const ff = d2x * rx + d2z * rz;

  let s;
  let t;
  if (aa <= LEN2_EPS && ee <= LEN2_EPS) {
    return Math.hypot(rx, rz);
  }
  if (aa <= LEN2_EPS) {
    s = 0;
    t = clamp(ff / ee, 0, 1);
  } else {
    const cc = d1x * rx + d1z * rz;
    if (ee <= LEN2_EPS) {
      t = 0;
      s = clamp(-cc / aa, 0, 1);
    } else {
      const bb = d1x * d2x + d1z * d2z;
      const denom = aa * ee - bb * bb;
      if (denom > LEN2_EPS || denom < -LEN2_EPS) {
        s = clamp((bb * ff - cc * ee) / denom, 0, 1);
      } else {
        s = 0;
      }
      t = (bb * s + ff) / ee;
      if (t < 0) {
        t = 0;
        s = clamp(-cc / aa, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((bb - cc) / aa, 0, 1);
      }
    }
  }
  const dx = a.x + s * d1x - (c.x + t * d2x);
  const dz = a.z + s * d1z - (c.z + t * d2z);
  return Math.hypot(dx, dz);
}

/**
 * Minimum segment-segment distance between two polylines. A 1-point polyline
 * is treated as a degenerate segment.
 *
 * @param {readonly PointXZ[]} pointsA
 * @param {readonly PointXZ[]} pointsB
 * @returns {number}
 */
export function polylinePolylineDistance(pointsA, pointsB) {
  if (pointsA.length === 0 || pointsB.length === 0) return Infinity;
  let min = Infinity;
  const countA = Math.max(1, pointsA.length - 1);
  const countB = Math.max(1, pointsB.length - 1);
  for (let i = 0; i < countA; i += 1) {
    const a0 = pointsA[i];
    const a1 = pointsA[Math.min(i + 1, pointsA.length - 1)];
    for (let j = 0; j < countB; j += 1) {
      const b0 = pointsB[j];
      const b1 = pointsB[Math.min(j + 1, pointsB.length - 1)];
      const dist = segmentSegmentDistance(a0, a1, b0, b1);
      if (dist < min) min = dist;
    }
  }
  return min;
}
