import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advanceActive, stepWorld } from '../src/core/active.mjs';
import {
  GAIT_CYCLE_MS,
  GEOM_EPS,
  MAX_ACTIVE_ROUTES,
  SLIME_NAMES,
  STRIDE_UNITS,
  WORLD_STEP_MS,
} from '../src/core/balance.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';
import {
  WANDER_MAX_DISTANCE,
  WANDER_MIN_DISTANCE,
  wanderCandidatePoints,
} from '../src/world/behavior.mjs';
import {
  TRAVEL_PHASE_END,
  TRAVEL_PHASE_START,
  gaitCycleCount,
  gaitFraction,
  poseAlongPolyline,
  yawFromDirection,
} from '../src/world/gait.mjs';
import {
  GATE_STAGING,
  MIN_SEPARATION,
  PROP_MOVEMENT_RADIUS,
  STATIC_PROPS,
  isInArrivalCorridor,
  isValidResidentCenter,
  pairDistance,
} from '../src/world/layout.mjs';
import { corridorsClear, isAllowedCenter, planRoute } from '../src/world/navigation.mjs';
import { createWorld } from '../src/world/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const worldDir = join(here, '../src/world');

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
function makeColony(count = 10) {
  const state = cloneState(createInitialState());
  state.upgrades.beds = 8;
  state.slimes = makeSlimes(count);
  state.world = createWorld(state.slimes);
  return state;
}

/**
 * @param {import('../src/world/state.mjs').WorldState} world
 */
function assertWorldInvariants(world) {
  assert.ok(Number.isInteger(world.timeMs) && world.timeMs % WORLD_STEP_MS === 0);
  assert.ok(Number.isInteger(world.carryMs) && world.carryMs >= 0 && world.carryMs <= 49);
  const movers = world.residents.filter(
    (resident) => resident.route != null && resident.route.points.length >= 2,
  );
  assert.ok(movers.length <= MAX_ACTIVE_ROUTES, `movers ${movers.length}`);
  for (let i = 0; i < movers.length; i += 1) {
    for (let j = i + 1; j < movers.length; j += 1) {
      assert.equal(
        corridorsClear(movers[i].route.points, movers[j].route.points),
        true,
        `${movers[i].id} vs ${movers[j].id}`,
      );
    }
  }
  for (const resident of world.residents) {
    const point = resident.position;
    assert.equal(Number.isFinite(point.x) && Number.isFinite(point.z), true, resident.id);
    const arriving = resident.activity === 'arriving';
    assert.equal(
      isAllowedCenter(point, arriving),
      true,
      `${resident.id} at ${point.x},${point.z}`,
    );
    if (!arriving) {
      assert.equal(isValidResidentCenter(point), true, resident.id);
      assert.equal(isInArrivalCorridor(point), false, resident.id);
    }
    for (const prop of STATIC_PROPS) {
      assert.ok(
        pairDistance(point, prop) >= PROP_MOVEMENT_RADIUS - GEOM_EPS,
        `${resident.id} prop ${prop.id}`,
      );
    }
  }
  for (let i = 0; i < world.residents.length; i += 1) {
    for (let j = i + 1; j < world.residents.length; j += 1) {
      const distance = pairDistance(world.residents[i].position, world.residents[j].position);
      assert.ok(
        distance >= MIN_SEPARATION - GEOM_EPS,
        `${world.residents[i].id} vs ${world.residents[j].id} = ${distance}`,
      );
    }
  }
}

describe('world gait', () => {
  test('progress is 0 at t=0, 1 at cycleCount*1250, hold outside 0.29–0.68, and monotonic', () => {
    assert.equal(STRIDE_UNITS, 1);
    assert.equal(gaitCycleCount(0.4), 1);
    assert.equal(gaitCycleCount(1), 1);
    assert.equal(gaitCycleCount(1.1), 2);
    assert.equal(gaitFraction(0, 1), 0);
    assert.equal(gaitFraction(GAIT_CYCLE_MS, 1), 1);
    assert.equal(gaitFraction(2 * GAIT_CYCLE_MS, 2), 1);
    const holdEnd = TRAVEL_PHASE_START * GAIT_CYCLE_MS;
    const travelEnd = TRAVEL_PHASE_END * GAIT_CYCLE_MS;
    assert.equal(gaitFraction(holdEnd, 1), 0);
    assert.equal(gaitFraction(350, 1), 0);
    assert.ok(gaitFraction(400, 1) > 0);
    assert.equal(gaitFraction(travelEnd, 1), 1);
    let previous = 0;
    for (let elapsed = 0; elapsed <= GAIT_CYCLE_MS; elapsed += WORLD_STEP_MS) {
      const fraction = gaitFraction(elapsed, 1);
      assert.ok(fraction + 1e-12 >= previous);
      previous = fraction;
    }
  });

  test('polyline pose does not skip segments and yaw uses atan2(dx, dz)', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 2 },
    ];
    const mid = poseAlongPolyline(points, 1);
    assert.ok(Math.abs(mid.position.x - 1) <= GEOM_EPS);
    assert.ok(Math.abs(mid.position.z) <= GEOM_EPS);
    const corner = poseAlongPolyline(points, 2);
    assert.ok(Math.abs(corner.position.x - 2) <= GEOM_EPS);
    assert.ok(Math.abs(corner.position.z) <= GEOM_EPS);
    const last = poseAlongPolyline(points, 4);
    assert.ok(Math.abs(last.position.x - 2) <= GEOM_EPS);
    assert.ok(Math.abs(last.position.z - 2) <= GEOM_EPS);
    assert.equal(yawFromDirection(0, 1), 0);
    assert.ok(Math.abs(yawFromDirection(1, 0) - Math.PI / 2) < 1e-9);
  });

  test('stepWorld does not translate during the hold phase', () => {
    const state = cloneState(createInitialState());
    const resident = state.world.residents[0];
    resident.position = { x: 0, z: 0 };
    resident.route = {
      points: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
      ],
      length: 4,
      startedWorldMs: 0,
      cycleCount: 4,
      distanceAlong: 0,
    };
    resident.activity = 'wandering';
    resident.nextDecisionWorldMs = 10_000;
    state.world.timeMs = 50;
    const held = stepWorld(state);
    assert.ok(Math.abs(held.world.residents[0].position.x) <= GEOM_EPS);
    assert.ok(Math.abs(held.world.residents[0].position.z) <= GEOM_EPS);
    assert.ok(held.world.residents[0].route);

    state.world.timeMs = 400;
    const moved = stepWorld(state);
    assert.ok(moved.world.residents[0].position.x > GEOM_EPS);
    assert.ok(Math.abs(moved.world.residents[0].position.z) <= 1e-4);
  });
});

describe('wander destinations', () => {
  test('hash candidates that pass filters are legal and 2.5–6 from origin', () => {
    const world = createWorld(makeSlimes(1));
    const resident = world.residents[0];
    const candidates = wanderCandidatePoints(resident);
    assert.equal(candidates.length, 8);
    let legal = 0;
    for (const dest of candidates) {
      const span = pairDistance(resident.position, dest);
      if (!isValidResidentCenter(dest)) continue;
      if (isInArrivalCorridor(dest)) continue;
      assert.ok(span + GEOM_EPS >= WANDER_MIN_DISTANCE);
      assert.ok(span - GEOM_EPS <= WANDER_MAX_DISTANCE);
      assert.ok(pairDistance(dest, GATE_STAGING) > MIN_SEPARATION - GEOM_EPS);
      legal += 1;
    }
    assert.ok(legal >= 1);
  });

  test('failed reserve does not busy-loop every tick', () => {
    const state = cloneState(createInitialState());
    state.slimes = makeSlimes(4);
    state.world = createWorld(state.slimes);
    const places = [
      ['slime-1', { x: -6, z: 6 }, { x: -4, z: 6 }],
      ['slime-2', { x: 6, z: 6 }, { x: 4, z: 6 }],
      ['slime-3', { x: -6, z: -6 }, { x: -4, z: -6 }],
    ];
    for (const [id, from, dest] of places) {
      const resident = state.world.residents.find((entry) => entry.id === id);
      resident.position = { ...from };
      const route = planRoute({
        world: state.world,
        residentId: id,
        destination: dest,
        permitGate: false,
      });
      assert.ok(route, id);
      resident.route = {
        points: route.points.map((point) => ({ x: point.x, z: point.z })),
        length: route.length,
        startedWorldMs: 0,
        cycleCount: gaitCycleCount(route.length),
        distanceAlong: 0,
      };
      resident.activity = 'wandering';
      resident.nextDecisionWorldMs = 10_000;
    }
    const waiter = state.world.residents.find((resident) => resident.id === 'slime-4');
    waiter.nextDecisionWorldMs = 0;
    waiter.behaviorCounter = 0;
    const startCounter = waiter.behaviorCounter;
    let current = state;
    for (let step = 0; step < 10; step += 1) {
      current.world.timeMs += 50;
      const result = stepWorld(current);
      current.world = result.world;
      assertWorldInvariants(current.world);
    }
    const after = current.world.residents.find((resident) => resident.id === 'slime-4');
    assert.equal(after.route, null);
    assert.ok(after.behaviorCounter - startCounter <= 2);
    assert.ok(after.nextDecisionWorldMs > 0 || after.nextReplanWorldMs >= 500);
  });
});

describe('ten-resident liveliness', () => {
  test(
    '60s no-input sample has ≥2 simultaneous movers and ≥3 completed wanders',
    { timeout: 60_000 },
    () => {
      let state = makeColony(10);
      /** @type {Set<string>} */
      const completed = new Set();
      /** @type {Map<string, string>} */
      const prevActivity = new Map();
      let maxConcurrent = 0;
      const samples = [];

      for (let elapsed = 0; elapsed < 60_000; elapsed += WORLD_STEP_MS) {
        state = advanceActive(state, WORLD_STEP_MS).state;
        assertWorldInvariants(state.world);
        let movers = 0;
        for (const resident of state.world.residents) {
          const prev = prevActivity.get(resident.id);
          if (prev === 'wandering' && resident.activity === 'idle' && resident.route == null) {
            completed.add(resident.id);
          }
          prevActivity.set(resident.id, resident.activity);
          if (resident.route != null && resident.route.points.length >= 2) {
            movers += 1;
          }
        }
        if (movers > maxConcurrent) maxConcurrent = movers;
        if (elapsed % 5000 === 0) {
          for (const resident of state.world.residents) {
            samples.push(
              `${worldTick(state.world)} ${resident.id} ${resident.activity} ${fmt(resident.position.x)} ${fmt(resident.position.z)}`,
            );
          }
        }
      }

      console.log(
        `P2-06 60s: maxConcurrent=${maxConcurrent} completed=${[...completed].join(',') || '(none)'} n=${completed.size}`,
      );
      console.log(`P2-06 60s trace (every 5s, slime-1): ${samples.filter((line) => line.includes('slime-1')).join(' | ')}`);
      assert.ok(maxConcurrent >= 2, `max concurrent ${maxConcurrent}`);
      assert.ok(completed.size >= 3, `completed ${[...completed]}`);
    },
  );

  test(
    '5 min no-input run: every resident completes at least one wander',
    { timeout: 120_000 },
    () => {
      let state = makeColony(10);
      /** @type {Set<string>} */
      const completed = new Set();
      /** @type {Map<string, string>} */
      const prevActivity = new Map();

      for (let chunk = 0; chunk < 60; chunk += 1) {
        const innerStart = state;
        let cursor = innerStart;
        for (let step = 0; step < 100; step += 1) {
          cursor = advanceActive(cursor, WORLD_STEP_MS).state;
          assertWorldInvariants(cursor.world);
          for (const resident of cursor.world.residents) {
            const prev = prevActivity.get(resident.id);
            if (prev === 'wandering' && resident.activity === 'idle' && resident.route == null) {
              completed.add(resident.id);
            }
            prevActivity.set(resident.id, resident.activity);
          }
        }
        state = cursor;
        assert.equal(state.world.timeMs, (chunk + 1) * 5000);
        assert.equal(state.world.carryMs, 0);
      }

      const missing = state.world.residents
        .map((resident) => resident.id)
        .filter((id) => !completed.has(id));
      console.log(
        `P2-06 5min: completed=${[...completed].sort().join(',')} missing=${missing.join(',') || 'none'}`,
      );
      assert.deepEqual(missing, []);
    },
  );
});

/**
 * @param {import('../src/world/state.mjs').WorldState} world
 */
function worldTick(world) {
  return world.timeMs;
}

/**
 * @param {number} value
 */
function fmt(value) {
  return value.toFixed(2);
}

describe('movement module isolation', () => {
  test('behavior/step/gait/hash do not import DOM, Three, Date, Math.random, or scene', () => {
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
    for (const file of ['behavior.mjs', 'step.mjs', 'gait.mjs', 'hash.mjs']) {
      const source = readFileSync(join(worldDir, file), 'utf8');
      for (const pattern of forbidden) {
        assert.equal(pattern.test(source), false, `${file} ${pattern}`);
      }
    }
  });
});
