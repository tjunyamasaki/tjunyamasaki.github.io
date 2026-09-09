import {
  BONUS_EXTEND_MS,
  BONUS_MAX_REMAINING_MS,
  FEED_BERRY_COST,
  FEED_COOLDOWN_MS,
  FEED_COUNTER_CAP,
  UPGRADE_IDS,
} from './balance.mjs';
import { resolveCompanionsNow } from './progression.mjs';
import {
  getBerryIntervalMs,
  getNextUpgradeCostMicro,
} from './selectors.mjs';
import { cloneState } from './state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').SlimeId} SlimeId
 * @typedef {import('./state.mjs').UpgradeId} UpgradeId
 * @typedef {import('./state.mjs').TutorialStep} TutorialStep
 *
 * @typedef {{ type: 'FEED', slimeId: SlimeId }} FeedCommand
 * @typedef {{ type: 'BUY_UPGRADE', upgradeId: UpgradeId, expectedLevel: number }} BuyUpgradeCommand
 * @typedef {FeedCommand | BuyUpgradeCommand} Command
 *
 * @typedef {'UNKNOWN_SLIME' | 'NO_BERRIES' | 'FEED_COOLDOWN' | 'UNKNOWN_UPGRADE' | 'MAX_LEVEL' | 'INSUFFICIENT_GLOW' | 'STALE_REQUEST' | 'NOT_READY' | 'POPULATION_CAP' | 'INVALID_COMMAND'} RejectReason
 *
 * @typedef {object} GameEvent
 * @property {'FED' | 'UPGRADE_BOUGHT' | 'COMPANION_ADDED' | 'TUTORIAL_COMPLETED'} type
 * @property {SlimeId} [slimeId]
 * @property {number} [atMs]
 * @property {number} [boostUntilMs]
 * @property {UpgradeId} [upgradeId]
 * @property {number} [level]
 * @property {number} [homeSlot]
 * @property {TutorialStep} [step]
 *
 * @typedef {{ ok: true, state: GameState, events: GameEvent[] } | { ok: false, reason: RejectReason, state: GameState, events: GameEvent[] }} CommandResult
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {GameState} state
 * @param {RejectReason} reason
 * @returns {CommandResult}
 */
function reject(state, reason) {
  return { ok: false, reason, state, events: [] };
}

/**
 * @param {string} id
 * @returns {id is UpgradeId}
 */
function isUpgradeId(id) {
  return UPGRADE_IDS.includes(/** @type {UpgradeId} */ (id));
}

/**
 * @param {GameState} next
 * @param {GameEvent[]} events
 * @param {TutorialStep} step
 * @param {number} atMs
 */
function completeTutorial(next, events, step, atMs) {
  if (next.tutorialCompleted.includes(step)) return;
  next.tutorialCompleted.push(step);
  events.push({ type: 'TUTORIAL_COMPLETED', step, atMs });
}

/**
 * @param {GameState} state
 * @param {Record<string, unknown>} command
 * @returns {CommandResult}
 */
function applyFeed(state, command) {
  if (typeof command.slimeId !== 'string') {
    return reject(state, 'INVALID_COMMAND');
  }
  const slimeIndex = state.slimes.findIndex((slime) => slime.id === command.slimeId);
  if (slimeIndex < 0) {
    return reject(state, 'UNKNOWN_SLIME');
  }
  if (state.berries < FEED_BERRY_COST) {
    return reject(state, 'NO_BERRIES');
  }
  if (state.simTimeMs < state.nextFeedAllowedAtMs) {
    return reject(state, 'FEED_COOLDOWN');
  }

  const t = state.simTimeMs;
  const next = cloneState(state);
  const wasFull = next.nextBerryAtMs === null;
  next.berries -= FEED_BERRY_COST;
  if (wasFull) {
    next.nextBerryAtMs = t + getBerryIntervalMs(next);
  }
  const slime = next.slimes[slimeIndex];
  const boostUntilMs = Math.min(
    t + BONUS_MAX_REMAINING_MS,
    Math.max(t, slime.boostUntilMs) + BONUS_EXTEND_MS,
  );
  slime.boostUntilMs = boostUntilMs;
  next.nextFeedAllowedAtMs = t + FEED_COOLDOWN_MS;
  if (next.totalFeeds < FEED_COUNTER_CAP) {
    next.totalFeeds += 1;
    slime.feedCount += 1;
  }
  /** @type {GameEvent[]} */
  const events = [
    {
      type: 'FED',
      slimeId: slime.id,
      atMs: t,
      boostUntilMs,
    },
  ];
  completeTutorial(next, events, 'feed', t);
  const joined = resolveCompanionsNow(next);
  return { ok: true, state: joined.state, events: [...events, ...joined.events] };
}

/**
 * @param {GameState} state
 * @param {Record<string, unknown>} command
 * @returns {CommandResult}
 */
function applyBuyUpgrade(state, command) {
  if (typeof command.upgradeId !== 'string' || !Number.isInteger(command.expectedLevel)) {
    return reject(state, 'INVALID_COMMAND');
  }
  if (!isUpgradeId(command.upgradeId)) {
    return reject(state, 'UNKNOWN_UPGRADE');
  }
  const upgradeId = command.upgradeId;
  const currentLevel = state.upgrades[upgradeId];
  if (command.expectedLevel !== currentLevel) {
    return reject(state, 'STALE_REQUEST');
  }
  const cost = getNextUpgradeCostMicro(state, upgradeId);
  if (cost === null) {
    return reject(state, 'MAX_LEVEL');
  }
  if (state.glowMicro < cost) {
    return reject(state, 'INSUFFICIENT_GLOW');
  }

  const t = state.simTimeMs;
  const next = cloneState(state);
  const wasFull = next.nextBerryAtMs === null;
  next.glowMicro -= cost;
  next.upgrades[upgradeId] += 1;
  if (upgradeId === 'shrub') {
    if (next.nextBerryAtMs !== null) {
      next.nextBerryAtMs = t + getBerryIntervalMs(next);
    }
  } else if (upgradeId === 'pantry') {
    if (wasFull) {
      next.nextBerryAtMs = t + getBerryIntervalMs(next);
    }
  }
  const level = next.upgrades[upgradeId];
  /** @type {GameEvent[]} */
  const events = [{ type: 'UPGRADE_BOUGHT', upgradeId, level, atMs: t }];
  completeTutorial(next, events, 'upgrade', t);
  const joined = resolveCompanionsNow(next);
  return { ok: true, state: joined.state, events: [...events, ...joined.events] };
}

/**
 * Apply one economic command to an already time-settled state.
 * `state.simTimeMs` is the command timestamp `t`. Does not call `advance`.
 * Never mutates `state`. Rejections return the original input object.
 *
 * @param {GameState} state
 * @param {unknown} command
 * @returns {CommandResult}
 */
export function applyCommand(state, command) {
  if (!isPlainObject(command) || typeof command.type !== 'string') {
    return reject(state, 'INVALID_COMMAND');
  }
  switch (command.type) {
    case 'FEED':
      return applyFeed(state, command);
    case 'BUY_UPGRADE':
      return applyBuyUpgrade(state, command);
    case 'WELCOME_COMPANION':
      return reject(state, 'INVALID_COMMAND');
    default:
      return reject(state, 'INVALID_COMMAND');
  }
}
