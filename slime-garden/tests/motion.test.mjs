import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { WALK_CYCLE_SEC } from '../src/scene/slime-pose.mjs';
import {
  createMotionWorld,
  createResidentMotion,
  gaitCycleCount,
  gaitTravelProgress,
  hashSlimeId,
  idlePhaseOffsetSec,
  mulberry32,
  pickWanderDestination,
  pointToSegmentDistance,
  restAtHome,
  segmentClearsOccupants,
  shortestYawDelta,
  wanderDelaySec,
  yawFromDirection,
} from '../src/scene/motion.mjs';
import {
  HOME_SLOTS,
  MIN_SEPARATION,
  TRAVEL_PHASE_END,
  TRAVEL_PHASE_START,
  WANDER_DELAY_MAX_SEC,
  WANDER_DELAY_MIN_SEC,
} from '../src/scene/layout.mjs';

describe('motion helpers', () => {
  test('point-to-segment distance uses the swept line, not only endpoints', () => {
    assert.equal(pointToSegmentDistance(0, 1, -2, 0, 2, 0), 1);
    assert.equal(pointToSegmentDistance(-3, 0, -2, 0, 2, 0), 1);
    assert.ok(pointToSegmentDistance(0, 0, 0, 0, 0, 0) === 0);
  });

  test('a path that passes beside a resident is rejected', () => {
    const occupants = [{ x: 0, z: 0 }];
    assert.equal(segmentClearsOccupants(-3, 0, 3, 0, occupants, MIN_SEPARATION), false);
    assert.equal(segmentClearsOccupants(-3, 4, 3, 4, occupants, MIN_SEPARATION), true);
  });

  test('gait travel holds outside 0.29–0.68 and finishes on schedule', () => {
    const cycles = gaitCycleCount(0.65);
    assert.equal(cycles, 1);
    const start = TRAVEL_PHASE_START * WALK_CYCLE_SEC;
    const end = TRAVEL_PHASE_END * WALK_CYCLE_SEC;
    assert.equal(gaitTravelProgress(0, 1), 0);
    assert.equal(gaitTravelProgress(start, 1), 0);
    assert.ok(gaitTravelProgress((start + end) / 2, 1) > 0.4);
    assert.ok(gaitTravelProgress((start + end) / 2, 1) < 0.6);
    assert.equal(gaitTravelProgress(end, 1), 1);
    assert.equal(gaitTravelProgress(WALK_CYCLE_SEC, 1), 1);
    assert.equal(gaitCycleCount(1.3), 2);
    assert.equal(gaitTravelProgress(WALK_CYCLE_SEC, 2), 0.5);
  });

  test('visual seeds are deterministic and wander waits stay in 5–12s', () => {
    assert.equal(hashSlimeId('slime-1'), hashSlimeId('slime-1'));
    assert.notEqual(hashSlimeId('slime-1'), hashSlimeId('slime-2'));
    assert.notEqual(idlePhaseOffsetSec('slime-1'), idlePhaseOffsetSec('slime-2'));
    for (let attempt = 0; attempt < 20; attempt++) {
      const wait = wanderDelaySec('slime-1', attempt);
      assert.ok(wait >= WANDER_DELAY_MIN_SEC);
      assert.ok(wait <= WANDER_DELAY_MAX_SEC);
    }
    const rng = mulberry32(1);
    assert.equal(rng(), mulberry32(1)());
  });

  test('yaw from travel uses atan2(dx, dz) and shortest turns', () => {
    assert.equal(yawFromDirection(0, 1), 0);
    assert.ok(Math.abs(yawFromDirection(1, 0) - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(shortestYawDelta(0.1, Math.PI * 2 - 0.1)) < 0.25);
  });

  test('wander picker stays near home, inside the walk disk, and clears others', () => {
    const home = HOME_SLOTS[0];
    const occupants = [{ x: HOME_SLOTS[1].x, z: HOME_SLOTS[1].z }];
    const dest = pickWanderDestination({
      fromX: home.x,
      fromZ: home.z,
      homeX: home.x,
      homeZ: home.z,
      occupants,
      rng: mulberry32(42),
    });
    assert.ok(dest);
    assert.ok(Math.hypot(dest.x - home.x, dest.z - home.z) <= 0.8 + 1e-9);
    assert.ok(Math.hypot(dest.x, dest.z) <= 4.5 + 1e-9);
    assert.ok(
      segmentClearsOccupants(home.x, home.z, dest.x, dest.z, occupants, MIN_SEPARATION),
    );
  });

  test('eight failed candidates leave the resident idle', () => {
    const home = HOME_SLOTS[0];
    const dest = pickWanderDestination({
      fromX: home.x,
      fromZ: home.z,
      homeX: home.x,
      homeZ: home.z,
      occupants: [{ x: home.x, z: home.z }],
      rng: () => 0,
      maxAttempts: 8,
    });
    assert.equal(dest, null);
  });
});

describe('motion world', () => {
  test('constructs and destroys residents by id without overlapping homes', () => {
    const world = createMotionWorld();
    world.syncRoster([
      { id: 'slime-1', homeSlot: 0 },
      { id: 'slime-2', homeSlot: 1 },
    ]);
    assert.equal(world.residents.size, 2);
    const a = world.residents.get('slime-1');
    const b = world.residents.get('slime-2');
    assert.ok(a && b);
    assert.equal(a.x, HOME_SLOTS[0].x);
    assert.equal(b.x, HOME_SLOTS[1].x);
    const gap = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(gap >= MIN_SEPARATION);
    world.syncRoster([{ id: 'slime-1', homeSlot: 0 }]);
    assert.equal(world.residents.size, 1);
    assert.equal(world.residents.has('slime-2'), false);
    world.dispose();
  });

  test('only one resident walks at a time and interrupt releases the reservation', () => {
    const world = createMotionWorld();
    world.syncRoster([
      { id: 'slime-1', homeSlot: 0 },
      { id: 'slime-2', homeSlot: 1 },
    ]);
    const first = world.residents.get('slime-1');
    first.waitUntilSec = 0;
    world.residents.get('slime-2').waitUntilSec = 0;
    world.step(0.05, {
      cameraX: 0,
      cameraZ: 10,
      reducedMotion: false,
      animationsPaused: false,
    });
    assert.ok(world.walkerId);
    const walker = world.walkerId;
    const otherId = walker === 'slime-1' ? 'slime-2' : 'slime-1';
    assert.equal(world.residents.get(otherId).mode, 'idle');
    assert.equal(world.residents.get(walker).mode, 'walking');
    assert.ok(world.residents.get(walker).walk);
    world.interruptWalk(walker, 0);
    assert.equal(world.walkerId, null);
    assert.equal(world.residents.get(walker).walk, null);
    assert.equal(world.residents.get(walker).mode, 'idle');
    world.dispose();
  });

  test('reset and reduced motion snap travel back to home pads', () => {
    const world = createMotionWorld();
    world.syncRoster([{ id: 'slime-1', homeSlot: 0 }]);
    const motion = world.residents.get('slime-1');
    motion.x = 1.2;
    motion.z = 0.4;
    motion.mode = 'walking';
    restAtHome(motion, world.visualSec);
    assert.equal(motion.x, HOME_SLOTS[0].x);
    assert.equal(motion.z, HOME_SLOTS[0].z);
    assert.equal(motion.walk, null);
    world.syncRoster([{ id: 'slime-1', homeSlot: 0 }], { resetPositions: true });
    assert.equal(world.residents.get('slime-1').x, HOME_SLOTS[0].x);
    world.dispose();
  });

  test('new residents spawn at their home slot', () => {
    const born = createResidentMotion('slime-3', 2, 0);
    assert.equal(born.x, HOME_SLOTS[2].x);
    assert.equal(born.z, HOME_SLOTS[2].z);
    assert.equal(born.mode, 'idle');
  });

  test('directed arrival walk is exclusive and can be interrupted', () => {
    const world = createMotionWorld();
    world.syncRoster([
      { id: 'slime-1', homeSlot: 0 },
      { id: 'slime-2', homeSlot: 1 },
    ]);
    world.placeAt('slime-2', 0, -2.2, 0);
    const started = world.beginDirectedWalk('slime-2', HOME_SLOTS[1].x, HOME_SLOTS[1].z, 'arriving');
    assert.equal(started, true);
    assert.equal(world.walkerId, 'slime-2');
    assert.equal(world.residents.get('slime-2').mode, 'arriving');
    world.placeAt('slime-1', HOME_SLOTS[0].x, HOME_SLOTS[0].z);
    world.residents.get('slime-1').waitUntilSec = 0;
    world.step(0.05, {
      cameraX: 0,
      cameraZ: 10,
      reducedMotion: false,
      animationsPaused: false,
    });
    assert.equal(world.walkerId, 'slime-2');
    world.interruptWalk('slime-2', 0);
    assert.equal(world.walkerId, null);
    assert.equal(world.residents.get('slime-2').walk, null);
    world.dispose();
  });
});
