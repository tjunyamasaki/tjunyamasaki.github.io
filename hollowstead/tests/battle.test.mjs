import test from 'node:test';
import assert from 'node:assert/strict';
import {World, distance} from '../src/engine.mjs';
import {ENEMIES, EQUIPMENT, RULES} from '../src/content.mjs';
import {DASH, NIGHT_CAP, enemyScale, maxHealth, powerOf, waveSize} from '../src/progression.mjs';
import {HOTBAR_SLOTS} from '../src/contracts.mjs';
import {createActionSession} from '../src/transactions.mjs';
import {frameLighting} from '../src/lighting.mjs';
import {loadMagicModules} from '../src/magic/load.mjs?v=harvest-18';
import {ATTACKS, MOVES, buildField, fieldStep, telegraphOf} from '../src/mobs.mjs?v=harvest-18';
import {ARENA, STARTERS, aliveCap, arenaScale, waveBudget, waveChampions} from '../src/arena.mjs?v=harvest-18';
import {hotbarView, offerMarkup} from '../src/ui/arena.mjs?v=harvest-18';
import {keyboardAction} from '../src/ui/actions.mjs';

await loadMagicModules();
const T = RULES.tick;
function camp({showcase = false} = {}){
  const w = new World(402, {showcase}); const p = w.addPlayer('host', 'Jun'); w.start();
  w.ambient = false; w.enemies = []; p.x = 0; p.z = 0; p.dx = 1; p.dz = 0;
  return {w, p};
}
function run(w, seconds, input = {x: 0, z: 0}, each = null){
  for(let t = 0; t < seconds-1e-9; t += T){for(const p of w.players) if(p.online) w.input(p.id, typeof input === 'function' ? input(p) : input); each?.(); w.tick(T);}
}
function arm(w, p, itemId){p.equipment.weapon = null; w.grantEquipped(p, itemId); p.cooldown = 0; p.stamina = 100;}
function tree(w, id, x, z){w.nodes.push({id, type: 'tree', x, z, hits: 4, ready: 0});}

// ------------------------------------------------------------------ pathing and behaviour
test('a briarling finds its way out of a U of trees instead of pressing into the trunks', () => {
  const {w, p} = camp({showcase: true});
  p.x = 10; p.z = 10;
  for(let i = -6; i <= 6; i++) tree(w, 'row'+i, 10+i, 13);
  for(let k = 0; k < 4; k++){tree(w, 'l'+k, 4, 13+k); tree(w, 'r'+k, 16, 13+k);}
  const e = w.spawnEnemy('crawler', 10, 15.6, {elite: false}); e.hp = e.maxHp = 9999;
  let reached = null;
  run(w, 12, {x: 0, z: 0}, () => {if(reached == null && distance(e, p) < 1.6) reached = w.time;});
  assert.ok(reached != null, `stuck at ${e.x.toFixed(1)},${e.z.toFixed(1)}`);
  assert.ok(reached < 9);
});

test('flow fields route round a wall and say "walk straight" in the open', () => {
  const {w} = camp();
  w.nodes = [];
  for(let i = -5; i <= 5; i++) tree(w, 'wall'+i, i, 4);
  const field = buildField(w, w.obstacles(), 0, 0);
  assert.equal(field.ok, true);
  assert.equal(fieldStep(field, 6, -6), null, 'open diagonal walks straight');
  const step = fieldStep(field, 0, 7);
  assert.ok(step, 'behind the wall the field gives a detour');
  assert.ok(Math.abs(step.x) > .5, 'the detour heads sideways round the wall');
});

test('each creature fights its own way: telegraph shapes, wind-ups and weight', () => {
  const expected = {crawler: 'bite', bonewalker: 'charge', wraith: 'orb', bogling: 'lob', brute: 'slam', golem: 'quake', king: 'kingSlam'};
  for(const [type, first] of Object.entries(expected)) assert.ok(MOVES[type].attacks.includes(first), type);
  assert.ok(ATTACKS.slam.windup > ATTACKS.bite.windup, 'big blows wind up longer');
  assert.ok(ATTACKS.quake.windup > ATTACKS.bite.windup*2);
  assert.ok(ENEMIES.brute.damage >= ENEMIES.crawler.damage*4, 'big and slow hits hard');
  assert.ok(ENEMIES.golem.damage > ENEMIES.brute.damage);
  assert.ok(ENEMIES.crawler.speed > ENEMIES.brute.speed*2 && ENEMIES.brute.speed > ENEMIES.golem.speed);
  assert.ok(ENEMIES.crawler.hp*6 < ENEMIES.brute.hp, 'swarmers are fragile');
  const shapes = new Map();
  for(const type of Object.keys(expected)){
    const {w, p} = camp({showcase: true});
    const e = w.spawnEnemy(type, 3, 0, {elite: false}); e.hp = e.maxHp = 1e5;
    run(w, 6, {x: 0, z: 0}, () => {const tg = telegraphOf(e); if(tg){shapes.set(type, tg.shape); assert.ok(tg.fill >= 0 && tg.fill <= 1);}});
    assert.ok(shapes.has(type), `${type} never telegraphed`);
  }
  assert.equal(shapes.get('brute'), 'cone');
  assert.equal(shapes.get('golem'), 'ring');
  assert.equal(shapes.get('crawler'), 'circle');
});

test('a swarm spreads round its prey instead of stacking on one spot', () => {
  const {w, p} = camp({showcase: true});
  for(let i = 0; i < 12; i++){const a = i/12*Math.PI*2; const e = w.spawnEnemy('crawler', Math.cos(a)*9, Math.sin(a)*9, {elite: false}); e.hp = e.maxHp = 1e5;}
  run(w, 7);
  const foes = w.enemies;
  let closest = Infinity;
  for(let i = 0; i < foes.length; i++) for(let j = i+1; j < foes.length; j++) closest = Math.min(closest, distance(foes[i], foes[j]));
  assert.ok(closest > .45, `two briarlings overlap (${closest.toFixed(2)})`);
  const bearings = new Set(foes.filter(e => distance(e, p) < 3).map(e => Math.round((Math.atan2(e.z-p.z, e.x-p.x)+Math.PI)/(Math.PI/4))%8));
  assert.ok(bearings.size >= 5, 'they surround the wanderer');
});

test('lantern wraiths keep their distance and throw orbs; a dodge lets an orb pass through', () => {
  const {w, p} = camp();
  const e = w.spawnEnemy('wraith', 5, 0, {elite: false}); e.hp = e.maxHp = 1e5;
  run(w, 4);
  assert.ok(distance(e, p) > 4, 'casters hold off');
  assert.ok(p.hp < 100, 'orbs land on a wanderer who stands still');
  // An orb flying through a dodging wanderer does nothing.
  const {w: w2, p: q} = camp();
  w2.hostile.push({id: 'h1', kind: 'orb', x: -1.5, z: 0, vx: 6, vz: 0, r: .34, dmg: 20, life: 3, age: 0});
  w2.input(q.id, {x: 0, z: 1}); w2.action(q.id, {type: 'dash'});
  run(w2, .3, {x: 0, z: 0});
  assert.equal(q.hp, 100);
});

test('the night brings more, weaker creatures and caps the crowd for phones', () => {
  assert.ok(waveSize(10, 1) > waveSize(1, 1)*5);
  assert.ok(waveSize(10, 1)/waveSize(2, 1) > enemyScale(10).hp/enemyScale(2).hp);
  assert.ok(NIGHT_CAP >= 40 && NIGHT_CAP <= 64);
  const {w} = camp();
  w.time = RULES.day+RULES.dusk+1; w.spawnWave();
  assert.ok(w.enemies.length >= waveSize(1, 1));
});

// ------------------------------------------------------------------ dodge
test('dodge bursts a fixed distance, ignores blows inside its i-frames, and a timed dodge pays back', () => {
  const {w, p} = camp();
  w.input(p.id, {x: 1, z: 0});
  assert.equal(w.action(p.id, {type: 'dash'}).ok, true);
  assert.equal(p.stamina, 100-DASH.stamina);
  run(w, DASH.time+.01, {x: 0, z: 0});
  assert.ok(Math.abs(p.x-DASH.distance) < .35, `dashed ${p.x.toFixed(2)}`);
  assert.equal(w.action(p.id, {type: 'dash'}).ok, true, 'second charge');
  assert.equal(w.action(p.id, {type: 'dash'}).ok, false, 'no third charge');

  // A briarling bite that lands during the i-frames misses and is a perfect dodge.
  const {w: w2, p: q} = camp();
  const e = w2.spawnEnemy('crawler', 1.2, 0, {elite: false}); e.cooldown = 0; e.hp = e.maxHp = 1e5;
  run(w2, T, {x: 0, z: 0});
  assert.ok(e.windup > 0, 'the bite winds up');
  while(e.windup > T) run(w2, T, {x: 0, z: 0});
  // Dodge sideways at the last moment: still inside the circle when it lands, but invulnerable.
  const before = q.hp; w2.input(q.id, {x: 0, z: 1}); w2.action(q.id, {type: 'dash'});
  const events = w2.eventId;
  run(w2, .3, {x: 0, z: 0});
  assert.equal(q.hp, before);
  assert.ok(w2.events.some(ev => ev.id > events && ev.type === 'dodge'), 'Dodged!');
  assert.ok(q.dashCooldown <= DASH.perfectCooldown+1e-6, 'a perfect dodge comes back almost at once');
  // Standing still, the next bite lands.
  run(w2, 3, {x: 0, z: 0});
  assert.ok(q.hp < before);
});

test('with no stick input a dodge leaps away from the nearest threat', () => {
  const {w, p} = camp();
  w.spawnEnemy('brute', 1.5, 0, {elite: false});
  w.action(p.id, {type: 'dash'});
  run(w, .2, {x: 0, z: 0});
  assert.ok(p.x < -2);
});

// ------------------------------------------------------------------ auto-aim
test('every weapon aims itself: a staff fires behind you, a bow leads a runner, a sword stays put', () => {
  const {w, p} = camp();
  arm(w, p, 'cinder-staff'); p.dx = 1; p.dz = 0;
  const behind = w.spawnEnemy('crawler', -6, 0, {elite: false}); behind.hp = behind.maxHp = 500;
  w.attack(p); run(w, 1, {x: 0, z: 0});
  assert.ok(behind.hp < 500, 'the firebolt found the foe behind');

  const bow = camp();
  arm(bow.w, bow.p, 'recurve');
  const runner = bow.w.spawnEnemy('crawler', 8, 0, {elite: false}); runner.vx = 0; runner.vz = 3;
  bow.w.attack(bow.p);
  const shot = bow.w.projectiles[0];
  assert.ok(shot.vz > 0.8, 'the arrow leads a foe running sideways');

  const blade = camp();
  arm(blade.w, blade.p, 'sword'); blade.p.dx = -1; blade.p.dz = 0;
  const far = blade.w.spawnEnemy('crawler', 3.9, 0, {elite: false}); far.hp = far.maxHp = 500;
  const x0 = blade.p.x;
  blade.w.attack(blade.p);
  assert.equal(far.hp, 500, 'a swing does not dash in to reach a foe outside the blade');
  assert.ok(Math.abs(blade.p.x - x0) < .05, 'the wanderer stays put');
  assert.ok(blade.p.dx > .9, 'and turned to face it');
  const close = blade.w.spawnEnemy('crawler', 2.2, 0, {elite: false}); close.hp = close.maxHp = 500;
  blade.p.cooldown = 0; blade.p.stamina = 100;
  blade.w.attack(blade.p);
  assert.ok(close.hp < 500, 'a foe already in reach is still struck');
  assert.ok(Math.abs(blade.p.x - x0) < .05, 'and that swing does not step forward either');
});

test('running while fighting keeps facing the foe you struck', () => {
  const {w, p} = camp();
  arm(w, p, 'recurve');
  const e = w.spawnEnemy('crawler', 6, 0, {elite: false}); e.hp = e.maxHp = 500;
  w.input(p.id, {x: -1, z: 0, attack: true}); w.tick(T);
  run(w, .2, {x: -1, z: 0, attack: true});
  assert.ok(p.x < 0, 'moving away');
  assert.ok(p.dx > .5, 'but still facing the foe');
  assert.ok(w.weaponReach(p) >= 13);
});

// ------------------------------------------------------------------ hotbar
test('the hotbar holds three carried weapons and swaps without opening the pack', () => {
  const {w, p} = camp();
  w.clearPack(p);
  w.grantEquipped(p, 'spear');
  p.inventory.slots[3] = w.mintStack('recurve', 1, EQUIPMENT.recurve.durability);
  p.inventory.slots[7] = w.mintStack('cinder-staff', 1, 150);
  p.inventory.slots[8] = w.mintStack('sword', 1, EQUIPMENT.sword.durability);
  w.syncHotbar(p);
  assert.equal(p.hotbar.length, HOTBAR_SLOTS);
  assert.equal(p.hotbar[0], p.equipment.weapon.uid);
  assert.deepEqual(hotbarView(p).map(s => s.itemId), ['spear', 'recurve', 'cinder-staff']);
  assert.equal(w.action(p.id, {type: 'hotbar', slot: 2}).ok, true);
  assert.equal(p.equipment.weapon.itemId, 'cinder-staff');
  assert.equal(p.hotbarIndex, 2);
  assert.equal(p.inventory.slots[7].itemId, 'spear', 'the old weapon returns to the pack slot');
  assert.deepEqual(hotbarView(p).map(s => s.itemId), ['spear', 'recurve', 'cinder-staff']);
  // Swapping works mid-swing.
  p.cooldown = .4;
  assert.equal(w.action(p.id, {type: 'hotbar', slot: 1}).ok, true);
  assert.equal(p.equipment.weapon.itemId, 'recurve');
  // Through the transaction session, as a guest would send it.
  const session = createActionSession({getWorld: () => w, actorId: p.id});
  const reply = session.execute({type: 'hotbar', slot: 0, requestId: `${session.sessionId}:1`, worldId: w.networkId});
  assert.equal(reply.ok, true); assert.equal(p.equipment.weapon.itemId, 'spear');
  const bad = session.execute({type: 'hotbar', slot: 7, requestId: `${session.sessionId}:2`, worldId: w.networkId});
  assert.equal(bad.code, 'invalidCommand');
  const copy = World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  assert.deepEqual(copy.player(p.id).hotbar, p.hotbar);
  assert.equal(keyboardAction('r'), 'weapon-next');
});

test('a weapon that breaks hands over to the next one on the hotbar', () => {
  const {w, p} = camp();
  w.clearPack(p);
  w.grantEquipped(p, 'spear', 1);
  p.inventory.slots[0] = w.mintStack('sword', 1, EQUIPMENT.sword.durability);
  w.syncHotbar(p);
  const e = w.spawnEnemy('crawler', 1, 0, {elite: false}); e.hp = e.maxHp = 500;
  w.attack(p);
  assert.equal(p.equipment.weapon?.itemId, 'sword');
  assert.ok(p.notice.includes('broke'));
});

// ------------------------------------------------------------------ arena
function arena(seed = 9){
  const w = new World(seed, {arena: true}); const p = w.addPlayer('host', 'Jun'); w.start();
  return {w, p};
}
function pick(w, p, choice = 0, replace = null){
  if(!w.arena.offers[p.id]) w.tick(T);
  return w.action(p.id, replace == null ? {type: 'arenaPick', choice} : {type: 'arenaPick', choice, replace});
}

test('the arena is a small bare clearing: no trees, camp, hunger, courage or loot', () => {
  const {w, p} = arena();
  assert.equal(w.radius, ARENA.radius);
  assert.equal(w.nodes.length, 0); assert.equal(w.buildings.length, 0);
  assert.equal(p.inventory.slots.filter(Boolean).length, 0);
  assert.equal(frameLighting(w, null).darkness, 0);
  w.time = RULES.day+RULES.dusk+10;
  assert.equal(frameLighting(w, null).darkness, 0, 'no night in the arena');
  p.hunger = 5; p.courage = 5; w.tick(T);
  assert.equal(p.hunger, 100); assert.equal(p.courage, 100);
  const e = w.spawnEnemy('brute', 3, 0, {elite: false}); e.hp = 0; w.tick(T);
  assert.equal(w.drops.length, 0, 'no loot');
  p.x = 18; run(w, 2, {x: 1, z: 0});
  assert.ok(Math.hypot(p.x, p.z) < w.radius-.9, 'walls hold');
});

test('arena waves: pick a starter, fight a growing wave, clear it, heal, pick again', () => {
  const {w, p} = arena();
  w.tick(T);
  const offers = w.arena.offers[p.id];
  assert.equal(offers.length, 3);
  STARTERS.forEach((group, i) => assert.ok(group.includes(offers[i].itemId), 'one starter of each kind'));
  assert.equal(pick(w, p, 0).ok, true);
  assert.equal(p.equipment.weapon.itemId, offers[0].itemId);
  w.tick(T);
  assert.equal(w.arena.phase, 'countdown'); assert.equal(w.arena.wave, 1);
  run(w, ARENA.countdown+.2);
  assert.equal(w.arena.phase, 'fight');
  for(let guard = 0; guard < 100 && !w.enemies.length; guard++) w.tick(T);
  assert.ok(w.enemies.length > 0);
  for(const e of w.enemies) assert.ok(Math.hypot(e.x, e.z) > w.radius-ARENA.spawnEdge-3, 'creatures come from the wall');
  for(const e of w.enemies) assert.ok(distance(e, p) >= ARENA.spawnClear-3, 'never on top of the wanderer');
  run(w, 4, {x: 0, z: 0}, () => {p.hp = p.maxHp;});
  // Finish the wave by force and watch the break.
  for(let guard = 0; guard < 400 && w.arena.phase === 'fight'; guard++){for(const e of w.enemies) e.hp = 0; p.hp = p.maxHp; w.tick(T);}
  assert.equal(w.arena.phase, 'cleared');
  assert.equal(w.arena.best, 1);
  assert.ok(w.kills >= waveBudget(1));
  assert.ok(p.level > 1, 'kills level you up');
  run(w, ARENA.cleared+.1);
  assert.equal(w.arena.phase, 'pick');
  assert.equal(w.arena.offers[p.id].length, 3);
});

test('arena picks rank up a carried weapon, and a full hotbar asks which weapon to give up', () => {
  const {w, p} = arena();
  pick(w, p, 0);
  const first = p.equipment.weapon.itemId;
  const base = powerOf(p);
  // Offer the same weapon again: it ranks up and hits harder.
  w.arena.phase = 'pick'; w.arena.offers[p.id] = [{itemId: first, owned: true, rank: 2}, {itemId: 'tome', owned: false, rank: 1}, {itemId: 'scythe', owned: false, rank: 1}];
  assert.equal(w.action(p.id, {type: 'arenaPick', choice: 0}).ok, true);
  assert.equal(p.ranks[first], 2);
  assert.ok(powerOf(p) > base*1.15);
  // Fill the hotbar, then a new weapon needs a slot.
  w.arena.offers[p.id] = [{itemId: 'tome', owned: false, rank: 1}]; w.action(p.id, {type: 'arenaPick', choice: 0});
  w.arena.offers[p.id] = [{itemId: 'scythe', owned: false, rank: 1}]; w.action(p.id, {type: 'arenaPick', choice: 0});
  assert.equal(hotbarView(p).filter(s => s.itemId).length, 3);
  w.arena.offers[p.id] = [{itemId: 'starfall', owned: false, rank: 1}];
  assert.equal(w.action(p.id, {type: 'arenaPick', choice: 0}).code, 'chooseSlot');
  assert.equal(w.action(p.id, {type: 'arenaPick', choice: 0, replace: 1}).ok, true);
  assert.deepEqual(hotbarView(p).map(s => s.itemId).sort(), [first, 'scythe', 'starfall'].sort());
  assert.equal(p.ranks.tome, undefined);
  w.assertItems();
  const html = offerMarkup([{itemId: 'tome', owned: true, rank: 3}], id => `<img alt="${id}">`);
  assert.match(html, /RANK UP/); assert.match(html, /Grimoire/);
});

test('arena weapons never wear out and cost no stamina; levels are worth more', () => {
  const {w, p} = arena();
  pick(w, p, 0);
  const weapon = p.equipment.weapon, full = weapon.durability;
  const e = w.spawnEnemy('brute', 1.5, 0, {elite: false}); e.hp = e.maxHp = 1e5;
  p.stamina = 0;
  for(let i = 0; i < 30; i++){p.cooldown = 0; w.attack(p);}
  // The first arena offer is a magic weapon (STARTERS): its hits land as the world steps, not inside attack().
  for(let i = 0; i < 30; i++){p.stamina = 0; w.tick(T);}
  assert.equal(p.equipment.weapon.durability, full);
  assert.ok(e.hp < 1e5, 'swings with an empty stamina bar');
  p.level = 5;
  assert.ok(maxHealth(p) > maxHealth({level: 5}), 'arena levels add more health');
  assert.equal(w.action(p.id, {type: 'dash'}).ok, true, 'dodges cost no stamina');
});

test('the arena ends when the wanderer falls, and a snapshot carries the whole run', () => {
  const {w, p} = arena();
  pick(w, p, 0); run(w, ARENA.countdown+.5);
  const copy = World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  assert.equal(copy.arena.wave, 1); assert.equal(copy.radius, ARENA.radius); assert.equal(copy.nodes.length, 0);
  assert.equal(copy.player(p.id).growth, 'arena');
  w.hurt(p, 1e4);
  run(w, 2);
  assert.equal(w.status, 'defeat');
});

test('arena waves grow in number faster than in strength, with champions every fifth wave', () => {
  assert.ok(waveBudget(10) > waveBudget(1)*4);
  assert.ok(waveBudget(10)/waveBudget(2) > arenaScale(10).hp/arenaScale(2).hp);
  assert.ok(aliveCap(20) <= ARENA.maxAlive);
  assert.deepEqual(waveChampions(4), []);
  assert.ok(waveChampions(5).includes('brute'));
  assert.deepEqual(waveChampions(10), ['king']);
});

test('sixty creatures cost little per tick', () => {
  const w = new World(402); const p = w.addPlayer('host', 'Jun'); w.start(); w.ambient = false; w.enemies = [];
  w.time = RULES.day+RULES.dusk+5; w.nextSpawn = 1e9;
  const types = ['crawler', 'crawler', 'crawler', 'bonewalker', 'wraith', 'bogling', 'brute'];
  for(let i = 0; i < 60; i++){const a = i/60*Math.PI*2, r = 10+(i%5)*2; const e = w.spawnEnemy(types[i%types.length], Math.cos(a)*r, Math.sin(a)*r, {elite: false}); e.hp = e.maxHp = 1e5;}
  run(w, 1, {x: 1, z: 0}, () => {p.hp = p.maxHp;});
  const start = performance.now();
  run(w, 5, {x: 0, z: 1}, () => {p.hp = p.maxHp;});
  const perTick = (performance.now()-start)/(5/T);
  assert.ok(perTick < 12, `${perTick.toFixed(2)} ms per tick`);
});
