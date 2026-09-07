import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createState, restoreState, snapPlayerPose, step } from '../core/state.mjs';
import { generateWorld } from '../world/generate.mjs';
import { serializeSnapshot, validateSnapshot } from '../storage/schema.mjs';
import { HARVEST } from '../data/harvest.mjs';
import {
  APPROACH_PADDING, CARROT_SECONDS, CROP_CAP, CROP_SEED_PROGRESS, GARDEN_RANGE, KEEPER_RADIUS, PLAYER_TREE_CAP,
  POTATO_SECONDS, SAPLING_GROW_SECONDS, SMELT_SECONDS, STRUCTURE_CAP, TICK_SECONDS,
} from '../data/tuning.mjs';
import { cropBySoilId, describePlantTree, validateTill } from '../core/garden.mjs';
import { cropProgress, cropStageId, littleScale } from '../data/crops.mjs';
import { RECIPE_IDS } from '../data/recipes.mjs';
import { describeHandRecipes } from '../core/stations.mjs';
import { describePlacement, describeStructure } from '../core/building.mjs';
import { describeFieldDock } from '../core/field.mjs';
import { syncObstacles } from '../core/resources.mjs';
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
  assert.ok(state.action, 'expected a timed field action');
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

test('crop stages follow seed / little / mature thresholds', () => {
  const carrot = { species: 'carrot', remaining: 90 };
  assert.equal(cropStageId(carrot), 'seed');
  assert.equal(cropProgress(carrot), 0);
  carrot.remaining = 90 * (1 - CROP_SEED_PROGRESS);
  assert.ok(Math.abs(cropProgress(carrot) - CROP_SEED_PROGRESS) < 1e-9);
  assert.equal(cropStageId(carrot), 'little');
  carrot.remaining = 1e-6;
  assert.equal(cropStageId(carrot), 'little');
  assert.ok(cropProgress(carrot) < 1);
  carrot.remaining = 0;
  assert.equal(cropStageId(carrot), 'mature');
  assert.equal(cropProgress(carrot), 1);
  assert.equal(littleScale(0), 0.25);
  assert.equal(littleScale(CROP_SEED_PROGRESS), 0.25);
  assert.ok(Math.abs(littleScale(1) - 1) < 1e-9);
  const almostMature = littleScale(1 - 1e-6);
  assert.ok(almostMature > 0.69 && almostMature < 0.71);
});

test('a carrot cycle spends one seed and returns two carrots plus a seed', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 4;
  const soil = addEarth(state, 0, 1);
  const before = state.inventory.carrotSeed;
  const planted = finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  assert.ok(planted.some(event => event.type === 'planted'));
  assert.equal(state.inventory.carrotSeed, before - 1);
  const again = startField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'occupied-plot');
  assert.equal(state.inventory.carrotSeed, before - 1);
  const early = startField(state, { action: 'harvestCrop', targetId: soil.id });
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'immature');
  const events = runTicks(state, ticksFor(CARROT_SECONDS));
  assert.ok(events.some(event => event.type === 'cropReady'));
  const harvested = finishField(state, { action: 'harvestCrop', targetId: soil.id });
  assert.ok(harvested.some(event => event.type === 'harvestedCrop'));
  assert.equal(state.inventory.carrot, 2);
  assert.equal(state.inventory.carrotSeed, before);
  assert.equal(state.discovery.cropHarvest, true);
  assert.equal(state.harvestCount, 1);
  assert.equal(cropBySoilId(state, soil.id), null);
  const repeat = startField(state, { action: 'harvestCrop', targetId: soil.id });
  assert.equal(repeat.ok, false);
  assert.equal(repeat.reason, 'empty-plot');
  assert.equal(state.inventory.carrot, 2);
});

test('pause does not complete crop growth and uproot returns only the seed', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 6;
  const soil = addEarth(state, 0, 1);
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  const remaining = cropBySoilId(state, soil.id).remaining;
  const elapsed = state.elapsed;
  runTicks(state, ticksFor(20), { paused: true });
  assert.equal(state.elapsed, elapsed);
  assert.ok(Math.abs(cropBySoilId(state, soil.id).remaining - remaining) < 1e-9);
  const uprooted = finishField(state, { action: 'uprootCrop', targetId: soil.id });
  assert.ok(uprooted.some(event => event.type === 'uprooted'));
  assert.equal(state.inventory.carrotSeed, 6);
  assert.equal(state.inventory.carrot, 0);
  assert.equal(state.discovery.cropHarvest, false);
  assert.equal(state.harvestCount, 0);
  const reuse = finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  assert.ok(reuse.some(event => event.type === 'planted'));
});

test('zero seed, out of range and duplicate uproot spend nothing', () => {
  const { state } = playing();
  const soil = addEarth(state, 0, 1);
  state.inventory.carrotSeed = 0;
  const empty = startField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'no-seed');
  assert.equal(state.crops.length, 0);
  state.inventory.carrotSeed = 2;
  stand(state, 8, 8);
  const far = startField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  assert.equal(far.ok, false);
  assert.equal(far.reason, 'too-far');
  assert.equal(state.inventory.carrotSeed, 2);
  stand(state, 0, 1);
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  finishField(state, { action: 'uprootCrop', targetId: soil.id });
  const again = startField(state, { action: 'uprootCrop', targetId: soil.id });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'empty-plot');
  assert.equal(state.inventory.carrotSeed, 2);
});

test('turnip-to-moonflower recipe is gone; leftover flowers still make fiber', () => {
  const { state } = playing();
  const missing = applyCommand(state, { type: 'craft', recipeId: 'moonflowerSeed' });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'unknown-recipe');
  assert.equal(describeHandRecipes(state).some(recipe => recipe.id === 'fiber'), false);
  state.inventory.moonflower = 1;
  const fiber = applyCommand(state, { type: 'craft', recipeId: 'fiber' });
  assert.equal(fiber.ok, true, fiber.reason);
  assert.equal(state.inventory.moonflower, 0);
  assert.equal(state.inventory.fiber, 2);
  const again = applyCommand(state, { type: 'craft', recipeId: 'fiber' });
  assert.equal(again.ok, false);
  const station = applyCommand(state, { type: 'craft', recipeId: 'copperAxe' });
  assert.equal(station.ok, false);
  const soil = addEarth(state, 0, 1);
  state.inventory.potatoSeed = 1;
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'potato' });
  runTicks(state, ticksFor(POTATO_SECONDS));
  finishField(state, { action: 'harvestCrop', targetId: soil.id });
  assert.equal(state.inventory.potato, 2);
  assert.equal(state.inventory.potatoSeed, 1);
});

test('soil and saplings reject overlapping content both ways without spending', () => {
  const { state } = playing();
  state.inventory.wood = 40;
  state.inventory.stone = 20;
  state.inventory.sapling = 2;
  state.inventory.carrotSeed = 2;
  const soil = addEarth(state, 0, 1);
  stand(state, 0, 1);
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  const floor = applyCommand(state, { type: 'place', kind: 'floor', gx: 0, gz: 1, rotation: 0 });
  assert.equal(floor.ok, false);
  assert.equal(floor.reason, 'occupied-ground');
  const bench = applyCommand(state, { type: 'place', kind: 'workbench', gx: 0, gz: 1, rotation: 0 });
  assert.equal(bench.ok, false);
  assert.equal(bench.reason, 'occupied-soil');
  assert.equal(describeStructure(state, soil.id).canMove, false);
  assert.equal(describeStructure(state, soil.id).canUse, false);
  assert.equal(applyCommand(state, { type: 'remove', id: soil.id }).reason, 'missing-target');
  assert.equal(state.inventory.wood, 40);
  finishField(state, { action: 'uprootCrop', targetId: soil.id });
  state.equipment.hoe = true;
  finishField(state, { action: 'smoothSoil', targetId: soil.id });
  assert.equal(applyCommand(state, { type: 'place', kind: 'floor', gx: 0, gz: 1, rotation: 0 }).ok, true);
  const overFloor = applyCommand(state, { type: 'place', kind: 'soil', gx: 0, gz: 1, rotation: 0 });
  assert.equal(overFloor.ok, false);
  assert.equal(overFloor.reason, 'unknown-piece');
  stand(state, 0, 1);
  assert.equal(validateTill(state, { x: 0, z: 1 }).ok, false);
  applyCommand(state, { type: 'remove', id: state.structures[0].id });
  const tree = applyCommand(state, { type: 'plantTree', gx: 2, gz: 2 });
  assert.equal(tree.ok, true, tree.reason);
  assert.equal(state.inventory.sapling, 1);
  const overTree = applyCommand(state, { type: 'place', kind: 'soil', gx: 2, gz: 2, rotation: 0 });
  assert.equal(overTree.ok, false);
  assert.equal(overTree.reason, 'unknown-piece');
  stand(state, 2, 2);
  assert.equal(validateTill(state, { x: 2, z: 2 }).ok, false);
  const again = applyCommand(state, { type: 'plantTree', gx: 2, gz: 2 });
  assert.equal(again.ok, false);
  assert.equal(state.inventory.sapling, 1);
  const ghost = describePlacement(state, { kind: 'floor', gx: 2, gz: 2, rotation: 0 });
  assert.equal(ghost.ok, false);
});

test('crop and planted-tree caps reject the 65th without spending', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 80;
  state.inventory.sapling = 80;
  stand(state, 0, 0);
  state.crops = Array.from({ length: CROP_CAP }, (_, i) => ({
    id: `c-${i + 1}`,
    soilId: `s-${i + 1}`,
    species: 'carrot',
    remaining: 10,
  }));
  state.structures = Array.from({ length: CROP_CAP }, (_, i) => ({
    id: `s-${i + 1}`,
    kind: 'soil',
    gx: 0,
    gz: 0,
    rotation: 0,
    paidCost: {},
  }));
  state.nextCropId = CROP_CAP + 1;
  state.nextStructureId = CROP_CAP + 1;
  const extraSoil = addEarth(state, 1, 0);
  const overflow = startField(state, { action: 'plantCrop', targetId: extraSoil.id, species: 'carrot' });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, 'crop-cap');
  assert.equal(state.inventory.carrotSeed, 80);
  assert.equal(state.crops.length, CROP_CAP);

  state.resources.push(...Array.from({ length: PLAYER_TREE_CAP }, (_, i) => ({
    id: `pt-${i + 1}`,
    kind: 'tree',
    planted: true,
    phase: i % 2 ? 'young' : 'seedling',
    x: 40,
    z: i,
    radius: 0.58,
    growRemaining: 10,
    protected: false,
  })));
  state.nextPlantedTreeId = PLAYER_TREE_CAP + 1;
  const tree = applyCommand(state, { type: 'plantTree', gx: 3, gz: 0 });
  assert.equal(tree.ok, false);
  assert.equal(tree.reason, 'tree-cap');
  assert.equal(state.inventory.sapling, 80);
});

test('planted trees grow, delay if blocked, then follow axe yields and sapling refunds', () => {
  const { state } = playing();
  state.inventory.sapling = 3;
  stand(state, 2, 2);
  const planted = applyCommand(state, { type: 'plantTree', gx: 2, gz: 2 });
  assert.equal(planted.ok, true, planted.reason);
  const tree = state.resources.find(item => item.id === planted.resource.id);
  runTicks(state, ticksFor(SAPLING_GROW_SECONDS));
  assert.equal(tree.phase, 'young');
  stand(state, 0, 0);
  runTicks(state, 3);
  assert.equal(tree.phase, 'ready');
  assert.ok(state.obstacles.some(item => item.id === tree.id));

  stand(state, tree.x + tree.radius + KEEPER_RADIUS + APPROACH_PADDING, tree.z);
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  runTicks(state, ticksFor(HARVEST.tree.duration.stone));
  assert.equal(tree.phase, 'stump');
  assert.equal(state.inventory.wood, 8);
  assert.equal(state.inventory.sapling, 3);
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'clear' });
  runTicks(state, ticksFor(0.5));
  assert.equal(state.resources.some(item => item.id === tree.id), false);
  assert.equal(state.inventory.sapling, 3);

  stand(state, 0, 2);
  const blocked = applyCommand(state, { type: 'plantTree', gx: 0, gz: 2 });
  assert.equal(blocked.ok, true, blocked.reason);
  const growing = state.resources.find(item => item.id === blocked.resource.id);
  runTicks(state, ticksFor(SAPLING_GROW_SECONDS));
  assert.equal(growing.phase, 'young');
  stand(state, 4, 0);
  runTicks(state, 4);
  assert.equal(growing.phase, 'ready');

  const sapling = applyCommand(state, { type: 'plantTree', gx: 2, gz: 2 });
  const young = state.resources.find(item => item.id === sapling.resource.id);
  stand(state, 2 + young.radius + KEEPER_RADIUS + APPROACH_PADDING, 2);
  applyCommand(state, { type: 'startAction', targetId: young.id, action: 'clear' });
  runTicks(state, ticksFor(0.5));
  assert.equal(state.inventory.sapling, 2);
  assert.equal(state.resources.some(item => item.id === young.id), false);
});

test('garden timers round-trip and schema 3 workshop saves migrate without a second starter kit', () => {
  const { descriptor, state } = playing();
  state.inventory.carrotSeed = 6;
  const soil = addEarth(state, 0, 4);
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  runTicks(state, ticksFor(30));
  state.inventory.sapling = 1;
  applyCommand(state, { type: 'plantTree', gx: 2, gz: 2 });
  const cropRemaining = cropBySoilId(state, soil.id).remaining;
  const treeRemaining = state.resources.find(item => item.planted).growRemaining;
  const snapshot = serializeSnapshot(descriptor, state);
  assert.equal(validateSnapshot(snapshot).ok, true, validateSnapshot(snapshot).reason);
  assert.equal(snapshot.schemaVersion, 6);
  const restored = restoreState(snapshot.descriptor, snapshot.gameplay);
  assert.equal(cropBySoilId(restored, soil.id).remaining, cropRemaining);
  assert.equal(restored.resources.find(item => item.planted).growRemaining, treeRemaining);
  assert.equal(restored.inventory.carrotSeed, 5);
  assert.equal(restored.inventory.sapling, 0);

  const current = serializeSnapshot(descriptor, restored);
  const legacy = JSON.parse(JSON.stringify(current));
  legacy.schemaVersion = 3;
  delete legacy.gameplay.crops;
  delete legacy.gameplay.nextCropId;
  delete legacy.gameplay.nextPlantedTreeId;
  delete legacy.gameplay.harvestCount;
  delete legacy.gameplay.discovery.cropHarvest;
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.schemaVersion, 6);
  assert.deepEqual(checked.data.gameplay.crops, []);
  assert.equal(checked.data.gameplay.harvestCount, 0);
  assert.equal(checked.data.gameplay.discovery.cropHarvest, false);
  const migrated = restoreState(checked.data.descriptor, checked.data.gameplay);
  assert.equal(migrated.inventory.carrotSeed, 5);
  assert.equal(migrated.crops.length, 0);

  assert.equal(SMELT_SECONDS, 8);
  assert.equal(HARVEST.tree.renew, 360);
  assert.equal(CARROT_SECONDS, 90);
  assert.equal(POTATO_SECONDS, 120);
  assert.equal(describeStructure(state, soil.id).canUse, false);
  assert.ok(GARDEN_RANGE > 0);
  syncObstacles(state);
});

test('farming uses the field dock, not a plot sheet or crop recipe catalog', () => {
  const { state } = playing();
  state.inventory.carrotSeed = 2;
  state.inventory.sapling = 1;
  const soil = addEarth(state, 0, 1);
  const plot = describeStructure(state, soil.id);
  assert.equal(plot.canUse, false);
  assert.equal(plot.canMove, false);
  assert.equal(plot.canRemove, false);
  assert.equal(RECIPE_IDS.includes('moonflowerSeed'), false);
  assert.equal(RECIPE_IDS.includes('carrotSeed'), false);
  assert.equal(RECIPE_IDS.includes('potatoSeed'), false);
  const recipes = describeHandRecipes(state).map(recipe => recipe.id);
  assert.deepEqual(recipes, ['hoe']);
  const plant = describeFieldDock(state, {
    mode: 'seeds',
    selectedStructureId: soil.id,
    selectedSeed: 'carrot',
  });
  assert.equal(plant.primary.command.action, 'plantCrop');
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  const growing = describeFieldDock(state, { mode: 'gather', selectedStructureId: soil.id });
  assert.equal(growing.primary.disabled, true);
  assert.equal(growing.secondary.command.action, 'uprootCrop');
  runTicks(state, 5);
  const later = describeFieldDock(state, { mode: 'gather', selectedStructureId: soil.id });
  assert.equal(later.primary.command, null);
  assert.equal(later.secondary.command.action, 'uprootCrop');
  const sapling = describePlantTree(state, { gx: 2, gz: 2 });
  assert.equal(sapling.title, 'Sapling');
  assert.equal(sapling.ok, true, sapling.reason);
});

test('garden harvest and wild gather work without a hoe; the hoe is crafted once from the bag', () => {
  const { state } = playing();
  assert.equal(state.equipment.hoe, false);
  const listed = describeHandRecipes(state).find(recipe => recipe.id === 'hoe');
  assert.ok(listed);
  assert.equal(listed.canCraft, false);
  state.inventory.wood = 5;
  state.inventory.stone = 1;
  assert.equal(applyCommand(state, { type: 'craft', recipeId: 'hoe' }).ok, false);
  assert.equal(state.equipment.hoe, false);
  state.inventory.stone = 2;
  state.inventory.carrotSeed = 1;
  const soil = addEarth(state, 0, 1);
  finishField(state, { action: 'plantCrop', targetId: soil.id, species: 'carrot' });
  runTicks(state, ticksFor(CARROT_SECONDS));
  const harvested = finishField(state, { action: 'harvestCrop', targetId: soil.id });
  assert.ok(harvested.some(event => event.type === 'harvestedCrop'));
  assert.equal(state.inventory.carrot, 2);
  assert.equal(state.equipment.hoe, false);

  const wild = state.resources.find(item => item.kind === 'carrot' && item.phase === 'ready');
  stand(state, wild.x + wild.radius + KEEPER_RADIUS + APPROACH_PADDING, wild.z);
  const started = applyCommand(state, { type: 'startAction', targetId: wild.id, action: 'harvest' });
  assert.equal(started.ok, true, started.reason);
  runTicks(state, ticksFor(0.9));
  assert.equal(state.inventory.carrot, 3);
  assert.equal(state.equipment.hoe, false);

  const crafted = applyCommand(state, { type: 'craft', recipeId: 'hoe' });
  assert.equal(crafted.ok, true, crafted.reason);
  assert.equal(state.equipment.hoe, true);
  assert.equal(state.inventory.wood, 0);
  assert.equal(state.inventory.stone, 0);
  const again = applyCommand(state, { type: 'craft', recipeId: 'hoe' });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'owned');
  assert.equal(describeHandRecipes(state).find(recipe => recipe.id === 'hoe').owned, true);
});

test('soil patches do not spend the construction-piece allowance', () => {
  const { state } = playing();
  state.inventory.wood = 8;
  state.soilPatches = Array.from({ length: 70 }, (_, i) => ({
    id: `soil-legacy-s-${i + 1}`,
    x: (i % 10) * 1.1,
    z: 8 + Math.floor(i / 10) * 1.1,
    shapeSeed: i + 1,
    shapeVersion: 1,
  }));
  state.structures = Array.from({ length: STRUCTURE_CAP - 1 }, (_, i) => ({
    id: `s-${i + 1}`,
    kind: 'floor',
    gx: 40,
    gz: i,
    rotation: 0,
    paidCost: { wood: 2 },
  }));
  state.nextStructureId = STRUCTURE_CAP;
  stand(state, 0, 0);
  const placed = applyCommand(state, { type: 'place', kind: 'floor', gx: 0, gz: 2, rotation: 0 });
  assert.equal(placed.ok, true, placed.reason);
  const blocked = applyCommand(state, { type: 'place', kind: 'floor', gx: 0, gz: 3, rotation: 0 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'cap');
});
