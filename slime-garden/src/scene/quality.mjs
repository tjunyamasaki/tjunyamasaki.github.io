/**
 * Habitat quality helpers for the six-actor spike and later scene controller.
 *
 * Geometry and materials stay at the approved fidelity in every mode. High vs
 * low only changes device pixel ratio, pose/render cadence, and whether the
 * directional sun uses a dynamic shadow map. Contact shadows remain in both
 * modes; that difference is a performance tradeoff, not a new art style.
 *
 * `'auto'` starts as high. After warmup, if p90 frame interval exceeds 25 ms
 * for two consecutive ~5 s windows, it drops to low and stays there.
 */

/** @typedef {'high' | 'low' | 'auto'} QualityMode */
/** @typedef {'high' | 'low'} QualityTier */

export const QUALITY_MODES = Object.freeze(['high', 'low', 'auto']);

export const HIGH_DPR_CAP = 1.5;
export const LOW_DPR_CAP = 1;
export const HIGH_POSE_HZ = 60;
export const LOW_POSE_HZ = 30;
export const HIGH_RENDER_HZ = 60;
export const LOW_RENDER_HZ = 30;

/** Skip first frames before auto-quality sampling. */
export const AUTO_WARMUP_MS = 2500;
/** Length of each auto-quality observation window. */
export const AUTO_SAMPLE_WINDOW_MS = 5000;
/** Drop when the 90th percentile frame interval exceeds this (ms). */
export const AUTO_P90_LIMIT_MS = 25;
/** Consecutive slow windows required before dropping high → low. */
export const AUTO_SLOW_WINDOWS_TO_DROP = 2;
/** Ignore a window that did not collect enough presents (hidden tab, stall). */
export const AUTO_MIN_SAMPLES = 20;

/**
 * Directional shadow ortho covering the provisional habitat (radius 5.8) plus
 * margin. Original comparison used ±5 / far 20 for a single slime.
 */
export const HABITAT_SHADOW_CAMERA = Object.freeze({
  mapSize: 1024,
  left: -8,
  right: 8,
  top: 8,
  bottom: -8,
  near: 0.1,
  far: 30,
  normalBias: 0.025,
});

/**
 * @param {unknown} value
 * @returns {value is QualityMode}
 */
export function isQualityMode(value) {
  return value === 'high' || value === 'low' || value === 'auto';
}

/**
 * Auto starts high. Callers that have already dropped auto to low should pass
 * `'low'` (the resolved tier), not `'auto'`.
 *
 * @param {QualityMode} mode
 * @returns {QualityTier}
 */
export function tierFor(mode) {
  return mode === 'low' ? 'low' : 'high';
}

/**
 * @param {QualityMode} mode
 * @param {number} devicePixelRatio
 * @returns {number}
 */
export function dprFor(mode, devicePixelRatio) {
  const raw = Number(devicePixelRatio);
  const dpr = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const cap = tierFor(mode) === 'low' ? LOW_DPR_CAP : HIGH_DPR_CAP;
  return Math.min(dpr, cap);
}

/**
 * @param {QualityMode} mode
 * @returns {number}
 */
export function poseHzFor(mode) {
  return tierFor(mode) === 'low' ? LOW_POSE_HZ : HIGH_POSE_HZ;
}

/**
 * @param {QualityMode} mode
 * @returns {number}
 */
export function renderHzFor(mode) {
  return tierFor(mode) === 'low' ? LOW_RENDER_HZ : HIGH_RENDER_HZ;
}

/**
 * @param {QualityMode} mode
 * @returns {number}
 */
export function posePeriodSec(mode) {
  return 1 / poseHzFor(mode);
}

/**
 * @param {QualityMode} mode
 * @returns {number}
 */
export function renderPeriodSec(mode) {
  return 1 / renderHzFor(mode);
}

/**
 * Human-readable shadow tradeoff for a diagnostics line. Not a product label.
 *
 * @param {QualityMode} mode
 * @returns {string}
 */
export function shadowDiagnosticsLine(mode) {
  if (tierFor(mode) === 'low') {
    return 'shadows: contact only (dynamic directional shadows off) — quality tradeoff, not a new art style';
  }
  return 'shadows: directional map 1024 covering the habitat + contact shadows — quality tradeoff, not a new art style';
}

/**
 * Linear-interpolation percentile. `p` is in 0…1. Empty input → NaN.
 *
 * @param {number[]} values
 * @param {number} p
 * @returns {number}
 */
export function percentile(values, p) {
  if (!values || values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const t = Math.max(0, Math.min(1, p));
  const idx = (sorted.length - 1) * t;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * @param {number[]} intervals
 * @returns {{ count: number, median: number, p90: number, p95: number }}
 */
export function frameIntervalStats(intervals) {
  return {
    count: intervals ? intervals.length : 0,
    median: percentile(intervals, 0.5),
    p90: percentile(intervals, 0.9),
    p95: percentile(intervals, 0.95),
  };
}

/**
 * Auto-quality governor: start high, drop to low after two consecutive slow
 * windows, then stay there (no oscillation).
 *
 * @returns {{
 *   reset: () => void,
 *   observe: (nowMs: number, intervalMs: number) => QualityTier,
 *   dropped: boolean,
 *   lastP90: number,
 *   slowWindows: number,
 *   warmed: boolean,
 * }}
 */
export function createAutoQualityGovernor() {
  let dropped = false;
  let warmupStart = null;
  let windowStart = null;
  let windowIntervals = [];
  let slowWindows = 0;
  let lastP90 = NaN;
  let warmed = false;

  function reset() {
    dropped = false;
    warmupStart = null;
    windowStart = null;
    windowIntervals = [];
    slowWindows = 0;
    lastP90 = NaN;
    warmed = false;
  }

  /**
   * @param {number} nowMs
   * @param {number} intervalMs
   * @returns {QualityTier}
   */
  function observe(nowMs, intervalMs) {
    if (dropped) return 'low';
    if (warmupStart === null) warmupStart = nowMs;
    if (nowMs - warmupStart < AUTO_WARMUP_MS) return 'high';
    warmed = true;
    if (windowStart === null) windowStart = nowMs;
    if (Number.isFinite(intervalMs) && intervalMs > 0) windowIntervals.push(intervalMs);
    if (nowMs - windowStart >= AUTO_SAMPLE_WINDOW_MS) {
      if (windowIntervals.length >= AUTO_MIN_SAMPLES) {
        lastP90 = percentile(windowIntervals, 0.9);
        if (lastP90 > AUTO_P90_LIMIT_MS) slowWindows += 1;
        else slowWindows = 0;
        if (slowWindows >= AUTO_SLOW_WINDOWS_TO_DROP) dropped = true;
      }
      windowIntervals = [];
      windowStart = nowMs;
    }
    return dropped ? 'low' : 'high';
  }

  return {
    reset,
    observe,
    get dropped() { return dropped; },
    get lastP90() { return lastP90; },
    get slowWindows() { return slowWindows; },
    get warmed() { return warmed; },
  };
}

/**
 * Apply DPR, pose/render cadence metadata, and directional-shadow settings.
 * Does not reduce geometry or change slime materials. Caller must `setSize`
 * after this so the drawing buffer matches the new pixel ratio.
 *
 * `'auto'` applies the high-tier settings (auto starts high). Pass `'low'`
 * once the governor has dropped.
 *
 * @param {{ setPixelRatio: Function, shadowMap: { enabled: boolean, type?: unknown } }} renderer
 * @param {object} [camera] view camera (unused for shadow coverage; habitat-sized)
 * @param {{
 *   castShadow: boolean,
 *   shadow?: {
 *     mapSize?: { set: Function, x?: number, y?: number },
 *     map?: { dispose: Function } | null,
 *     camera?: { left: number, right: number, top: number, bottom: number, near: number, far: number, updateProjectionMatrix?: Function },
 *     normalBias?: number,
 *   },
 * }} sun
 * @param {QualityMode} mode
 * @param {{ devicePixelRatio?: number, shadowMapType?: unknown }} [options]
 * @returns {{
 *   requested: QualityMode,
 *   applied: QualityTier,
 *   dpr: number,
 *   poseHz: number,
 *   renderHz: number,
 *   directionalShadows: boolean,
 *   shadowMapSize: number,
 *   shadowNote: string,
 * }}
 */
export function applyQuality(renderer, camera, sun, mode, options = {}) {
  const requested = isQualityMode(mode) ? mode : 'high';
  const applied = tierFor(requested);
  const dpr = dprFor(applied, options.devicePixelRatio);
  renderer.setPixelRatio(dpr);

  const directionalShadows = applied === 'high';
  renderer.shadowMap.enabled = directionalShadows;
  if (options.shadowMapType !== undefined) renderer.shadowMap.type = options.shadowMapType;

  if (sun) {
    sun.castShadow = directionalShadows;
    const shadow = sun.shadow;
    if (shadow) {
      if (!directionalShadows && shadow.map) {
        shadow.map.dispose();
        shadow.map = null;
      }
      if (directionalShadows) {
        const cfg = HABITAT_SHADOW_CAMERA;
        const size = cfg.mapSize;
        const currentX = shadow.mapSize && shadow.mapSize.x;
        const currentY = shadow.mapSize && shadow.mapSize.y;
        if (shadow.map && (currentX !== size || currentY !== size)) {
          shadow.map.dispose();
          shadow.map = null;
        }
        if (shadow.mapSize && typeof shadow.mapSize.set === 'function') {
          shadow.mapSize.set(size, size);
        }
        if (shadow.camera) {
          shadow.camera.left = cfg.left;
          shadow.camera.right = cfg.right;
          shadow.camera.top = cfg.top;
          shadow.camera.bottom = cfg.bottom;
          shadow.camera.near = cfg.near;
          shadow.camera.far = cfg.far;
          if (typeof shadow.camera.updateProjectionMatrix === 'function') {
            shadow.camera.updateProjectionMatrix();
          }
        }
        shadow.normalBias = cfg.normalBias;
      }
    }
  }

  void camera;

  return {
    requested,
    applied,
    dpr,
    poseHz: poseHzFor(applied),
    renderHz: renderHzFor(applied),
    directionalShadows,
    shadowMapSize: directionalShadows ? HABITAT_SHADOW_CAMERA.mapSize : 0,
    shadowNote: shadowDiagnosticsLine(applied),
  };
}
