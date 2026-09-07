import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createState, snapPlayerPose, step } from '../core/state.mjs';
import { generateWorld } from '../world/generate.mjs';
import { cropBySoilId, validateTill } from '../core/garden.mjs';
import {
  CROP_CLEAR_SECONDS, CROP_HARVEST_SECONDS, CROP_PLANT_SECONDS, SOIL_PATCH_CAP, SOIL_TILL_SECONDS, TICK_SECONDS,
} from '../data/tuning.mjs';
import { soilPatchAsStructure } from '../world/soil.mjs';

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

function runTicks(state, count, input = {}) {
  const events = [];
  for (let i = 0; i < count; i++) events.push(...step(state, input, TICK_SECONDS));
  return events;
}

function startField(state, spec) {
  return applyCommand(state, { type: 'startAction', ...spec });
}

function finishField(state, spec) {
  const started = startField(state, spec);
  assert.equal(started.ok, true, started.reason);
  assert.ok(state.action);
  const events = runTicks(state, ticksFor(state.action.duration));
  assert.equal(state.action, null);
  return events;
}

function addEarth(state, x, z) {
  const id = `soil-${state.nextSoilId}`;
  state.nextSoilId += 1;
  const patch = {
    id,
    x,
    z,
    shapeSeed: 17,
    shapeVersion: 1,
  };
  state.soilPatches.push(patch);
  stand(state, x, z);
  return soilPatchAsStructure(patch);
}

function openGrass(state) {
  state.equipment.hoe = true;
  for (let z = 4; z <= 16; z += 1) {
    for (let x = -8; x <= 8; x += 1) {
      stand(state, x, z);
      const check = validateTill(state, { x, z });
      if (check.ok) return { x, z };
    }
  }
  assert.fail('no open grass for till');
}

test('old plant/harvest/uproot commands cannot bypass action duration', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 2;
  const soil = addEarth(state, 0, 1);
  assert.equal(applyCommand(state, { type: 'plant', soilId: soil.id, species: 'carrot' }).reason, 'use-action');
  assert.equal(state.crops.length, 0);
  assert.equal(state.inventory.carrotSeed, 2);
  assert.equal(applyCommand(state, { type: 'harvestCrop', soilId: soil.id }).reason, 'use-action');
  assert.equal(applyCommand(state, { type: 'uproot', soilId: soil.id }).reason, 'use-action');
});

test('interrupted till creates zero patches and spends nothing', () => {
  const { state } = playing();
  const wood = state.inventory.wood;
  const point = openGrass(state);
  const started = startField(state, { action: 'till', x: point.x, z: point.z });
  assert.equal(started.ok, true, started.reason);
  assert.equal(state.action.type, 'till');
  assert.equal(state.action.targetCategory, 'ground');
  assert.equal(state.action.duration, SOIL_TILL_SECONDS);
  runTicks(state, 8);
  assert.ok(state.action);
  assert.equal(state.soilPatches.length, 0);
  applyCommand(state, { type: 'stopAction' });
  runTicks(state, ticksFor(SOIL_TILL_SECONDS));
  assert.equal(state.soilPatches.length, 0);
  assert.equal(state.inventory.wood, wood);
  assert.equal(state.action, null);
});

test('till commits one soil-N patch only at completion and requires a hoe', () => {
  const { state } = playing();
  const point = openGrass(state);
  state.equipment.hoe = false;
  assert.equal(startField(state, { action: 'till', x: point.x, z: point.z }).reason, 'needs-hoe');
  state.equipment.hoe = true;
  const events = finishField(state, { action: 'till', x: point.x, z: point.z });
  assert.ok(events.some(event => event.type === 'tilled'));
  assert.ok(events.some(event => event.type === 'actionCompleted' && event.action === 'till'));
  assert.equal(state.soilPatches.length, 1);
  assert.equal(state.soilPatches[0].id, 'soil-1');
  assert.equal(state.nextSoilId, 2);
  const duplicate = startField(state, { action: 'till', x: point.x, z: point.z });
  assert.equal(duplicate.ok, false);
});

test('interrupted planting spends zero seeds; completion spends one', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 3;
  const soil = addEarth(state, 0, 1);
  const started = startField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  assert.equal(started.ok, true, started.reason);
  assert.equal(state.action.duration, CROP_PLANT_SECONDS);
  assert.equal(state.action.targetCategory, 'soil');
  assert.equal(state.inventory.carrotSeed, 3);
  assert.equal(state.crops.length, 0);
  applyCommand(state, { type: 'stopAction' });
  assert.equal(state.inventory.carrotSeed, 3);
  assert.equal(state.crops.length, 0);
  const events = finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  assert.ok(events.some(event => event.type === 'planted'));
  assert.equal(state.inventory.carrotSeed, 2);
  assert.equal(state.crops.length, 1);
  assert.ok(cropBySoilId(state, soil.id).remaining > 89);
});

test('a newly planted crop does not lose growth on the completion tick', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 1;
  const soil = addEarth(state, 0, 1);
  startField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  const needed = Math.ceil(state.action.duration / TICK_SECONDS);
  runTicks(state, needed);
  const crop = cropBySoilId(state, soil.id);
  assert.ok(crop);
  assert.equal(crop.remaining, 90);
});

test('duplicate start is a no-op and a completed harvest cannot pay twice', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 1;
  const soil = addEarth(state, 0, 1);
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  cropBySoilId(state, soil.id).remaining = 0;
  const first = startField(state, { action: 'harvestCrop', targetId: soil.id });
  assert.equal(first.ok, true, first.reason);
  const id = state.action.id;
  const again = startField(state, { action: 'harvestCrop', targetId: soil.id });
  assert.equal(again.ok, true);
  assert.equal(state.action.id, id);
  assert.equal(state.action.duration, CROP_HARVEST_SECONDS);
  runTicks(state, ticksFor(CROP_HARVEST_SECONDS));
  assert.equal(state.inventory.carrot, 2);
  assert.equal(state.harvestCount, 1);
  assert.equal(cropBySoilId(state, soil.id), null);
  assert.equal(startField(state, { action: 'harvestCrop', targetId: soil.id }).reason, 'empty-plot');
  assert.equal(state.inventory.carrot, 2);
  assert.equal(state.harvestCount, 1);
});

test('leaving range on the last tick grants nothing', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 1;
  const soil = addEarth(state, 0, 1);
  startField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  const almost = Math.max(1, Math.floor(state.action.duration / TICK_SECONDS) - 1);
  runTicks(state, almost);
  assert.ok(state.action);
  stand(state, 8, 8);
  runTicks(state, 4);
  assert.equal(state.action, null);
  assert.equal(state.crops.length, 0);
  assert.equal(state.inventory.carrotSeed, 1);
});

test('uproot returns one seed and no produce; smooth grants nothing and needs a hoe', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 1;
  const point = openGrass(state);
  finishField(state, { action: 'till', x: point.x, z: point.z });
  const patch = state.soilPatches[0];
  stand(state, patch.x, patch.z);
  finishField(state, { action: 'plantCrop', targetId: patch.id, species: 'carrot' });
  assert.equal(startField(state, { action: 'smoothSoil', targetId: patch.id }).reason, 'has-crop');
  const uprooted = finishField(state, { action: 'uprootCrop', targetId: patch.id });
  assert.ok(uprooted.some(event => event.type === 'uprooted'));
  assert.equal(state.inventory.carrotSeed, 1);
  assert.equal(state.inventory.carrot, 0);
  assert.equal(state.harvestCount, 0);
  assert.equal(state.action, null);
  state.equipment.hoe = false;
  assert.equal(startField(state, { action: 'smoothSoil', targetId: patch.id }).reason, 'needs-hoe');
  state.equipment.hoe = true;
  const bag = { ...state.inventory };
  const smoothed = finishField(state, { action: 'smoothSoil', targetId: patch.id });
  assert.ok(smoothed.some(event => event.type === 'smoothed'));
  assert.equal(state.action, null);
  assert.equal(state.soilPatches.length, 0);
  assert.equal(state.inventory.carrotSeed, bag.carrotSeed);
  assert.equal(state.inventory.carrot, bag.carrot);
  assert.equal(state.inventory.wood, bag.wood);
  assert.equal(state.action, null);
  assert.ok(Math.abs(CROP_CLEAR_SECONDS - 0.6) < 1e-9);
});

test('soil cap rejection is atomic and harvest still works without a hoe', () => {
  const { state } = playing();
  state.equipment.hoe = true;
  state.inventory.carrotSeed = 1;
  state.soilPatches = Array.from({ length: SOIL_PATCH_CAP }, (_, i) => ({
    id: `soil-${i + 1}`,
    x: 20 + (i % 8) * 1.1,
    z: 20 + Math.floor(i / 8) * 1.1,
    shapeSeed: i + 1,
    shapeVersion: 1,
  }));
  state.nextSoilId = SOIL_PATCH_CAP + 1;
  const point = { x: 0, z: 6 };
  stand(state, point.x, point.z);
  const blocked = startField(state, { action: 'till', x: point.x, z: point.z });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'soil-cap');
  assert.equal(state.soilPatches.length, SOIL_PATCH_CAP);
  assert.equal(state.nextSoilId, SOIL_PATCH_CAP + 1);

  state.equipment.hoe = false;
  const soil = addEarth(state, 0, 1);
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  cropBySoilId(state, soil.id).remaining = 0;
  finishField(state, { action: 'harvestCrop', targetId: soil.id });
  assert.equal(state.inventory.carrot, 2);
  assert.equal(state.equipment.hoe, false);
});

test('a held repeat cannot chain till or plant', () => {
  const { state } = playing();
  const point = openGrass(state);
  finishField(state, { action: 'till', x: point.x, z: point.z });
  const firstId = state.soilPatches[0].id;
  const chained = startField(state, { action: 'till', x: point.x, z: point.z });
  assert.equal(chained.ok, false);
  assert.equal(state.soilPatches.length, 1);
  assert.equal(state.soilPatches[0].id, firstId);
  stand(state, state.soilPatches[0].x, state.soilPatches[0].z);
  state.inventory.carrotSeed = 2;
  finishField(state, { action: 'plantCrop', targetId: firstId, species: 'carrot' });
  const again = startField(state, { action: 'plantCrop', targetId: firstId, species: 'carrot' });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'occupied-plot');
  assert.equal(state.inventory.carrotSeed, 1);
});
