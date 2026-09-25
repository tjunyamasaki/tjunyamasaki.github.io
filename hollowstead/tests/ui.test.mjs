import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELD_BUILD_RECIPES, WORKBENCH_BUILD_RECIPES, WORKBENCH_CRAFT_RECIPES} from '../src/contracts.mjs';
import {
  allowsCombat, allowsMovement, clusterFor, describeContext, describeMaintenance, escapeStep,
  keyboardAction, keyboardPrimary, resolveMode, showsLantern, usableLantern,
} from '../src/ui/actions.mjs';
import {catalogModel, inCategory} from '../src/ui/catalog.mjs';
import {adjustQuantity, gridStep, itemActionClearsSelection, operationsFor, slotLabel} from '../src/ui/inventory.mjs';

test('mode precedence puts panels above placement and combat', () => {
  assert.equal(resolveMode({ended: true, panel: 'inventory'}), 'end');
  assert.equal(resolveMode({disconnected: true, paused: true}), 'disconnected');
  assert.equal(resolveMode({paused: true, panel: 'menu'}), 'paused');
  assert.equal(resolveMode({down: true, panel: 'inventory'}), 'downed');
  assert.equal(resolveMode({ghost: true}), 'ghost');
  assert.equal(resolveMode({panel: 'chest', placement: true, maintenance: true}), 'chest');
  assert.equal(resolveMode({panel: 'catalog'}), 'catalog');
  assert.equal(resolveMode({panel: 'map', placement: true}), 'inventory');
  assert.equal(resolveMode({placement: true, maintenance: true}), 'placement');
  assert.equal(resolveMode({maintenance: true}), 'maintenance');
  assert.equal(resolveMode({}), 'normal');
  assert.equal(allowsMovement('placement'), true);
  assert.equal(allowsMovement('inventory'), false);
  assert.equal(allowsCombat('normal'), true);
  assert.equal(allowsCombat('placement'), false);
  assert.equal(showsLantern('maintenance'), true);
  assert.equal(showsLantern('chest'), false);
});

test('escape closes drag, details, panel, then placement, before the menu', () => {
  assert.equal(escapeStep({dragging: true, detailsOpen: true, panel: 'inventory', placing: true}), 'cancel-drag');
  assert.equal(escapeStep({detailsOpen: true, panel: 'inventory', placing: true}), 'close-details');
  assert.equal(escapeStep({panel: 'catalog', placing: true, maintaining: true}), 'close-panel');
  assert.equal(escapeStep({placing: true, maintaining: true}), 'cancel-placement');
  assert.equal(escapeStep({maintaining: true}), 'cancel-maintenance');
  assert.equal(escapeStep({}), 'open-menu');
});

test('keyboard map keeps inventory controls and drops C, Q, and G', () => {
  assert.equal(keyboardAction('i'), 'inventory');
  assert.equal(keyboardAction('b'), 'build');
  assert.equal(keyboardAction('m'), 'map');
  assert.equal(keyboardAction('f'), 'lantern');
  assert.equal(keyboardAction('e'), 'primary');
  assert.equal(keyboardAction(' '), 'attack');
  assert.equal(keyboardAction('shift'), 'dodge');
  assert.equal(keyboardAction('1'), 'action-1');
  assert.equal(keyboardAction('4'), 'action-4');
  assert.equal(keyboardAction('c'), null);
  assert.equal(keyboardAction('q'), null);
  assert.equal(keyboardAction('g'), null);
});

test('catalog contexts stay on their lists', () => {
  const field = catalogModel({source: 'field', tab: 'build'});
  assert.deepEqual(field.recipeIds, [...FIELD_BUILD_RECIPES]);
  assert.equal(field.recipeIds.includes('pot'), false);
  assert.equal(field.recipeIds.includes('lantern'), false);
  assert.equal(field.recipeIds.includes('ward'), false);
  assert.equal(field.maintain, true);
  assert.equal(field.tabs.length, 0);
  const bench = catalogModel({source: 'station', stationType: 'bench', tab: 'craft'});
  assert.deepEqual(bench.recipeIds, [...WORKBENCH_CRAFT_RECIPES]);
  assert.equal(bench.tabs.map(tab => tab.id).join(','), 'craft,build');
  assert.equal(bench.maintain, false);
  const built = catalogModel({source: 'station', stationType: 'bench', tab: 'build'});
  assert.deepEqual(built.recipeIds, [...WORKBENCH_BUILD_RECIPES]);
  assert.equal(built.maintain, true);
  assert.deepEqual(catalogModel({source: 'station', stationType: 'pot', tab: 'craft'}).recipeIds, ['stew']);
  assert.deepEqual(catalogModel({source: 'station', stationType: 'hearth', tab: 'craft'}).recipeIds, ['roast', 'roastMeat', 'roastCaps']);
  assert.equal(inCategory('wall', 'defense', 'build'), true);
  assert.equal(inCategory('pot', 'defense', 'build'), false);
  assert.equal(inCategory('axe', 'tool', 'craft'), true);
});

test('context buttons are direct and ordered', () => {
  const heart = describeContext({kind: 'building', type: 'hearth', id: 'h', hp: 10, maxHp: 20, fuel: 0, level: 1, wood: 2, canAwaken: true});
  assert.deepEqual(heart.map(action => action.id), ['feed', 'cook', 'awaken', 'repair']);
  assert.equal(heart[0].command.actionId, 'feed');
  assert.equal(heart[0].command.playerId, undefined);
  assert.equal(heart[1].panel.tab, 'craft');
  const full = describeContext({kind: 'building', type: 'hearth', id: 'h', hp: 20, maxHp: 20, fuel: 10, level: 3, wood: 2, canAwaken: false});
  assert.deepEqual(full.map(action => action.id), ['feed', 'cook']);
  const bench = describeContext({kind: 'building', type: 'bench', id: 'b', hp: 1, maxHp: 2, wood: 0});
  assert.deepEqual(bench.map(action => action.id), ['craft', 'build', 'repair']);
  assert.equal(bench[2].enabled, false);
  const pot = describeContext({kind: 'building', type: 'pot', id: 'p', hp: 2, maxHp: 2, wood: 1});
  assert.deepEqual(pot.map(action => action.id), ['cook']);
  assert.equal(pot[0].panel.stationType, 'pot');
  const busy = describeContext({kind: 'building', type: 'chest', id: 'c', hp: 2, maxHp: 2, busy: true, wood: 0});
  assert.equal(busy[0].id, 'open');
  assert.equal(busy[0].enabled, false);
  assert.equal(busy[0].disabledReason, 'Chest in use');
  const growing = describeContext({kind: 'building', type: 'farm', id: 'f', hp: 2, maxHp: 2, planted: true, growth: 40, wood: 1});
  assert.deepEqual(growing, []);
  const ripe = describeContext({kind: 'building', type: 'farm', id: 'f', hp: 2, maxHp: 2, planted: true, growth: 100, wood: 0});
  assert.equal(ripe[0].id, 'harvest');
  const gate = describeContext({kind: 'building', type: 'gate', id: 'g', hp: 2, maxHp: 2, open: true, wood: 1});
  assert.equal(gate[0].label, 'Close');
  const ore = describeContext({kind: 'node', type: 'ore', id: 'n', required: true, toolReady: false, toolLabel: 'flint pick'});
  assert.equal(ore[0].id, 'mine');
  assert.equal(ore[0].enabled, false);
  assert.equal(ore[0].activation, 'hold');
  const tree = describeContext({kind: 'node', type: 'tree', id: 't', required: false, toolReady: false});
  assert.equal(tree[0].id, 'chop');
  assert.equal(tree[0].enabled, true);
  const drop = describeContext({kind: 'drop', id: 'd'});
  assert.deepEqual(drop, []);
  assert.equal(keyboardPrimary(heart, 'normal').id, 'feed');
});

test('maintenance offers repair and dismantle, never on the heartfire', () => {
  const hearth = describeMaintenance({building: {id: 'h', type: 'hearth', hp: 4, maxHp: 9}, wood: 3, inRange: true});
  assert.deepEqual(hearth.map(action => action.id), ['repair', 'cancel']);
  const chest = describeMaintenance({building: {id: 'c', type: 'chest', hp: 4, maxHp: 9}, locked: true, wood: 3, inRange: true});
  assert.deepEqual(chest.map(action => action.id), ['repair', 'cancel']);
  const wall = describeMaintenance({building: {id: 'w', type: 'wall', hp: 4, maxHp: 9}, wood: 3, inRange: true});
  assert.deepEqual(wall.map(action => action.id), ['repair', 'dismantle', 'cancel']);
  assert.equal(wall[1].activation, 'hold');
  assert.equal(keyboardPrimary(wall, 'maintenance').id, 'repair');
  const intact = describeMaintenance({building: {id: 'w', type: 'wall', hp: 9, maxHp: 9}, wood: 3, inRange: true});
  assert.equal(keyboardPrimary(intact, 'maintenance').id, 'cancel');
  const place = clusterFor('placement', {placement: {valid: false, reason: 'Too close to another structure'}});
  assert.equal(place[0].id, 'place');
  assert.equal(place[0].enabled, false);
  assert.equal(keyboardPrimary(place, 'placement').id, 'place');
  assert.deepEqual(clusterFor('inventory'), []);
});

test('lantern circle follows owned usable fuel only', () => {
  const pack = {inventory: {slots: [null, {itemId: 'torch', durability: 20, uid: 'a'}]}, equipment: {light: null}, lantern: false};
  assert.equal(usableLantern(pack).carried.uid, 'a');
  assert.equal(usableLantern(pack).lit, false);
  const worn = {inventory: {slots: []}, equipment: {light: {itemId: 'torch', durability: 10, uid: 'b'}}, lantern: true};
  assert.equal(usableLantern(worn).lit, true);
  assert.equal(usableLantern({inventory: {slots: [{itemId: 'torch', durability: 0}]}, equipment: {light: {itemId: 'torch', durability: 0}}, lantern: true}), null);
  assert.equal(usableLantern({down: true, inventory: {slots: [{itemId: 'torch', durability: 10}]}, equipment: {}}), null);
});

test('slot labels, quantities, and operations stay explicit', () => {
  assert.equal(slotLabel({empty: true, kind: 'pack', index: 2}), 'Empty pack slot 3');
  assert.equal(slotLabel({empty: true, kind: 'socket', name: 'Chop'}), 'Empty Chop socket');
  assert.match(slotLabel({name: 'Briar spear', quantity: 1, durability: 40, maxDurability: 100, equipped: true}), /Briar spear, condition 40 of 100, equipped/);
  assert.equal(adjustQuantity(20, 20, 'half'), 10);
  assert.equal(adjustQuantity(5, 5, 'half'), 3);
  assert.equal(adjustQuantity(5, 5, 'one'), 1);
  assert.equal(adjustQuantity(5, 1, 'dec'), 1);
  assert.equal(adjustQuantity(5, 5, 'inc'), 5);
  assert.deepEqual(operationsFor({itemId: 'berry', where: 'pack', chestOpen: true}), ['eat', 'drop', 'transfer']);
  assert.deepEqual(operationsFor({itemId: 'bandage', where: 'pack'}), ['heal', 'drop']);
  assert.deepEqual(operationsFor({itemId: 'axe', where: 'pack'}), ['equip', 'drop']);
  assert.deepEqual(operationsFor({itemId: 'axe', where: 'equipment', chestOpen: true}), ['unequip', 'drop', 'transfer']);
  assert.deepEqual(operationsFor({itemId: 'wood', where: 'chest', chestOpen: true}), ['transfer']);
  assert.deepEqual(operationsFor({itemId: 'wood', where: 'recovery'}), ['take']);
  assert.deepEqual(operationsFor({itemId: 'wood', where: 'overflow', chestOpen: true}), ['transfer']);
  for (const op of ['equip', 'unequip', 'swap', 'eat', 'heal', 'drop', 'confirm-drop', 'transfer', 'take', 'store']) {
    assert.equal(itemActionClearsSelection(op), true, op);
  }
  for (const op of ['cancel-drop', 'one', 'half', 'all', 'inc', 'dec']) {
    assert.equal(itemActionClearsSelection(op), false, op);
  }
  assert.equal(gridStep(0, 24, 4, 'arrowdown'), 4);
  assert.equal(gridStep(1, 24, 6, 'arrowleft'), 0);
});
