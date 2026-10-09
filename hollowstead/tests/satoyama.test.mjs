import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../src/engine.mjs';
import {CHARACTERS, ENEMIES, EQUIPMENT, ITEMS, NODES, RECIPES, RULES} from '../src/content.mjs';
import {cellAt, gridWorld} from '../src/homestead.mjs';
import {contextRecipeIds} from '../src/interactions.mjs';
import {PLACES, placeGround, placeNodes, placeProps, placeShape, placeWalkable, placeZone} from '../src/satoyama/land.mjs';
import {ROSTERS, SATOYAMA, START_KIT, travel} from '../src/satoyama/mode.mjs';
import {ANIMALS, HUSBANDRY} from '../src/satoyama/animals.mjs';
import {buildingKey} from '../src/satoyama/view.mjs';
import {loadMagicModules} from '../src/magic/load.mjs';

await loadMagicModules();

const THEME = JSON.parse(readFileSync(new URL('../themes/harvest/theme.json', import.meta.url), 'utf8'));

function farm(seed = 2026){
  const world = new World(seed, {satoyama: true});
  const p = world.addPlayer('host', 'Tester', 'miko');
  world.start();
  return {world, p};
}
let request = 1;
const act = (world, p, target, actionId) => {p.cooldown = 0;return world.action(p.id, {type: 'buildingAction', requestId: `r${request++}`, targetId: target.id, actionId});};
/** Build a camp object on the first free cells near the wanderer. */
function build(world, p, type){
  const [i, j] = cellAt(p.x, p.z);
  for(let r = 1; r < 7; r++)for(let a = -r; a <= r; a++)for(let b = -r; b <= r; b++){
    if(world.action(p.id, {type: 'tile', tool: `obj:${type}`, cells: [[i + a, j + b]]}).ok) return world.buildings.find(q => q.type === type);
  }
  return null;
}
/** Everywhere a walker can reach from (x, z), on the place's grid. */
function reachable(seed, place, from, to){
  const s = placeShape(seed, place), N = s.N, at = (x, z) => Math.floor((z + s.extent) / s.cell) * N + Math.floor((x + s.extent) / s.cell);
  const seen = new Uint8Array(N * N), queue = [at(from.x, from.z)];seen[queue[0]] = 1;
  while(queue.length){const k = queue.pop();for(const n of [k - 1, k + 1, k - N, k + N])if(n >= 0 && n < N * N && !seen[n] && s.grid[n] === 0){seen[n] = 1;queue.push(n);}}
  return !!seen[at(to.x, to.z)];
}

test('both places are built from the seed alone, and a walker can reach every torii from where they arrive', () => {
  for(const seed of [1, 2026, 99991]){
    for(const place of ['farm', 'wilds']){
      const s = placeShape(seed, place);
      assert.equal(placeWalkable(seed, place, s.spawn.x, s.spawn.z), true, `${place} spawn`);
      assert.equal(reachable(seed, place, s.spawn, s.gate), true, `${place} torii`);
      assert.deepEqual(placeNodes(seed, place), placeNodes(seed, place));
      const ground = placeGround(seed, place, THEME.palette);
      assert.equal(ground.rgb.length, ground.size * ground.size * 3);
    }
    // Every place of the wilds can be walked to from the crossing.
    const wilds = placeShape(seed, 'wilds');
    for(const a of wilds.areas) assert.equal(reachable(seed, 'wilds', wilds.spawn, {x: a.x, z: a.z}), true, a.id);
  }
  // The decoration changes with the seed; nothing stands in the middle of the farm.
  assert.notDeepEqual(placeProps(1, 'farm').map(p => p.key).sort(), placeProps(77, 'farm').map(p => p.key).sort());
  const {world} = farm(5);
  assert.equal(world.buildings.length, 0);
  assert.equal(world.nodes.some(n => Math.hypot(n.x, n.z) < 2 && NODES[n.type].landmark), false);
});

test('the farm is cluttered with things to clear; what only the wilds give grows only there', () => {
  const farmTypes = new Set(placeNodes(3, 'farm').map(n => n.type)), wildTypes = new Set(placeNodes(3, 'wilds').map(n => n.type));
  for(const type of ['tree', 'rock', 'weeds', 'twigs', 'pebbles', 'stump', 'farmgate']) assert.equal(farmTypes.has(type), true, type);
  for(const type of ['bamboostand', 'ironseam', 'saltcrust', 'homegate']){assert.equal(wildTypes.has(type), true, type);assert.equal(farmTypes.has(type), false, type);}
  for(const n of placeNodes(3, 'farm')) if(['tree', 'rock', 'stump'].includes(n.type)) assert.ok(n.regrow > 1e6, 'cleared land stays cleared');
  // Every new node, item and recipe has art.
  for(const type of ['weeds', 'twigs', 'pebbles', 'stump', 'ironseam', 'saltcrust']) assert.ok(THEME.sprites[type], type);
  for(const id of ['bamboo', 'ironsand', 'springsalt', 'egg', 'milk', 'daikon', 'soybean', 'daikonseed', 'soyseed', 'tamagoyaki', 'misosoup', 'oden', 'purin']) assert.ok(THEME.sprites[ITEMS[id].icon], id);
  for(const key of ['hen', 'hen-young', 'cow', 'cow-young', 'coop', 'barn', 'crop-daikon', 'crop-soybean', 'y-bench', 'y-chest', 'y-fire', 'y-pot', 'y-bed']) assert.ok(THEME.sprites[key], key);
});

test('nothing comes to the farm, day or night; the wilds keep their own dead', () => {
  const {world, p} = farm();
  for(let t = 0; t < RULES.cycle * 1.2; t += RULES.tick) world.tick();
  assert.equal(world.enemies.length, 0);
  assert.equal(p.courage, 100);
  travel(world, 'wilds');
  // Out of the crossing, into the bamboo.
  const culm = world.nodes.find(n => n.type === 'bamboostand'), spot = world.landNear(culm.x + 1.2, culm.z, 4);
  p.x = spot.x;p.z = spot.z;
  assert.equal(world.regionOf(p.x, p.z), 'chikurin');
  const kinds = new Set();
  for(let i = 0; i < 20 * 60; i++){world.tick();for(const e of world.enemies)kinds.add(e.type);p.hp = p.maxHp || 100;}
  assert.ok(kinds.size > 0);
  for(const k of kinds) assert.equal(ROSTERS.chikurin.some(([id]) => id === k) || ROSTERS.sugimori.some(([id]) => id === k), true, k);
});

test('travel keeps the farm as it was; crops grow and animals have their mornings while you are away', () => {
  const {world, p} = farm(31);
  for(const [id, n] of [['wood', 60], ['bamboo', 20], ['fiber', 40]]) world.give(p, id, n);
  const coop = build(world, p, 'coop');
  assert.ok(coop);
  assert.equal(world.animals.length, 1);
  p.x = coop.x;p.z = coop.z + 1.7;
  assert.equal(act(world, p, coop, 'feed').ok, true);
  assert.equal(coop.hay, HUSBANDRY.feed);
  const [i, j] = cellAt(p.x + 3, p.z + 2.5);
  world.nodes = world.nodes.filter(n => Math.hypot(n.x - (i + .5) * 1.5, n.z - (j + .5) * 1.5) > 1.5 || NODES[n.type].landmark);
  assert.equal(world.action('host', {type: 'tile', tool: 'till', cells: [[i, j]]}).ok, true);
  assert.equal(world.action('host', {type: 'tile', tool: 'plant:daikon', cells: [[i, j]]}).ok, true);
  const cleared = world.nodes.find(n => n.type === 'weeds');cleared.ready = world.time + 1e9;cleared.hits = 0;
  travel(world, 'wilds');
  assert.equal(world.satoyama.place, 'wilds');
  assert.equal(gridWorld(world), false);
  assert.equal(world.buildings.length, 0);
  assert.equal(world.animals.length, 0);
  const left = world.time;
  while(world.time < left + RULES.cycle * 2) world.tick();
  travel(world, 'farm');
  for(let k = 0; k < 5; k++) world.tick();
  assert.equal(world.buildings.some(b => b.id === coop.id), true);
  assert.equal(world.animals.length, 1);
  assert.equal(world.tiles.cells[`${i},${j}`].growth, 100);
  assert.equal(world.nodes.find(n => n.id === cleared.id).ready > world.time, true);
  // Two mornings: two eggs waiting, two bales of hay eaten.
  const home = world.buildings.find(b => b.id === coop.id);
  assert.equal(home.hay, HUSBANDRY.feed - 2);
  assert.equal(home.store.slots.reduce((n, s) => n + (s?.itemId === 'egg' ? s.quantity : 0), 0), 2);
  p.x = home.x;p.z = home.z + 1.7;
  assert.equal(act(world, p, home, 'collect').ok, true);
  assert.equal(world.count(p, 'egg'), 2);
  assert.equal(act(world, p, home, 'hatch').ok, true);
  assert.equal(world.animals.length, 2);
  assert.equal(world.animals.filter(a => a.age === 0).length, 1);
});

test('a barn brings a cow; a happy cow can raise a calf, and petting is once a day', () => {
  const {world, p} = farm(8);
  for(const [id, n] of [['wood', 60], ['bamboo', 20], ['fiber', 60], ['stone', 20], ['ironsand', 4]]) world.give(p, id, n);
  const bench = build(world, p, 'bench');
  assert.ok(bench);
  // The barn is a workbench piece.
  const [i, j] = cellAt(p.x, p.z);let barn = null;
  for(let r = 1; r < 7 && !barn; r++)for(let a = -r; a <= r && !barn; a++)for(let b = -r; b <= r && !barn; b++){
    if(world.action('host', {type: 'tile', tool: 'obj:barn', cells: [[i + a, j + b]], stationId: bench.id}).ok) barn = world.buildings.find(q => q.type === 'barn');
  }
  assert.ok(barn);
  const cow = world.animals.find(a => a.type === 'cow');
  assert.ok(cow);
  p.x = barn.x;p.z = barn.z + 2;
  assert.equal(act(world, p, barn, 'raise').ok, false, 'not happy yet');
  p.x = cow.x;p.z = cow.z + .5;p.cooldown = 0;
  assert.equal(world.action('host', {type: 'animal', op: 'pet', id: cow.id}).ok, true);
  p.cooldown = 0;
  assert.equal(world.action('host', {type: 'animal', op: 'pet', id: cow.id}).ok, false);
  cow.hearts = HUSBANDRY.happy;
  p.x = barn.x;p.z = barn.z + 2;
  assert.equal(act(world, p, barn, 'raise').ok, true);
  assert.equal(world.animals.filter(a => a.type === 'cow').length, 2);
  assert.equal(act(world, p, barn, 'raise').ok, false, `a barn keeps ${ANIMALS.cow.max}`);
});

test('played by class only: no weapon, armour or book is ever made or dropped, and nothing is built in the wilds', () => {
  const lists = [
    contextRecipeIds({source: 'field', tab: 'build', satoyama: 'farm'}),
    contextRecipeIds({source: 'station', stationType: 'bench', tab: 'build', satoyama: 'farm'}),
    contextRecipeIds({source: 'station', stationType: 'bench', tab: 'craft', satoyama: 'farm'}),
    contextRecipeIds({source: 'station', stationType: 'fire', tab: 'craft', satoyama: 'farm'}),
    contextRecipeIds({source: 'station', stationType: 'pot', tab: 'craft', satoyama: 'farm'}),
  ].flat();
  for(const id of lists){
    const out = RECIPES[id].result || id;
    assert.equal(!!EQUIPMENT[out]?.damage, false, `${id} is a weapon`);
    assert.equal(['armor', 'bonemail', 'shardplate'].includes(out), false, id);
  }
  assert.deepEqual(contextRecipeIds({source: 'field', tab: 'build', satoyama: 'wilds'}), []);
  assert.deepEqual(contextRecipeIds({source: 'station', stationType: 'bench', tab: 'build', satoyama: 'wilds'}), []);
  const {world, p} = farm(12);
  assert.equal(world.classed, true);
  assert.equal(world.action('host', {type: 'classPick', classId: 'ronin'}).ok, true);
  travel(world, 'wilds');
  assert.equal(world.canBuild(p, 'fire', p.x + 2, p.z), 'Build on the farm');
  // The dead drop only what they carry: never gear.
  for(let k = 0; k < 30; k++){const e = world.spawnEnemy('daoshi', p.x + 3, p.z, {});e.hp = 0;}
  world.tick();
  assert.ok(world.drops.length > 0);
  for(const d of world.drops) assert.equal(!!EQUIPMENT[d.stack.itemId] || !ITEMS[d.stack.itemId], false, d.stack.itemId);
});

test('a fallen party wakes on the farm with what it carried', () => {
  const {world, p} = farm(13);
  travel(world, 'wilds');
  const carried = p.inventory.slots.filter(Boolean).length;
  p.charm = 0;world.hurt(p, 999);
  for(let i = 0; i < 20 * (SATOYAMA.wipe + 1); i++) world.tick();
  assert.equal(world.satoyama.place, 'farm');
  assert.equal(p.down, 0);
  assert.ok(p.hp > 0);
  assert.equal(p.inventory.slots.filter(Boolean).length, carried);
  assert.equal(world.walkable(p.x, p.z), true);
});

test('a save made in the wilds keeps the farm aside and comes back whole', () => {
  const {world, p} = farm(14);
  for(const [id, n] of [['wood', 40], ['bamboo', 10], ['fiber', 20]]) world.give(p, id, n);
  const coop = build(world, p, 'coop');
  world.stock(coop.store, 'egg', 3);
  travel(world, 'wilds');
  const doc = JSON.parse(JSON.stringify({world: world.snapshot({purpose: 'save'}), savedAt: 1}));
  const back = World.fromSave(doc);
  assert.equal(back.satoyama.place, 'wilds');
  assert.equal(back.radius, PLACES.wilds.extent);
  assert.deepEqual(back.nodes.map(n => n.type), placeNodes(14, 'wilds').map(n => n.type));
  travel(back, 'farm');
  assert.equal(back.buildings.find(b => b.type === 'coop').store.slots.find(Boolean).quantity, 3);
  assert.equal(back.animals.length, 1);
  // Guests are never sent the farm's stash.
  const net = world.snapshot({purpose: 'network'});
  assert.equal('farm' in net.satoyama, false);
  assert.ok(back.idCounter > Math.max(...back.buildings.map(b => Number(b.id.slice(1)))));
});

test('new wanderers bring seeds; the Shrine of Yomi wanderers can be chosen; the camp wears its Yomi look', () => {
  const {p} = farm(15);
  for(const [id, n] of Object.entries(START_KIT)) assert.ok(p.inventory.slots.some(s => s?.itemId === id && s.quantity >= n), id);
  for(const id of ['miko', 'daoshi-wanderer']){
    const c = CHARACTERS.find(q => q.id === id);
    assert.ok(c?.fixed, id);assert.ok(THEME.sprites[id], id);
    const world = new World(1, {satoyama: true});assert.equal(world.addPlayer('host', 'A', id).character, id);
  }
  assert.equal(buildingKey({satoyama: {place: 'farm'}}, 'bench', THEME), 'y-bench');
  assert.equal(buildingKey({}, 'bench', THEME), 'bench');
  assert.equal(placeZone(2026, 'farm', 0, 0), 'satofarm');
  void ENEMIES;
});
