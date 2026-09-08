/**
 * Capped absence reconciliation. Pure given an injected wall timestamp.
 * Does not read wall clocks, DOM, Three, or storage.
 */

import { advance } from '../core/advance.mjs';
import {
  LOGICAL_TIME_MAX_MS,
  OFFLINE_CAP_MS,
} from '../core/balance.mjs';
import { getBerryCapacity } from '../core/selectors.mjs';
import { cloneState } from '../core/state.mjs';

/**
 * @typedef {import('../core/state.mjs').GameState} GameState
 * @typedef {import('../core/validate.mjs').SaveEnvelope} SaveEnvelope
 * @typedef {import('../core/validate.mjs').Settings} Settings
 *
 * @typedef {object} ReconcileSummary
 * @property {number} elapsedMs
 * @property {number} glowEarnedMicro
 * @property {number} berriesGained
 * @property {number} awayMs
 * @property {number} creditedMs
 * @property {boolean} capped
 * @property {boolean} clockWentBackward
 *
 * @typedef {object} ReconcileResult
 * @property {SaveEnvelope} save
 * @property {ReconcileSummary} summary
 */

/**
 * @param {Settings} settings
 * @returns {Settings}
 */
function cloneSettings(settings) {
  return {
    soundEnabled: settings.soundEnabled,
    reducedMotion: settings.reducedMotion,
    animationsPaused: settings.animationsPaused,
    quality: settings.quality,
  };
}

/**
 * @param {SaveEnvelope} save
 * @returns {SaveEnvelope}
 */
function cloneEnvelope(save) {
  return {
    gameId: save.gameId,
    schemaVersion: save.schemaVersion,
    balanceVersion: save.balanceVersion,
    revision: save.revision,
    savedWallMs: save.savedWallMs,
    settings: cloneSettings(save.settings),
    state: cloneState(save.state),
  };
}

/**
 * After the eight-hour earning cap, remaining wall time only ages logical
 * clocks. Berries are full, the berry timer is null, and bonuses/cooldown are
 * no later than `newSimTimeMs`.
 *
 * @param {GameState} state
 * @param {number} newSimTimeMs
 * @returns {GameState}
 */
function applyRemainderJump(state, newSimTimeMs) {
  const next = cloneState(state);
  const capacity = getBerryCapacity(next);
  next.berries = capacity;
  next.nextBerryAtMs = null;
  next.nextFeedAllowedAtMs = Math.min(next.nextFeedAllowedAtMs, newSimTimeMs);
  for (const slime of next.slimes) {
    slime.boostUntilMs = Math.min(slime.boostUntilMs, newSimTimeMs);
  }
  next.simTimeMs = newSimTimeMs;
  return next;
}

/**
 * Credit absence from a checkpoint to `nowWallMs`. Never mutates `save`.
 * Revision is left unchanged; the save store increments on install.
 *
 * @param {SaveEnvelope} save
 * @param {number} nowWallMs
 * @returns {ReconcileResult}
 */
export function reconcileAway(save, nowWallMs) {
  if (!Number.isSafeInteger(nowWallMs)) {
    throw new TypeError('reconcileAway: nowWallMs must be a safe integer');
  }

  const base = cloneEnvelope(save);

  if (nowWallMs < base.savedWallMs) {
    base.savedWallMs = nowWallMs;
    return {
      save: base,
      summary: {
        elapsedMs: 0,
        glowEarnedMicro: 0,
        berriesGained: 0,
        awayMs: 0,
        creditedMs: 0,
        capped: false,
        clockWentBackward: true,
      },
    };
  }

  const awayMs = nowWallMs - base.savedWallMs;
  const creditedMs = Math.min(awayMs, OFFLINE_CAP_MS);
  const capped = awayMs > creditedMs;
  const logicalRoom = Math.max(0, LOGICAL_TIME_MAX_MS - base.state.simTimeMs);
  const advanceMs = Math.min(creditedMs, logicalRoom);
  const advanced = advance(base.state, advanceMs);

  let nextState = advanced.state;
  const remaining = awayMs - creditedMs;
  if (remaining > 0) {
    const jumped = Math.min(
      LOGICAL_TIME_MAX_MS,
      nextState.simTimeMs + remaining,
    );
    nextState = applyRemainderJump(nextState, jumped);
  }

  return {
    save: {
      gameId: base.gameId,
      schemaVersion: base.schemaVersion,
      balanceVersion: base.balanceVersion,
      revision: base.revision,
      savedWallMs: nowWallMs,
      settings: base.settings,
      state: nextState,
    },
    summary: {
      elapsedMs: advanced.summary.elapsedMs,
      glowEarnedMicro: advanced.summary.glowEarnedMicro,
      berriesGained: advanced.summary.berriesGained,
      awayMs,
      creditedMs,
      capped,
      clockWentBackward: false,
    },
  };
}
