import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  advance,
  advancePassive,
} from '../src/core/advance.mjs';
import {
  MICRO_PER_GLOW,
  OFFLINE_CAP_MS,
  POPULATION_CAP,
  SLIME_NAMES,
} from '../src/core/balance.mjs';
import { resolveCompanionsNow } from '../src/core/progression.mjs';
import { getRateMicroPerSecond } from '../src/core/selectors.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');

/**
 * @param {object} [patch]
 */
function makeCrossingState(patch = {}) {
  const state = cloneState(createInitialState());
  state.totalFeeds = 6;
  state.lifetimeGlowMicro = 11_900_000;
  state.glowMicro = 0;
  state.incomeRemainder = 0;
  state.simTimeMs = 0;
  state.slimes[0].feedCount = 6;
  state.berries = 12;
  state.nextBerryAtMs = null;
  const { slimes, upgrades, ...rest } = patch;
  Object.assign(state, rest);
  if (upgrades) {
    state.upgrades = { ...state.upgrades, ...upgrades };
  }
  if (slimes) {
    state.slimes = slimes;
  }
  return state;
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

describe('resolveCompanionsNow', () => {
  test('clones, adds sequential residents, syncs world, and no-ops at cap', () => {
    const input = deepFreeze(makeCrossingState({ lifetimeGlowMicro: 12_000_000 }));
    const snapshot = structuredClone(input);
    const result = resolveCompanionsNow(input);
    assert.deepEqual(input, snapshot);
    assert.notEqual(result.state, input);
    assert.equal(result.state.slimes.length, 2);
    assert.equal(result.state.slimes[1].id, 'slime-2');
    assert.equal(result.state.slimes[1].name, SLIME_NAMES[1]);
    assert.equal(result.state.slimes[1].homeSlot, 1);
    assert.equal(result.state.slimes[1].createdAtMs, 0);
    assert.equal(result.state.slimes[1].boostUntilMs, 0);
    assert.equal(result.state.slimes[1].feedCount, 0);
    assert.deepEqual(result.events[0], {
      type: 'COMPANION_ADDED',
      slimeId: 'slime-2',
      homeSlot: 1,
      atMs: 0,
    });
    assert.ok(result.state.tutorialCompleted.includes('welcome'));
    assert.equal(result.state.world.residents.length, 2);
    assert.equal(result.state.world.timeMs, 0);
    assert.deepEqual(result.state.world.foods, []);
    assert.deepEqual(result.state.world.residents[1].position, { x: -3, z: 2 });

    const again = resolveCompanionsNow(result.state);
    assert.equal(again.state.slimes.length, 2);
    assert.deepEqual(again.events, []);

    const capped = cloneState(createInitialState());
    capped.totalFeeds = 500;
    capped.lifetimeGlowMicro = 16_000 * MICRO_PER_GLOW;
    capped.glowMicro = 16_000 * MICRO_PER_GLOW;
    capped.upgrades.beds = 8;
    capped.slimes = makeSlimes(POPULATION_CAP, { feedCount: 50 });
    capped.totalFeeds = 50 * POPULATION_CAP;
    const noEleventh = resolveCompanionsNow(capped);
    assert.equal(noEleventh.state.slimes.length, POPULATION_CAP);
    assert.deepEqual(noEleventh.events, []);
  });

  test('multi-eligible checkpoint normalizes once at the current timestamp', () => {
    const state = cloneState(createInitialState());
    state.totalFeeds = 24;
    state.lifetimeGlowMicro = 90 * MICRO_PER_GLOW;
    state.glowMicro = 90 * MICRO_PER_GLOW;
    state.slimes[0].feedCount = 24;
    state.upgrades.beds = 1;
    const result = resolveCompanionsNow(deepFreeze(state));
    assert.equal(result.state.slimes.length, 3);
    assert.deepEqual(
      result.state.slimes.map((slime) => slime.id),
      ['slime-1', 'slime-2', 'slime-3'],
    );
    assert.equal(result.state.slimes[1].createdAtMs, 0);
    assert.equal(result.state.slimes[2].createdAtMs, 0);
    assert.equal(result.state.glowMicro, 90 * MICRO_PER_GLOW);
    assert.equal(result.state.lifetimeGlowMicro, 90 * MICRO_PER_GLOW);
    const added = result.events.filter((event) => event.type === 'COMPANION_ADDED');
    assert.equal(added.length, 2);
  });
});

describe('passive arrival crossing', () => {
  test('999 ms then +1 ms then 1000 ms matches a whole 2000 ms advance', () => {
    const start = deepFreeze(makeCrossingState());
    const first = advancePassive(start, 999);
    assert.equal(first.state.slimes.length, 1);
    assert.equal(first.state.lifetimeGlowMicro, 11_999_900);
    assert.equal(first.state.glowMicro, 99_900);
    assert.equal(first.summary.companionsAdded.length, 0);

    const second = advancePassive(deepFreeze(first.state), 1);
    assert.equal(second.state.lifetimeGlowMicro, 12_000_000);
    assert.equal(second.state.glowMicro, 100_000);
    assert.equal(second.state.slimes.length, 2);
    assert.equal(second.state.slimes[1].id, 'slime-2');
    assert.equal(second.state.slimes[1].createdAtMs, 1_000);
    assert.deepEqual(second.summary.companionsAdded, ['slime-2']);

    const third = advancePassive(deepFreeze(second.state), 1_000);
    assert.equal(third.state.glowMicro, 300_000);
    assert.equal(third.state.lifetimeGlowMicro, 12_200_000);
    assert.equal(third.state.slimes.length, 2);

    const whole = advancePassive(start, 2_000);
    assert.equal(whole.state.glowMicro, 300_000);
    assert.equal(whole.state.lifetimeGlowMicro, 12_200_000);
    assert.equal(whole.state.slimes.length, 2);
    assert.equal(whole.state.slimes[1].createdAtMs, 1_000);
    assert.deepEqual(whole.state, third.state);
    assert.equal(advance, advancePassive);
  });

  test('second resident does not earn during the millisecond before join', () => {
    const joined = advancePassive(deepFreeze(makeCrossingState()), 1_000);
    assert.equal(joined.state.glowMicro, 100_000);
    assert.equal(joined.state.slimes.length, 2);
    assert.equal(getRateMicroPerSecond(joined.state), 200_000);
  });

  test('population 10 never grows under passive time', () => {
    const capped = cloneState(createInitialState());
    capped.upgrades.beds = 8;
    capped.slimes = makeSlimes(POPULATION_CAP);
    capped.totalFeeds = 500;
    capped.lifetimeGlowMicro = 20_000 * MICRO_PER_GLOW;
    capped.glowMicro = 20_000 * MICRO_PER_GLOW;
    const result = advancePassive(deepFreeze(capped), 10_000);
    assert.equal(result.state.slimes.length, POPULATION_CAP);
    assert.deepEqual(result.summary.companionsAdded, []);
  });
});

describe('bonus-boundary arrival', () => {
  test('join at boost expiry: first second 200k boosted, next second two unboosted', () => {
    const start = makeCrossingState({
      lifetimeGlowMicro: 11_800_000,
    });
    start.slimes[0].boostUntilMs = 1_000;
    const first = advancePassive(deepFreeze(start), 1_000);
    assert.equal(first.state.glowMicro, 200_000);
    assert.equal(first.state.lifetimeGlowMicro, 12_000_000);
    assert.equal(first.state.slimes.length, 2);
    assert.equal(first.state.slimes[1].createdAtMs, 1_000);
    assert.equal(first.state.slimes[1].boostUntilMs, 0);
    assert.equal(first.state.slimes[0].boostUntilMs, 1_000);
    assert.equal(getRateMicroPerSecond(first.state), 200_000);

    const second = advancePassive(deepFreeze(first.state), 1_000);
    assert.equal(second.state.glowMicro, 400_000);
    assert.equal(second.state.lifetimeGlowMicro, 12_200_000);
    assert.equal(second.state.slimes[1].boostUntilMs, 0);

    const whole = advancePassive(deepFreeze(start), 2_000);
    assert.deepEqual(whole.state, second.state);
  });
});

describe('idle baseline still true under advancePassive', () => {
  test('15_000 ms: 1.5 Glow, berry 7, no second resident', () => {
    const result = advancePassive(deepFreeze(createInitialState()), 15_000);
    assert.equal(result.state.glowMicro, 1_500_000);
    assert.equal(result.state.lifetimeGlowMicro, 1_500_000);
    assert.equal(result.state.berries, 7);
    assert.equal(result.state.nextBerryAtMs, 30_000);
    assert.equal(result.state.slimes.length, 1);
    assert.equal(result.state.totalFeeds, 0);
    assert.deepEqual(result.summary.companionsAdded, []);
  });

  test('one hour 360 Glow and eight hours 2880 Glow; Glow alone does not spawn', () => {
    const hour = advancePassive(deepFreeze(createInitialState()), 3_600_000);
    assert.equal(hour.state.glowMicro, 360 * MICRO_PER_GLOW);
    assert.equal(hour.state.slimes.length, 1);
    const eight = advancePassive(deepFreeze(createInitialState()), OFFLINE_CAP_MS);
    assert.equal(eight.state.glowMicro, 2_880 * MICRO_PER_GLOW);
    assert.equal(eight.state.slimes.length, 1);
  });
});

describe('progression module isolation', () => {
  test('progression.mjs does not import advance, DOM, Three, Date, or randomness', () => {
    const source = readFileSync(join(coreDir, 'progression.mjs'), 'utf8');
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
        `progression.mjs must not contain ${pattern}`,
      );
    }
  });
});
