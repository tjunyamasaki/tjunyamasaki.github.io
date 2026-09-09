import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advancePassive } from '../src/core/advance.mjs';
import { advanceActive, finishMeal } from '../src/core/active.mjs';
import {
  BONUS_EXTEND_MS,
  BONUS_MAX_REMAINING_MS,
  FEED_COUNTER_CAP,
  FOOD_FLIGHT_MS,
  SLIME_NAMES,
  WORLD_STEP_MS,
} from '../src/core/balance.mjs';
import { applyCommand } from '../src/core/commands.mjs';
import { getBerryIntervalMs } from '../src/core/selectors.mjs';
import { cloneState, createInitialState, createWorld } from '../src/core/state.mjs';
import {
  createFreshEnvelope,
  serializeEnvelope,
  validateSave,
} from '../src/core/validate.mjs';
import {
  createMemoryStorage,
  loadBest,
  writeCheckpoint,
} from '../src/persistence/save-store.mjs';
import { isInEatingRange } from '../src/world/food.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');
const worldDir = join(here, '../src/world');

const LEGAL_TARGET = Object.freeze({ x: 1.1, z: 2 });
const HOUR_MS = 3_600_000;
const NOW_WALL_MS = 1_700_000_000_000;

/**
 * @param {number} count
 */
function makeSlimes(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `slime-${index + 1}`,
    name: SLIME_NAMES[index],
    createdAtMs: 0,
    boostUntilMs: 0,
    feedCount: 0,
    homeSlot: index,
  }));
}

/**
 * @param {number} [count]
 */
function makeColony(count = 1) {
  const state = cloneState(createInitialState());
  if (count !== 1) {
    state.slimes = makeSlimes(count);
    state.world = createWorld(state.slimes);
  }
  return state;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}

/**
 * @param {import('../src/core/commands.mjs').CommandResult} result
 */
function assertOk(result) {
  assert.equal(result.ok, true, result.reason);
  return result;
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {{ x: number, z: number }} [target]
 */
function throwFood(state, target = LEGAL_TARGET) {
  return applyCommand(state, { type: 'THROW_FOOD', target: { x: target.x, z: target.z } });
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {number} elapsedMs
 */
function advanceChunks(state, elapsedMs) {
  let current = state;
  /** @type {object[]} */
  const events = [];
  let remaining = elapsedMs;
  let mealsCompleted = 0;
  while (remaining > 0) {
    const slice = Math.min(WORLD_STEP_MS, remaining);
    const result = advanceActive(current, slice);
    current = result.state;
    events.push(...result.events);
    mealsCompleted += result.summary.mealsCompleted;
    remaining -= slice;
  }
  return { state: current, events, mealsCompleted };
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 */
function economicFields(state) {
  return {
    simTimeMs: state.simTimeMs,
    glowMicro: state.glowMicro,
    lifetimeGlowMicro: state.lifetimeGlowMicro,
    incomeRemainder: state.incomeRemainder,
    berries: state.berries,
    nextBerryAtMs: state.nextBerryAtMs,
    totalFeeds: state.totalFeeds,
    feedCount: state.slimes[0].feedCount,
    boostUntilMs: state.slimes[0].boostUntilMs,
    foodCount: state.world.foods.length,
    timeMs: state.world.timeMs,
    carryMs: state.world.carryMs,
    tutorial: [...state.tutorialCompleted].sort(),
  };
}

/**
 * @param {object} [options]
 */
function makeDueEatingState(options = {}) {
  const slimeCount = options.slimeCount ?? 1;
  const state = makeColony(slimeCount);
  const simTimeMs = options.simTimeMs ?? 0;
  const worldTimeMs = options.worldTimeMs ?? 1400;
  state.simTimeMs = simTimeMs;
  state.world.timeMs = worldTimeMs;
  state.world.carryMs = options.carryMs ?? 0;
  if (options.boostUntilMs != null) {
    state.slimes[0].boostUntilMs = options.boostUntilMs;
  }
  if (options.totalFeeds != null) {
    state.totalFeeds = options.totalFeeds;
    state.slimes[0].feedCount = options.feedCount ?? options.totalFeeds;
  }
  if (options.lifetimeGlowMicro != null) {
    state.lifetimeGlowMicro = options.lifetimeGlowMicro;
    state.glowMicro = options.glowMicro ?? options.lifetimeGlowMicro;
  }
  if (Array.isArray(options.tutorialCompleted)) {
    state.tutorialCompleted = [...options.tutorialCompleted];
  }

  /** @type {object[]} */
  const meals = options.meals ?? [
    {
      foodId: 'food-1',
      slimeId: 'slime-1',
      target: LEGAL_TARGET,
      eatUntilWorldMs: options.eatUntilWorldMs ?? worldTimeMs,
    },
  ];
  state.world.foods = meals.map((meal) => ({
    id: meal.foodId,
    target: { x: meal.target.x, z: meal.target.z },
    createdWorldMs: 0,
    landAtWorldMs: FOOD_FLIGHT_MS,
    stage: /** @type {const} */ ('eating'),
    claimedBy: meal.slimeId,
    eatUntilWorldMs: meal.eatUntilWorldMs ?? worldTimeMs,
  }));
  const maxN = meals.reduce((max, meal) => {
    const n = Number(String(meal.foodId).slice('food-'.length));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  state.world.nextFoodSequence = Math.max(maxN + 1, 2);

  for (const meal of meals) {
    const resident = state.world.residents.find((entry) => entry.id === meal.slimeId);
    assert.ok(resident, meal.slimeId);
    resident.activity = 'eating';
    resident.targetFoodId = meal.foodId;
    resident.route = null;
    if (meal.position) {
      resident.position = { x: meal.position.x, z: meal.position.z };
    }
  }
  return state;
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 */
function roundTripValidate(state) {
  const envelope = createFreshEnvelope({
    state,
    nowWallMs: NOW_WALL_MS,
    revision: 1,
  });
  const text = serializeEnvelope(envelope);
  const parsed = validateSave(text);
  assert.equal(parsed.ok, true, parsed.ok === false ? parsed.reason : '');
  assert.equal(parsed.kind, 'current');
  return parsed.save.state;
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 */
function roundTripMemory(state) {
  const storage = createMemoryStorage();
  const envelope = createFreshEnvelope({
    state,
    nowWallMs: NOW_WALL_MS,
    revision: 0,
  });
  const written = writeCheckpoint(storage, envelope);
  assert.equal(written.saved, true, String(written.error));
  const loaded = loadBest(storage);
  assert.equal(loaded.ok, true, loaded.ok === false ? loaded.reason : '');
  return loaded.save.state;
}

describe('near throw at zero', () => {
  test('throw → 599 flying → 600 eating → 1399 unpaid → 1400 FED once → 2600 wallet', () => {
    const input = deepFreeze(createInitialState());
    assert.equal(isInEatingRange(input.world.residents[0].position, LEGAL_TARGET), true);
    const thrown = assertOk(throwFood(input));
    assert.equal(thrown.state.berries, 5);
    assert.equal(thrown.state.totalFeeds, 0);
    assert.equal(thrown.state.slimes[0].boostUntilMs, 0);
    assert.equal(thrown.state.world.foods[0].id, 'food-1');
    assert.equal(thrown.state.world.foods[0].stage, 'flying');
    assert.equal(thrown.state.world.foods[0].landAtWorldMs, 600);
    assert.equal(thrown.state.world.foods[0].createdWorldMs, 0);
    assert.deepEqual(thrown.state.world.foods[0].target, { x: 1.1, z: 2 });
    assert.deepEqual(thrown.events[0], {
      type: 'FOOD_THROWN',
      foodId: 'food-1',
      target: { x: 1.1, z: 2 },
      atMs: 0,
    });

    const at599 = advanceActive(thrown.state, 599);
    assert.equal(at599.summary.mealsCompleted, 0);
    assert.equal(at599.state.world.timeMs, 550);
    assert.equal(at599.state.world.carryMs, 49);
    assert.equal(at599.state.world.foods[0].stage, 'flying');
    assert.equal(
      at599.events.some((event) => event.type === 'FED' || event.type === 'EATING_STARTED'),
      false,
    );

    const at600 = advanceActive(thrown.state, 600);
    assert.equal(at600.summary.mealsCompleted, 0);
    assert.equal(at600.state.world.timeMs, 600);
    assert.equal(at600.state.world.foods[0].stage, 'eating');
    assert.equal(at600.state.world.foods[0].eatUntilWorldMs, 1400);
    assert.equal(at600.state.world.residents[0].activity, 'eating');
    assert.equal(at600.state.world.residents[0].route, null);
    assert.equal(at600.state.totalFeeds, 0);
    assert.equal(at600.state.slimes[0].boostUntilMs, 0);
    assert.equal(at600.state.world.foods.length, 1);
    assert.equal(
      at600.events.some((event) => event.type === 'EATING_STARTED' && event.atMs === 600),
      true,
    );
    assert.equal(
      at600.events.some((event) => event.type === 'FED'),
      false,
    );

    const at1399 = advanceActive(thrown.state, 1399);
    assert.equal(at1399.summary.mealsCompleted, 0);
    assert.equal(at1399.state.totalFeeds, 0);
    assert.equal(at1399.state.world.foods.length, 1);
    assert.equal(
      at1399.events.some((event) => event.type === 'FED'),
      false,
    );

    const at1400 = advanceActive(thrown.state, 1400);
    assert.equal(at1400.summary.mealsCompleted, 1);
    assert.equal(at1400.state.totalFeeds, 1);
    assert.equal(at1400.state.slimes[0].feedCount, 1);
    assert.equal(at1400.state.world.foods.length, 0);
    assert.equal(at1400.state.slimes[0].boostUntilMs, 121_400);
    assert.equal(at1400.state.glowMicro, 140_000);
    assert.equal(at1400.state.lifetimeGlowMicro, 140_000);
    assert.equal(at1400.state.berries, 5);
    assert.equal(at1400.state.nextBerryAtMs, 15_000);
    assert.equal(at1400.state.tutorialCompleted.includes('feed'), true);
    const fed = at1400.events.filter((event) => event.type === 'FED');
    assert.equal(fed.length, 1);
    assert.deepEqual(fed[0], {
      type: 'FED',
      foodId: 'food-1',
      slimeId: 'slime-1',
      atMs: 1400,
      boostUntilMs: 121_400,
    });
    const feedTutorial = at1400.events.filter(
      (event) => event.type === 'TUTORIAL_COMPLETED' && event.step === 'feed',
    );
    assert.equal(feedTutorial.length, 1);
    assert.equal(feedTutorial[0].atMs, 1400);

    const at2600 = advanceActive(at1400.state, 1200);
    assert.equal(at2600.state.simTimeMs, 2600);
    assert.equal(at2600.state.glowMicro, 380_000);
    assert.equal(at2600.state.lifetimeGlowMicro, 380_000);
    assert.equal(at2600.summary.mealsCompleted, 0);
    assert.equal(at2600.state.totalFeeds, 1);
    assert.equal(at2600.state.berries, 5);
  });

  test('chunk partitions match combined advanceActive economic fields', () => {
    const thrown = assertOk(throwFood(createInitialState())).state;
    const combined1400 = advanceActive(thrown, 1400).state;
    const chunked1400 = advanceChunks(thrown, 1400).state;
    assert.deepEqual(economicFields(combined1400), economicFields(chunked1400));

    const combined2600 = advanceActive(combined1400, 1200).state;
    const chunked2600 = advanceChunks(chunked1400, 1200).state;
    assert.deepEqual(economicFields(combined2600), economicFields(chunked2600));

    const parts = [599, 1, 799, 1, 1200];
    let sequential = thrown;
    for (const part of parts) {
      sequential = advanceActive(sequential, part).state;
    }
    const combined = advanceActive(thrown, 2600).state;
    assert.deepEqual(economicFields(sequential), economicFields(combined));
    assert.equal(combined.glowMicro, 380_000);
    assert.equal(combined.totalFeeds, 1);
  });
});

describe('constructed boost formula', () => {
  test('meals at sim 0 / 4000 / 8000 expire at 120000 / 240000 / 308000', () => {
    const first = finishMeal(deepFreeze(makeDueEatingState({ simTimeMs: 0 })), {
      foodId: 'food-1',
      slimeId: 'slime-1',
    });
    assert.equal(first.rewarded, true);
    assert.equal(first.state.slimes[0].boostUntilMs, 120_000);
    assert.equal(first.state.slimes[0].boostUntilMs, BONUS_EXTEND_MS);

    const second = finishMeal(
      makeDueEatingState({
        simTimeMs: 4000,
        boostUntilMs: first.state.slimes[0].boostUntilMs,
        totalFeeds: first.state.totalFeeds,
      }),
      { foodId: 'food-1', slimeId: 'slime-1' },
    );
    assert.equal(second.rewarded, true);
    assert.equal(second.state.slimes[0].boostUntilMs, 240_000);

    const third = finishMeal(
      makeDueEatingState({
        simTimeMs: 8000,
        boostUntilMs: second.state.slimes[0].boostUntilMs,
        totalFeeds: second.state.totalFeeds,
      }),
      { foodId: 'food-1', slimeId: 'slime-1' },
    );
    assert.equal(third.rewarded, true);
    assert.equal(third.state.slimes[0].boostUntilMs, 308_000);
    assert.equal(third.state.slimes[0].boostUntilMs, 8000 + BONUS_MAX_REMAINING_MS);
  });

  test('deleting food before finishMeal does not grant FED', () => {
    const state = makeDueEatingState({ simTimeMs: 0 });
    state.world.foods = [];
    const result = finishMeal(deepFreeze(state), { foodId: 'food-1', slimeId: 'slime-1' });
    assert.equal(result.rewarded, false);
    assert.equal(result.state.totalFeeds, 0);
    assert.equal(result.state.slimes[0].boostUntilMs, 0);
    assert.equal(
      result.events.some((event) => event.type === 'FED'),
      false,
    );
  });
});

describe('duplicate / two meals / companions', () => {
  test('same foodId cannot reward twice', () => {
    const state = makeDueEatingState({ simTimeMs: 0 });
    const first = finishMeal(deepFreeze(state), { foodId: 'food-1', slimeId: 'slime-1' });
    assert.equal(first.rewarded, true);
    assert.equal(first.state.totalFeeds, 1);
    const second = finishMeal(first.state, { foodId: 'food-1', slimeId: 'slime-1' });
    assert.equal(second.rewarded, false);
    assert.equal(second.state.totalFeeds, 1);
    assert.equal(second.state.slimes[0].boostUntilMs, first.state.slimes[0].boostUntilMs);
    assert.equal(
      second.events.some((event) => event.type === 'FED'),
      false,
    );
  });

  test('two completions in one tick: distinct food-n order, each once', () => {
    const state = makeDueEatingState({
      slimeCount: 2,
      simTimeMs: 1350,
      worldTimeMs: 1350,
      meals: [
        {
          foodId: 'food-2',
          slimeId: 'slime-2',
          target: { x: -4.1, z: 2 },
          eatUntilWorldMs: 1400,
        },
        {
          foodId: 'food-1',
          slimeId: 'slime-1',
          target: { x: 1.1, z: 2 },
          eatUntilWorldMs: 1400,
        },
      ],
    });
    assert.equal(isInEatingRange(state.world.residents[0].position, { x: 1.1, z: 2 }), true);
    assert.equal(isInEatingRange(state.world.residents[1].position, { x: -4.1, z: 2 }), true);
    const input = deepFreeze(state);
    const snapshot = structuredClone(input);
    const result = advanceActive(input, 50);
    assert.deepEqual(input, snapshot);
    assert.equal(result.summary.mealsCompleted, 2);
    assert.equal(result.state.world.foods.length, 0);
    assert.equal(result.state.totalFeeds, 2);
    const fed = result.events.filter((event) => event.type === 'FED');
    assert.equal(fed.length, 2);
    assert.equal(fed[0].foodId, 'food-1');
    assert.equal(fed[0].slimeId, 'slime-1');
    assert.equal(fed[1].foodId, 'food-2');
    assert.equal(fed[1].slimeId, 'slime-2');
    assert.equal(fed[0].atMs, 1400);
    assert.equal(fed[1].atMs, 1400);
    assert.equal(result.state.slimes[0].feedCount, 1);
    assert.equal(result.state.slimes[1].feedCount, 1);
    assert.equal(result.state.world.residents[0].activity, 'idle');
    assert.equal(result.state.world.residents[0].restUntilWorldMs, 1400 + 1500);
    assert.equal(result.state.world.residents[1].restUntilWorldMs, 1400 + 1500);
  });

  test('a meal can join a companion in the same transition', () => {
    const state = makeDueEatingState({
      simTimeMs: 0,
      totalFeeds: 5,
      lifetimeGlowMicro: 12_000_000,
    });
    const result = finishMeal(deepFreeze(state), { foodId: 'food-1', slimeId: 'slime-1' });
    assert.equal(result.rewarded, true);
    assert.equal(result.state.totalFeeds, 6);
    assert.equal(result.state.slimes.length, 2);
    const types = result.events.map((event) =>
      event.type === 'TUTORIAL_COMPLETED' ? `${event.type}:${event.step}` : event.type,
    );
    assert.deepEqual(types, [
      'FED',
      'TUTORIAL_COMPLETED:feed',
      'COMPANION_ADDED',
      'TUTORIAL_COMPLETED:welcome',
    ]);
    assert.equal(result.events[2].slimeId, 'slime-2');
  });

  test('meal companions are planned at the next world boundary', () => {
    const state = makeDueEatingState({
      simTimeMs: 1350,
      worldTimeMs: 1350,
      totalFeeds: 5,
      lifetimeGlowMicro: 12_000_000,
      tutorialCompleted: ['feed'],
      meals: [
        {
          foodId: 'food-1',
          slimeId: 'slime-1',
          target: LEGAL_TARGET,
          eatUntilWorldMs: 1400,
        },
      ],
    });
    const mealTick = advanceActive(deepFreeze(state), 50);
    assert.equal(mealTick.summary.mealsCompleted, 1);
    assert.equal(mealTick.state.slimes.length, 2);
    const joined = mealTick.state.world.residents.find((resident) => resident.id === 'slime-2');
    assert.ok(joined);
    assert.equal(joined.activity, 'idle');
    assert.equal(joined.route, null);
    const acrossBoundary = advanceActive(deepFreeze(state), 100);
    const arriving = acrossBoundary.state.world.residents.find(
      (resident) => resident.id === 'slime-2',
    );
    assert.equal(arriving.activity, 'arriving');
    assert.ok(arriving.route);
  });

  test('FEED_COUNTER_CAP still grants boost but does not increment counters', () => {
    const state = makeDueEatingState({
      simTimeMs: 0,
      totalFeeds: FEED_COUNTER_CAP,
      feedCount: FEED_COUNTER_CAP,
    });
    const result = finishMeal(state, { foodId: 'food-1', slimeId: 'slime-1' });
    assert.equal(result.rewarded, true);
    assert.equal(result.state.totalFeeds, FEED_COUNTER_CAP);
    assert.equal(result.state.slimes[0].feedCount, FEED_COUNTER_CAP);
    assert.equal(result.state.slimes[0].boostUntilMs, 120_000);
  });
});

describe('advanceActive zero elapsed and pause flags', () => {
  test('advanceActive(s, 0) does not land, start eating, or complete a due meal', () => {
    const thrown = assertOk(throwFood(createInitialState())).state;
    const flying = advanceActive(deepFreeze(thrown), 0);
    assert.equal(flying.state.world.foods[0].stage, 'flying');
    assert.equal(flying.summary.mealsCompleted, 0);

    const due = makeDueEatingState({ simTimeMs: 1400, worldTimeMs: 1400 });
    const result = advanceActive(deepFreeze(due), 0);
    assert.equal(result.summary.mealsCompleted, 0);
    assert.equal(result.state.world.foods.length, 1);
    assert.equal(result.state.world.foods[0].stage, 'eating');
    assert.equal(result.state.totalFeeds, 0);
    assert.equal(
      result.events.some((event) => event.type === 'FED' || event.type === 'EATING_STARTED'),
      false,
    );
  });

  test('same advanceActive input twice yields the same completion timestamps', () => {
    const thrown = assertOk(throwFood(createInitialState())).state;
    const a = advanceActive(deepFreeze(cloneState(thrown)), 1400);
    const b = advanceActive(deepFreeze(cloneState(thrown)), 1400);
    assert.deepEqual(economicFields(a.state), economicFields(b.state));
    const fedA = a.events.filter((event) => event.type === 'FED');
    const fedB = b.events.filter((event) => event.type === 'FED');
    assert.deepEqual(fedA, fedB);
    assert.equal(fedA[0].atMs, 1400);
  });
});

describe('hidden / passive freeze', () => {
  test('hidden hour mid-flight: economy advances, food timer frozen, remaining active completes once', () => {
    const thrown = assertOk(throwFood(createInitialState())).state;
    const away = advancePassive(thrown, HOUR_MS);
    assert.equal(away.state.world.timeMs, 0);
    assert.equal(away.state.world.carryMs, 0);
    assert.equal(away.state.world.foods[0].stage, 'flying');
    assert.equal(away.state.world.foods[0].landAtWorldMs, 600);
    assert.ok(away.state.glowMicro > 0);
    assert.equal(away.state.totalFeeds, 0);
    assert.equal(away.summary.mealsCompleted, 0);

    const remaining = advanceActive(away.state, 1400);
    assert.equal(remaining.summary.mealsCompleted, 1);
    assert.equal(remaining.state.totalFeeds, 1);
    assert.equal(remaining.state.world.foods.length, 0);
    const fed = remaining.events.filter((event) => event.type === 'FED');
    assert.equal(fed.length, 1);
    const again = advanceActive(remaining.state, 50);
    assert.equal(again.summary.mealsCompleted, 0);
    assert.equal(
      again.events.some((event) => event.type === 'FED'),
      false,
    );
  });

  test('hidden hour mid-eat: remaining world delay unchanged, then meal pays once', () => {
    const thrown = assertOk(throwFood(createInitialState())).state;
    const eating = advanceActive(thrown, 600);
    assert.equal(eating.state.world.foods[0].eatUntilWorldMs, 1400);
    const away = advancePassive(eating.state, HOUR_MS);
    assert.equal(away.state.world.timeMs, 600);
    assert.equal(away.state.world.foods[0].stage, 'eating');
    assert.equal(away.state.world.foods[0].eatUntilWorldMs, 1400);
    assert.deepEqual(away.state.world.residents[0].position, eating.state.world.residents[0].position);
    assert.ok(away.state.glowMicro > eating.state.glowMicro);
    assert.equal(away.state.totalFeeds, 0);

    const rest = advanceActive(away.state, 800);
    assert.equal(rest.summary.mealsCompleted, 1);
    assert.equal(rest.state.totalFeeds, 1);
    assert.equal(rest.state.world.foods.length, 0);
    assert.equal(rest.events.filter((event) => event.type === 'FED').length, 1);
  });
});

describe('inventory vs world food', () => {
  test('eating does not charge a second berry or restart regen', () => {
    const input = cloneState(createInitialState());
    input.simTimeMs = 50_000;
    input.berries = 12;
    input.nextBerryAtMs = null;
    const thrown = assertOk(throwFood(deepFreeze(input)));
    assert.equal(thrown.state.berries, 11);
    assert.equal(thrown.state.nextBerryAtMs, 50_000 + getBerryIntervalMs(thrown.state));
    assert.equal(thrown.state.nextBerryAtMs, 65_000);
    const eaten = advanceActive(thrown.state, 1400);
    assert.equal(eaten.summary.mealsCompleted, 1);
    assert.equal(eaten.state.world.foods.length, 0);
    assert.equal(eaten.state.berries, 11);
    assert.equal(eaten.state.nextBerryAtMs, 65_000);
    assert.equal(eaten.state.totalFeeds, 1);
  });
});

describe('range, remote eat, seeker cutoff', () => {
  test('seeker already in range stops the path and starts eating the same tick', () => {
    const state = makeColony(1);
    state.world.foods = [
      {
        id: 'food-1',
        target: { x: 1.1, z: 2 },
        createdWorldMs: 0,
        landAtWorldMs: 0,
        stage: 'claimed',
        claimedBy: 'slime-1',
        eatUntilWorldMs: null,
      },
    ];
    state.world.nextFoodSequence = 2;
    const resident = state.world.residents[0];
    resident.activity = 'seekingFood';
    resident.targetFoodId = 'food-1';
    resident.route = {
      points: [
        { x: 0, z: 2 },
        { x: 8, z: 2 },
      ],
      length: 8,
      startedWorldMs: 0,
      cycleCount: 8,
      distanceAlong: 0,
    };
    assert.equal(isInEatingRange(resident.position, { x: 1.1, z: 2 }), true);
    const result = advanceActive(deepFreeze(state), 50);
    assert.equal(result.state.world.residents[0].activity, 'eating');
    assert.equal(result.state.world.residents[0].route, null);
    assert.equal(result.state.world.foods[0].stage, 'eating');
    assert.equal(result.state.world.foods[0].eatUntilWorldMs, 50 + 800);
    assert.equal(result.summary.mealsCompleted, 0);
    assert.equal(
      result.events.some((event) => event.type === 'EATING_STARTED'),
      true,
    );
    assert.equal(
      result.events.some((event) => event.type === 'FED'),
      false,
    );
  });

  test('busy arriving residents do not eat remotely', () => {
    const state = makeColony(1);
    state.world.residents[0].activity = 'arriving';
    state.world.residents[0].position = { x: 0, z: -12 };
    state.world.residents[0].route = {
      points: [
        { x: 0, z: -12 },
        { x: 0, z: 2 },
      ],
      length: 14,
      startedWorldMs: 0,
      cycleCount: 14,
      distanceAlong: 0,
    };
    const thrown = assertOk(throwFood(state, { x: 6, z: 0 }));
    const landed = advanceChunks(thrown.state, 600);
    assert.equal(landed.state.world.foods[0].claimedBy, null);
    assert.equal(landed.state.totalFeeds, 0);
    assert.equal(
      landed.events.some((event) => event.type === 'EATING_STARTED' || event.type === 'FED'),
      false,
    );
  });

  test('due eating out of range releases without a meal or deleted berry', () => {
    const state = makeDueEatingState({
      simTimeMs: 1350,
      worldTimeMs: 1350,
      meals: [
        {
          foodId: 'food-1',
          slimeId: 'slime-1',
          target: { x: 1.1, z: 2 },
          eatUntilWorldMs: 1400,
          position: { x: 6, z: -3 },
        },
      ],
    });
    assert.equal(isInEatingRange({ x: 6, z: -3 }, { x: 1.1, z: 2 }), false);
    const result = advanceActive(deepFreeze(state), 50);
    assert.equal(result.summary.mealsCompleted, 0);
    assert.equal(result.state.totalFeeds, 0);
    assert.equal(result.state.world.foods.length, 1);
    assert.notEqual(result.state.world.foods[0].stage, 'eating');
    assert.equal(
      result.events.some((event) => event.type === 'FED'),
      false,
    );
  });
});

describe('persistence round-trip', () => {
  test('flight, eating at 1399, and post-meal reload resume once', () => {
    const thrown = assertOk(throwFood(createInitialState())).state;
    const flight = roundTripValidate(thrown);
    assert.equal(flight.world.foods[0].stage, 'flying');
    assert.equal(flight.world.foods[0].landAtWorldMs, 600);
    assert.equal(flight.habitatId, 'farm-v2');
    const afterFlight = advanceActive(flight, 1400);
    assert.equal(afterFlight.summary.mealsCompleted, 1);
    assert.equal(afterFlight.state.totalFeeds, 1);

    const eating = advanceActive(thrown, 1399);
    assert.equal(eating.state.world.timeMs, 1350);
    assert.equal(eating.state.world.carryMs, 49);
    assert.equal(eating.state.world.foods[0].stage, 'eating');
    const restoredEat = roundTripMemory(eating.state);
    assert.equal(restoredEat.world.timeMs, 1350);
    assert.equal(restoredEat.world.carryMs, 49);
    assert.equal(restoredEat.world.foods[0].eatUntilWorldMs, 1400);
    const finish = advanceActive(restoredEat, 1);
    assert.equal(finish.summary.mealsCompleted, 1);
    assert.equal(finish.state.totalFeeds, 1);
    assert.equal(finish.state.world.foods.length, 0);
    const again = advanceActive(finish.state, 50);
    assert.equal(again.summary.mealsCompleted, 0);

    const fed = advanceActive(thrown, 1400);
    const restoredFed = roundTripValidate(fed.state);
    assert.equal(restoredFed.world.foods.length, 0);
    assert.equal(restoredFed.totalFeeds, 1);
    const post = advanceActive(restoredFed, 200);
    assert.equal(post.summary.mealsCompleted, 0);
    assert.equal(post.state.totalFeeds, 1);
    assert.equal(
      post.events.some((event) => event.type === 'FED'),
      false,
    );
  });

  test('claimed travel round-trip keeps the path and pays once', () => {
    const state = makeColony(1);
    state.world.residents[0].position = { x: 0, z: 2 };
    const thrown = assertOk(throwFood(state, { x: 3.2, z: 2 })).state;
    const walking = advanceActive(thrown, 600);
    assert.equal(walking.state.world.residents[0].activity, 'seekingFood');
    assert.ok(walking.state.world.residents[0].route);
    const restored = roundTripValidate(walking.state);
    assert.equal(restored.world.residents[0].activity, 'seekingFood');
    assert.equal(restored.world.residents[0].targetFoodId, 'food-1');
    assert.equal(restored.world.foods[0].claimedBy, 'slime-1');
    let current = restored;
    /** @type {object[]} */
    const events = [];
    for (let i = 0; i < 80; i += 1) {
      const step = advanceActive(current, 50);
      current = step.state;
      events.push(...step.events);
      if (step.summary.mealsCompleted > 0) break;
    }
    assert.equal(current.totalFeeds, 1);
    assert.equal(current.world.foods.length, 0);
    assert.equal(events.filter((event) => event.type === 'FED').length, 1);
    const extra = advanceActive(current, 50);
    assert.equal(extra.summary.mealsCompleted, 0);
  });
});

describe('eating module isolation', () => {
  test('eating helper and active wrapper stay free of Date, Math.random, DOM, and Three', () => {
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
    for (const file of [join(worldDir, 'eating.mjs'), join(coreDir, 'active.mjs')]) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        assert.equal(pattern.test(source), false, `${file} ${pattern}`);
      }
    }
  });
});
