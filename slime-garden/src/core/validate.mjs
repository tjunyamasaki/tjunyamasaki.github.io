/**
 * Save-envelope validation and reconstruction. Pure: no DOM, Three,
 * performance, wall clock, or randomness.
 */

import {
  ARRIVAL_STYLE_ID,
  BALANCE_VERSION,
  BONUS_MAX_REMAINING_MS,
  FEED_COOLDOWN_MS,
  FEED_COUNTER_CAP,
  GAME_ID,
  HABITAT_ID,
  INCOME_REMAINDER_MOD,
  LOGICAL_TIME_MAX_MS,
  MAX_GLOW_MICRO,
  NAME_MAX_LENGTH,
  POPULATION_CAP,
  SCHEMA_VERSION,
  TUTORIAL_STEPS,
  UPGRADE_IDS,
  UPGRADE_MAX_LEVEL,
} from './balance.mjs';
import {
  getBerryCapacity,
  getBerryIntervalMs,
  getResidentCapacity,
} from './selectors.mjs';
import { cloneState, createInitialState } from './state.mjs';

/** Maximum accepted save text length (64 KiB). */
export const SAVE_TEXT_MAX_LENGTH = 65536;

const QUALITY_VALUES = Object.freeze(
  /** @type {const} */ (['auto', 'high', 'low']),
);

const TUTORIAL_STEP_SET = new Set(TUTORIAL_STEPS);

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').SlimeState} SlimeState
 * @typedef {import('./state.mjs').TutorialStep} TutorialStep
 * @typedef {'auto' | 'high' | 'low'} Quality
 *
 * @typedef {object} Settings
 * @property {boolean} soundEnabled
 * @property {boolean | null} reducedMotion
 * @property {boolean} animationsPaused
 * @property {Quality} quality
 *
 * @typedef {object} SaveEnvelope
 * @property {'cozy-slime-mvp'} gameId
 * @property {1} schemaVersion
 * @property {1} balanceVersion
 * @property {number} revision
 * @property {number} savedWallMs
 * @property {GameState} state
 * @property {Settings} settings
 *
 * @typedef {{ ok: true, save: SaveEnvelope } | { ok: false, reason: 'INVALID_JSON' | 'TOO_LARGE' | 'INVALID_STATE' | 'FUTURE_VERSION' }} ParseSaveResult
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isNonnegSafeInteger(value) {
  return isSafeInteger(value) && value >= 0;
}

/**
 * Absolute logical timestamp: finite safe integer in `0..LOGICAL_TIME_MAX_MS`.
 *
 * @param {unknown} value
 * @returns {value is number}
 */
function isLogicalTime(value) {
  return isSafeInteger(value) && value >= 0 && value <= LOGICAL_TIME_MAX_MS;
}

/**
 * Default v1 settings. Sound stays off; reduced motion follows the OS.
 *
 * @returns {Settings}
 */
export function createDefaultSettings() {
  return {
    soundEnabled: false,
    reducedMotion: null,
    animationsPaused: false,
    quality: 'auto',
  };
}

/**
 * Fresh v1 envelope around `createInitialState()`. Useful for tests and reset.
 *
 * @param {object} [options]
 * @param {number} [options.nowWallMs]
 * @param {number} [options.revision]
 * @param {GameState} [options.state]
 * @param {Settings} [options.settings]
 * @returns {SaveEnvelope}
 */
export function createFreshEnvelope(options = {}) {
  const nowWallMs = options.nowWallMs ?? 0;
  const revision = options.revision ?? 0;
  return {
    gameId: GAME_ID,
    schemaVersion: SCHEMA_VERSION,
    balanceVersion: BALANCE_VERSION,
    revision,
    savedWallMs: nowWallMs,
    state: options.state ? cloneState(options.state) : createInitialState(),
    settings: options.settings
      ? {
          soundEnabled: options.settings.soundEnabled,
          reducedMotion: options.settings.reducedMotion,
          animationsPaused: options.settings.animationsPaused,
          quality: options.settings.quality,
        }
      : createDefaultSettings(),
  };
}

/**
 * Compact JSON of known envelope fields only.
 *
 * @param {SaveEnvelope} envelope
 * @returns {string}
 */
export function serializeEnvelope(envelope) {
  return JSON.stringify({
    gameId: envelope.gameId,
    schemaVersion: envelope.schemaVersion,
    balanceVersion: envelope.balanceVersion,
    revision: envelope.revision,
    savedWallMs: envelope.savedWallMs,
    settings: {
      soundEnabled: envelope.settings.soundEnabled,
      reducedMotion: envelope.settings.reducedMotion,
      animationsPaused: envelope.settings.animationsPaused,
      quality: envelope.settings.quality,
    },
    state: cloneState(envelope.state),
  });
}

/**
 * @param {'INVALID_JSON' | 'TOO_LARGE' | 'INVALID_STATE' | 'FUTURE_VERSION'} reason
 * @returns {ParseSaveResult}
 */
function fail(reason) {
  return { ok: false, reason };
}

/**
 * @param {unknown} raw
 * @returns {Settings | null}
 */
function reconstructSettings(raw) {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.soundEnabled !== 'boolean') return null;
  if (raw.reducedMotion !== null && typeof raw.reducedMotion !== 'boolean') {
    return null;
  }
  if (typeof raw.animationsPaused !== 'boolean') return null;
  if (
    typeof raw.quality !== 'string' ||
    !QUALITY_VALUES.includes(/** @type {Quality} */ (raw.quality))
  ) {
    return null;
  }
  return {
    soundEnabled: raw.soundEnabled,
    reducedMotion: raw.reducedMotion,
    animationsPaused: raw.animationsPaused,
    quality: /** @type {Quality} */ (raw.quality),
  };
}

/**
 * @param {unknown} raw
 * @returns {SlimeState | null}
 */
function reconstructSlime(raw) {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== 'string') return null;
  if (typeof raw.name !== 'string') return null;
  if (!isLogicalTime(raw.createdAtMs)) return null;
  if (!isLogicalTime(raw.boostUntilMs)) return null;
  if (!isNonnegSafeInteger(raw.feedCount)) return null;
  if (!isSafeInteger(raw.homeSlot)) return null;
  return {
    id: /** @type {SlimeState['id']} */ (raw.id),
    name: raw.name,
    createdAtMs: raw.createdAtMs,
    boostUntilMs: raw.boostUntilMs,
    feedCount: raw.feedCount,
    homeSlot: raw.homeSlot,
  };
}

/**
 * @param {unknown} raw
 * @returns {GameState | null}
 */
function reconstructState(raw) {
  if (!isPlainObject(raw)) return null;
  if (!isLogicalTime(raw.simTimeMs)) return null;
  if (!isNonnegSafeInteger(raw.glowMicro)) return null;
  if (!isNonnegSafeInteger(raw.lifetimeGlowMicro)) return null;
  if (!isNonnegSafeInteger(raw.incomeRemainder)) return null;
  if (!isNonnegSafeInteger(raw.berries)) return null;
  if (raw.nextBerryAtMs !== null && !isLogicalTime(raw.nextBerryAtMs)) {
    return null;
  }
  if (!isLogicalTime(raw.nextFeedAllowedAtMs)) return null;
  if (!isNonnegSafeInteger(raw.totalFeeds)) return null;
  if (!isPlainObject(raw.upgrades)) return null;
  if (!Array.isArray(raw.slimes)) return null;
  if (!Array.isArray(raw.tutorialCompleted)) return null;
  if (raw.habitatId !== HABITAT_ID) return null;
  if (raw.arrivalStyleId !== ARRIVAL_STYLE_ID) return null;

  /** @type {Record<string, number>} */
  const upgrades = {};
  for (const id of UPGRADE_IDS) {
    const level = raw.upgrades[id];
    if (!isNonnegSafeInteger(level)) return null;
    if (level > UPGRADE_MAX_LEVEL[id]) return null;
    upgrades[id] = level;
  }

  /** @type {SlimeState[]} */
  const slimes = [];
  for (const entry of raw.slimes) {
    const slime = reconstructSlime(entry);
    if (slime === null) return null;
    slimes.push(slime);
  }

  /** @type {TutorialStep[]} */
  const tutorialCompleted = [];
  const seenSteps = new Set();
  for (const step of raw.tutorialCompleted) {
    if (typeof step !== 'string' || !TUTORIAL_STEP_SET.has(step)) return null;
    if (seenSteps.has(step)) return null;
    seenSteps.add(step);
    tutorialCompleted.push(/** @type {TutorialStep} */ (step));
  }

  return {
    simTimeMs: raw.simTimeMs,
    glowMicro: raw.glowMicro,
    lifetimeGlowMicro: raw.lifetimeGlowMicro,
    incomeRemainder: raw.incomeRemainder,
    berries: raw.berries,
    nextBerryAtMs: raw.nextBerryAtMs,
    nextFeedAllowedAtMs: raw.nextFeedAllowedAtMs,
    totalFeeds: raw.totalFeeds,
    upgrades: {
      shrub: upgrades.shrub,
      pantry: upgrades.pantry,
      bloom: upgrades.bloom,
      beds: upgrades.beds,
    },
    slimes,
    tutorialCompleted,
    habitatId: HABITAT_ID,
    arrivalStyleId: ARRIVAL_STYLE_ID,
  };
}

/**
 * Cross-field v1 invariants from the technical spec §3.
 *
 * @param {GameState} state
 * @returns {boolean}
 */
function stateInvariantsHold(state) {
  if (state.glowMicro > state.lifetimeGlowMicro) return false;
  if (state.lifetimeGlowMicro > MAX_GLOW_MICRO) return false;
  if (state.incomeRemainder >= INCOME_REMAINDER_MOD) return false;
  if (state.totalFeeds > FEED_COUNTER_CAP) return false;

  const population = state.slimes.length;
  if (population < 1 || population > POPULATION_CAP) return false;
  if (population > getResidentCapacity(state)) return false;

  let feedSum = 0;
  for (let index = 0; index < population; index += 1) {
    const slime = state.slimes[index];
    const n = index + 1;
    if (slime.id !== `slime-${n}`) return false;
    if (slime.homeSlot !== n - 1) return false;
    if (slime.name.length < 1 || slime.name.length > NAME_MAX_LENGTH) {
      return false;
    }
    if (slime.createdAtMs > state.simTimeMs) return false;
    if (slime.feedCount > FEED_COUNTER_CAP) return false;
    feedSum += slime.feedCount;
    const boostDelta = slime.boostUntilMs - state.simTimeMs;
    if (boostDelta > 0 && boostDelta > BONUS_MAX_REMAINING_MS) return false;
  }
  if (feedSum !== state.totalFeeds) return false;

  const capacity = getBerryCapacity(state);
  if (state.berries > capacity) return false;
  if (state.berries === capacity) {
    if (state.nextBerryAtMs !== null) return false;
  } else {
    const nextBerryAtMs = state.nextBerryAtMs;
    if (nextBerryAtMs === null) return false;
    if (nextBerryAtMs <= state.simTimeMs) return false;
    const intervalMs = getBerryIntervalMs(state);
    if (nextBerryAtMs > state.simTimeMs + intervalMs) return false;
  }

  const cooldownDelta = state.nextFeedAllowedAtMs - state.simTimeMs;
  if (cooldownDelta > 0 && cooldownDelta > FEED_COOLDOWN_MS) return false;

  return true;
}

/**
 * Parse and reconstruct a v1 save string. Extra enumerable fields are dropped.
 *
 * @param {unknown} text
 * @returns {ParseSaveResult}
 */
export function validateSave(text) {
  if (typeof text !== 'string' || text.length > SAVE_TEXT_MAX_LENGTH) {
    return fail('TOO_LARGE');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('INVALID_JSON');
  }

  if (!isPlainObject(parsed)) {
    return fail('INVALID_STATE');
  }

  if (
    parsed.gameId === GAME_ID &&
    typeof parsed.schemaVersion === 'number' &&
    Number.isInteger(parsed.schemaVersion) &&
    Number.isFinite(parsed.schemaVersion) &&
    parsed.schemaVersion > SCHEMA_VERSION
  ) {
    return fail('FUTURE_VERSION');
  }

  if (parsed.gameId !== GAME_ID) return fail('INVALID_STATE');
  if (parsed.schemaVersion !== SCHEMA_VERSION) return fail('INVALID_STATE');
  if (parsed.balanceVersion !== BALANCE_VERSION) return fail('INVALID_STATE');
  if (!isNonnegSafeInteger(parsed.revision)) return fail('INVALID_STATE');
  if (!isSafeInteger(parsed.savedWallMs)) return fail('INVALID_STATE');

  const settings = reconstructSettings(parsed.settings);
  if (settings === null) return fail('INVALID_STATE');

  const state = reconstructState(parsed.state);
  if (state === null) return fail('INVALID_STATE');
  if (!stateInvariantsHold(state)) return fail('INVALID_STATE');

  return {
    ok: true,
    save: {
      gameId: GAME_ID,
      schemaVersion: SCHEMA_VERSION,
      balanceVersion: BALANCE_VERSION,
      revision: parsed.revision,
      savedWallMs: parsed.savedWallMs,
      settings,
      state,
    },
  };
}
