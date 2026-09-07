import {
  ARRIVAL_STYLE_ID,
  BASE_BERRY_INTERVAL_MS,
  HABITAT_ID,
  SLIME_NAMES,
  STARTING_BERRIES,
  STARTING_GLOW_MICRO,
  STARTING_INCOME_REMAINDER,
  STARTING_LIFETIME_GLOW_MICRO,
  STARTING_NEXT_FEED_ALLOWED_AT_MS,
  STARTING_SIM_TIME_MS,
} from './balance.mjs';

/**
 * @typedef {'shrub' | 'pantry' | 'bloom' | 'beds'} UpgradeId
 * @typedef {'feed' | 'berry' | 'welcome' | 'upgrade'} TutorialStep
 * @typedef {`slime-${number}`} SlimeId
 *
 * @typedef {object} SlimeState
 * @property {SlimeId} id
 * @property {string} name
 * @property {number} createdAtMs Logical simulation time of creation.
 * @property {number} boostUntilMs Logical expiry; bonus is active while simTimeMs < this.
 * @property {number} feedCount
 * @property {number} homeSlot Unique slot 0–5; the first resident uses 0.
 *
 * @typedef {object} GameState
 * @property {number} simTimeMs
 * @property {number} glowMicro
 * @property {number} lifetimeGlowMicro
 * @property {number} incomeRemainder
 * @property {number} berries
 * @property {number | null} nextBerryAtMs
 * @property {number} nextFeedAllowedAtMs
 * @property {number} totalFeeds
 * @property {Record<UpgradeId, number>} upgrades
 * @property {SlimeState[]} slimes
 * @property {TutorialStep[]} tutorialCompleted
 * @property {'garden-prototype-v1'} habitatId
 * @property {'visitor-v1'} arrivalStyleId
 */

/**
 * Fresh v1 save: one resident, empty wallet, starting berries, all upgrades at 0.
 * Returns a new object tree every call; callers may freeze the result.
 *
 * @returns {GameState}
 */
export function createInitialState() {
  return {
    simTimeMs: STARTING_SIM_TIME_MS,
    glowMicro: STARTING_GLOW_MICRO,
    lifetimeGlowMicro: STARTING_LIFETIME_GLOW_MICRO,
    incomeRemainder: STARTING_INCOME_REMAINDER,
    berries: STARTING_BERRIES,
    nextBerryAtMs: BASE_BERRY_INTERVAL_MS,
    nextFeedAllowedAtMs: STARTING_NEXT_FEED_ALLOWED_AT_MS,
    totalFeeds: 0,
    upgrades: {
      shrub: 0,
      pantry: 0,
      bloom: 0,
      beds: 0,
    },
    slimes: [
      {
        id: 'slime-1',
        name: SLIME_NAMES[0],
        createdAtMs: 0,
        boostUntilMs: 0,
        feedCount: 0,
        homeSlot: 0,
      },
    ],
    tutorialCompleted: [],
    habitatId: HABITAT_ID,
    arrivalStyleId: ARRIVAL_STYLE_ID,
  };
}

/**
 * Deep clone of a game state. Nested upgrades, slimes, and tutorial IDs are new.
 * Does not mutate `state`. Used by time integration so frozen inputs stay intact.
 *
 * @param {GameState} state
 * @returns {GameState}
 */
export function cloneState(state) {
  return {
    simTimeMs: state.simTimeMs,
    glowMicro: state.glowMicro,
    lifetimeGlowMicro: state.lifetimeGlowMicro,
    incomeRemainder: state.incomeRemainder,
    berries: state.berries,
    nextBerryAtMs: state.nextBerryAtMs,
    nextFeedAllowedAtMs: state.nextFeedAllowedAtMs,
    totalFeeds: state.totalFeeds,
    upgrades: {
      shrub: state.upgrades.shrub,
      pantry: state.upgrades.pantry,
      bloom: state.upgrades.bloom,
      beds: state.upgrades.beds,
    },
    slimes: state.slimes.map((slime) => ({
      id: slime.id,
      name: slime.name,
      createdAtMs: slime.createdAtMs,
      boostUntilMs: slime.boostUntilMs,
      feedCount: slime.feedCount,
      homeSlot: slime.homeSlot,
    })),
    tutorialCompleted: [...state.tutorialCompleted],
    habitatId: state.habitatId,
    arrivalStyleId: state.arrivalStyleId,
  };
}
