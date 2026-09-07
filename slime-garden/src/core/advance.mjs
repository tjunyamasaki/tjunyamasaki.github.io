import {
  INCOME_REMAINDER_MOD,
  MAX_GLOW_MICRO,
  OFFLINE_CAP_MS,
} from './balance.mjs';
import {
  getBerryCapacity,
  getBerryIntervalMs,
  getRateMicroPerSecond,
} from './selectors.mjs';
import { cloneState } from './state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').TutorialStep} TutorialStep
 *
 * @typedef {object} GameEvent
 * @property {'FED' | 'UPGRADE_BOUGHT' | 'COMPANION_ADDED' | 'TUTORIAL_COMPLETED'} type
 * @property {TutorialStep} [step]
 * @property {number} [atMs]
 *
 * @typedef {object} AdvanceSummary
 * @property {number} elapsedMs
 * @property {number} glowEarnedMicro Wallet increase, respecting the Glow cap.
 * @property {number} berriesGained
 *
 * @typedef {object} AdvanceResult
 * @property {GameState} state
 * @property {GameEvent[]} events
 * @property {AdvanceSummary} summary
 */

/**
 * @param {unknown} state
 * @param {unknown} elapsedMs
 */
function assertAdvanceArgs(state, elapsedMs) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('advance: state must be a game state object');
  }
  if (typeof elapsedMs !== 'number' || Number.isNaN(elapsedMs)) {
    throw new TypeError('advance: elapsedMs must be a number');
  }
  if (
    !Number.isInteger(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > OFFLINE_CAP_MS
  ) {
    throw new RangeError(
      `advance: elapsedMs must be an integer in 0..${OFFLINE_CAP_MS}`,
    );
  }
}

/**
 * Instantaneous micro-Glow/s at `cursorMs`. Bonus applies while
 * `boostUntilMs > cursorMs` (same as `cursorMs < boostUntilMs` in selectors).
 *
 * @param {GameState} state
 * @param {number} cursorMs
 * @returns {number}
 */
function rateAtCursor(state, cursorMs) {
  if (state.simTimeMs === cursorMs) {
    return getRateMicroPerSecond(state);
  }
  return getRateMicroPerSecond({ ...state, simTimeMs: cursorMs });
}

/**
 * @param {number} current
 * @param {number} earned
 * @returns {number}
 */
function addCappedGlow(current, earned) {
  const room = MAX_GLOW_MICRO - current;
  if (earned >= room) return MAX_GLOW_MICRO;
  return current + earned;
}

/**
 * Unique bonus expiries strictly inside `(start, end)`, sorted ascending.
 *
 * @param {GameState} state
 * @param {number} start
 * @param {number} end
 * @returns {number[]}
 */
function bonusExpiriesInside(state, start, end) {
  const seen = new Set();
  const expiries = [];
  for (const slime of state.slimes) {
    const expiry = slime.boostUntilMs;
    if (expiry > start && expiry < end && !seen.has(expiry)) {
      seen.add(expiry);
      expiries.push(expiry);
    }
  }
  expiries.sort((a, b) => a - b);
  return expiries;
}

/**
 * Integrate logical time by `elapsedMs` milliseconds.
 * Never mutates `state`. Does not feed, upgrade, or add residents.
 *
 * @param {GameState} state
 * @param {number} elapsedMs Integer in `0..OFFLINE_CAP_MS`.
 * @returns {AdvanceResult}
 */
export function advance(state, elapsedMs) {
  assertAdvanceArgs(state, elapsedMs);
  const next = cloneState(/** @type {GameState} */ (state));
  /** @type {GameEvent[]} */
  const events = [];

  if (elapsedMs === 0) {
    return {
      state: next,
      events,
      summary: { elapsedMs: 0, glowEarnedMicro: 0, berriesGained: 0 },
    };
  }

  const start = next.simTimeMs;
  const end = start + elapsedMs;
  const boundaries = bonusExpiriesInside(next, start, end);
  boundaries.push(end);

  let glowEarnedMicro = 0;
  let cursor = start;
  for (const boundary of boundaries) {
    const durationMs = boundary - cursor;
    if (durationMs > 0) {
      const rateMicroPerSecond = rateAtCursor(next, cursor);
      const numerator =
        rateMicroPerSecond * durationMs + next.incomeRemainder;
      const earnedMicro = Math.floor(numerator / INCOME_REMAINDER_MOD);
      next.incomeRemainder = numerator % INCOME_REMAINDER_MOD;
      const walletBefore = next.glowMicro;
      next.glowMicro = addCappedGlow(next.glowMicro, earnedMicro);
      next.lifetimeGlowMicro = addCappedGlow(
        next.lifetimeGlowMicro,
        earnedMicro,
      );
      glowEarnedMicro += next.glowMicro - walletBefore;
      if (
        next.glowMicro === MAX_GLOW_MICRO &&
        next.lifetimeGlowMicro === MAX_GLOW_MICRO
      ) {
        next.incomeRemainder = 0;
      }
    }
    cursor = boundary;
  }

  let berriesGained = 0;
  const berryDueAtMs = next.nextBerryAtMs;
  if (berryDueAtMs !== null && berryDueAtMs <= end) {
    const intervalMs = getBerryIntervalMs(next);
    const capacity = getBerryCapacity(next);
    const due = 1 + Math.floor((end - berryDueAtMs) / intervalMs);
    const room = capacity - next.berries;
    const gained = Math.min(due, room);
    next.berries += gained;
    berriesGained = gained;
    if (next.berries >= capacity) {
      next.nextBerryAtMs = null;
    } else {
      next.nextBerryAtMs = berryDueAtMs + due * intervalMs;
    }
    if (gained > 0 && !next.tutorialCompleted.includes('berry')) {
      next.tutorialCompleted.push('berry');
      events.push({
        type: 'TUTORIAL_COMPLETED',
        step: 'berry',
        atMs: berryDueAtMs,
      });
    }
  }

  next.simTimeMs = end;
  return {
    state: next,
    events,
    summary: { elapsedMs, glowEarnedMicro, berriesGained },
  };
}
