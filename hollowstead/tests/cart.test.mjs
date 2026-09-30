import test from 'node:test';
import assert from 'node:assert/strict';
import {World, distance} from '../src/engine.mjs';
import {RULES, STRUCTURES} from '../src/content.mjs';
import {createActionSession} from '../src/transactions.mjs';
import {collectLocations, duplicateUids, makeStack} from '../src/inventory.mjs';
import {validateV2World} from '../src/serialization.mjs';
import {describeContext} from '../src/ui/actions.mjs';
import {createNetwork} from '../src/network.mjs';
import {harness, flush} from './network-harness.mjs';
import {CART, CART_LEVELS, cartFacts, cartFrame, cartLoad, cartSpeed, cartTargets, towedBy} from '../src/cart.mjs?v=harvest-18';

const T = RULES.tick, HOLD = CART.rope+CART.stretch;
/** Open ground east of the hearth: host `p` and guest `q`, and a hand cart just west of the host. */
function camp({cart: withCart = true} = {}){
  const w = new World(12), p = w.addPlayer('host', 'Jun'), q = w.addPlayer('guest', 'Mo'); w.start();
  w.ambient = false; w.enemies = []; w.nodes = [];
  p.x = 20; p.z = 0; q.x = 20; q.z = 2.2; p.dx = 1; p.dz = 0;
  let cart = null;
  if(withCart){cart = w.structure('cart', 18.4, 0); w.buildings.push(cart);}
  let clock = 0; const sessions = new Map(), seq = new Map();
  function command(actor, value){
    if(!sessions.has(actor.id)) sessions.set(actor.id, createActionSession({getWorld: () => w, actorId: actor.id, now: () => clock}));
    const session = sessions.get(actor.id), n = (seq.get(actor.id) || 0)+1; seq.set(actor.id, n); clock += 60;
    return session.execute({...value, requestId: session.sessionId+':'+n, worldId: w.networkId});
  }
  const transfer = (actor, sessionId, source, destination, uid, quantity = 1) => command(actor, {
    type: 'chestTransfer', chestId: cart.id, sessionId, sourceContainerId: source.id, destinationContainerId: destination.id,
    sourceSlot: source.slots.findIndex(s => s?.uid === uid), destinationSlot: null, uid, quantity,
    sourceRevision: source.revision, destinationRevision: destination.revision,
  });
  return {w, p, q, cart, command, transfer};
}
function run(w, seconds, input = {x: 0, z: 0}, each = null){
  for(let t = 0; t < seconds-1e-9; t += T){for(const p of w.players) if(p.online) w.input(p.id, typeof input === 'function' ? input(p) : input); w.tick(T); each?.();}
}
/** Put `count` single-item stacks straight into the cart (distinct uids). */
function load(w, cart, count, itemId = 'stone'){
  for(let i = 0, k = 0; i < count && k < cart.store.slots.length; k++) if(!cart.store.slots[k]){cart.store.slots[k] = makeStack(w.nextItemUid(), itemId, 3).stack; i++;}
  cart.store.revision++;
}
const pull = (w, p, cart) => w.action(p.id, {type: 'cart', op: 'pull', cartId: cart.id});

// ------------------------------------------------------------------ building and storage
test('a hand cart is built in the field with a real store of 8 slots', () => {
  const {w, p, command} = camp({cart: false});
  w.clearPack(p); w.give(p, 'wood', 8); w.give(p, 'fiber', 4); w.give(p, 'stone', 2);
  const built = command(p, {type: 'placeBuilding', recipeId: 'cart', x: p.x-2, z: p.z});
  assert.equal(built.ok, true, built.code);
  const cart = w.buildings.find(b => b.type === 'cart');
  assert.equal(cart.store.slots.length, 8); assert.equal(cart.level, 1);
  assert.equal(cart.towedBy, null); assert.equal(cart.frame, 0); assert.equal(cart.maxHp, STRUCTURES.cart.hp);
  assert.equal(w.count(p, 'wood'), 0);
  assert.deepEqual(CART_LEVELS.map(l => l.slots), [8, 12, 16]);
});

test('host and guest open the cart like a chest, one at a time, and move items both ways', () => {
  const {w, p, q, cart, command, transfer} = camp();
  w.clearPack(p); w.give(p, 'wood', 5);
  const opened = command(p, {type: 'chestOpen', chestId: cart.id});
  assert.equal(opened.ok, true, opened.code);
  assert.equal(command(q, {type: 'chestOpen', chestId: cart.id}).code, 'chestInUse');
  const wood = p.inventory.slots.find(s => s?.itemId === 'wood');
  assert.equal(transfer(p, opened.sessionId, p.inventory, cart.store, wood.uid, 3).ok, true);
  assert.equal(w.count(p, 'wood'), 2); assert.equal(cartLoad(cart).used, 1);
  run(w, T); assert.equal(cart.frame, 1);
  assert.equal(command(p, {type: 'chestClose', chestId: cart.id, sessionId: opened.sessionId}).ok, true);
  // The guest takes it out again.
  const theirs = command(q, {type: 'chestOpen', chestId: cart.id});
  assert.equal(theirs.ok, true, theirs.code);
  const stack = cart.store.slots.find(Boolean);
  assert.equal(transfer(q, theirs.sessionId, cart.store, q.inventory, stack.uid, 3).ok, true);
  assert.equal(w.count(q, 'wood') >= 3, true); assert.equal(cartLoad(cart).used, 0);
  // Eight slots and no more: a ninth stack does not fit and the store never grows.
  load(w, cart, 8);
  w.give(q, 'fiber', 1);
  const fiber = q.inventory.slots.find(s => s?.itemId === 'fiber');
  assert.equal(transfer(q, theirs.sessionId, q.inventory, cart.store, fiber.uid, 1).code, 'inventoryFull');
  assert.equal(cart.store.slots.length, 8);
  assert.deepEqual(duplicateUids(collectLocations(w)), []);
});

test('a guest opens a cart and moves items over the real network protocol; frames carry the cart', async () => {
  const h = harness(), w = new World(71); const host = w.addPlayer('host'); w.start();
  const cart = w.structure('cart', host.x+1.5, host.z); w.buildings.push(cart);
  assert.equal(pull(w, host, cart).ok, true);
  const opts = {signaling: h.signal, PeerConnection: h.PC}, net = createNetwork({...opts, getWorld: () => w}), guests = [];
  try{
    await net.host();
    const record = {}; record.net = createNetwork({...opts, onReady: id => record.id = id, onFrame: frame => record.frame = World.restore(frame)});
    guests.push(record.net); await record.net.join('ABCDE', 'Friend', 'moss'); await flush();
    const guest = w.player(record.id); guest.x = cart.x; guest.z = cart.z+1.2;
    const seen = record.frame.buildings.find(b => b.id === cart.id);
    assert.equal(seen.towedBy, 'host'); assert.equal(seen.store.slots.length, 8); assert.equal(seen.level, 1);
    assert.equal(Object.hasOwn(seen, 'trail'), false);
    const grant = await record.net.action({type: 'chestOpen', chestId: cart.id});
    assert.equal(grant.ok, true, grant.code);
    const actor = record.frame.player(record.id), wood = actor.inventory.slots.find(s => s?.itemId === 'wood'), store = record.frame.buildings.find(c => c.id === cart.id).store;
    const moved = await record.net.action({type: 'chestTransfer', chestId: cart.id, sessionId: grant.sessionId, sourceContainerId: actor.inventory.id, sourceSlot: actor.inventory.slots.indexOf(wood), destinationContainerId: store.id, destinationSlot: null, uid: wood.uid, quantity: 2, sourceRevision: actor.inventory.revision, destinationRevision: store.revision});
    assert.equal(moved.ok, true, moved.code);
    assert.equal(cartLoad(cart).used, 1);
    assert.equal(record.frame.buildings.find(c => c.id === cart.id).store.slots.filter(Boolean).length, 1);
  }finally{for(const g of guests) await g.stop(); await net.stop();}
});

// ------------------------------------------------------------------ pulling
test('a pulled cart trails a rope length behind, rounds corners and never cuts through water or trees', () => {
  const {w, p, cart} = camp();
  // A pond fills the inside of the corner: a cart cutting straight at its puller would roll into it.
  w.walkable = (x, z) => Math.hypot(x, z) < RULES.radius-1 && !(z > .5 && x < 28);
  // A trunk south of the path, clear of the puller's footsteps.
  w.nodes.push({id: 'corner-tree', type: 'tree', x: 26, z: -1.2, hits: 4, ready: 0});
  assert.equal(pull(w, p, cart).ok, true); assert.equal(cart.towedBy, 'host');
  const obstacles = () => w.obstacles();
  let worst = 0;
  run(w, 6, q => q.x < 28.4 ? {x: 1, z: 0} : {x: 0, z: 1}, () => {
    assert.equal(w.walkable(cart.x, cart.z), true, `cart in water at ${cart.x.toFixed(2)},${cart.z.toFixed(2)}`);
    assert.equal(w.blockedAt(cart.x, cart.z, obstacles(), cart.id), false, `cart inside something at ${cart.x.toFixed(2)},${cart.z.toFixed(2)}`);
    worst = Math.max(worst, distance(p, cart));
  });
  assert.ok(p.z > 6, `the puller walked on (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
  assert.ok(Math.abs(cart.x-p.x) < .35, 'the cart rounded the corner behind its puller');
  assert.ok(distance(p, cart) > 1.4 && distance(p, cart) < 1.8, `trails ${distance(p, cart).toFixed(2)}`);
  assert.ok(worst <= HOLD+.05);
  assert.equal(cart.towedBy, 'host');
});

test('a towed cart never blocks its own puller, but blocks everyone else', () => {
  const {w, p, q, cart} = camp();
  pull(w, p, cart);
  const obstacles = w.obstacles();
  assert.equal(w.blockedAt(cart.x, cart.z, obstacles, p.id), false);
  assert.equal(w.blockedAt(cart.x, cart.z, obstacles, q.id), true);
  assert.equal(w.blockedAt(cart.x, cart.z, obstacles, 'e1'), true);
  // Walking back past the cart works; it swings round behind again.
  run(w, 2, {x: -1, z: 0});
  assert.ok(p.x < cart.x, 'walked back through the handle');
  assert.equal(cart.towedBy, 'host');
});

test('a cart that snags holds its puller back, then the handle slips', () => {
  const {w, p, cart} = camp();
  pull(w, p, cart);
  run(w, 1, {x: 1, z: 0});
  // A trunk grows right behind the puller, across the cart's path.
  w.nodes.push({id: 'snag', type: 'tree', x: cart.x+.95, z: 0, hits: 4, ready: 0});
  run(w, .8, {x: 1, z: 0});
  assert.equal(cart.towedBy, 'host');
  assert.ok(distance(p, cart) <= HOLD+.02, `held at ${distance(p, cart).toFixed(2)}`);
  const heldAt = p.x;
  run(w, CART.slip, {x: 1, z: 0});
  assert.equal(cart.towedBy, null);
  assert.match(p.notice, /slipped/);
  run(w, 1, {x: 1, z: 0});
  assert.ok(p.x > heldAt+2, 'free to walk once the handle slipped');
});

test('pulling is slower the fuller the cart; better wheels soften it', () => {
  const {w, p, cart} = camp();
  assert.equal(cartSpeed(w, p), 1);
  pull(w, p, cart);
  assert.ok(Math.abs(cartSpeed(w, p)-.92) < 1e-9);
  load(w, cart, 4); assert.ok(Math.abs(cartSpeed(w, p)-.77) < 1e-9);
  load(w, cart, 4); assert.ok(Math.abs(cartSpeed(w, p)-.62) < 1e-9);
  assert.equal(w.speedFactor(p) < .63, true);
  cart.level = 2; cart.store.slots.push(null, null, null, null);
  assert.ok(Math.abs(cartSpeed(w, p)-(.94-.2*8/12)) < 1e-9);
  // Over the same time a full cart gets pulled a shorter way than an empty one.
  const walk = count => {const c = camp(); load(c.w, c.cart, count); pull(c.w, c.p, c.cart); const x0 = c.p.x; run(c.w, 2, {x: 1, z: 0}); return c.p.x-x0;};
  const empty = walk(0), full = walk(8);
  assert.ok(Math.abs(full/empty-.62/.92) < .05, `${full.toFixed(2)} vs ${empty.toFixed(2)}`);
});

test('one puller per cart, one cart per wanderer; downed or dodging lets go', () => {
  const {w, p, q, cart} = camp();
  const other = w.structure('cart', 21.4, 1.6); w.buildings.push(other);
  assert.equal(pull(w, p, cart).ok, true);
  assert.equal(pull(w, q, cart).ok, false); assert.match(q.notice, /Jun is pulling/);
  assert.equal(pull(w, p, other).ok, true);
  assert.equal(cart.towedBy, null); assert.equal(other.towedBy, 'host'); assert.equal(towedBy(w, p), other);
  assert.equal(w.action(p.id, {type: 'cart', op: 'release', cartId: other.id}).ok, true); assert.equal(other.towedBy, null);
  // Downed: the handle drops.
  pull(w, p, cart); w.hurt(p, 9999); run(w, T);
  assert.ok(p.down > 0); assert.equal(cart.towedBy, null);
  assert.equal(pull(w, p, cart).ok, false);
  // A dodge lets go too.
  w.revivePlayer(p); p.x = cart.x+1.4; p.z = cart.z; p.stamina = 100; p.dashCooldown = 0;
  assert.equal(pull(w, p, cart).ok, true);
  assert.equal(w.action(p.id, {type: 'dash'}).ok, true);
  run(w, T);
  assert.equal(cart.towedBy, null); assert.match(p.notice, /dodge/);
  // Out of reach: no grabbing it from afar.
  p.x = cart.x+6; assert.equal(pull(w, p, cart).code, 'outOfRange');
});

test('pulling a cart away ends whoever had it open', () => {
  const {w, p, q, cart, command} = camp();
  q.x = cart.x; q.z = cart.z+1.2;
  const opened = command(q, {type: 'chestOpen', chestId: cart.id});
  assert.equal(opened.ok, true);
  pull(w, p, cart); run(w, 2.5, pl => pl.id === 'host' ? {x: 1, z: 0} : {x: 0, z: 0});
  assert.equal(w.chestSessions.has(cart.id), false);
  // The puller opens it on the move.
  const mine = command(p, {type: 'chestOpen', chestId: cart.id});
  assert.equal(mine.ok, true, mine.code);
});

// ------------------------------------------------------------------ upgrades
test('upgrades need a workbench and materials; more slots, more health, the reinforced sprite row', () => {
  const {w, p, cart} = camp();
  load(w, cart, 3, 'wood');
  const upgrade = () => w.action(p.id, {type: 'cart', op: 'upgrade', cartId: cart.id});
  w.clearPack(p);
  assert.equal(upgrade().code, 'stationRequired'); assert.match(p.notice, /workbench/);
  const bench = w.structure('bench', p.x+1, p.z+1.4); w.buildings.push(bench);
  assert.equal(upgrade().ok, false); assert.match(p.notice, /Needs/);
  assert.equal(cartFacts(w, p, cart).canUpgrade, false);
  w.give(p, 'wood', 10); w.give(p, 'ore', 3); w.give(p, 'fiber', 4);
  assert.equal(cartFacts(w, p, cart).canUpgrade, true);
  assert.equal(upgrade().ok, true);
  assert.equal(cart.level, 2); assert.equal(cart.store.slots.length, 12); assert.equal(cart.maxHp, 320); assert.equal(cart.hp, 320);
  assert.equal(w.count(p, 'ore'), 0); assert.equal(cartLoad(cart).used, 3, 'the load stays put');
  assert.equal(cart.frame, 4); assert.equal(cartFrame(cart), 3+1);
  w.give(p, 'wood', 12); w.give(p, 'ore', 6); w.give(p, 'bone', 4); p.cooldown = 0;
  assert.equal(upgrade().ok, true);
  assert.equal(cart.level, 3); assert.equal(cart.store.slots.length, 16); assert.equal(cart.maxHp, 420);
  assert.equal(upgrade().ok, false); assert.match(p.notice, /fully upgraded/);
  assert.deepEqual(duplicateUids(collectLocations(w)), []);
});

test('the sprite frame follows level and load: empty, partly, full on two rows', () => {
  const {w, cart} = camp();
  assert.equal(cartFrame(cart), 0);
  load(w, cart, 1); assert.equal(cartFrame(cart), 1);
  load(w, cart, 3); assert.equal(cartFrame(cart), 1); // 4/8 is still "partly"
  load(w, cart, 1); assert.equal(cartFrame(cart), 2);
  cart.level = 2; assert.equal(cartFrame(cart), 5);
  run(w, T); assert.equal(cart.frame, 5);
});

// ------------------------------------------------------------------ hostiles
test('hostiles hunt a cart that is nearer than any wanderer: bites, orbs, spores and charges all land', () => {
  for(const type of ['crawler', 'wraith', 'bogling', 'bonewalker']){
    const {w, p, cart} = camp();
    p.x = cart.x+7; p.z = 0; // within sight of the creature too, only farther than the cart
    assert.deepEqual(cartTargets(w).map(b => b.id), [cart.id]);
    const e = w.spawnEnemy(type, cart.x-4.5, cart.z+.5, {elite: false}); e.hp = e.maxHp = 9999; e.cooldown = 0;
    run(w, 10);
    assert.ok(cart.hp < cart.maxHp, `${type} never hurt the cart`);
    assert.equal(w.damagedAt.has(p.id), false, `${type} went for the wanderer`);
  }
});

test('roamers and cache guards go for a cart parked on their ground as they would for a wanderer', () => {
  const {w, p, cart} = camp();
  p.x = cart.x+30;
  const e = w.spawnEnemy('crawler', cart.x-3, cart.z, {home: true, roamer: true, leash: 12}); e.hp = e.maxHp = 9999; e.cooldown = 0;
  run(w, 8);
  assert.ok(cart.hp < cart.maxHp);
  assert.equal(w.damagedAt.has(p.id), false);
});

test('a destroyed cart spills everything it carried, exactly once', () => {
  const {w, p, cart} = camp();
  load(w, cart, 5, 'wood'); pull(w, p, cart);
  const uids = cart.store.slots.filter(Boolean).map(s => s.uid).sort();
  cart.hp = 0; run(w, T);
  assert.equal(w.buildings.some(b => b.id === cart.id), false);
  assert.deepEqual(w.drops.map(d => d.stack.uid).filter(uid => uids.includes(uid)).sort(), uids);
  assert.equal(towedBy(w, p), null); assert.equal(cartSpeed(w, p), 1);
  assert.deepEqual(duplicateUids(collectLocations(w)), []);
  assert.equal(cartTargets(w).length, 0);
});

test('no carts in the battle arena: not hunted, not pullable', () => {
  const {w, p, cart} = camp();
  w.arena = {wave: 1};
  assert.deepEqual(cartTargets(w), []);
  assert.equal(pull(w, p, cart).code, 'unavailable');
});

// ------------------------------------------------------------------ saves and snapshots
test('saves and network snapshots carry a cart (level, load, puller); old carts get a store', () => {
  const {w, p, cart} = camp();
  load(w, cart, 3, 'wood'); pull(w, p, cart); run(w, 1, {x: 1, z: 0});
  const save = JSON.parse(JSON.stringify(w.snapshot({purpose: 'save'})));
  assert.equal(validateV2World(save).ok, true);
  const saved = save.buildings.find(b => b.id === cart.id);
  assert.equal(Object.hasOwn(saved, 'trail'), false, 'the host-only footsteps stay home');
  const back = World.restore(save), again = back.buildings.find(b => b.id === cart.id);
  assert.equal(again.level, 1); assert.equal(again.towedBy, 'host'); assert.equal(cartLoad(again).used, 3); assert.equal(again.frame, 1);
  assert.ok(Math.abs(again.x-cart.x) < 1e-9);
  // The restored cart keeps following its puller.
  run(back, 1, {x: 1, z: 0});
  assert.ok(distance(back.player('host'), again) < HOLD && again.x > cart.x+2);
  // A network frame, as a guest rebuilds it every frame.
  const frame = World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  const seen = frame.buildings.find(b => b.id === cart.id);
  assert.equal(seen.towedBy, 'host'); assert.equal(seen.frame, cart.frame); assert.equal(seen.store.slots.length, 8);
  // A cart saved before carts had storage (zero slots, no cart fields) loads with a level-1 store;
  // a level-2 cart saved with too few slots grows to 12.
  const old = JSON.parse(JSON.stringify(w.snapshot({purpose: 'save'})));
  const legacy = id => ({id, type: 'cart', x: 14, z: 3, hp: 220, maxHp: 220, fuel: 0, level: 1, rotation: 0, open: false, charges: 3, growth: 0, planted: false, store: {id: 'chest:'+id, revision: 0, slots: []}, cooldown: 0});
  old.buildings.push(legacy('b900'), {...legacy('b901'), level: 2, store: {id: 'chest:b901', revision: 0, slots: new Array(8).fill(null)}});
  const restored = World.restore(old);
  assert.equal(restored.buildings.find(b => b.id === 'b900').store.slots.length, 8);
  assert.equal(restored.buildings.find(b => b.id === 'b901').store.slots.length, 12);
  run(restored, T);
  const settled = restored.buildings.find(b => b.id === 'b900');
  assert.equal(settled.towedBy, null); assert.equal(settled.face === -1 || settled.face === 1, true); assert.equal(settled.frame, 0);
});

// ------------------------------------------------------------------ context actions
test('context buttons: Pull or Let go, Open, Upgrade with the reason it is not ready', () => {
  const {w, p, q, cart} = camp();
  const facts = who => ({kind: 'building', id: cart.id, type: 'cart', hp: cart.hp, maxHp: cart.maxHp, level: cart.level, busy: false, ...cartFacts(w, who, cart)});
  let actions = describeContext(facts(p));
  const byId = id => actions.find(a => a.id === id);
  assert.equal(byId('pull').label, 'Pull'); assert.deepEqual(byId('pull').command, {type: 'cart', op: 'pull', cartId: cart.id});
  assert.equal(byId('open').enabled, true);
  assert.equal(byId('upgrade').enabled, false); assert.match(byId('upgrade').disabledReason, /workbench/);
  pull(w, p, cart);
  actions = describeContext(facts(p));
  assert.equal(byId('pull').label, 'Let go'); assert.equal(byId('pull').command.op, 'release');
  actions = describeContext(facts(q));
  assert.equal(byId('pull').enabled, false);
  // The puller's nearest target is never the cart behind them; the guest's is.
  assert.notEqual(w.target(p)?.entity?.id, cart.id);
  q.x = cart.x; q.z = cart.z+1; assert.equal(w.target(q)?.entity?.id, cart.id);
  assert.match(w.target(q).label, /Hand cart · 0\/8/);
});
