import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createState, restoreState, snapPlayerPose, step } from '../core/state.mjs';
import { generateWorld } from '../world/generate.mjs';
import { serializeSnapshot, validateSnapshot } from '../storage/schema.mjs';
import { createSaveStore, memoryStorage } from '../storage/saves.mjs';
import { HARVEST } from '../data/harvest.mjs';
import { APPROACH_PADDING, KEEPER_RADIUS, TICK_SECONDS } from '../data/tuning.mjs';
import { harvestRange, resourceById } from '../core/resources.mjs';

function playing(seed = 'hearthwild-review-a') {
  const descriptor = generateWorld(seed);
  const state = createState(descriptor, { name: 'Review A' });
  applyCommand(state, { type: 'enter' });
  return { descriptor, state };
}

function standNear(state, resource) {
  const dist = resource.radius + KEEPER_RADIUS + APPROACH_PADDING;
  state.player.x = resource.x + dist;
  state.player.z = resource.z;
  state.player.moving = false;
  snapPlayerPose(state);
}

function ticksFor(seconds) {
  return Math.ceil(seconds / TICK_SECONDS) + 2;
}

function runTicks(state, count, input = {}) {
  const events = [];
  for (let i = 0; i < count; i++) events.push(...step(state, input, TICK_SECONDS));
  return events;
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

test('starting kit is stone tools with no crop seeds and empty materials', () => {
  const { state } = playing();
  assert.equal(state.inventory.wood, 0);
  assert.equal(state.inventory.stone, 0);
  assert.equal(state.inventory.copperOre, 0);
  assert.equal(state.inventory.carrotSeed, 0);
  assert.equal(state.inventory.potatoSeed, 0);
  assert.equal(state.inventory.sapling, 0);
  assert.equal(state.equipment.stoneAxe, true);
  assert.equal(state.equipment.stonePick, true);
  assert.equal(state.equipment.copperAxe, false);
  assert.equal(state.equipment.hoe, false);
});

test('each resource yields the planned amounts once', () => {
  const { state } = playing();
  const kinds = ['tree', 'stone', 'copper', 'berry', 'carrot', 'potato', 'twig', 'pebble'];
  for (const kind of kinds) {
    const resource = state.resources.find(item => item.kind === kind && item.phase === 'ready');
    assert.ok(resource, kind);
    const before = { ...state.inventory };
    const events = harvest(state, resource);
    assert.ok(events.some(event => event.type === 'harvested' && event.id === resource.id));
    for (const [item, amount] of Object.entries(HARVEST[kind].yields)) {
      assert.equal(state.inventory[item], before[item] + amount, `${kind} ${item}`);
    }
    assert.notEqual(resource.phase, 'ready');
    const again = applyCommand(state, { type: 'startAction', targetId: resource.id, action: 'harvest' });
    assert.equal(again.ok, false);
  }
});

test('duplicate startAction cannot double-collect', () => {
  const { state } = playing();
  const tree = state.resources.find(item => item.kind === 'tree');
  standNear(state, tree);
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  const events = runTicks(state, ticksFor(2));
  assert.equal(events.filter(event => event.type === 'harvested').length, 1);
  assert.equal(state.inventory.wood, 8);
  assert.equal(state.inventory.sapling, 1);
});

test('movement, pause and stopAction cancel harvest with no reward', () => {
  const { state } = playing();
  const tree = state.resources.find(item => item.kind === 'tree');
  standNear(state, tree);
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  runTicks(state, 10);
  const cancelled = applyCommand(state, { type: 'cancelInput' });
  assert.ok(cancelled.events.some(event => event.type === 'actionCancelled'));
  runTicks(state, ticksFor(2));
  assert.equal(state.inventory.wood, 0);
  assert.equal(tree.phase, 'ready');

  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  runTicks(state, 8, { x: 1 });
  assert.equal(state.action, null);
  assert.equal(state.inventory.wood, 0);

  standNear(state, tree);
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  step(state, { paused: true }, TICK_SECONDS);
  assert.equal(state.action, null);
  assert.equal(state.inventory.wood, 0);
});

test('missing tools and protected removal are rejected', () => {
  const { state } = playing();
  const tree = state.resources.find(item => item.kind === 'tree');
  const copper = state.resources.find(item => item.kind === 'copper' && item.protected);
  state.equipment.stoneAxe = false;
  state.equipment.copperAxe = false;
  standNear(state, tree);
  assert.equal(applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' }).reason, 'needs-axe');
  standNear(state, copper);
  assert.equal(applyCommand(state, { type: 'startAction', targetId: copper.id, action: 'clear' }).reason, 'protected');
});

test('approach points stay inside harvest reach', () => {
  const { state } = playing();
  const tree = state.resources.find(item => item.kind === 'tree');
  standNear(state, tree);
  assert.ok(Math.hypot(state.player.x - tree.x, state.player.z - tree.z) <= harvestRange(tree));
});

test('copper tools use the faster harvest duration', () => {
  const { state } = playing();
  const copper = state.resources.find(item => item.kind === 'copper');
  standNear(state, copper);
  applyCommand(state, { type: 'startAction', targetId: copper.id, action: 'harvest' });
  assert.equal(state.action.duration, 3);
  applyCommand(state, { type: 'stopAction' });
  state.equipment.copperPick = true;
  applyCommand(state, { type: 'startAction', targetId: copper.id, action: 'harvest' });
  assert.equal(state.action.duration, 1.8);
});

test('pause freezes renewal timers at production durations', () => {
  const { state } = playing();
  const berry = state.resources.find(item => item.kind === 'berry');
  harvest(state, berry);
  const remaining = berry.readyAt - state.elapsed;
  assert.ok(Math.abs(remaining - HARVEST.berry.renew) < 0.05);
  const elapsed = state.elapsed;
  runTicks(state, 90, { paused: true });
  assert.equal(state.elapsed, elapsed);
  assert.ok(Math.abs(berry.readyAt - state.elapsed - remaining) < 1e-9);
});

test('trees leave a walkable stump and delay regrowth under the keeper', () => {
  const { descriptor, state } = playing();
  const tree = state.resources.find(item => item.kind === 'tree');
  harvest(state, tree);
  assert.equal(tree.phase, 'stump');
  assert.equal(state.obstacles.some(item => item.id === tree.id), false);
  state.player.x = tree.x;
  state.player.z = tree.z;
  snapPlayerPose(state);
  runTicks(state, ticksFor(HARVEST.tree.renew));
  assert.equal(tree.phase, 'stump');
  assert.equal(state.obstacles.some(item => item.id === tree.id), false);
  state.player.x = 0;
  state.player.z = 0;
  snapPlayerPose(state);
  runTicks(state, 3);
  assert.equal(tree.phase, 'ready');
  assert.ok(state.obstacles.some(item => item.id === tree.id));
  const restored = restoreState(descriptor, serializeSnapshot(descriptor, state).gameplay);
  assert.equal(resourceById(restored, tree.id).phase, 'ready');
});

test('unprotected bushes can be cleared; renewal restores depleted nodes', () => {
  const { state } = playing();
  const bush = state.resources.find(item => item.kind === 'berry' && !item.protected);
  harvest(state, bush);
  const cleared = harvest(state, bush, 'clear');
  assert.ok(cleared.some(event => event.type === 'cleared'));
  assert.equal(bush.phase, 'removed');

  const carrot = state.resources.find(item => item.kind === 'carrot' && item.protected);
  harvest(state, carrot);
  assert.equal(carrot.phase, 'depleted');
  runTicks(state, ticksFor(HARVEST.carrot.renew));
  assert.equal(carrot.phase, 'ready');
});

test('continue restores counts without granting the starter kit again', () => {
  const { descriptor, state } = playing();
  const carrot = state.resources.find(item => item.kind === 'carrot');
  harvest(state, carrot);
  assert.equal(state.inventory.carrot, 1);
  assert.equal(state.inventory.carrotSeed, 2);
  assert.equal(state.inventory.fiber, 1);
  const snapshot = serializeSnapshot(descriptor, state);
  assert.equal(validateSnapshot(snapshot).ok, true);
  const restored = restoreState(descriptor, snapshot.gameplay);
  assert.equal(restored.inventory.carrotSeed, 2);
  assert.equal(restored.inventory.fiber, 1);
  assert.equal(restored.equipment.stoneAxe, true);
  assert.equal(resourceById(restored, carrot.id).phase, 'depleted');
  assert.equal(restored.action, null);
});

test('wild crop harvest lasts 0.9s, ignores copper tools, and cancel grants nothing', () => {
  const { state } = playing();
  state.equipment.hoe = false;
  const carrot = state.resources.find(item => item.kind === 'carrot' && item.phase === 'ready');
  standNear(state, carrot);
  applyCommand(state, { type: 'startAction', targetId: carrot.id, action: 'harvest' });
  assert.equal(state.action.duration, 0.9);
  applyCommand(state, { type: 'stopAction' });
  state.equipment.copperAxe = true;
  state.equipment.copperPick = true;
  applyCommand(state, { type: 'startAction', targetId: carrot.id, action: 'harvest' });
  assert.equal(state.action.duration, 0.9);
  runTicks(state, 10);
  applyCommand(state, { type: 'stopAction' });
  assert.equal(state.inventory.carrot, 0);
  assert.equal(state.inventory.carrotSeed, 0);
  assert.equal(state.inventory.fiber, 0);
  assert.equal(carrot.phase, 'ready');
});

test('unprotected wild crops clear in 0.6s with no reward; protected reject clear', () => {
  const { state } = playing();
  const guarded = state.resources.find(item => item.kind === 'carrot' && item.protected);
  harvest(state, guarded);
  standNear(state, guarded);
  assert.equal(applyCommand(state, { type: 'startAction', targetId: guarded.id, action: 'clear' }).reason, 'protected');
  assert.equal(guarded.phase, 'depleted');
  const open = state.resources.find(item => item.kind === 'potato' && !item.protected && item.phase === 'ready');
  harvest(state, open);
  const before = { potato: state.inventory.potato, potatoSeed: state.inventory.potatoSeed, fiber: state.inventory.fiber };
  standNear(state, open);
  applyCommand(state, { type: 'startAction', targetId: open.id, action: 'clear' });
  assert.equal(state.action.duration, 0.6);
  const events = runTicks(state, ticksFor(0.6));
  assert.ok(events.some(event => event.type === 'cleared'));
  assert.equal(open.phase, 'removed');
  assert.equal(state.inventory.potato, before.potato);
  assert.equal(state.inventory.potatoSeed, before.potatoSeed);
  assert.equal(state.inventory.fiber, before.fiber);
});
