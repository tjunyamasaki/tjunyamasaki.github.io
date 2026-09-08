import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { GEOM_EPS, HABITAT_ID_V2 } from '../src/core/balance.mjs';
import {
  FARM_LAYOUT,
  HOME_SLOTS,
  MIN_SEPARATION,
  findFreePosition,
  freePositionCandidates,
  homePosition,
  isFinitePoint,
  isValidFoodTarget,
  isValidResidentCenter,
  minHomeSlotSeparation,
  pairDistance,
} from '../src/world/layout.mjs';

describe('farm home slots', () => {
  test('ten slots, min pair ≥ 2.4 (designed ≥ 3)', () => {
    assert.equal(HOME_SLOTS.length, 10);
    assert.deepEqual(homePosition(0), { x: 0, z: 2 });
    assert.deepEqual(HOME_SLOTS[9], { x: 6, z: -3 });
    const minPair = minHomeSlotSeparation();
    assert.ok(minPair >= MIN_SEPARATION);
    assert.ok(minPair >= 3 - GEOM_EPS);
    assert.equal(pairDistance(HOME_SLOTS[0], HOME_SLOTS[1]), 3);
    assert.equal(FARM_LAYOUT.id, HABITAT_ID_V2);
    assert.equal(FARM_LAYOUT.id, 'farm-v2');
  });

  test('every home slot is a valid resident center', () => {
    for (const slot of HOME_SLOTS) {
      assert.equal(isValidResidentCenter(slot), true, `${slot.x},${slot.z}`);
    }
  });
});

describe('isValidFoodTarget', () => {
  test('rejects outside fence, NaN, gate lane, and shrub exclusion', () => {
    assert.equal(isValidFoodTarget({ x: 0, z: 12 }), false);
    assert.equal(isValidFoodTarget({ x: 15, z: 0 }), false);
    assert.equal(isValidFoodTarget({ x: Number.NaN, z: 0 }), false);
    assert.equal(isValidFoodTarget({ x: 0, z: Number.NaN }), false);
    assert.equal(isFinitePoint({ x: Number.NaN, z: 0 }), false);
    assert.equal(isFinitePoint({ x: 0, z: Number.POSITIVE_INFINITY }), false);
    assert.equal(isValidFoodTarget({ x: 0, z: -7.5 }), false);
    assert.equal(isValidFoodTarget({ x: -10.8, z: -5.5 }), false);
    assert.equal(isValidFoodTarget({ x: -10.5, z: -5.5 }), false);
  });

  test('accepts a clearly legal interior point', () => {
    assert.equal(isValidFoodTarget({ x: 0, z: 0 }), true);
    assert.equal(isValidFoodTarget({ x: 1.1, z: 2 }), true);
  });

  test('does not clamp invalid points into the farm', () => {
    const outside = { x: 40, z: 40 };
    assert.equal(isValidFoodTarget(outside), false);
    assert.equal(outside.x, 40);
    assert.equal(outside.z, 40);
  });
});

describe('findFreePosition', () => {
  test('returns slot 0 when nothing is occupied', () => {
    assert.deepEqual(findFreePosition({ occupied: [], reserved: [] }), {
      x: 0,
      z: 2,
    });
  });

  test('skips occupied homes then still finds a legal center', () => {
    const occupied = HOME_SLOTS.map((slot) => ({ x: slot.x, z: slot.z }));
    const free = findFreePosition({ occupied, reserved: [] });
    assert.ok(free);
    assert.equal(isValidResidentCenter(free), true);
    for (const home of occupied) {
      assert.ok(pairDistance(free, home) >= MIN_SEPARATION - GEOM_EPS);
    }
  });

  test('freePositionCandidates lists homes first', () => {
    const candidates = freePositionCandidates();
    assert.ok(candidates.length > HOME_SLOTS.length);
    for (let i = 0; i < HOME_SLOTS.length; i += 1) {
      assert.equal(candidates[i].x, HOME_SLOTS[i].x);
      assert.equal(candidates[i].z, HOME_SLOTS[i].z);
    }
  });
});
