import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advance } from '../src/core/advance.mjs';
import {
  BASE_RATE_MICRO_PER_SECOND,
  BONUS_EXTEND_MS,
  BONUS_MAX_REMAINING_MS,
  BONUS_MULTIPLIER,
  FEED_BERRY_COST,
  FEED_COOLDOWN_MS,
  FEED_COUNTER_CAP,
  MICRO_PER_GLOW,
  PANTRY_CAPACITIES,
  SLIME_NAMES,
  UPGRADE_MAX_LEVEL,
} from '../src/core/balance.mjs';
import { applyCommand } from '../src/core/commands.mjs';
import { resolveCompanionsNow } from '../src/core/progression.mjs';
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
const THROW_LEGAL = Object.freeze({ type: 'THROW_FOOD', target: { x: 1.1, z: 2 } });

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
  test('is INVALID_COMMAND and never spends, boosts, or counts a feed', () => {
    const input = deepFreeze(createInitialState());
    const snapshot = structuredClone(input);
    const payloads = [
      FEED_SLIME_1,
      { type: 'FEED' },
      { type: 'FEED', slimeId: 'slime-99' },
      { type: 'FEED', slimeId: 1 },
    ];
    for (const command of payloads) {
      const result = applyCommand(input, command);
      assert.equal(result.ok, false, `expected invalid: ${JSON.stringify(command)}`);
      assert.equal(result.reason, 'INVALID_COMMAND');
      assert.equal(result.state, input);
      assert.deepEqual(result.events, []);
    }
    assert.equal(input.berries, 6);
    assert.equal(input.totalFeeds, 0);
    assert.equal(input.slimes[0].boostUntilMs, 0);
    assert.equal(input.slimes[0].feedCount, 0);
    assert.equal(input.world.foods.length, 0);
    assert.deepEqual(input, snapshot);
  });

  test('THROW_FOOD full basket: 12 berries, null timer, throw at 50_000 → 11, regen 65_000, no boost', () => {
    const input = cloneState(createInitialState());
    input.simTimeMs = 50_000;
    input.berries = 12;
    input.nextBerryAtMs = null;
    const frozen = deepFreeze(input);
    const snapshot = structuredClone(frozen);
    const result = assertOk(applyCommand(frozen, THROW_LEGAL));
    assert.equal(result.state.berries, 11);
    assert.equal(result.state.nextBerryAtMs, 65_000);
    assert.equal(getBerryIntervalMs(result.state), 15_000);
    assert.equal(result.state.simTimeMs, 50_000);
    assert.equal(result.state.totalFeeds, 0);
    assert.equal(result.state.slimes[0].boostUntilMs, 0);
    assert.equal(result.events[0].type, 'FOOD_THROWN');
    assert.deepEqual(frozen, snapshot);
    assert.notEqual(result.state, frozen);
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
  test('is rejected as INVALID_COMMAND and never charges or joins', () => {
    const fresh = deepFreeze(createInitialState());
    const freshSnapshot = structuredClone(fresh);
    const payloads = [
      { type: 'WELCOME_COMPANION', expectedPopulation: 1 },
      { type: 'WELCOME_COMPANION', expectedPopulation: 2 },
      { type: 'WELCOME_COMPANION' },
    ];
    for (const command of payloads) {
      const result = applyCommand(fresh, command);
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'INVALID_COMMAND');
      assert.equal(result.state, fresh);
      assert.deepEqual(result.events, []);
    }
    assert.deepEqual(fresh, freshSnapshot);
    assert.equal(fresh.glowMicro, 0);
    assert.equal(fresh.berries, 6);
    assert.equal(fresh.slimes.length, 1);
  });

  test('capacity blocks until a beds purchase, then joins in that transition', () => {
    const capacityShort = deepFreeze(
      makeState({
        totalFeeds: 24,
        lifetimeGlowMicro: 90 * MICRO_PER_GLOW,
        glowMicro: 90 * MICRO_PER_GLOW,
        upgrades: { beds: 0 },
        slimes: makeSlimes(2),
      }),
    );
    const eligibility = getCompanionEligibility(capacityShort);
    assert.equal(eligibility.capacityMet, false);
    assert.equal(eligibility.ready, false);
    assert.equal(capacityShort.slimes.length, 2);

    const stillBlocked = resolveCompanionsNow(capacityShort);
    assert.equal(stillBlocked.state.slimes.length, 2);
    assert.deepEqual(stillBlocked.events, []);

    const bought = assertOk(
      applyCommand(capacityShort, {
        type: 'BUY_UPGRADE',
        upgradeId: 'beds',
        expectedLevel: 0,
      }),
    );
    assert.equal(bought.state.upgrades.beds, 1);
    assert.equal(bought.state.slimes.length, 3);
    assert.equal(bought.state.slimes[2].id, 'slime-3');
    assert.equal(bought.state.slimes[2].createdAtMs, 0);
    assert.equal(bought.state.slimes[2].boostUntilMs, 0);
    assert.equal(bought.events[0].type, 'UPGRADE_BOUGHT');
    const companion = bought.events.find((event) => event.type === 'COMPANION_ADDED');
    assert.deepEqual(companion, {
      type: 'COMPANION_ADDED',
      slimeId: 'slime-3',
      homeSlot: 2,
      atMs: 0,
    });
    assert.equal(
      bought.events.findIndex((event) => event.type === 'UPGRADE_BOUGHT') <
        bought.events.findIndex((event) => event.type === 'COMPANION_ADDED'),
      true,
    );
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
    assert.equal(spent.state.slimes.length, 3);
    assert.equal(spent.state.slimes[2].id, 'slime-3');
    assert.equal(spent.state.berries, input.berries);
    assert.equal(spent.state.totalFeeds, 24);
    assert.equal(spent.state.slimes[2].boostUntilMs, 0);
    assert.equal(spent.state.slimes[2].homeSlot, 2);
  });

  test('FEED does not join; BUY_UPGRADE still concatenates UPGRADE then COMPANION_ADDED', () => {
    const input = deepFreeze(
      makeState({
        totalFeeds: 5,
        lifetimeGlowMicro: 12 * MICRO_PER_GLOW,
        glowMicro: 12 * MICRO_PER_GLOW,
        berries: 6,
        slimes: [
          {
            ...createInitialState().slimes[0],
            feedCount: 5,
          },
        ],
        tutorialCompleted: ['feed'],
      }),
    );
    const fed = applyCommand(input, FEED_SLIME_1);
    assert.equal(fed.ok, false);
    assert.equal(fed.reason, 'INVALID_COMMAND');
    assert.equal(fed.state.totalFeeds, 5);
    assert.equal(fed.state.slimes.length, 1);

    const bought = assertOk(
      applyCommand(
        deepFreeze(
          makeState({
            totalFeeds: 24,
            lifetimeGlowMicro: 90 * MICRO_PER_GLOW,
            glowMicro: 90 * MICRO_PER_GLOW,
            upgrades: { beds: 0 },
            slimes: makeSlimes(2),
          }),
        ),
        { type: 'BUY_UPGRADE', upgradeId: 'beds', expectedLevel: 0 },
      ),
    );
    assert.equal(bought.events[0].type, 'UPGRADE_BOUGHT');
    assert.equal(bought.events.some((event) => event.type === 'COMPANION_ADDED'), true);
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
      { type: 'THROW_FOOD' },
      { type: 'THROW_FOOD', target: null },
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

    const ok = assertOk(applyCommand(input, THROW_LEGAL));
    assert.notEqual(ok.state, input);
    assert.notEqual(ok.state.slimes, input.slimes);
    assert.notEqual(ok.state.slimes[0], input.slimes[0]);
    assert.equal(ok.state.simTimeMs, input.simTimeMs);
    assert.equal(ok.state.berries, input.berries - FEED_BERRY_COST);
    assert.ok(ok.events.some((event) => event.type === 'FOOD_THROWN'));
    assert.equal(ok.state.totalFeeds, 0);
    assert.equal(ok.state.slimes[0].boostUntilMs, 0);
  });
});

describe('tutorial steps', () => {
  test('first throw/upgrade/welcome emit their steps once only', () => {
    const firstThrow = assertOk(
      applyCommand(deepFreeze(createInitialState()), THROW_LEGAL),
    );
    assert.deepEqual(firstThrow.state.tutorialCompleted, ['throw']);
    assert.deepEqual(firstThrow.events, [
      {
        type: 'FOOD_THROWN',
        foodId: 'food-1',
        target: { x: 1.1, z: 2 },
        atMs: 0,
      },
      { type: 'TUTORIAL_COMPLETED', step: 'throw', atMs: 0 },
    ]);

    const secondThrow = assertOk(
      applyCommand(deepFreeze(atTime(firstThrow.state, 1_000)), THROW_LEGAL),
    );
    assert.deepEqual(secondThrow.state.tutorialCompleted, ['throw']);
    assert.equal(
      secondThrow.events.some((event) => event.type === 'TUTORIAL_COMPLETED'),
      false,
    );
    assert.equal(secondThrow.events.length, 1);
    assert.equal(secondThrow.events[0].type, 'FOOD_THROWN');

    const alreadyThrown = assertOk(
      applyCommand(
        deepFreeze(cloneState(makeState({ tutorialCompleted: ['throw'], berries: 6 }))),
        THROW_LEGAL,
      ),
    );
    assert.deepEqual(alreadyThrown.state.tutorialCompleted, ['throw']);
    assert.equal(
      alreadyThrown.events.some((event) => event.type === 'TUTORIAL_COMPLETED'),
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
    const firstWelcome = resolveCompanionsNow(readyWelcome);
    assert.ok(firstWelcome.state.tutorialCompleted.includes('welcome'));
    assert.equal(firstWelcome.state.slimes.length, 2);
    assert.deepEqual(firstWelcome.events[1], {
      type: 'TUTORIAL_COMPLETED',
      step: 'welcome',
      atMs: 0,
    });

    const secondWelcome = resolveCompanionsNow(
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
    assert.equal(secondWelcome.state.slimes.length, 3);
  });
});

describe('review-gate transcript: fresh state to slime-2', () => {
  test('legacy v1 feed mutation + advance still reach an automatic slime-2 join; FEED command is gone', () => {
    const rejected = applyCommand(createInitialState(), FEED_SLIME_1);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'INVALID_COMMAND');

    /**
     * Test-local copy of the removed v1 FEED mutation (berry, 4s cooldown,
     * boost formula, counters, feed tutorial). Not THROW_FOOD.
     *
     * @param {import('../src/core/state.mjs').GameState} state
     */
    function applyLegacyFeed(state) {
      const slimeIndex = state.slimes.findIndex((slime) => slime.id === 'slime-1');
      const t = state.simTimeMs;
      const next = cloneState(state);
      const wasFull = next.nextBerryAtMs === null;
      next.berries -= FEED_BERRY_COST;
      if (wasFull) {
        next.nextBerryAtMs = t + getBerryIntervalMs(next);
      }
      const slime = next.slimes[slimeIndex];
      slime.boostUntilMs = Math.min(
        t + BONUS_MAX_REMAINING_MS,
        Math.max(t, slime.boostUntilMs) + BONUS_EXTEND_MS,
      );
      next.nextFeedAllowedAtMs = t + FEED_COOLDOWN_MS;
      if (next.totalFeeds < FEED_COUNTER_CAP) {
        next.totalFeeds += 1;
        slime.feedCount += 1;
      }
      if (!next.tutorialCompleted.includes('feed')) {
        next.tutorialCompleted.push('feed');
      }
      return resolveCompanionsNow(next).state;
    }

    /** @type {object[]} */
    const sequence = [];
    let state = createInitialState();

    function feedAt() {
      const atMs = state.simTimeMs;
      state = applyLegacyFeed(state);
      sequence.push({
        op: 'legacyFeed',
        atMs,
        berries: state.berries,
        totalFeeds: state.totalFeeds,
      });
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

    feedAt();
    for (let n = 1; n < 6; n += 1) {
      const cooldownWait = state.nextFeedAllowedAtMs - state.simTimeMs;
      if (cooldownWait > 0) wait(cooldownWait);
      if (state.berries < FEED_BERRY_COST) {
        assert.notEqual(state.nextBerryAtMs, null);
        const berryWait = state.nextBerryAtMs - state.simTimeMs;
        if (berryWait > 0) wait(berryWait);
      }
      feedAt();
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
    assert.equal(state.slimes.length, 2);
    assert.equal(getCompanionEligibility(state).ready, false);
    assert.equal(getCompanionEligibility(state).requiredCapacity, 3);

    const companion = state.slimes[1];
    assert.equal(companion.id, 'slime-2');
    assert.equal(companion.name, SLIME_NAMES[1]);
    assert.equal(companion.boostUntilMs, 0);
    assert.equal(companion.feedCount, 0);
    assert.equal(companion.homeSlot, 1);
    assert.equal(companion.createdAtMs, 60_000);

    const summary = sequence.map((step) =>
      step.op === 'legacyFeed'
        ? {
            op: step.op,
            atMs: step.atMs,
          }
        : {
            op: step.op,
            elapsedMs: step.elapsedMs,
            fromMs: step.fromMs,
            toMs: step.toMs,
          },
    );
    assert.deepEqual(summary, [
      { op: 'legacyFeed', atMs: 0 },
      { op: 'advance', elapsedMs: 4_000, fromMs: 0, toMs: 4_000 },
      { op: 'legacyFeed', atMs: 4_000 },
      { op: 'advance', elapsedMs: 4_000, fromMs: 4_000, toMs: 8_000 },
      { op: 'legacyFeed', atMs: 8_000 },
      { op: 'advance', elapsedMs: 4_000, fromMs: 8_000, toMs: 12_000 },
      { op: 'legacyFeed', atMs: 12_000 },
      { op: 'advance', elapsedMs: 4_000, fromMs: 12_000, toMs: 16_000 },
      { op: 'legacyFeed', atMs: 16_000 },
      { op: 'advance', elapsedMs: 4_000, fromMs: 16_000, toMs: 20_000 },
      { op: 'legacyFeed', atMs: 20_000 },
      { op: 'advance', elapsedMs: 40_000, fromMs: 20_000, toMs: 60_000 },
    ]);
    console.log(
      'P2-07 review-gate transcript (legacy feed → slime-2; FEED command rejected):\n' +
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
