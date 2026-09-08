import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SLIME_NAMES } from '../src/core/balance.mjs';
import { cloneState, createInitialState, syncWorldRoster } from '../src/core/state.mjs';
import { HOME_SLOTS } from '../src/world/layout.mjs';
import {
  cloneWorld,
  createIdleResident,
  createWorld,
  decisionTimeForSlot,
} from '../src/world/state.mjs';

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

describe('createWorld', () => {
  test('defaults: foods [], sequence 1, time 0, carry 0, idle at homes', () => {
    const world = createWorld(makeSlimes(3));
    assert.equal(world.timeMs, 0);
    assert.equal(world.carryMs, 0);
    assert.equal(world.nextFoodSequence, 1);
    assert.deepEqual(world.foods, []);
    assert.equal(world.residents.length, 3);
    assert.equal(world.residents[0].id, 'slime-1');
    assert.deepEqual(world.residents[0].position, { x: 0, z: 2 });
    assert.equal(world.residents[0].yaw, 0);
    assert.equal(world.residents[0].activity, 'idle');
    assert.equal(world.residents[0].route, null);
    assert.equal(world.residents[0].targetFoodId, null);
    assert.equal(world.residents[0].restUntilWorldMs, 0);
    assert.equal(world.residents[0].blockedSinceWorldMs, null);
    assert.equal(world.residents[0].nextReplanWorldMs, 0);
    assert.equal(world.residents[0].behaviorCounter, 0);
    assert.equal(world.residents[0].nextDecisionWorldMs, 2000);
    assert.equal(world.residents[1].nextDecisionWorldMs, 2250);
    assert.equal(world.residents[2].nextDecisionWorldMs, 2500);
    assert.deepEqual(world.residents[2].position, HOME_SLOTS[2]);
  });

  test('orders residents by numeric slime id', () => {
    const shuffled = [makeSlimes(2)[1], makeSlimes(2)[0]];
    const world = createWorld(shuffled);
    assert.deepEqual(
      world.residents.map((resident) => resident.id),
      ['slime-1', 'slime-2'],
    );
  });

  test('createIdleResident is idle at the given point', () => {
    const resident = createIdleResident(makeSlimes(1)[0], { x: 1, z: 1 });
    assert.equal(resident.activity, 'idle');
    assert.deepEqual(resident.position, { x: 1, z: 1 });
    assert.equal(resident.nextDecisionWorldMs, decisionTimeForSlot(0));
  });
});

describe('cloneWorld', () => {
  test('mutating cloned residents, foods, and route.points leaves the original', () => {
    const world = createWorld(makeSlimes(1));
    world.foods.push({
      id: 'food-1',
      target: { x: 1.1, z: 2 },
      createdWorldMs: 0,
      landAtWorldMs: 600,
      stage: 'flying',
      claimedBy: null,
      eatUntilWorldMs: null,
    });
    world.residents[0].route = {
      points: [
        { x: 0, z: 2 },
        { x: 3, z: 2 },
      ],
      length: 3,
      startedWorldMs: 50,
      cycleCount: 3,
      distanceAlong: 0.5,
    };
    const cloned = cloneWorld(world);
    cloned.residents[0].position.x = 8;
    cloned.foods[0].target.z = 9;
    cloned.foods.push({
      id: 'food-2',
      target: { x: 0, z: 0 },
      createdWorldMs: 10,
      landAtWorldMs: 610,
      stage: 'landed',
      claimedBy: null,
      eatUntilWorldMs: null,
    });
    cloned.residents[0].route.points[1].x = 99;
    cloned.residents[0].route.points.pop();
    cloned.timeMs = 5000;
    assert.equal(world.residents[0].position.x, 0);
    assert.equal(world.foods.length, 1);
    assert.equal(world.foods[0].target.z, 2);
    assert.equal(world.residents[0].route.points.length, 2);
    assert.equal(world.residents[0].route.points[1].x, 3);
    assert.equal(world.timeMs, 0);
  });
});

describe('syncWorldRoster', () => {
  test('adds a missing resident at its home slot and drops extras', () => {
    const state = createInitialState();
    state.slimes.push({
      id: 'slime-2',
      name: SLIME_NAMES[1],
      createdAtMs: 0,
      boostUntilMs: 0,
      feedCount: 0,
      homeSlot: 1,
    });
    state.world.residents.push(
      createIdleResident({
        id: 'slime-99',
        name: 'gone',
        createdAtMs: 0,
        boostUntilMs: 0,
        feedCount: 0,
        homeSlot: 9,
      }),
    );
    const synced = syncWorldRoster(state);
    assert.deepEqual(
      synced.world.residents.map((resident) => resident.id),
      ['slime-1', 'slime-2'],
    );
    assert.deepEqual(synced.world.residents[1].position, { x: -3, z: 2 });
    assert.equal(synced.world.residents[1].activity, 'idle');
    assert.equal(
      state.world.residents.some((resident) => resident.id === 'slime-99'),
      true,
    );
  });

  test('keeps an existing survivor position', () => {
    const state = createInitialState();
    state.world.residents[0].position = { x: 1.1, z: 2 };
    state.world.residents[0].yaw = 0.5;
    const synced = syncWorldRoster(state);
    assert.deepEqual(synced.world.residents[0].position, { x: 1.1, z: 2 });
    assert.equal(synced.world.residents[0].yaw, 0.5);
    assert.notEqual(synced.world.residents[0].position, state.world.residents[0].position);
  });

  test('cloneState of a loaded v1-shaped object synthesizes world', () => {
    const loaded = {
      ...createInitialState(),
    };
    assert.equal('world' in loaded, false);
    const cloned = cloneState(loaded);
    assert.equal(cloned.world.residents.length, 1);
    assert.deepEqual(cloned.world.residents[0].position, { x: 0, z: 2 });
  });
});
