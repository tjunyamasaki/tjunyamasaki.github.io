import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ARRIVAL_STYLE_ID,
  BEDS_CAPACITIES,
  BEDS_COSTS_MICRO,
  BLOOM_COSTS_MICRO,
  COMPANION_MILESTONES,
  GAME_ID,
  HABITAT_ID,
  MICRO_PER_GLOW,
  PANTRY_CAPACITIES,
  PANTRY_COSTS_MICRO,
  POPULATION_CAP,
  SHRUB_COSTS_MICRO,
  SHRUB_INTERVALS_MS,
  SLIME_NAMES,
  TUTORIAL_STEPS,
  UPGRADE_MAX_LEVEL,
} from '../src/core/balance.mjs';
import {
  getBerryCapacity,
  getBerryIntervalMs,
  getCompanionEligibility,
  getNextUpgradeCostMicro,
  getRateMicroPerSecond,
  getResidentCapacity,
} from '../src/core/selectors.mjs';
import { createInitialState } from '../src/core/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');

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
 * @param {{ boostUntilMs?: number, createdAtMs?: number }} [opts]
 */
function makeSlimes(count, opts = {}) {
  const boostUntilMs = opts.boostUntilMs ?? 0;
  const createdAtMs = opts.createdAtMs ?? 0;
  return Array.from({ length: count }, (_, index) => ({
    id: `slime-${index + 1}`,
    name: SLIME_NAMES[index],
    createdAtMs,
    boostUntilMs,
    feedCount: 0,
    homeSlot: index,
  }));
}

/**
 * Independent hand calculation of unboosted micro-Glow/s.
 * @param {number} population
 * @param {number} bloomLevel
 */
function expectedUnboostedRate(population, bloomLevel) {
  return population * 100_000 * (1 + 0.25 * bloomLevel);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}

describe('createInitialState', () => {
  test('fresh state matches the v1 starting design', () => {
    const state = createInitialState();
    assert.equal(state.simTimeMs, 0);
    assert.equal(state.glowMicro, 0);
    assert.equal(state.lifetimeGlowMicro, 0);
    assert.equal(state.incomeRemainder, 0);
    assert.equal(state.berries, 6);
    assert.equal(state.nextBerryAtMs, 15_000);
    assert.equal(state.nextFeedAllowedAtMs, 0);
    assert.equal(state.totalFeeds, 0);
    assert.deepEqual(state.upgrades, {
      shrub: 0,
      pantry: 0,
      bloom: 0,
      beds: 0,
    });
    assert.deepEqual(state.tutorialCompleted, []);
    assert.equal(state.habitatId, HABITAT_ID);
    assert.equal(state.arrivalStyleId, ARRIVAL_STYLE_ID);
    assert.equal(state.habitatId, 'garden-prototype-v1');
    assert.equal(state.arrivalStyleId, 'visitor-v1');
    assert.equal(state.slimes.length, 1);
    assert.deepEqual(state.slimes[0], {
      id: 'slime-1',
      name: 'Slime 1',
      createdAtMs: 0,
      boostUntilMs: 0,
      feedCount: 0,
      homeSlot: 0,
    });
    assert.equal(getBerryCapacity(state), 12);
    assert.equal(getBerryIntervalMs(state), 15_000);
    assert.equal(getResidentCapacity(state), 2);
    assert.equal(getRateMicroPerSecond(state), 100_000);
    assert.equal(GAME_ID, 'cozy-slime-mvp');
    assert.deepEqual([...TUTORIAL_STEPS], ['feed', 'berry', 'welcome', 'upgrade']);
    assert.deepEqual([...SLIME_NAMES], [
      'Slime 1',
      'Slime 2',
      'Slime 3',
      'Slime 4',
      'Slime 5',
      'Slime 6',
    ]);
  });

  test('returns a new object tree every call', () => {
    const first = createInitialState();
    const second = createInitialState();
    assert.notEqual(first, second);
    assert.notEqual(first.slimes, second.slimes);
    assert.notEqual(first.slimes[0], second.slimes[0]);
    assert.notEqual(first.upgrades, second.upgrades);
    assert.notEqual(first.tutorialCompleted, second.tutorialCompleted);
    first.berries = 0;
    first.upgrades.shrub = 3;
    first.slimes[0].feedCount = 9;
    first.tutorialCompleted.push('feed');
    const third = createInitialState();
    assert.equal(third.berries, 6);
    assert.equal(third.upgrades.shrub, 0);
    assert.equal(third.slimes[0].feedCount, 0);
    assert.deepEqual(third.tutorialCompleted, []);
  });
});

describe('upgrade selectors (table-driven)', () => {
  test('every shrub level sets the berry interval', () => {
    const table = [
      [0, 15_000],
      [1, 12_000],
      [2, 10_000],
      [3, 8_000],
    ];
    assert.equal(table.length, UPGRADE_MAX_LEVEL.shrub + 1);
    assert.deepEqual(
      table.map(([, interval]) => interval),
      [...SHRUB_INTERVALS_MS],
    );
    for (const [level, intervalMs] of table) {
      const state = makeState({ upgrades: { shrub: level } });
      assert.equal(getBerryIntervalMs(state), intervalMs, `shrub level ${level}`);
      assert.equal(getBerryCapacity(state), 12);
      assert.equal(getResidentCapacity(state), 2);
      assert.equal(getRateMicroPerSecond(state), 100_000);
    }
  });

  test('every pantry level sets berry capacity', () => {
    const table = [
      [0, 12],
      [1, 18],
      [2, 24],
    ];
    assert.equal(table.length, UPGRADE_MAX_LEVEL.pantry + 1);
    assert.deepEqual(
      table.map(([, cap]) => cap),
      [...PANTRY_CAPACITIES],
    );
    for (const [level, capacity] of table) {
      const state = makeState({ upgrades: { pantry: level } });
      assert.equal(getBerryCapacity(state), capacity, `pantry level ${level}`);
      assert.equal(getBerryIntervalMs(state), 15_000);
      assert.equal(getResidentCapacity(state), 2);
    }
  });

  test('every beds level sets resident capacity', () => {
    const table = [
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 5],
      [4, 6],
    ];
    assert.equal(table.length, UPGRADE_MAX_LEVEL.beds + 1);
    assert.deepEqual(
      table.map(([, cap]) => cap),
      [...BEDS_CAPACITIES],
    );
    for (const [level, capacity] of table) {
      const state = makeState({ upgrades: { beds: level } });
      assert.equal(getResidentCapacity(state), capacity, `beds level ${level}`);
      assert.equal(getBerryCapacity(state), 12);
    }
  });

  test('every bloom level times every population yields the design rate', () => {
    for (let bloom = 0; bloom <= UPGRADE_MAX_LEVEL.bloom; bloom += 1) {
      for (let population = 1; population <= POPULATION_CAP; population += 1) {
        const state = makeState({
          simTimeMs: 0,
          upgrades: { bloom },
          slimes: makeSlimes(population, { boostUntilMs: 0 }),
        });
        const expected = expectedUnboostedRate(population, bloom);
        assert.equal(
          getRateMicroPerSecond(state),
          expected,
          `bloom ${bloom} × population ${population}`,
        );
        assert.equal(Number.isInteger(expected), true);
        assert.equal(Number.isInteger(getRateMicroPerSecond(state)), true);
      }
    }
  });
});

describe('colony production at Bloom 5', () => {
  test('six unboosted residents produce 1_350_000 micro/s', () => {
    const zeroBoost = makeState({
      simTimeMs: 10_000,
      upgrades: { bloom: 5 },
      slimes: makeSlimes(6, { boostUntilMs: 0 }),
    });
    assert.equal(getRateMicroPerSecond(zeroBoost), 1_350_000);

    const expiredBoost = makeState({
      simTimeMs: 120_000,
      upgrades: { bloom: 5 },
      slimes: makeSlimes(6, { boostUntilMs: 120_000 }),
    });
    assert.equal(getRateMicroPerSecond(expiredBoost), 1_350_000);
  });

  test('six boosted residents produce 2_700_000 micro/s', () => {
    const state = makeState({
      simTimeMs: 10_000,
      upgrades: { bloom: 5 },
      slimes: makeSlimes(6, { boostUntilMs: 10_001 }),
    });
    assert.equal(getRateMicroPerSecond(state), 2_700_000);
  });
});

describe('getCompanionEligibility', () => {
  test('lifetime Glow of 12 with an empty wallet still meets the resident-2 Glow gate', () => {
    const state = makeState({
      glowMicro: 0,
      lifetimeGlowMicro: 12 * MICRO_PER_GLOW,
      totalFeeds: 6,
    });
    const eligibility = getCompanionEligibility(state);
    assert.equal(eligibility.nextPopulation, 2);
    assert.equal(eligibility.requiredFeeds, 6);
    assert.equal(eligibility.requiredLifetimeGlowMicro, 12 * MICRO_PER_GLOW);
    assert.equal(eligibility.requiredCapacity, 2);
    assert.equal(eligibility.feedsMet, true);
    assert.equal(eligibility.glowMet, true);
    assert.equal(eligibility.capacityMet, true);
    assert.equal(eligibility.ready, true);
  });

  test('a low spendable wallet does not block glowMet', () => {
    const state = makeState({
      glowMicro: 20 * MICRO_PER_GLOW,
      lifetimeGlowMicro: 100 * MICRO_PER_GLOW,
      totalFeeds: 24,
      upgrades: { beds: 1 },
      slimes: makeSlimes(2),
    });
    const eligibility = getCompanionEligibility(state);
    assert.equal(eligibility.nextPopulation, 3);
    assert.equal(eligibility.requiredFeeds, 24);
    assert.equal(eligibility.requiredLifetimeGlowMicro, 90 * MICRO_PER_GLOW);
    assert.equal(eligibility.requiredCapacity, 3);
    assert.equal(eligibility.glowMet, true);
    assert.equal(eligibility.feedsMet, true);
    assert.equal(eligibility.capacityMet, true);
    assert.equal(eligibility.ready, true);
    assert.ok(state.glowMicro < eligibility.requiredLifetimeGlowMicro);
  });

  test('wallet Glow cannot substitute for lifetime Glow', () => {
    const state = makeState({
      glowMicro: 12 * MICRO_PER_GLOW,
      lifetimeGlowMicro: 0,
      totalFeeds: 6,
    });
    const eligibility = getCompanionEligibility(state);
    assert.equal(eligibility.glowMet, false);
    assert.equal(eligibility.ready, false);
  });

  test('at the population cap nextPopulation is null and ready is false', () => {
    const last = COMPANION_MILESTONES[COMPANION_MILESTONES.length - 1];
    const state = makeState({
      glowMicro: 0,
      lifetimeGlowMicro: last.requiredLifetimeGlowMicro,
      totalFeeds: last.requiredFeeds,
      upgrades: { beds: 4 },
      slimes: makeSlimes(6),
    });
    const eligibility = getCompanionEligibility(state);
    assert.equal(eligibility.nextPopulation, null);
    assert.equal(eligibility.ready, false);
    assert.equal(eligibility.requiredFeeds, last.requiredFeeds);
    assert.equal(
      eligibility.requiredLifetimeGlowMicro,
      last.requiredLifetimeGlowMicro,
    );
    assert.equal(eligibility.requiredCapacity, last.requiredCapacity);
  });
});

describe('getNextUpgradeCostMicro', () => {
  test('returns exact micro costs then null at cap, and null for unknown ids', () => {
    const tables = {
      shrub: SHRUB_COSTS_MICRO,
      pantry: PANTRY_COSTS_MICRO,
      bloom: BLOOM_COSTS_MICRO,
      beds: BEDS_COSTS_MICRO,
    };
    for (const [id, costs] of Object.entries(tables)) {
      for (let level = 0; level < costs.length; level += 1) {
        const state = makeState({ upgrades: { [id]: level } });
        assert.equal(
          getNextUpgradeCostMicro(state, id),
          costs[level],
          `${id} level ${level}`,
        );
      }
      const maxed = makeState({ upgrades: { [id]: costs.length } });
      assert.equal(getNextUpgradeCostMicro(maxed, id), null, `${id} maxed`);
    }
    const fresh = createInitialState();
    assert.equal(getNextUpgradeCostMicro(fresh, 'unknown'), null);
    assert.equal(getNextUpgradeCostMicro(fresh, 'shrub'), 15 * MICRO_PER_GLOW);
    assert.equal(getNextUpgradeCostMicro(fresh, 'pantry'), 30 * MICRO_PER_GLOW);
    assert.equal(getNextUpgradeCostMicro(fresh, 'bloom'), 20 * MICRO_PER_GLOW);
    assert.equal(getNextUpgradeCostMicro(fresh, 'beds'), 40 * MICRO_PER_GLOW);
  });
});

describe('selector purity', () => {
  test('selectors do not mutate a frozen state object', () => {
    const state = deepFreeze(createInitialState());
    const before = structuredClone(state);
    assert.equal(getRateMicroPerSecond(state), 100_000);
    assert.equal(getBerryCapacity(state), 12);
    assert.equal(getBerryIntervalMs(state), 15_000);
    assert.equal(getResidentCapacity(state), 2);
    assert.equal(getNextUpgradeCostMicro(state, 'shrub'), 15 * MICRO_PER_GLOW);
    const eligibility = getCompanionEligibility(state);
    assert.equal(eligibility.ready, false);
    assert.deepEqual(state, before);
  });
});

describe('core module isolation', () => {
  test('core files do not import DOM, Three, performance, Date, or randomness', () => {
    const files = ['balance.mjs', 'state.mjs', 'selectors.mjs'];
    const forbidden = [
      /\bdocument\b/,
      /\bwindow\b/,
      /\blocalStorage\b/,
      /from\s+['"][^'"]*three/i,
      /performance\s*\./,
      /\bDate\s*\./,
      /Math\s*\.\s*random/,
    ];
    for (const file of files) {
      const source = readFileSync(join(coreDir, file), 'utf8');
      for (const pattern of forbidden) {
        assert.equal(
          pattern.test(source),
          false,
          `${file} must not contain ${pattern}`,
        );
      }
    }
  });
});
