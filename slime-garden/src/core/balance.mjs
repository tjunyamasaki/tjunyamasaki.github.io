/**
 * Centralized v1 economy constants. Integer micro-Glow and milliseconds.
 * Core must not import DOM, Three, wall-clock APIs, or randomness.
 */

export const MICRO_PER_GLOW = 1_000_000;
export const MAX_GLOW_MICRO = 9_000_000_000_000;
export const OFFLINE_CAP_MS = 28_800_000;
export const FEED_COOLDOWN_MS = 4_000;
export const BONUS_EXTEND_MS = 120_000;
export const BONUS_MAX_REMAINING_MS = 300_000;
export const BONUS_MULTIPLIER = 2;
export const BASE_RATE_MICRO_PER_SECOND = 100_000;
/** Applied as `1 + BLOOM_BONUS_PER_LEVEL * bloomLevel`. Legal levels yield integer rates. */
export const BLOOM_BONUS_PER_LEVEL = 0.25;

export const STARTING_BERRIES = 6;
export const BASE_BERRY_CAPACITY = 12;
export const BASE_BERRY_INTERVAL_MS = 15_000;
export const BASE_RESIDENT_CAPACITY = 2;
export const STARTING_POPULATION = 1;
export const POPULATION_CAP = 6;
export const FEED_BERRY_COST = 1;
export const FEED_COUNTER_CAP = 1_000_000_000;
export const LOGICAL_TIME_MAX_MS = 1_000_000_000_000;
/** Remainder modulus when converting per-second rates across millisecond spans. */
export const INCOME_REMAINDER_MOD = 1000;
export const STARTING_SIM_TIME_MS = 0;
export const STARTING_GLOW_MICRO = 0;
export const STARTING_LIFETIME_GLOW_MICRO = 0;
export const STARTING_INCOME_REMAINDER = 0;
export const STARTING_NEXT_FEED_ALLOWED_AT_MS = 0;
export const INITIAL_HOME_SLOT = 0;
export const NAME_MAX_LENGTH = 32;

export const SCHEMA_VERSION = 1;
export const BALANCE_VERSION = 1;
export const GAME_ID = 'cozy-slime-mvp';
export const HABITAT_ID = 'garden-prototype-v1';
export const ARRIVAL_STYLE_ID = 'visitor-v1';

export const TUTORIAL_STEPS = Object.freeze(
  /** @type {const} */ (['feed', 'berry', 'welcome', 'upgrade']),
);

export const SLIME_NAMES = Object.freeze([
  'Slime 1',
  'Slime 2',
  'Slime 3',
  'Slime 4',
  'Slime 5',
  'Slime 6',
]);

export const UPGRADE_IDS = Object.freeze(
  /** @type {const} */ (['shrub', 'pantry', 'bloom', 'beds']),
);

export const UPGRADE_MAX_LEVEL = Object.freeze({
  shrub: 3,
  pantry: 2,
  bloom: 5,
  beds: 4,
});

/** Glow prices to buy shrub levels 1, 2, and 3. */
export const SHRUB_COSTS_GLOW = Object.freeze([15, 60, 180]);
/** Berry interval by shrub level 0–3. */
export const SHRUB_INTERVALS_MS = Object.freeze([15_000, 12_000, 10_000, 8_000]);

export const PANTRY_COSTS_GLOW = Object.freeze([30, 100]);
/** Berry capacity by pantry level 0–2. */
export const PANTRY_CAPACITIES = Object.freeze([12, 18, 24]);

export const BLOOM_COSTS_GLOW = Object.freeze([20, 70, 220, 650, 1800]);

export const BEDS_COSTS_GLOW = Object.freeze([40, 140, 400, 1000]);
/** Resident capacity by beds level 0–4. */
export const BEDS_CAPACITIES = Object.freeze([2, 3, 4, 5, 6]);

export const SHRUB_COSTS_MICRO = Object.freeze(
  SHRUB_COSTS_GLOW.map((glow) => glow * MICRO_PER_GLOW),
);
export const PANTRY_COSTS_MICRO = Object.freeze(
  PANTRY_COSTS_GLOW.map((glow) => glow * MICRO_PER_GLOW),
);
export const BLOOM_COSTS_MICRO = Object.freeze(
  BLOOM_COSTS_GLOW.map((glow) => glow * MICRO_PER_GLOW),
);
export const BEDS_COSTS_MICRO = Object.freeze(
  BEDS_COSTS_GLOW.map((glow) => glow * MICRO_PER_GLOW),
);

export const UPGRADE_COSTS_MICRO = Object.freeze({
  shrub: SHRUB_COSTS_MICRO,
  pantry: PANTRY_COSTS_MICRO,
  bloom: BLOOM_COSTS_MICRO,
  beds: BEDS_COSTS_MICRO,
});

/**
 * Unboosted micro-Glow/s for one resident at Bloom levels 0–5.
 * `100_000 * (1 + 0.25 * level)` is an integer on this range.
 */
export const BLOOM_RATE_MICRO_PER_SECOND_BY_LEVEL = Object.freeze(
  Array.from(
    { length: UPGRADE_MAX_LEVEL.bloom + 1 },
    (_, level) =>
      BASE_RATE_MICRO_PER_SECOND + (BASE_RATE_MICRO_PER_SECOND * level) / 4,
  ),
);

/**
 * Cumulative requirements to welcome the next resident (population 2…6).
 * Glow gates use lifetime earned micro-Glow, never the spendable wallet.
 */
export const COMPANION_MILESTONES = Object.freeze([
  Object.freeze({
    nextPopulation: 2,
    requiredFeeds: 6,
    requiredLifetimeGlowMicro: 12 * MICRO_PER_GLOW,
    requiredCapacity: 2,
  }),
  Object.freeze({
    nextPopulation: 3,
    requiredFeeds: 24,
    requiredLifetimeGlowMicro: 90 * MICRO_PER_GLOW,
    requiredCapacity: 3,
  }),
  Object.freeze({
    nextPopulation: 4,
    requiredFeeds: 60,
    requiredLifetimeGlowMicro: 300 * MICRO_PER_GLOW,
    requiredCapacity: 4,
  }),
  Object.freeze({
    nextPopulation: 5,
    requiredFeeds: 120,
    requiredLifetimeGlowMicro: 900 * MICRO_PER_GLOW,
    requiredCapacity: 5,
  }),
  Object.freeze({
    nextPopulation: 6,
    requiredFeeds: 200,
    requiredLifetimeGlowMicro: 2200 * MICRO_PER_GLOW,
    requiredCapacity: 6,
  }),
]);

export const BALANCE = Object.freeze({
  MICRO_PER_GLOW,
  MAX_GLOW_MICRO,
  OFFLINE_CAP_MS,
  FEED_COOLDOWN_MS,
  BONUS_EXTEND_MS,
  BONUS_MAX_REMAINING_MS,
  BONUS_MULTIPLIER,
  BASE_RATE_MICRO_PER_SECOND,
  BLOOM_BONUS_PER_LEVEL,
  STARTING_BERRIES,
  BASE_BERRY_CAPACITY,
  BASE_BERRY_INTERVAL_MS,
  BASE_RESIDENT_CAPACITY,
  STARTING_POPULATION,
  POPULATION_CAP,
  FEED_BERRY_COST,
  FEED_COUNTER_CAP,
  LOGICAL_TIME_MAX_MS,
  INCOME_REMAINDER_MOD,
  SCHEMA_VERSION,
  BALANCE_VERSION,
  GAME_ID,
  HABITAT_ID,
  ARRIVAL_STYLE_ID,
  TUTORIAL_STEPS,
  SLIME_NAMES,
  UPGRADE_IDS,
  UPGRADE_MAX_LEVEL,
  SHRUB_COSTS_GLOW,
  SHRUB_COSTS_MICRO,
  SHRUB_INTERVALS_MS,
  PANTRY_COSTS_GLOW,
  PANTRY_COSTS_MICRO,
  PANTRY_CAPACITIES,
  BLOOM_COSTS_GLOW,
  BLOOM_COSTS_MICRO,
  BLOOM_RATE_MICRO_PER_SECOND_BY_LEVEL,
  BEDS_COSTS_GLOW,
  BEDS_COSTS_MICRO,
  BEDS_CAPACITIES,
  UPGRADE_COSTS_MICRO,
  COMPANION_MILESTONES,
});
