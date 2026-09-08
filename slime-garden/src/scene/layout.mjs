/**
 * Provisional garden layout in the approved slime’s original world units.
 * Economy code must not import this module; it knows capacity and slot indices only.
 */

import { HABITAT_ID } from '../core/balance.mjs';
import { BODY_BOUNDS_CENTER, BODY_BOUNDS_RADIUS } from './slime-pose.mjs';

/** @typedef {{ x: number, z: number }} PointXZ */

export const HABITAT_RADIUS = 5.8;
export const WALK_RADIUS = 4.5;
export const SLIME_FOOTPRINT_RADIUS = 1.2;
/** Center-to-center clearance: two footprints. */
export const MIN_SEPARATION = 2.4;
export const WANDER_HOME_RADIUS = 0.8;
export const GAIT_UNITS_PER_CYCLE = 0.65;
export const TRAVEL_PHASE_START = 0.29;
export const TRAVEL_PHASE_END = 0.68;
export const WANDER_DELAY_MIN_SEC = 5;
export const WANDER_DELAY_MAX_SEC = 12;
export const MAX_WANDER_ATTEMPTS = 8;
export const MIN_WANDER_DISTANCE = 0.18;

export const SLOT_MARGIN = 1.4;
export const FRAME_PADDING = 1.1;
export const VFOV_DEG = 35;
export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 60;
export const CAMERA_YAW = 0;
export const CAMERA_PITCH = 0.65;
export const CAMERA_TARGET = Object.freeze({ x: 0, y: 0.65, z: 0 });
export const DRAG_THRESHOLD_PX = 6;
/** Floor disk is bounded; not the comparison preview’s 200×200 plane. */
export const FLOOR_RADIUS = 7.2;

export const HOME_SLOTS = Object.freeze([
  Object.freeze({ x: 0.0, z: 1.8 }),
  Object.freeze({ x: -2.8, z: 1.8 }),
  Object.freeze({ x: 2.8, z: 1.8 }),
  Object.freeze({ x: -2.8, z: -1.0 }),
  Object.freeze({ x: 0.0, z: -1.0 }),
  Object.freeze({ x: 2.8, z: -1.0 }),
]);

export const ENTRY_POINT = Object.freeze({ x: 0, z: -5.0 });
export const FOOD_POINT = Object.freeze({ x: 0, z: 4.8 });
export const SHRUB_POINT = Object.freeze({ x: -4, z: -3.2 });

/**
 * @type {Readonly<{
 *   id: string,
 *   walkRadius: number,
 *   slimeFootprintRadius: number,
 *   homeSlots: readonly PointXZ[],
 *   wanderSlots: readonly PointXZ[],
 *   entryPoint: PointXZ,
 *   foodPoint: PointXZ,
 *   cameraTarget: { x: number, y: number, z: number },
 * }>}
 */
export const GARDEN_LAYOUT = Object.freeze({
  id: HABITAT_ID,
  walkRadius: WALK_RADIUS,
  slimeFootprintRadius: SLIME_FOOTPRINT_RADIUS,
  homeSlots: HOME_SLOTS,
  wanderSlots: HOME_SLOTS,
  entryPoint: ENTRY_POINT,
  foodPoint: FOOD_POINT,
  cameraTarget: CAMERA_TARGET,
});

/**
 * @param {number} capacity
 * @returns {readonly PointXZ[]}
 */
export function enabledHomeSlots(capacity) {
  const n = Math.max(1, Math.min(HOME_SLOTS.length, Math.floor(capacity) || 1));
  return HOME_SLOTS.slice(0, n);
}

/**
 * @param {PointXZ} point
 * @returns {number}
 */
export function distanceFromOrigin(point) {
  return Math.hypot(point.x, point.z);
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @returns {number}
 */
export function distanceXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} [radius]
 * @returns {boolean}
 */
export function isInsideWalkRadius(x, z, radius = WALK_RADIUS) {
  return Math.hypot(x, z) <= radius;
}

/**
 * Home pads must not overlap footprints and must sit inside the walk disk.
 * @returns {{ ok: boolean, minPairDistance: number, maxSlotRadius: number, issues: string[] }}
 */
export function validateHomeSlots() {
  /** @type {string[]} */
  const issues = [];
  let minPairDistance = Infinity;
  let maxSlotRadius = 0;
  for (let i = 0; i < HOME_SLOTS.length; i++) {
    const slot = HOME_SLOTS[i];
    const r = distanceFromOrigin(slot);
    if (r > maxSlotRadius) maxSlotRadius = r;
    if (r > WALK_RADIUS + 1e-9) {
      issues.push(`slot ${i} center sits outside the walk radius`);
    }
    for (let j = i + 1; j < HOME_SLOTS.length; j++) {
      const d = distanceXZ(slot, HOME_SLOTS[j]);
      if (d < minPairDistance) minPairDistance = d;
      if (d < MIN_SEPARATION - 1e-9) {
        issues.push(`slots ${i} and ${j} overlap (${d.toFixed(3)} < ${MIN_SEPARATION})`);
      }
    }
  }
  const props = [
    ['entry', ENTRY_POINT],
    ['basket', FOOD_POINT],
    ['shrub', SHRUB_POINT],
  ];
  for (const [name, point] of props) {
    if (distanceFromOrigin(point) <= WALK_RADIUS) {
      issues.push(`${name} sits inside the walk corridor`);
    }
  }
  return {
    ok: issues.length === 0,
    minPairDistance: minPairDistance === Infinity ? 0 : minPairDistance,
    maxSlotRadius,
    issues,
  };
}

/**
 * Fit distance so every enabled home slot plus `margin` sits in both the
 * vertical FOV and the aspect-derived horizontal FOV. Does not scale
 * distance by screen width alone.
 *
 * @param {number} aspect
 * @param {number} fovDeg
 * @param {number} yaw
 * @param {number} pitch
 * @param {{ x: number, y: number, z: number }} target
 * @param {readonly PointXZ[]} slots
 * @param {number} [margin]
 * @param {number} [padding]
 * @returns {number}
 */
export function fitDistanceForSlots(
  aspect,
  fovDeg,
  yaw,
  pitch,
  target,
  slots,
  margin = SLOT_MARGIN,
  padding = FRAME_PADDING,
) {
  const vFov = (fovDeg * Math.PI) / 180;
  const tanV = Math.tan(vFov / 2);
  const tanH = tanV * Math.max(1e-6, aspect);
  const dirX = Math.sin(yaw) * Math.cos(pitch);
  const dirY = Math.sin(pitch);
  const dirZ = Math.cos(yaw) * Math.cos(pitch);
  let rx = dirZ;
  let ry = 0;
  let rz = -dirX;
  const rLen = Math.hypot(rx, ry, rz) || 1;
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;
  const ux = dirY * rz - dirZ * ry;
  const uy = dirZ * rx - dirX * rz;
  const uz = dirX * ry - dirY * rx;
  const yMin = 0;
  const yMax = BODY_BOUNDS_CENTER[1] + BODY_BOUNDS_RADIUS;
  let dMin = 0.5;
  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s];
    for (const dx of [-margin, margin]) {
      for (const dz of [-margin, margin]) {
        for (const y of [yMin, yMax]) {
          const qx = slot.x + dx - target.x;
          const qy = y - target.y;
          const qz = slot.z + dz - target.z;
          const rightComp = qx * rx + qy * ry + qz * rz;
          const upComp = qx * ux + qy * uy + qz * uz;
          const alongDir = qx * dirX + qy * dirY + qz * dirZ;
          dMin = Math.max(dMin, alongDir + Math.abs(rightComp) / tanH);
          dMin = Math.max(dMin, alongDir + Math.abs(upComp) / tanV);
        }
      }
    }
  }
  return dMin * padding;
}

/**
 * @param {{ position: { set: Function }, lookAt: Function }} camera
 * @param {number} yaw
 * @param {number} pitch
 * @param {number} distance
 * @param {{ x: number, y: number, z: number }} target
 */
export function placeCamera(camera, yaw, pitch, distance, target) {
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  );
  camera.lookAt(target.x, target.y, target.z);
}

/**
 * Gameplay fog sits farther than the comparison preview so distant residents
 * stay readable after the camera pulls back.
 *
 * @param {{ near: number, far: number }} fog
 * @param {number} distance
 */
export function setGameplayFog(fog, distance) {
  fog.near = Math.max(20, distance * 1.5);
  fog.far = Math.max(45, distance * 3);
}
