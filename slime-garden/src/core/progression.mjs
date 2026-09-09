/**
 * Automatic companion membership at the current logical timestamp.
 * Pure: no DOM, Three, wall-clock APIs, randomness, or `advance`.
 */

import { POPULATION_CAP, SLIME_NAMES } from './balance.mjs';
import { getCompanionEligibility } from './selectors.mjs';
import { cloneState } from './state.mjs';
import { syncWorldRoster } from '../world/state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').SlimeId} SlimeId
 * @typedef {import('./state.mjs').TutorialStep} TutorialStep
 *
 * @typedef {object} GameEvent
 * @property {'COMPANION_ADDED' | 'TUTORIAL_COMPLETED'} type
 * @property {SlimeId} [slimeId]
 * @property {number} [homeSlot]
 * @property {number} [atMs]
 * @property {TutorialStep} [step]
 *
 * @typedef {object} Transition
 * @property {GameState} state
 * @property {GameEvent[]} events
 */

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
 * Add every currently eligible resident at `state.simTimeMs`. Clones;
 * never mutates `state`. Bound by nine additions / population 10.
 * After roster changes, world membership is synced without stepping
 * world time, foods, or existing routes.
 *
 * @param {GameState} state
 * @returns {Transition}
 */
export function resolveCompanionsNow(state) {
  const next = cloneState(state);
  /** @type {GameEvent[]} */
  const events = [];
  let added = 0;

  while (
    getCompanionEligibility(next).ready &&
    added < 9 &&
    next.slimes.length < POPULATION_CAP
  ) {
    const n = next.slimes.length + 1;
    const slimeId = /** @type {SlimeId} */ (`slime-${n}`);
    const homeSlot = n - 1;
    const atMs = next.simTimeMs;
    next.slimes.push({
      id: slimeId,
      name: SLIME_NAMES[n - 1],
      createdAtMs: atMs,
      boostUntilMs: 0,
      feedCount: 0,
      homeSlot,
    });
    events.push({ type: 'COMPANION_ADDED', slimeId, homeSlot, atMs });
    completeTutorial(next, events, 'welcome', atMs);
    added += 1;
  }

  if (added === 0) {
    return { state: next, events };
  }

  return { state: syncWorldRoster(next), events };
}
