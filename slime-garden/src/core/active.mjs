/**
 * Active world/economy integration. Visible time uses a 50 ms world clock
 * with persistent carry; income still uses sim time via `advancePassive`.
 * Food/meal settlement is P2-08. Never mutates its input.
 * Pure: no DOM, Three, wall-clock APIs, or randomness.
 */

import {
  MAX_WORLD_STEPS_PER_ADVANCE,
  WORLD_STEP_MS,
} from './balance.mjs';
import { advancePassive } from './advance.mjs';
import { resolveCompanionsNow } from './progression.mjs';
import { syncWorldRoster } from './state.mjs';
import { planActiveArrival } from '../world/behavior.mjs';
import { stepWorld } from '../world/step.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').SlimeId} SlimeId
 * @typedef {import('./advance.mjs').GameEvent} GameEvent
 * @typedef {import('./advance.mjs').AdvanceResult} AdvanceResult
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
 * Integrate visible time with a 50 ms world step. Elapsed is an integer in
 * `0..5000`. Path math uses world time; income uses sim time.
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
    }
  }

  return {
    state: current,
    events,
    summary: {
      elapsedMs,
      glowEarnedMicro,
      berriesGained,
      mealsCompleted: 0,
      companionsAdded,
    },
  };
}
