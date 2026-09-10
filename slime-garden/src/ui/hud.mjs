/**
 * Pure HUD helpers: mode/tool pressed state, throw copy, reticle, presets.
 * No DOM. bindDom owns patching; this module stays unit-testable.
 */

import { MAX_FOOD, PET_FEEDBACK_COOLDOWN_MS } from '../core/balance.mjs';
import { resolveNearSelectedTarget } from '../core/selectors.mjs';
import {
  ACTIVITY_COPY,
  formatThrowReject,
  HUD_COPY,
} from './format.mjs';

/**
 * @typedef {import('../core/state.mjs').GameState} GameState
 * @typedef {import('../core/state.mjs').SlimeId} SlimeId
 * @typedef {'care' | 'orbit'} HudMode
 * @typedef {'berry' | 'hand'} HudTool
 * @typedef {'none' | 'resident' | 'object' | 'roster' | 'upgrades' | 'keyboard'} HudPanel
 *
 * @typedef {object} HudControlState
 * @property {HudMode} mode
 * @property {HudTool} tool
 * @property {HudTool} lastCareTool
 * @property {SlimeId | null} selectedSlimeId
 * @property {string | null} selectedObjectId
 * @property {HudPanel} openPanel
 * @property {boolean} aimPreview
 *
 * @typedef {object} ThrowDisableOptions
 * @property {boolean} [invalidTarget]
 * @property {boolean} [noValidTarget]
 *
 * @typedef {object} Reticle
 * @property {number} x
 * @property {number} z
 */

export const RETICLE_STEP = 0.5;
export const RETICLE_BOUNDS = Object.freeze({
  minX: -10.5,
  maxX: 10.5,
  minZ: -8.5,
  maxZ: 8.5,
});

/** Nine labeled farm regions for keyboard / no-WebGL throws. */
export const REGION_PRESETS = Object.freeze([
  Object.freeze({ id: 'nw', label: 'North-west', x: -7, z: 5.5 }),
  Object.freeze({ id: 'n', label: 'North', x: 0, z: 5.5 }),
  Object.freeze({ id: 'ne', label: 'North-east', x: 7, z: 5.5 }),
  Object.freeze({ id: 'w', label: 'West', x: -7, z: 0 }),
  Object.freeze({ id: 'center', label: 'Center', x: 0, z: 0 }),
  Object.freeze({ id: 'e', label: 'East', x: 7, z: 0 }),
  Object.freeze({ id: 'sw', label: 'South-west', x: -7, z: -5.5 }),
  Object.freeze({ id: 's', label: 'South', x: 0, z: -5.5 }),
  Object.freeze({ id: 'se', label: 'South-east', x: 7, z: -5.5 }),
]);

export { PET_FEEDBACK_COOLDOWN_MS };

/**
 * Fresh Care + Berry, no panels forced open.
 *
 * @returns {HudControlState}
 */
export function createHudControlState() {
  return {
    mode: 'care',
    tool: 'berry',
    lastCareTool: 'berry',
    selectedSlimeId: null,
    selectedObjectId: null,
    openPanel: 'none',
    aimPreview: false,
  };
}

/**
 * Orbit cancels aim preview and remembers the Care tool. Returning to Care
 * restores that tool.
 *
 * @param {HudControlState} hud
 * @param {HudMode} mode
 * @returns {HudControlState}
 */
export function setHudMode(hud, mode) {
  if (mode === 'orbit') {
    if (hud.mode === 'orbit') return hud;
    return {
      ...hud,
      mode: 'orbit',
      lastCareTool: hud.tool,
      aimPreview: false,
    };
  }
  if (hud.mode === 'care') return hud;
  return {
    ...hud,
    mode: 'care',
    tool: hud.lastCareTool,
  };
}

/**
 * Equipping Berry or Hand enters Care. Does not spend a berry.
 *
 * @param {HudControlState} hud
 * @param {HudTool} tool
 * @returns {HudControlState}
 */
export function setHudTool(hud, tool) {
  return {
    ...hud,
    mode: 'care',
    tool,
    lastCareTool: tool,
  };
}

/**
 * Pressed flags for Berry / Hand / Orbit. Highlight by pressed+text, not color
 * alone.
 *
 * @param {HudControlState} hud
 * @returns {{ berry: boolean, hand: boolean, orbit: boolean }}
 */
export function hudPressed(hud) {
  return {
    berry: hud.mode === 'care' && hud.tool === 'berry',
    hand: hud.mode === 'care' && hud.tool === 'hand',
    orbit: hud.mode === 'orbit',
  };
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Snap to the 0.5 grid used by the accessible reticle.
 *
 * @param {number} value
 * @returns {number}
 */
function snapHalf(value) {
  return Math.round(value / RETICLE_STEP) * RETICLE_STEP;
}

/**
 * First-session helper: 1.5 units in front of slime-1 at (0, 2), facing +Z.
 *
 * @returns {Reticle}
 */
export function createReticle() {
  return { x: 0, z: 3.5 };
}

/**
 * @param {Reticle} reticle
 * @param {number} dxSteps signed 0.5-unit steps on X
 * @param {number} dzSteps signed 0.5-unit steps on Z
 * @returns {Reticle}
 */
export function stepReticle(reticle, dxSteps, dzSteps) {
  const x = snapHalf(
    clamp(reticle.x + dxSteps * RETICLE_STEP, RETICLE_BOUNDS.minX, RETICLE_BOUNDS.maxX),
  );
  const z = snapHalf(
    clamp(reticle.z + dzSteps * RETICLE_STEP, RETICLE_BOUNDS.minZ, RETICLE_BOUNDS.maxZ),
  );
  return { x, z };
}

/**
 * @param {Reticle} reticle
 * @returns {string}
 */
export function formatReticle(reticle) {
  const x = Number.isFinite(reticle.x) ? reticle.x : 0;
  const z = Number.isFinite(reticle.z) ? reticle.z : 0;
  return `x ${x.toFixed(1)} · z ${z.toFixed(1)}`;
}

/**
 * @param {GameState} state
 * @returns {number}
 */
export function pendingFoodCount(state) {
  const foods = state.world && state.world.foods;
  return Array.isArray(foods) ? foods.length : 0;
}

/**
 * Shared FEED/THROW cooldown remaining. Prefers the throw clock.
 *
 * @param {GameState} state
 * @returns {number}
 */
export function throwCooldownRemainingMs(state) {
  const until = Number.isInteger(state.nextThrowAllowedAtMs)
    ? state.nextThrowAllowedAtMs
    : state.nextFeedAllowedAtMs;
  return (typeof until === 'number' ? until : 0) - state.simTimeMs;
}

/**
 * Distinct throw-disabled copy: berries, cooldown, food limit, invalid /
 * missing target. Does not require a selected resident.
 *
 * @param {GameState} state
 * @param {ThrowDisableOptions} [options]
 * @returns {string | null}
 */
export function throwDisabledReason(state, options = {}) {
  if (state.berries < 1) {
    return formatThrowReject('NO_BERRIES', state);
  }
  if (throwCooldownRemainingMs(state) > 0) {
    return formatThrowReject('THROW_COOLDOWN', state);
  }
  if (pendingFoodCount(state) >= MAX_FOOD) {
    return formatThrowReject('FOOD_LIMIT', state);
  }
  if (options.invalidTarget) {
    return formatThrowReject('INVALID_TARGET', state);
  }
  if (options.noValidTarget) {
    return formatThrowReject('NO_VALID_TARGET', state);
  }
  return null;
}

/**
 * Accessible “Offer near selected” disable copy. Not guaranteed delivery.
 *
 * @param {GameState} state
 * @param {SlimeId | null} selectedId
 * @returns {string | null}
 */
export function offerNearDisabledReason(state, selectedId) {
  if (!selectedId || !state.slimes.some((slime) => slime.id === selectedId)) {
    return HUD_COPY.chooseSlime;
  }
  const throwReason = throwDisabledReason(state);
  if (throwReason) return throwReason;
  if (resolveNearSelectedTarget(state, selectedId) == null) {
    return HUD_COPY.noValidTarget;
  }
  return null;
}

/**
 * Legacy name used by v1 tests/callers. Maps to offer-near reasons (the
 * accessible equivalent of the old Offer berry control).
 *
 * @param {GameState} state
 * @param {SlimeId | null} selectedId
 * @returns {string | null}
 */
export function feedDisabledReason(state, selectedId) {
  return offerNearDisabledReason(state, selectedId);
}

/**
 * @param {import('../core/selectors.mjs').CompanionEligibility} companion
 * @returns {string}
 */
export function formatCompanionStatus(companion) {
  if (companion.nextPopulation == null) return HUD_COPY.fullColony;
  if (companion.feedsMet && companion.glowMet && !companion.capacityMet) {
    return HUD_COPY.missingPad;
  }
  if (companion.ready) return HUD_COPY.companionReady;
  return HUD_COPY.companionNeeds;
}

/**
 * @param {GameState} state
 * @param {{ id: string, feedCount?: number }} slime
 * @returns {string}
 */
export function formatResidentActivity(state, slime) {
  const residents = state.world && state.world.residents;
  const resident =
    Array.isArray(residents) && slime
      ? residents.find((entry) => entry.id === slime.id)
      : null;
  if (resident && resident.activity && ACTIVITY_COPY[resident.activity]) {
    return ACTIVITY_COPY[/** @type {keyof typeof ACTIVITY_COPY} */ (resident.activity)];
  }
  return ACTIVITY_COPY.idle;
}

/**
 * Berry regen fill 0..1 for the resource meter. Full inventory → 1.
 *
 * @param {GameState} state
 * @param {number} intervalMs
 * @returns {number}
 */
export function berryRegenProgress(state, intervalMs) {
  if (state.nextBerryAtMs == null) return 1;
  if (!(intervalMs > 0)) return 0;
  const remaining = state.nextBerryAtMs - state.simTimeMs;
  const elapsed = intervalMs - remaining;
  if (elapsed >= intervalMs) return 1;
  if (elapsed <= 0) return 0;
  return elapsed / intervalMs;
}
