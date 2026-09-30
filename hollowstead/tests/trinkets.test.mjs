import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {EQUIPMENT, RULES} from '../src/content.mjs';
import {TRINKET_IDS} from '../src/contracts.mjs';
import {DASH, LOOT_TABLES, WEAPON_STYLES, powerOf, rarityOf, rollLoot} from '../src/progression.mjs';
import {TRINKET, TRINKET_TEXT, revealsCache, trinketEvent, trinketOf, trinketSpeed, wardCooldown} from '../src/trinkets.mjs';
import {arenaWeapons, setupArena} from '../src/arena.mjs';
import {effectLine} from '../src/ui/actions.mjs';

const T = RULES.tick;
const NIGHT = 210+5; // day 1 night
function camp(seed = 402){
  const w = new World(seed); const p = w.addPlayer('host', 'Jun'); const q = w.addPlayer('guest', 'Ada'); w.start();
  w.ambient = false; w.enemies = [];
  for(const who of [p, q]){who.x = 0; who.z = 0; who.stamina = 100; who.regions = ['meadow', 'woods', 'graveyard', 'mire', 'crags', 'barrow'];}
  return {w, p, q};
}
function wear(w, p, id){assert.ok(w.grantEquipped(p, id), `${id} worn`); assert.equal(trinketOf(p), id);}
function run(w, seconds, each = null){for(let t = 0; t < seconds-1e-9; t += T){for(const p of w.players) if(p.online) w.input(p.id, {x: 0, z: 0}); each?.(); w.tick(T);}}
function foe(w, x = 1, z = 0, hp = 50){const e = w.spawnEnemy('crawler', x, z, {elite: false}); e.hp = e.maxHp = hp; return e;}
/** Kill `count` creatures credited to `p`, in one tick. */
function slay(w, p, count = 1){for(let i = 0; i < count; i++){const e = foe(w, 3+i*.01, 3); e.hp = 0; e.lastHitBy = p.id;} w.tick(T);}
function rng(seed){let s = seed >>> 0; return () => {s = Math.imul(s ^ s >>> 15, 1 | s); s ^= s+Math.imul(s ^ s >>> 7, 61 | s); s = (s+0x6D2B79F5) >>> 0; return ((s ^ s >>> 14) >>> 0)/4294967296;};}

test('the ten trinkets are gear for the trinket socket, with their effect in the item text', () => {
  assert.equal(TRINKET_IDS.length, 10);
  for(const id of TRINKET_IDS){
    assert.ok(EQUIPMENT[id], id);
    assert.ok(TRINKET_TEXT[id], id);
    assert.ok(effectLine(id).includes(TRINKET_TEXT[id]), `${id} explains itself`);
    assert.ok(['rare', 'epic'].includes(rarityOf(id)), `${id} has a loot rarity`);
  }
  assert.equal(TRINKET_TEXT.nightfang, 'Kills at night heal 1');
  assert.equal(TRINKET_TEXT.frostanklet, 'Dodges leave a frost trail that slows foes');
  assert.equal(TRINKET_IDS.filter(id => rarityOf(id) === 'rare').length, 6);
});

test('caches and elites can drop trinkets; the arena never offers them', () => {
  const found = new Set();
  const random = rng(7);
  for(let i = 0; i < 3000; i++) for(const table of ['ironchest', 'moonchest']) for(const {itemId} of rollLoot(table, random)) if(TRINKET_IDS.includes(itemId)) found.add(itemId);
  assert.ok(LOOT_TABLES.moonchest);
  assert.equal(found.size, TRINKET_IDS.length, `found ${[...found]}`);
  for(const id of TRINKET_IDS){assert.equal(arenaWeapons().includes(id), false); assert.equal(WEAPON_STYLES[id], undefined);}
  // Nor do they do anything there.
  const w = new World(9); const p = w.addPlayer('host', 'Jun'); setupArena(w);
  p.equipment.trinket = {uid: 'x', itemId: 'wispfeather', quantity: 1, durability: 100};
  assert.equal(trinketSpeed(w, p), 1);
  p.equipment.trinket.itemId = 'boneward';
  assert.equal(trinketEvent(w, p, 'hurt', {amount: 10, source: null}), undefined);
});

test('frost anklet: a dodge leaves a frost trail that slows foes, for the wearer only', () => {
  const {w, p, q} = camp();
  wear(w, p, 'frostanklet');
  q.x = 20; q.z = 0;
  assert.equal(w.action(q.id, {type: 'dash'}).ok, true);
  assert.equal((w.zones || []).filter(z => z.trail).length, 0);
  p.dx = 1; p.dz = 0;
  assert.equal(w.action(p.id, {type: 'dash'}).ok, true);
  const trail = w.zones.filter(z => z.trail && z.owner === p.id);
  assert.equal(trail.length, TRINKET.frost.puffs);
  assert.ok(trail.every(z => z.kind === 'frost' && z.dps === 0));
  p.x = q.x = 60; p.z = q.z = 60; // out of reach, so no swing lands on the test creature
  for(const b of w.buildings) if(b.type === 'hearth') b.fuel = 0; // nor a hearth flare
  const e = foe(w, trail[1].x, trail[1].z, 200); e.speed = 0;
  w.tick(T);
  assert.ok(e.slowed > 0, 'the trail slows a creature in it');
  assert.equal(e.hp, 200, 'but does not hurt it');
  run(w, TRINKET.frost.life+.2);
  assert.equal(w.zones.filter(z => z.trail).length, 0, 'the trail melts');
});

test('nightfang: kills at night heal 1, only the wearer, not by day', () => {
  const {w, p, q} = camp();
  wear(w, p, 'nightfang');
  w.time = NIGHT;
  p.hp = 50; q.hp = 50;
  slay(w, p); slay(w, q);
  assert.equal(Math.round(p.hp*100)/100, 51);
  assert.equal(Math.round(q.hp*100)/100, 50);
  assert.ok(w.events.some(ev => ev.type === 'strike' && ev.kind === 'fang' && ev.player === p.id));
  w.time = 20; p.hp = 50;
  slay(w, p);
  assert.equal(Math.round(p.hp*100)/100, 50);
});

test('emberheart: courage drains half as fast in the dark, only for the wearer', () => {
  const {w, p, q} = camp();
  wear(w, p, 'emberheart');
  w.time = NIGHT;
  p.x = q.x = 60; p.z = 60; q.z = 61;
  assert.equal(w.lit(p), false);
  run(w, 2);
  const lostP = 100-p.courage, lostQ = 100-q.courage;
  assert.ok(lostQ > 5, `the dark bites (${lostQ})`);
  assert.ok(Math.abs(lostP-lostQ*TRINKET.darkDrain) < .5, `${lostP} vs ${lostQ}`);
  // By day nothing changes.
  const day = camp(); wear(day.w, day.p, 'emberheart'); day.w.time = 20; day.p.courage = 50;
  run(day.w, 1);
  assert.ok(day.p.courage < 51);
});

test('crowseye: caches near the wearer show on the map', () => {
  const {w, p, q} = camp();
  wear(w, p, 'crowseye');
  const cache = {id: 'c', type: 'ironchest', x: 20, z: 0};
  assert.equal(revealsCache(p, cache), true);
  assert.equal(revealsCache(q, cache), false);
  assert.equal(revealsCache(p, {...cache, x: TRINKET.cacheSight+1}), false);
  assert.equal(revealsCache(p, {...cache, type: 'tree'}), false);
});

test('boneward: blocks one blow every 20 seconds, and shows its cooldown', () => {
  const {w, p, q} = camp();
  wear(w, p, 'boneward');
  assert.equal(wardCooldown(w, p), 0);
  w.hurt(p, 10, null); w.hurt(q, 10, null);
  assert.equal(p.hp, 100);
  assert.equal(q.hp, 90);
  assert.ok(w.events.some(ev => ev.type === 'strike' && ev.kind === 'ward' && ev.player === p.id));
  assert.ok(Math.abs(wardCooldown(w, p)-TRINKET.wardCooldown) < 1e-9);
  w.hurt(p, 10, null);
  assert.equal(p.hp, 90, 'the next blow lands');
  w.time += TRINKET.wardCooldown;
  w.hurt(p, 10, null);
  assert.equal(p.hp, 90, 'ready again after 20 s');
  assert.equal(p.equipment.trinket.durability, 100, 'trinkets never wear');
});

test('wispfeather: +10% walk speed and a quicker dodge recharge', () => {
  const {w, p, q} = camp();
  wear(w, p, 'wispfeather');
  assert.ok(Math.abs(w.speedFactor(p)/w.speedFactor(q)-TRINKET.speed) < 1e-9);
  q.x = 20;
  for(let i = 0; i < DASH.charges; i++){
    assert.equal(w.action(p.id, {type: 'dash'}).ok, true);
    assert.equal(w.action(q.id, {type: 'dash'}).ok, true);
  }
  run(w, 2);
  assert.equal(p.dashCharges, 0);
  assert.equal(q.dashCharges, 0);
  assert.ok(Math.abs(p.dashRecharge[0] - (DASH.recharge-2*(1+TRINKET.dodgeRecharge))) < 1e-6);
  assert.equal(p.dashRecharge[1], DASH.recharge, 'the bonus only cools the active charge');
  let readyP = null, readyQ = null, fullP = null, fullQ = null;
  run(w, DASH.recharge*DASH.charges, () => {
    if(readyP == null && p.dashCharges > 0) readyP = w.time;
    if(readyQ == null && q.dashCharges > 0) readyQ = w.time;
    if(fullP == null && p.dashCharges === DASH.charges) fullP = w.time;
    if(fullQ == null && q.dashCharges === DASH.charges) fullQ = w.time;
    assert.equal(p.dashCooldown, p.dashRecharge[0] || 0, 'the HUD cooldown follows the active charge');
  });
  const faster = DASH.recharge/(1+TRINKET.dodgeRecharge);
  assert.ok(Math.abs(readyP-faster) < T*2, `${readyP} vs ${faster}`);
  assert.ok(Math.abs(readyQ-DASH.recharge) < T*2);
  assert.ok(Math.abs(fullP-faster*DASH.charges) < T*2);
  assert.ok(Math.abs(fullQ-DASH.recharge*DASH.charges) < T*2);
});

test('frost anklet: a perfect dodge refunds its charge and chills the attacker', () => {
  const {w, p} = camp();
  wear(w, p, 'frostanklet');
  const source = foe(w, 1, 0, 50);
  assert.equal(w.action(p.id, {type: 'dash'}).ok, true);
  w.hurt(p, 10, source);
  assert.equal(p.hp, 100);
  assert.equal(source.slowed, TRINKET.frost.chill);
  assert.equal(p.dashRecharge.length, 1);
  assert.equal(p.dashCooldown, DASH.perfectCooldown);
  w.tickDash(p, DASH.perfectCooldown);
  assert.equal(p.dashCharges, DASH.charges);
  assert.deepEqual(p.dashRecharge, []);
});

test('gravedust: the wearer\'s kills drop loot more often', () => {
  const tally = id => {
    const {w, p, q} = camp(31);
    if(id) wear(w, p, id);
    let items = 0;
    w.spillLoot = rolls => {items += rolls.length;};
    for(let i = 0; i < 20; i++) slay(w, p, 10);
    let other = 0;
    w.spillLoot = rolls => {other += rolls.length;};
    for(let i = 0; i < 20; i++) slay(w, q, 10);
    return {items, other};
  };
  const plain = tally(null), dusted = tally('gravedust');
  assert.ok(dusted.items > plain.items*1.25, `${dusted.items} vs ${plain.items}`);
  assert.ok(dusted.other < plain.items*1.25, 'a companion without it gains nothing');
});

test('moonlocket: +15% damage above 80% health', () => {
  const {w, p, q} = camp();
  const base = powerOf(p);
  wear(w, p, 'moonlocket');
  w.tick(T);
  assert.equal(p.might, TRINKET.might);
  assert.ok(Math.abs(powerOf(p)-base*TRINKET.might) < 1e-9);
  assert.ok(!(q.might > 1));
  p.hp = 70; w.tick(T);
  assert.equal(p.might, 1);
  // Taking it off leaves no stale multiplier.
  p.hp = 100; w.tick(T); assert.equal(p.might, TRINKET.might);
  p.equipment.trinket = null; w.tick(T);
  assert.equal(p.might, 1);
});

test('thornknot: melee blows against the wearer hurt the attacker', () => {
  const {w, p, q} = camp();
  wear(w, p, 'thornknot');
  const e = foe(w, 1, 0, 50);
  w.hurt(p, 10, e);
  assert.equal(e.hp, 50-Math.round(10*TRINKET.thorns));
  assert.equal(e.lastHitBy, p.id);
  w.hurt(p, 10, null); // a shot: nothing to thorn
  assert.equal(e.hp, 46);
  w.hurt(q, 10, e);
  assert.equal(e.hp, 46, 'only the wearer');
});

test('only the worn trinket counts: one in the pack does nothing', () => {
  const {w, p} = camp();
  const stack = w.mintStack('boneward', 1, 100);
  assert.ok(stack);
  w.hurt(p, 10, null);
  assert.equal(p.hp, 90);
  assert.equal(trinketOf(p), null);
});
