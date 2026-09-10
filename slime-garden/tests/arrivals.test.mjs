import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ARRIVAL_REVEAL_SEC,
  ARRIVAL_WALK_MAX_SEC,
  BERRY_SHRINK_END_SEC,
  BERRY_TRAVEL_END_SEC,
  FEED_DURATION_SEC,
  feedPresentationAt,
  maxGaitDistance,
  particleOffset,
  planArrival,
  quadraticBezier,
} from '../src/scene/arrivals.mjs';
import { ENTRY_POINT, HOME_SLOTS, MIN_SEPARATION } from '../src/scene/layout.mjs';
import { createPoseState, deform, evaluatePose, mouthRestLocal } from '../src/scene/slime-pose.mjs';

describe('feed presentation', () => {
  // P2-12 farm eating is 800 ms and world-driven (`EAT_DURATION_MS`).
  // These timings remain the unused v1 circular helpers (`FEED_DURATION_SEC=1.1`).
  test('berry travels then shrinks, then particles, then idle', () => {
    const start = feedPresentationAt(0);
    assert.equal(start.berryVisible, true);
    assert.equal(start.berryT, 0);
    assert.equal(start.squash, 0);

    const midArc = feedPresentationAt(BERRY_TRAVEL_END_SEC / 2);
    assert.ok(midArc.berryT > 0.4 && midArc.berryT < 0.6);
    assert.equal(midArc.squash, 0);

    const atMouth = feedPresentationAt(BERRY_TRAVEL_END_SEC);
    assert.equal(atMouth.berryT, 1);

    const squash = feedPresentationAt((BERRY_TRAVEL_END_SEC + BERRY_SHRINK_END_SEC) / 2);
    assert.ok(squash.squash > 0.5);
    assert.ok(squash.berryScale < 0.11);
    assert.ok(squash.berryVisible);

    const particles = feedPresentationAt(0.9);
    assert.equal(particles.berryVisible, false);
    assert.ok(particles.particleT > 0);
    assert.ok(particles.particleT < 1);

    const done = feedPresentationAt(FEED_DURATION_SEC);
    assert.equal(done.done, true);
    assert.equal(done.berryVisible, false);
    assert.equal(done.squash, 0);
  });

  test('quadratic arc is at the endpoints and lifts in the middle', () => {
    const a = quadraticBezier(0, 0, 0, 0, 2, 0, 2, 0, 0, 0);
    const b = quadraticBezier(0, 0, 0, 0, 2, 0, 2, 0, 0, 1);
    const m = quadraticBezier(0, 0, 0, 0, 2, 0, 2, 0, 0, 0.5);
    assert.equal(a.x, 0);
    assert.equal(b.x, 2);
    assert.ok(m.y > 0.9);
  });

  test('mouth rest deforms without opening a hole in the profile', () => {
    const profile = [
      { x: 0.01, y: 0 },
      { x: 0.5, y: 0.4 },
      { x: 0.5, y: 0.5 },
      { x: 0.01, y: 1.34 },
    ];
    const local = mouthRestLocal(profile);
    assert.ok(local.z > 0);
    const pose = createPoseState();
    evaluatePose(pose);
    const out = deform(pose, local.x, local.y, local.z);
    assert.equal(Number.isFinite(out.x), true);
    assert.equal(Number.isFinite(out.y), true);
    assert.equal(Number.isFinite(out.z), true);
  });
});

describe('visitor-v1 arrival plan', () => {
  test('reduced motion and pause always reveal at the pad', () => {
    const home = HOME_SLOTS[2];
    const reduced = planArrival({ home, occupants: [], reducedMotion: true });
    assert.equal(reduced.style, 'reveal');
    assert.equal(reduced.durationSec, 0);
    assert.equal(reduced.toX, home.x);
    const paused = planArrival({ home, occupants: [], animationsPaused: true });
    assert.equal(paused.style, 'reveal');
  });

  test('a blocked corridor falls back to a stationary reveal', () => {
    const home = HOME_SLOTS[4];
    const plan = planArrival({
      home,
      entry: ENTRY_POINT,
      occupants: [{ x: (ENTRY_POINT.x + home.x) / 2, z: (ENTRY_POINT.z + home.z) / 2 }],
      maxWalkSec: ARRIVAL_WALK_MAX_SEC,
    });
    assert.equal(plan.style, 'reveal');
    assert.equal(plan.reason, 'blocked');
    assert.equal(plan.durationSec, ARRIVAL_REVEAL_SEC);
  });

  test('a clear short approach walks with gait-matched duration at most 5s', () => {
    const home = { x: 0, z: -1 };
    const entry = { x: 0, z: -2.2 };
    const plan = planArrival({
      home,
      entry,
      occupants: [],
    });
    assert.equal(plan.style, 'walk');
    assert.ok(plan.durationSec <= ARRIVAL_WALK_MAX_SEC);
    assert.ok(plan.cycles >= 1);
    assert.equal(plan.toX, home.x);
    assert.equal(plan.toZ, home.z);
  });

  test('gait budget does not race a long entrance path', () => {
    const budget = maxGaitDistance(ARRIVAL_WALK_MAX_SEC);
    assert.ok(budget <= 5 * 0.65 + 1e-9);
    const home = HOME_SLOTS[0];
    const plan = planArrival({ home, occupants: [], entry: ENTRY_POINT });
    if (plan.style === 'walk') {
      const dist = Math.hypot(plan.toX - plan.fromX, plan.toZ - plan.fromZ);
      assert.ok(dist <= budget + 1e-6);
      assert.ok(plan.durationSec <= ARRIVAL_WALK_MAX_SEC + 1e-6);
    }
  });

  test('an occupant closer than 2.4 to the swept line is enough to block', () => {
    const plan = planArrival({
      home: { x: 0, z: 0 },
      entry: { x: 0, z: -2 },
      occupants: [{ x: 0, z: -1 }],
    });
    assert.equal(plan.style, 'reveal');
    assert.ok(MIN_SEPARATION > 1);
  });

  test('particle offsets are stable per id and index', () => {
    const a = particleOffset('slime-2', 0);
    const b = particleOffset('slime-2', 0);
    const c = particleOffset('slime-3', 0);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });
});
