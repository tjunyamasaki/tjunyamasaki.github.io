/**
 * Capped absence reconciliation. Pure given an injected wall timestamp.
 * Does not read wall clocks, DOM, Three, or storage.
 *
 * Schema 1 / legacy envelopes run `migrateV1` (legacy absence then convert).
 * Native schema 2 credits economy with `advancePassive` (exact crossings)
 * without wholesale-replacing world after joins.
 */

import { advancePassive } from '../core/advance.mjs';
import { resolveCompanionsNow } from '../core/progression.mjs';
import {
  LOGICAL_TIME_MAX_MS,
  OFFLINE_CAP_MS,
  SCHEMA_VERSION,
  SCHEMA_VERSION_V2,
} from '../core/balance.mjs';
import { migrateV1 } from '../core/migrate.mjs';
import { getBerryCapacity } from '../core/selectors.mjs';
import { cloneState } from '../core/state.mjs';
import { cloneWorld } from '../world/state.mjs';

/**
 * @typedef {import('../core/state.mjs').GameState} GameState
 * @typedef {import('../core/validate.mjs').SaveEnvelope} SaveEnvelope
 * @typedef {import('../core/validate.mjs').Settings} Settings
 *
 * @typedef {object} ReconcileSummary
 * @property {number} elapsedMs
 * @property {number} glowEarnedMicro
 * @property {number} berriesGained
 * @property {number} mealsCompleted
 * @property {import('../core/state.mjs').SlimeId[]} companionsAdded
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
 * no later than `newSimTimeMs`. Clamping `nextFeedAllowedAtMs` also ages the
 * throw clock (one integer, two names).
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
 * @param {SaveEnvelope} save
 * @returns {boolean}
 */
function isLegacyEnvelope(save) {
  if (save.schemaVersion === SCHEMA_VERSION) return true;
  const habitatId = save.state && save.state.habitatId;
  if (
    habitatId === 'garden-prototype-v1' &&
    save.schemaVersion !== SCHEMA_VERSION_V2
  ) {
    return true;
  }
  if (
    save.schemaVersion !== SCHEMA_VERSION_V2 &&
    save.state &&
    !save.state.world
  ) {
    return true;
  }
  return false;
}

/**
 * Native v2 absence: credit with `advancePassive` (exact companion crossings).
 * Do not wholesale-replace `world` afterward — that would drop residents
 * joined while away. Passive leaves world.timeMs / carryMs / foods / existing
 * paths unchanged and only adds idle newcomers.
 *
 * @param {SaveEnvelope} save
 * @param {number} nowWallMs
 * @returns {ReconcileResult}
 */
function reconcileNativeV2(save, nowWallMs) {
  const frozenWorld = save.state.world ? cloneWorld(save.state.world) : null;
  const base = cloneEnvelope(save);

  if (nowWallMs < base.savedWallMs) {
    if (frozenWorld) base.state.world = cloneWorld(frozenWorld);
    base.savedWallMs = nowWallMs;
    return {
      save: base,
      summary: {
        elapsedMs: 0,
        glowEarnedMicro: 0,
        berriesGained: 0,
        mealsCompleted: 0,
        companionsAdded: [],
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
  const advanced = advancePassive(base.state, advanceMs);

  let nextState = advanced.state;
  /** @type {import('../core/state.mjs').SlimeId[]} */
  const companionsAdded = [...advanced.summary.companionsAdded];
  const remaining = awayMs - creditedMs;
  if (remaining > 0) {
    const jumped = Math.min(
      LOGICAL_TIME_MAX_MS,
      nextState.simTimeMs + remaining,
    );
    nextState = applyRemainderJump(nextState, jumped);
    const extra = resolveCompanionsNow(nextState);
    nextState = extra.state;
    for (const event of extra.events) {
      if (event.type === 'COMPANION_ADDED' && event.slimeId) {
        companionsAdded.push(event.slimeId);
      }
    }
  }

  return {
    save: {
      gameId: base.gameId,
      schemaVersion: SCHEMA_VERSION_V2,
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
      mealsCompleted: advanced.summary.mealsCompleted,
      companionsAdded,
      awayMs,
      creditedMs,
      capped,
      clockWentBackward: false,
    },
  };
}

/**
 * Credit absence from a checkpoint to `nowWallMs`. Never mutates `save`.
 * Revision is left unchanged; the save store increments on install.
 *
 * Schema 1 runs migrateV1 (legacy absence + convert) so main's existing
 * `reconcileAway(loaded.save, now)` migrates a browser v1 save once.
 *
 * @param {SaveEnvelope} save
 * @param {number} nowWallMs
 * @returns {ReconcileResult}
 */
export function reconcileAway(save, nowWallMs) {
  if (!Number.isSafeInteger(nowWallMs)) {
    throw new TypeError('reconcileAway: nowWallMs must be a safe integer');
  }

  if (isLegacyEnvelope(save)) {
    return migrateV1(
      /** @type {import('../core/validate-legacy.mjs').LegacyV1Envelope} */ (
        save
      ),
      nowWallMs,
    );
  }

  return reconcileNativeV2(save, nowWallMs);
}
