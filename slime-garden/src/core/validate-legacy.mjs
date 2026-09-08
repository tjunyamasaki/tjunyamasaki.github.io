/**
 * Frozen v1 save validation. Independent of current POPULATION_CAP (10)
 * and UPGRADE_MAX_LEVEL.beds (8). A claimed schema-1 envelope with 10 slimes
 * or beds 8 is INVALID_STATE.
 *
 * Pure: no DOM, Three, performance, wall clock, or randomness.
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
  SCHEMA_VERSION,
  UPGRADE_IDS,
} from './balance.mjs';
import {
  getBerryCapacity,
  getBerryIntervalMs,
  getResidentCapacity,
} from './selectors.mjs';

/** Frozen v1 membership cap. Do not read POPULATION_CAP here. */
export const LEGACY_POPULATION_CAP = 6;

/** Frozen v1 beds track. Do not read UPGRADE_MAX_LEVEL.beds here. */
export const LEGACY_BEDS_MAX_LEVEL = 4;

export const LEGACY_HABITAT_ID = HABITAT_ID;
export const LEGACY_SCHEMA_VERSION = SCHEMA_VERSION;
export const LEGACY_BALANCE_VERSION = BALANCE_VERSION;

export const LEGACY_TUTORIAL_STEPS = Object.freeze(
  /** @type {const} */ (['feed', 'berry', 'welcome', 'upgrade']),
);

const LEGACY_TUTORIAL_STEP_SET = new Set(LEGACY_TUTORIAL_STEPS);

const LEGACY_UPGRADE_MAX_LEVEL = Object.freeze({
  shrub: 3,
  pantry: 2,
  bloom: 5,
  beds: LEGACY_BEDS_MAX_LEVEL,
});

const QUALITY_VALUES = Object.freeze(
  /** @type {const} */ (['auto', 'high', 'low']),
);

/**
 * @typedef {import('./state.mjs').SlimeState} SlimeState
 * @typedef {'auto' | 'high' | 'low'} Quality
 * @typedef {object} Settings
 * @property {boolean} soundEnabled
 * @property {boolean | null} reducedMotion
 * @property {boolean} animationsPaused
 * @property {Quality} quality
 * @typedef {object} LegacyV1State
 * @property {number} simTimeMs
 * @property {number} glowMicro
 * @property {number} lifetimeGlowMicro
 * @property {number} incomeRemainder
 * @property {number} berries
 * @property {number | null} nextBerryAtMs
 * @property {number} nextFeedAllowedAtMs
 * @property {number} totalFeeds
 * @property {{ shrub: number, pantry: number, bloom: number, beds: number }} upgrades
 * @property {SlimeState[]} slimes
 * @property {('feed' | 'berry' | 'welcome' | 'upgrade')[]} tutorialCompleted
 * @property {'garden-prototype-v1'} habitatId
 * @property {'visitor-v1'} arrivalStyleId
 * @typedef {object} LegacyV1Envelope
 * @property {'cozy-slime-mvp'} gameId
 * @property {1} schemaVersion
 * @property {1} balanceVersion
 * @property {number} revision
 * @property {number} savedWallMs
 * @property {LegacyV1State} state
 * @property {Settings} settings
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isNonnegSafeInteger(value) {
  return isSafeInteger(value) && value >= 0;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isLogicalTime(value) {
  return isSafeInteger(value) && value >= 0 && value <= LOGICAL_TIME_MAX_MS;
}

/**
 * @param {unknown} raw
 * @returns {Settings | null}
 */
export function reconstructSettings(raw) {
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
export function reconstructSlime(raw) {
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
 * @returns {LegacyV1State | null}
 */
export function reconstructLegacyState(raw) {
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
  if (raw.habitatId !== LEGACY_HABITAT_ID) return null;
  if (raw.arrivalStyleId !== ARRIVAL_STYLE_ID) return null;

  /** @type {Record<string, number>} */
  const upgrades = {};
  for (const id of UPGRADE_IDS) {
    const level = raw.upgrades[id];
    if (!isNonnegSafeInteger(level)) return null;
    if (level > LEGACY_UPGRADE_MAX_LEVEL[id]) return null;
    upgrades[id] = level;
  }

  /** @type {SlimeState[]} */
  const slimes = [];
  for (const entry of raw.slimes) {
    const slime = reconstructSlime(entry);
    if (slime === null) return null;
    slimes.push(slime);
  }

  /** @type {LegacyV1State['tutorialCompleted']} */
  const tutorialCompleted = [];
  const seenSteps = new Set();
  for (const step of raw.tutorialCompleted) {
    if (typeof step !== 'string' || !LEGACY_TUTORIAL_STEP_SET.has(step)) {
      return null;
    }
    if (seenSteps.has(step)) return null;
    seenSteps.add(step);
    tutorialCompleted.push(
      /** @type {LegacyV1State['tutorialCompleted'][number]} */ (step),
    );
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
    habitatId: LEGACY_HABITAT_ID,
    arrivalStyleId: ARRIVAL_STYLE_ID,
  };
}

/**
 * Frozen v1 cross-field invariants. Population 1–6, beds 0–4, 4s feed
 * cooldown. Does not consult POPULATION_CAP or UPGRADE_MAX_LEVEL.beds.
 *
 * @param {LegacyV1State} state
 * @returns {boolean}
 */
export function legacyStateInvariantsHold(state) {
  if (state.glowMicro > state.lifetimeGlowMicro) return false;
  if (state.lifetimeGlowMicro > MAX_GLOW_MICRO) return false;
  if (state.incomeRemainder >= INCOME_REMAINDER_MOD) return false;
  if (state.totalFeeds > FEED_COUNTER_CAP) return false;

  const population = state.slimes.length;
  if (population < 1 || population > LEGACY_POPULATION_CAP) return false;
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
 * Reconstruct a strict v1 envelope from a parsed object whose schema/balance
 * have already been dispatched as 1/1. Extra enumerable fields are dropped.
 *
 * @param {Record<string, unknown>} parsed
 * @returns {LegacyV1Envelope | null}
 */
export function reconstructLegacyEnvelope(parsed) {
  if (parsed.gameId !== GAME_ID) return null;
  if (parsed.schemaVersion !== LEGACY_SCHEMA_VERSION) return null;
  if (parsed.balanceVersion !== LEGACY_BALANCE_VERSION) return null;
  if (!isNonnegSafeInteger(parsed.revision)) return null;
  if (!isSafeInteger(parsed.savedWallMs)) return null;

  const settings = reconstructSettings(parsed.settings);
  if (settings === null) return null;

  const state = reconstructLegacyState(parsed.state);
  if (state === null) return null;
  if (!legacyStateInvariantsHold(state)) return null;

  return {
    gameId: GAME_ID,
    schemaVersion: LEGACY_SCHEMA_VERSION,
    balanceVersion: LEGACY_BALANCE_VERSION,
    revision: parsed.revision,
    savedWallMs: parsed.savedWallMs,
    settings,
    state,
  };
}
