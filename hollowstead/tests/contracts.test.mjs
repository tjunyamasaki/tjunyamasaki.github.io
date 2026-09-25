import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../src/engine.mjs';
import {ITEMS, NODES, RULES, phaseAt} from '../src/content.mjs';
import {PROTOCOL} from '../src/network.mjs';
import {
  ACTION_RESULT_FIELDS, ACTION_RESULT_TYPE, BACKPACK_SLOT_COUNT, CHEST_SLOT_COUNT, CONTEXT_ACTIONS,
  CONTRACT, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_ITEMS, FIELD_BUILD_RECIPES, FIRE_COOK_RECIPES,
  INTENTS, MIGRATION_PREFERRED_WEAPON, NIGHT_WAVE_FRACTIONS, PROTOCOL_V1, PROTOCOL_V2,
  RECIPE_CONTEXTS, REMOVED_GAMEPLAY_COMMANDS, RESULT_CODES, SAVE_VERSION_V1, STACK_LIMIT,
  SUPPLY_CAPACITY, SUPPLY_ITEM_IDS, TRANSPORT_HEARTBEAT, V1_PHASE, V1_SAVE_FIELDS, V2_PHASE,
  WORKBENCH_BUILD_RECIPES, WORKBENCH_CRAFT_RECIPES, CAULDRON_COOK_RECIPES,
  containerId, equipmentSlotFor, inCraftRange, inPlaceRange, inReach, itemDefinition,
  legacyEquipmentPlan, nextNightWaveTime, phaseMigrationDelta, phaseProgress, remapPhaseTime,
  remainingNightWaveOffsets, shiftAbsoluteDeadline, splitStackQuantities,
} from '../src/contracts.mjs';

const fixtureDir = new URL('./fixtures/', import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(name, fixtureDir), 'utf8'));
const keys = value => Object.keys(value).sort();
const supplyLoad = inventory => Object.values(inventory).reduce((sum, count) => sum + count, 0);
const stackCount = counts => Object.values(counts).reduce((sum, count) => sum + splitStackQuantities(count).length, 0);
const V1_WORLD_KEYS = ['bossSlain','bossSpawned','buildings','drops','endless','enemies','eventId','events','explored','idCounter','kills','nextSpawn','nodeChanges','players','seed','stats','status','time','version','wave'];
const V1_PLAYER_KEYS = ['action','actionUntil','character','charm','cooldown','courage','dash','dashCooldown','down','dx','dz','equipment','ghost','goal','hp','hunger','id','inventory','lantern','name','notice','noticeAt','online','rest','revive','stamina','x','z'];
const V1_BUILDING_KEYS = ['charges','cooldown','fuel','growth','hp','id','level','maxHp','open','planted','rotation','store','type','x','z'];
const V1_DROP_KEYS = ['count','id','type','until','x','z'];

function assertV1World(world){
  assert.equal(world.version, RULES.version);
  assert.equal(world.version, SAVE_VERSION_V1);
  assert.equal(world.clock, undefined);
  assert.deepEqual(keys(world), V1_WORLD_KEYS);
  assert.equal(world.inputs, undefined);
  assert.equal(world.rng, undefined);
  assert.equal(world.wipe, undefined);
  assert.ok(Array.isArray(world.players) && world.players.length >= 1 && world.players.length <= 4);
  assert.ok(Array.isArray(world.buildings) && world.buildings.length <= 500);
  assert.equal(typeof world.savedAt, 'undefined');
  for (const player of world.players) {
    assert.deepEqual(keys(player), V1_PLAYER_KEYS);
    assert.equal(Array.isArray(player.inventory), false);
    for (const [itemId, count] of Object.entries(player.inventory)) {
      assert.ok(Object.hasOwn(ITEMS, itemId), itemId);
      assert.equal(Number.isInteger(count) && count > 0, true);
    }
    for (const [itemId, durability] of Object.entries(player.equipment)) {
      assert.equal(typeof itemDefinition(itemId)?.maxDurability, 'number');
      assert.equal(Number.isFinite(durability) && durability > 0 && durability <= itemDefinition(itemId).maxDurability, true);
    }
  }
  for (const building of world.buildings) {
    assert.deepEqual(keys(building), V1_BUILDING_KEYS);
    assert.equal(Array.isArray(building.store), false);
  }
  for (const drop of world.drops) {
    assert.deepEqual(keys(drop), V1_DROP_KEYS);
    assert.ok(Object.hasOwn(ITEMS, drop.type) || itemDefinition(drop.type)?.kind === 'equipment');
    assert.equal(Number.isInteger(drop.count) && drop.count > 0, true);
    assert.equal(drop.until, world.time + 600);
  }
  for (const change of world.nodeChanges) {
    assert.equal(change.length, 3);
    const [id, hits, ready] = change;
    assert.equal(typeof id, 'string');
    assert.equal(Number.isFinite(hits) && Number.isFinite(ready), true);
  }
  assert.deepEqual(keys(world.stats), ['built', 'gathered', 'revives']);
  for (const event of world.events) {
    for (const key of ['id', 'type', 'x', 'z', 'text', 'at']) assert.equal(Object.hasOwn(event, key), true);
  }
  if (world.enemies.length) {
    const probe = new World(3);
    probe.spawnEnemy('crawler', 1, 1);
    for (const enemy of world.enemies) assert.deepEqual(keys(enemy), keys(probe.enemies[0]));
  }
  assert.throws(() => World.restore(JSON.parse(JSON.stringify(world))), /not a Hollowstead expedition/);
}

test('runtime clock stays on the v1 baseline while the protocol is hollowstead-2', () => {
  assert.equal(CONTRACT, 'hollowstead-contracts-1');
  assert.equal(PROTOCOL, PROTOCOL_V2);
  assert.equal(PROTOCOL_V1, 'hollowstead-1');
  assert.equal(PROTOCOL_V2, 'hollowstead-2');
  assert.deepEqual(V1_PHASE, {day: RULES.day, dusk: RULES.dusk, night: RULES.night, cycle: RULES.cycle});
  assert.deepEqual(V2_PHASE, {day: 180, dusk: 30, night: 100, cycle: 310});
  assert.equal(V2_PHASE.cycle, V2_PHASE.day + V2_PHASE.dusk + V2_PHASE.night);
  assert.notEqual(V2_PHASE.cycle, RULES.cycle);
  assert.equal(new World(1).clock, 'v1');
  const network = readFileSync(new URL('../src/network.mjs', import.meta.url), 'utf8');
  assert.equal(network.includes('contracts.mjs'), true);
  assert.match(network, /Refresh the page to update/);
  assert.equal(readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('contracts.mjs'), false);
  for (const file of ['renderer.mjs', 'canvas-renderer.mjs']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(source, /t>=180/);
    assert.match(source, /t>150/);
    assert.equal(source.includes('V2_PHASE'), false);
  }
});

test('shared schema names equipment, intents, recipes, and ranges', () => {
  assert.deepEqual(EQUIPMENT_SLOTS, ['chop', 'mine', 'weapon', 'body', 'light']);
  assert.deepEqual(EQUIPMENT_SLOT_ITEMS.weapon, ['spear', 'sword']);
  assert.equal(MIGRATION_PREFERRED_WEAPON, 'sword');
  assert.equal(equipmentSlotFor('torch'), 'light');
  assert.equal(equipmentSlotFor('berry'), null);
  assert.deepEqual(SUPPLY_ITEM_IDS, ['wood', 'stone', 'fiber', 'ore', 'ember', 'seed', 'berry', 'pumpkin', 'mushroom', 'meat', 'roast', 'stew', 'bandage']);
  assert.equal(itemDefinition('wood').stackLimit, STACK_LIMIT);
  assert.equal(itemDefinition('wood').supplyUnits, 1);
  assert.equal(itemDefinition('axe').supplyUnits, 0);
  assert.equal(itemDefinition('axe').equipmentSlot, 'chop');
  assert.equal(itemDefinition('bandage').use, 'heal');
  assert.equal(itemDefinition('stew').use, 'eat');
  assert.equal(itemDefinition('__proto__'), null);
  assert.equal(itemDefinition('constructor'), null);
  assert.equal(BACKPACK_SLOT_COUNT, 6);
  assert.equal(SUPPLY_CAPACITY, 120);
  assert.equal(CHEST_SLOT_COUNT, 18);
  assert.deepEqual(splitStackQuantities(45), [20, 20, 5]);
  assert.equal(splitStackQuantities(0), null);

  const both = legacyEquipmentPlan({axe: 999, pick: 12, spear: 15, sword: 40, armor: 3, torch: 1.5, relic: 1});
  assert.equal(both.sockets.chop.durability, 70);
  assert.equal(both.sockets.weapon.itemId, 'sword');
  assert.deepEqual(both.backpack, [{itemId: 'spear', durability: 15}]);
  assert.equal(both.sockets.light.durability, 1.5);
  assert.deepEqual(both.unknown, ['relic']);
  assert.equal(legacyEquipmentPlan({torch: 0}).sockets.light, null);
  assert.equal(legacyEquipmentPlan({spear: 8}).sockets.weapon.itemId, 'spear');

  assert.deepEqual(FIELD_BUILD_RECIPES, ['fire', 'bench', 'chest', 'wall', 'gate', 'trap', 'farm', 'bed']);
  assert.deepEqual(WORKBENCH_BUILD_RECIPES, [...FIELD_BUILD_RECIPES, 'pot', 'lantern', 'ward']);
  assert.deepEqual(WORKBENCH_CRAFT_RECIPES, ['axe', 'pick', 'spear', 'torch', 'bandage', 'armor', 'sword']);
  assert.deepEqual(FIRE_COOK_RECIPES, ['roast', 'roastMeat', 'roastCaps']);
  assert.deepEqual(CAULDRON_COOK_RECIPES, ['stew']);
  assert.equal(RECIPE_CONTEXTS.fieldBuild.source, 'field');
  assert.equal(RECIPE_CONTEXTS.fieldBuild.stationType, null);
  assert.equal(RECIPE_CONTEXTS.fireCook.label, 'Cooking');
  assert.equal(RECIPE_CONTEXTS.cauldronCook.stationType, 'pot');
  assert.deepEqual(CONTEXT_ACTIONS.hearth, ['feed', 'cook', 'awaken', 'repair']);
  assert.deepEqual(CONTEXT_ACTIONS.bench, ['craft', 'build', 'repair']);
  assert.deepEqual(CONTEXT_ACTIONS.chest, ['open', 'repair']);

  for (const spec of Object.values(INTENTS)) assert.equal(spec.required.includes('requestId'), true, spec.type);
  assert.deepEqual(INTENTS.chestOpen.required, ['requestId', 'chestId']);
  assert.deepEqual(INTENTS.chestRenew.required, ['requestId', 'chestId', 'sessionId']);
  assert.deepEqual(INTENTS.consumeItem.required, ['requestId', 'uid', 'inventoryRevision']);
  assert.deepEqual(INTENTS.lanternToggle.optional, ['uid']);
  assert.deepEqual(INTENTS.placeBuilding.optional, ['stationId']);
  assert.deepEqual(INTENTS.setHarvestTarget.required, ['requestId', 'nodeId', 'mode']);
  assert.deepEqual(INTENTS.chestStoreAll.required, ['requestId', 'chestId', 'sessionId', 'inventoryRevision', 'destinationRevision']);
  assert.deepEqual(INTENTS.chestStack.required, ['requestId', 'chestId', 'sessionId', 'destinationRevision']);
  assert.deepEqual(INTENTS.chestSort.required, ['requestId', 'chestId', 'sessionId', 'destinationRevision']);
  assert.deepEqual(INTENTS.packSort.required, ['requestId', 'inventoryRevision']);
  assert.equal(INTENTS.dropItem.required.includes('inventoryRevision'), true);
  assert.equal(INTENTS.dropItem.required.includes('x'), false);
  assert.equal(ACTION_RESULT_TYPE, 'actionResult');
  assert.deepEqual(ACTION_RESULT_FIELDS, ['type', 'requestId', 'ok', 'code', 'affectedRevisions']);
  assert.equal(RESULT_CODES.chestInUse, 'chestInUse');
  assert.deepEqual(REMOVED_GAMEPLAY_COMMANDS, ['eat', 'ping', 'deposit', 'withdraw']);
  assert.equal(TRANSPORT_HEARTBEAT.pong, 'pong');
  assert.equal(containerId('backpack', 'host'), 'backpack:host');
  assert.equal(containerId('chest', ''), null);

  assert.equal(inReach(RULES.reach), false);
  assert.equal(inReach(RULES.reach - 0.001), true);
  assert.equal(inReach(Number.NaN), false);
  assert.equal(inCraftRange(5), false);
  assert.equal(inCraftRange(4.999), true);
  assert.equal(inPlaceRange(5.5), true);
  assert.equal(inPlaceRange(5.500001), false);
});

test('phase mapping keeps the boundary that is beginning and does not add a wave', () => {
  assert.equal(remapPhaseTime(0), 0);
  assert.equal(remapPhaseTime(150), 180);
  assert.equal(remapPhaseTime(180), 210);
  assert.equal(remapPhaseTime(260), 310);
  assert.equal(remapPhaseTime(75), 90);
  assert.equal(remapPhaseTime(335), 400);
  assert.equal(remapPhaseTime(1220), 1450);
  assert.equal(remapPhaseTime(1300), 1550);
  assert.equal(remapPhaseTime(150 - 1e-9), 180);
  assert.equal(remapPhaseTime(260 - 1e-9), 310);
  assert.equal(phaseProgress(260).cycleIndex, 1);
  assert.equal(phaseProgress(260).name, 'day');
  assert.notEqual(remapPhaseTime(149.999), 180);
  assert.equal(remapPhaseTime(-1), null);
  assert.equal(phaseMigrationDelta(335), 65);
  assert.equal(shiftAbsoluteDeadline(335, 935), 1000);
  assert.deepEqual(NIGHT_WAVE_FRACTIONS, [0, 0.4, 0.8]);
  assert.deepEqual(remainingNightWaveOffsets(0, 100), [40, 80]);
  assert.deepEqual(remainingNightWaveOffsets(40, 100), [80]);
  assert.deepEqual(remainingNightWaveOffsets(80, 100), []);
  assert.equal(nextNightWaveTime(remapPhaseTime(180)), 250);
  assert.equal(nextNightWaveTime(remapPhaseTime(190)), 250);
  assert.equal(nextNightWaveTime(remapPhaseTime(244)), null);
  assert.equal(nextNightWaveTime(0), null);
});

test('v1 fixtures keep the legacy save shape and cannot resume as container worlds', () => {
  const normal = load('v1-normal.json');
  const full = load('v1-full-storage.json');
  const boundaries = load('v1-phase-boundaries.json');
  assert.deepEqual(keys(normal), [...V1_SAVE_FIELDS].sort());
  assert.deepEqual(keys(full), [...V1_SAVE_FIELDS].sort());
  assert.equal(typeof normal.savedAt, 'number');
  assert.equal(typeof full.savedAt, 'number');

  assertV1World(normal.world);
  assertV1World(full.world);
  assert.equal(normal.world.time, 335);
  assert.equal(phaseAt(normal.world.time), 'day');
  assert.equal(normal.world.seed, 402);
  const camper = normal.world.players[0];
  assert.equal(supplyLoad(camper.inventory) < SUPPLY_CAPACITY, true);
  assert.equal(camper.inventory.berry > 0, true);
  assert.deepEqual(keys(camper.equipment), ['axe', 'pick', 'spear', 'torch']);
  assert.equal(camper.lantern, true);
  assert.equal(Number.isInteger(camper.equipment.torch), false);
  const normalChest = normal.world.buildings.find(building => building.type === 'chest');
  assert.deepEqual(normalChest.store, {wood: 2, fiber: 3, stone: 3});
  assert.equal(normal.world.nodeChanges.some(([, hits, ready]) => hits === 0 && ready > normal.world.time), true);
  assert.equal(normal.world.nodeChanges.some(([, hits, ready]) => hits === NODES.rock.hits - 2 && ready === 0), true);
  assert.equal(normal.world.drops[0].count < STACK_LIMIT, true);

  assert.equal(full.world.time, 190);
  assert.equal(phaseAt(full.world.time), 'night');
  assert.notEqual(full.world.time, V1_PHASE.day + V1_PHASE.dusk);
  const [host, guest] = full.world.players;
  assert.equal(supplyLoad(host.inventory), SUPPLY_CAPACITY);
  assert.equal(host.equipment.sword > 0 && host.equipment.spear > 0, true);
  assert.equal(legacyEquipmentPlan(host.equipment).sockets.weapon.itemId, 'sword');
  assert.equal(legacyEquipmentPlan(host.equipment).backpack[0].itemId, 'spear');
  assert.equal(Object.keys(guest.inventory).length, SUPPLY_ITEM_IDS.length);
  assert.equal(supplyLoad(guest.inventory), SUPPLY_ITEM_IDS.length * 100);
  assert.equal(stackCount(guest.inventory) > BACKPACK_SLOT_COUNT, true);
  const fullChest = full.world.buildings.find(building => building.type === 'chest');
  assert.equal(stackCount(fullChest.store) > CHEST_SLOT_COUNT, true);
  assert.equal(fullChest.store.berry, 80);
  assert.equal(fullChest.store.bandage, 80);
  assert.deepEqual(full.world.drops.map(drop => drop.count).sort((a, b) => a - b), [21, 45]);
  assert.equal(full.world.nodeChanges.some(([, , ready]) => ready > full.world.time), true);

  assert.equal(boundaries.schedule.cycle, V1_PHASE.cycle);
  assert.equal(boundaries.saves.length, 8);
  const expected = [
    ['cycle0-day-start', 0, 'day', 0, false],
    ['cycle0-dusk-start', 150, 'dusk', 0, false],
    ['cycle0-night-start', 180, 'night', 3, false],
    ['cycle1-day-start', 260, 'day', 0, false],
    ['cycle1-dusk-start', 410, 'dusk', 0, false],
    ['cycle1-night-start', 440, 'night', 4, false],
    ['cycle4-night-start', 1220, 'night', 8, true],
    ['cycle5-day-start', 1300, 'day', 0, false],
  ];
  assert.deepEqual(boundaries.saves.map(save => [save.name, save.time, save.phase, save.world.enemies.length, save.world.bossSpawned]), expected);
  for (const save of boundaries.saves) {
    assert.equal(save.world.time, save.time);
    assert.equal(phaseAt(save.world.time), save.phase);
    assert.equal(save.world.seed, 402);
    assertV1World(save.world);
    assert.equal(save.world.nodeChanges.some(([, hits, ready]) => ready === 0 && hits > 0 && hits < NODES.tree.hits), true);
    assert.equal(save.world.nodeChanges.some(([, hits, ready]) => hits === 0 && ready === save.time + NODES.rock.regrow), true);
    if (save.phase === 'night') {
      assert.equal(save.world.nextSpawn, save.time + 32);
      assert.equal(save.world.wave, 1);
    } else {
      assert.equal(save.world.nextSpawn, 0);
      assert.equal(save.world.enemies.length, 0);
    }
  }
  const finalNight = boundaries.saves.find(save => save.name === 'cycle4-night-start');
  assert.equal(finalNight.world.enemies.filter(enemy => enemy.type === 'king').length, 1);
  assert.equal(finalNight.world.bossSlain, false);
});
