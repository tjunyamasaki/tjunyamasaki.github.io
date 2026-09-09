/**
 * Strict v1 → v2 migration. Pure: no DOM, Three, storage, or wall-clock APIs.
 *
 * Legacy absence is credited first with analytic `advanceEconomy`
 * (no automatic companions, no world food). Conversion then writes schema 2
 * and `applyPostMigrationProgression` joins currently eligible residents once
 * at NOW.
 */

import { advanceEconomy } from './advance.mjs';
import { resolveCompanionsNow } from './progression.mjs';
import {
  BALANCE_VERSION_V2,
  GAME_ID,
  HABITAT_ID_V2,
  LOGICAL_TIME_MAX_MS,
  OFFLINE_CAP_MS,
  SCHEMA_VERSION_V2,
  THROW_COOLDOWN_MS,
} from './balance.mjs';
import { getBerryCapacity } from './selectors.mjs';
import { cloneState } from './state.mjs';
import {
  serializeEnvelope,
  validateSave,
} from './validate.mjs';
import {
  attachThrowCooldownAlias,
  attachWorld,
  createWorld,
  preferredCooldownMs,
} from '../world/state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./validate-legacy.mjs').LegacyV1Envelope} LegacyV1Envelope
 * @typedef {import('./validate.mjs').SaveEnvelope} SaveEnvelope
 * @typedef {import('./validate.mjs').Settings} Settings
 * @typedef {import('../persistence/reconcile.mjs').ReconcileResult} ReconcileResult
 * @typedef {import('../persistence/reconcile.mjs').ReconcileSummary} ReconcileSummary
 * @typedef {import('./commands.mjs').GameEvent} GameEvent
 *
 * @typedef {object} ProgressionResult
 * @property {GameState} state
 * @property {GameEvent[]} events
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
 * Join currently eligible residents once at migration NOW. Does not credit
 * absence or invent Glow; `creditLegacyAbsence` must stay on `advanceEconomy`.
 *
 * @param {GameState} state
 * @returns {ProgressionResult}
 */
export function applyPostMigrationProgression(state) {
  return resolveCompanionsNow(state);
}

/**
 * Legacy absence credit (`advanceEconomy`, no auto companions, no world
 * food). Must not call `advance` / `advancePassive` — a Welcome-ready v1
 * would otherwise join at the lifetime crossing during the old interval.
 * Do not call `reconcileAway` from here — that function routes schema 1
 * back into `migrateV1` and would recurse.
 *
 * @param {LegacyV1Envelope} save
 * @param {number} nowWallMs
 * @returns {ReconcileResult}
 */
function creditLegacyAbsence(save, nowWallMs) {
  const baseState = cloneState(save.state);
  const settings = cloneSettings(save.settings);

  if (nowWallMs < save.savedWallMs) {
    return {
      save: {
        gameId: save.gameId,
        schemaVersion: save.schemaVersion,
        balanceVersion: save.balanceVersion,
        revision: save.revision,
        savedWallMs: nowWallMs,
        settings,
        state: baseState,
      },
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

  const awayMs = nowWallMs - save.savedWallMs;
  const creditedMs = Math.min(awayMs, OFFLINE_CAP_MS);
  const capped = awayMs > creditedMs;
  const logicalRoom = Math.max(0, LOGICAL_TIME_MAX_MS - baseState.simTimeMs);
  const advanceMs = Math.min(creditedMs, logicalRoom);
  const advanced = advanceEconomy(baseState, advanceMs);

  let nextState = advanced.state;
  const remaining = awayMs - creditedMs;
  if (remaining > 0) {
    const jumped = Math.min(
      LOGICAL_TIME_MAX_MS,
      nextState.simTimeMs + remaining,
    );
    nextState = applyLegacyRemainderJump(nextState, jumped);
  }

  return {
    save: {
      gameId: save.gameId,
      schemaVersion: save.schemaVersion,
      balanceVersion: save.balanceVersion,
      revision: save.revision,
      savedWallMs: nowWallMs,
      settings,
      state: nextState,
    },
    summary: {
      elapsedMs: advanced.summary.elapsedMs,
      glowEarnedMicro: advanced.summary.glowEarnedMicro,
      berriesGained: advanced.summary.berriesGained,
      mealsCompleted: advanced.summary.mealsCompleted,
      companionsAdded: [...advanced.summary.companionsAdded],
      awayMs,
      creditedMs,
      capped,
      clockWentBackward: false,
    },
  };
}

/**
 * @param {GameState} state
 * @param {number} newSimTimeMs
 * @returns {GameState}
 */
function applyLegacyRemainderJump(state, newSimTimeMs) {
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
 * @param {unknown} save
 * @returns {LegacyV1Envelope}
 */
function requireLegacyEnvelope(save) {
  const parsed = validateSave(serializeEnvelope(/** @type {LegacyV1Envelope} */ (save)));
  if (!parsed.ok || parsed.kind !== 'legacy-v1') {
    throw new TypeError('migrateV1: save is not a strict legacy v1 envelope');
  }
  return parsed.save;
}

/**
 * Strict v1 validate → legacy absence to `nowWallMs` → convert to v2
 * → join currently eligible residents at NOW.
 *
 * @param {LegacyV1Envelope} save
 * @param {number} nowWallMs
 * @returns {ReconcileResult}
 */
export function migrateV1(save, nowWallMs) {
  if (!Number.isSafeInteger(nowWallMs)) {
    throw new TypeError('migrateV1: nowWallMs must be a safe integer');
  }

  const legacy = requireLegacyEnvelope(save);
  const credited = creditLegacyAbsence(legacy, nowWallMs);
  const after = credited.save.state;
  const remainingMs = Math.min(
    THROW_COOLDOWN_MS,
    Math.max(0, preferredCooldownMs(after) - after.simTimeMs),
  );
  const nextThrowAllowedAtMs = after.simTimeMs + remainingMs;

  const converted = cloneState(after);
  converted.habitatId = HABITAT_ID_V2;
  attachThrowCooldownAlias(converted, nextThrowAllowedAtMs);
  attachWorld(converted, createWorld(converted.slimes));

  const progressed = applyPostMigrationProgression(converted);

  const candidate = {
    gameId: GAME_ID,
    schemaVersion: SCHEMA_VERSION_V2,
    balanceVersion: BALANCE_VERSION_V2,
    revision: credited.save.revision,
    savedWallMs: credited.save.savedWallMs,
    settings: cloneSettings(credited.save.settings),
    state: progressed.state,
  };

  const parsed = validateSave(serializeEnvelope(candidate));
  if (!parsed.ok || parsed.kind !== 'current') {
    throw new Error('migrateV1: converted envelope failed strict v2 validation');
  }

  /** @type {import('./state.mjs').SlimeId[]} */
  const companionsAdded = [];
  for (const event of progressed.events) {
    if (event.type === 'COMPANION_ADDED' && event.slimeId) {
      companionsAdded.push(event.slimeId);
    }
  }

  return {
    save: parsed.save,
    summary: {
      ...credited.summary,
      companionsAdded,
    },
  };
}
