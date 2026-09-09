import {
  INCOME_REMAINDER_MOD,
  MAX_GLOW_MICRO,
  OFFLINE_CAP_MS,
  POPULATION_CAP,
} from './balance.mjs';
import { resolveCompanionsNow } from './progression.mjs';
import {
  getBerryCapacity,
  getBerryIntervalMs,
  getCompanionEligibility,
  getRateMicroPerSecond,
} from './selectors.mjs';
import { cloneState } from './state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').SlimeId} SlimeId
 * @typedef {import('./state.mjs').TutorialStep} TutorialStep
 *
 * @typedef {object} GameEvent
 * @property {'FED' | 'UPGRADE_BOUGHT' | 'COMPANION_ADDED' | 'TUTORIAL_COMPLETED'} type
 * @property {TutorialStep} [step]
 * @property {SlimeId} [slimeId]
 * @property {number} [homeSlot]
 * @property {number} [atMs]
 *
 * @typedef {object} AdvanceSummary
 * @property {number} elapsedMs
 * @property {number} glowEarnedMicro Wallet increase, respecting the Glow cap.
 * @property {number} berriesGained
 * @property {number} mealsCompleted
 * @property {SlimeId[]} companionsAdded
 *
 * @typedef {object} AdvanceResult
 * @property {GameState} state
 * @property {GameEvent[]} events
 * @property {AdvanceSummary} summary
 */

/** Max passive slices: nine joins + ten boost expiries + end, with slack. */
const MAX_PASSIVE_SLICES = 64;

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
 * @param {SlimeId[]} [companionsAdded]
 * @returns {AdvanceSummary}
 */
function emptySummary(companionsAdded = []) {
  return {
    elapsedMs: 0,
    glowEarnedMicro: 0,
    berriesGained: 0,
    mealsCompleted: 0,
    companionsAdded,
  };
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
 * Delay until lifetime Glow meets the next companion gate, while feeds and
 * capacity are already met. `max(0, ceil(((G-L)*1000 - q)/r))`.
 * Returns `null` when time cannot create a crossing (rate 0, or feeds/capacity
 * unmet). Returns `0` when lifetime already meets the gate.
 *
 * @param {GameState} state
 * @returns {number | null}
 */
function crossingDelayMs(state) {
  const eligibility = getCompanionEligibility(state);
  if (eligibility.nextPopulation === null) return null;
  if (!eligibility.feedsMet || !eligibility.capacityMet) return null;
  const lifetime = state.lifetimeGlowMicro;
  const requirement = eligibility.requiredLifetimeGlowMicro;
  if (lifetime >= requirement) return 0;
  const rate = getRateMicroPerSecond(state);
  if (!(rate > 0)) return null;
  const needNumer =
    (requirement - lifetime) * INCOME_REMAINDER_MOD - state.incomeRemainder;
  if (needNumer <= 0) return 0;
  const delay = Math.ceil(needNumer / rate);
  if (!Number.isSafeInteger(delay) || delay < 0) return null;
  return delay;
}

/**
 * Integrate logical time by `elapsedMs` milliseconds.
 * Never mutates `state`. Does not feed, upgrade, or add residents.
 *
 * @param {GameState} state
 * @param {number} elapsedMs Integer in `0..OFFLINE_CAP_MS`.
 * @returns {AdvanceResult}
 */
export function advanceEconomy(state, elapsedMs) {
  assertAdvanceArgs(state, elapsedMs);
  const next = cloneState(/** @type {GameState} */ (state));
  /** @type {GameEvent[]} */
  const events = [];

  if (elapsedMs === 0) {
    return {
      state: next,
      events,
      summary: emptySummary(),
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
    summary: {
      elapsedMs,
      glowEarnedMicro,
      berriesGained,
      mealsCompleted: 0,
      companionsAdded: [],
    },
  };
}

/**
 * Economy plus exact lifetime-threshold companion crossings.
 * Does not step world time, foods, or existing resident routes; new members
 * are idle at home / a free point via `resolveCompanionsNow`.
 *
 * @param {GameState} state
 * @param {number} elapsedMs Integer in `0..OFFLINE_CAP_MS`.
 * @returns {AdvanceResult}
 */
export function advancePassive(state, elapsedMs) {
  assertAdvanceArgs(state, elapsedMs);

  const opened = resolveCompanionsNow(/** @type {GameState} */ (state));
  let current = opened.state;
  /** @type {GameEvent[]} */
  const events = [...opened.events];
  /** @type {SlimeId[]} */
  const companionsAdded = companionIdsFrom(opened.events);

  if (elapsedMs === 0) {
    return {
      state: current,
      events,
      summary: emptySummary(companionsAdded),
    };
  }

  const end = current.simTimeMs + elapsedMs;
  let glowEarnedMicro = 0;
  let berriesGained = 0;
  let slices = 0;
  let additions = companionsAdded.length;

  while (current.simTimeMs < end) {
    slices += 1;
    if (slices > MAX_PASSIVE_SLICES) {
      const rest = end - current.simTimeMs;
      const flushed = advanceEconomy(current, rest);
      current = flushed.state;
      events.push(...flushed.events);
      glowEarnedMicro += flushed.summary.glowEarnedMicro;
      berriesGained += flushed.summary.berriesGained;
      const tail = resolveCompanionsNow(current);
      current = tail.state;
      events.push(...tail.events);
      companionsAdded.push(...companionIdsFrom(tail.events));
      break;
    }

    const cursor = current.simTimeMs;
    const expiries = bonusExpiriesInside(current, cursor, end);
    const nextExpiry = expiries.length > 0 ? expiries[0] : end;
    let boundary = nextExpiry;
    const delay = crossingDelayMs(current);
    if (delay !== null) {
      const crossingAt = cursor + delay;
      if (crossingAt <= end && crossingAt < boundary) {
        boundary = crossingAt;
      }
    }

    if (boundary <= cursor) {
      if (additions >= 9 || current.slimes.length >= POPULATION_CAP) {
        boundary = nextExpiry > cursor ? nextExpiry : end;
      } else {
        const before = current.slimes.length;
        const joined = resolveCompanionsNow(current);
        current = joined.state;
        events.push(...joined.events);
        const ids = companionIdsFrom(joined.events);
        companionsAdded.push(...ids);
        additions += ids.length;
        if (current.slimes.length > before) {
          continue;
        }
        boundary = nextExpiry > cursor ? nextExpiry : end;
        if (boundary <= cursor) {
          break;
        }
      }
    }

    const durationMs = boundary - cursor;
    if (durationMs <= 0) {
      break;
    }

    const slice = advanceEconomy(current, durationMs);
    current = slice.state;
    events.push(...slice.events);
    glowEarnedMicro += slice.summary.glowEarnedMicro;
    berriesGained += slice.summary.berriesGained;

    const joined = resolveCompanionsNow(current);
    current = joined.state;
    events.push(...joined.events);
    const ids = companionIdsFrom(joined.events);
    companionsAdded.push(...ids);
    additions += ids.length;
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

export { advancePassive as advance };
