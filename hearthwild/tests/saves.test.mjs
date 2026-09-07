import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createState, restoreState, snapPlayerPose, step } from '../core/state.mjs';
import { generateWorld } from '../world/generate.mjs';
import { applyMigrations, parseSaveText, SCHEMA_VERSION, serializeSnapshot, validateSnapshot } from '../storage/schema.mjs';
import { createSaveStore, GOOD_KEY, memoryStorage, SAVE_KEY } from '../storage/saves.mjs';
import { APPROACH_PADDING, KEEPER_RADIUS, TICK_SECONDS } from '../data/tuning.mjs';
import { resourceById } from '../core/resources.mjs';
import { cropBySoilId } from '../core/garden.mjs';
import { legacySoilPatchId, soilPatchesFromStructures, soilPatchShapeSeed, validateNewSoilPatch } from '../world/soil.mjs';
import { SOIL_PATCH_CAP, SOIL_PATCH_IMPORT_MAX, CROP_CAP } from '../data/tuning.mjs';

function playing() {
  const descriptor = generateWorld('hearthwild-review-a');
  const state = createState(descriptor, { name: 'Saved Isle' });
  applyCommand(state, { type: 'enter' });
  const tree = state.resources.find(item => item.kind === 'tree');
  state.player.x = tree.x + tree.radius + KEEPER_RADIUS + APPROACH_PADDING;
  state.player.z = tree.z;
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  const ticks = Math.ceil(2 / TICK_SECONDS) + 2;
  for (let i = 0; i < ticks; i++) step(state, {}, TICK_SECONDS);
  return { descriptor, state, tree };
}

function stand(state, x, z) {
  state.player.x = x;
  state.player.z = z;
  state.player.moving = false;
  snapPlayerPose(state);
}

function finishField(state, spec) {
  const started = applyCommand(state, { type: 'startAction', ...spec });
  assert.equal(started.ok, true, started.reason);
  const ticks = Math.ceil(state.action.duration / TICK_SECONDS) + 2;
  for (let i = 0; i < ticks; i++) step(state, {}, TICK_SECONDS);
  assert.equal(state.action, null);
}

test('a full descriptor, inventory, equipment and resource timers round-trip', () => {
  const { descriptor, state, tree } = playing();
  const snapshot = serializeSnapshot(descriptor, state, { sequence: 3, savedAt: 1 });
  assert.equal(snapshot.descriptor.seed, 'hearthwild-review-a');
  assert.ok(snapshot.descriptor.island.top.length > 8);
  assert.equal(snapshot.gameplay.inventory.wood, 8);
  assert.equal(snapshot.gameplay.resources.find(item => item.id === tree.id).phase, 'stump');
  assert.equal(snapshot.gameplay.action, undefined);
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true);
  const restored = restoreState(checked.data.descriptor, checked.data.gameplay);
  assert.equal(restored.seed, descriptor.seed);
  assert.equal(snapshot.schemaVersion, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 6);
  assert.deepEqual(snapshot.gameplay.soilPatches, []);
  assert.equal(snapshot.gameplay.nextSoilId, 1);
  assert.equal(restored.inventory.wood, 8);
  assert.equal(restored.inventory.carrotSeed, 0);
  assert.equal(restored.inventory.potatoSeed, 0);
  assert.equal(restored.equipment.stonePick, true);
  assert.equal(restored.equipment.hoe, false);
  assert.equal(resourceById(restored, tree.id).phase, 'stump');
  assert.equal(resourceById(restored, tree.id).readyAt, state.resources.find(item => item.id === tree.id).readyAt);
  assert.equal(restored.action, null);
  assert.equal(restored.player.moving, false);
  assert.deepEqual(restored.playerPrev, restored.player);
});

test('seed-only payloads and future versions are rejected without wiping storage', () => {
  const storage = memoryStorage();
  const store = createSaveStore(storage);
  const { descriptor, state } = playing();
  assert.equal(store.write(descriptor, state).ok, true);
  const kept = storage.getItem(SAVE_KEY);
  assert.equal(validateSnapshot({ schemaVersion: SCHEMA_VERSION, seed: 'hearthwild-review-a' }).ok, false);
  storage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, seed: 'only' }));
  const read = store.read();
  assert.equal(read.ok, true);
  assert.equal(read.recovered, true);
  assert.equal(storage.getItem(SAVE_KEY), JSON.stringify({ schemaVersion: SCHEMA_VERSION, seed: 'only' }));
  assert.ok(storage.getItem(GOOD_KEY));
  assert.equal(parseSaveText(kept).ok, true);
  assert.throws(() => applyMigrations({ schemaVersion: SCHEMA_VERSION + 9, descriptor, gameplay: {} }));
});

test('migration infrastructure upgrades registered versions', () => {
  const table = {
    1: data => ({ ...data, schemaVersion: 2, migrated: true }),
  };
  const next = applyMigrations({ schemaVersion: 1, keep: true }, 2, table);
  assert.equal(next.schemaVersion, 2);
  assert.equal(next.migrated, true);
  assert.equal(next.keep, true);
});

test('failed writes leave the previous good snapshot in place', () => {
  const storage = memoryStorage();
  const store = createSaveStore(storage);
  const { descriptor, state } = playing();
  assert.equal(store.write(descriptor, state).ok, true);
  const previous = storage.getItem(SAVE_KEY);
  const good = storage.getItem(GOOD_KEY);
  storage.setItem = () => {
    throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
  };
  state.inventory.wood += 4;
  const failed = store.write(descriptor, state);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'write-failed');
  assert.equal(storage.getItem(SAVE_KEY), previous);
  assert.equal(storage.getItem(GOOD_KEY), good);
  const read = parseSaveText(previous);
  assert.equal(read.data.gameplay.inventory.wood, 8);
});

test('a saved island stays well under the 500 KB budget', () => {
  const { descriptor, state } = playing();
  const json = JSON.stringify(serializeSnapshot(descriptor, state));
  assert.ok(json.length < 500_000, `bytes=${json.length}`);
});

test('Continue does not regenerate layout from the seed alone', () => {
  const { descriptor, state } = playing();
  const snapshot = serializeSnapshot(descriptor, state);
  const shifted = snapshot.descriptor.nodes.find(node => node.id === 'tree-0').x + 3.5;
  snapshot.descriptor.nodes.find(node => node.id === 'tree-0').x = shifted;
  snapshot.gameplay.resources.find(item => item.id === 'tree-0').x = shifted;
  const restored = restoreState(snapshot.descriptor, snapshot.gameplay);
  assert.equal(restored.resources.find(item => item.id === 'tree-0').x, shifted);
  const fresh = generateWorld('hearthwild-review-a');
  assert.notEqual(fresh.nodes.find(node => node.id === 'tree-0').x, shifted);
});

test('schema 1 islands migrate to empty structures without losing progress', () => {
  const { descriptor, state, tree } = playing();
  const current = serializeSnapshot(descriptor, state, { sequence: 4, savedAt: 9 });
  const legacy = JSON.parse(JSON.stringify(current));
  legacy.schemaVersion = 1;
  delete legacy.gameplay.structures;
  delete legacy.gameplay.nextStructureId;
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.schemaVersion, 6);
  assert.deepEqual(checked.data.gameplay.structures, []);
  assert.equal(checked.data.gameplay.nextStructureId, 1);
  assert.deepEqual(checked.data.gameplay.soilPatches, []);
  assert.equal(checked.data.gameplay.nextSoilId, 1);
  assert.equal(checked.data.gameplay.discovery.workbench, false);
  assert.equal(checked.data.gameplay.discovery.furnace, false);
  assert.equal(checked.data.gameplay.discovery.copperIngot, false);
  assert.equal(checked.data.gameplay.discovery.cropHarvest, false);
  assert.deepEqual(checked.data.gameplay.crops, []);
  assert.equal(checked.data.gameplay.harvestCount, 0);
  assert.equal(checked.data.gameplay.inventory.wood, 8);
  const restored = restoreState(checked.data.descriptor, checked.data.gameplay);
  assert.equal(restored.inventory.wood, 8);
  assert.equal(restored.inventory.carrotSeed, 0);
  assert.equal(resourceById(restored, tree.id).phase, 'stump');
  assert.equal(restored.structures.length, 0);
  assert.equal(restored.worldName, 'Saved Isle');
});

test('schema 2 islands with a workbench infer discovery and keep paid costs', () => {
  const { descriptor, state, tree } = playing();
  state.inventory.wood = 40;
  state.inventory.stone = 20;
  state.player.x = 0;
  state.player.z = 0;
  applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 0 });
  const current = serializeSnapshot(descriptor, state, { sequence: 5, savedAt: 11 });
  const legacy = JSON.parse(JSON.stringify(current));
  legacy.schemaVersion = 2;
  delete legacy.gameplay.discovery;
  for (const structure of legacy.gameplay.structures) {
    delete structure.queue;
    delete structure.output;
    delete structure.nextBatchId;
  }
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.schemaVersion, 6);
  assert.equal(checked.data.gameplay.discovery.workbench, true);
  assert.equal(checked.data.gameplay.discovery.furnace, false);
  assert.equal(checked.data.gameplay.discovery.copperIngot, false);
  assert.equal(checked.data.gameplay.discovery.cropHarvest, false);
  assert.deepEqual(checked.data.gameplay.structures[0].paidCost, { wood: 8, stone: 4 });
  const restored = restoreState(checked.data.descriptor, checked.data.gameplay);
  assert.equal(restored.discovery.workbench, true);
  assert.equal(restored.structures[0].kind, 'workbench');
  assert.equal(resourceById(restored, tree.id).phase, 'stump');
});

test('schema 2 islands without a workbench do not invent workbench discovery', () => {
  const { descriptor, state } = playing();
  const current = serializeSnapshot(descriptor, state);
  const legacy = JSON.parse(JSON.stringify(current));
  legacy.schemaVersion = 2;
  delete legacy.gameplay.discovery;
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.gameplay.discovery.workbench, false);
});

test('invalid furnace queues are rejected and do not replace last-good', () => {
  const storage = memoryStorage();
  const store = createSaveStore(storage);
  const { descriptor, state } = playing();
  assert.equal(store.write(descriptor, state).ok, true);
  const good = storage.getItem(GOOD_KEY);
  const broken = JSON.parse(storage.getItem(SAVE_KEY));
  broken.gameplay.structures = [{
    id: 's-1',
    kind: 'furnace',
    gx: 0,
    gz: 0,
    rotation: 0,
    paidCost: { stone: 12, wood: 4 },
    queue: Array.from({ length: 11 }, (_, i) => ({ id: `b-${i}`, recipeId: 'copperIngot', remaining: 8 })),
    output: { copperIngot: 1 },
    nextBatchId: 12,
  }];
  broken.gameplay.nextStructureId = 2;
  broken.gameplay.discovery = { workbench: true, furnace: true, copperIngot: false };
  storage.setItem(SAVE_KEY, JSON.stringify(broken));
  const read = store.read();
  assert.equal(read.ok, true);
  assert.equal(read.recovered, true);
  assert.equal(storage.getItem(GOOD_KEY), good);
  assert.equal(validateSnapshot(broken).ok, false);
});

test('invalid structure data is rejected and does not replace last-good', () => {
  const storage = memoryStorage();
  const store = createSaveStore(storage);
  const { descriptor, state } = playing();
  assert.equal(store.write(descriptor, state).ok, true);
  const good = storage.getItem(GOOD_KEY);
  const broken = JSON.parse(storage.getItem(SAVE_KEY));
  broken.gameplay.structures = [{ id: 's-1', kind: 'spaceship', gx: 0, gz: 0, rotation: 0, paidCost: {} }];
  broken.gameplay.nextStructureId = 2;
  storage.setItem(SAVE_KEY, JSON.stringify(broken));
  const read = store.read();
  assert.equal(read.ok, true);
  assert.equal(read.recovered, true);
  assert.equal(storage.getItem(GOOD_KEY), good);
  assert.equal(validateSnapshot(broken).ok, false);
});

function schema4GardenFixture() {
  const descriptor = generateWorld('hearthwild-review-a');
  const state = createState(descriptor, { name: 'Legacy Garden' });
  applyCommand(state, { type: 'enter' });
  const snapshot = serializeSnapshot(descriptor, state);
  snapshot.schemaVersion = 4;
  snapshot.generatorVersion = 'hearthwild-04';
  snapshot.descriptor.generatorVersion = 'hearthwild-04';
  for (const node of snapshot.descriptor.nodes) {
    if (node.kind === 'carrot' || node.kind === 'potato') node.kind = 'seed';
  }
  for (const resource of snapshot.gameplay.resources) {
    if (resource.kind === 'carrot' || resource.kind === 'potato') resource.kind = 'seed';
  }
  const seeds = snapshot.descriptor.nodes.filter(node => node.kind === 'seed').sort((a, b) => a.id.localeCompare(b.id));
  const depleted = snapshot.gameplay.resources.find(item => item.id === seeds[0].id);
  depleted.phase = 'depleted';
  depleted.readyAt = snapshot.gameplay.elapsed + 60;
  snapshot.gameplay.inventory.turnip = 3;
  snapshot.gameplay.inventory.turnipSeed = 6;
  snapshot.gameplay.inventory.moonflower = 2;
  snapshot.gameplay.inventory.moonflowerSeed = 4;
  snapshot.gameplay.inventory.carrot = 1;
  snapshot.gameplay.inventory.carrotSeed = 0;
  snapshot.gameplay.structures.push(
    { id: 's-1', kind: 'soil', gx: 0, gz: 1, rotation: 0, paidCost: {} },
    { id: 's-2', kind: 'soil', gx: 1, gz: 1, rotation: 0, paidCost: {} },
  );
  snapshot.gameplay.nextStructureId = 3;
  snapshot.gameplay.crops = [
    { id: 'c-1', soilId: 's-1', species: 'turnip', remaining: 45 },
    { id: 'c-2', soilId: 's-2', species: 'moonflower', remaining: 75 },
  ];
  snapshot.gameplay.nextCropId = 3;
  snapshot.depletedSeedId = depleted.id;
  return snapshot;
}

test('schema 4 gardens convert species, seed nodes, timers and keep leftover flowers', () => {
  const legacy = schema4GardenFixture();
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.schemaVersion, 6);
  assert.equal(checked.data.generatorVersion, 'hearthwild-04');
  assert.equal(checked.data.descriptor.generatorVersion, 'hearthwild-04');
  assert.equal(checked.data.gameplay.inventory.carrot, 4);
  assert.equal(checked.data.gameplay.inventory.carrotSeed, 6);
  assert.equal(checked.data.gameplay.inventory.potatoSeed, 4);
  assert.equal(checked.data.gameplay.inventory.moonflower, 2);
  assert.equal(checked.data.gameplay.inventory.turnip, undefined);
  assert.equal(checked.data.gameplay.inventory.turnipSeed, undefined);
  assert.equal(checked.data.gameplay.inventory.moonflowerSeed, undefined);
  const carrotCrop = checked.data.gameplay.crops.find(item => item.id === 'c-1');
  const potatoCrop = checked.data.gameplay.crops.find(item => item.id === 'c-2');
  assert.equal(carrotCrop.species, 'carrot');
  assert.equal(carrotCrop.remaining, 45);
  assert.equal(carrotCrop.soilId, 'soil-legacy-s-1');
  assert.equal(potatoCrop.species, 'potato');
  assert.equal(potatoCrop.remaining, 60);
  assert.equal(potatoCrop.soilId, 'soil-legacy-s-2');
  const patches = checked.data.gameplay.soilPatches;
  assert.equal(patches.length, 2);
  assert.equal(patches[0].id, 'soil-legacy-s-1');
  assert.equal(patches[0].x, 0);
  assert.equal(patches[0].z, 1);
  assert.equal(patches[0].shapeVersion, 1);
  assert.equal(patches[1].id, 'soil-legacy-s-2');
  assert.equal(patches[1].x, 1);
  assert.equal(patches[1].z, 1);
  assert.equal(checked.data.gameplay.structures.filter(item => item.kind === 'soil').length, 0);
  assert.equal(checked.data.gameplay.nextStructureId, 3);
  assert.equal(checked.data.gameplay.nextSoilId, 1);
  assert.equal(checked.data.descriptor.nodes.some(node => node.kind === 'seed'), false);
  assert.ok(checked.data.descriptor.nodes.some(node => node.kind === 'carrot'));
  assert.ok(checked.data.descriptor.nodes.some(node => node.kind === 'potato'));
  const protectedKinds = checked.data.descriptor.nodes
    .filter(node => node.protected && (node.kind === 'carrot' || node.kind === 'potato'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(node => node.kind);
  assert.equal(protectedKinds[0], 'carrot');
  assert.equal(protectedKinds[1], 'potato');
  for (const node of checked.data.descriptor.nodes) {
    const live = checked.data.gameplay.resources.find(item => item.id === node.id);
    assert.equal(live.kind, node.kind);
  }
  const depleted = checked.data.gameplay.resources.find(item => item.id === legacy.depletedSeedId);
  assert.equal(depleted.phase, 'depleted');
  assert.ok(Math.abs(depleted.readyAt - (checked.data.gameplay.elapsed + 90)) < 1e-9);
  const restored = restoreState(checked.data.descriptor, checked.data.gameplay);
  assert.equal(restored.inventory.moonflower, 2);
  assert.equal(restored.inventory.carrotSeed, 6);
  assert.equal(restored.structures.some(item => item.kind === 'soil'), false);
  assert.equal(restored.nextStructureId, 3);
  assert.equal(restored.equipment.hoe, false);
  assert.equal('hoe' in restored.equipment, true);
  const fresh = generateWorld('hearthwild-review-a');
  assert.equal(fresh.generatorVersion, 'hearthwild-05');
  assert.notEqual(checked.data.generatorVersion, fresh.generatorVersion);
});

test('schema 4 inventory overflow is rejected instead of clamping', () => {
  const legacy = schema4GardenFixture();
  legacy.gameplay.inventory.turnipSeed = 1_000_000_000;
  legacy.gameplay.inventory.carrotSeed = 1;
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'bad-inventory');
});

test('schema 5 soil structures become legacy patches and remap crop links', () => {
  const { descriptor, state } = playing();
  state.inventory.carrotSeed = 2;
  state.inventory.wood = 12;
  state.inventory.stone = 8;
  state.player.x = 0;
  state.player.z = 0;
  const occupied = addSoilStructure(state, 0, 1);
  const empty = addSoilStructure(state, 1, 1);
  assert.ok(occupied && empty);
  stand(state, occupied.gx, occupied.gz);
  finishField(state, { action: 'plantCrop', targetId: occupied.id, species: 'carrot' });
  const snapshot = serializeSnapshot(descriptor, state);
  snapshot.schemaVersion = 5;
  delete snapshot.gameplay.soilPatches;
  delete snapshot.gameplay.nextSoilId;
  for (const structure of snapshot.gameplay.structures) {
    if (structure.kind === 'soil') structure.paidCost = { wood: 8, stone: 4 };
  }
  const keptWood = snapshot.gameplay.inventory.wood;
  const keptStone = snapshot.gameplay.inventory.stone;
  const keptNextStructureId = snapshot.gameplay.nextStructureId;
  const cropId = snapshot.gameplay.crops[0].id;
  assert.equal(snapshot.gameplay.crops[0].soilId, occupied.id);

  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.schemaVersion, 6);
  const occupiedPatchId = legacySoilPatchId(occupied.id);
  const emptyPatchId = legacySoilPatchId(empty.id);
  const patches = checked.data.gameplay.soilPatches;
  assert.equal(patches.length, 2);
  const occupiedPatch = patches.find(item => item.id === occupiedPatchId);
  const emptyPatch = patches.find(item => item.id === emptyPatchId);
  assert.equal(occupiedPatch.x, 0);
  assert.equal(occupiedPatch.z, 1);
  assert.equal(occupiedPatch.shapeVersion, 1);
  assert.equal(occupiedPatch.shapeSeed, soilPatchShapeSeed(snapshot.seed, occupied.id));
  assert.equal(emptyPatch.x, 1);
  assert.equal(emptyPatch.z, 1);
  assert.equal(checked.data.gameplay.crops[0].id, cropId);
  assert.equal(checked.data.gameplay.crops[0].soilId, occupiedPatchId);
  assert.equal(checked.data.gameplay.structures.filter(item => item.kind === 'soil').length, 0);
  assert.equal(checked.data.gameplay.nextStructureId, keptNextStructureId);
  assert.equal(checked.data.gameplay.nextSoilId, 1);
  assert.equal(checked.data.gameplay.inventory.wood, keptWood);
  assert.equal(checked.data.gameplay.inventory.stone, keptStone);
  const again = validateSnapshot(snapshot);
  assert.equal(again.data.gameplay.soilPatches.find(item => item.id === occupiedPatchId).shapeSeed, occupiedPatch.shapeSeed);
  assert.notEqual(occupiedPatch.shapeSeed, emptyPatch.shapeSeed);

  const restored = restoreState(checked.data.descriptor, checked.data.gameplay);
  assert.equal(cropBySoilId(restored, occupied.id).id, cropId);
  assert.equal(cropBySoilId(restored, occupiedPatchId).id, cropId);
  assert.equal(restored.soilPatches.length, 2);
  assert.equal(restored.structures.some(item => item.kind === 'soil'), false);
  assert.equal(restored.nextStructureId, keptNextStructureId);
  assert.equal(restored.inventory.wood, keptWood);
  assert.equal(restored.inventory.stone, keptStone);
  assert.equal(restored.equipment.hoe, false);
  stand(restored, 1, 1);
  finishField(restored, { action: 'plantCrop', targetId: emptyPatchId, species: 'carrot' });
  assert.equal(applyCommand(restored, { type: 'place', kind: 'floor', gx: 0, gz: 1, rotation: 0 }).ok, false);
  assert.equal(applyCommand(restored, { type: 'place', kind: 'floor', gx: 0, gz: 1, rotation: 0 }).reason, 'occupied-ground');
  const catalogSoil = applyCommand(restored, { type: 'place', kind: 'soil', gx: 0, gz: 2, rotation: 0 });
  assert.equal(catalogSoil.ok, false);
  assert.equal(catalogSoil.reason, 'unknown-piece');
  assert.equal(restored.structures.filter(item => item.kind === 'soil').length, 0);
  assert.equal(restored.nextStructureId, keptNextStructureId);
  assert.equal(restored.nextSoilId, 1);
});

test('schema 6 leftover converted soil structures detach without refund or id reuse', () => {
  const { descriptor, state } = playing();
  state.inventory.wood = 40;
  state.inventory.stone = 20;
  stand(state, 0, 0);
  addSoilStructure(state, 0, 1);
  assert.equal(applyCommand(state, { type: 'place', kind: 'workbench', gx: 2, gz: 0, rotation: 0 }).ok, true);
  const snapshot = serializeSnapshot(descriptor, state);
  const soil = snapshot.gameplay.structures.find(item => item.kind === 'soil');
  soil.paidCost = { wood: 8, stone: 4 };
  snapshot.gameplay.soilPatches = soilPatchesFromStructures(
    snapshot.gameplay.structures,
    snapshot.seed,
  ).patches;
  const wood = snapshot.gameplay.inventory.wood;
  const stone = snapshot.gameplay.inventory.stone;
  const nextId = snapshot.gameplay.nextStructureId;
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.schemaVersion, 6);
  assert.equal(checked.data.gameplay.structures.filter(item => item.kind === 'soil').length, 0);
  assert.equal(checked.data.gameplay.structures.find(item => item.kind === 'workbench')?.id, 's-2');
  assert.equal(checked.data.gameplay.nextStructureId, nextId);
  assert.equal(checked.data.gameplay.nextSoilId, 1);
  assert.equal(checked.data.gameplay.inventory.wood, wood);
  assert.equal(checked.data.gameplay.inventory.stone, stone);
  assert.equal(checked.data.gameplay.soilPatches[0].id, legacySoilPatchId(soil.id));
});

test('converted soil with mismatched geometry is rejected', () => {
  const { descriptor, state } = playing();
  stand(state, 0, 0);
  addSoilStructure(state, 0, 1);
  const snapshot = serializeSnapshot(descriptor, state);
  snapshot.gameplay.soilPatches = soilPatchesFromStructures(
    snapshot.gameplay.structures,
    snapshot.seed,
  ).patches;
  snapshot.gameplay.soilPatches[0].z = 4;
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'bad-soil');
});

test('schema 6 keeps adjacent legacy outlines and rejects a new patch in spawn', () => {
  const legacy = schema4GardenFixture();
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, true, checked.reason);
  const [left, right] = checked.data.gameplay.soilPatches;
  assert.equal(Math.hypot(left.x - right.x, left.z - right.z), 1);
  const tampered = JSON.parse(JSON.stringify(checked.data));
  tampered.gameplay.soilPatches.push({
    id: 'soil-1',
    x: 0,
    z: 0,
    shapeSeed: 9,
    shapeVersion: 1,
  });
  tampered.gameplay.nextSoilId = 2;
  const blocked = validateSnapshot(tampered);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'bad-soil');
  const stacked = JSON.parse(JSON.stringify(checked.data));
  stacked.gameplay.soilPatches[1].x = stacked.gameplay.soilPatches[0].x;
  stacked.gameplay.soilPatches[1].z = stacked.gameplay.soilPatches[0].z;
  const overlap = validateSnapshot(stacked);
  assert.equal(overlap.ok, false);
  assert.equal(overlap.reason, 'bad-soil');
});

function schema5CrowdedGarden(patchCount) {
  const { descriptor, state } = playing();
  const snapshot = serializeSnapshot(descriptor, state);
  snapshot.schemaVersion = 5;
  delete snapshot.gameplay.soilPatches;
  delete snapshot.gameplay.nextSoilId;
  snapshot.gameplay.equipment = { ...snapshot.gameplay.equipment, hoe: true };
  const cols = 10;
  snapshot.gameplay.structures = Array.from({ length: patchCount }, (_, i) => ({
    id: `s-${i + 1}`,
    kind: 'soil',
    gx: i % cols,
    gz: Math.floor(i / cols) + 1,
    rotation: 0,
    paidCost: {},
  }));
  snapshot.gameplay.nextStructureId = patchCount + 1;
  snapshot.gameplay.crops = [
    { id: 'c-1', soilId: 's-1', species: 'carrot', remaining: 40 },
    { id: 'c-2', soilId: 's-2', species: 'potato', remaining: 90 },
  ];
  snapshot.gameplay.nextCropId = 3;
  snapshot.gameplay.inventory.carrotSeed = 2;
  snapshot.gameplay.harvestCount = 4;
  return snapshot;
}

test('empty and occupied plots convert, over-cap patches stay, and hoe is not granted', () => {
  const legacy = schema5CrowdedGarden(70);
  const emptyId = 's-3';
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.schemaVersion, 6);
  const patches = checked.data.gameplay.soilPatches;
  assert.equal(patches.length, 70);
  assert.ok(patches.length > SOIL_PATCH_CAP);
  assert.equal(patches.filter(item => item.id.startsWith('soil-legacy-')).length, 70);
  assert.equal(checked.data.gameplay.structures.filter(item => item.kind === 'soil').length, 0);
  const carrot = checked.data.gameplay.crops.find(item => item.id === 'c-1');
  const potato = checked.data.gameplay.crops.find(item => item.id === 'c-2');
  assert.equal(carrot.soilId, 'soil-legacy-s-1');
  assert.equal(carrot.species, 'carrot');
  assert.equal(carrot.remaining, 40);
  assert.equal(potato.soilId, 'soil-legacy-s-2');
  assert.equal(potato.remaining, 90);
  assert.equal(checked.data.gameplay.crops.length, 2);
  assert.ok(patches.some(item => item.id === legacySoilPatchId(emptyId)));
  assert.equal(checked.data.gameplay.crops.some(item => item.soilId === legacySoilPatchId(emptyId)), false);
  assert.equal(checked.data.gameplay.equipment.hoe, false);
  assert.equal(checked.data.gameplay.harvestCount, 4);
  assert.equal(checked.data.gameplay.nextCropId, 3);
  assert.equal(checked.data.gameplay.nextStructureId, 71);

  const restored = restoreState(checked.data.descriptor, checked.data.gameplay);
  assert.equal(restored.soilPatches.length, 70);
  assert.equal(restored.equipment.hoe, false);
  assert.equal(cropBySoilId(restored, 's-1').remaining, 40);
  assert.equal(cropBySoilId(restored, 'soil-legacy-s-2').remaining, 90);
  stand(restored, 0, 1);
  const early = applyCommand(restored, { type: 'startAction', action: 'harvestCrop', targetId: 'soil-legacy-s-1' });
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'immature');
  restored.crops.find(item => item.id === 'c-1').remaining = 0;
  finishField(restored, { action: 'harvestCrop', targetId: 'soil-legacy-s-1' });
  assert.equal(restored.inventory.carrot, 2);
  assert.equal(restored.inventory.carrotSeed, 3);
  assert.equal(restored.equipment.hoe, false);
  stand(restored, 2, 1);
  finishField(restored, { action: 'plantCrop', targetId: 'soil-legacy-s-3', species: 'carrot' });
  const till = validateNewSoilPatch({ id: 'soil-1', x: 20, z: 20, shapeSeed: 9 }, restored.soilPatches, { x: 0, z: 0 });
  assert.equal(till.ok, false);
  assert.equal(till.reason, 'soil-cap');
});

test('import safety maximum rejects more than 300 patches without dropping extras to load', () => {
  const legacy = schema5CrowdedGarden(70);
  const checked = validateSnapshot(legacy);
  assert.equal(checked.ok, true, checked.reason);
  const tooMany = JSON.parse(JSON.stringify(checked.data));
  tooMany.gameplay.soilPatches = Array.from({ length: SOIL_PATCH_IMPORT_MAX + 1 }, (_, i) => ({
    id: `soil-legacy-s-${i + 1}`,
    x: (i % 20) * 1.1,
    z: 4 + Math.floor(i / 20) * 1.1,
    shapeSeed: i + 1,
    shapeVersion: 1,
  }));
  const rejected = validateSnapshot(tooMany);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'soil-cap');
  assert.equal(tooMany.gameplay.soilPatches.length, SOIL_PATCH_IMPORT_MAX + 1);
});

test('a crafted hoe survives Continue and is not stripped on copy', () => {
  const { descriptor, state } = playing();
  state.equipment.hoe = true;
  const snapshot = serializeSnapshot(descriptor, state);
  assert.equal(snapshot.gameplay.equipment.hoe, true);
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true, checked.reason);
  assert.equal(checked.data.gameplay.equipment.hoe, true);
  const restored = restoreState(checked.data.descriptor, checked.data.gameplay);
  assert.equal(restored.equipment.hoe, true);
});

function addSoilStructure(state, gx, gz) {
  const id = `s-${state.nextStructureId}`;
  state.nextStructureId += 1;
  const structure = { id, kind: 'soil', gx, gz, rotation: 0, paidCost: {} };
  state.structures.push(structure);
  return structure;
}

function cloneSave(data) {
  return JSON.parse(JSON.stringify(data));
}

test('dangling and duplicate crops reject the whole save instead of dropping records', () => {
  const storage = memoryStorage();
  const store = createSaveStore(storage);
  const { descriptor, state } = playing();
  assert.equal(store.write(descriptor, state).ok, true);
  const good = storage.getItem(GOOD_KEY);
  const legacy = schema4GardenFixture();
  const valid = validateSnapshot(legacy);
  assert.equal(valid.ok, true, valid.reason);
  assert.equal(valid.data.gameplay.crops.length, 2);

  const dangling = cloneSave(valid.data);
  dangling.gameplay.crops.push({
    id: 'c-9',
    soilId: 'missing-plot',
    species: 'carrot',
    remaining: 12,
  });
  dangling.gameplay.nextCropId = 10;
  const orphaned = validateSnapshot(dangling);
  assert.equal(orphaned.ok, false);
  assert.equal(orphaned.reason, 'orphan-crop');
  assert.equal(dangling.gameplay.crops.length, 3);

  storage.setItem(SAVE_KEY, JSON.stringify(dangling));
  const recovered = store.read();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovered, true);
  assert.equal(storage.getItem(GOOD_KEY), good);
  assert.equal((recovered.data.gameplay.crops || []).some(item => item.soilId === 'missing-plot'), false);
  assert.notEqual((recovered.data.gameplay.crops || []).length, dangling.gameplay.crops.length);

  const duplicates = cloneSave(valid.data);
  duplicates.gameplay.crops.push({
    id: 'c-8',
    soilId: 's-1',
    species: 'potato',
    remaining: 8,
  });
  duplicates.gameplay.nextCropId = 9;
  const owned = validateSnapshot(duplicates);
  assert.equal(owned.ok, false);
  assert.equal(owned.reason, 'duplicate-crop');
  assert.equal(duplicates.gameplay.crops.length, 3);

  const sameId = cloneSave(valid.data);
  sameId.gameplay.crops.push({ ...sameId.gameplay.crops[0], remaining: 1 });
  const copied = validateSnapshot(sameId);
  assert.equal(copied.ok, false);
  assert.equal(copied.reason, 'duplicate-crop');
});

test('species, timers, seed counts, caps and next ids reject without auto-repair', () => {
  const legacy = schema4GardenFixture();
  const valid = validateSnapshot(legacy);
  assert.equal(valid.ok, true, valid.reason);

  const species = cloneSave(valid.data);
  species.gameplay.crops[0].species = 'turnip';
  assert.equal(validateSnapshot(species).ok, false);
  assert.equal(validateSnapshot(species).reason, 'bad-crop');

  const infinite = cloneSave(valid.data);
  infinite.gameplay.crops[0].remaining = Infinity;
  assert.equal(validateSnapshot(infinite).ok, false);
  assert.equal(validateSnapshot(infinite).reason, 'bad-timer');

  const overgrown = cloneSave(valid.data);
  overgrown.gameplay.crops[0].remaining = 10_000;
  assert.equal(validateSnapshot(overgrown).ok, false);
  assert.equal(validateSnapshot(overgrown).reason, 'bad-timer');

  const seeds = cloneSave(valid.data);
  seeds.gameplay.inventory.carrotSeed = 1.5;
  assert.equal(validateSnapshot(seeds).ok, false);
  assert.equal(validateSnapshot(seeds).reason, 'bad-inventory');
  const negative = cloneSave(valid.data);
  negative.gameplay.inventory.potatoSeed = -1;
  assert.equal(validateSnapshot(negative).ok, false);
  assert.equal(validateSnapshot(negative).reason, 'bad-inventory');

  const cropIds = cloneSave(valid.data);
  cropIds.gameplay.nextCropId = 1;
  assert.equal(validateSnapshot(cropIds).ok, false);
  assert.equal(validateSnapshot(cropIds).reason, 'bad-crop-id');

  const missingSoilId = cloneSave(valid.data);
  delete missingSoilId.gameplay.nextSoilId;
  assert.equal(validateSnapshot(missingSoilId).ok, false);
  assert.equal(validateSnapshot(missingSoilId).reason, 'bad-soil-id');

  const withNew = cloneSave(valid.data);
  withNew.gameplay.soilPatches.push({
    id: 'soil-1',
    x: 0,
    z: 3,
    shapeSeed: 11,
    shapeVersion: 1,
  });
  withNew.gameplay.nextSoilId = 2;
  const placed = validateSnapshot(withNew);
  assert.equal(placed.ok, true, placed.reason);
  withNew.gameplay.nextSoilId = 1;
  const blockedAllocator = validateSnapshot(withNew);
  assert.equal(blockedAllocator.ok, false);
  assert.equal(blockedAllocator.reason, 'bad-soil-id');

  const tooManyCrops = cloneSave(valid.data);
  tooManyCrops.gameplay.soilPatches = Array.from({ length: CROP_CAP + 1 }, (_, i) => ({
    id: `soil-legacy-s-${i + 1}`,
    x: i % 10,
    z: 4 + Math.floor(i / 10),
    shapeSeed: i + 1,
    shapeVersion: 1,
  }));
  tooManyCrops.gameplay.crops = Array.from({ length: CROP_CAP + 1 }, (_, i) => ({
    id: `c-${i + 1}`,
    soilId: `soil-legacy-s-${i + 1}`,
    species: 'carrot',
    remaining: 10,
  }));
  tooManyCrops.gameplay.nextCropId = CROP_CAP + 2;
  const capped = validateSnapshot(tooManyCrops);
  assert.equal(capped.ok, false);
  assert.equal(capped.reason, 'crop-cap');
  assert.equal(tooManyCrops.gameplay.crops.length, CROP_CAP + 1);
});

test('new patches overlapping structures, resources or the cliff fail load', () => {
  const { descriptor, state } = playing();
  const snapshot = serializeSnapshot(descriptor, state);
  const tree = snapshot.gameplay.resources.find(item => item.kind === 'tree');
  assert.ok(tree);

  const onWorkbench = cloneSave(snapshot);
  onWorkbench.gameplay.structures.push({
    id: 's-9',
    kind: 'workbench',
    gx: 2,
    gz: 0,
    rotation: 0,
    paidCost: { wood: 8, stone: 4 },
  });
  onWorkbench.gameplay.nextStructureId = 10;
  onWorkbench.gameplay.soilPatches = [{
    id: 'soil-1',
    x: 2,
    z: 0,
    shapeSeed: 4,
    shapeVersion: 1,
  }];
  onWorkbench.gameplay.nextSoilId = 2;
  const occupied = validateSnapshot(onWorkbench);
  assert.equal(occupied.ok, false);
  assert.equal(occupied.reason, 'bad-soil');

  const onTree = cloneSave(snapshot);
  onTree.gameplay.soilPatches = [{
    id: 'soil-1',
    x: tree.x,
    z: tree.z,
    shapeSeed: 5,
    shapeVersion: 1,
  }];
  onTree.gameplay.nextSoilId = 2;
  const blocked = validateSnapshot(onTree);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'bad-soil');

  const offCliff = cloneSave(snapshot);
  offCliff.gameplay.soilPatches = [{
    id: 'soil-1',
    x: 200,
    z: 200,
    shapeSeed: 6,
    shapeVersion: 1,
  }];
  offCliff.gameplay.nextSoilId = 2;
  const cliff = validateSnapshot(offCliff);
  assert.equal(cliff.ok, false);
  assert.equal(cliff.reason, 'bad-soil');

  const duplicatePatches = cloneSave(snapshot);
  duplicatePatches.gameplay.soilPatches = [
    { id: 'soil-legacy-s-1', x: 0, z: 1, shapeSeed: 1, shapeVersion: 1 },
    { id: 'soil-legacy-s-1', x: 1, z: 1, shapeSeed: 2, shapeVersion: 1 },
  ];
  const copied = validateSnapshot(duplicatePatches);
  assert.equal(copied.ok, false);
  assert.equal(copied.reason, 'duplicate-soil');
});

