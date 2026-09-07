import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createState, restoreState, snapPlayerPose, step } from '../core/state.mjs';
import { generateWorld } from '../world/generate.mjs';
import { serializeSnapshot, validateSnapshot } from '../storage/schema.mjs';
import { BUILDINGS, CATALOG, LEGACY_BUILDINGS, buildingDef, footprintCells } from '../data/buildings.mjs';
import { HARVEST } from '../data/harvest.mjs';
import { APPROACH_PADDING, KEEPER_RADIUS, STRUCTURE_CAP, TICK_SECONDS } from '../data/tuning.mjs';
import { describePlacement, describeStructure, structureById } from '../core/building.mjs';
import { resourceById, syncObstacles } from '../core/resources.mjs';
import { buildNav, findPath, hitsObstacle, resolveWalkPosition } from '../world/navigation.mjs';

function playing(seed = 'hearthwild-review-a') {
  const descriptor = generateWorld(seed);
  const state = createState(descriptor, { name: 'Review A' });
  applyCommand(state, { type: 'enter' });
  return { descriptor, state };
}

function stock(state, extra = {}) {
  state.inventory.wood = extra.wood ?? 40;
  state.inventory.stone = extra.stone ?? 20;
}

function ticksFor(seconds) {
  return Math.ceil(seconds / TICK_SECONDS) + 2;
}

function harvest(state, resource, action = 'harvest') {
  const dist = resource.radius + KEEPER_RADIUS + APPROACH_PADDING;
  state.player.x = resource.x + dist;
  state.player.z = resource.z;
  state.player.moving = false;
  snapPlayerPose(state);
  const started = applyCommand(state, { type: 'startAction', targetId: resource.id, action });
  assert.equal(started.ok, true, started.reason);
  const events = [];
  const limit = ticksFor(state.action.duration);
  for (let i = 0; i < limit; i++) {
    events.push(...step(state, {}, TICK_SECONDS));
    if (events.some(event => event.type === 'harvested' || event.type === 'cleared')) break;
  }
  return events;
}

function stand(state, x, z) {
  state.player.x = x;
  state.player.z = z;
  state.player.moving = false;
  snapPlayerPose(state);
}

test('workbench 2×1 occupancy rotates by 90-degree steps', () => {
  assert.deepEqual(footprintCells('workbench', 0, 0, 0), [{ gx: 0, gz: 0 }, { gx: 1, gz: 0 }]);
  assert.deepEqual(footprintCells('workbench', 0, 0, 1), [{ gx: 0, gz: 0 }, { gx: 0, gz: 1 }]);
  assert.deepEqual(footprintCells('workbench', 0, 0, 2), [{ gx: 0, gz: 0 }, { gx: -1, gz: 0 }]);
  assert.deepEqual(footprintCells('workbench', 0, 0, 3), [{ gx: 0, gz: 0 }, { gx: 0, gz: -1 }]);
  assert.deepEqual(footprintCells('floor', 4, -2, 1), [{ gx: 4, gz: -2 }]);
});

test('preview and invalid or repeated confirm spend nothing; a valid place charges once', () => {
  const { state } = playing();
  stock(state);
  stand(state, 0, 0);
  const before = { wood: state.inventory.wood, stone: state.inventory.stone };
  const preview = describePlacement(state, { kind: 'workbench', gx: 2, gz: 0, rotation: 0 });
  assert.equal(preview.ok, true);
  assert.equal(state.inventory.wood, before.wood);
  assert.equal(state.inventory.stone, before.stone);

  const tooFar = applyCommand(state, { type: 'place', kind: 'workbench', gx: 12, gz: 0, rotation: 0 });
  assert.equal(tooFar.ok, false);
  assert.equal(tooFar.reason, 'too-far');
  assert.equal(state.inventory.wood, before.wood);
  assert.equal(state.structures.length, 0);

  const placed = applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 0 });
  assert.equal(placed.ok, true, placed.reason);
  assert.equal(state.inventory.wood, before.wood - 8);
  assert.equal(state.inventory.stone, before.stone - 4);
  assert.equal(state.structures.length, 1);
  assert.deepEqual(state.structures[0].paidCost, { wood: 8, stone: 4 });

  const again = applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 0 });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'occupied-solid');
  assert.equal(state.inventory.wood, before.wood - 8);
  assert.equal(state.structures.length, 1);
});

test('floor may sit under the keeper; a workbench may not', () => {
  const { state } = playing();
  stock(state);
  stand(state, 0.1, -0.1);
  const floor = applyCommand(state, { type: 'place', kind: 'floor', gx: 0, gz: 0, rotation: 0 });
  assert.equal(floor.ok, true, floor.reason);
  assert.equal(state.inventory.wood, 38);
  stand(state, 2.15, 0);
  const bench = applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 0 });
  assert.equal(bench.ok, false);
  assert.equal(bench.reason, 'player');
  assert.equal(state.inventory.wood, 38);
  assert.equal(state.inventory.stone, 20);
});

test('path and floor exclude each other; workbench rejects partial floor support', () => {
  const { state } = playing();
  stock(state);
  stand(state, 0, 0);
  assert.equal(applyCommand(state, { type: 'place', kind: 'floor', gx: 1, gz: 1, rotation: 0 }).ok, true);
  const path = applyCommand(state, { type: 'place', kind: 'path', gx: 1, gz: 1, rotation: 0 });
  assert.equal(path.ok, false);
  assert.equal(path.reason, 'occupied-ground');
  assert.equal(applyCommand(state, { type: 'place', kind: 'floor', gx: 2, gz: 1, rotation: 0 }).ok, true);
  const partial = applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 1, rotation: 1 });
  assert.equal(partial.ok, false);
  assert.equal(partial.reason, 'partial-support');
  assert.equal(applyCommand(state, { type: 'place', kind: 'floor', gx: 2, gz: 2, rotation: 0 }).ok, true);
  const supported = applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 1, rotation: 1 });
  assert.equal(supported.ok, true, supported.reason);
});

test('moving keeps the id and paid cost; dismantle refunds the original payment', () => {
  const { state } = playing();
  stock(state);
  stand(state, 0, 0);
  const placed = applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 0 });
  const id = placed.structure.id;
  const paid = { ...placed.structure.paidCost };
  const moved = applyCommand(state, { type: 'move', id, gx: 2, gz: 1, rotation: 1 });
  assert.equal(moved.ok, true, moved.reason);
  assert.equal(state.structures.length, 1);
  assert.equal(state.structures[0].id, id);
  assert.deepEqual(state.structures[0].paidCost, paid);
  assert.equal(state.inventory.wood, 32);
  const blocked = applyCommand(state, { type: 'move', id, gx: 40, gz: 0, rotation: 0 });
  assert.equal(blocked.ok, false);
  assert.equal(state.structures[0].gx, 2);
  assert.equal(state.structures[0].gz, 1);
  const removed = applyCommand(state, { type: 'remove', id });
  assert.equal(removed.ok, true, removed.reason);
  assert.equal(state.structures.length, 0);
  assert.equal(state.inventory.wood, 40);
  assert.equal(state.inventory.stone, 20);
});

test('floors that support a workbench cannot be moved or removed until it is gone', () => {
  const { state } = playing();
  stock(state);
  stand(state, 0, 0);
  const a = applyCommand(state, { type: 'place', kind: 'floor', gx: 1, gz: 0, rotation: 0 });
  const b = applyCommand(state, { type: 'place', kind: 'floor', gx: 2, gz: 0, rotation: 0 });
  applyCommand(state, { type: 'place', kind: 'workbench', gx: 1, gz: 0, rotation: 0 });
  assert.equal(applyCommand(state, { type: 'remove', id: a.structure.id }).reason, 'has-dependent');
  assert.equal(applyCommand(state, { type: 'move', id: b.structure.id, gx: 1, gz: 2, rotation: 0 }).reason, 'has-dependent');
  assert.equal(state.structures.length, 3);
  const bench = state.structures.find(item => item.kind === 'workbench');
  assert.equal(applyCommand(state, { type: 'remove', id: bench.id }).ok, true);
  assert.equal(applyCommand(state, { type: 'remove', id: a.structure.id }).ok, true);
  assert.equal(applyCommand(state, { type: 'remove', id: b.structure.id }).ok, true);
  assert.equal(state.inventory.wood, 40);
});

test('protected and depleted nodes cannot be covered; an unprotected stump can, and stays a stump', () => {
  const { state } = playing();
  stock(state);
  const copper = state.resources.find(item => item.kind === 'copper' && item.protected);
  harvest(state, copper);
  assert.equal(copper.phase, 'depleted');
  stand(state, copper.x, copper.z + 1.2);
  const overCopper = applyCommand(state, {
    type: 'place',
    kind: 'floor',
    gx: Math.round(copper.x),
    gz: Math.round(copper.z),
    rotation: 0,
  });
  assert.equal(overCopper.ok, false);
  assert.equal(overCopper.reason, 'protected');

  const tree = state.resources.find(item => item.kind === 'tree' && !item.protected);
  harvest(state, tree);
  assert.equal(tree.phase, 'stump');
  stand(state, tree.x, tree.z + 1.2);
  const overStump = applyCommand(state, {
    type: 'place',
    kind: 'floor',
    gx: Math.round(tree.x),
    gz: Math.round(tree.z),
    rotation: 0,
  });
  assert.equal(overStump.ok, true, overStump.reason);
  for (let i = 0; i < ticksFor(HARVEST.tree.renew); i++) step(state, {}, TICK_SECONDS);
  assert.equal(tree.phase, 'stump');
  applyCommand(state, { type: 'remove', id: overStump.structure.id });
  step(state, {}, TICK_SECONDS);
  assert.equal(tree.phase, 'ready');
});

test('harvesting after a workbench is placed keeps its collision', () => {
  const { descriptor, state } = playing();
  stock(state);
  stand(state, 0, 0);
  const placed = applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 0 });
  assert.ok(state.obstacles.some(item => item.id === placed.structure.id && item.minX != null));
  const tree = state.resources.find(item => item.kind === 'tree');
  harvest(state, tree);
  assert.equal(tree.phase, 'stump');
  const obstacle = state.obstacles.find(item => item.id === placed.structure.id);
  assert.ok(obstacle);
  assert.equal(obstacle.minX != null, true);
  const restored = restoreState(descriptor, serializeSnapshot(descriptor, state).gameplay);
  assert.equal(restored.structures[0].id, placed.structure.id);
  assert.ok(restored.obstacles.some(item => item.id === placed.structure.id));
});

test('walking cannot cut through a workbench footprint', () => {
  const { descriptor, state } = playing();
  stock(state);
  stand(state, 0, 0);
  applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 0 });
  const bench = state.structures[0];
  const obstacle = state.obstacles.find(item => item.id === bench.id);
  const nav = buildNav(descriptor, state.obstacles);
  const through = findPath(nav, { x: 1.2, z: 0 }, { x: 2.8, z: 0 });
  if (through) {
    assert.equal(hitsObstacle(2, 0, obstacle, KEEPER_RADIUS), true);
    assert.equal(through.some(point => hitsObstacle(point.x, point.z, obstacle)), false);
  } else {
    assert.equal(through, null);
  }
  const slide = resolveWalkPosition(state.boundary, state.obstacles, 2, 0, 1.1, 0, state.walkMargin);
  assert.equal(hitsObstacle(slide.x, slide.z, obstacle), false);
});

test('construction cannot close the route back to the clearing', () => {
  const { state } = playing();
  stock(state, { wood: 80, stone: 40 });
  state.resources = [];
  state.boundary = [
    { x: 2, z: -8 }, { x: 2, z: 8 }, { x: -2, z: 8 }, { x: -2, z: -8 },
  ];
  state.walkMargin = 0.45;
  state.clearing = { x: 0, z: -3, facing: 0 };
  stand(state, 0, 3);
  syncObstacles(state);
  const first = applyCommand(state, { type: 'place', kind: 'workbench', gx: -1, gz: 0, rotation: 1 });
  assert.equal(first.ok, true, first.reason);
  const second = applyCommand(state, { type: 'place', kind: 'workbench', gx: 0, gz: 0, rotation: 1 });
  assert.equal(second.ok, true, second.reason);
  const wall = applyCommand(state, { type: 'place', kind: 'workbench', gx: 1, gz: 0, rotation: 1 });
  assert.equal(wall.ok, false, wall.reason);
  assert.equal(wall.reason, 'blocked-home');
  assert.equal(state.structures.length, 2);
  assert.equal(state.inventory.wood, 64);
});

test('the structure cap rejects further placements without spending', () => {
  const { state } = playing();
  stock(state);
  stand(state, 0, 0);
  state.structures = Array.from({ length: STRUCTURE_CAP }, (_, i) => ({
    id: `s-${i + 1}`,
    kind: 'floor',
    gx: 80,
    gz: i,
    rotation: 0,
    paidCost: { wood: 2 },
  }));
  state.nextStructureId = STRUCTURE_CAP + 1;
  const before = state.inventory.wood;
  const failed = applyCommand(state, { type: 'place', kind: 'floor', gx: 0, gz: 1, rotation: 0 });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'cap');
  assert.equal(state.inventory.wood, before);
  assert.equal(state.structures.length, STRUCTURE_CAP);
});

test('save round-trip keeps structures and refunds after reload', () => {
  const { descriptor, state } = playing();
  stock(state);
  stand(state, 0, 0);
  applyCommand(state, { type: 'place', kind: 'path', gx: 0, gz: 1, rotation: 0 });
  const placed = applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 1 });
  const snapshot = serializeSnapshot(descriptor, state);
  assert.equal(validateSnapshot(snapshot).ok, true);
  const restored = restoreState(snapshot.descriptor, snapshot.gameplay);
  assert.equal(restored.structures.length, 2);
  assert.equal(structureById(restored, placed.structure.id).kind, 'workbench');
  assert.deepEqual(structureById(restored, placed.structure.id).paidCost, { wood: 8, stone: 4 });
  const removed = applyCommand(restored, { type: 'remove', id: placed.structure.id });
  assert.equal(removed.ok, true);
  assert.equal(restored.inventory.wood, state.inventory.wood + 8);
  assert.equal(restored.inventory.stone, state.inventory.stone + 4);
});

test('soil is not a live catalog piece; leftover decode still occupies ground', () => {
  assert.equal(CATALOG.includes('soil'), false);
  assert.equal(BUILDINGS.soil, undefined);
  assert.equal(buildingDef('soil')?.id, 'soil');
  assert.equal(LEGACY_BUILDINGS.soil.layer, 'ground');
  assert.equal(LEGACY_BUILDINGS.soil.garden, undefined);

  const { state } = playing();
  stock(state);
  stand(state, 0, 0);
  const placed = applyCommand(state, { type: 'place', kind: 'soil', gx: 0, gz: 2, rotation: 0 });
  assert.equal(placed.ok, false);
  assert.equal(placed.reason, 'unknown-piece');
  assert.equal(state.structures.length, 0);
  assert.equal(state.inventory.wood, 40);

  state.structures.push({ id: 's-9', kind: 'soil', gx: 0, gz: 3, rotation: 0, paidCost: {} });
  stand(state, 0, 3);
  const leftover = describeStructure(state, 's-9');
  assert.equal(leftover.canUse, false);
  assert.equal(leftover.canMove, false);
  assert.equal(leftover.canRemove, false);
  const overSquare = applyCommand(state, { type: 'place', kind: 'floor', gx: 0, gz: 3, rotation: 0 });
  assert.equal(overSquare.ok, false);
  assert.equal(overSquare.reason, 'occupied-ground');
  const moved = applyCommand(state, { type: 'move', id: 's-9', gx: 1, gz: 3, rotation: 0 });
  assert.equal(moved.ok, false);
  assert.equal(moved.reason, 'unknown-piece');
  assert.equal(state.structures[0].gx, 0);
  assert.equal(state.structures[0].gz, 3);
});

test('buildings cannot cover earth patches or wild crops', () => {
  const { state } = playing();
  stock(state);
  state.soilPatches.push({
    id: 'soil-1',
    x: 0,
    z: 4,
    shapeSeed: 17,
    shapeVersion: 1,
  });
  state.nextSoilId = 2;
  stand(state, 0, 4);
  const overEarth = applyCommand(state, { type: 'place', kind: 'floor', gx: 0, gz: 4, rotation: 0 });
  assert.equal(overEarth.ok, false);
  assert.equal(overEarth.reason, 'occupied-ground');
  const bench = applyCommand(state, { type: 'place', kind: 'workbench', gx: 0, gz: 4, rotation: 0 });
  assert.equal(bench.ok, false);
  assert.equal(bench.reason, 'occupied-soil');

  state.soilPatches.push({
    id: 'soil-2',
    x: 0.4,
    z: 6,
    shapeSeed: 21,
    shapeVersion: 1,
  });
  stand(state, 1, 6);
  const nick = applyCommand(state, { type: 'place', kind: 'floor', gx: 1, gz: 6, rotation: 0 });
  assert.equal(nick.ok, false);
  assert.equal(nick.reason, 'occupied-ground');

  const carrot = state.resources.find(item => item.kind === 'carrot' && item.protected);
  assert.ok(carrot);
  stand(state, carrot.x, carrot.z + 1.2);
  const overCarrot = applyCommand(state, {
    type: 'place',
    kind: 'floor',
    gx: Math.round(carrot.x),
    gz: Math.round(carrot.z),
    rotation: 0,
  });
  assert.equal(overCarrot.ok, false);
  assert.equal(overCarrot.reason, 'protected');
  carrot.phase = 'depleted';
  const depleted = applyCommand(state, {
    type: 'place',
    kind: 'path',
    gx: Math.round(carrot.x),
    gz: Math.round(carrot.z),
    rotation: 0,
  });
  assert.equal(depleted.ok, false);
  assert.equal(depleted.reason, 'protected');

  const potato = state.resources.find(item => item.kind === 'potato');
  assert.ok(potato);
  stand(state, potato.x, potato.z + 1.2);
  const overPotato = applyCommand(state, {
    type: 'place',
    kind: 'floor',
    gx: Math.round(potato.x),
    gz: Math.round(potato.z),
    rotation: 0,
  });
  assert.equal(overPotato.ok, false);
  assert.equal(overPotato.reason, potato.protected ? 'protected' : 'blocked');
});
