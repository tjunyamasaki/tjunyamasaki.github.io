/**
 * Single owner of pointer / wheel gestures for Care vs Orbit.
 * Maps to InputIntent only — no THROW_FOOD, FEED, berries, or GameState writes.
 *
 * Scene.mjs v1 pick listeners stay installed on the live garden until P2-13.
 * This module must not register competing listeners there.
 */

import { DRAG_THRESHOLD_PX } from '../scene/layout.mjs';
import { zoomFactorFromWheel } from '../scene/camera.mjs';

export { DRAG_THRESHOLD_PX };

/** At most two pointers participate in camera gestures. */
export const MAX_CAMERA_POINTERS = 2;

/**
 * @typedef {'care' | 'orbit'} CameraMode
 * @typedef {'berry' | 'hand'} Tool
 * @typedef {{ kind: 'slime', slimeId: string }
 *   | { kind: 'object', upgradeId: string }
 *   | { kind: 'ground', point: { x: number, z: number }, valid: boolean }
 *   | { kind: 'none' }} Hit
 *
 * @typedef {object} PointerRouterOptions
 * @property {() => CameraMode} [getMode]
 * @property {() => Tool} [getTool]
 * @property {(clientX: number, clientY: number) => Hit} [pick]
 * @property {(intent: object) => void} [onIntent]
 * @property {(intent: object) => void} [onCamera]
 * @property {(event: object) => boolean} [isOverPlaySurface]
 * @property {(event: object) => boolean} [isHudHit]
 * @property {() => boolean} [isPlaySurfaceFocused]
 * @property {() => object} [getWindow]
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFn(value) {
  return typeof value === 'function';
}

/**
 * @param {PointerRouterOptions} [options]
 */
export function createPointerRouter(options = {}) {
  const getMode = isFn(options.getMode) ? options.getMode : () => 'care';
  const getTool = isFn(options.getTool) ? options.getTool : () => 'berry';
  const pick = isFn(options.pick) ? options.pick : () => ({ kind: 'none' });
  const onIntent = isFn(options.onIntent) ? options.onIntent : () => {};
  const onCamera = isFn(options.onCamera) ? options.onCamera : () => {};
  const isOverPlaySurface = isFn(options.isOverPlaySurface)
    ? options.isOverPlaySurface
    : () => true;
  const isHudHit = isFn(options.isHudHit) ? options.isHudHit : () => false;
  const isPlaySurfaceFocused = isFn(options.isPlaySurfaceFocused)
    ? options.isPlaySurfaceFocused
    : null;
  const getWindow = isFn(options.getWindow) ? options.getWindow : () => globalThis;

  /** @type {Map<number, object>} */
  const pointers = new Map();
  let blockedUntilClear = false;
  let multiTouchOccurred = false;
  let pinchLastDist = 0;
  let pinchLastCx = 0;
  let pinchLastCy = 0;
  let surfaceFocused = false;
  let engaged = false;
  let attachedEl = null;
  let attachedWin = null;
  let disposedAttach = true;

  function modeNow() {
    return getMode() === 'orbit' ? 'orbit' : 'care';
  }

  function toolNow() {
    return getTool() === 'hand' ? 'hand' : 'berry';
  }

  function focusedNow() {
    if (isPlaySurfaceFocused) return Boolean(isPlaySurfaceFocused());
    return surfaceFocused;
  }

  function clearPinch() {
    pinchLastDist = 0;
    pinchLastCx = 0;
    pinchLastCy = 0;
  }

  function captureTarget(event, pointerId) {
    const target = event && event.target;
    if (!target || typeof target.setPointerCapture !== 'function') return false;
    if (pointerId == null) return false;
    try {
      target.setPointerCapture(pointerId);
      return true;
    } catch {
      return false;
    }
  }

  function releaseCapture(record, event) {
    if (!record || !record.captured) return;
    const target = (event && event.target) || record.target;
    if (target && typeof target.releasePointerCapture === 'function') {
      try {
        target.releasePointerCapture(record.pointerId);
      } catch {
        // already released
      }
    }
    record.captured = false;
  }

  function emitCamera(intent) {
    onCamera(intent);
  }

  function activeTouches() {
    return pointers.size;
  }

  function twoTouchPointers() {
    if (pointers.size !== 2) return null;
    const pair = [...pointers.values()];
    return pair;
  }

  function beginPinch() {
    const pair = twoTouchPointers();
    if (!pair) {
      clearPinch();
      return;
    }
    const [a, b] = pair;
    pinchLastDist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
    pinchLastCx = (a.lastX + b.lastX) / 2;
    pinchLastCy = (a.lastY + b.lastY) / 2;
  }

  function updatePinch() {
    const pair = twoTouchPointers();
    if (!pair || pinchLastDist <= 0) return;
    const [a, b] = pair;
    const dist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
    const cx = (a.lastX + b.lastX) / 2;
    const cy = (a.lastY + b.lastY) / 2;
    if (dist > 0 && pinchLastDist > 0) {
      const factor = zoomFactorFromWheel(
        Math.log(pinchLastDist / dist) / 0.001,
        0,
      );
      if (factor !== 1) emitCamera({ type: 'ZOOM', factor });
    }
    const dxCss = cx - pinchLastCx;
    const dyCss = cy - pinchLastCy;
    if (dxCss !== 0 || dyCss !== 0) emitCamera({ type: 'PAN', dxCss, dyCss });
    pinchLastDist = dist;
    pinchLastCx = cx;
    pinchLastCy = cy;
  }

  /**
   * @param {object} event
   */
  function handlePointerDown(event) {
    if (!event) return;
    const pointerId = event.pointerId;
    if (pointerId == null) return;
    if (isHudHit(event)) return;
    if (isOverPlaySurface(event) === false) return;

    engaged = true;
    const mode = modeNow();
    const button = event.button == null ? 0 : event.button;
    const rec = {
      pointerId,
      pointerType: event.pointerType || 'mouse',
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startMode: mode,
      startTool: toolNow(),
      button,
      maxDisplacement: 0,
      cancelled: false,
      captured: false,
      target: event.target || null,
    };

    if (mode === 'orbit' && (button === 0 || button === 2)) {
      rec.captured = captureTarget(event, pointerId);
    }

    pointers.set(pointerId, rec);

    if (pointers.size >= 3) {
      blockedUntilClear = true;
      multiTouchOccurred = true;
      for (const p of pointers.values()) p.cancelled = true;
      clearPinch();
      return;
    }

    if (pointers.size === 2) {
      multiTouchOccurred = true;
      for (const p of pointers.values()) p.cancelled = true;
      beginPinch();
    }
  }

  /**
   * @param {object} event
   */
  function handlePointerMove(event) {
    if (!event) return;
    const rec = pointers.get(event.pointerId);
    if (!rec) return;
    const x = event.clientX;
    const y = event.clientY;
    const dxFromStart = x - rec.startX;
    const dyFromStart = y - rec.startY;
    rec.maxDisplacement = Math.max(
      rec.maxDisplacement,
      Math.hypot(dxFromStart, dyFromStart),
    );
    const dxCss = x - rec.lastX;
    const dyCss = y - rec.lastY;
    rec.lastX = x;
    rec.lastY = y;

    if (blockedUntilClear) return;
    if (modeNow() !== rec.startMode) {
      rec.cancelled = true;
      blockedUntilClear = true;
      clearPinch();
      return;
    }

    if (pointers.size === 2) {
      if (pinchLastDist <= 0) beginPinch();
      updatePinch();
      return;
    }

    if (pointers.size !== 1) return;
    if (multiTouchOccurred || rec.cancelled) return;
    if (rec.startMode !== 'orbit') return;
    if (dxCss === 0 && dyCss === 0) return;
    if (rec.button === 2) {
      emitCamera({ type: 'PAN', dxCss, dyCss });
      return;
    }
    if (rec.button === 0) {
      emitCamera({ type: 'ORBIT', dxCss, dyCss });
    }
  }

  /**
   * @param {object} rec
   * @param {object} event
   * @returns {boolean}
   */
  function isClickCandidate(rec, event) {
    if (!rec) return false;
    if (rec.cancelled || rec.button !== 0) return false;
    if (multiTouchOccurred) return false;
    if (blockedUntilClear) return false;
    if (rec.maxDisplacement > DRAG_THRESHOLD_PX) return false;
    if (rec.startMode !== 'care') return false;
    if (modeNow() !== rec.startMode) return false;
    if (isOverPlaySurface(event) === false) return false;
    if (isHudHit(event)) return false;
    return true;
  }

  /**
   * @param {object} event
   */
  function finishPointer(event, cancelled) {
    if (!event) return;
    const rec = pointers.get(event.pointerId);
    if (!rec) return;
    releaseCapture(rec, event);
    const shouldClick = !cancelled && isClickCandidate(rec, event);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) clearPinch();
    if (pointers.size === 0) {
      blockedUntilClear = false;
      multiTouchOccurred = false;
    }
    if (shouldClick) {
      const hit = pick(event.clientX, event.clientY) || { kind: 'none' };
      onIntent({ type: 'WORLD_CLICK', hit, tool: rec.startTool });
    }
  }

  /**
   * @param {object} event
   */
  function handlePointerUp(event) {
    finishPointer(event, false);
  }

  /**
   * @param {object} event
   */
  function handlePointerCancel(event) {
    if (!event) return;
    const rec = pointers.get(event.pointerId);
    if (rec) rec.cancelled = true;
    finishPointer(event, true);
  }

  /**
   * @param {object} event
   */
  function handleLostPointerCapture(event) {
    handlePointerCancel(event);
  }

  function cancelGestures() {
    for (const rec of pointers.values()) rec.cancelled = true;
    if (pointers.size > 0) blockedUntilClear = true;
    multiTouchOccurred = pointers.size > 1 ? true : multiTouchOccurred;
    clearPinch();
  }

  function notifyModeChange() {
    cancelGestures();
  }

  function notifyDialogOpen() {
    cancelGestures();
  }

  function handleBlur() {
    cancelGestures();
    engaged = false;
    surfaceFocused = false;
    const leftover = [...pointers.keys()];
    for (const id of leftover) {
      const rec = pointers.get(id);
      if (rec) releaseCapture(rec, { target: rec.target });
      pointers.delete(id);
    }
    blockedUntilClear = false;
    multiTouchOccurred = false;
    clearPinch();
  }

  /**
   * @param {boolean} next
   */
  function setSurfaceFocused(next) {
    surfaceFocused = Boolean(next);
  }

  /**
   * @param {object} event
   * @returns {boolean} true when consumed
   */
  function handleWheel(event) {
    if (!event) return false;
    if (event.ctrlKey || event.metaKey) return false;
    if (isOverPlaySurface(event) === false) return false;
    const orbitOn = modeNow() === 'orbit';
    const engagedOrFocused = engaged || focusedNow();
    if (!orbitOn && !engagedOrFocused) return false;
    const factor = zoomFactorFromWheel(event.deltaY ?? 0, event.deltaMode ?? 0);
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (factor !== 1) emitCamera({ type: 'ZOOM', factor });
    return true;
  }

  function onFocusIn() {
    surfaceFocused = true;
  }

  function onFocusOut() {
    surfaceFocused = false;
  }

  function onDown(event) {
    handlePointerDown(event);
  }
  function onMove(event) {
    handlePointerMove(event);
  }
  function onUp(event) {
    handlePointerUp(event);
  }
  function onCancel(event) {
    handlePointerCancel(event);
  }
  function onLost(event) {
    handleLostPointerCapture(event);
  }
  function onWheel(event) {
    handleWheel(event);
  }
  function onWinBlur() {
    handleBlur();
  }

  /**
   * @param {{ addEventListener?: Function, removeEventListener?: Function }} el
   * @param {object} [windowLike]
   */
  function attach(el, windowLike) {
    if (attachedEl || attachedWin) detachListeners();
    if (!el || typeof el.addEventListener !== 'function') return;
    attachedEl = el;
    attachedWin = windowLike || getWindow() || null;
    disposedAttach = false;
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('lostpointercapture', onLost);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    if (attachedWin && typeof attachedWin.addEventListener === 'function') {
      attachedWin.addEventListener('pointermove', onMove);
      attachedWin.addEventListener('pointerup', onUp);
      attachedWin.addEventListener('pointercancel', onCancel);
      attachedWin.addEventListener('blur', onWinBlur);
    } else {
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onCancel);
    }
  }

  function detachListeners() {
    if (attachedEl && typeof attachedEl.removeEventListener === 'function') {
      attachedEl.removeEventListener('pointerdown', onDown);
      attachedEl.removeEventListener('lostpointercapture', onLost);
      attachedEl.removeEventListener('wheel', onWheel);
      attachedEl.removeEventListener('focusin', onFocusIn);
      attachedEl.removeEventListener('focusout', onFocusOut);
      attachedEl.removeEventListener('pointermove', onMove);
      attachedEl.removeEventListener('pointerup', onUp);
      attachedEl.removeEventListener('pointercancel', onCancel);
    }
    if (attachedWin && typeof attachedWin.removeEventListener === 'function') {
      attachedWin.removeEventListener('pointermove', onMove);
      attachedWin.removeEventListener('pointerup', onUp);
      attachedWin.removeEventListener('pointercancel', onCancel);
      attachedWin.removeEventListener('blur', onWinBlur);
    }
    attachedEl = null;
    attachedWin = null;
    disposedAttach = true;
  }

  function dispose() {
    handleBlur();
    detachListeners();
  }

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    handleWheel,
    handleBlur,
    cancelGestures,
    notifyModeChange,
    notifyDialogOpen,
    setSurfaceFocused,
    attach,
    dispose,
    getActivePointerCount: () => activeTouches(),
  };
}
