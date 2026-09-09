/**
 * Phase-2 spherical camera rig: overview fit, zoom, orbit, pan, pinch, focus.
 * Session UI state only — never saved, never imports GameState / applyCommand.
 *
 * Pitch default is 0.72 rad (not v1 CAMERA_PITCH 0.65). Live `/slime-garden/`
 * still uses the v1 fixed camera in scene.mjs until P2-13.
 */

import {
  FENCE_CENTERLINE_X,
  FENCE_CENTERLINE_Z,
  GATE_STAGING,
  HOME_SLOTS,
  RESIDENT_MAX_X,
  RESIDENT_MAX_Z,
  RESIDENT_MIN_X,
  RESIDENT_MIN_Z,
} from '../world/layout.mjs';
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  CAMERA_TARGET,
  FRAME_PADDING,
  fitDistanceForSlots,
  placeCamera,
  SLOT_MARGIN,
  VFOV_DEG,
} from './layout.mjs';
import { BODY_BOUNDS_CENTER } from './slime-pose.mjs';

/** Same gain as v1 scene.mjs (`1 - exp(-k * dt)`). */
export const CAMERA_DAMP = 4;

export const PHASE2_VFOV_DEG = VFOV_DEG;
export const PHASE2_CAMERA_NEAR = CAMERA_NEAR;
export const PHASE2_CAMERA_YAW = 0;
/** Phase-2 overview pitch. Do not reuse v1 `CAMERA_PITCH` (0.65). */
export const PHASE2_CAMERA_PITCH = 0.72;
export const PITCH_MIN = 0.35;
export const PITCH_MAX = 1.15;
export const DISTANCE_MIN = 5.8;
export const DISTANCE_MAX_FLOOR = 60;
/** Overview look-at height; pan keeps this unless a resident is focused. */
export const TARGET_Y_OVERVIEW = CAMERA_TARGET.y;
/**
 * Body-center height when focusing a resident (`BODY_BOUNDS_CENTER.y`).
 * Copied once; later resident motion is not followed.
 */
export const FOCUS_TARGET_Y = BODY_BOUNDS_CENTER[1];
export const SCENERY_FAR_SLACK = 40;

/**
 * Inspection-page-like orbit. Yaw decreases as the pointer moves right so the
 * farm follows the drag; pitch increases as the pointer moves down.
 */
export const ORBIT_YAW_PER_PX = 0.008;
export const ORBIT_PITCH_PER_PX = 0.006;

export const WHEEL_DELTA_PIXEL = 0;
export const WHEEL_DELTA_LINE = 1;
export const WHEEL_DELTA_PAGE = 2;
/** DOM-ish line height used to convert `deltaMode === 1`. */
export const WHEEL_LINE_PX = 16;
/** Page-unit conversion before the per-tick clamp. */
export const WHEEL_PAGE_PX = 400;
/** Bound one wheel/button tick so it cannot jump min↔max. */
export const WHEEL_DELTA_CLAMP_PX = 100;
export const ZOOM_EXP_GAIN = 0.001;
/** One +/− key/button step equals one clamped pixel-mode wheel tick. */
export const BUTTON_ZOOM_DELTA_PX = WHEEL_DELTA_CLAMP_PX;

const TWO_PI = Math.PI * 2;
const MIN_ASPECT = 1e-6;
const MIN_HOST_CSS = 1e-6;

/**
 * Fence corners, gate staging, and the ten homes. `fitDistanceForSlots` adds
 * actor height (`BODY_BOUNDS_CENTER.y + BODY_BOUNDS_RADIUS`) and the existing
 * slot-margin / 1.1 frame-padding (~10%) style.
 *
 * @returns {readonly { x: number, z: number }[]}
 */
export function farmOverviewPoints() {
  return [
    { x: -FENCE_CENTERLINE_X, z: -FENCE_CENTERLINE_Z },
    { x: FENCE_CENTERLINE_X, z: -FENCE_CENTERLINE_Z },
    { x: -FENCE_CENTERLINE_X, z: FENCE_CENTERLINE_Z },
    { x: FENCE_CENTERLINE_X, z: FENCE_CENTERLINE_Z },
    { x: GATE_STAGING.x, z: GATE_STAGING.z },
    ...HOME_SLOTS.map((slot) => ({ x: slot.x, z: slot.z })),
  ];
}

/**
 * @param {number} n
 * @param {number} fallback
 * @returns {number}
 */
function finiteOr(n, fallback) {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * @param {number} deltaY
 * @param {number} [deltaMode]
 * @param {number} [pagePx]
 * @returns {number}
 */
export function normalizeWheelDeltaY(deltaY, deltaMode = WHEEL_DELTA_PIXEL, pagePx = WHEEL_PAGE_PX) {
  if (!Number.isFinite(deltaY)) return 0;
  if (deltaMode === WHEEL_DELTA_LINE) return deltaY * WHEEL_LINE_PX;
  if (deltaMode === WHEEL_DELTA_PAGE) return deltaY * pagePx;
  return deltaY;
}

/**
 * @param {number} normalizedPx
 * @returns {number}
 */
export function clampWheelDeltaY(normalizedPx) {
  if (!Number.isFinite(normalizedPx)) return 0;
  return clamp(normalizedPx, -WHEEL_DELTA_CLAMP_PX, WHEEL_DELTA_CLAMP_PX);
}

/**
 * Shared wheel/button zoom factor: `exp(clampedDeltaY * 0.001)`.
 *
 * @param {number} deltaY
 * @param {number} [deltaMode]
 * @param {number} [pagePx]
 * @returns {number}
 */
export function zoomFactorFromWheel(deltaY, deltaMode = WHEEL_DELTA_PIXEL, pagePx = WHEEL_PAGE_PX) {
  return Math.exp(clampWheelDeltaY(normalizeWheelDeltaY(deltaY, deltaMode, pagePx)) * ZOOM_EXP_GAIN);
}

/**
 * @param {number} current
 * @param {number} target
 * @returns {number}
 */
function nearestEquivalentYaw(current, target) {
  let yaw = finiteOr(current, 0);
  const goal = finiteOr(target, 0);
  while (yaw - goal > Math.PI) yaw -= TWO_PI;
  while (goal - yaw > Math.PI) yaw += TWO_PI;
  return yaw;
}

/**
 * Old dual-FOV fit for the farm (vertical FOV and aspect-derived horizontal
 * FOV). Does not scale distance by width alone.
 *
 * @param {number} aspect
 * @returns {number}
 */
export function fitFarmOverviewDistance(aspect) {
  const safeAspect = Math.max(MIN_ASPECT, finiteOr(aspect, 16 / 9));
  const d = fitDistanceForSlots(
    safeAspect,
    VFOV_DEG,
    PHASE2_CAMERA_YAW,
    PHASE2_CAMERA_PITCH,
    CAMERA_TARGET,
    farmOverviewPoints(),
    SLOT_MARGIN,
    FRAME_PADDING,
  );
  if (!Number.isFinite(d)) return DISTANCE_MIN;
  return Math.max(DISTANCE_MIN, d);
}

/**
 * @param {number} aspect
 * @returns {number}
 */
export function maxDistanceForAspect(aspect) {
  const fit = fitFarmOverviewDistance(aspect);
  const max = Math.max(DISTANCE_MAX_FLOOR, 1.5 * fit);
  return Number.isFinite(max) ? max : DISTANCE_MAX_FLOOR;
}

/**
 * @param {number} [x]
 * @param {number} [z]
 * @returns {{ x: number, z: number }}
 */
export function clampPanTarget(x, z) {
  return {
    x: clamp(finiteOr(x, 0), RESIDENT_MIN_X, RESIDENT_MAX_X),
    z: clamp(finiteOr(z, 0), RESIDENT_MIN_Z, RESIDENT_MAX_Z),
  };
}

/**
 * @typedef {object} CameraView
 * @property {number} yaw
 * @property {number} pitch
 * @property {number} distance
 * @property {{ x: number, y: number, z: number }} target
 * @property {'overview' | 'custom'} framing
 */

/**
 * @typedef {object} CameraRigOptions
 * @property {() => number} [getAspect]
 * @property {boolean} [reducedMotion]
 * @property {number} [widthCss]
 * @property {number} [heightCss]
 */

/**
 * @param {CameraRigOptions} [options]
 */
export function createCameraRig(options = {}) {
  const getAspect = typeof options.getAspect === 'function' ? options.getAspect : null;
  let reducedMotion = Boolean(options.reducedMotion);
  let widthCss = finiteOr(options.widthCss, 1280);
  let heightCss = finiteOr(options.heightCss, 720);
  if (widthCss <= 0) widthCss = 1280;
  if (heightCss <= 0) heightCss = 720;

  let framing = /** @type {'overview' | 'custom'} */ ('overview');
  let currentYaw = PHASE2_CAMERA_YAW;
  let desiredYaw = PHASE2_CAMERA_YAW;
  let currentPitch = PHASE2_CAMERA_PITCH;
  let desiredPitch = PHASE2_CAMERA_PITCH;
  let currentDistance = DISTANCE_MIN;
  let desiredDistance = DISTANCE_MIN;
  const currentTarget = {
    x: CAMERA_TARGET.x,
    y: TARGET_Y_OVERVIEW,
    z: CAMERA_TARGET.z,
  };
  const desiredTarget = {
    x: CAMERA_TARGET.x,
    y: TARGET_Y_OVERVIEW,
    z: CAMERA_TARGET.z,
  };

  function aspectNow() {
    if (widthCss > MIN_HOST_CSS && heightCss > MIN_HOST_CSS) {
      const a = widthCss / heightCss;
      if (Number.isFinite(a) && a > 0) return a;
    }
    if (getAspect) {
      const a = getAspect();
      if (Number.isFinite(a) && a > 0) return a;
    }
    return 16 / 9;
  }

  function overviewFit() {
    return fitFarmOverviewDistance(aspectNow());
  }

  function distanceMax() {
    return maxDistanceForAspect(aspectNow());
  }

  function clampDistance(distance) {
    return clamp(finiteOr(distance, DISTANCE_MIN), DISTANCE_MIN, distanceMax());
  }

  function clampPitch(pitch) {
    return clamp(finiteOr(pitch, PHASE2_CAMERA_PITCH), PITCH_MIN, PITCH_MAX);
  }

  function applyTargetClamp(keepY) {
    const xz = clampPanTarget(desiredTarget.x, desiredTarget.z);
    desiredTarget.x = xz.x;
    desiredTarget.z = xz.z;
    desiredTarget.y = finiteOr(keepY, desiredTarget.y);
    if (!Number.isFinite(desiredTarget.y)) desiredTarget.y = TARGET_Y_OVERVIEW;
  }

  function snapCurrentToDesired() {
    currentYaw = desiredYaw;
    currentPitch = desiredPitch;
    currentDistance = desiredDistance;
    currentTarget.x = desiredTarget.x;
    currentTarget.y = desiredTarget.y;
    currentTarget.z = desiredTarget.z;
  }

  function maybeSnap() {
    if (reducedMotion) snapCurrentToDesired();
  }

  function markCustom() {
    framing = 'custom';
  }

  function refitOverviewDistance() {
    desiredDistance = clampDistance(overviewFit());
    desiredYaw = PHASE2_CAMERA_YAW;
    currentYaw = nearestEquivalentYaw(currentYaw, desiredYaw);
    desiredPitch = PHASE2_CAMERA_PITCH;
    desiredTarget.x = CAMERA_TARGET.x;
    desiredTarget.y = TARGET_Y_OVERVIEW;
    desiredTarget.z = CAMERA_TARGET.z;
    applyTargetClamp(TARGET_Y_OVERVIEW);
    maybeSnap();
  }

  refitOverviewDistance();
  snapCurrentToDesired();
  framing = 'overview';

  /**
   * @returns {CameraView}
   */
  function getView() {
    return {
      yaw: currentYaw,
      pitch: currentPitch,
      distance: currentDistance,
      target: { x: currentTarget.x, y: currentTarget.y, z: currentTarget.z },
      framing,
    };
  }

  function farPlane() {
    const maxD = distanceMax();
    const far = Math.max(CAMERA_FAR, maxD + SCENERY_FAR_SLACK, currentDistance + 24);
    return Number.isFinite(far) && far > 0 ? far : CAMERA_FAR;
  }

  /**
   * Duck-typed Three PerspectiveCamera (or a test stub).
   *
   * @param {{
   *   position?: { set: Function },
   *   lookAt?: Function,
   *   fov?: number,
   *   near?: number,
   *   far?: number,
   *   aspect?: number,
   *   updateProjectionMatrix?: Function,
   * }} threeCamera
   */
  function applyTo(threeCamera) {
    if (!threeCamera) return;
    const view = getView();
    if (typeof threeCamera.fov === 'number') threeCamera.fov = PHASE2_VFOV_DEG;
    if (typeof threeCamera.near === 'number') threeCamera.near = PHASE2_CAMERA_NEAR;
    if (typeof threeCamera.far === 'number') threeCamera.far = farPlane();
    if (typeof threeCamera.aspect === 'number') threeCamera.aspect = aspectNow();
    threeCamera.updateProjectionMatrix?.();
    if (threeCamera.position && typeof threeCamera.lookAt === 'function') {
      placeCamera(threeCamera, view.yaw, view.pitch, view.distance, view.target);
    }
  }

  /**
   * @param {number} dxCss
   * @param {number} dyCss
   */
  function orbit(dxCss, dyCss) {
    const dx = finiteOr(dxCss, 0);
    const dy = finiteOr(dyCss, 0);
    if (dx === 0 && dy === 0) return;
    desiredYaw -= dx * ORBIT_YAW_PER_PX;
    desiredPitch = clampPitch(desiredPitch + dy * ORBIT_PITCH_PER_PX);
    markCustom();
    maybeSnap();
  }

  /**
   * Ground-plane pan. Screen-right follows camera right; screen-down follows
   * camera-forward projected on XZ. Units per CSS px ≈
   * `2 * distance * tan(vfov/2) / viewportHeight`.
   *
   * @param {number} dxCss
   * @param {number} dyCss
   */
  function pan(dxCss, dyCss) {
    const dx = finiteOr(dxCss, 0);
    const dy = finiteOr(dyCss, 0);
    if (dx === 0 && dy === 0) return;
    const height = Math.max(1, heightCss);
    const vfov = (PHASE2_VFOV_DEG * Math.PI) / 180;
    const unitsPerPx = (2 * desiredDistance * Math.tan(vfov / 2)) / height;
    const yaw = desiredYaw;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    desiredTarget.x -= (rightX * dx - fwdX * dy) * unitsPerPx;
    desiredTarget.z -= (rightZ * dx - fwdZ * dy) * unitsPerPx;
    applyTargetClamp(desiredTarget.y);
    markCustom();
    maybeSnap();
  }

  /**
   * @param {number} factor
   */
  function zoomByFactor(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (factor === 1) return;
    desiredDistance = clampDistance(desiredDistance * factor);
    markCustom();
    maybeSnap();
  }

  /**
   * Wheel-style zoom. Objects with `ctrlKey`/`metaKey` are ignored (browser zoom).
   * A number is treated as pixel-mode `deltaY` unless `deltaMode` is passed.
   *
   * @param {number | { deltaY?: number, deltaMode?: number, ctrlKey?: boolean, metaKey?: boolean }} deltaYOrEvent
   * @param {number} [deltaMode]
   */
  function zoom(deltaYOrEvent, deltaMode) {
    if (deltaYOrEvent && typeof deltaYOrEvent === 'object') {
      if (deltaYOrEvent.ctrlKey || deltaYOrEvent.metaKey) return;
      zoomByFactor(zoomFactorFromWheel(deltaYOrEvent.deltaY ?? 0, deltaYOrEvent.deltaMode ?? 0));
      return;
    }
    zoomByFactor(zoomFactorFromWheel(deltaYOrEvent, deltaMode ?? 0));
  }

  /**
   * @param {number} direction positive = zoom out (increase distance)
   */
  function zoomStep(direction) {
    const sign = direction < 0 ? -1 : 1;
    zoomByFactor(zoomFactorFromWheel(sign * BUTTON_ZOOM_DELTA_PX, WHEEL_DELTA_PIXEL));
  }

  /**
   * `scale` is currentFingerDist / previousFingerDist (fingers apart → zoom in).
   *
   * @param {{ scale?: number, dxCss?: number, dyCss?: number }} gesture
   */
  function pinch(gesture) {
    if (!gesture) return;
    const scale = gesture.scale;
    if (Number.isFinite(scale) && scale > 0) {
      const rawFactor = 1 / scale;
      const bounded = Math.exp(
        clampWheelDeltaY(Math.log(rawFactor) / ZOOM_EXP_GAIN) * ZOOM_EXP_GAIN,
      );
      zoomByFactor(bounded);
    }
    pan(gesture.dxCss ?? 0, gesture.dyCss ?? 0);
  }

  function reset() {
    framing = 'overview';
    desiredYaw = PHASE2_CAMERA_YAW;
    currentYaw = nearestEquivalentYaw(currentYaw, desiredYaw);
    desiredPitch = PHASE2_CAMERA_PITCH;
    desiredTarget.x = CAMERA_TARGET.x;
    desiredTarget.y = TARGET_Y_OVERVIEW;
    desiredTarget.z = CAMERA_TARGET.z;
    applyTargetClamp(TARGET_Y_OVERVIEW);
    desiredDistance = clampDistance(overviewFit());
    maybeSnap();
    if (reducedMotion) snapCurrentToDesired();
  }

  /**
   * Custom framing, target that resident once. Does not store a live reference.
   *
   * @param {{ x: number, z: number }} position
   */
  function focusResident(position) {
    if (!position || typeof position !== 'object') return;
    const xz = clampPanTarget(position.x, position.z);
    desiredTarget.x = xz.x;
    desiredTarget.z = xz.z;
    desiredTarget.y = FOCUS_TARGET_Y;
    markCustom();
    maybeSnap();
  }

  /**
   * @param {number} nextWidthCss
   * @param {number} nextHeightCss
   */
  function resize(nextWidthCss, nextHeightCss) {
    if (!(nextWidthCss > MIN_HOST_CSS) || !(nextHeightCss > MIN_HOST_CSS)) return;
    if (!Number.isFinite(nextWidthCss) || !Number.isFinite(nextHeightCss)) return;
    widthCss = nextWidthCss;
    heightCss = nextHeightCss;
    if (framing === 'overview') {
      desiredDistance = clampDistance(overviewFit());
      maybeSnap();
      return;
    }
    desiredPitch = clampPitch(desiredPitch);
    currentPitch = clampPitch(currentPitch);
    desiredDistance = clampDistance(desiredDistance);
    currentDistance = clampDistance(currentDistance);
    applyTargetClamp(desiredTarget.y);
    const clampedCurrent = clampPanTarget(currentTarget.x, currentTarget.z);
    currentTarget.x = clampedCurrent.x;
    currentTarget.z = clampedCurrent.z;
    maybeSnap();
  }

  /**
   * @param {number} dtSeconds
   */
  function update(dtSeconds) {
    if (reducedMotion) {
      snapCurrentToDesired();
      return;
    }
    const dt = clamp(finiteOr(dtSeconds, 0), 0, 0.05);
    if (dt === 0) return;
    const k = 1 - Math.exp(-CAMERA_DAMP * dt);
    currentYaw += (desiredYaw - currentYaw) * k;
    currentPitch += (desiredPitch - currentPitch) * k;
    currentDistance += (desiredDistance - currentDistance) * k;
    currentTarget.x += (desiredTarget.x - currentTarget.x) * k;
    currentTarget.y += (desiredTarget.y - currentTarget.y) * k;
    currentTarget.z += (desiredTarget.z - currentTarget.z) * k;
    currentPitch = clampPitch(currentPitch);
    currentDistance = clampDistance(currentDistance);
  }

  /**
   * @param {boolean} next
   */
  function setReducedMotion(next) {
    reducedMotion = Boolean(next);
    if (reducedMotion) snapCurrentToDesired();
  }

  /**
   * @param {{ type?: string, factor?: number, dxCss?: number, dyCss?: number }} intent
   */
  function applyIntent(intent) {
    if (!intent || typeof intent !== 'object') return;
    switch (intent.type) {
      case 'ZOOM':
        zoomByFactor(intent.factor);
        break;
      case 'ORBIT':
        orbit(intent.dxCss, intent.dyCss);
        break;
      case 'PAN':
        pan(intent.dxCss, intent.dyCss);
        break;
      case 'RESET_VIEW':
        reset();
        break;
      case 'FOCUS_SELECTED':
        break;
      default:
        break;
    }
  }

  function dispose() {
    // Pure math + apply helpers; no observers of its own.
  }

  return {
    getView,
    applyTo,
    applyIntent,
    orbit,
    pan,
    zoom,
    zoomByFactor,
    zoomStep,
    pinch,
    reset,
    focus: focusResident,
    focusResident,
    resize,
    update,
    setReducedMotion,
    getFarPlane: farPlane,
    getDistanceLimits: () => ({ min: DISTANCE_MIN, max: distanceMax() }),
    dispose,
  };
}
