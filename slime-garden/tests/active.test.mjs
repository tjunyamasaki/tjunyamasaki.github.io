import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advance, advancePassive } from '../src/core/advance.mjs';
import { advanceActive, planActiveArrival, stepWorld } from '../src/core/active.mjs';
import {
  GEOM_EPS,
  MICRO_PER_GLOW,
  OFFLINE_CAP_MS,
  SLIME_NAMES,
  WORLD_STEP_MS,
} from '../src/core/balance.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';
import { GATE_STAGING } from '../src/world/layout.mjs';
import { createWorld } from '../src/world/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');
const worldDir = join(here, '../src/world');

const MAX_ACTIVE_ELAPSED_MS = 5000;

/**
 * @param {object} [patch]
 */
function makeCrossingState(patch = {}) {
  const state = cloneState(createInitialState());
  state.totalFeeds = 6;
  state.lifetimeGlowMicro = 11_900_000;
  state.glowMicro = 0;
  state.incomeRemainder = 0;
  state.simTimeMs = 0;
  state.slimes[0].feedCount = 6;
  state.berries = 12;
  state.nextBerryAtMs = null;
  Object.assign(state, patch);
  return state;
}

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

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}

describe('advanceActive argument checks', () => {
  test('rejects non-object state, non-integer, negative, above 5000, and NaN', () => {
    const fresh = createInitialState();
    assert.throws(() => advanceActive(null, 0), TypeError);
    assert.throws(() => advanceActive(undefined, 0), TypeError);
    assert.throws(() => advanceActive(1, 0), TypeError);
    assert.throws(() => advanceActive('state', 0), TypeError);
    assert.throws(() => advanceActive([], 0), TypeError);
    assert.throws(() => advanceActive(fresh, NaN), TypeError);
    assert.throws(() => advanceActive(fresh, '1'), TypeError);
    assert.throws(() => advanceActive(fresh, 1.5), RangeError);
    assert.throws(() => advanceActive(fresh, -1), RangeError);
    assert.throws(() => advanceActive(fresh, MAX_ACTIVE_ELAPSED_MS + 1), RangeError);
    assert.throws(() => advanceActive(fresh, Number.POSITIVE_INFINITY), RangeError);
    assert.doesNotThrow(() => advanceActive(fresh, 0));
    assert.doesNotThrow(() => advanceActive(fresh, MAX_ACTIVE_ELAPSED_MS));
  });

  test('advance (passive) still accepts the eight-hour cap', () => {
    assert.doesNotThrow(() => advance(createInitialState(), OFFLINE_CAP_MS));
    assert.throws(() => advanceActive(createInitialState(), OFFLINE_CAP_MS), RangeError);
  });
});

describe('advanceActive zero elapsed', () => {
  test('zero elapsed may join ready companions but does not move or complete meals', () => {
    const input = deepFreeze(makeCrossingState({ lifetimeGlowMicro: 12_000_000 }));
    const snapshot = structuredClone(input);
    const result = advanceActive(input, 0);
    assert.deepEqual(input, snapshot);
    assert.equal(result.state.slimes.length, 2);
    assert.equal(result.summary.companionsAdded[0], 'slime-2');
    assert.equal(result.summary.mealsCompleted, 0);
    assert.equal(result.state.world.timeMs, 0);
    assert.equal(result.state.world.carryMs, 0);
    const joined = result.state.world.residents.find((resident) => resident.id === 'slime-2');
    assert.ok(joined);
    assert.equal(joined.activity, 'idle');
    assert.equal(joined.route, null);
    assert.notEqual(joined.position.x, GATE_STAGING.x);
    assert.notEqual(joined.position.z, GATE_STAGING.z);
    const first = result.state.world.residents[0];
    assert.deepEqual(first.position, { x: 0, z: 2 });
  });

  test('zero elapsed after motion leaves positions and routes unchanged', () => {
    let state = cloneState(createInitialState());
    state = advanceActive(state, 2500).state;
    const before = structuredClone(state.world);
    const result = advanceActive(deepFreeze(state), 0);
    assert.equal(result.state.world.timeMs, before.timeMs);
    assert.equal(result.state.world.carryMs, before.carryMs);
    assert.equal(result.state.world.residents[0].activity, before.residents[0].activity);
    assert.equal(
      result.state.world.residents[0].route?.distanceAlong ?? null,
      before.residents[0].route?.distanceAlong ?? null,
    );
    assert.ok(
      Math.abs(result.state.world.residents[0].position.x - before.residents[0].position.x) <=
        GEOM_EPS,
    );
    assert.ok(
      Math.abs(result.state.world.residents[0].position.z - before.residents[0].position.z) <=
        GEOM_EPS,
    );
  });
});

describe('advanceActive carry', () => {
  test('16+17+17 fills a 50 ms world step exactly once', () => {
    const fresh = deepFreeze(createInitialState());
    const a = advanceActive(fresh, 16);
    assert.equal(a.state.world.timeMs, 0);
    assert.equal(a.state.world.carryMs, 16);
    const b = advanceActive(a.state, 17);
    assert.equal(b.state.world.timeMs, 0);
    assert.equal(b.state.world.carryMs, 33);
    const c = advanceActive(b.state, 17);
    assert.equal(c.state.world.timeMs, WORLD_STEP_MS);
    assert.equal(c.state.world.carryMs, 0);
    assert.equal(c.state.simTimeMs, 50);
  });
});

describe('advanceActive economy', () => {
  test('fresh idle 15s via three 5s calls earns 1.5 Glow and stays at one resident', () => {
    let state = createInitialState();
    let glow = 0;
    for (let index = 0; index < 3; index += 1) {
      const result = advanceActive(state, 5000);
      glow += result.summary.glowEarnedMicro;
      state = result.state;
    }
    assert.equal(state.simTimeMs, 15_000);
    assert.equal(state.glowMicro, 1.5 * MICRO_PER_GLOW);
    assert.equal(state.lifetimeGlowMicro, 1.5 * MICRO_PER_GLOW);
    assert.equal(glow, 1.5 * MICRO_PER_GLOW);
    assert.equal(state.slimes.length, 1);
    assert.equal(state.world.residents.length, 1);
    assert.equal(state.world.timeMs, 15_000);
    assert.equal(state.world.carryMs, 0);
    const passive = advancePassive(createInitialState(), 15_000);
    assert.equal(state.glowMicro, passive.state.glowMicro);
    assert.equal(state.berries, passive.state.berries);
  });
});

describe('advanceActive chunk equivalence', () => {
  /**
   * @param {import('../src/core/state.mjs').GameState} a
   * @param {import('../src/core/state.mjs').GameState} b
   */
  function assertWorldClose(a, b) {
    assert.equal(a.simTimeMs, b.simTimeMs);
    assert.equal(a.glowMicro, b.glowMicro);
    assert.equal(a.lifetimeGlowMicro, b.lifetimeGlowMicro);
    assert.equal(a.incomeRemainder, b.incomeRemainder);
    assert.equal(a.berries, b.berries);
    assert.equal(a.world.timeMs, b.world.timeMs);
    assert.equal(a.world.carryMs, b.world.carryMs);
    assert.equal(a.world.residents.length, b.world.residents.length);
    for (let index = 0; index < a.world.residents.length; index += 1) {
      const left = a.world.residents[index];
      const right = b.world.residents[index];
      assert.equal(left.id, right.id);
      assert.equal(left.activity, right.activity);
      assert.equal(left.behaviorCounter, right.behaviorCounter);
      assert.ok(Math.abs(left.position.x - right.position.x) <= GEOM_EPS, left.id);
      assert.ok(Math.abs(left.position.z - right.position.z) <= GEOM_EPS, left.id);
      const leftRoute = left.route;
      const rightRoute = right.route;
      if (leftRoute == null || rightRoute == null) {
        assert.equal(leftRoute, rightRoute, left.id);
        continue;
      }
      assert.equal(leftRoute.cycleCount, rightRoute.cycleCount);
      assert.equal(leftRoute.startedWorldMs, rightRoute.startedWorldMs);
      assert.ok(Math.abs(leftRoute.distanceAlong - rightRoute.distanceAlong) <= GEOM_EPS);
      assert.equal(leftRoute.points.length, rightRoute.points.length);
      for (let p = 0; p < leftRoute.points.length; p += 1) {
        assert.ok(Math.abs(leftRoute.points[p].x - rightRoute.points[p].x) <= GEOM_EPS);
        assert.ok(Math.abs(leftRoute.points[p].z - rightRoute.points[p].z) <= GEOM_EPS);
      }
    }
  }

  /**
   * @param {import('../src/core/state.mjs').GameState} state
   * @param {number} total
   * @param {number[]} parts
   */
  function split(state, total, parts) {
    const sum = parts.reduce((acc, part) => acc + part, 0);
    assert.equal(sum, total);
    const combined = advanceActive(state, total).state;
    let sequential = state;
    for (const part of parts) {
      sequential = advanceActive(sequential, part).state;
    }
    assertWorldClose(combined, sequential);
  }

  test('partitions 16+17, 50+50, and 1+4999 match combined advances', () => {
    const fresh = cloneState(createInitialState());
    split(fresh, 33, [16, 17]);
    split(fresh, 100, [50, 50]);
    split(fresh, 5000, [1, 4999]);
  });
});

describe('planActiveArrival', () => {
  test('gate success places the new id at staging with an arriving route', () => {
    const state = cloneState(createInitialState());
    state.slimes = makeSlimes(2);
    state.world = createWorld(state.slimes);
    const input = deepFreeze(state);
    const snapshot = structuredClone(input);
    const next = planActiveArrival(input, 'slime-2');
    assert.deepEqual(input, snapshot);
    const arriving = next.world.residents.find((resident) => resident.id === 'slime-2');
    assert.equal(arriving.activity, 'arriving');
    assert.ok(arriving.route);
    assert.ok(arriving.route.points.length >= 2);
    assert.ok(Math.abs(arriving.position.x - GATE_STAGING.x) <= GEOM_EPS);
    assert.ok(Math.abs(arriving.position.z - GATE_STAGING.z) <= GEOM_EPS);
    const host = next.world.residents.find((resident) => resident.id === 'slime-1');
    assert.deepEqual(host.position, { x: 0, z: 2 });
    assert.equal(host.route, null);
  });

  test('occupied gate falls back to the roster home/free point with no route', () => {
    let state = cloneState(createInitialState());
    state.slimes = makeSlimes(3);
    state.world = createWorld(state.slimes);
    state = planActiveArrival(state, 'slime-2');
    const occupied = state.world.residents.find((resident) => resident.id === 'slime-2');
    assert.equal(occupied.activity, 'arriving');
    const home = { ...state.world.residents.find((resident) => resident.id === 'slime-3').position };
    const fallback = planActiveArrival(state, 'slime-3');
    const extra = fallback.world.residents.find((resident) => resident.id === 'slime-3');
    assert.equal(extra.activity, 'idle');
    assert.equal(extra.route, null);
    assert.ok(Math.abs(extra.position.x - home.x) <= GEOM_EPS);
    assert.ok(Math.abs(extra.position.z - home.z) <= GEOM_EPS);
    const still = fallback.world.residents.find((resident) => resident.id === 'slime-2');
    assert.equal(still.activity, 'arriving');
  });
});

describe('stepWorld food no-op', () => {
  test('empty foods produce no meals', () => {
    const state = cloneState(createInitialState());
    state.world.timeMs = 50;
    const result = stepWorld(state);
    assert.deepEqual(result.meals, []);
    assert.deepEqual(result.world.foods, []);
    assert.notEqual(result.world, state.world);
  });
});

describe('active module isolation', () => {
  test('active.mjs does not import DOM, Three, Date, Math.random, or performance', () => {
    const source = readFileSync(join(coreDir, 'active.mjs'), 'utf8');
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
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, `${pattern}`);
    }
  });

  test('world gait/hash/behavior/step stay free of DOM, Three, Date, and randomness', () => {
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
