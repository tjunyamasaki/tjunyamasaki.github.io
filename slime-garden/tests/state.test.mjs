import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ARRIVAL_STYLE_ID,
  BEDS_CAPACITIES,
  BEDS_COSTS_GLOW,
  BEDS_COSTS_MICRO,
  BLOOM_COSTS_MICRO,
  COMPANION_MILESTONES,
  GAME_ID,
  HABITAT_ID,
  MICRO_PER_GLOW,
  OFFLINE_CAP_MS,
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
  isAffordable,
  resolveNearSelectedTarget,
} from '../src/core/selectors.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');
const worldDir = join(here, '../src/world');

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
    assert.equal(state.nextThrowAllowedAtMs, 0);
    assert.equal(state.nextThrowAllowedAtMs, state.nextFeedAllowedAtMs);
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
    assert.deepEqual(
      [...TUTORIAL_STEPS],
      ['feed', 'berry', 'welcome', 'upgrade', 'throw', 'pet', 'camera'],
    );
    assert.deepEqual(
      [...SLIME_NAMES],
      [
        'Slime 1',
        'Slime 2',
        'Slime 3',
        'Slime 4',
        'Slime 5',
        'Slime 6',
        'Slime 7',
        'Slime 8',
        'Slime 9',
        'Slime 10',
      ],
    );
    assert.equal(POPULATION_CAP, 10);
    assert.equal(state.world.timeMs, 0);
    assert.equal(state.world.carryMs, 0);
    assert.equal(state.world.nextFoodSequence, 1);
    assert.deepEqual(state.world.foods, []);
    assert.equal(state.world.residents.length, 1);
    assert.equal(state.world.residents[0].activity, 'idle');
    assert.deepEqual(state.world.residents[0].position, { x: 0, z: 2 });
    assert.equal(state.world.residents[0].route, null);
    assert.equal(state.world.residents[0].nextDecisionWorldMs, 2000);
  });

  test('v1 enumerable save shape omits in-memory world/throw until P2-03', () => {
    const state = createInitialState();
    assert.deepEqual(Object.keys(state).sort(), [
      'arrivalStyleId',
      'berries',
      'glowMicro',
      'habitatId',
      'incomeRemainder',
      'lifetimeGlowMicro',
      'nextBerryAtMs',
      'nextFeedAllowedAtMs',
      'simTimeMs',
      'slimes',
      'totalFeeds',
      'tutorialCompleted',
      'upgrades',
    ]);
    const json = JSON.parse(JSON.stringify(state));
    assert.equal('world' in json, false);
    assert.equal('nextThrowAllowedAtMs' in json, false);
    assert.ok(state.world);
    assert.equal(state.nextThrowAllowedAtMs, 0);
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
      [5, 7],
      [6, 8],
      [7, 9],
      [8, 10],
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

  test('ten unboosted Bloom5 residents produce 2_250_000 micro/s', () => {
    const state = makeState({
      simTimeMs: 10_000,
      upgrades: { bloom: 5, beds: 8 },
      slimes: makeSlimes(10, { boostUntilMs: 0 }),
    });
    assert.equal(getRateMicroPerSecond(state), 2_250_000);
  });

  test('ten boosted Bloom5 residents produce 4_500_000 micro/s', () => {
    const state = makeState({
      simTimeMs: 10_000,
      upgrades: { bloom: 5, beds: 8 },
      slimes: makeSlimes(10, { boostUntilMs: 10_001 }),
    });
    assert.equal(getRateMicroPerSecond(state), 4_500_000);
  });

  test('max boosted ten-resident rate times eight-hour ms is a safe integer', () => {
    const product = 4_500_000 * OFFLINE_CAP_MS;
    assert.equal(product, 129_600_000_000_000);
    assert.equal(Number.isSafeInteger(product), true);
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

  test('at six residents the next gate is resident 7, not the cap', () => {
    const state = makeState({
      glowMicro: 0,
      lifetimeGlowMicro: 2200 * MICRO_PER_GLOW,
      totalFeeds: 200,
      upgrades: { beds: 4 },
      slimes: makeSlimes(6),
    });
    const eligibility = getCompanionEligibility(state);
    assert.equal(eligibility.nextPopulation, 7);
    assert.equal(eligibility.requiredFeeds, 260);
    assert.equal(eligibility.requiredLifetimeGlowMicro, 4000 * MICRO_PER_GLOW);
    assert.equal(eligibility.requiredCapacity, 7);
    assert.equal(eligibility.feedsMet, false);
    assert.equal(eligibility.glowMet, false);
    assert.equal(eligibility.capacityMet, false);
    assert.equal(eligibility.ready, false);
  });

  test('resident-7 gates are 260 feeds, 4000 lifetime Glow, capacity 7', () => {
    const almost = makeState({
      lifetimeGlowMicro: 4000 * MICRO_PER_GLOW,
      totalFeeds: 259,
      upgrades: { beds: 5 },
      slimes: makeSlimes(6),
    });
    const almostEl = getCompanionEligibility(almost);
    assert.equal(almostEl.nextPopulation, 7);
    assert.equal(almostEl.feedsMet, false);
    assert.equal(almostEl.glowMet, true);
    assert.equal(almostEl.capacityMet, true);
    assert.equal(almostEl.ready, false);

    const ready = makeState({
      lifetimeGlowMicro: 4000 * MICRO_PER_GLOW,
      totalFeeds: 260,
      upgrades: { beds: 5 },
      slimes: makeSlimes(6),
    });
    const readyEl = getCompanionEligibility(ready);
    assert.equal(readyEl.ready, true);
    assert.equal(readyEl.requiredFeeds, 260);
    assert.equal(readyEl.requiredLifetimeGlowMicro, 4000 * MICRO_PER_GLOW);
    assert.equal(readyEl.requiredCapacity, 7);
  });

  test('at the population cap nextPopulation is null and ready is false', () => {
    const last = COMPANION_MILESTONES[COMPANION_MILESTONES.length - 1];
    const state = makeState({
      glowMicro: 0,
      lifetimeGlowMicro: last.requiredLifetimeGlowMicro,
      totalFeeds: last.requiredFeeds,
      upgrades: { beds: 8 },
      slimes: makeSlimes(10),
    });
    const eligibility = getCompanionEligibility(state);
    assert.equal(last.nextPopulation, 10);
    assert.equal(eligibility.nextPopulation, null);
    assert.equal(eligibility.ready, false);
    assert.equal(eligibility.requiredFeeds, last.requiredFeeds);
    assert.equal(
      eligibility.requiredLifetimeGlowMicro,
      last.requiredLifetimeGlowMicro,
    );
    assert.equal(eligibility.requiredCapacity, last.requiredCapacity);
    assert.equal(eligibility.requiredFeeds, 500);
    assert.equal(eligibility.requiredLifetimeGlowMicro, 16000 * MICRO_PER_GLOW);
    assert.equal(eligibility.requiredCapacity, 10);
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
    const beds7 = makeState({ upgrades: { beds: 7 } });
    assert.equal(getNextUpgradeCostMicro(beds7, 'beds'), 8000 * MICRO_PER_GLOW);
    const beds8 = makeState({ upgrades: { beds: 8 } });
    assert.equal(getNextUpgradeCostMicro(beds8, 'beds'), null);
    assert.equal(BEDS_COSTS_GLOW[BEDS_COSTS_GLOW.length - 1], 8000);
    assert.equal(isAffordable(makeState({ glowMicro: 40 * MICRO_PER_GLOW }), 'beds'), true);
    assert.equal(isAffordable(makeState({ glowMicro: 40 * MICRO_PER_GLOW - 1 }), 'beds'), false);
    assert.equal(isAffordable(beds8, 'beds'), false);
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
    assert.equal(isAffordable(state, 'shrub'), false);
    assert.deepEqual(state, before);
  });
});

describe('cloneState world independence', () => {
  test('mutating cloned world position, foods, and route.points leaves the original', () => {
    const original = createInitialState();
    original.world.foods.push({
      id: 'food-1',
      target: { x: 1.1, z: 2 },
      createdWorldMs: 0,
      landAtWorldMs: 600,
      stage: 'flying',
      claimedBy: null,
      eatUntilWorldMs: null,
    });
    original.world.residents[0].route = {
      points: [
        { x: 0, z: 2 },
        { x: 1, z: 2 },
      ],
      length: 1,
      startedWorldMs: 0,
      cycleCount: 1,
      distanceAlong: 0,
    };
    const cloned = cloneState(original);
    cloned.world.residents[0].position.x = 99;
    cloned.world.residents[0].position.z = 99;
    cloned.world.foods[0].target.x = 50;
    cloned.world.foods.push({
      id: 'food-2',
      target: { x: 0, z: 0 },
      createdWorldMs: 0,
      landAtWorldMs: 600,
      stage: 'landed',
      claimedBy: null,
      eatUntilWorldMs: null,
    });
    cloned.world.residents[0].route.points[0].x = -7;
    cloned.world.residents[0].route.points.push({ x: 2, z: 2 });
    cloned.nextFeedAllowedAtMs = 4000;
    assert.equal(original.world.residents[0].position.x, 0);
    assert.equal(original.world.residents[0].position.z, 2);
    assert.equal(original.world.foods.length, 1);
    assert.equal(original.world.foods[0].target.x, 1.1);
    assert.equal(original.world.residents[0].route.points.length, 2);
    assert.equal(original.world.residents[0].route.points[0].x, 0);
    assert.equal(original.nextFeedAllowedAtMs, 0);
    assert.equal(original.nextThrowAllowedAtMs, 0);
    assert.equal(cloned.nextThrowAllowedAtMs, 4000);
    assert.equal(cloned.nextFeedAllowedAtMs, cloned.nextThrowAllowedAtMs);
  });

  test('resolveNearSelectedTarget returns a legal point in front of slime-1', () => {
    const state = createInitialState();
    const point = resolveNearSelectedTarget(state, 'slime-1');
    assert.ok(point);
    assert.equal(point.x, 0);
    assert.equal(point.z, 3.5);
    assert.equal(resolveNearSelectedTarget(state, 'slime-99'), null);
  });
});

describe('core module isolation', () => {
  test('core files do not import DOM, Three, performance, Date, or randomness', () => {
    const files = ['balance.mjs', 'state.mjs', 'selectors.mjs', 'clock-carry.mjs'];
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

  test('world files do not import DOM, Three, performance, Date, or randomness', () => {
    const files = ['layout.mjs', 'state.mjs'];
    const forbidden = [
      /\bdocument\b/,
      /\bwindow\b/,
      /\blocalStorage\b/,
      /from\s+['"][^'"]*three/i,
      /from\s+['"][^'"]*scene\//,
      /performance\s*\./,
      /\bDate\s*\./,
      /Math\s*\.\s*random/,
    ];
    for (const file of files) {
      const source = readFileSync(join(worldDir, file), 'utf8');
      for (const pattern of forbidden) {
        assert.equal(
          pattern.test(source),
          false,
          `world/${file} must not contain ${pattern}`,
        );
      }
    }
    const worldState = readFileSync(join(worldDir, 'state.mjs'), 'utf8');
    assert.equal(
      /from\s+['"][^'"]*core\/state\.mjs['"]/.test(worldState),
      false,
      'world/state.mjs must not import core/state.mjs',
    );
  });
});
