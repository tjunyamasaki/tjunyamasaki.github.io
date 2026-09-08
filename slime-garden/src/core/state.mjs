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
  STARTING_NEXT_THROW_ALLOWED_AT_MS,
  STARTING_SIM_TIME_MS,
} from './balance.mjs';
import {
  attachThrowCooldownAlias,
  attachWorld,
  cloneGameState,
  createWorld,
  syncWorldRoster,
} from '../world/state.mjs';

export { createWorld, syncWorldRoster };

/**
 * @typedef {'shrub' | 'pantry' | 'bloom' | 'beds'} UpgradeId
 * @typedef {'feed' | 'berry' | 'welcome' | 'upgrade' | 'throw' | 'pet' | 'camera'} TutorialStep
 * @typedef {`slime-${number}`} SlimeId
 * @typedef {`food-${number}`} FoodId
 * @typedef {{ x: number, z: number }} PointXZ
 * @typedef {'idle' | 'wandering' | 'seekingFood' | 'eating' | 'arriving' | 'yielding'} Activity
 * @typedef {'flying' | 'landed' | 'claimed' | 'eating'} FoodStage
 *
 * @typedef {object} SlimeState
 * @property {SlimeId} id
 * @property {string} name
 * @property {number} createdAtMs Logical simulation time of creation.
 * @property {number} boostUntilMs Logical expiry; bonus is active while simTimeMs < this.
 * @property {number} feedCount
 * @property {number} homeSlot Unique slot 0–9; slime-n uses n-1.
 *
 * @typedef {object} RouteState
 * @property {PointXZ[]} points Includes exact start/end.
 * @property {number} length
 * @property {number} startedWorldMs
 * @property {number} cycleCount
 * @property {number} distanceAlong
 *
 * @typedef {object} WorldResident
 * @property {SlimeId} id
 * @property {PointXZ} position
 * @property {number} yaw
 * @property {Activity} activity
 * @property {RouteState | null} route
 * @property {FoodId | null} targetFoodId
 * @property {number} nextDecisionWorldMs
 * @property {number} restUntilWorldMs
 * @property {number | null} blockedSinceWorldMs
 * @property {number} nextReplanWorldMs
 * @property {number} behaviorCounter
 *
 * @typedef {object} FoodState
 * @property {FoodId} id
 * @property {PointXZ} target
 * @property {number} createdWorldMs
 * @property {number} landAtWorldMs
 * @property {FoodStage} stage
 * @property {SlimeId | null} claimedBy
 * @property {number | null} eatUntilWorldMs
 *
 * @typedef {object} WorldState
 * @property {number} timeMs Completed active ms; multiple of 50.
 * @property {number} carryMs Integer 0..49.
 * @property {number} nextFoodSequence
 * @property {FoodState[]} foods
 * @property {WorldResident[]} residents
 *
 * @typedef {object} GameState
 * @property {number} simTimeMs
 * @property {number} glowMicro
 * @property {number} lifetimeGlowMicro
 * @property {number} incomeRemainder
 * @property {number} berries
 * @property {number | null} nextBerryAtMs
 * @property {number} nextFeedAllowedAtMs v1 FEED clock; alias of nextThrowAllowedAtMs until P2-07.
 * @property {number} nextThrowAllowedAtMs Phase-2 throw clock; same integer as nextFeedAllowedAtMs.
 * @property {number} totalFeeds
 * @property {Record<UpgradeId, number>} upgrades
 * @property {SlimeState[]} slimes
 * @property {TutorialStep[]} tutorialCompleted
 * @property {'garden-prototype-v1'} habitatId v1 persistence id until P2-03 writes farm-v2.
 * @property {'visitor-v1'} arrivalStyleId
 * @property {WorldState} world In-memory v2 world. Non-enumerable until P2-03 so v1 JSON round-trips.
 */

/**
 * Fresh game: one resident, empty wallet, starting berries, all upgrades at 0,
 * empty world foods, sequence 1, world clock 0, idle resident at slot 0 (0, 2).
 * `habitatId` stays `garden-prototype-v1` so current validateSave still accepts
 * a freshly serialized envelope. HABITAT_ID_V2 lives on FARM_LAYOUT.id.
 *
 * `world` and `nextThrowAllowedAtMs` are non-enumerable so JSON.stringify /
 * serializeEnvelope keep the v1 field set until P2-03. Property access works.
 *
 * @returns {GameState}
 */
export function createInitialState() {
  const slimes = [
    {
      id: /** @type {SlimeId} */ ('slime-1'),
      name: SLIME_NAMES[0],
      createdAtMs: 0,
      boostUntilMs: 0,
      feedCount: 0,
      homeSlot: 0,
    },
  ];
  const state = {
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
    slimes,
    tutorialCompleted: [],
    habitatId: HABITAT_ID,
    arrivalStyleId: ARRIVAL_STYLE_ID,
  };
  attachThrowCooldownAlias(state, STARTING_NEXT_THROW_ALLOWED_AT_MS);
  attachWorld(state, createWorld(slimes));
  return state;
}

/**
 * Deep clone of a game state. Nested upgrades, slimes, tutorial IDs, world,
 * foods, residents, and route.points are new objects (no shared path arrays).
 * Copies both cooldown names to the same integer (prefers nextThrowAllowedAtMs).
 * Does not mutate `state`.
 *
 * @param {GameState} state
 * @returns {GameState}
 */
export function cloneState(state) {
  return cloneGameState(state);
}
