import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createState, snapPlayerPose, step } from '../core/state.mjs';
import { generateWorld } from '../world/generate.mjs';
import { cropBySoilId, hoeBrushPoint, validateTill } from '../core/garden.mjs';
import {
  describeFieldDock, describeSeedChoices, describeTillPreview, NO_SEEDS_HINT, resolveFieldTarget,
} from '../core/field.mjs';
import { HOE_BRUSH_AHEAD, TICK_SECONDS } from '../data/tuning.mjs';
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

function stand(state, x, z, facing = 0) {
  state.player.x = x;
  state.player.z = z;
  state.player.facing = facing;
  state.player.moving = false;
  snapPlayerPose(state);
}

function runTicks(state, count) {
  const events = [];
  for (let i = 0; i < count; i++) events.push(...step(state, {}, TICK_SECONDS));
  return events;
}

function startField(state, spec) {
  return applyCommand(state, { type: 'startAction', ...spec });
}

function finishField(state, spec) {
  const started = startField(state, spec);
  assert.equal(started.ok, true, started.reason);
  runTicks(state, ticksFor(state.action.duration));
  assert.equal(state.action, null);
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

function dock(state, input) {
  return describeFieldDock(state, input);
}

test('default Gather dock harvests mature crops and will not uproot from Harvest', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 1;
  const soil = addEarth(state, 0, 1);
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  const growing = dock(state, { mode: 'gather', selectedStructureId: soil.id });
  assert.equal(growing.modeLabel, 'Gather');
  assert.equal(growing.primary.intendedVerb, 'Harvest');
  assert.equal(growing.primary.disabled, true);
  assert.equal(growing.primary.command, null);
  assert.equal(growing.secondary.command.action, 'uprootCrop');
  cropBySoilId(state, soil.id).remaining = 0;
  const ready = dock(state, { mode: 'gather', selectedStructureId: soil.id });
  assert.equal(ready.primary.verb, 'Harvest');
  assert.equal(ready.primary.command.action, 'harvestCrop');
  assert.equal(ready.secondary.command.action, 'uprootCrop');
});

test('Gather with a hoe does not till grass; Hoe mode requires owning the hoe', () => {
  const { state } = playing();
  state.equipment.hoe = true;
  const point = openGrass(state);
  stand(state, point.x, point.z);
  const gather = dock(state, { mode: 'gather', tillAim: point });
  assert.equal(gather.primary.command, null);
  assert.equal(gather.primary.verb, 'Gather');
  const hoe = dock(state, { mode: 'hoe', tillAim: point });
  assert.equal(hoe.modeLabel, 'Hoe');
  assert.equal(hoe.primary.verb, 'Till');
  assert.equal(hoe.primary.command.action, 'till');
  assert.equal(hoe.secondary, null);
  state.equipment.hoe = false;
  const locked = dock(state, { mode: 'hoe', tillAim: point });
  assert.equal(locked.canSelectHoe, false);
  assert.equal(locked.primary.reason, 'needs-hoe');
  assert.equal(locked.primary.command, null);
});

test('Hoe smooths empty earth and does not expose Uproot', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 1;
  const point = openGrass(state);
  finishField(state, { action: 'till', x: point.x, z: point.z });
  const patch = state.soilPatches[0];
  stand(state, patch.x, patch.z);
  const empty = dock(state, { mode: 'hoe', selectedStructureId: patch.id });
  assert.equal(empty.secondary.verb, 'Smooth earth');
  assert.equal(empty.secondary.command.action, 'smoothSoil');
  finishField(state, { action: 'plantCrop', targetId: patch.id, species: 'carrot' });
  const occupied = dock(state, { mode: 'hoe', selectedStructureId: patch.id });
  assert.equal(occupied.secondary, null);
  const gather = dock(state, { mode: 'gather', selectedStructureId: patch.id });
  assert.equal(gather.secondary.command.action, 'uprootCrop');
});

test('Seeds mode plants the selected species and never substitutes another', () => {
  const { state } = playing();
  const soil = addEarth(state, 0, 1);
  const none = describeSeedChoices(state, null);
  assert.equal(none.seedsOwned, false);
  assert.equal(none.emptySeedsHint, NO_SEEDS_HINT);
  const empty = dock(state, { mode: 'seeds', selectedStructureId: soil.id });
  assert.match(empty.primary.hint, /Harvest wild carrots or potatoes to find seeds/);
  assert.equal(empty.primary.command, null);
  state.inventory.potatoSeed = 2;
  const zeroCarrot = dock(state, { mode: 'seeds', selectedStructureId: soil.id, selectedSeed: 'carrot' });
  assert.equal(zeroCarrot.primary.verb, 'Plant carrot');
  assert.equal(zeroCarrot.primary.disabled, true);
  assert.equal(zeroCarrot.primary.command, null);
  assert.equal(zeroCarrot.selectedSeed, 'carrot');
  assert.equal(zeroCarrot.seeds.find(seed => seed.species === 'carrot').have, 0);
  assert.equal(zeroCarrot.seeds.find(seed => seed.species === 'potato').have, 2);
  const potato = dock(state, { mode: 'seeds', selectedStructureId: soil.id, selectedSeed: 'potato' });
  assert.equal(potato.primary.verb, 'Plant potato');
  assert.equal(potato.primary.command.action, 'plantCrop');
  assert.equal(potato.primary.command.species, 'potato');
  const grass = dock(state, { mode: 'seeds', selectedSeed: 'potato' });
  assert.equal(grass.primary.command, null);
  assert.match(grass.primary.hint, /empty earth/i);
});

test('keyboard Hoe aims 0.85 ahead; Gather/Seeds keep a selected plot or pick nearest by distance then ID', () => {
  const { state } = playing();
  state.equipment.hoe = true;
  stand(state, 0, 0, 0);
  const brush = hoeBrushPoint(state.player);
  const aimed = resolveFieldTarget(state, { mode: 'hoe' });
  assert.equal(aimed.category, 'ground');
  assert.equal(aimed.explicit, false);
  assert.equal(aimed.x, brush.x);
  assert.equal(aimed.z, brush.z);
  assert.ok(Math.abs(HOE_BRUSH_AHEAD - 0.85) < 1e-9);
  assert.ok(Math.abs(brush.z - HOE_BRUSH_AHEAD) < 1e-9);

  state.inventory.carrotSeed = 2;
  const first = addEarth(state, 0, 1);
  const second = addEarth(state, 0, 2);
  stand(state, 0, 1.5);
  const kept = resolveFieldTarget(state, { mode: 'seeds', selectedStructureId: second.id });
  assert.equal(kept.id, second.id);
  const nearestSeed = resolveFieldTarget(state, { mode: 'seeds' });
  assert.ok(nearestSeed.id === first.id || nearestSeed.id === second.id);

  finishField(state, { action: 'plantCrop', targetId: first.id, species: 'carrot' });
  cropBySoilId(state, first.id).remaining = 0;
  stand(state, first.gx, first.gz);
  const keptCrop = resolveFieldTarget(state, { mode: 'gather', selectedStructureId: first.id });
  assert.equal(keptCrop.id, first.id);
  const nearestGather = resolveFieldTarget(state, { mode: 'gather' });
  assert.equal(nearestGather.category, 'soil');
  assert.equal(nearestGather.id, first.id);
});

test('hoe till preview is a natural outline with till or reject icon, not a cell snap', () => {
  const { state } = playing();
  assert.equal(describeTillPreview(state, { mode: 'hoe' }), null);
  const grass = openGrass(state);
  stand(state, grass.x, grass.z);
  const ready = describeTillPreview(state, { mode: 'hoe', tillAim: grass });
  const till = validateTill(state, grass);
  assert.equal(ready.valid, true);
  assert.equal(ready.icon, 'till');
  assert.equal(ready.outline.length, 16);
  assert.deepEqual(ready.outline, till.outline);
  assert.equal(ready.x, grass.x);
  assert.equal(ready.z, grass.z);
  const view = dock(state, { mode: 'hoe', tillAim: grass });
  assert.equal(view.tillPreview.icon, 'till');
  assert.equal(view.picked, 'Till');
  assert.equal(describeTillPreview(state, { mode: 'gather', tillAim: grass }), null);
  stand(state, 0, 0);
  const far = describeTillPreview(state, { mode: 'hoe', tillAim: grass });
  assert.equal(far.valid, false);
  assert.equal(far.icon, 'reject');
  assert.equal(far.reason, 'too-far');
  assert.equal(far.outline.length, 16);
  const offGrid = { x: grass.x + 0.37, z: grass.z + 0.21 };
  stand(state, offGrid.x, offGrid.z);
  const preview = describeTillPreview(state, { mode: 'hoe', tillAim: offGrid });
  assert.ok(preview);
  assert.notEqual(preview.x, Math.round(offGrid.x));
  assert.notEqual(preview.z, Math.round(offGrid.z));
});
