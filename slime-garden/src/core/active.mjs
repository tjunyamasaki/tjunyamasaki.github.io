/**
 * Active world/economy integration. Visible time uses a 50 ms world clock
 * with persistent carry; income still uses sim time via `advancePassive`.
 * Meal settlement (`finishMeal`) applies Glow, counters, and FED after each
 * world step. Never mutates its input.
 * Pure: no DOM, Three, wall-clock APIs, or randomness.
 */

import {
  BONUS_EXTEND_MS,
  BONUS_MAX_REMAINING_MS,
  FEED_COUNTER_CAP,
  MAX_WORLD_STEPS_PER_ADVANCE,
  POST_MEAL_REST_MS,
  WORLD_STEP_MS,
} from './balance.mjs';
import { advancePassive } from './advance.mjs';
import { resolveCompanionsNow } from './progression.mjs';
import { cloneState, syncWorldRoster } from './state.mjs';
import { planActiveArrival, scheduleIdleWait } from '../world/behavior.mjs';
import { isMealConsistent } from '../world/eating.mjs';
import { foodNumericId } from '../world/food.mjs';
import { stepWorld } from '../world/step.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').SlimeId} SlimeId
 * @typedef {import('./state.mjs').TutorialStep} TutorialStep
 * @typedef {import('./advance.mjs').GameEvent} GameEvent
 * @typedef {import('./advance.mjs').AdvanceResult} AdvanceResult
 * @typedef {{ foodId: string, slimeId: string }} MealCompletion
 * @typedef {{ state: GameState, events: GameEvent[], rewarded: boolean }} MealResult
 */

export { planActiveArrival } from '../world/behavior.mjs';
export { stepWorld } from '../world/step.mjs';

const MAX_ACTIVE_ELAPSED_MS = MAX_WORLD_STEPS_PER_ADVANCE * WORLD_STEP_MS;

/**
 * @param {unknown} state
 * @param {unknown} elapsedMs
 */
function assertActiveArgs(state, elapsedMs) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('advanceActive: state must be a game state object');
  }
  if (typeof elapsedMs !== 'number' || Number.isNaN(elapsedMs)) {
    throw new TypeError('advanceActive: elapsedMs must be a number');
  }
  if (
    !Number.isInteger(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > MAX_ACTIVE_ELAPSED_MS
  ) {
    throw new RangeError(
      `advanceActive: elapsedMs must be an integer in 0..${MAX_ACTIVE_ELAPSED_MS}`,
    );
  }
}

/**
 * @param {GameEvent[]} events
 * @returns {SlimeId[]}
 */
function companionIdsFrom(events) {
  /** @type {SlimeId[]} */
  const ids = [];
  for (const event of events) {
    if (event.type === 'COMPANION_ADDED' && event.slimeId) {
      ids.push(event.slimeId);
    }
  }
  return ids;
}

/**
 * @param {GameState} state
 * @returns {boolean}
 */
function rosterMismatch(state) {
  const slimes = state.slimes;
  const residents = state.world?.residents;
  if (!Array.isArray(residents) || slimes.length !== residents.length) return true;
  for (let index = 0; index < slimes.length; index += 1) {
    if (slimes[index].id !== residents[index].id) return true;
  }
  return false;
}

/**
 * @param {SlimeId[]} ids
 * @returns {SlimeId[]}
 */
function uniqueIds(ids) {
  /** @type {SlimeId[]} */
  const unique = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

/**
 * @param {GameState} next
 * @param {GameEvent[]} events
 * @param {string} step
 * @param {number} atMs
 */
function completeTutorial(next, events, step, atMs) {
  if (next.tutorialCompleted.includes(/** @type {TutorialStep} */ (step))) return;
  next.tutorialCompleted.push(/** @type {TutorialStep} */ (step));
  events.push({ type: 'TUTORIAL_COMPLETED', step, atMs });
}

/**
 * @param {MealCompletion[]} meals
 * @returns {MealCompletion[]}
 */
function mealsInFoodOrder(meals) {
  return [...meals].sort(
    (a, b) => foodNumericId(a.foodId) - foodNumericId(b.foodId),
  );
}

/**
 * Apply one due meal on a working clone: remove food, rest, boost, counters,
 * FED, feed tutorial, then current-time companions. Never mutates `state`.
 * Not a public command; `applyCommand` cannot reach this.
 *
 * @param {GameState} state
 * @param {MealCompletion} meal
 * @returns {MealResult}
 */
export function finishMeal(state, meal) {
  const next = cloneState(state);
  /** @type {GameEvent[]} */
  const events = [];
  if (!meal || typeof meal.foodId !== 'string' || typeof meal.slimeId !== 'string') {
    return { state: next, events, rewarded: false };
  }
  const food = next.world.foods.find((entry) => entry.id === meal.foodId);
  if (!food || food.claimedBy !== meal.slimeId) {
    return { state: next, events, rewarded: false };
  }
  const slime = next.slimes.find((entry) => entry.id === meal.slimeId);
  if (!slime || !isMealConsistent(next.world, food)) {
    return { state: next, events, rewarded: false };
  }

  next.world.foods = next.world.foods.filter((entry) => entry.id !== meal.foodId);
  const resident = next.world.residents.find((entry) => entry.id === meal.slimeId);
  if (resident) {
    resident.targetFoodId = null;
    resident.route = null;
    resident.activity = 'idle';
    resident.blockedSinceWorldMs = null;
    scheduleIdleWait(resident, next.world.timeMs);
    resident.restUntilWorldMs = next.world.timeMs + POST_MEAL_REST_MS;
  }

  const t = next.simTimeMs;
  slime.boostUntilMs = Math.min(
    t + BONUS_MAX_REMAINING_MS,
    Math.max(t, slime.boostUntilMs) + BONUS_EXTEND_MS,
  );
  if (next.totalFeeds < FEED_COUNTER_CAP) {
    next.totalFeeds += 1;
    slime.feedCount += 1;
  }
  events.push({
    type: 'FED',
    foodId: meal.foodId,
    slimeId: meal.slimeId,
    atMs: t,
    boostUntilMs: slime.boostUntilMs,
  });
  completeTutorial(next, events, 'feed', t);

  const joined = resolveCompanionsNow(next);
  return {
    state: joined.state,
    events: [...events, ...joined.events],
    rewarded: true,
  };
}

/**
 * Integrate visible time with a 50 ms world step. Elapsed is an integer in
 * `0..5000`. Path math uses world time; income uses sim time. Boost from a
 * meal applies after that slice's income.
 *
 * @param {GameState} state
 * @param {number} elapsedMs
 * @returns {AdvanceResult}
 */
export function advanceActive(state, elapsedMs) {
  assertActiveArgs(state, elapsedMs);

  const opened = resolveCompanionsNow(/** @type {GameState} */ (state));
  let current = opened.state;
  if (rosterMismatch(current)) {
    current = syncWorldRoster(current);
  }

  /** @type {GameEvent[]} */
  const events = [...opened.events];
  /** @type {SlimeId[]} */
  const companionsAdded = companionIdsFrom(opened.events);
  /** @type {SlimeId[]} */
  const pendingArrivals = elapsedMs > 0 ? [...companionsAdded] : [];

  if (elapsedMs === 0) {
    return {
      state: current,
      events,
      summary: {
        elapsedMs: 0,
        glowEarnedMicro: 0,
        berriesGained: 0,
        mealsCompleted: 0,
        companionsAdded,
      },
    };
  }

  let remaining = elapsedMs;
  let steps = 0;
  let glowEarnedMicro = 0;
  let berriesGained = 0;
  let mealsCompleted = 0;

  while (remaining > 0) {
    const carry = current.world.carryMs;
    const room = WORLD_STEP_MS - carry;
    const wouldStep = remaining >= room;
    if (steps >= MAX_WORLD_STEPS_PER_ADVANCE && wouldStep) {
      const flushed = advancePassive(current, remaining);
      current = flushed.state;
      events.push(...flushed.events);
      glowEarnedMicro += flushed.summary.glowEarnedMicro;
      berriesGained += flushed.summary.berriesGained;
      companionsAdded.push(...companionIdsFrom(flushed.events));
      remaining = 0;
      break;
    }

    const slice = Math.min(remaining, room);
    const beforeIds = new Set(current.slimes.map((slime) => slime.id));
    const passive = advancePassive(current, slice);
    current = passive.state;
    events.push(...passive.events);
    glowEarnedMicro += passive.summary.glowEarnedMicro;
    berriesGained += passive.summary.berriesGained;
    companionsAdded.push(...companionIdsFrom(passive.events));
    for (const slime of current.slimes) {
      if (!beforeIds.has(slime.id)) {
        pendingArrivals.push(slime.id);
      }
    }

    current.world.carryMs += slice;
    remaining -= slice;

    if (current.world.carryMs === WORLD_STEP_MS) {
      current.world.carryMs = 0;
      current.world.timeMs += WORLD_STEP_MS;
      steps += 1;
      const uniquePending = uniqueIds(pendingArrivals);
      pendingArrivals.length = 0;
      for (const id of uniquePending) {
        current = planActiveArrival(current, id);
      }
      const stepped = stepWorld(current);
      current.world = stepped.world;
      events.push(...stepped.events);
      for (const meal of mealsInFoodOrder(stepped.meals)) {
        const settled = finishMeal(current, meal);
        current = settled.state;
        events.push(...settled.events);
        if (settled.rewarded) mealsCompleted += 1;
        const added = companionIdsFrom(settled.events);
        companionsAdded.push(...added);
        pendingArrivals.push(...added);
      }
    }
  }

  return {
    state: current,
    events,
    summary: {
      elapsedMs,
      glowEarnedMicro,
      berriesGained,
      mealsCompleted,
      companionsAdded,
    },
  };
}
