import {
  BEDS_CAPACITIES,
  BLOOM_RATE_MICRO_PER_SECOND_BY_LEVEL,
  BONUS_MULTIPLIER,
  COMPANION_MILESTONES,
  PANTRY_CAPACITIES,
  POPULATION_CAP,
  SHRUB_INTERVALS_MS,
  UPGRADE_COSTS_MICRO,
} from './balance.mjs';
import {
  homePosition,
  isFinitePoint,
  isValidFoodTarget,
  NEAR_SELECTED_TARGET_RADIUS,
} from '../world/layout.mjs';

export { isFinitePoint, isValidFoodTarget };

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').UpgradeId} UpgradeId
 * @typedef {import('./state.mjs').SlimeId} SlimeId
 * @typedef {import('./state.mjs').PointXZ} PointXZ
 *
 * @typedef {object} CompanionEligibility
 * @property {number | null} nextPopulation
 * @property {number} requiredFeeds
 * @property {number} requiredLifetimeGlowMicro
 * @property {number} requiredCapacity
 * @property {boolean} feedsMet
 * @property {boolean} glowMet
 * @property {boolean} capacityMet
 * @property {boolean} ready
 */

/**
 * Instantaneous production in micro-Glow per second.
 * Bloom is additive by level (`1 + 0.25 * bloomLevel`). Cozy bonus is ×2 while
 * `state.simTimeMs < slime.boostUntilMs`.
 *
 * @param {GameState} state
 * @returns {number}
 */
export function getRateMicroPerSecond(state) {
  const perResidentUnboosted =
    BLOOM_RATE_MICRO_PER_SECOND_BY_LEVEL[state.upgrades.bloom];
  let total = 0;
  for (const slime of state.slimes) {
    const cozy =
      state.simTimeMs < slime.boostUntilMs ? BONUS_MULTIPLIER : 1;
    total += perResidentUnboosted * cozy;
  }
  return total;
}

/**
 * @param {GameState} state
 * @returns {number}
 */
export function getBerryCapacity(state) {
  return PANTRY_CAPACITIES[state.upgrades.pantry];
}

/**
 * @param {GameState} state
 * @returns {number}
 */
export function getBerryIntervalMs(state) {
  return SHRUB_INTERVALS_MS[state.upgrades.shrub];
}

/**
 * @param {GameState} state
 * @returns {number}
 */
export function getResidentCapacity(state) {
  return BEDS_CAPACITIES[state.upgrades.beds];
}

/**
 * Cost in micro-Glow to buy the next level of `id`, or `null` if maxed or unknown.
 *
 * @param {GameState} state
 * @param {string} id
 * @returns {number | null}
 */
export function getNextUpgradeCostMicro(state, id) {
  const costs = UPGRADE_COSTS_MICRO[/** @type {UpgradeId} */ (id)];
  if (!costs) return null;
  const level = state.upgrades[/** @type {UpgradeId} */ (id)];
  if (!Number.isInteger(level) || level < 0 || level >= costs.length) {
    return null;
  }
  return costs[level];
}

/**
 * True when the next level of `upgradeId` exists and the wallet covers it.
 *
 * @param {GameState} state
 * @param {string} upgradeId
 * @returns {boolean}
 */
export function isAffordable(state, upgradeId) {
  const cost = getNextUpgradeCostMicro(state, upgradeId);
  return cost != null && state.glowMicro >= cost;
}

/**
 * Next companion gates. `glowMet` uses lifetime earned Glow, not the wallet.
 * At population cap, `nextPopulation` is null and `ready` is false; required
 * fields repeat the last milestone.
 *
 * @param {GameState} state
 * @returns {CompanionEligibility}
 */
export function getCompanionEligibility(state) {
  const population = state.slimes.length;
  const lastMilestone = COMPANION_MILESTONES[COMPANION_MILESTONES.length - 1];
  const nextMilestone =
    population >= POPULATION_CAP ? null : COMPANION_MILESTONES[population - 1];
  const required = nextMilestone ?? lastMilestone;
  const feedsMet = state.totalFeeds >= required.requiredFeeds;
  const glowMet = state.lifetimeGlowMicro >= required.requiredLifetimeGlowMicro;
  const capacityMet = getResidentCapacity(state) >= required.requiredCapacity;
  const nextPopulation = nextMilestone ? nextMilestone.nextPopulation : null;
  return {
    nextPopulation,
    requiredFeeds: required.requiredFeeds,
    requiredLifetimeGlowMicro: required.requiredLifetimeGlowMicro,
    requiredCapacity: required.requiredCapacity,
    feedsMet,
    glowMet,
    capacityMet,
    ready: Boolean(nextPopulation !== null && feedsMet && glowMet && capacityMet),
  };
}

/**
 * @param {GameState} state
 * @param {SlimeId} slimeId
 * @returns {PointXZ | null}
 */
function positionForSlime(state, slimeId) {
  const world = state.world;
  if (world && Array.isArray(world.residents)) {
    const resident = world.residents.find((entry) => entry.id === slimeId);
    if (resident && isFinitePoint(resident.position)) {
      return resident.position;
    }
  }
  const slime = state.slimes.find((entry) => entry.id === slimeId);
  if (!slime) return null;
  return homePosition(slime.homeSlot);
}

/**
 * Eight deterministic points around the resident (radius 1.5, angles k·π/4,
 * k=0 faces local +Z). First `isValidFoodTarget`, or null. Does not throw food.
 *
 * @param {GameState} state
 * @param {SlimeId} slimeId
 * @returns {PointXZ | null}
 */
export function resolveNearSelectedTarget(state, slimeId) {
  const slime = state.slimes.find((entry) => entry.id === slimeId);
  if (!slime) return null;
  const origin = positionForSlime(state, slimeId);
  if (!origin) return null;
  const resident = state.world?.residents?.find((entry) => entry.id === slimeId);
  const yaw = typeof resident?.yaw === 'number' && Number.isFinite(resident.yaw)
    ? resident.yaw
    : 0;
  for (let k = 0; k < 8; k += 1) {
    const angle = yaw + (k * Math.PI) / 4;
    const point = {
      x: origin.x + NEAR_SELECTED_TARGET_RADIUS * Math.sin(angle),
      z: origin.z + NEAR_SELECTED_TARGET_RADIUS * Math.cos(angle),
    };
    if (isValidFoodTarget(point)) return point;
  }
  return null;
}
