import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { GEOM_EPS, MAX_ACTIVE_ROUTES, SLIME_NAMES } from '../src/core/balance.mjs';
import {
  pointToSegmentDistance,
  polylineLength,
  segmentSegmentDistance,
} from '../src/world/geom.mjs';
import {
  GATE_INSIDE_WAYPOINT,
  GATE_STAGING,
  HOME_SLOTS,
  MIN_SEPARATION,
  PROP_MOVEMENT_RADIUS,
  STATIC_PROPS,
  isInArrivalCorridor,
  isValidResidentCenter,
} from '../src/world/layout.mjs';
import {
  corridorsClear,
  explainRouteBlock,
  MAX_ROUTE_POINTS,
  planRoute,
  planRouteWithDiag,
  pointClearsStations,
  rebuildReservations,
  segmentClearsStatic,
} from '../src/world/navigation.mjs';
import { cloneWorld, createWorld } from '../src/world/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const worldDir = join(here, '../src/world');

const BLOOM = STATIC_PROPS.find((prop) => prop.id === 'bloom');

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
 * @param {import('../src/world/state.mjs').WorldState} world
 */
function freezeWorld(world) {
  Object.freeze(world.foods);
  for (const food of world.foods) {
    Object.freeze(food.target);
    Object.freeze(food);
  }
  Object.freeze(world.residents);
  for (const resident of world.residents) {
    Object.freeze(resident.position);
    if (resident.route) {
      for (const point of resident.route.points) Object.freeze(point);
      Object.freeze(resident.route.points);
      Object.freeze(resident.route);
    }
    Object.freeze(resident);
  }
  return Object.freeze(world);
}

/**
 * @param {{ points: { x: number, z: number }[], length: number }} result
 */
function asSavedRoute(result) {
  return {
    points: result.points.map((point) => ({ x: point.x, z: point.z })),
    length: result.length,
    startedWorldMs: 0,
    cycleCount: Math.max(1, Math.ceil(result.length)),
    distanceAlong: 0,
  };
}

/**
 * @param {import('../src/world/state.mjs').WorldState} world
 * @param {string} residentId
 * @param {{ x: number, z: number }} position
 */
function place(world, residentId, position) {
  const resident = world.residents.find((entry) => entry.id === residentId);
  resident.position = { x: position.x, z: position.z };
}

/**
 * @param {readonly { x: number, z: number }[]} points
 * @param {{ x: number, z: number }} prop
 * @param {number} radius
 */
function pathEntersDisk(points, prop, radius) {
  for (let index = 1; index < points.length; index += 1) {
    if (pointToSegmentDistance(prop, points[index - 1], points[index]) < radius + GEOM_EPS) {
      return true;
    }
  }
  return false;
}

describe('planRoute direct and endpoints', () => {
  test('clear interior pair is a start–end segment with exact hypot length', () => {
    const world = createWorld(makeSlimes(1));
    place(world, 'slime-1', { x: 0, z: 0 });
    const start = { ...world.residents[0].position };
    const destination = { x: 3, z: 4 };
    const frozen = freezeWorld(world);
    const destFrozen = Object.freeze({ ...destination });
    const route = planRoute({
      world: frozen,
      residentId: 'slime-1',
      destination: destFrozen,
      permitGate: false,
    });
    assert.ok(route);
    assert.equal(route.points.length, 2);
    assert.deepEqual(route.points[0], start);
    assert.deepEqual(route.points[1], destination);
    assert.equal(route.length, Math.hypot(3, 4));
    assert.notEqual(route.points, frozen.residents[0].route);
    assert.notEqual(route.points[0], frozen.residents[0].position);
    route.points[0].x = 99;
    assert.equal(frozen.residents[0].position.x, 0);
    assert.equal(destFrozen.x, 3);
  });

  test('start ≈ destination returns a 1-point route of length 0', () => {
    const world = freezeWorld(createWorld(makeSlimes(1)));
    const route = planRoute({
      world,
      residentId: 'slime-1',
      destination: { x: HOME_SLOTS[0].x, z: HOME_SLOTS[0].z },
      permitGate: false,
    });
    assert.ok(route);
    assert.equal(route.points.length, 1);
    assert.deepEqual(route.points[0], HOME_SLOTS[0]);
    assert.equal(route.length, 0);
  });
});

describe('prop detour', () => {
  test('path around bloom keep-out exists, avoids the inflated disk, and is longer than the chord', () => {
    const start = { x: 10.2, z: -7 };
    const destination = { x: 10.2, z: -2 };
    const direct = Math.hypot(0, 5);
    assert.equal(segmentClearsStatic(start, destination, false), false);
    assert.ok(
      pointToSegmentDistance(BLOOM, start, destination) < PROP_MOVEMENT_RADIUS + GEOM_EPS,
    );

    const world = createWorld(makeSlimes(1));
    place(world, 'slime-1', start);
    const snapshot = cloneWorld(world);
    const frozen = freezeWorld(world);
    const route = planRoute({
      world: frozen,
      residentId: 'slime-1',
      destination,
      permitGate: false,
    });
    assert.ok(route);
    assert.deepEqual(route.points[0], start);
    assert.deepEqual(route.points[route.points.length - 1], destination);
    assert.ok(route.points.length >= 2);
    assert.ok(route.points.length <= MAX_ROUTE_POINTS);
    assert.ok(route.length > direct + GEOM_EPS);
    assert.equal(pathEntersDisk(route.points, BLOOM, PROP_MOVEMENT_RADIUS), false);
    assert.deepEqual(frozen.residents[0].position, snapshot.residents[0].position);
    assert.equal(frozen.residents[0].route, null);
  });
});

describe('diagonal corner', () => {
  test('a diagonal that clips bloom is rejected; planner goes around without a corner-cut', () => {
    const start = { x: 6.45, z: -6.55 };
    const destination = { x: 10.2, z: -2.8 };
    assert.equal(isValidResidentCenter(start), true);
    assert.equal(isValidResidentCenter(destination), true);
    assert.equal(segmentClearsStatic(start, destination, false), false);

    const elbow = { x: start.x, z: destination.z };
    assert.equal(isValidResidentCenter(elbow), true);
    assert.equal(segmentClearsStatic(start, elbow, false), true);
    assert.equal(segmentClearsStatic(elbow, destination, false), true);

    const world = createWorld(makeSlimes(1));
    place(world, 'slime-1', start);
    const route = planRoute({
      world: freezeWorld(world),
      residentId: 'slime-1',
      destination,
      permitGate: false,
    });
    assert.ok(route);
    assert.deepEqual(route.points[0], start);
    assert.deepEqual(route.points[route.points.length - 1], destination);
    assert.equal(pathEntersDisk(route.points, BLOOM, PROP_MOVEMENT_RADIUS), false);
    assert.equal(
      route.points.length === 2 &&
        route.points[0].x === start.x &&
        route.points[1].x === destination.x,
      false,
      'must not keep the blocked diagonal as the sole segment',
    );
    for (let index = 1; index < route.points.length; index += 1) {
      const a = route.points[index - 1];
      const b = route.points[index];
      const dx = Math.abs(a.x - b.x);
      const dz = Math.abs(a.z - b.z);
      const shortDiagonal =
        dx > GEOM_EPS &&
        dz > GEOM_EPS &&
        dx <= 0.75 + 1e-6 &&
        dz <= 0.75 + 1e-6;
      if (!shortDiagonal) continue;
      const orthoX = { x: b.x, z: a.z };
      const orthoZ = { x: a.x, z: b.z };
      assert.equal(
        isValidResidentCenter(orthoX) && isValidResidentCenter(orthoZ),
        true,
        `corner-cut segment ${a.x},${a.z} → ${b.x},${b.z}`,
      );
    }
  });
});

describe('reservations', () => {
  test('crossing routes: second plan is null (reservation), proven with segment-segment', () => {
    const a = { x: -10.5, z: 0 };
    const b = { x: 10.5, z: 0 };
    const c = { x: 0, z: -6 };
    const d = { x: 0, z: 6 };
    assert.ok(segmentSegmentDistance(a, b, c, d) < GEOM_EPS);

    const world = createWorld(makeSlimes(2));
    place(world, 'slime-1', a);
    place(world, 'slime-2', c);
    const first = planRoute({
      world,
      residentId: 'slime-1',
      destination: b,
      permitGate: false,
    });
    assert.ok(first);
    assert.ok(segmentSegmentDistance(first.points[0], first.points[1], c, d) < GEOM_EPS);
    world.residents[0].route = asSavedRoute(first);
    const frozen = freezeWorld(world);
    const second = planRouteWithDiag({
      world: frozen,
      residentId: 'slime-2',
      destination: d,
      permitGate: false,
    });
    assert.equal(second.route, null);
    assert.equal(second.reason, 'reservation');
    assert.equal(corridorsClear(first.points, [c, d]), false);
  });

  test('opposing routes that share a corridor conflict', () => {
    const west = { x: -10.5, z: 0 };
    const east = { x: 10.5, z: 0 };
    const opposite = [east, west];
    assert.equal(corridorsClear([west, east], opposite), false);
    assert.ok(segmentSegmentDistance(west, east, east, west) < GEOM_EPS);

    const world = createWorld(makeSlimes(2));
    place(world, 'slime-1', west);
    place(world, 'slime-2', { x: 10.5, z: 6 });
    const first = planRoute({
      world,
      residentId: 'slime-1',
      destination: east,
      permitGate: false,
    });
    assert.ok(first);
    world.residents[0].route = asSavedRoute(first);
    const second = planRouteWithDiag({
      world: freezeWorld(world),
      residentId: 'slime-2',
      destination: west,
      permitGate: false,
    });
    assert.equal(second.route, null);
    assert.equal(second.reason, 'reservation');
  });

  test('disjoint simultaneous paths both succeed and stay ≤ 3 reservations', () => {
    const world = createWorld(makeSlimes(2));
    place(world, 'slime-1', { x: -6, z: 6 });
    place(world, 'slime-2', { x: 6, z: -6 });
    const first = planRoute({
      world,
      residentId: 'slime-1',
      destination: { x: -3, z: 6 },
      permitGate: false,
    });
    assert.ok(first);
    world.residents[0].route = asSavedRoute(first);
    const second = planRoute({
      world,
      residentId: 'slime-2',
      destination: { x: 3, z: -6 },
      permitGate: false,
    });
    assert.ok(second);
    world.residents[1].route = asSavedRoute(second);
    assert.equal(corridorsClear(first.points, second.points), true);
    const rebuilt = rebuildReservations(world);
    assert.equal(rebuilt.length, 2);
    assert.ok(rebuilt.length <= MAX_ACTIVE_ROUTES);
  });
});

describe('gate permissions', () => {
  test('permitGate false cannot path to staging; true can leave the corridor', () => {
    const world = createWorld(makeSlimes(1));
    place(world, 'slime-1', GATE_STAGING);
    const denied = planRouteWithDiag({
      world: freezeWorld(cloneWorld(world)),
      residentId: 'slime-1',
      destination: GATE_INSIDE_WAYPOINT,
      permitGate: false,
    });
    assert.equal(denied.route, null);
    assert.equal(denied.reason, 'gate-denied');

    const allowed = planRoute({
      world: freezeWorld(cloneWorld(world)),
      residentId: 'slime-1',
      destination: GATE_INSIDE_WAYPOINT,
      permitGate: true,
    });
    assert.ok(allowed);
    assert.deepEqual(allowed.points[0], GATE_STAGING);
    assert.deepEqual(allowed.points[allowed.points.length - 1], GATE_INSIDE_WAYPOINT);
    assert.equal(isValidResidentCenter(GATE_STAGING), false);
    assert.equal(isInArrivalCorridor(GATE_STAGING), true);
  });

  test('wanderer from a home pad cannot enter the arrival corridor', () => {
    const world = freezeWorld(createWorld(makeSlimes(1)));
    const dest = Object.freeze({ x: 0, z: -10 });
    assert.equal(isInArrivalCorridor(dest), true);
    const blocked = planRouteWithDiag({
      world,
      residentId: 'slime-1',
      destination: dest,
      permitGate: false,
    });
    assert.equal(blocked.route, null);
    assert.equal(blocked.reason, 'gate-denied');
    assert.equal(
      explainRouteBlock({
        world,
        residentId: 'slime-1',
        destination: GATE_STAGING,
        permitGate: false,
      }),
      'gate-denied',
    );
  });
});

describe('exhausted search and invalid ends', () => {
  test('keep-out and out-of-domain destinations return null without throwing', () => {
    const world = freezeWorld(createWorld(makeSlimes(1)));
    const intoBloom = planRouteWithDiag({
      world,
      residentId: 'slime-1',
      destination: { x: BLOOM.x, z: BLOOM.z },
      permitGate: false,
    });
    assert.equal(intoBloom.route, null);
    assert.equal(intoBloom.reason, 'static');

    const outside = planRouteWithDiag({
      world,
      residentId: 'slime-1',
      destination: { x: 0, z: 20 },
      permitGate: false,
    });
    assert.equal(outside.route, null);
    assert.equal(outside.reason, 'invalid-end');

    const nan = planRoute({
      world,
      residentId: 'slime-1',
      destination: { x: Number.NaN, z: 0 },
      permitGate: false,
    });
    assert.equal(nan, null);
  });
});

describe('rebuildReservations and capacity', () => {
  test('three saved routes rebuild three reservations; a fourth plan fails capacity', () => {
    const world = createWorld(makeSlimes(4));
    place(world, 'slime-1', { x: -6, z: 6 });
    place(world, 'slime-2', { x: 6, z: 6 });
    place(world, 'slime-3', { x: -6, z: -6 });
    place(world, 'slime-4', { x: 6, z: -6 });
    const plans = [
      ['slime-1', { x: -4, z: 6 }],
      ['slime-2', { x: 4, z: 6 }],
      ['slime-3', { x: -4, z: -6 }],
    ];
    for (const [id, destination] of plans) {
      const route = planRoute({
        world,
        residentId: id,
        destination,
        permitGate: false,
      });
      assert.ok(route, id);
      world.residents.find((resident) => resident.id === id).route = asSavedRoute(route);
    }
    const rebuilt = rebuildReservations(world);
    assert.equal(rebuilt.length, 3);
    assert.deepEqual(
      rebuilt.map((corridor) => corridor.residentId),
      ['slime-1', 'slime-2', 'slime-3'],
    );

    const fourth = planRouteWithDiag({
      world: freezeWorld(cloneWorld(world)),
      residentId: 'slime-4',
      destination: { x: 4, z: -6 },
      permitGate: false,
    });
    assert.equal(fourth.route, null);
    assert.equal(fourth.reason, 'capacity');
    assert.equal(
      pointClearsStations({ x: 4, z: -6 }, world, 'slime-4'),
      true,
      'geometrically clear except for mover cap',
    );
  });

  test('rebuild ignores a fourth saved route instead of inventing a fourth mover', () => {
    const world = createWorld(makeSlimes(4));
    for (let index = 0; index < 4; index += 1) {
      const x = index < 2 ? -6 : 6;
      const z = index % 2 === 0 ? 6 : -6;
      world.residents[index].route = {
        points: [
          { x, z },
          { x: x + (x < 0 ? 2 : -2), z },
        ],
        length: 2,
        startedWorldMs: 0,
        cycleCount: 2,
        distanceAlong: 0,
      };
    }
    const rebuilt = rebuildReservations(world);
    assert.equal(rebuilt.length, MAX_ACTIVE_ROUTES);
    assert.equal(
      rebuilt.some((corridor) => corridor.residentId === 'slime-4'),
      false,
    );
  });
});

describe('purity and bounds', () => {
  test('planRoute does not mutate world; outputs are new arrays; waypoints ≤ 128', () => {
    const world = createWorld(makeSlimes(1));
    place(world, 'slime-1', { x: -8, z: -6 });
    const before = JSON.stringify(world);
    const frozen = freezeWorld(world);
    const route = planRoute({
      world: frozen,
      residentId: 'slime-1',
      destination: { x: 8, z: 6 },
      permitGate: false,
    });
    assert.ok(route);
    assert.ok(Array.isArray(route.points));
    assert.ok(route.points.length <= MAX_ROUTE_POINTS);
    assert.deepEqual(route.points[0], { x: -8, z: -6 });
    assert.deepEqual(route.points[route.points.length - 1], { x: 8, z: 6 });
    assert.equal(Math.abs(route.length - polylineLength(route.points)) < 1e-9, true);
    assert.equal(JSON.stringify(frozen), before);
    const again = planRoute({
      world: frozen,
      residentId: 'slime-1',
      destination: { x: 8, z: 6 },
      permitGate: false,
    });
    assert.notEqual(again.points, route.points);
  });
});

describe('navigation module isolation', () => {
  test('navigation.mjs and geom.mjs do not import DOM, Three, Date, Math.random, scene, or core/advance', () => {
    const forbidden = [
      /\bdocument\b/,
      /\bwindow\b/,
      /\blocalStorage\b/,
      /from\s+['"][^'"]*three/i,
      /from\s+['"][^'"]*scene\//,
      /from\s+['"][^'"]*core\/advance/,
      /performance\s*\./,
      /\bDate\s*\./,
      /Math\s*\.\s*random/,
    ];
    for (const file of ['navigation.mjs', 'geom.mjs']) {
      const source = readFileSync(join(worldDir, file), 'utf8');
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
