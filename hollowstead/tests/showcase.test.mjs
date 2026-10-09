import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {ENEMIES, EQUIPMENT, ITEMS, NODES, RULES, STRUCTURES} from '../src/content.mjs';
import {makeStack} from '../src/inventory.mjs';
import {collectMagicSprites, magicItems, magicMobEntries, registerMagicModule} from '../src/magic/registry.mjs?v=harvest-18';
import {readFileSync} from 'node:fs';
import {CHARACTERS} from '../src/content.mjs';
import {CROPS} from '../src/homestead.mjs';
import {GALLERY, GALLERY_CATEGORIES, clearShowcaseWorld, galleryEntries, galleryLayout, galleryNear, galleryProps, inspectLines, showcaseMarkup} from '../src/showcase.mjs';

const THEME = JSON.parse(readFileSync(new URL('../themes/harvest/theme.json', import.meta.url), 'utf8'));
// The renderer registers every wanderer's looks (renderer.mjs registerLooks); the gallery sees them the same way.
for(const c of CHARACTERS) if(c.look && !THEME.sprites[c.id]) THEME.sprites[c.id] = {...THEME.sprites[c.base], lazy: true};

test('the gallery lays every kind of thing out in rows, each piece once, nothing overlapping', () => {
  const {entries, headers, start} = galleryLayout(THEME);
  assert.ok(entries.length > 200, `${entries.length} pieces`);
  assert.deepEqual(headers.map(h => h.cat), GALLERY_CATEGORIES.map(c => c.id).filter(id => entries.some(e => e.cat === id)));
  const tags = new Set(entries.map(e => `${e.cat}:${e.key}:${e.frame ?? ''}`));
  assert.equal(tags.size, entries.length);
  for(const e of entries){
    assert.ok(THEME.sprites[e.key], e.key);
    assert.ok(e.x - e.w / 2 >= GALLERY.x0 - .02 && e.x + e.w / 2 <= GALLERY.x0 + Math.max(GALLERY.width, e.w) + 3, `${e.key} in its row`);
  }
  // Pieces in one row never share ground; rows of a kind come one after another.
  const rows = new Map();for(const e of entries)(rows.get(e.z) || rows.set(e.z, []).get(e.z)).push(e);
  for(const row of rows.values()){row.sort((a, b) => a.x - b.x);for(let i = 1; i < row.length; i++)assert.ok(row[i].x - row[i].w / 2 >= row[i - 1].x + row[i - 1].w / 2 - .02);}
  assert.ok(Number.isFinite(start.x) && Number.isFinite(start.z));
});

test('the gallery shows the live tables: every creature, structure, crop stage, item and Yomi wanderer', () => {
  const entries = galleryEntries(THEME), has = (cat, id) => entries.some(e => e.cat === cat && e.id === id);
  for(const id of Object.keys(ENEMIES)) if(THEME.sprites[id]) assert.equal(has('creatures', id), true, id);
  for(const id of Object.keys(STRUCTURES)) if(THEME.sprites[id]) assert.equal(has('buildings', id), true, id);
  for(const id of ['miko', 'daoshi-wanderer']) assert.equal(has('wanderers', id), true, id);
  for(const id of ['hen', 'cow']) assert.equal(has('animals', id), true, id);
  for(const id of Object.keys(CROPS)) assert.equal(entries.filter(e => e.cat === 'crops' && e.id === id).length, 4, id);
  for(const id of ['wood', 'egg', 'daikon', 'tamagoyaki']) assert.equal(has('items', id), true, id);
  // Weapons and gear stand on display stands; everything else lies on the floor.
  const {entries: laid} = galleryLayout(THEME);
  assert.equal(laid.filter(e => e.cat === 'gear').every(e => e.lift > 0), true);
  assert.equal(laid.filter(e => e.cat !== 'gear').some(e => e.lift), false);
  const props = galleryProps({gallery: {entries: laid.filter(e => e.cat === 'gear').slice(0, 3)}}, THEME);
  assert.deepEqual(props.map(p => p.key).filter(k => k === GALLERY.stand).length, 3);
});

test('the inspector names the piece nearest you, or the one you tapped', () => {
  const world = new World(7, {showcase: true});world.gallery = galleryLayout(THEME);
  const piece = world.gallery.entries.find(e => e.key === 'hen');
  assert.equal(galleryNear(world, piece.x + .2, piece.z)?.id, piece.id);
  assert.equal(galleryNear(world, 500, 500), null);
  const lines = inspectLines(piece, THEME);
  assert.equal(lines.key, 'hen');assert.equal(lines.cat, 'Animals');assert.match(lines.sheet, /4 × 2 · 8 frames/);
  const html = showcaseMarkup({inspect: lines});
  assert.match(html, /data-showcase-go="creatures"/);assert.match(html, /Hen/);assert.match(html, /hen\.svg/);
  assert.match(showcaseMarkup({}), /Walk up to anything/);
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
  const magic = Object.keys(magicItems);
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
  crawler.hp = crawler.maxHp = 1000;

  arm(player, 'widows-needle', 70);
  world.attack(player);
  assert.equal(player.equipment.weapon.durability, 69);
  let rooted = false;
  for(let i = 0; i < 40 && !rooted; i++){
    world.tick();
    rooted = crawler.magicRootRemaining > 0;
  }
  assert.equal(rooted, true);
  assert.equal(crawler.hp, 1000 - magicItems['widows-needle'].damage);
  const pinned = crawler.x;
  for(let i = 0; i < 10; i++) world.tick();
  assert.equal(crawler.x, pinned);
  assert.equal(player.hp, 100);

  player.cooldown = 0;
  arm(player, 'spirit-fan', 80);
  const beforeFan = crawler.hp;
  const fanX = crawler.x;
  world.attack(player);
  assert.equal(crawler.hp, beforeFan - magicItems['spirit-fan'].damage);
  assert.equal(crawler.x, fanX, 'the fan does not knock back');
  assert.equal(world.magicSweeps.length, 1);

  player.cooldown = 0;
  arm(player, 'cinder-staff', 90);
  const beforeBolt = crawler.hp;
  world.attack(player);
  assert.equal(player.equipment.weapon.durability, 89);
  let burned = false;
  for(let i = 0; i < 40 && crawler.hp > 0; i++){
    world.tick();
    if(crawler.hp <= beforeBolt - magicItems['cinder-staff'].damage){burned = true; break;}
  }
  assert.equal(burned, true);
  assert.ok(crawler.hp > beforeBolt - magicItems['cinder-staff'].damage * 2);

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

  clearShowcaseWorld(world);
  assert.equal(world.magicSummons.length, 0);
  assert.equal(world.players.length, 1);
  assert.equal(player.hp, 100);
});
