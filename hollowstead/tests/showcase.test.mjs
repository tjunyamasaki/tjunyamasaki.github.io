import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {ENEMIES, EQUIPMENT, ITEMS, NODES, RULES, STRUCTURES} from '../src/content.mjs';
import {makeStack} from '../src/inventory.mjs';
import {collectMagicSprites, magicMobEntries, registerMagicModule} from '../src/magic/registry.mjs?v=harvest-15';
import {clearShowcaseWorld, grantShowcaseItem, placeShowcase, removeShowcaseTarget, showcaseCategories, showcaseMarkup} from '../src/showcase.mjs';

test('showcase catalog stays closed until Spawn and can be dismissed', () => {
  const closed = showcaseMarkup({open: false, tool: ''});
  assert.match(closed, /data-showcase-tool="open"/);
  assert.match(closed, /data-showcase-tool="remove"/);
  assert.equal(closed.includes('showcase-sheet'), false);
  assert.equal(closed.includes('data-showcase-cat'), false);
  assert.equal(closed.includes('data-showcase-spawn'), false);
  const open = showcaseMarkup({open: true, active: 'materials'});
  assert.match(open, /data-showcase-tool="close"/);
  assert.match(open, /data-showcase-cat="materials"/);
  assert.match(open, /data-showcase-spawn="item:/);
  assert.match(open, /showcase-sheet/);
});

test('showcase world has no nodes and the player takes no damage or hunger loss', () => {
  const world = new World(7, {showcase: true});
  assert.equal(world.showcase, true);
  assert.equal(world.nodes.length, 0);
  assert.equal(world.buildings.length, 0);
  assert.equal(world.drops.length, 0);
  assert.equal(world.enemies.length, 0);
  const player = world.addPlayer('host', 'Jun');
  world.start();
  assert.equal(player.hp, 100);
  assert.equal(player.hunger, 100);
  assert.equal(player.courage, 100);
  assert.equal(player.inventory.slots.filter(Boolean).length, 0);
  world.hurt(player, 40);
  world.hurtQuiet(player, 15);
  assert.equal(player.hp, 100);
  assert.equal(player.down, 0);
  world.time = RULES.day + RULES.dusk - 0.02;
  for (let i = 0; i < 400; i++) world.tick();
  assert.equal(world.enemies.length, 0);
  assert.equal(world.nodes.length, 0);
  assert.equal(player.hp, 100);
  assert.equal(player.hunger, 100);
  assert.equal(player.courage, 100);
  assert.equal(player.down, 0);
});

test('showcase list follows the live content tables and can place, remove, and clear', () => {
  const categories = showcaseCategories();
  const ids = name => categories.find(category => category.id === name).entries.map(entry => entry.id);
  assert.deepEqual(ids('nature').sort(), Object.keys(NODES).sort());
  assert.deepEqual(ids('buildings').sort(), Object.keys(STRUCTURES).sort());
  assert.deepEqual(ids('mobs').filter(id => ENEMIES[id]).sort(), Object.keys(ENEMIES).sort());
  const carried = new Set([...ids('materials'), ...ids('food'), ...ids('gear'), ...ids('magic')]);
  for (const id of Object.keys(ITEMS)) assert.equal(carried.has(id), true);
  for (const id of Object.keys(EQUIPMENT)) assert.equal(carried.has(id), true);
  const world = new World(3, {showcase: true});
  const player = world.addPlayer('host', 'Jun');
  world.start();
  player.x = 0;
  player.z = 0;
  const granted = grantShowcaseItem(world, player, 'wood');
  assert.equal(granted.accepted, 1);
  assert.equal(player.inventory.slots.filter(slot => slot?.itemId === 'wood').length, 1);
  const placed = placeShowcase(world, player, 'node', 'tree', 2, 0);
  assert.equal(placed.ok, true);
  assert.equal(world.nodes.length, 1);
  assert.equal(removeShowcaseTarget(world, world.nodes[0]), true);
  assert.equal(world.nodes.length, 0);
  const mob = placeShowcase(world, player, 'mob', 'crawler', 1.5, 0.5);
  assert.equal(mob.ok, true);
  assert.equal(world.enemies.length, 1);
  clearShowcaseWorld(world);
  assert.equal(world.nodes.length, 0);
  assert.equal(world.buildings.length, 0);
  assert.equal(world.enemies.length, 0);
  assert.equal(world.drops.length, 0);
  assert.equal(world.players.length, 1);
  assert.equal(world.players[0].hp, 100);
});

test('each present magic module exports magicPack, use, and step', async () => {
  const names = ['barrow-rattle', 'cinder-staff', 'widows-needle', 'spirit-fan', 'mourning-bell'];
  let present = 0;
  for (const name of names) {
    try {
      const mod = await import(`../src/magic/${name}.mjs`);
      assert.equal(typeof mod.magicPack, 'object');
      assert.ok(mod.magicPack);
      assert.equal(typeof mod.use, 'function');
      assert.equal(typeof mod.step, 'function');
      present += 1;
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    }
  }
  assert.equal(present, 5);
});

async function loadMagic(){
  const names = ['barrow-rattle', 'cinder-staff', 'widows-needle', 'spirit-fan', 'mourning-bell'];
  for(const name of names){
    const url = new URL(`../src/magic/${name}.mjs`, import.meta.url);
    const mod = await import(url);
    registerMagicModule({
      magicPack: mod.magicPack,
      use: mod.use,
      step: mod.step,
      moduleUrl: url.href,
    });
  }
}

function arm(player, itemId, durability){
  const made = makeStack(`w-${itemId}`, itemId, 1, durability);
  assert.equal(made.ok, true);
  player.equipment.weapon = made.stack;
}

test('present magic weapons hit hostiles once and a placed skeleton can be removed', async () => {
  await loadMagic();
  const magic = showcaseCategories().find(category => category.id === 'magic').entries.map(entry => entry.id);
  for(const id of ['barrow-rattle', 'cinder-staff', 'widows-needle', 'spirit-fan', 'mourning-bell']) assert.equal(magic.includes(id), true);
  assert.equal(magicMobEntries().some(entry => entry.id === 'skeleton'), true);
  const sprites = new Set(collectMagicSprites().map(([key]) => key));
  for(const key of ['barrow-rattle', 'cinder-staff', 'widows-needle', 'spirit-fan', 'mourning-bell', 'gravecraft-skeleton']){
    assert.equal(sprites.has(key), true, key);
  }

  const world = new World(11, {showcase: true});
  const player = world.addPlayer('host', 'Jun');
  world.start();
  player.x = 0;
  player.z = 0;
  player.dx = 1;
  player.dz = 0;
  world.spawnEnemy('crawler', 2, 0);
  const crawler = world.enemies[0];

  arm(player, 'widows-needle', 70);
  world.attack(player);
  assert.equal(player.equipment.weapon.durability, 69);
  let rooted = false;
  for(let i = 0; i < 40 && !rooted; i++){
    world.tick();
    rooted = crawler.magicRootRemaining > 0;
  }
  assert.equal(rooted, true);
  assert.equal(crawler.hp, 45);
  const pinned = crawler.x;
  for(let i = 0; i < 10; i++) world.tick();
  assert.equal(crawler.x, pinned);
  assert.equal(player.hp, 100);

  player.cooldown = 0;
  arm(player, 'spirit-fan', 80);
  const beforeFan = crawler.hp;
  const fanX = crawler.x;
  world.attack(player);
  assert.equal(crawler.hp, beforeFan - 5);
  assert.ok(crawler.x > fanX);
  assert.equal(world.magicSweeps.length, 1);

  player.cooldown = 0;
  arm(player, 'cinder-staff', 90);
  const beforeBolt = crawler.hp;
  world.attack(player);
  assert.equal(player.equipment.weapon.durability, 89);
  let burned = false;
  for(let i = 0; i < 40 && crawler.hp > 0; i++){
    world.tick();
    if(crawler.hp <= beforeBolt - 8){burned = true; break;}
  }
  assert.equal(burned, true);
  assert.ok(crawler.hp > beforeBolt - 16);

  crawler.magicRootRemaining = 0;
  delete crawler.magicRootX;
  delete crawler.magicRootZ;
  world.magicRoots = [];
  player.cooldown = 0;
  arm(player, 'barrow-rattle', 60);
  world.attack(player);
  assert.equal(world.magicSummons.length >= 1, true);
  const raised = world.magicSummons[0];
  assert.match(raised.sprite, /skeleton-/);
  crawler.x = raised.x + 0.4;
  crawler.z = raised.z;
  const beforeBones = crawler.hp;
  let struck = false;
  for(let i = 0; i < 50 && crawler.hp > 0; i++){
    crawler.x = raised.x + 0.4;
    crawler.z = raised.z;
    world.tick();
    if(crawler.hp <= beforeBones - 6){struck = true; break;}
  }
  assert.equal(struck, true);

  const placed = placeShowcase(world, player, 'mob', 'skeleton', 3, 1);
  assert.equal(placed.ok, true);
  assert.equal(world.magicSummons.some(summon => summon.spawned && summon.type === 'skeleton'), true);
  assert.equal(removeShowcaseTarget(world, placed.entity), true);
  assert.equal(world.magicSummons.includes(placed.entity), false);
  clearShowcaseWorld(world);
  assert.equal(world.magicSummons.length, 0);
  assert.equal(world.players.length, 1);
  assert.equal(player.hp, 100);
});
