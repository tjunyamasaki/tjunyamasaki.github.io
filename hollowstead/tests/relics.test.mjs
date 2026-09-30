import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {RULES} from '../src/content.mjs';
import {TRINKET_IDS} from '../src/contracts.mjs';
import {DASH, maxHealth, powerOf, rarityOf} from '../src/progression.mjs';
import {CHARM, RESONANCES, TRINKET, TRINKET_TEXT, charmOf, potency, resonancesOf, revealsCache, trinketEvent, trinketHaste, trinketOf, trinketSpeed, wornTrinkets} from '../src/trinkets.mjs';
import {setupArena} from '../src/arena.mjs';
import {createActionSession} from '../src/transactions.mjs';
import {trinketTip} from '../src/ui/trinkets.mjs';
import {layoutOf} from '../src/dungeon/run.mjs?v=harvest-18';

const T = RULES.tick;
const RELICS = ['tinderpouch', 'crookedkey', 'soulstitch', 'gutteringcandle', 'gravechalk', 'redthread', 'hellspur', 'mournersveil', 'thirteenthbell', 'hollowmirror'];
function camp(seed = 402){
  const w = new World(seed); const p = w.addPlayer('host', 'Jun'); const q = w.addPlayer('guest', 'Ada'); w.start();
  w.ambient = false; w.enemies = [];
  for(const who of [p, q]){who.x = 0; who.z = 0; who.stamina = 100; who.regions = ['meadow', 'woods', 'graveyard', 'mire', 'crags', 'barrow'];}
  for(const b of w.buildings) if(b.type === 'hearth') b.fuel = 0; // no hearth flare stealing kills
  return {w, p, q};
}
/** Wear `ids` directly (the first in the trinket socket, the second in the charm socket). */
function wear(w, p, ...ids){
  p.charmOpen = true;
  ['trinket', 'charm'].forEach((socket, i) => {p.equipment[socket] = ids[i] ? w.mintStack(ids[i], 1, 100) : null;});
  p.equipmentRevision++;
}
function run(w, seconds, each = null){for(let t = 0; t < seconds-1e-9; t += T){for(const p of w.players) if(p.online) w.input(p.id, {x: 0, z: 0}); each?.(); w.tick(T);}}
function foe(w, x = 1, z = 0, hp = 500){const e = w.spawnEnemy('crawler', x, z, {elite: false}); e.hp = e.maxHp = hp; e.cooldown = 99; return e;}
function slay(w, p, e = foe(w, 3, 3, 10)){e.hp = 0; e.lastHitBy = p.id; w.tick(T); return e;}

// ------------------------------------------------------------------ the second socket
test('ten relics: loot of every rarity, each with its text and its art', () => {
  assert.equal(TRINKET_IDS.length, 20);
  for(const id of RELICS){
    assert.ok(TRINKET_IDS.includes(id), id);
    assert.ok(TRINKET_TEXT[id], id);
    assert.match(trinketTip(id), new RegExp(TRINKET_TEXT[id].replace(/[()+%]/g, '.')));
  }
  assert.deepEqual(RELICS.map(rarityOf), ['uncommon', 'uncommon', 'uncommon', 'rare', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary']);
  // Every relic but the mirror belongs to at least one resonance, and every resonance pairs two trinkets.
  for(const id of RELICS.filter(id => id !== 'hollowmirror')) assert.ok(RESONANCES.some(r => r.pair.includes(id)), `${id} resonates`);
  for(const r of RESONANCES){assert.equal(r.pair.length, 2); for(const id of r.pair) assert.ok(TRINKET_IDS.includes(id));}
  assert.match(trinketTip('tinderpouch'), /Wildfire, with Ember heart/);
});

test('the second socket is locked until level 10; then a second trinket goes there, never a twin', () => {
  const {w, p} = camp();
  const give = id => {w.give(p, id, 1); return p.inventory.slots.find(s => s?.itemId === id).uid;};
  const equip = uid => w.equip(p, uid, 'trinket', p.inventory.revision, p.equipmentRevision);
  assert.equal(equip(give('moonlocket')).ok, true);
  assert.equal(trinketOf(p), 'moonlocket');
  const candle = give('gutteringcandle');
  // Locked: equipping swaps the first socket instead, and the charm socket refuses outright.
  assert.equal(w.equip(p, candle, 'charm', p.inventory.revision, p.equipmentRevision).ok, false);
  assert.equal(charmOf(p), null);
  // Level 10 opens it.
  while(p.level < CHARM.level) w.awardXp(p, 5000);
  assert.equal(p.charmOpen, true);
  assert.ok(w.events.some(e => e.type === 'announce' && /second trinket/.test(e.text)));
  assert.equal(equip(candle).ok, true);
  assert.deepEqual(wornTrinkets(p), ['moonlocket', 'gutteringcandle']);
  // A second Moon locket cannot join the first.
  const twin = give('moonlocket');
  assert.equal(w.equip(p, twin, 'charm', p.inventory.revision, p.equipmentRevision).ok, false);
  assert.equal(charmOf(p), 'gutteringcandle');
  // Save and restore keep both sockets and the unlock.
  const back = World.restore(JSON.parse(JSON.stringify(w.snapshot({purpose: 'save'})))).player('host');
  assert.equal(back.charmOpen, true);
  assert.equal(back.equipment.charm.itemId, 'gutteringcandle');
});

test('dragging a trinket onto the locked socket is refused; once open it is accepted', () => {
  const {w, p} = camp();
  w.give(p, 'crookedkey', 1);
  const index = p.inventory.slots.findIndex(s => s?.itemId === 'crookedkey'), uid = p.inventory.slots[index].uid;
  const session = createActionSession({getWorld: () => w, actorId: 'host'});
  let seq = 0;
  const move = () => session.execute({requestId: `${session.sessionId}:${++seq}`, worldId: w.networkId, type: 'inventoryMove', sourceContainerId: p.inventory.id, sourceSlot: index, destinationContainerId: 'equipment:host', destinationSlot: 8, uid, quantity: 1, sourceRevision: p.inventory.revision, destinationRevision: p.equipmentRevision});
  assert.equal(move().ok, false);
  assert.equal(charmOf(p), null);
  p.charmOpen = true;
  assert.equal(move().ok, true);
  assert.equal(charmOf(p), 'crookedkey');
});

test('a fallen Warden opens the second socket for everyone standing', () => {
  const w = new World(12, {dungeon: {variant: 'crypt'}}); const p = w.addPlayer('host', 'Jun'); const q = w.addPlayer('g', 'Ada'); w.start();
  assert.equal(p.charmOpen, undefined);
  const L = layoutOf(w), exit = L.rooms[L.exit];
  for(const who of [p, q]){who.x = exit.x + 1; who.z = exit.z + 1.5; who.hp = who.maxHp = 1e6;}
  run(w, T*3);
  const warden = w.enemies.find(e => e.warden);
  warden.hp = 0; warden.lastHitBy = p.id; w.tick(T);
  assert.equal(p.charmOpen, true); assert.equal(q.charmOpen, true);
});

// ------------------------------------------------------------------ the relics
test('tinder pouch: blows can set foes burning, scaled by the wearer’s power', () => {
  const {w, p} = camp();
  wear(w, p, 'tinderpouch');
  w.rng = () => 0; // always ignites
  const e = foe(w);
  w.strike(p, e, 10, 0);
  assert.ok(e.burn?.remaining > 0);
  assert.ok(Math.abs(e.burn.dps - TRINKET.tinder.dps*powerOf(p)) < 1e-9);
  const hp = e.hp; run(w, 1);
  assert.ok(e.hp < hp - 3, 'the fire burns');
});

test('crooked key: caches open twice as fast and mend the opener', () => {
  const time = withKey => {
    const {w, p} = camp(55);
    if(withKey) wear(w, p, 'crookedkey');
    const node = {id: 'nX', type: 'ironchest', x: 1.2, z: 0, hits: 1, ready: 0}; w.nodes.push(node);
    p.hp = 50;
    let t = 0;
    while(!(node.ready > 0) && t < 10){w.input('host', {x: 0, z: 0, act: true, target: 'nX'}); w.tick(T); t += T;}
    return {t, hp: p.hp};
  };
  const plain = time(false), keyed = time(true);
  assert.ok(Math.abs(keyed.t - plain.t/TRINKET.keyRate) < T*2, `${keyed.t} vs ${plain.t}`);
  assert.ok(keyed.hp >= plain.hp + TRINKET.keyHeal - 1);
});

test('soulstitch: every kill cuts the skill recharge, elders more', () => {
  const {w, p} = camp();
  wear(w, p, 'soulstitch');
  p.skillCd = 10;
  slay(w, p);
  assert.ok(Math.abs(p.skillCd - (10 - T - TRINKET.stitch)) < 1e-6);
  const elder = foe(w, 3, 3, 10); elder.elite = true;
  const before = p.skillCd; slay(w, p, elder);
  assert.ok(Math.abs(p.skillCd - (before - T - TRINKET.stitchElite)) < 1e-6);
});

test('guttering candle: the lower the health, the harder the blow, and it multiplies with the moon locket', () => {
  const {w, p} = camp();
  wear(w, p, 'gutteringcandle');
  w.tick(T); assert.ok(!(p.might > 1));
  p.hp = maxHealth(p)*TRINKET.candle.full; w.tick(T);
  assert.ok(Math.abs(p.might - (1 + TRINKET.candle.most)) < 1e-3);
  p.hp = maxHealth(p)*.625; w.tick(T);
  assert.ok(p.might > 1.15 && p.might < 1.25, `${p.might}`);
  wear(w, p, 'gutteringcandle', 'moonlocket'); p.hp = maxHealth(p); w.tick(T);
  assert.ok(Math.abs(p.might - TRINKET.might) < 1e-3, 'at full health only the locket');
});

test('grave chalk: the first blow on each foe is a critical hit, for each wearer', () => {
  const {w, p, q} = camp();
  wear(w, p, 'gravechalk'); wear(w, q, 'gravechalk');
  const e = foe(w);
  w.strike(p, e, 20, 0); assert.equal(e.hp, 500 - 30);
  w.strike(p, e, 20, 0); assert.equal(e.hp, 500 - 50);
  w.strike(q, e, 20, 0); assert.equal(e.hp, 500 - 80, 'a friend’s first blow is theirs');
  assert.ok(w.events.some(ev => ev.type === 'damage' && ev.crit));
});

test('red thread: near a friend (or a summon) both take less; revives go twice as fast', () => {
  const {w, p, q} = camp();
  wear(w, p, 'redthread');
  q.x = 3;
  w.hurt(p, 100, null); w.hurt(q, 100, null);
  assert.ok(Math.abs(p.hp - (100 - 100*(1 - TRINKET.thread.guard))) < 1e-6, `${p.hp}`);
  assert.ok(Math.abs(q.hp - (100 - 100*(1 - TRINKET.thread.guard))) < 1e-6, 'the friend beside the wearer too');
  // Alone: nothing.
  const lone = camp(); wear(lone.w, lone.p, 'redthread'); lone.q.x = 40;
  lone.w.hurt(lone.p, 50, null); assert.equal(lone.p.hp, 50);
  // A summon counts as company.
  lone.w.allies.push({id: 'a1', type: 'wight', owner: 'host', x: 1, z: 0, hp: 100});
  lone.w.hurt(lone.p, 20, null); assert.ok(Math.abs(lone.p.hp - (50 - 20*(1 - TRINKET.thread.guard))) < 1e-6);
  // Reviving.
  q.x = 2; q.hp = 1; w.hurt(q, 50, null); assert.ok(q.down);
  let t = 0; while(q.down && t < 5){w.input('host', {x: 0, z: 0, act: true, target: 'guest'}); w.tick(T); t += T;}
  assert.ok(!q.down); assert.ok(Math.abs(t - 3/TRINKET.thread.revive) < T*2, `${t}`);
});

test('hellspur: kills build Frenzy (faster swings and feet) that fades without more', () => {
  const {w, p, q} = camp();
  wear(w, p, 'hellspur');
  for(let i = 0; i < 7; i++) slay(w, p);
  assert.equal(p.frenzy, TRINKET.frenzy.max);
  assert.ok(Math.abs(trinketHaste(w, p) - (1 + TRINKET.frenzy.haste*TRINKET.frenzy.max)) < 1e-9);
  assert.ok(w.speedFactor(p) > w.speedFactor(q)*1.15);
  // A real swing comes back sooner.
  w.grantEquipped(p, 'spear'); w.grantEquipped(q, 'spear'); foe(w, 1, 0); foe(w, 1, .1);
  p.cooldown = q.cooldown = 0;
  w.input('host', {x: 0, z: 0, attack: true}); w.input('guest', {x: 0, z: 0, attack: true}); w.tick(T);
  assert.ok(p.cooldown < q.cooldown/1.3, `${p.cooldown} vs ${q.cooldown}`);
  run(w, TRINKET.frenzy.hold + .2);
  assert.equal(p.frenzy, 0);
});

test('mourner’s veil: a perfect dodge leaves a phantom that bursts and stuns', () => {
  const {w, p} = camp();
  wear(w, p, 'mournersveil'); w.grantEquipped(p, 'spear');
  const e = foe(w, 1.5, 0);
  assert.equal(w.action('host', {type: 'dash'}).ok, true);
  const at = {x: p.x, z: p.z};
  w.hurt(p, 10, e);
  assert.ok(p.veil);
  e.x = at.x + .5; e.z = at.z;
  run(w, TRINKET.veil.delay + .1, () => {e.x = at.x + .5; e.z = at.z; e.cooldown = 99;});
  assert.equal(p.veil, null);
  assert.ok(e.hp < 500 - 15*TRINKET.veil.hit*.9, `${e.hp}`);
  assert.ok(e.stunned > 0);
  assert.ok(w.events.some(ev => ev.type === 'burst' && ev.itemId === 'mournersveil'));
});

test('thirteenth bell: every 13th blow tolls for triple damage and stuns the crowd', () => {
  const {w, p} = camp();
  wear(w, p, 'thirteenthbell');
  const e = foe(w, 1, 0, 5000), near = foe(w, 2, 0, 5000);
  for(let i = 0; i < 12; i++) w.strike(p, e, 10, 0);
  assert.equal(e.hp, 5000 - 120); assert.equal(p.tolls, 12);
  w.strike(p, e, 10, 0);
  assert.equal(e.hp, 5000 - 150);
  assert.equal(p.tolls, 0);
  assert.ok(near.stunned > 0 && e.stunned > 0);
  assert.ok(w.events.some(ev => ev.type === 'strike' && ev.kind === 'toll'));
});

test('hollow mirror: the other trinket is 60% stronger; alone it does nothing', () => {
  const {w, p, q} = camp();
  wear(w, p, 'moonlocket', 'hollowmirror'); wear(w, q, 'hollowmirror');
  w.tick(T);
  assert.equal(potency(p, 'moonlocket'), TRINKET.mirror);
  assert.ok(Math.abs(p.might - (1 + (TRINKET.might - 1)*TRINKET.mirror)) < 1e-3);
  assert.ok(!(q.might > 1));
  wear(w, p, 'hollowmirror', 'wispfeather');
  assert.ok(Math.abs(trinketSpeed(w, p) - (1 + (TRINKET.speed - 1)*TRINKET.mirror)) < 1e-9);
  wear(w, p, 'thirteenthbell', 'hollowmirror');
  const e = foe(w, 1, 0, 5000);
  for(let i = 0; i < 8; i++) w.strike(p, e, 10, 0);
  assert.equal(p.tolls, 0, 'the bell tolls every 8th blow with the mirror');
});

// ------------------------------------------------------------------ resonances
test('resonances need both halves worn', () => {
  const {w, p} = camp();
  wear(w, p, 'tinderpouch'); assert.deepEqual(resonancesOf(p), []);
  wear(w, p, 'tinderpouch', 'emberheart'); assert.deepEqual(resonancesOf(p).map(r => r.id), ['wildfire']);
  wear(w, p, 'emberheart', 'tinderpouch'); assert.deepEqual(resonancesOf(p).map(r => r.id), ['wildfire'], 'either socket');
});

test('Wildfire: a burning foe that dies spreads the fire', () => {
  const {w, p} = camp();
  wear(w, p, 'tinderpouch', 'emberheart');
  const a = foe(w, 3, 3, 10), b = foe(w, 4, 3), c = foe(w, 12, 12);
  a.burn = {dps: 8, remaining: 2};
  slay(w, p, a);
  assert.ok(b.burn?.remaining > 0); assert.ok(!c.burn);
});

test('Pilgrim: crow’s eye sees twice as far, and a whole dungeon floor', () => {
  const {w, p} = camp();
  const far = {id: 'c', type: 'ironchest', x: TRINKET.cacheSight*1.5, z: 0};
  wear(w, p, 'crowseye'); assert.equal(revealsCache(p, far, w), false);
  wear(w, p, 'crowseye', 'crookedkey'); assert.equal(revealsCache(p, far, w), true);
  const deep = new World(3, {dungeon: {variant: 'caverns'}}); const d = deep.addPlayer('host', 'Jun'); wear(deep, d, 'crowseye', 'crookedkey');
  assert.ok(deep.nodes.every(n => revealsCache(d, {...n, x: n.x + 500}, deep)));
});

test('Choir: the bell’s toll finishes the skill recharge', () => {
  const {w, p} = camp();
  wear(w, p, 'soulstitch', 'thirteenthbell'); p.skillCd = 20;
  const e = foe(w, 1, 0, 5000);
  for(let i = 0; i < TRINKET.bell.every; i++) w.strike(p, e, 1, 0);
  assert.equal(p.skillCd, 0);
});

test('Bloodletting: night fang heals by day, and 4 while below half health', () => {
  const {w, p} = camp();
  w.time = 20;
  wear(w, p, 'nightfang'); p.hp = 40; slay(w, p); assert.equal(Math.round(p.hp), 40, 'plain night fang: not by day');
  wear(w, p, 'nightfang', 'gutteringcandle'); p.hp = 40; slay(w, p); assert.equal(Math.round(p.hp), 44);
  p.hp = 80; slay(w, p); assert.equal(Math.round(p.hp), 81);
});

test('Deathmark: a foe slain by its first blow adds two Frenzy', () => {
  const {w, p} = camp();
  wear(w, p, 'gravechalk', 'hellspur');
  const e = foe(w, 1, 0, 10); w.strike(p, e, 10, 0); e.lastHitBy = p.id; w.tick(T);
  assert.equal(p.frenzy, 3);
  const f = foe(w, 1, 0, 100); w.strike(p, f, 10, 0); f.hp = 0; f.lastHitBy = p.id; w.tick(T);
  assert.equal(p.frenzy, 4, 'a foe that took more than one blow adds one');
});

test('Brambleguard: blows against friends near the wearer are thorned back', () => {
  const {w, p, q} = camp();
  wear(w, p, 'redthread', 'thornknot'); q.x = 2;
  const e = foe(w, 3, 0, 100);
  w.hurt(q, 20, e);
  assert.ok(e.hp < 100); assert.equal(e.lastHitBy, 'host');
  const lone = camp(); wear(lone.w, lone.p, 'thornknot'); lone.q.x = 2;
  const f = foe(lone.w, 3, 0, 100); lone.w.hurt(lone.q, 20, f); assert.equal(f.hp, 100, 'thorn knot alone guards only the wearer');
});

test('Stampede: at full Frenzy each kill gives back a dodge charge', () => {
  const {w, p} = camp();
  wear(w, p, 'hellspur', 'wispfeather');
  for(let i = 0; i < TRINKET.frenzy.max; i++) slay(w, p);
  assert.equal(w.action('host', {type: 'dash'}).ok, true); run(w, .3);
  assert.equal(p.dashCharges, DASH.charges - 1);
  slay(w, p);
  assert.equal(p.dashCharges, DASH.charges);
});

test('Grave frost: the phantom freezes what it hits for 2 seconds', () => {
  const {w, p} = camp();
  wear(w, p, 'mournersveil', 'frostanklet');
  const e = foe(w, 1.5, 0);
  w.action('host', {type: 'dash'}); const at = {x: p.x, z: p.z}; w.hurt(p, 10, e);
  run(w, TRINKET.veil.delay + .1, () => {e.x = at.x + .5; e.z = at.z;});
  assert.ok(e.stunned >= 1.7, `${e.stunned}`);
});

test('none of it works in the arena', () => {
  const w = new World(9); const p = w.addPlayer('host', 'Jun'); setupArena(w);
  wear(w, p, 'hellspur', 'thirteenthbell'); p.frenzy = 5;
  assert.equal(trinketHaste(w, p), 1);
  assert.equal(trinketSpeed(w, p), 1);
  assert.equal(trinketEvent(w, p, 'hurt', {amount: 10, source: null}), undefined);
});
