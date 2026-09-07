import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createState, restoreState, snapPlayerPose, step } from '../core/state.mjs';
import { generateWorld } from '../world/generate.mjs';
import { serializeSnapshot, validateSnapshot } from '../storage/schema.mjs';
import { footprintBounds, footprintCells } from '../data/buildings.mjs';
import { HARVEST } from '../data/harvest.mjs';
import { APPROACH_PADDING, KEEPER_RADIUS, SMELT_QUEUE_CAP, SMELT_SECONDS, TICK_SECONDS } from '../data/tuning.mjs';
import { describePlacement, describeStructure } from '../core/building.mjs';
import { canReachStation } from '../core/stations.mjs';
import { syncObstacles } from '../core/resources.mjs';

function playing(seed = 'hearthwild-review-a') {
  const descriptor = generateWorld(seed);
  const state = createState(descriptor, { name: 'Review A' });
  applyCommand(state, { type: 'enter' });
  return { descriptor, state };
}

function ticksFor(seconds) {
  return Math.ceil(seconds / TICK_SECONDS) + 2;
}

function stand(state, x, z) {
  state.player.x = x;
  state.player.z = z;
  state.player.moving = false;
  snapPlayerPose(state);
}

function standNear(state, resource) {
  const dist = resource.radius + KEEPER_RADIUS + APPROACH_PADDING;
  stand(state, resource.x + dist, resource.z);
}

function standBy(state, structure) {
  const bounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
  stand(state, (bounds.minX + bounds.maxX) / 2, bounds.maxZ + KEEPER_RADIUS + APPROACH_PADDING);
}

function harvest(state, resource, action = 'harvest') {
  standNear(state, resource);
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

function placeNear(state, kind, gx, gz, rotation = 0) {
  const bounds = footprintBounds(kind, gx, gz, rotation);
  stand(state, bounds.minX - 1.1, (bounds.minZ + bounds.maxZ) / 2);
  const result = applyCommand(state, { type: 'place', kind, gx, gz, rotation });
  assert.equal(result.ok, true, result.reason);
  return result.structure;
}

function finishSmelt(state, count = 1) {
  const events = [];
  const limit = ticksFor(SMELT_SECONDS) * count + 4;
  for (let i = 0; i < limit; i++) {
    events.push(...step(state, {}, TICK_SECONDS));
    const furnace = state.structures.find(item => item.kind === 'furnace');
    if (furnace && furnace.queue.length === 0) break;
  }
  return events;
}

test('furnace 2×1 occupancy matches the workbench rotation rules', () => {
  assert.deepEqual(footprintCells('furnace', 0, 0, 0), footprintCells('workbench', 0, 0, 0));
  assert.deepEqual(footprintCells('furnace', 0, 0, 1), footprintCells('workbench', 0, 0, 1));
});

test('the ordinary gather-build-smelt-upgrade chain spends real harvests once', () => {
  const { state } = playing();
  const trees = state.resources.filter(item => item.kind === 'tree' && item.phase === 'ready').slice(0, 3);
  const stones = state.resources.filter(item => item.kind === 'stone' && item.phase === 'ready').slice(0, 3);
  const coppers = state.resources.filter(item => item.kind === 'copper' && item.phase === 'ready').slice(0, 2);
  for (const resource of trees) harvest(state, resource);
  for (const resource of stones) harvest(state, resource);
  for (const resource of coppers) harvest(state, resource);
  assert.equal(state.inventory.wood, 24);
  assert.equal(state.inventory.stone, 18);
  assert.equal(state.inventory.copperOre, 6);

  const bench = placeNear(state, 'workbench', 2, 0);
  const furnace = placeNear(state, 'furnace', 2, 2);
  assert.equal(state.inventory.wood, 12);
  assert.equal(state.inventory.stone, 2);
  assert.equal(state.discovery.workbench, true);
  assert.equal(state.discovery.furnace, true);

  standBy(state, furnace);
  const queued = applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 5 });
  assert.equal(queued.ok, false);
  assert.equal(state.inventory.copperOre, 6);
  const three = applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 });
  assert.equal(three.ok, true, three.reason);
  applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 });
  applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 });
  assert.equal(state.inventory.copperOre, 0);
  assert.equal(state.inventory.wood, 9);
  finishSmelt(state, 3);
  const collected = applyCommand(state, { type: 'collectOutput', structureId: furnace.id });
  assert.equal(collected.ok, true, collected.reason);
  assert.equal(state.inventory.copperIngot, 3);
  assert.equal(furnace.output.copperIngot, undefined);
  assert.equal(state.discovery.copperIngot, true);

  standBy(state, bench);
  const axe = applyCommand(state, { type: 'craft', structureId: bench.id, recipeId: 'copperAxe' });
  assert.equal(axe.ok, true, axe.reason);
  assert.equal(state.equipment.copperAxe, true);
  assert.equal(state.equipment.stoneAxe, true);
  assert.equal(state.inventory.copperIngot, 0);
  assert.equal(state.inventory.wood, 6);
  const again = applyCommand(state, { type: 'craft', structureId: bench.id, recipeId: 'copperAxe' });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'owned');
});

test('insufficient materials, range, access and queue cap reject atomically', () => {
  const { state } = playing();
  state.inventory.wood = 40;
  state.inventory.stone = 40;
  const bench = placeNear(state, 'workbench', 2, 0);
  const furnace = placeNear(state, 'furnace', 2, 2);
  standBy(state, furnace);
  state.inventory.copperOre = 2;
  state.inventory.wood = 1;
  const five = applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 5 });
  assert.equal(five.ok, false);
  assert.equal(five.reason, 'materials');
  assert.equal(state.inventory.copperOre, 2);
  assert.equal(furnace.queue.length, 0);

  applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 });
  state.inventory.copperOre = 40;
  state.inventory.wood = 40;
  for (let i = 0; i < SMELT_QUEUE_CAP - 1; i++) {
    assert.equal(applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 }).ok, true);
  }
  const overflow = applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, 'queue-full');
  assert.equal(furnace.queue.length, SMELT_QUEUE_CAP);
  const overflowFive = applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 5 });
  assert.equal(overflowFive.ok, false);
  assert.equal(furnace.queue.length, SMELT_QUEUE_CAP);

  stand(state, 12, 12);
  const far = applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 });
  assert.equal(far.ok, false);
  assert.equal(far.reason, 'too-far');

  standBy(state, bench);
  state.discovery.copperIngot = true;
  state.inventory.copperIngot = 3;
  stand(state, -8, -8);
  const farCraft = applyCommand(state, { type: 'craft', structureId: bench.id, recipeId: 'copperPick' });
  assert.equal(farCraft.ok, false);
  assert.equal(farCraft.reason, 'too-far');
  assert.equal(state.equipment.copperPick, false);
});

test('waiting batches refund; the active batch cannot be canceled; output collects once', () => {
  const { state } = playing();
  state.inventory.wood = 40;
  state.inventory.stone = 40;
  state.inventory.copperOre = 20;
  placeNear(state, 'workbench', 2, 0);
  const furnace = placeNear(state, 'furnace', 2, 2);
  standBy(state, furnace);
  assert.equal(applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 }).ok, true);
  assert.equal(applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 }).ok, true);
  const activeId = furnace.queue[0].id;
  const waitingId = furnace.queue[1].id;
  const wood = state.inventory.wood;
  const ore = state.inventory.copperOre;
  const cancelActive = applyCommand(state, { type: 'cancelBatch', structureId: furnace.id, batchId: activeId });
  assert.equal(cancelActive.ok, false);
  assert.equal(cancelActive.reason, 'active-locked');
  assert.equal(furnace.queue.length, 2);
  const cancelWait = applyCommand(state, { type: 'cancelBatch', structureId: furnace.id, batchId: waitingId });
  assert.equal(cancelWait.ok, true, cancelWait.reason);
  assert.equal(furnace.queue.length, 1);
  assert.equal(state.inventory.wood, wood + 1);
  assert.equal(state.inventory.copperOre, ore + 2);
  finishSmelt(state, 1);
  assert.equal(furnace.output.copperIngot, 1);
  const first = applyCommand(state, { type: 'collectOutput', structureId: furnace.id });
  assert.equal(first.ok, true);
  assert.equal(state.inventory.copperIngot, 1);
  const second = applyCommand(state, { type: 'collectOutput', structureId: furnace.id });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'empty-output');
  assert.equal(state.inventory.copperIngot, 1);
});

test('busy furnaces cannot move or dismantle; empty ones can, without a second workbench', () => {
  const { state } = playing();
  state.inventory.wood = 40;
  state.inventory.stone = 40;
  state.inventory.copperOre = 8;
  const bench = placeNear(state, 'workbench', 2, 0);
  const furnace = placeNear(state, 'furnace', 2, 2);
  standBy(state, furnace);
  applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 });
  assert.equal(applyCommand(state, { type: 'move', id: furnace.id, gx: 2, gz: 3, rotation: 0 }).reason, 'station-busy');
  assert.equal(applyCommand(state, { type: 'remove', id: furnace.id }).reason, 'station-busy');
  assert.equal(describeStructure(state, furnace.id).canMove, false);
  finishSmelt(state, 1);
  assert.equal(applyCommand(state, { type: 'remove', id: furnace.id }).reason, 'station-busy');
  applyCommand(state, { type: 'collectOutput', structureId: furnace.id });
  applyCommand(state, { type: 'remove', id: bench.id });
  assert.equal(state.discovery.workbench, true);
  assert.equal(state.structures.some(item => item.kind === 'workbench'), false);
  standBy(state, furnace);
  const moved = applyCommand(state, { type: 'move', id: furnace.id, gx: 0, gz: 2, rotation: 1 });
  assert.equal(moved.ok, true, moved.reason);
  const removed = applyCommand(state, { type: 'remove', id: furnace.id });
  assert.equal(removed.ok, true, removed.reason);
  assert.equal(state.inventory.stone >= 12, true);
  assert.equal(state.discovery.furnace, true);
  const ghost = describePlacement(state, { kind: 'furnace', gx: 0, gz: 1, rotation: 0 });
  assert.equal(ghost.ok, false);
  assert.equal(ghost.reason, 'needs-workbench');
});

test('furnace placement needs discovery and a workbench within five paces', () => {
  const { state } = playing();
  state.inventory.wood = 40;
  state.inventory.stone = 40;
  stand(state, 0, 0);
  const first = applyCommand(state, { type: 'place', kind: 'furnace', gx: 2, gz: 0, rotation: 0 });
  assert.equal(first.ok, false);
  assert.equal(first.reason, 'needs-workbench');
  placeNear(state, 'workbench', 2, 0);
  stand(state, 0, 0);
  const far = applyCommand(state, { type: 'place', kind: 'furnace', gx: 12, gz: 0, rotation: 0 });
  assert.equal(far.ok, false);
  assert.equal(far.reason, 'too-far');
  stand(state, 0, 0);
  const near = applyCommand(state, { type: 'place', kind: 'furnace', gx: 2, gz: 2, rotation: 0 });
  assert.equal(near.ok, true, near.reason);
});

test('station use rejects a blocked approach even when the number is in range', () => {
  const { state } = playing();
  state.inventory.wood = 80;
  state.inventory.stone = 80;
  state.resources = [];
  state.boundary = [
    { x: 3, z: -8 }, { x: 3, z: 8 }, { x: -3, z: 8 }, { x: -3, z: -8 },
  ];
  state.walkMargin = 0.45;
  state.clearing = { x: 0, z: -3, facing: 0 };
  stand(state, 0, -2);
  syncObstacles(state);
  assert.equal(applyCommand(state, { type: 'place', kind: 'workbench', gx: -1, gz: -1, rotation: 0 }).ok, true);
  const furnace = applyCommand(state, { type: 'place', kind: 'furnace', gx: -1, gz: 0, rotation: 0 });
  assert.equal(furnace.ok, true, furnace.reason);
  assert.equal(applyCommand(state, { type: 'place', kind: 'workbench', gx: -2, gz: 1, rotation: 0 }).ok, true);
  assert.equal(applyCommand(state, { type: 'place', kind: 'workbench', gx: 0, gz: 1, rotation: 0 }).ok, true);
  assert.equal(applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 1, rotation: 1 }).ok, true);
  stand(state, 0, 1.9);
  const access = canReachStation(state, furnace.structure);
  assert.equal(access.ok, false, access.reason);
  assert.equal(access.reason, 'blocked-access');
  const queued = applyCommand(state, {
    type: 'queueSmelt',
    structureId: furnace.structure.id,
    recipeId: 'copperIngot',
    count: 1,
  });
  assert.equal(queued.ok, false);
  assert.equal(queued.reason, 'blocked-access');
});

test('pause freezes smelting; station commands still work; load keeps remaining time', () => {
  const { descriptor, state } = playing();
  state.inventory.wood = 40;
  state.inventory.stone = 40;
  state.inventory.copperOre = 20;
  placeNear(state, 'workbench', 2, 0);
  const furnace = placeNear(state, 'furnace', 2, 2);
  standBy(state, furnace);
  assert.equal(applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 }).ok, true);
  const remaining = furnace.queue[0].remaining;
  const elapsed = state.elapsed;
  for (let i = 0; i < 90; i++) step(state, { paused: true }, TICK_SECONDS);
  assert.equal(state.elapsed, elapsed);
  assert.ok(Math.abs(furnace.queue[0].remaining - remaining) < 1e-9);
  assert.equal(applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 }).ok, true);
  assert.equal(furnace.queue.length, 2);
  for (let i = 0; i < ticksFor(4); i++) step(state, {}, TICK_SECONDS);
  const mid = furnace.queue[0].remaining;
  assert.ok(mid < SMELT_SECONDS - 3);
  const snapshot = serializeSnapshot(descriptor, state);
  assert.equal(validateSnapshot(snapshot).ok, true, validateSnapshot(snapshot).reason);
  const restored = restoreState(snapshot.descriptor, snapshot.gameplay);
  const restoredFurnace = restored.structures.find(item => item.kind === 'furnace');
  assert.equal(restoredFurnace.queue.length, 2);
  assert.ok(Math.abs(restoredFurnace.queue[0].remaining - mid) < 1e-6);
  assert.equal(restored.inventory.copperOre, state.inventory.copperOre);
  standBy(restored, restoredFurnace);
  finishSmelt(restored, 2);
  applyCommand(restored, { type: 'collectOutput', structureId: restoredFurnace.id });
  assert.equal(restored.inventory.copperIngot, 2);
  assert.equal(restoredFurnace.queue.length, 0);
});

test('copper tools use the faster harvest durations after a real upgrade', () => {
  const { state } = playing();
  const tree = state.resources.find(item => item.kind === 'tree');
  const copper = state.resources.find(item => item.kind === 'copper');
  standNear(state, tree);
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  assert.equal(state.action.duration, HARVEST.tree.duration.stone);
  applyCommand(state, { type: 'stopAction' });
  state.inventory.wood = 40;
  state.inventory.stone = 40;
  state.inventory.copperOre = 12;
  placeNear(state, 'workbench', 2, 0);
  const furnace = placeNear(state, 'furnace', 2, 2);
  standBy(state, furnace);
  for (let i = 0; i < 6; i++) {
    assert.equal(applyCommand(state, { type: 'queueSmelt', structureId: furnace.id, recipeId: 'copperIngot', count: 1 }).ok, true);
  }
  finishSmelt(state, 6);
  applyCommand(state, { type: 'collectOutput', structureId: furnace.id });
  const bench = state.structures.find(item => item.kind === 'workbench');
  standBy(state, bench);
  assert.equal(applyCommand(state, { type: 'craft', structureId: bench.id, recipeId: 'copperAxe' }).ok, true);
  standNear(state, tree);
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  assert.equal(state.action.duration, HARVEST.tree.duration.copper);
  applyCommand(state, { type: 'stopAction' });
  standBy(state, bench);
  assert.equal(applyCommand(state, { type: 'craft', structureId: bench.id, recipeId: 'copperPick' }).ok, true);
  standNear(state, copper);
  applyCommand(state, { type: 'startAction', targetId: copper.id, action: 'harvest' });
  assert.equal(state.action.duration, HARVEST.copper.duration.copper);
});
