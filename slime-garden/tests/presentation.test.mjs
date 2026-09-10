import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { EAT_DURATION_MS, FOOD_FLIGHT_MS, MICRO_PER_GLOW } from '../src/core/balance.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';
import { GATE_STAGING } from '../src/world/layout.mjs';
import {
  arrivalVisualPlan,
  createWorldFxPool,
  FEED_CUE_MIN_INTERVAL_MS,
  MAX_BRIEF_REACTIONS,
  MAX_CELEBRATION_PARTICLES,
  planPetReaction,
  presentationGate,
} from '../src/scene/arrivals.mjs';
import {
  BERRY_GROUND_Y,
  cameraThrowOrigin,
  diffFoodIds,
  eatProgress,
  eatingBerryPosition,
  flyingBerryPosition,
  throwArcHeight,
  throwFlightT,
  visualFoodPosition,
  worldClockMs,
} from '../src/scene/food.mjs';
import { createPoseBinder, visualWalkPhase } from '../src/scene/pose-adapter.mjs';

const THREE_SKIP_MESSAGE =
  'Three.js scene graph unavailable in this environment; pure presentation helpers still ran.';

/** @type {typeof import('../vendor/three/three.module.js') | null} */
let THREE = null;
/** @type {typeof import('../src/scene/habitat-farm.mjs') | null} */
let farmMod = null;
/** @type {string | false} */
let threeSkip = THREE_SKIP_MESSAGE;

try {
  THREE = await import('../vendor/three/three.module.js');
  farmMod = await import('../src/scene/habitat-farm.mjs');
  const probe = new THREE.Group();
  if (probe && THREE.Mesh && farmMod.createFarmHabitat) threeSkip = false;
} catch (error) {
  THREE = null;
  farmMod = null;
  threeSkip = `${THREE_SKIP_MESSAGE} (${error && error.message ? error.message : error})`;
}

function assertNoNavImport(fileUrl) {
  const src = readFileSync(new URL(fileUrl, import.meta.url), 'utf8');
  assert.equal(/from ['"][^'"]*navigation\.mjs['"]/.test(src), false);
}

describe('P2-12 food mesh membership', () => {
  test('diffFoodIds adds extras and drops missing ids', () => {
    const diff = diffFoodIds(
      [{ id: 'food-1' }, { id: 'food-2' }],
      [{ id: 'food-2' }, { id: 'food-3' }],
    );
    assert.deepEqual(diff.add.sort(), ['food-3']);
    assert.deepEqual(diff.remove.sort(), ['food-1']);
    assert.deepEqual(diff.keep, ['food-2']);
  });

  test(
    'farm foods group hosts one mesh per id and disposes extras',
    { skip: threeSkip },
    () => {
      const scene = new THREE.Scene();
      const habitat = farmMod.createFarmHabitat(THREE, scene, { capacity: 2 });
      const foods = [
        {
          id: 'food-1',
          target: { x: 1, z: 1 },
          createdWorldMs: 0,
          landAtWorldMs: 600,
          stage: 'landed',
          claimedBy: null,
          eatUntilWorldMs: null,
        },
        {
          id: 'food-2',
          target: { x: 2, z: 2 },
          createdWorldMs: 0,
          landAtWorldMs: 600,
          stage: 'flying',
          claimedBy: null,
          eatUntilWorldMs: null,
        },
      ];
      habitat.setFoods(foods);
      assert.deepEqual(habitat.foods.ids().sort(), ['food-1', 'food-2']);
      assert.ok(habitat.foodsGroup.getObjectByName('food-visual-food-1'));
      assert.ok(habitat.foodsGroup.getObjectByName('food-visual-food-2'));
      habitat.setFoods([foods[1]]);
      assert.deepEqual(habitat.foods.ids(), ['food-2']);
      assert.equal(habitat.foodsGroup.getObjectByName('food-visual-food-1'), undefined);
      assert.ok(habitat.foodsGroup.getObjectByName('food-visual-food-2'));
      habitat.setFoods([]);
      assert.equal(habitat.foods.ids().length, 0);
      assert.equal(habitat.foodsGroup.children.length, 0);
      habitat.dispose();
    },
  );
});

describe('P2-12 throw and eating positions', () => {
  test('flying food uses world land time/target; reconstructed food sits at target', () => {
    const food = {
      id: 'food-9',
      target: { x: 3, z: 4 },
      createdWorldMs: 0,
      landAtWorldMs: FOOD_FLIGHT_MS,
      stage: 'flying',
    };
    assert.equal(throwFlightT(food, 0), 0);
    assert.equal(throwFlightT(food, FOOD_FLIGHT_MS), 1);
    const reconstructed = flyingBerryPosition({
      food,
      worldMs: 300,
      throwOrigin: null,
    });
    assert.equal(reconstructed.x, 3);
    assert.equal(reconstructed.z, 4);
    assert.equal(reconstructed.y, BERRY_GROUND_Y);

    const origin = { x: -2, y: 1.8, z: 8 };
    const mid = flyingBerryPosition({
      food,
      worldMs: FOOD_FLIGHT_MS / 2,
      throwOrigin: origin,
    });
    assert.notEqual(mid.x, 3);
    assert.ok(mid.y > BERRY_GROUND_Y + 0.4);
    const height = throwArcHeight('food-9');
    assert.ok(height >= 1.5 && height <= 2.5);
  });

  test('eating samples the provided mouth each frame, never a fixed global', () => {
    const food = {
      id: 'food-1',
      target: { x: 0, z: 0 },
      stage: 'eating',
      eatUntilWorldMs: EAT_DURATION_MS,
    };
    assert.equal(eatProgress(food, 0, EAT_DURATION_MS), 0);
    assert.equal(eatProgress(food, EAT_DURATION_MS, EAT_DURATION_MS), 1);
    const a = eatingBerryPosition({
      food,
      worldMs: 400,
      mouth: { x: 1, y: 1, z: 1 },
    });
    const b = eatingBerryPosition({
      food,
      worldMs: 400,
      mouth: { x: 2, y: 1.4, z: -1 },
    });
    assert.notDeepEqual(a, b);
    const still = eatingBerryPosition({
      food,
      worldMs: 400,
      mouth: { x: 4, y: 2, z: 4 },
      reducedMotion: true,
    });
    assert.equal(still.x, 4);
    assert.equal(still.y, 2);
  });

  test('landed food stays on the grass snapshot', () => {
    const pos = visualFoodPosition({
      food: {
        id: 'food-1',
        target: { x: 4.5, z: 4 },
        stage: 'landed',
        createdWorldMs: 0,
        landAtWorldMs: 600,
        claimedBy: 'slime-1',
        eatUntilWorldMs: null,
      },
      worldMs: 900,
    });
    assert.equal(pos.x, 4.5);
    assert.equal(pos.z, 4);
    assert.equal(pos.y, BERRY_GROUND_Y);
  });

  test('camera throw origin is finite and in front of a mock camera', () => {
    const origin = cameraThrowOrigin({
      position: { x: 0, y: 12, z: 18 },
      getWorldDirection(target) {
        target.x = 0;
        target.y = -0.4;
        target.z = -1;
      },
    });
    assert.equal(Number.isFinite(origin.x), true);
    assert.ok(origin.z < 18);
    assert.ok(origin.y >= 1.15);
  });

  test('worldClockMs adds carry', () => {
    assert.equal(worldClockMs({ timeMs: 100, carryMs: 20 }), 120);
  });
});

describe('P2-12 pet, arrivals, reduced motion, pause, hidden', () => {
  test('pet helper does not mutate GameState', () => {
    const state = createInitialState();
    const beforeGlow = state.glowMicro;
    const beforeBerries = state.berries;
    const beforeWorld = cloneState(state);
    const result = planPetReaction({
      state,
      slimeId: 'slime-1',
      nowMs: 0,
      lastPetAtMs: -10_000,
      visible: true,
    });
    assert.equal(result.ok, true);
    assert.equal(state.glowMicro, beforeGlow);
    assert.equal(state.berries, beforeBerries);
    assert.equal(state.world.foods.length, beforeWorld.world.foods.length);
    assert.equal(state.slimes[0].feedCount, beforeWorld.slimes[0].feedCount);
    assert.equal(state.totalFeeds, beforeWorld.totalFeeds);
    assert.equal(MICRO_PER_GLOW > 0, true);
  });

  test('arrival presentation consumes core snapshots and does not call planRoute', () => {
    assertNoNavImport('../src/scene/food.mjs');
    assertNoNavImport('../src/scene/pose-adapter.mjs');
    const arrivalsSrc = readFileSync(new URL('../src/scene/arrivals.mjs', import.meta.url), 'utf8');
    assert.equal(/from ['"][^'"]*navigation\.mjs['"]/.test(arrivalsSrc), false);
    const arriving = {
      id: 'slime-2',
      activity: 'arriving',
      position: { x: GATE_STAGING.x, z: GATE_STAGING.z },
      route: {
        points: [GATE_STAGING, { x: 0, z: 2 }],
        length: 10,
        startedWorldMs: 0,
        cycleCount: 10,
        distanceAlong: 0,
      },
    };
    assert.equal(arrivalVisualPlan(arriving).style, 'follow-route');
    const still = {
      id: 'slime-3',
      activity: 'idle',
      position: { x: 3, z: 2 },
      route: null,
    };
    assert.equal(arrivalVisualPlan(still).style, 'still-greeting');
  });

  test('reduced motion / pause / hidden skip replay', () => {
    const hidden = presentationGate({ visible: false });
    assert.equal(hidden.captureThrowOrigin, false);
    assert.equal(hidden.enqueueReaction, false);
    const paused = presentationGate({ visible: true, animationsPaused: true });
    assert.equal(paused.captureThrowOrigin, false);
    assert.equal(paused.enqueueReaction, false);
    assert.equal(paused.followTravel, false);
    const reduced = presentationGate({ visible: true, reducedMotion: true });
    assert.equal(reduced.animateArcs, false);
    assert.equal(reduced.animateParticles, false);
    assert.equal(reduced.animateSquash, false);
    const live = presentationGate({ visible: true });
    assert.equal(live.captureThrowOrigin, true);
    assert.equal(live.enqueueReaction, true);
  });
});

describe('P2-12 gait binding', () => {
  test('visual walk phase follows the 1250 ms route clock, not actor.update time', () => {
    const route = {
      startedWorldMs: 0,
      cycleCount: 1,
      points: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      length: 1,
      distanceAlong: 0,
    };
    assert.equal(visualWalkPhase(route, 0), 0);
    assert.ok(Math.abs(visualWalkPhase(route, 625) - 0.5) < 1e-9);
    const binder = createPoseBinder();
    /** @type {object[]} */
    const poses = [];
    const actor = {
      setWorldPose() {},
      setPose(next) {
        poses.push(next);
      },
    };
    const resident = {
      id: 'slime-1',
      position: { x: 0.2, z: 0 },
      yaw: 0.1,
      activity: 'wandering',
      route,
    };
    binder.apply(actor, resident, {
      worldTimeMs: 625,
      dtSec: 0.016,
      paused: false,
      reducedMotion: false,
    });
    assert.ok(poses.length >= 1);
    assert.ok(Math.abs(poses[0].walkPhase - 0.5) < 1e-9);
    assert.ok(poses[0].walkBlend > 0);
  });
});

describe('P2-12 FX caps', () => {
  test(
    'reaction and particle pools stay within 10 / 40',
    { skip: threeSkip },
    () => {
      const parent = new THREE.Group();
      const pool = createWorldFxPool(THREE, parent);
      for (let i = 0; i < 25; i += 1) {
        pool.beginReaction(`slime-${(i % 10) + 1}`, 'feed');
      }
      assert.ok(pool.size <= MAX_BRIEF_REACTIONS);
      const squash = pool.tick(0.1, (id) => ({ x: 0, z: 0, y: 0.7 }), false, false);
      assert.ok(squash.size <= MAX_BRIEF_REACTIONS);
      assert.ok(pool.activeParticleCount() <= MAX_CELEBRATION_PARTICLES);
      pool.tick(0, () => ({ x: 0, z: 0 }), false, true);
      assert.equal(pool.size, 0);
      pool.dispose();
    },
  );

  test('feed cue limiter constant is 150 ms', () => {
    assert.equal(FEED_CUE_MIN_INTERVAL_MS, 150);
  });
});
