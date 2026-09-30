import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs?v=harvest-18';
import {RULES} from '../src/content.mjs?v=harvest-18';
import {countItem} from '../src/inventory.mjs?v=harvest-18';
import {maxHealth} from '../src/progression.mjs?v=harvest-18';
import {frameLighting} from '../src/lighting.mjs?v=harvest-18';
import {createNetwork} from '../src/network.mjs?v=harvest-18';
import {loadMagicModules} from '../src/magic/load.mjs?v=harvest-18';
import {FLOOR, ROCK, flood} from '../src/dungeon/grid.mjs?v=harvest-18';
import {VARIANTS, VARIANT_IDS, variantOf} from '../src/dungeon/variants.mjs?v=harvest-18';
import {buildFloor, floorSpec, roomAtPoint, sightLine, walkableAt} from '../src/dungeon/layout.mjs?v=harvest-18';
import {DUNGEON, KIT, dungeonStatus, layoutOf} from '../src/dungeon/run.mjs?v=harvest-18';
import {badgeView} from '../src/ui/dungeon.mjs?v=harvest-18';
import {harness, flush} from './network-harness.mjs';

await loadMagicModules();
const T = RULES.tick;
function run(w, seconds, each = null){for(let t = 0; t < seconds - 1e-9; t += T){each?.(); w.tick(T);}}
function dungeon(options = {}){
  const w = new World(options.seed ?? 4242, {dungeon: {variant: options.variant ?? 'crypt', runSeed: options.runSeed ?? 99, depth: options.depth ?? 1}});
  const p = w.addPlayer('host', 'Jun'); w.start();
  return {w, p, L: layoutOf(w)};
}
const hostiles = w => w.enemies.filter(e => e.hp > 0 && !e.ally);
const slay = (w, filter = () => true) => {for(const e of w.enemies) if(filter(e)) e.hp = 0;};

// ------------------------------------------------------------------ generation
test('every variation carves connected floors with a camp, a Warden chamber and stairs, the same from the same seed', () => {
  for(const variant of VARIANT_IDS) for(const depth of [1, 2, 4, 7]) for(const seed of [1, 77, 90210]){
    const L = buildFloor({seed, variant, depth});
    const start = L.rooms[L.start], exit = L.rooms[L.exit];
    assert.ok(L.rooms.length >= 4, `${variant} ${depth} ${seed}: ${L.rooms.length} chambers`);
    assert.equal(start.kind, 'start'); assert.equal(exit.kind, 'warden'); assert.notEqual(L.start, L.exit);
    // One connected floor: everything open is reachable from the camp.
    const dist = flood({w: L.w, h: L.h, cells: L.cells}, [start.ci + start.cj*L.w]);
    for(let k = 0; k < L.cells.length; k++) if(L.cells[k] === FLOOR) assert.ok(dist[k] >= 0, `${variant} ${depth} ${seed}: cell ${k} cut off`);
    assert.ok(walkableAt(L, L.portal.x, L.portal.z), 'the stairs stand on open floor');
    assert.ok(L.camp.spawn.every(s => walkableAt(L, s.x, s.z)), 'the camp has room to wake up in');
    assert.ok(L.caches.every(c => L.cells[Math.floor(c.x - L.ox) + Math.floor(c.z - L.oz)*L.w] !== ROCK), 'caches stand on the floor');
    assert.ok(L.lights.length > 0 && L.props.length > 0);
    // Deterministic: a fresh build (cache cleared by other keys) is cell for cell the same.
    const again = buildFloor({seed, variant, depth});
    assert.equal(again.key, L.key);
  }
});

test('floors are rebuilt identically from their three numbers, and differ between seeds', async () => {
  const a = buildFloor({seed: 5, variant: 'caverns', depth: 3});
  // Fill the cache with other floors so the first is generated again from scratch.
  for(let s = 100; s < 110; s++) buildFloor({seed: s, variant: 'crypt', depth: 1});
  const b = buildFloor({seed: 5, variant: 'caverns', depth: 3});
  assert.notEqual(a, b);
  assert.deepEqual([...b.cells], [...a.cells]);
  assert.deepEqual(b.caches, a.caches);
  const c = buildFloor({seed: 6, variant: 'caverns', depth: 3});
  assert.notDeepEqual([...c.cells], [...a.cells]);
});

test('the next floor comes from the run seed, changes variation when it can, and a pinned variation stays', () => {
  for(let depth = 2; depth < 12; depth++){
    const spec = floorSpec(31337, depth, 'crypt');
    assert.notEqual(spec.variant, 'crypt');
    assert.deepEqual(floorSpec(31337, depth, 'crypt'), spec);
    assert.equal(floorSpec(31337, depth, 'crypt', 'ossuary').variant, 'ossuary');
  }
  assert.notEqual(floorSpec(1, 2).seed, floorSpec(1, 3).seed);
});

test('every variation fills in the registry contract', () => {
  assert.ok(VARIANTS.length >= 2);
  for(const v of VARIANTS){
    for(const key of ['id', 'name', 'short', 'blurb']) assert.equal(typeof v[key], 'string', `${v.id}.${key}`);
    for(const key of ['floor', 'floorAlt', 'corridor', 'wallTop', 'wall', 'rim', 'accent', 'warden', 'treasure', 'camp', 'shrine']) assert.match(v.palette[key], /^#[0-9a-f]{6}$/i, `${v.id}.palette.${key}`);
    assert.ok(v.darkness > 0 && v.darkness < 1);
    assert.ok(v.roster(1).length && v.roster(9).length);
    assert.equal(typeof v.warden(3), 'string'); assert.ok(v.escort(3).length);
    assert.equal(typeof v.carve, 'function');
  }
  assert.equal(variantOf('nope'), VARIANTS[0]);
});

// ------------------------------------------------------------------ the run
test('a new run starts at the camp fire with the kit, no hunger, and weapons that never wear', () => {
  const {w, p, L} = dungeon();
  assert.equal(roomAtPoint(L, p.x, p.z), L.start);
  assert.ok(w.walkable(p.x, p.z));
  assert.equal(p.equipment.weapon?.itemId, KIT.worn[0]);
  for(const [itemId, count] of KIT.pack) assert.equal(countItem(p.inventory, itemId), count);
  assert.deepEqual(w.buildings.map(b => b.type).sort(), ['bench', 'fire']);
  assert.ok(w.buildings.every(b => b.fixed));
  assert.equal(w.nodes.length, L.caches.length);
  const before = p.equipment.weapon.durability;
  w.wearEquipped(p, 'weapon', 30);
  assert.equal(p.equipment.weapon.durability, before);
  run(w, 5);
  assert.equal(p.hunger, 100); assert.equal(p.courage, 100);
  // Nothing is built, and the camp cannot be taken apart.
  assert.equal(w.action('host', {type: 'build', recipe: 'wall', x: p.x + 1, z: p.z}).code, 'unavailable');
  const bench = w.buildings.find(b => b.type === 'bench');
  p.x = bench.x + 1; p.z = bench.z;
  assert.equal(w.beginDismantle(p, bench.id, true).code, 'rejected');
});

test('a chamber wakes as a wanderer nears it; clearing it pays experience and marks it', () => {
  const {w, p, L} = dungeon();
  const room = L.rooms.filter(r => r.kind === 'lair').sort((a, b) => a.order - b.order)[0];
  assert.equal(w.dungeon.rooms[room.id], 0);
  assert.equal(hostiles(w).length, 0);
  p.x = room.x; p.z = room.z; p.hp = 1e6;
  run(w, T*2);
  assert.equal(w.dungeon.rooms[room.id], 1);
  const residents = w.enemies.filter(e => e.room === room.id);
  assert.ok(residents.length >= 1);
  assert.ok(residents.every(e => e.home && roomAtPoint(L, e.x, e.z) === room.id));
  assert.ok(w.dungeon.seen.includes(room.id));
  const xp = p.xp + (p.level - 1)*1000;
  slay(w, e => e.room === room.id);
  run(w, T*3);
  assert.equal(w.dungeon.rooms[room.id], 2);
  assert.ok(p.xp + (p.level - 1)*1000 > xp);
  assert.ok(w.events.some(e => e.type === 'discover' && e.text === 'Chamber cleared'));
});

test('a resting creature does not notice a wanderer through the rock', () => {
  const {w, p, L} = dungeon();
  // Find a spot beside a sleeping resident but behind a wall from it.
  const room = L.rooms.filter(r => r.kind === 'lair').sort((a, b) => a.order - b.order)[0];
  p.x = room.x; p.z = room.z; run(w, T*2);
  const e = w.enemies.find(q => q.room === room.id);
  let spot = null;
  for(let dz = -9; dz <= 9 && !spot; dz += .5) for(let dx = -9; dx <= 9 && !spot; dx += .5){
    const x = e.x + dx, z = e.z + dz;
    if(Math.hypot(dx, dz) < 8 && w.walkable(x, z) && !sightLine(L, e.x, e.z, x, z)) spot = {x, z};
  }
  if(!spot) return; // this floor has no such spot near the first resident
  for(const q of w.enemies){q.aggro = false; q.x = q.home.x; q.z = q.home.z;}
  p.x = spot.x; p.z = spot.z; p.hp = 1e6;
  run(w, T*4);
  assert.equal(e.aggro, false);
});

test('the Warden rises by the stairs; its fall opens them and raises the fallen; the gathered party goes down', () => {
  const {w, p, L} = dungeon();
  const friend = w.addPlayer('g1', 'Ana');
  const exit = L.rooms[L.exit];
  p.x = exit.x + 1.5; p.z = exit.z + 1.5; p.hp = p.maxHp = 1e6;
  friend.x = exit.x - 1; friend.z = exit.z + 2;
  run(w, T*3);
  const warden = w.enemies.find(e => e.warden);
  assert.ok(warden, 'the Warden is out');
  assert.equal(warden.room, L.exit);
  assert.match(dungeonStatus(w).objective, /Slay the/);
  // Down, then a ghost: the pack is kept.
  friend.hp = 1; w.hurt(friend, 50); assert.ok(friend.down);
  const pack = friend.inventory.slots.filter(Boolean).length;
  run(w, 41, () => {p.hp = 1e6;});
  assert.ok(friend.ghost); assert.equal(friend.inventory.slots.filter(Boolean).length, pack);
  assert.equal(w.drops.filter(d => d.stack.itemId === 'recurve').length, 0);
  slay(w, e => e.warden);
  run(w, T*2);
  assert.equal(w.dungeon.phase, 'open');
  assert.ok(!friend.ghost && !friend.down, 'the fallen rise when the Warden falls');
  assert.match(dungeonStatus(w).objective, /Gather at the stairs/);
  // Only one at the stairs: nothing happens.
  slay(w);
  p.x = L.portal.x; p.z = L.portal.z; friend.x = L.portal.x + 6; friend.z = L.portal.z;
  run(w, DUNGEON.descend + .5, () => {p.hp = 1e6; friend.x = L.portal.x + 6; friend.z = L.portal.z;});
  assert.equal(w.dungeon.depth, 1);
  // Both at the stairs: down they go.
  const level = p.level;
  run(w, DUNGEON.descend + .5, () => {if(w.dungeon.depth > 1) return; p.x = L.portal.x; p.z = L.portal.z; friend.x = L.portal.x + .8; friend.z = L.portal.z;});
  assert.equal(w.dungeon.depth, 2);
  assert.equal(w.dungeon.stats.floors, 1);
  const next = layoutOf(w);
  assert.notEqual(next.key, L.key);
  assert.equal(roomAtPoint(next, p.x, p.z), next.start);
  assert.equal(w.dungeon.phase, 'explore');
  assert.ok(p.level >= level);
  assert.equal(countItem(friend.inventory, 'recurve'), 1, 'packs come down the stairs');
  assert.equal(w.drops.length, 0);
});

test('every fifth floor the Hollow King waits by the stairs', () => {
  const {w, p, L} = dungeon({depth: 5});
  const exit = L.rooms[L.exit];
  p.x = exit.x + 1.5; p.z = exit.z + 1.5; p.hp = p.maxHp = 1e6;
  run(w, T*3);
  const king = w.enemies.find(e => e.warden);
  assert.equal(king?.type, 'king');
});

test('ambush chambers pour out two waves around whoever walks in', () => {
  let found = null;
  for(let seed = 1; seed < 40 && !found; seed++){
    const setup = dungeon({depth: 3, runSeed: seed});
    const room = setup.L.rooms.find(r => r.kind === 'ambush');
    if(room) found = {...setup, room};
  }
  assert.ok(found, 'some floor has an ambush');
  const {w, p, room} = found;
  p.x = room.x; p.z = room.z; p.hp = p.maxHp = 1e6;
  run(w, T*3);
  assert.equal(w.dungeon.waves[room.id], 1);
  assert.ok(w.enemies.filter(e => e.room === room.id).length >= 3);
  assert.ok(w.events.some(e => e.type === 'announce' && e.text === 'Ambush!'));
  slay(w, e => e.room === room.id); run(w, T*3);
  assert.equal(w.dungeon.waves[room.id], 0);
  slay(w, e => e.room === room.id); run(w, T*3);
  assert.equal(w.dungeon.rooms[room.id], 2);
});

test('the shrine answers the party once a floor', () => {
  let found = null;
  for(let seed = 1; seed < 40 && !found; seed++){const s = dungeon({runSeed: seed}); if(s.L.shrine) found = s;}
  const {w, p, L} = found;
  p.hp = 10;
  p.x = L.shrine.x + 1.3; p.z = L.shrine.z;
  run(w, DUNGEON.shrineHold + .2, () => {p.x = L.shrine.x + 1.3; p.z = L.shrine.z;});
  assert.equal(w.dungeon.shrine, 1);
  assert.ok(['mending', 'fury', 'fortune'].includes(w.dungeon.blessing));
  if(w.dungeon.blessing === 'mending') assert.equal(p.hp, maxHealth(p));
  if(w.dungeon.blessing === 'fury') assert.equal(p.boon, DUNGEON.fury);
});

test('the camp fire mends a wanderer resting by it', () => {
  const {w, p, L} = dungeon();
  p.hp = 20; p.x = L.camp.spawn[0].x; p.z = L.camp.spawn[0].z;
  run(w, 2);
  assert.ok(p.hp > 20 + DUNGEON.campHeal);
});

test('opening a cache down here pays out with the floor’s luck and counts toward the run', () => {
  const {w, p} = dungeon({depth: 4});
  const node = w.nodes[0];
  const spot = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dz]) => ({x: node.x + dx, z: node.z + dz})).find(s => w.walkable(s.x, s.z));
  p.x = spot.x; p.z = spot.z;
  const drops = w.drops.length;
  // Treasure is guarded: clear the guards as they come so the hold is never interrupted.
  run(w, 4, () => {slay(w); w.input('host', {x: 0, z: 0, act: true, target: node.id});});
  assert.ok(node.ready > w.time, 'the cache is open');
  assert.ok(w.drops.length > drops);
  assert.equal(w.dungeon.stats.caches, 1);
});

// ------------------------------------------------------------------ sharing the floor
test('a snapshot carries the floor as three numbers; guests rebuild the same floor and its opened caches', () => {
  const {w, p} = dungeon({variant: 'ossuary'});
  w.nodes[0].ready = w.time + 999;
  const data = JSON.parse(JSON.stringify(w.snapshot()));
  assert.ok(JSON.stringify(data).length < 40000);
  assert.equal(data.dungeon.variant, 'ossuary');
  assert.equal(data.enemies.every(e => !('room' in e)), true);
  const guest = World.restore(data);
  assert.ok(guest.dungeon);
  assert.equal(layoutOf(guest).key, layoutOf(w).key);
  assert.equal(guest.nodes.length, w.nodes.length);
  assert.ok(guest.nodes[0].ready > 0);
  assert.ok(guest.walkable(p.x, p.z));
  assert.equal(guest.radius, w.radius);
});

test('dungeon lighting: the floor’s own darkness, a light on every wanderer, torches near the viewer', () => {
  const {w, p, L} = dungeon({variant: 'caverns'});
  const frame = frameLighting(w, null, p);
  assert.equal(frame.darkness, variantOf('caverns').darkness);
  assert.ok(frame.sources.some(s => s.kind === 'player' && s.id === 'host'));
  assert.ok(frame.sources.some(s => s.kind === 'torch'));
  w.dungeon.phase = 'open';
  assert.ok(frameLighting(w, null, p).sources.some(s => s.kind === 'portal' && s.x === L.portal.x));
});

test('the HUD badge follows the floor: find the Warden, slay it, gather at the stairs, the shrine', () => {
  const {w, p, L} = dungeon();
  let view = badgeView(dungeonStatus(w), p);
  assert.equal(view.tone, 'explore'); assert.match(view.title, /Find the Warden/);
  const exit = L.rooms[L.exit]; p.x = exit.x + 1; p.z = exit.z + 1.5; p.hp = p.maxHp = 1e6;
  run(w, T*3);
  view = badgeView(dungeonStatus(w), p);
  assert.equal(view.tone, 'warden'); assert.equal(view.progress, 1);
  slay(w, e => e.warden); run(w, T*2);
  view = badgeView(dungeonStatus(w), p);
  assert.equal(view.tone, 'open');
});

test('host and guest share a dungeon run: the guest gets the kit, a place by the party and the same floor', async () => {
  const h = harness(), world = new World(88, {dungeon: {variant: 'caverns'}}); world.addPlayer('host', 'Host');
  let id, frame; const opts = {signaling: h.signal, PeerConnection: h.PC};
  const host = createNetwork({...opts, getWorld: () => world});
  const guest = createNetwork({...opts, onReady: x => id = x, onFrame: f => frame = f});
  try{
    await host.host(); await guest.join('ABCDE', 'Guest', 'moss'); await flush();
    world.start(); host.broadcast(); await flush();
    assert.ok(frame.dungeon);
    const theirs = World.restore(frame), me = theirs.player(id);
    assert.equal(layoutOf(theirs).key, layoutOf(world).key);
    assert.equal(me.equipment.weapon?.itemId, KIT.worn[0]);
    assert.ok(theirs.walkable(me.x, me.z));
    assert.ok(Math.hypot(me.x - world.player('host').x, me.z - world.player('host').z) < 6);
    // The guest walks; the host simulates; the guest sees itself move on the same floor.
    const x0 = world.player(id).x;
    for(let i = 0; i < 20; i++){guest.input({x: 1, z: 0}); await flush(); world.tick(T);}
    host.broadcast(); await flush();
    assert.notEqual(World.restore(frame).player(id).x, x0);
  }finally{await guest.stop(); await host.stop();}
});

test('a creature can never be pushed or fly into the rock', () => {
  const {w, p, L} = dungeon({variant: 'crypt'});
  const room = L.rooms.filter(r => r.kind === 'lair')[0];
  const wraith = w.spawnEnemy('wraith', room.x, room.z); wraith.hunt = true;
  p.x = L.rooms[L.start].x; p.z = L.rooms[L.start].z; p.hp = p.maxHp = 1e6;
  run(w, 6, () => {p.hp = 1e6;});
  const cell = L.cells[Math.floor(wraith.x - L.ox) + Math.floor(wraith.z - L.oz)*L.w];
  assert.notEqual(cell, ROCK);
});

// ------------------------------------------------------------------ ready for an expedition's door
test('a run can be placed anywhere, bring its own gear, and end after a set number of floors', () => {
  const w = new World(9, {dungeon: {variant: 'ossuary', runSeed: 3, at: {x: 400, z: -250}, kit: false, floors: 2}});
  const p = w.addPlayer('host', 'Jun'); w.start();
  const L = layoutOf(w);
  assert.ok(Math.abs(L.ox + L.w/2 - 400) < 1 && Math.abs(L.oz + L.h/2 + 250) < 1, 'the floor lies where it was placed');
  assert.ok(w.walkable(p.x, p.z) && Math.hypot(p.x - 400, p.z + 250) < 60);
  assert.ok(Math.hypot(w.nodes[0].x - 400, w.nodes[0].z + 250) < 60);
  assert.equal(p.equipment.weapon, null, 'no kit: they bring what they carry');
  assert.equal(countItem(p.inventory, 'recurve'), 0);
  assert.equal(World.restore(JSON.parse(JSON.stringify(w.snapshot()))).walkable(p.x, p.z), true);
  const go = () => {
    const floor = layoutOf(w), exit = floor.rooms[floor.exit];
    p.x = exit.x + 1; p.z = exit.z + 1.5; p.hp = p.maxHp = 1e6;
    run(w, T*3); slay(w, e => e.warden); run(w, T*2);
    run(w, DUNGEON.descend + .5, () => {slay(w); if(w.dungeon.phase === 'open'){p.x = floor.portal.x; p.z = floor.portal.z;}});
  };
  go(); assert.equal(w.dungeon.depth, 2);
  go(); assert.equal(w.dungeon.depth, 2); assert.equal(w.dungeon.phase, 'complete');
  assert.ok(w.events.some(e => e.type === 'dungeonComplete'));
  assert.match(dungeonStatus(w).objective, /conquered/);
});
