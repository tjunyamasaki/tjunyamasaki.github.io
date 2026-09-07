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

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').UpgradeId} UpgradeId
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
