import {
  FEED_BERRY_COST,
  FOOD_FLIGHT_MS,
  MAX_FOOD,
  THROW_COOLDOWN_MS,
  UPGRADE_IDS,
} from './balance.mjs';
import { resolveCompanionsNow } from './progression.mjs';
import {
  getBerryIntervalMs,
  getNextUpgradeCostMicro,
  isValidFoodTarget,
} from './selectors.mjs';
import { cloneState } from './state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').SlimeId} SlimeId
 * @typedef {import('./state.mjs').UpgradeId} UpgradeId
 * @typedef {import('./state.mjs').TutorialStep} TutorialStep
 * @typedef {import('./state.mjs').PointXZ} PointXZ
 * @typedef {import('./state.mjs').FoodId} FoodId
 *
 * @typedef {{ type: 'THROW_FOOD', target: PointXZ }} ThrowFoodCommand
 * @typedef {{ type: 'BUY_UPGRADE', upgradeId: UpgradeId, expectedLevel: number }} BuyUpgradeCommand
 * @typedef {ThrowFoodCommand | BuyUpgradeCommand} Command
 *
 * Reject order for THROW_FOOD (first failure wins):
 * 1. Missing/non-object command, missing type, or `target` missing/not a plain
 *    object → `INVALID_COMMAND`.
 * 2. `target` present but not a finite `{x,z}` **or** not legal grass
 *    (`!isValidFoodTarget`, including outside rect / gate lane / arrival
 *    corridor / prop exclusion / no static eating approach; also NaN/Infinity)
 *    → `INVALID_TARGET`. Clicks are never clamped.
 * 3. `world.foods.length >= 12` (flying+landed+claimed+eating) → `FOOD_LIMIT`.
 * 4. `berries < 1` → `NO_BERRIES`.
 * 5. `simTimeMs < nextThrowAllowedAtMs` (alias of `nextFeedAllowedAtMs`)
 *    → `THROW_COOLDOWN`.
 * 6. `nextFoodSequence` cannot safely increment → `ID_LIMIT`.
 *
 * @typedef {'INVALID_COMMAND' | 'INVALID_TARGET' | 'NO_VALID_TARGET' | 'FOOD_LIMIT' | 'NO_BERRIES' | 'THROW_COOLDOWN' | 'ID_LIMIT' | 'UNKNOWN_UPGRADE' | 'MAX_LEVEL' | 'INSUFFICIENT_GLOW' | 'STALE_REQUEST'} RejectReason
 *
 * @typedef {object} GameEvent
 * @property {'FOOD_THROWN' | 'UPGRADE_BOUGHT' | 'COMPANION_ADDED' | 'TUTORIAL_COMPLETED'} type
 * @property {FoodId} [foodId]
 * @property {PointXZ} [target]
 * @property {SlimeId} [slimeId]
 * @property {number} [atMs]
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
 * Shared FEED/THROW cooldown integer. Prefers the throw name, then the v1 name.
 *
 * @param {GameState} state
 * @returns {number}
 */
function throwCooldownAtMs(state) {
  if (Number.isInteger(state.nextThrowAllowedAtMs)) {
    return state.nextThrowAllowedAtMs;
  }
  if (Number.isInteger(state.nextFeedAllowedAtMs)) {
    return state.nextFeedAllowedAtMs;
  }
  return 0;
}

/**
 * True when `nextFoodSequence` can become a new `food-n` id.
 *
 * @param {number | undefined} sequence
 * @returns {boolean}
 */
function canAllocateFoodSequence(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) return false;
  if (sequence >= Number.MAX_SAFE_INTEGER) return false;
  const next = sequence + 1;
  return Number.isSafeInteger(next) && next > sequence;
}

/**
 * THROW_FOOD against already time-settled state. Never mutates input.
 * Rejections return the original state object. Does not grant boost, increment
 * feed counters, or emit FED.
 *
 * @param {GameState} state
 * @param {Record<string, unknown>} command
 * @returns {CommandResult}
 */
function applyThrowFood(state, command) {
  if (!('target' in command) || !isPlainObject(command.target)) {
    return reject(state, 'INVALID_COMMAND');
  }
  const raw = command.target;
  const x = raw.x;
  const z = raw.z;
  if (
    typeof x !== 'number' ||
    typeof z !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(z)
  ) {
    return reject(state, 'INVALID_TARGET');
  }
  const target = { x, z };
  if (!isValidFoodTarget(target)) {
    return reject(state, 'INVALID_TARGET');
  }

  const foods = state.world?.foods;
  const foodCount = Array.isArray(foods) ? foods.length : 0;
  if (foodCount >= MAX_FOOD) {
    return reject(state, 'FOOD_LIMIT');
  }
  if (state.berries < FEED_BERRY_COST) {
    return reject(state, 'NO_BERRIES');
  }
  const t = state.simTimeMs;
  if (t < throwCooldownAtMs(state)) {
    return reject(state, 'THROW_COOLDOWN');
  }
  const sequence = state.world?.nextFoodSequence ?? 1;
  if (!canAllocateFoodSequence(sequence)) {
    return reject(state, 'ID_LIMIT');
  }

  const next = cloneState(state);
  const wasFull = next.nextBerryAtMs === null;
  next.berries -= FEED_BERRY_COST;
  if (wasFull) {
    next.nextBerryAtMs = t + getBerryIntervalMs(next);
  }
  next.nextThrowAllowedAtMs = t + THROW_COOLDOWN_MS;

  const world = next.world;
  const createdWorldMs = world.timeMs + world.carryMs;
  const foodId = /** @type {FoodId} */ (`food-${sequence}`);
  world.foods.push({
    id: foodId,
    target: { x: target.x, z: target.z },
    createdWorldMs,
    landAtWorldMs: createdWorldMs + FOOD_FLIGHT_MS,
    stage: 'flying',
    claimedBy: null,
    eatUntilWorldMs: null,
  });
  world.nextFoodSequence = sequence + 1;

  /** @type {GameEvent[]} */
  const events = [
    {
      type: 'FOOD_THROWN',
      foodId,
      target: { x: target.x, z: target.z },
      atMs: t,
    },
  ];
  completeTutorial(next, events, 'throw', t);
  return { ok: true, state: next, events };
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
 * Tutorial-only acknowledgement for pet/camera. Clones; never changes Glow,
 * berries, food, bonuses, positions, or membership. Other step ids are ignored
 * (`throw` completes on THROW_FOOD; `feed` completes on a meal).
 *
 * @param {GameState} state
 * @param {unknown} step
 * @returns {{ state: GameState, events: GameEvent[] }}
 */
export function completeHint(state, step) {
  if (step !== 'pet' && step !== 'camera') {
    return { state, events: [] };
  }
  if (state.tutorialCompleted.includes(step)) {
    return { state, events: [] };
  }
  const next = cloneState(state);
  /** @type {GameEvent[]} */
  const events = [];
  completeTutorial(next, events, step, next.simTimeMs);
  return { state: next, events };
}

/**
 * Apply one economic command to an already time-settled state.
 * `state.simTimeMs` is the command timestamp `t`. Does not call `advance`.
 * Never mutates `state`. Rejections return the original input object.
 *
 * FEED and WELCOME_COMPANION are not production commands (INVALID_COMMAND).
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
    case 'THROW_FOOD':
      return applyThrowFood(state, command);
    case 'BUY_UPGRADE':
      return applyBuyUpgrade(state, command);
    case 'FEED':
      return reject(state, 'INVALID_COMMAND');
    case 'WELCOME_COMPANION':
      return reject(state, 'INVALID_COMMAND');
    default:
      return reject(state, 'INVALID_COMMAND');
  }
}
