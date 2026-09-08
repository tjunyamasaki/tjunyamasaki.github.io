import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advance } from '../src/core/advance.mjs';
import {
  BASE_RATE_MICRO_PER_SECOND,
  BONUS_MULTIPLIER,
  FEED_BERRY_COST,
  FEED_COOLDOWN_MS,
  FEED_COUNTER_CAP,
  MICRO_PER_GLOW,
  PANTRY_CAPACITIES,
  POPULATION_CAP,
  SLIME_NAMES,
  UPGRADE_MAX_LEVEL,
} from '../src/core/balance.mjs';
import { applyCommand } from '../src/core/commands.mjs';
import {
  getBerryCapacity,
  getBerryIntervalMs,
  getCompanionEligibility,
  getNextUpgradeCostMicro,
} from '../src/core/selectors.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');

const FEED_SLIME_1 = Object.freeze({ type: 'FEED', slimeId: 'slime-1' });

/**
 * @param {object} [patch]
 */
function makeState(patch = {}) {
  const base = createInitialState();
  return {
    ...base,
    ...patch,
    upgrades: { ...base.upgrades, ...(patch.upgrades ?? {}) },
    slimes: patch.slimes ?? base.slimes.map((slime) => ({ ...slime })),
    tutorialCompleted: patch.tutorialCompleted
      ? [...patch.tutorialCompleted]
      : [...base.tutorialCompleted],
  };
}

/**
 * @param {number} count
 * @param {Partial<import('../src/core/state.mjs').SlimeState>} [extra]
 */
function makeSlimes(count, extra = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `slime-${index + 1}`,
    name: SLIME_NAMES[index],
    createdAtMs: 0,
    boostUntilMs: 0,
    feedCount: 0,
    homeSlot: index,
    ...extra,
  }));
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {number} simTimeMs
 */
function atTime(state, simTimeMs) {
  const next = cloneState(state);
  next.simTimeMs = simTimeMs;
  return next;
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 */
function withSecondResident(state) {
  const next = cloneState(state);
  next.slimes.push({
    id: 'slime-2',
    name: SLIME_NAMES[1],
    createdAtMs: 0,
    boostUntilMs: 0,
    feedCount: 0,
    homeSlot: 1,
  });
  return next;
}

/**
 * @param {import('../src/core/commands.mjs').CommandResult} result
 * @param {string} [message]
 */
function assertOk(result, message) {
  assert.equal(result.ok, true, message ?? result.reason);
  return result;
}

describe('FEED', () => {
  test('double FEED at t=0: second is FEED_COOLDOWN, no extra berry or feed', () => {
    const input = deepFreeze(createInitialState());
    const snapshot = structuredClone(input);
    const first = assertOk(applyCommand(input, FEED_SLIME_1));
    assert.equal(first.state.berries, 5);
    assert.equal(first.state.totalFeeds, 1);
    assert.equal(first.state.slimes[0].feedCount, 1);
    assert.equal(first.state.nextFeedAllowedAtMs, 4_000);
    assert.equal(first.state.simTimeMs, 0);
    assert.equal(first.state.nextBerryAtMs, 15_000);
    assert.deepEqual(input, snapshot);

    const secondInput = deepFreeze(first.state);
    const secondSnapshot = structuredClone(secondInput);
    const second = applyCommand(secondInput, FEED_SLIME_1);
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'FEED_COOLDOWN');
    assert.equal(second.state, secondInput);
    assert.deepEqual(second.events, []);
    assert.equal(secondInput.berries, 5);
    assert.equal(secondInput.totalFeeds, 1);
    assert.deepEqual(secondInput, secondSnapshot);
  });

  test('global cooldown: 3999 ms on another resident fails; 4000 ms succeeds', () => {
    const first = assertOk(applyCommand(deepFreeze(createInitialState()), FEED_SLIME_1));
    const withTwo = withSecondResident(first.state);
    const early = applyCommand(
      deepFreeze(atTime(withTwo, 3_999)),
      { type: 'FEED', slimeId: 'slime-2' },
    );
    assert.equal(early.ok, false);
    assert.equal(early.reason, 'FEED_COOLDOWN');
    assert.equal(early.state.berries, 5);
    assert.equal(early.state.totalFeeds, 1);
    assert.equal(early.state.slimes[1].feedCount, 0);
    assert.deepEqual(early.events, []);

    const ready = assertOk(
      applyCommand(deepFreeze(atTime(withTwo, 4_000)), {
        type: 'FEED',
        slimeId: 'slime-2',
      }),
    );
    assert.equal(ready.state.berries, 4);
    assert.equal(ready.state.totalFeeds, 2);
    assert.equal(ready.state.slimes[0].feedCount, 1);
    assert.equal(ready.state.slimes[1].feedCount, 1);
    assert.equal(ready.state.slimes[0].boostUntilMs, 120_000);
    assert.equal(ready.state.slimes[1].boostUntilMs, 124_000);
    assert.equal(ready.state.nextFeedAllowedAtMs, 8_000);
    assert.equal(ready.state.simTimeMs, 4_000);
  });

  test('bonus extension: feeds at 0, 4000, 8000 → 120000, 240000, 308000', () => {
    const first = assertOk(applyCommand(deepFreeze(createInitialState()), FEED_SLIME_1));
    assert.equal(first.state.slimes[0].boostUntilMs, 120_000);

    const second = assertOk(
      applyCommand(deepFreeze(atTime(first.state, 4_000)), FEED_SLIME_1),
    );
    assert.equal(second.state.slimes[0].boostUntilMs, 240_000);

    const third = assertOk(
      applyCommand(deepFreeze(atTime(second.state, 8_000)), FEED_SLIME_1),
    );
    assert.equal(third.state.slimes[0].boostUntilMs, 308_000);
    assert.equal(third.state.berries, 3);
    assert.equal(third.state.totalFeeds, 3);
  });

  test('full basket: 12 berries, null timer, feed at 50_000 → 11 berries, nextBerry 65_000', () => {
    const input = deepFreeze(
      makeState({
        simTimeMs: 50_000,
        berries: 12,
        nextBerryAtMs: null,
      }),
    );
    const snapshot = structuredClone(input);
    const result = assertOk(applyCommand(input, FEED_SLIME_1));
    assert.equal(result.state.berries, 11);
    assert.equal(result.state.nextBerryAtMs, 65_000);
    assert.equal(getBerryIntervalMs(result.state), 15_000);
    assert.equal(result.state.simTimeMs, 50_000);
    assert.deepEqual(input, snapshot);
    assert.notEqual(result.state, input);
    assert.deepEqual(result.events[0], {
      type: 'FED',
      slimeId: 'slime-1',
      atMs: 50_000,
      boostUntilMs: 170_000,
    });
  });

  test('unknown slime, no berries, and counter cap', () => {
    const unknown = applyCommand(deepFreeze(createInitialState()), {
      type: 'FEED',
      slimeId: 'slime-99',
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.reason, 'UNKNOWN_SLIME');
    assert.equal(unknown.state.berries, 6);
    assert.deepEqual(unknown.events, []);

    const empty = makeState({ berries: 0, nextBerryAtMs: 15_000 });
    const frozenEmpty = deepFreeze(empty);
    const emptySnapshot = structuredClone(frozenEmpty);
    const noBerries = applyCommand(frozenEmpty, FEED_SLIME_1);
    assert.equal(noBerries.ok, false);
    assert.equal(noBerries.reason, 'NO_BERRIES');
    assert.equal(noBerries.state, frozenEmpty);
    assert.deepEqual(frozenEmpty, emptySnapshot);
    assert.deepEqual(noBerries.events, []);
    assert.deepEqual(frozenEmpty.tutorialCompleted, []);

    const capped = deepFreeze(
      makeState({
        berries: 5,
        totalFeeds: FEED_COUNTER_CAP,
        slimes: [{ ...createInitialState().slimes[0], feedCount: FEED_COUNTER_CAP }],
      }),
    );
    const cappedResult = assertOk(applyCommand(capped, FEED_SLIME_1));
    assert.equal(cappedResult.state.berries, 4);
    assert.equal(cappedResult.state.totalFeeds, FEED_COUNTER_CAP);
    assert.equal(cappedResult.state.slimes[0].feedCount, FEED_COUNTER_CAP);
    assert.equal(cappedResult.state.slimes[0].boostUntilMs, 120_000);
    assert.equal(cappedResult.state.nextFeedAllowedAtMs, FEED_COOLDOWN_MS);
  });
});

describe('BUY_UPGRADE', () => {
  test('exact shrub price 15_000_000 succeeds wallet→0; 14_999_999 fails INSUFFICIENT_GLOW', () => {
    const exactInput = deepFreeze(
      makeState({ glowMicro: 15_000_000, lifetimeGlowMicro: 15_000_000 }),
    );
    const exact = assertOk(
      applyCommand(exactInput, {
        type: 'BUY_UPGRADE',
        upgradeId: 'shrub',
        expectedLevel: 0,
      }),
    );
    assert.equal(exact.state.glowMicro, 0);
    assert.equal(exact.state.lifetimeGlowMicro, 15_000_000);
    assert.equal(exact.state.upgrades.shrub, 1);
    assert.equal(exact.state.simTimeMs, 0);
    assert.deepEqual(exact.events[0], {
      type: 'UPGRADE_BOUGHT',
      upgradeId: 'shrub',
      level: 1,
      atMs: 0,
    });

    const shortInput = deepFreeze(
      makeState({ glowMicro: 14_999_999, lifetimeGlowMicro: 14_999_999 }),
    );
    const shortSnapshot = structuredClone(shortInput);
    const short = applyCommand(shortInput, {
      type: 'BUY_UPGRADE',
      upgradeId: 'shrub',
      expectedLevel: 0,
    });
    assert.equal(short.ok, false);
    assert.equal(short.reason, 'INSUFFICIENT_GLOW');
    assert.equal(short.state, shortInput);
    assert.deepEqual(shortInput, shortSnapshot);
    assert.equal(shortInput.glowMicro, 14_999_999);
    assert.equal(shortInput.upgrades.shrub, 0);
    assert.deepEqual(short.events, []);
  });

  test('spending does not reduce lifetimeGlowMicro', () => {
    const lifetime = 80 * MICRO_PER_GLOW;
    const input = deepFreeze(
      makeState({
        glowMicro: 20 * MICRO_PER_GLOW,
        lifetimeGlowMicro: lifetime,
      }),
    );
    const result = assertOk(
      applyCommand(input, {
        type: 'BUY_UPGRADE',
        upgradeId: 'bloom',
        expectedLevel: 0,
      }),
    );
    assert.equal(result.state.glowMicro, 0);
    assert.equal(result.state.lifetimeGlowMicro, lifetime);
    assert.equal(result.state.upgrades.bloom, 1);
  });

  test('stale expectedLevel is STALE_REQUEST and does not charge', () => {
    const input = deepFreeze(
      makeState({
        glowMicro: 15_000_000,
        lifetimeGlowMicro: 15_000_000,
        upgrades: { shrub: 1 },
      }),
    );
    const snapshot = structuredClone(input);
    const result = applyCommand(input, {
      type: 'BUY_UPGRADE',
      upgradeId: 'shrub',
      expectedLevel: 0,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'STALE_REQUEST');
    assert.equal(result.state, input);
    assert.deepEqual(input, snapshot);
    assert.equal(input.glowMicro, 15_000_000);
    assert.equal(input.upgrades.shrub, 1);
    assert.deepEqual(result.events, []);
  });

  test('shrub buy restarts the incomplete interval: 15_000 at t=14_000 → 26_000', () => {
    const berries = 7;
    const input = deepFreeze(
      makeState({
        simTimeMs: 14_000,
        berries,
        nextBerryAtMs: 15_000,
        glowMicro: 15_000_000,
        lifetimeGlowMicro: 15_000_000,
      }),
    );
    const result = assertOk(
      applyCommand(input, {
        type: 'BUY_UPGRADE',
        upgradeId: 'shrub',
        expectedLevel: 0,
      }),
    );
    assert.equal(result.state.upgrades.shrub, 1);
    assert.equal(getBerryIntervalMs(result.state), 12_000);
    assert.equal(result.state.nextBerryAtMs, 26_000);
    assert.equal(result.state.berries, berries);
    assert.equal(result.state.glowMicro, 0);
    assert.equal(result.state.lifetimeGlowMicro, 15_000_000);
  });

  test('pantry buy while full 12 at t=10_000: still 12, capacity 18, nextBerry 25_000', () => {
    const input = deepFreeze(
      makeState({
        simTimeMs: 10_000,
        berries: 12,
        nextBerryAtMs: null,
        glowMicro: 30 * MICRO_PER_GLOW,
        lifetimeGlowMicro: 30 * MICRO_PER_GLOW,
      }),
    );
    const result = assertOk(
      applyCommand(input, {
        type: 'BUY_UPGRADE',
        upgradeId: 'pantry',
        expectedLevel: 0,
      }),
    );
    assert.equal(result.state.berries, 12);
    assert.equal(result.state.upgrades.pantry, 1);
    assert.equal(getBerryCapacity(result.state), 18);
    assert.equal(getBerryCapacity(result.state), PANTRY_CAPACITIES[1]);
    assert.equal(result.state.nextBerryAtMs, 25_000);
    assert.equal(getBerryIntervalMs(result.state), 15_000);
  });

  test('pantry while not full preserves the in-progress timer; bloom/beds do not touch it', () => {
    const pantry = assertOk(
      applyCommand(
        deepFreeze(
          makeState({
            simTimeMs: 4_000,
            berries: 8,
            nextBerryAtMs: 15_000,
            glowMicro: 30 * MICRO_PER_GLOW,
            lifetimeGlowMicro: 30 * MICRO_PER_GLOW,
          }),
        ),
        { type: 'BUY_UPGRADE', upgradeId: 'pantry', expectedLevel: 0 },
      ),
    );
    assert.equal(pantry.state.nextBerryAtMs, 15_000);
    assert.equal(pantry.state.berries, 8);
    assert.equal(getBerryCapacity(pantry.state), 18);

    const bloom = assertOk(
      applyCommand(
        deepFreeze(
          makeState({
            simTimeMs: 4_000,
            nextBerryAtMs: 15_000,
            glowMicro: 20 * MICRO_PER_GLOW,
            lifetimeGlowMicro: 20 * MICRO_PER_GLOW,
          }),
        ),
        { type: 'BUY_UPGRADE', upgradeId: 'bloom', expectedLevel: 0 },
      ),
    );
    assert.equal(bloom.state.nextBerryAtMs, 15_000);
    assert.equal(bloom.state.berries, 6);
    assert.equal(bloom.state.slimes.length, 1);

    const beds = assertOk(
      applyCommand(
        deepFreeze(
          makeState({
            simTimeMs: 4_000,
            nextBerryAtMs: 15_000,
            glowMicro: 40 * MICRO_PER_GLOW,
            lifetimeGlowMicro: 40 * MICRO_PER_GLOW,
          }),
        ),
        { type: 'BUY_UPGRADE', upgradeId: 'beds', expectedLevel: 0 },
      ),
    );
    assert.equal(beds.state.nextBerryAtMs, 15_000);
    assert.equal(beds.state.slimes.length, 1);
    assert.equal(beds.state.upgrades.beds, 1);

    const fullShrub = assertOk(
      applyCommand(
        deepFreeze(
          makeState({
            simTimeMs: 20_000,
            berries: 12,
            nextBerryAtMs: null,
            glowMicro: 15_000_000,
            lifetimeGlowMicro: 15_000_000,
          }),
        ),
        { type: 'BUY_UPGRADE', upgradeId: 'shrub', expectedLevel: 0 },
      ),
    );
    assert.equal(fullShrub.state.nextBerryAtMs, null);
    assert.equal(fullShrub.state.berries, 12);
  });

  test('unknown upgrade, max level, and exact integer cost', () => {
    const unknown = applyCommand(
      deepFreeze(makeState({ glowMicro: 15_000_000 })),
      { type: 'BUY_UPGRADE', upgradeId: 'ladder', expectedLevel: 0 },
    );
    assert.equal(unknown.ok, false);
    assert.equal(unknown.reason, 'UNKNOWN_UPGRADE');
    assert.equal(unknown.state.glowMicro, 15_000_000);
    assert.deepEqual(unknown.events, []);

    const maxed = deepFreeze(
      makeState({
        glowMicro: 180 * MICRO_PER_GLOW,
        upgrades: { shrub: UPGRADE_MAX_LEVEL.shrub },
      }),
    );
    const maxResult = applyCommand(maxed, {
      type: 'BUY_UPGRADE',
      upgradeId: 'shrub',
      expectedLevel: UPGRADE_MAX_LEVEL.shrub,
    });
    assert.equal(maxResult.ok, false);
    assert.equal(maxResult.reason, 'MAX_LEVEL');
    assert.equal(getNextUpgradeCostMicro(maxed, 'shrub'), null);
    assert.equal(maxed.glowMicro, 180 * MICRO_PER_GLOW);
    assert.deepEqual(maxResult.events, []);
  });
});

describe('WELCOME_COMPANION', () => {
  test('stale expectedPopulation, seventh resident, not ready; welcome never charges', () => {
    const fresh = deepFreeze(createInitialState());
    const freshSnapshot = structuredClone(fresh);
    const stale = applyCommand(fresh, {
      type: 'WELCOME_COMPANION',
      expectedPopulation: 2,
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.reason, 'STALE_REQUEST');
    assert.equal(stale.state, fresh);
    assert.deepEqual(fresh, freshSnapshot);
    assert.deepEqual(stale.events, []);
    assert.equal(fresh.glowMicro, 0);
    assert.equal(fresh.berries, 6);
    assert.equal(fresh.slimes.length, 1);

    const notReady = applyCommand(deepFreeze(createInitialState()), {
      type: 'WELCOME_COMPANION',
      expectedPopulation: 1,
    });
    assert.equal(notReady.ok, false);
    assert.equal(notReady.reason, 'NOT_READY');
    assert.equal(notReady.state.slimes.length, 1);
    assert.deepEqual(notReady.events, []);

    const capacityShort = deepFreeze(
      makeState({
        totalFeeds: 24,
        lifetimeGlowMicro: 90 * MICRO_PER_GLOW,
        glowMicro: 90 * MICRO_PER_GLOW,
        upgrades: { beds: 0 },
        slimes: makeSlimes(2),
      }),
    );
    const capacityResult = applyCommand(capacityShort, {
      type: 'WELCOME_COMPANION',
      expectedPopulation: 2,
    });
    assert.equal(getCompanionEligibility(capacityShort).capacityMet, false);
    assert.equal(capacityResult.ok, false);
    assert.equal(capacityResult.reason, 'NOT_READY');
    assert.equal(capacityResult.state.glowMicro, 90 * MICRO_PER_GLOW);
    assert.equal(capacityResult.state.slimes.length, 2);

    const atCap = deepFreeze(
      makeState({
        totalFeeds: 200,
        lifetimeGlowMicro: 2200 * MICRO_PER_GLOW,
        glowMicro: 2200 * MICRO_PER_GLOW,
        upgrades: { beds: 4 },
        slimes: makeSlimes(POPULATION_CAP),
      }),
    );
    const capSnapshot = structuredClone(atCap);
    const seventh = applyCommand(atCap, {
      type: 'WELCOME_COMPANION',
      expectedPopulation: POPULATION_CAP,
    });
    assert.equal(seventh.ok, false);
    assert.equal(seventh.reason, 'POPULATION_CAP');
    assert.equal(seventh.state, atCap);
    assert.deepEqual(atCap, capSnapshot);
    assert.equal(atCap.slimes.length, 6);
    assert.equal(atCap.glowMicro, 2200 * MICRO_PER_GLOW);
    assert.deepEqual(seventh.events, []);
  });

  test('lifetime independence: wallet 20 of 100 Glow still ready; spending keeps glowMet', () => {
    const input = deepFreeze(
      makeState({
        glowMicro: 20 * MICRO_PER_GLOW,
        lifetimeGlowMicro: 100 * MICRO_PER_GLOW,
        totalFeeds: 24,
        upgrades: { beds: 1 },
        slimes: makeSlimes(2),
      }),
    );
    const before = getCompanionEligibility(input);
    assert.equal(before.ready, true);
    assert.equal(before.glowMet, true);
    assert.ok(input.glowMicro < before.requiredLifetimeGlowMicro);

    const spent = assertOk(
      applyCommand(input, {
        type: 'BUY_UPGRADE',
        upgradeId: 'bloom',
        expectedLevel: 0,
      }),
    );
    assert.equal(spent.state.glowMicro, 0);
    assert.equal(spent.state.lifetimeGlowMicro, 100 * MICRO_PER_GLOW);
    const afterSpend = getCompanionEligibility(spent.state);
    assert.equal(afterSpend.ready, true);
    assert.equal(afterSpend.glowMet, true);

    const welcome = assertOk(
      applyCommand(deepFreeze(spent.state), {
        type: 'WELCOME_COMPANION',
        expectedPopulation: 2,
      }),
    );
    assert.equal(welcome.state.glowMicro, 0);
    assert.equal(welcome.state.lifetimeGlowMicro, 100 * MICRO_PER_GLOW);
    assert.equal(welcome.state.berries, input.berries);
    assert.equal(welcome.state.totalFeeds, 24);
    assert.equal(welcome.state.slimes.length, 3);
    assert.equal(welcome.state.slimes[2].id, 'slime-3');
    assert.equal(welcome.state.slimes[2].boostUntilMs, 0);
    assert.equal(welcome.state.slimes[2].homeSlot, 2);
  });
});

describe('invalid payloads and immutability', () => {
  test('malformed commands are INVALID_COMMAND and do not mutate frozen input', () => {
    const input = deepFreeze(createInitialState());
    const snapshot = structuredClone(input);
    const payloads = [
      null,
      undefined,
      1,
      'FEED',
      true,
      [],
      {},
      { type: null },
      { type: 'EAT' },
      { type: 'FEED' },
      { type: 'FEED', slimeId: 1 },
      { type: 'FEED', slimeId: { id: 'slime-1' } },
      { type: 'BUY_UPGRADE' },
      { type: 'BUY_UPGRADE', upgradeId: 'shrub' },
      { type: 'BUY_UPGRADE', upgradeId: 0, expectedLevel: 0 },
      { type: 'BUY_UPGRADE', upgradeId: 'shrub', expectedLevel: '0' },
      { type: 'BUY_UPGRADE', upgradeId: 'shrub', expectedLevel: 0.5 },
      { type: 'WELCOME_COMPANION' },
      { type: 'WELCOME_COMPANION', expectedPopulation: '1' },
      { type: 'WELCOME_COMPANION', expectedPopulation: 1.5 },
      { type: 'WELCOME_COMPANION', expectedPopulation: null },
    ];
    for (const command of payloads) {
      const result = applyCommand(input, command);
      assert.equal(result.ok, false, `expected invalid: ${JSON.stringify(command)}`);
      assert.equal(result.reason, 'INVALID_COMMAND');
      assert.equal(result.state, input);
      assert.deepEqual(result.events, []);
    }
    assert.deepEqual(input, snapshot);
  });

  test('failed commands emit no gameplay events; success clones and leaves simTimeMs unchanged', () => {
    const input = deepFreeze(
      makeState({ glowMicro: 15_000_000, lifetimeGlowMicro: 15_000_000 }),
    );
    const fail = applyCommand(input, {
      type: 'BUY_UPGRADE',
      upgradeId: 'shrub',
      expectedLevel: 2,
    });
    assert.equal(fail.ok, false);
    assert.deepEqual(fail.events, []);
    assert.equal(fail.state, input);

    const ok = assertOk(applyCommand(input, FEED_SLIME_1));
    assert.notEqual(ok.state, input);
    assert.notEqual(ok.state.slimes, input.slimes);
    assert.notEqual(ok.state.slimes[0], input.slimes[0]);
    assert.equal(ok.state.simTimeMs, input.simTimeMs);
    assert.equal(ok.state.berries, input.berries - FEED_BERRY_COST);
    assert.ok(ok.events.some((event) => event.type === 'FED'));
  });
});

describe('tutorial steps', () => {
  test('first feed/upgrade/welcome emit their steps once only', () => {
    const firstFeed = assertOk(
      applyCommand(deepFreeze(createInitialState()), FEED_SLIME_1),
    );
    assert.deepEqual(firstFeed.state.tutorialCompleted, ['feed']);
    assert.deepEqual(firstFeed.events, [
      {
        type: 'FED',
        slimeId: 'slime-1',
        atMs: 0,
        boostUntilMs: 120_000,
      },
      { type: 'TUTORIAL_COMPLETED', step: 'feed', atMs: 0 },
    ]);

    const secondFeed = assertOk(
      applyCommand(deepFreeze(atTime(firstFeed.state, 4_000)), FEED_SLIME_1),
    );
    assert.deepEqual(secondFeed.state.tutorialCompleted, ['feed']);
    assert.equal(
      secondFeed.events.some((event) => event.type === 'TUTORIAL_COMPLETED'),
      false,
    );
    assert.equal(secondFeed.events.length, 1);
    assert.equal(secondFeed.events[0].type, 'FED');

    const alreadyFed = assertOk(
      applyCommand(
        deepFreeze(makeState({ tutorialCompleted: ['feed'], berries: 6 })),
        FEED_SLIME_1,
      ),
    );
    assert.deepEqual(alreadyFed.state.tutorialCompleted, ['feed']);
    assert.equal(
      alreadyFed.events.some((event) => event.type === 'TUTORIAL_COMPLETED'),
      false,
    );

    const firstUpgrade = assertOk(
      applyCommand(
        deepFreeze(
          makeState({
            glowMicro: 15_000_000,
            lifetimeGlowMicro: 15_000_000,
          }),
        ),
        { type: 'BUY_UPGRADE', upgradeId: 'shrub', expectedLevel: 0 },
      ),
    );
    assert.deepEqual(firstUpgrade.state.tutorialCompleted, ['upgrade']);
    assert.deepEqual(firstUpgrade.events[1], {
      type: 'TUTORIAL_COMPLETED',
      step: 'upgrade',
      atMs: 0,
    });

    const secondUpgrade = assertOk(
      applyCommand(
        deepFreeze({
          ...firstUpgrade.state,
          glowMicro: 30 * MICRO_PER_GLOW,
          lifetimeGlowMicro: 45 * MICRO_PER_GLOW,
        }),
        { type: 'BUY_UPGRADE', upgradeId: 'pantry', expectedLevel: 0 },
      ),
    );
    assert.deepEqual(secondUpgrade.state.tutorialCompleted, ['upgrade']);
    assert.equal(
      secondUpgrade.events.some((event) => event.type === 'TUTORIAL_COMPLETED'),
      false,
    );

    const readyWelcome = deepFreeze(
      makeState({
        totalFeeds: 6,
        lifetimeGlowMicro: 12 * MICRO_PER_GLOW,
        glowMicro: 12 * MICRO_PER_GLOW,
      }),
    );
    const firstWelcome = assertOk(
      applyCommand(readyWelcome, {
        type: 'WELCOME_COMPANION',
        expectedPopulation: 1,
      }),
    );
    assert.ok(firstWelcome.state.tutorialCompleted.includes('welcome'));
    assert.deepEqual(firstWelcome.events[1], {
      type: 'TUTORIAL_COMPLETED',
      step: 'welcome',
      atMs: 0,
    });

    const secondWelcome = assertOk(
      applyCommand(
        deepFreeze(
          makeState({
            simTimeMs: 1_000,
            totalFeeds: 24,
            lifetimeGlowMicro: 90 * MICRO_PER_GLOW,
            glowMicro: 90 * MICRO_PER_GLOW,
            upgrades: { beds: 1 },
            slimes: makeSlimes(2),
            tutorialCompleted: ['feed', 'welcome', 'upgrade'],
          }),
        ),
        { type: 'WELCOME_COMPANION', expectedPopulation: 2 },
      ),
    );
    assert.deepEqual(secondWelcome.state.tutorialCompleted, [
      'feed',
      'welcome',
      'upgrade',
    ]);
    assert.equal(
      secondWelcome.events.some((event) => event.type === 'TUTORIAL_COMPLETED'),
      false,
    );
    assert.equal(secondWelcome.events[0].type, 'COMPANION_ADDED');
  });
});

describe('review-gate transcript: fresh state to slime-2', () => {
  test('only advance + applyCommand reach a successful WELCOME of slime-2', () => {
    /** @type {object[]} */
    const sequence = [];
    let state = createInitialState();

    /**
     * @param {object} command
     */
    function applyAt(command) {
      const atMs = state.simTimeMs;
      const frozen = deepFreeze(cloneState(state));
      const result = applyCommand(frozen, command);
      sequence.push({
        op: 'applyCommand',
        atMs,
        command: { ...command },
        ok: result.ok,
        reason: result.ok ? undefined : result.reason,
        berries: result.ok ? result.state.berries : frozen.berries,
        totalFeeds: result.ok ? result.state.totalFeeds : frozen.totalFeeds,
      });
      assert.equal(result.ok, true, `command at ${atMs} ms: ${result.reason}`);
      state = result.state;
      return result;
    }

    /**
     * @param {number} elapsedMs
     */
    function wait(elapsedMs) {
      const fromMs = state.simTimeMs;
      const result = advance(deepFreeze(cloneState(state)), elapsedMs);
      state = result.state;
      sequence.push({
        op: 'advance',
        elapsedMs,
        fromMs,
        toMs: state.simTimeMs,
        berries: state.berries,
        lifetimeGlowMicro: state.lifetimeGlowMicro,
      });
    }

    applyAt({ type: 'FEED', slimeId: 'slime-1' });
    for (let n = 1; n < 6; n += 1) {
      const cooldownWait = state.nextFeedAllowedAtMs - state.simTimeMs;
      if (cooldownWait > 0) wait(cooldownWait);
      if (state.berries < FEED_BERRY_COST) {
        assert.notEqual(state.nextBerryAtMs, null);
        const berryWait = state.nextBerryAtMs - state.simTimeMs;
        if (berryWait > 0) wait(berryWait);
      }
      applyAt({ type: 'FEED', slimeId: 'slime-1' });
    }

    assert.equal(state.totalFeeds, 6);
    assert.equal(state.simTimeMs, 20_000);

    const needMicro = 12 * MICRO_PER_GLOW - state.lifetimeGlowMicro;
    const rate = BASE_RATE_MICRO_PER_SECOND * BONUS_MULTIPLIER;
    assert.equal(state.incomeRemainder, 0);
    const glowWaitMs = (needMicro * 1_000) / rate;
    assert.equal(glowWaitMs, 40_000);
    wait(glowWaitMs);

    assert.equal(state.simTimeMs, 60_000);
    assert.equal(state.lifetimeGlowMicro, 12 * MICRO_PER_GLOW);
    assert.equal(state.totalFeeds, 6);
    assert.equal(getCompanionEligibility(state).ready, true);
    assert.equal(getCompanionEligibility(state).requiredCapacity, 2);

    const beforeWelcome = {
      glowMicro: state.glowMicro,
      berries: state.berries,
      totalFeeds: state.totalFeeds,
    };
    const welcome = applyAt({
      type: 'WELCOME_COMPANION',
      expectedPopulation: 1,
    });

    assert.equal(state.slimes.length, 2);
    const companion = state.slimes[1];
    assert.equal(companion.id, 'slime-2');
    assert.equal(companion.name, SLIME_NAMES[1]);
    assert.equal(companion.boostUntilMs, 0);
    assert.equal(companion.feedCount, 0);
    assert.equal(companion.homeSlot, 1);
    assert.equal(companion.createdAtMs, 60_000);
    assert.equal(state.glowMicro, beforeWelcome.glowMicro);
    assert.equal(state.berries, beforeWelcome.berries);
    assert.equal(state.totalFeeds, beforeWelcome.totalFeeds);
    assert.deepEqual(welcome.events[0], {
      type: 'COMPANION_ADDED',
      slimeId: 'slime-2',
      homeSlot: 1,
      atMs: 60_000,
    });

    const summary = sequence.map((step) =>
      step.op === 'applyCommand'
        ? {
            op: step.op,
            type: step.command.type,
            atMs: step.atMs,
            ok: step.ok,
          }
        : {
            op: step.op,
            elapsedMs: step.elapsedMs,
            fromMs: step.fromMs,
            toMs: step.toMs,
          },
    );
    assert.deepEqual(summary, [
      { op: 'applyCommand', type: 'FEED', atMs: 0, ok: true },
      { op: 'advance', elapsedMs: 4_000, fromMs: 0, toMs: 4_000 },
      { op: 'applyCommand', type: 'FEED', atMs: 4_000, ok: true },
      { op: 'advance', elapsedMs: 4_000, fromMs: 4_000, toMs: 8_000 },
      { op: 'applyCommand', type: 'FEED', atMs: 8_000, ok: true },
      { op: 'advance', elapsedMs: 4_000, fromMs: 8_000, toMs: 12_000 },
      { op: 'applyCommand', type: 'FEED', atMs: 12_000, ok: true },
      { op: 'advance', elapsedMs: 4_000, fromMs: 12_000, toMs: 16_000 },
      { op: 'applyCommand', type: 'FEED', atMs: 16_000, ok: true },
      { op: 'advance', elapsedMs: 4_000, fromMs: 16_000, toMs: 20_000 },
      { op: 'applyCommand', type: 'FEED', atMs: 20_000, ok: true },
      { op: 'advance', elapsedMs: 40_000, fromMs: 20_000, toMs: 60_000 },
      {
        op: 'applyCommand',
        type: 'WELCOME_COMPANION',
        atMs: 60_000,
        ok: true,
      },
    ]);
    console.log(
      'P05 review-gate transcript (fresh → slime-2):\n' +
        JSON.stringify(summary, null, 2),
    );
  });
});

describe('core module isolation', () => {
  test('commands.mjs does not import DOM, Three, clocks, randomness, or advance', () => {
    const source = readFileSync(join(coreDir, 'commands.mjs'), 'utf8');
    const forbidden = [
      /\bdocument\b/,
      /\bwindow\b/,
      /\blocalStorage\b/,
      /from\s+['"][^'"]*three/i,
      /performance\s*\./,
      /\bDate\s*\./,
      /Math\s*\.\s*random/,
      /from\s+['"][^'"]*advance/,
    ];
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `commands.mjs must not contain ${pattern}`,
      );
    }
  });
});
