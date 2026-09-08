import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  CAMERA_PITCH,
  CAMERA_TARGET,
  CAMERA_YAW,
  distanceFromOrigin,
  distanceXZ,
  enabledHomeSlots,
  ENTRY_POINT,
  fitDistanceForSlots,
  FOOD_POINT,
  GARDEN_LAYOUT,
  HOME_SLOTS,
  MIN_SEPARATION,
  SHRUB_POINT,
  SLOT_MARGIN,
  validateHomeSlots,
  VFOV_DEG,
  WALK_RADIUS,
  WANDER_HOME_RADIUS,
} from '../src/scene/layout.mjs';

describe('garden layout', () => {
  test('six home pads do not overlap footprints and sit inside the walk disk', () => {
    const report = validateHomeSlots();
    assert.equal(report.ok, true, report.issues.join('; '));
    assert.equal(HOME_SLOTS.length, 6);
    assert.ok(report.minPairDistance >= MIN_SEPARATION);
    assert.ok(report.maxSlotRadius <= WALK_RADIUS);
  });

  test('enabled pads follow resident capacity', () => {
    assert.deepEqual(enabledHomeSlots(2), HOME_SLOTS.slice(0, 2));
    assert.equal(enabledHomeSlots(6).length, 6);
    assert.equal(enabledHomeSlots(99).length, 6);
    assert.equal(enabledHomeSlots(0).length, 1);
  });

  test('basket, shrub, and entrance sit outside ordinary wander corridors', () => {
    assert.ok(distanceFromOrigin(ENTRY_POINT) > WALK_RADIUS);
    assert.ok(distanceFromOrigin(FOOD_POINT) > WALK_RADIUS);
    assert.ok(distanceFromOrigin(SHRUB_POINT) > WALK_RADIUS);
    for (const slot of HOME_SLOTS) {
      assert.ok(distanceXZ(slot, FOOD_POINT) > WANDER_HOME_RADIUS);
      assert.ok(distanceXZ(slot, ENTRY_POINT) > WANDER_HOME_RADIUS);
    }
  });

  test('layout id matches the provisional habitat', () => {
    assert.equal(GARDEN_LAYOUT.id, 'garden-prototype-v1');
    assert.equal(GARDEN_LAYOUT.homeSlots.length, 6);
  });

  test('camera distance uses both FOVs and grows with population and portrait', () => {
    const landscape = 16 / 9;
    const portrait = 9 / 16;
    const one = fitDistanceForSlots(
      landscape,
      VFOV_DEG,
      CAMERA_YAW,
      CAMERA_PITCH,
      CAMERA_TARGET,
      enabledHomeSlots(1),
      SLOT_MARGIN,
    );
    const threeLand = fitDistanceForSlots(
      landscape,
      VFOV_DEG,
      CAMERA_YAW,
      CAMERA_PITCH,
      CAMERA_TARGET,
      enabledHomeSlots(3),
      SLOT_MARGIN,
    );
    const sixLand = fitDistanceForSlots(
      landscape,
      VFOV_DEG,
      CAMERA_YAW,
      CAMERA_PITCH,
      CAMERA_TARGET,
      enabledHomeSlots(6),
      SLOT_MARGIN,
    );
    const sixPort = fitDistanceForSlots(
      portrait,
      VFOV_DEG,
      CAMERA_YAW,
      CAMERA_PITCH,
      CAMERA_TARGET,
      enabledHomeSlots(6),
      SLOT_MARGIN,
    );
    assert.ok(one > 1);
    assert.ok(threeLand >= one);
    assert.ok(sixLand >= threeLand);
    assert.ok(sixPort >= sixLand);
    const naiveWidthScale = one * (16 / 9);
    assert.notEqual(sixLand, naiveWidthScale);
  });
});
