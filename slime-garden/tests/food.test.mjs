import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advancePassive } from '../src/core/advance.mjs';
import { advanceActive } from '../src/core/active.mjs';
import {
  FOOD_FLIGHT_MS,
  MAX_FOOD,
  SLIME_NAMES,
  THROW_COOLDOWN_MS,
  WORLD_STEP_MS,
} from '../src/core/balance.mjs';
import { applyCommand } from '../src/core/commands.mjs';
import {
  getBerryIntervalMs,
  isValidFoodTarget,
  resolveNearSelectedTarget,
} from '../src/core/selectors.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';
import { CLAIM_RELEASE_MS, isInEatingRange } from '../src/world/food.mjs';
import { createWorld } from '../src/world/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');
const worldDir = join(here, '../src/world');

const LEGAL_TARGET = Object.freeze({ x: 1.1, z: 2 });
const THROW_LEGAL = Object.freeze({ type: 'THROW_FOOD', target: LEGAL_TARGET });

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
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {number} simTimeMs
 */
function atTime(state, simTimeMs) {
  const next = cloneState(state);
  next.simTimeMs = simTimeMs;
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

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {{ x: number, z: number }} target
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
  while (remaining > 0) {
    const slice = Math.min(WORLD_STEP_MS, remaining);
    const result = advanceActive(current, slice);
    current = result.state;
    events.push(...result.events);
    remaining -= slice;
  }
  return { state: current, events };
}

/**
 * @param {number} n
 * @param {{ x: number, z: number }} [target]
 */
function makeFoodRecord(n, target = LEGAL_TARGET) {
  return {
    id: `food-${n}`,
    target: { x: target.x, z: target.z },
    createdWorldMs: 0,
    landAtWorldMs: FOOD_FLIGHT_MS,
    stage: /** @type {const} */ ('flying'),
    claimedBy: null,
    eatUntilWorldMs: null,
  };
}

/**
 * @param {import('../src/world/state.mjs').WorldState} world
 */
function assertReciprocalClaims(world) {
  /** @type {Map<string, import('../src/world/state.mjs').WorldResident>} */
  const byId = new Map();
  for (const resident of world.residents) {
    byId.set(resident.id, resident);
  }
  for (const food of world.foods) {
    if (food.claimedBy == null) continue;
    const resident = byId.get(food.claimedBy);
    assert.ok(resident, `${food.id} claimant ${food.claimedBy} missing`);
    assert.equal(resident.targetFoodId, food.id);
  }
  for (const resident of world.residents) {
    if (resident.targetFoodId == null) continue;
    const food = world.foods.find((entry) => entry.id === resident.targetFoodId);
    assert.ok(food, `${resident.id} target ${resident.targetFoodId} missing`);
    assert.equal(food.claimedBy, resident.id);
  }
  const claimedFoods = world.foods.filter((food) => food.claimedBy != null);
  const claimedResidents = world.residents.filter((resident) => resident.targetFoodId != null);
  assert.equal(claimedFoods.length, claimedResidents.length);
  const holders = claimedFoods.map((food) => food.claimedBy);
  assert.equal(new Set(holders).size, holders.length);
}

describe('THROW_FOOD', () => {
  test('legal (1.1, 2) from fresh: berry 6→5, flying food-1, landAt 600, no feed/boost', () => {
    const input = deepFreeze(createInitialState());
    const snapshot = structuredClone(input);
    const target = { x: 1.1, z: 2 };
    const result = assertOk(applyCommand(input, { type: 'THROW_FOOD', target }));
    assert.equal(result.state.berries, 5);
    assert.equal(result.state.world.foods.length, 1);
    const food = result.state.world.foods[0];
    assert.equal(food.id, 'food-1');
    assert.equal(food.stage, 'flying');
    assert.equal(food.claimedBy, null);
    assert.equal(food.eatUntilWorldMs, null);
    assert.equal(food.createdWorldMs, 0);
    assert.equal(food.landAtWorldMs, 600);
    assert.deepEqual(food.target, { x: 1.1, z: 2 });
    assert.notEqual(food.target, target);
    assert.equal(result.state.world.nextFoodSequence, 2);
    assert.equal(result.state.totalFeeds, 0);
    assert.equal(result.state.slimes[0].feedCount, 0);
    assert.equal(result.state.slimes[0].boostUntilMs, 0);
    assert.equal(result.state.nextThrowAllowedAtMs, THROW_COOLDOWN_MS);
    assert.equal(result.state.nextFeedAllowedAtMs, THROW_COOLDOWN_MS);
    assert.deepEqual(result.events[0], {
      type: 'FOOD_THROWN',
      foodId: 'food-1',
      target: { x: 1.1, z: 2 },
      atMs: 0,
    });
    assert.equal(
      result.events.some((event) => event.type === 'FED'),
      false,
    );
    assert.deepEqual(input, snapshot);
    assert.equal(target.x, 1.1);
    assert.equal(target.z, 2);
  });

  test('reject order: shape, then NaN/outside/prop/gate, then cap, berries, cooldown, id', () => {
    const fresh = deepFreeze(createInitialState());
    const berries = fresh.berries;
    const sequence = fresh.world.nextFoodSequence;
    const cooldown = fresh.nextThrowAllowedAtMs;

    const missing = applyCommand(fresh, { type: 'THROW_FOOD' });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'INVALID_COMMAND');
    assert.equal(missing.state, fresh);

    const notObject = applyCommand(fresh, { type: 'THROW_FOOD', target: null });
    assert.equal(notObject.reason, 'INVALID_COMMAND');

    const nan = applyCommand(fresh, {
      type: 'THROW_FOOD',
      target: { x: Number.NaN, z: 2 },
    });
    assert.equal(nan.ok, false);
    assert.equal(nan.reason, 'INVALID_TARGET');
    assert.equal(nan.state, fresh);

    const outside = applyCommand(fresh, {
      type: 'THROW_FOOD',
      target: { x: 40, z: 40 },
    });
    assert.equal(outside.reason, 'INVALID_TARGET');
    assert.equal(isValidFoodTarget({ x: 40, z: 40 }), false);

    const prop = applyCommand(fresh, {
      type: 'THROW_FOOD',
      target: { x: -10.5, z: -5.5 },
    });
    assert.equal(prop.reason, 'INVALID_TARGET');

    const gate = applyCommand(fresh, {
      type: 'THROW_FOOD',
      target: { x: 0, z: -7.5 },
    });
    assert.equal(gate.reason, 'INVALID_TARGET');

    for (const result of [nan, outside, prop, gate]) {
      assert.equal(result.state, fresh);
      assert.equal(result.state.berries, berries);
      assert.equal(result.state.world.nextFoodSequence, sequence);
      assert.equal(result.state.nextThrowAllowedAtMs, cooldown);
      assert.deepEqual(result.events, []);
    }

    const capped = cloneState(createInitialState());
    for (let n = 1; n <= MAX_FOOD; n += 1) {
      capped.world.foods.push(makeFoodRecord(n));
    }
    capped.world.nextFoodSequence = 13;
    capped.berries = 0;
    capped.nextThrowAllowedAtMs = 50_000;
    capped.simTimeMs = 0;
    const limit = applyCommand(deepFreeze(capped), THROW_LEGAL);
    assert.equal(limit.ok, false);
    assert.equal(limit.reason, 'FOOD_LIMIT');
    assert.equal(limit.state.berries, 0);
    assert.equal(limit.state.world.foods.length, 12);
    assert.equal(limit.state.world.nextFoodSequence, 13);

    const empty = cloneState(createInitialState());
    empty.berries = 0;
    empty.nextBerryAtMs = 15_000;
    const noBerries = applyCommand(deepFreeze(empty), THROW_LEGAL);
    assert.equal(noBerries.reason, 'NO_BERRIES');
    assert.equal(noBerries.state.berries, 0);
    assert.equal(noBerries.state.world.foods.length, 0);
    assert.equal(noBerries.state.world.nextFoodSequence, 1);

    const cooling = assertOk(throwFood(createInitialState()));
    const early = applyCommand(deepFreeze(atTime(cooling.state, 999)), THROW_LEGAL);
    assert.equal(early.reason, 'THROW_COOLDOWN');
    assert.equal(early.state.berries, 5);
    assert.equal(early.state.world.foods.length, 1);
    assert.equal(early.state.world.nextFoodSequence, 2);

    const overflow = cloneState(createInitialState());
    overflow.world.nextFoodSequence = Number.MAX_SAFE_INTEGER;
    const idLimit = applyCommand(deepFreeze(overflow), THROW_LEGAL);
    assert.equal(idLimit.reason, 'ID_LIMIT');
    assert.equal(idLimit.state.berries, 6);
    assert.equal(idLimit.state.world.foods.length, 0);
    assert.equal(idLimit.state.world.nextFoodSequence, Number.MAX_SAFE_INTEGER);
  });

  test('13th food is FOOD_LIMIT before spend; 12 existing stay', () => {
    const state = cloneState(createInitialState());
    state.berries = 12;
    for (let n = 1; n <= 12; n += 1) {
      state.world.foods.push(makeFoodRecord(n, { x: 1.1 + n * 0.01, z: 2 }));
    }
    state.world.nextFoodSequence = 13;
    const frozen = deepFreeze(state);
    const result = applyCommand(frozen, THROW_LEGAL);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'FOOD_LIMIT');
    assert.equal(result.state, frozen);
    assert.equal(result.state.berries, 12);
    assert.equal(result.state.world.foods.length, 12);
    assert.equal(result.state.world.nextFoodSequence, 13);
    assert.equal(result.state.nextThrowAllowedAtMs, 0);
  });

  test('cooldown: success at 0; 999 is THROW_COOLDOWN; 1000 succeeds', () => {
    const first = assertOk(throwFood(deepFreeze(createInitialState())));
    assert.equal(first.state.nextThrowAllowedAtMs, 1000);
    const early = applyCommand(deepFreeze(atTime(first.state, 999)), THROW_LEGAL);
    assert.equal(early.ok, false);
    assert.equal(early.reason, 'THROW_COOLDOWN');
    assert.equal(early.state.world.foods.length, 1);
    const ready = assertOk(throwFood(atTime(first.state, 1000)));
    assert.equal(ready.state.berries, 4);
    assert.equal(ready.state.world.foods.length, 2);
    assert.equal(ready.state.world.foods[1].id, 'food-2');
    assert.equal(ready.state.nextThrowAllowedAtMs, 2000);
    assert.equal(ready.state.totalFeeds, 0);
  });

  test('full basket throw starts regen at t + interval', () => {
    const input = cloneState(createInitialState());
    input.simTimeMs = 50_000;
    input.berries = 12;
    input.nextBerryAtMs = null;
    const result = assertOk(throwFood(deepFreeze(input)));
    assert.equal(result.state.berries, 11);
    assert.equal(result.state.nextBerryAtMs, 50_000 + getBerryIntervalMs(result.state));
    assert.equal(result.state.nextBerryAtMs, 65_000);
    assert.equal(result.state.world.foods.length, 1);
    assert.equal(result.state.totalFeeds, 0);
    assert.equal(result.state.slimes[0].boostUntilMs, 0);
  });

  test('FEED and CONSUME_FOOD are INVALID_COMMAND and do not feed', () => {
    const input = deepFreeze(createInitialState());
    const snapshot = structuredClone(input);
    const result = applyCommand(input, { type: 'FEED', slimeId: 'slime-1' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'INVALID_COMMAND');
    assert.equal(result.state, input);
    assert.deepEqual(result.events, []);
    const consume = applyCommand(input, { type: 'CONSUME_FOOD', foodId: 'food-1' });
    assert.equal(consume.ok, false);
    assert.equal(consume.reason, 'INVALID_COMMAND');
    assert.equal(consume.state, input);
    assert.equal(input.berries, 6);
    assert.equal(input.totalFeeds, 0);
    assert.equal(input.slimes[0].boostUntilMs, 0);
    assert.equal(input.world.foods.length, 0);
    assert.deepEqual(input, snapshot);
  });
});

describe('resolveNearSelectedTarget', () => {
  test('returns a legal point or null without spending berries or allocating food', () => {
    const state = createInitialState();
    const berries = state.berries;
    const point = resolveNearSelectedTarget(state, 'slime-1');
    assert.ok(point);
    assert.equal(isValidFoodTarget(point), true);
    assert.equal(state.berries, berries);
    assert.equal(state.world.foods.length, 0);
    assert.equal(state.world.nextFoodSequence, 1);
    assert.equal(resolveNearSelectedTarget(state, 'slime-99'), null);
    assert.equal(state.berries, berries);
    const thrown = assertOk(throwFood(state, point));
    assert.deepEqual(thrown.state.world.foods[0].target, point);
  });
});

describe('food landing', () => {
  test('lands on the first 50 ms step with timeMs >= landAt; 599 still flying; no meal', () => {
    const thrown = assertOk(throwFood(createInitialState()));
    assert.equal(thrown.state.world.foods[0].stage, 'flying');

    const at599 = advanceChunks(thrown.state, 599);
    assert.equal(at599.state.world.timeMs, 550);
    assert.equal(at599.state.world.carryMs, 49);
    assert.equal(at599.state.world.foods[0].stage, 'flying');
    assert.equal(
      at599.events.some((event) => event.type === 'FOOD_LANDED'),
      false,
    );
    assert.equal(
      at599.events.some((event) => event.type === 'FED' || event.type === 'EATING_STARTED'),
      false,
    );

    const at600 = advanceChunks(thrown.state, 600);
    assert.equal(at600.state.world.timeMs, 600);
    assert.equal(at600.state.world.foods[0].stage, 'eating');
    assert.equal(at600.state.world.foods[0].eatUntilWorldMs, 1400);
    assert.equal(
      at600.events.some((event) => event.type === 'FOOD_LANDED' && event.foodId === 'food-1'),
      true,
    );
    assert.equal(
      at600.events.some(
        (event) =>
          event.type === 'EATING_STARTED' &&
          event.foodId === 'food-1' &&
          event.slimeId === 'slime-1',
      ),
      true,
    );
    assert.equal(
      at600.events.some((event) => event.type === 'FED'),
      false,
    );
    assert.equal(at600.state.totalFeeds, 0);
    assert.equal(at600.state.slimes[0].boostUntilMs, 0);
    assert.equal(at600.state.world.foods.length, 1);

    const landedEvent = at600.events.find((event) => event.type === 'FOOD_LANDED');
    assert.equal(landedEvent.atMs, at600.state.simTimeMs);
  });

  test('advancePassive does not land; hidden/away freezes remaining flight', () => {
    const thrown = assertOk(throwFood(createInitialState()));
    const away = advancePassive(thrown.state, 600);
    assert.equal(away.state.world.timeMs, 0);
    assert.equal(away.state.world.carryMs, 0);
    assert.equal(away.state.world.foods[0].stage, 'flying');
    assert.equal(away.state.world.foods[0].landAtWorldMs, 600);
    assert.equal(
      away.events.some((event) => event.type === 'FOOD_LANDED'),
      false,
    );
  });
});

describe('food claims', () => {
  test('in-range throw: t=600 lands, claims, and starts eating; FED only at 1400', () => {
    const thrown = assertOk(throwFood(createInitialState()));
    const slime = thrown.state.world.residents[0];
    assert.equal(isInEatingRange(slime.position, LEGAL_TARGET), true);
    const landed = advanceChunks(thrown.state, 600);
    const food = landed.state.world.foods[0];
    const resident = landed.state.world.residents[0];
    assert.equal(food.claimedBy, 'slime-1');
    assert.equal(food.stage, 'eating');
    assert.equal(food.eatUntilWorldMs, 1400);
    assert.equal(resident.targetFoodId, 'food-1');
    assert.equal(resident.activity, 'eating');
    assert.equal(resident.route, null);
    assert.equal(
      landed.events.some((event) => event.type === 'FOOD_CLAIMED' && event.slimeId === 'slime-1'),
      true,
    );
    assert.equal(
      landed.events.some(
        (event) => event.type === 'EATING_STARTED' && event.slimeId === 'slime-1',
      ),
      true,
    );
    assert.equal(
      landed.events.some((event) => event.type === 'FED'),
      false,
    );
    assert.equal(landed.state.totalFeeds, 0);
    assert.equal(landed.state.slimes[0].boostUntilMs, 0);
    assert.equal(landed.state.slimes[0].feedCount, 0);
    assertReciprocalClaims(landed.state.world);

    const at1399 = advanceChunks(thrown.state, 1399);
    assert.equal(at1399.state.totalFeeds, 0);
    assert.equal(at1399.state.world.foods.length, 1);
    assert.equal(
      at1399.events.some((event) => event.type === 'FED'),
      false,
    );

    const at1400 = advanceChunks(thrown.state, 1400);
    assert.equal(at1400.state.totalFeeds, 1);
    assert.equal(at1400.state.slimes[0].feedCount, 1);
    assert.equal(at1400.state.slimes[0].boostUntilMs, 121_400);
    assert.equal(at1400.state.world.foods.length, 0);
    const fed = at1400.events.filter((event) => event.type === 'FED');
    assert.equal(fed.length, 1);
    assert.equal(fed[0].foodId, 'food-1');
    assert.equal(fed[0].slimeId, 'slime-1');
    assert.equal(fed[0].atMs, 1400);
    assert.equal(fed[0].boostUntilMs, 121_400);
  });

  test('two residents, one berry: one claim only; numeric-id tie-break is stable', () => {
    const state = makeColony(2);
    const thrown = assertOk(throwFood(state, { x: -1.5, z: 2 }));
    const landed = advanceChunks(thrown.state, 600);
    const claimed = landed.state.world.foods.filter((food) => food.claimedBy != null);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].claimedBy, 'slime-1');
    const holders = landed.state.world.residents.filter((resident) => resident.targetFoodId != null);
    assert.equal(holders.length, 1);
    assert.equal(holders[0].id, 'slime-1');
    assertReciprocalClaims(landed.state.world);
    assert.equal(landed.state.totalFeeds, 0);
    assert.equal(
      landed.events.some((event) => event.type === 'FED'),
      false,
    );
  });

  test('two berries, two free residents: distinct claims; nobody holds both', () => {
    const first = assertOk(throwFood(makeColony(2), { x: 1.1, z: 2 }));
    const afterCooldown = atTime(first.state, 1000);
    const second = assertOk(throwFood(afterCooldown, { x: -4.1, z: 2 }));
    const landed = advanceChunks(second.state, 600);
    const foods = landed.state.world.foods;
    assert.equal(foods.length, 2);
    assert.equal(foods[0].claimedBy, 'slime-1');
    assert.equal(foods[1].claimedBy, 'slime-2');
    assert.notEqual(foods[0].claimedBy, foods[1].claimedBy);
    const r1 = landed.state.world.residents.find((resident) => resident.id === 'slime-1');
    const r2 = landed.state.world.residents.find((resident) => resident.id === 'slime-2');
    assert.equal(r1.targetFoodId, 'food-1');
    assert.equal(r2.targetFoodId, 'food-2');
    assert.notEqual(r1.targetFoodId, r2.targetFoodId);
    assertReciprocalClaims(landed.state.world);
  });

  test('all busy (arriving / post-meal rest): food waits, no expiry, no claim', () => {
    const state = makeColony(2);
    state.world.residents[0].activity = 'arriving';
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
    state.world.residents[0].position = { x: 0, z: -12 };
    state.world.residents[1].restUntilWorldMs = 50_000;
    state.world.residents[1].activity = 'idle';
    const thrown = assertOk(throwFood(state, { x: 6, z: 0 }));
    const landed = advanceChunks(thrown.state, 600);
    assert.equal(landed.state.world.foods.length, 1);
    assert.equal(landed.state.world.foods[0].stage, 'landed');
    assert.equal(landed.state.world.foods[0].claimedBy, null);
    assert.equal(
      landed.state.world.residents.every((resident) => resident.targetFoodId == null),
      true,
    );
    assert.equal(
      landed.events.some((event) => event.type === 'FOOD_CLAIMED'),
      false,
    );
    assert.equal(CLAIM_RELEASE_MS, 5000);
    assertReciprocalClaims(landed.state.world);
  });

  test('reciprocal invariant: claimedBy matches targetFoodId both ways', () => {
    const first = assertOk(throwFood(makeColony(2), { x: 1.1, z: 2 }));
    const second = assertOk(throwFood(atTime(first.state, 1000), { x: -4.1, z: 2 }));
    const landed = advanceChunks(second.state, 600);
    assertReciprocalClaims(landed.state.world);
  });

  test('seekingFood walk completion starts eating in range; no wander idle, no FED yet', () => {
    const state = makeColony(1);
    state.world.residents[0].position = { x: 0, z: 2 };
    const thrown = assertOk(throwFood(state, { x: 3.2, z: 2 }));
    const afterLand = advanceChunks(thrown.state, 600);
    const seeker = afterLand.state.world.residents[0];
    assert.equal(seeker.activity, 'seekingFood');
    assert.ok(seeker.route == null || seeker.route.points.length >= 2);
    let current = afterLand.state;
    for (let i = 0; i < 80; i += 1) {
      current = advanceChunks(current, 50).state;
      const resident = current.world.residents[0];
      if (resident.activity === 'eating' && resident.route == null) {
        assert.equal(resident.targetFoodId, 'food-1');
        assert.equal(current.world.foods[0].claimedBy, 'slime-1');
        assert.equal(current.world.foods[0].stage, 'eating');
        assert.equal(current.totalFeeds, 0);
        assert.equal(current.world.foods[0].eatUntilWorldMs, current.world.timeMs + 800);
        assert.notEqual(resident.activity, 'idle');
        assert.equal(
          current.world.foods.length,
          1,
        );
        return;
      }
    }
    assert.fail('seeker never started eating at the approach');
  });
});

describe('food module isolation', () => {
  test('food/commands/behavior/step still have no Date, Math.random, scene, or DOM', () => {
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
    const files = [
      join(worldDir, 'food.mjs'),
      join(worldDir, 'eating.mjs'),
      join(worldDir, 'behavior.mjs'),
      join(worldDir, 'step.mjs'),
      join(coreDir, 'commands.mjs'),
      join(coreDir, 'active.mjs'),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
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
