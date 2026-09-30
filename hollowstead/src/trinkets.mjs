// Trinkets: small relics worn in the trinket sockets; each bends a rule a little. They never wear out.
// Pure simulation: import only content/progression/contracts/inventory. Never engine.mjs or the DOM.
//
// Two sockets. The first (`trinket`) is always open; the second (`charm`) opens for a wanderer who
// reaches CHARM.level, or who stands when a Warden or the Hollow King falls (unlockCharm). The
// same trinket cannot be worn twice.
//
// Worn together, some pairs resonate (RESONANCES): a small extra rule that only exists for the pair.
// The Hollow mirror strengthens the other worn trinket (potency).
//
// State a trinket keeps lives on the wanderer so guests see it in snapshots: p.wardReady (boneward),
// p.might (the product of every damage multiplier worn: moonlocket, guttering candle),
// p.frenzy / p.frenzyUntil (hellspur), p.tolls (thirteenth bell), p.veil (mourner's veil),
// p.charmOpen (the second socket). Foes remember whose chalk marked them in e.chalk (host only).

import {TRINKET_IDS} from './contracts.mjs?v=harvest-18';
import {DASH, ELITE, isCache, maxHealth, powerOf, rollLoot, weaponStyle} from './progression.mjs?v=harvest-18';
import {EQUIPMENT} from './content.mjs?v=harvest-18';
import {magicItems} from './magic/registry.mjs?v=harvest-18';
export {TRINKET_IDS};

/** What each trinket does, as the inventory tells it. */
export const TRINKET_TEXT = Object.freeze({
  frostanklet: 'Dodges leave a frost trail that slows foes',
  nightfang: 'Kills at night (or underground) heal 1',
  emberheart: 'Courage drains half as fast in the dark',
  crowseye: 'Caches near you show on your map',
  harvestcharm: 'Wider clean-strike window; clean strikes yield +1',
  boneward: 'Blocks one blow every 20 seconds',
  wispfeather: '+10% walk speed; dodge recharges 25% faster',
  gravedust: 'Foes you slay drop loot more often',
  moonlocket: '+15% damage above 80% health',
  thornknot: 'Melee blows against you hurt the attacker',
  // The relics of the second socket.
  tinderpouch: 'Your blows can set foes burning (15%)',
  crookedkey: 'Caches open twice as fast and mend 20 health',
  soulstitch: 'Each kill cuts 0.5 s from your skill’s recharge',
  gutteringcandle: 'The lower your health, the harder you hit (up to +40%)',
  gravechalk: 'Your first blow on each foe is a critical hit',
  redthread: 'Near a friend or your summons, you both take 15% less damage; you revive twice as fast',
  hellspur: 'Kills build Frenzy (up to 5): faster attacks and feet',
  mournersveil: 'A perfect dodge leaves a phantom that bursts and stuns',
  thirteenthbell: 'Every 13th blow tolls: triple damage and a stunning shockwave',
  hollowmirror: 'Your other trinket is 60% stronger',
});

export const TRINKET = Object.freeze({
  frost: Object.freeze({puffs: 3, radius: 1.1, life: 2.6, chill: 1.4}), // frostanklet: clouds along the dodge; a perfect dodge chills the attacker
  nightHeal: 1,                  // nightfang
  darkDrain: .5,                 // emberheart: share of the darkness drain that still applies
  darkRate: 3,                   // courage per second the dark drains (engine tick)
  cacheSight: 30,                // crowseye: map radius
  wardCooldown: 20, wardMin: 1,  // boneward: seconds between blocks; blows smaller than this (hazard ticks) pass
  speed: 1.1, dodgeRecharge: .25,// wispfeather
  lootChance: .5,                // gravedust: chance of a second loot roll for the wearer's kills
  mightAbove: .8, might: 1.15,   // moonlocket
  thorns: .4,                    // thornknot: share of a melee blow sent back
  // Relics
  tinder: Object.freeze({chance: .15, dps: 5, seconds: 3}),              // burn damage scales with the wearer's power
  keyRate: 2, keyHeal: 20,                                              // crookedkey
  stitch: .5, stitchElite: 1.5,                                         // soulstitch: seconds of skill recharge per kill
  candle: Object.freeze({most: .4, full: .25}),                         // +40% at a quarter health or less, scaling from full
  thread: Object.freeze({range: 6, guard: .15, revive: 2}),             // redthread
  frenzy: Object.freeze({max: 5, haste: .07, speed: .04, hold: 4}),     // hellspur, per stack
  veil: Object.freeze({delay: .8, radius: 2.8, hit: 3, stun: 1}),       // mournersveil: burst = hit x weapon damage
  bell: Object.freeze({every: 13, hit: 3, radius: 3, stun: .8}),        // thirteenthbell
  mirror: 1.6,                                                          // hollowmirror: the other trinket's potency
});

/** The second socket. */
export const CHARM = Object.freeze({level: 10});

/**
 * Resonances: pairs that do something together neither does alone. Worn in either socket.
 * `with` is the other trinket of the pair; everything here is read by trinketEvent and friends.
 */
export const RESONANCES = Object.freeze([
  {id: 'wildfire', name: 'Wildfire', pair: ['tinderpouch', 'emberheart'], text: 'A burning foe that dies spreads its fire to foes near it'},
  {id: 'pilgrim', name: 'Pilgrim', pair: ['crookedkey', 'crowseye'], text: 'Caches show from twice as far; in a dungeon, every cache on the floor'},
  {id: 'choir', name: 'Choir', pair: ['soulstitch', 'thirteenthbell'], text: 'Each toll of the bell finishes your skill’s recharge'},
  {id: 'bloodletting', name: 'Bloodletting', pair: ['gutteringcandle', 'nightfang'], text: 'Night fang heals by day too, and heals 4 while you are below half health'},
  {id: 'deathmark', name: 'Deathmark', pair: ['gravechalk', 'hellspur'], text: 'A foe slain by its first blow adds two Frenzy'},
  {id: 'brambleguard', name: 'Brambleguard', pair: ['redthread', 'thornknot'], text: 'Blows against friends near you are thorned back too'},
  {id: 'stampede', name: 'Stampede', pair: ['hellspur', 'wispfeather'], text: 'At full Frenzy each kill gives back a dodge charge'},
  {id: 'gravefrost', name: 'Grave frost', pair: ['mournersveil', 'frostanklet'], text: 'The phantom’s burst freezes what it hits for 2 seconds'},
]);

// ------------------------------------------------------------------ who wears what
/** The trinket in the first socket (kept for older callers), or null. */
export function trinketOf(p){return p?.equipment?.trinket?.itemId||null;}
/** The trinket in the second socket, or null. */
export function charmOf(p){return p?.equipment?.charm?.itemId||null;}
/** Every worn trinket id, first socket first. */
export function wornTrinkets(p){const out = []; const a = trinketOf(p), b = charmOf(p); if(a) out.push(a); if(b && b !== a) out.push(b); return out;}
/** True when `p` wears trinket `id` in either socket. */
export function wears(p, id){return trinketOf(p) === id || charmOf(p) === id;}
/** True for the trinket item ids. */
export function isTrinket(itemId){return TRINKET_IDS.includes(itemId);}
/** How strong a worn trinket is: 1, or the mirror's boost for the trinket worn beside it. */
export function potency(p, id){
  if(id === 'hollowmirror' || !wears(p, id)) return wears(p, id) ? 1 : 0;
  return wears(p, 'hollowmirror') ? TRINKET.mirror : 1;
}
/** Resonances this wanderer has live (both halves worn). */
export function resonancesOf(p){return RESONANCES.filter(r => r.pair.every(id => wears(p, id)));}
export function resonates(p, id){return RESONANCES.some(r => r.id === id && r.pair.every(t => wears(p, t)));}
/** The resonances a trinket belongs to, for its tooltip. */
export function resonancesFor(itemId){return RESONANCES.filter(r => r.pair.includes(itemId));}

/** True when the second socket is open for this wanderer. */
export function charmOpen(p){return !!p?.charmOpen;}
/** Opens the second socket (once), with an announcement. `why` is shown to everyone. */
export function unlockCharm(world, p, why = ''){
  if(!p || p.charmOpen || world?.arena || world?.showcase) return false;
  p.charmOpen = true;
  world.event('announce', p.x, p.z, `${p.name} can wear a second trinket${why ? ` · ${why}` : ''}`);
  world.event('levelup', p.x, p.z, 'Second trinket socket', {player: p.id});
  world.tell(p, 'A second trinket socket is open. Wear another trinket from your pack');
  return true;
}
/**
 * Whether an equipment layout is allowed for this wanderer: the second socket only when open, and
 * never the same trinket twice. `equipment` is the proposed {socket: stack}.
 */
export function socketsAllowed(p, equipment){
  const a = equipment?.trinket?.itemId, b = equipment?.charm?.itemId;
  if(b && !charmOpen(p)) return false;
  if(a && b && a === b) return false;
  return true;
}

/** Seconds until boneward can block again (0 = ready), for the HUD. */
export function wardCooldown(world, p){return Math.max(0, (p?.wardReady || 0) - (world?.time || 0));}

/** crowseye: this cache shows on the wearer's map although it was never explored (Pilgrim: farther, or the whole dungeon floor). */
export function revealsCache(p, node, world = null){
  if(!wears(p, 'crowseye') || !node || !isCache(node.type)) return false;
  const pilgrim = resonates(p, 'pilgrim');
  if(pilgrim && world?.dungeon) return true;
  const sight = TRINKET.cacheSight*potency(p, 'crowseye')*(pilgrim ? 2 : 1);
  const dx = node.x - p.x, dz = node.z - p.z;
  return dx*dx + dz*dz < sight*sight;
}

// ------------------------------------------------------------------ helpers
const dist = (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
const alive = q => q && q.online !== false && !q.down && !q.ghost && q.hp > 0;
const foesOf = world => world.enemies.filter(e => e.hp > 0 && !e.ally && !e.summon && !e.summoned && !e.summonedBy && e.team !== 'player' && e.team !== 'ally');
/** A friend (another standing wanderer) or one of p's own summons within `range`. */
function companionNear(world, p, range){
  if(world.players.some(q => q !== p && alive(q) && dist(q, p) < range)) return true;
  const mine = s => s && s.hp > 0 && Number.isFinite(s.x) && (s.owner === p.id || s.ownerId === p.id || s.summonedBy === p.id);
  return (world.allies || []).some(a => mine(a) && dist(a, p) < range)
    || (world.magicSummons || []).some(a => mine(a) && dist(a, p) < range)
    || world.enemies.some(e => (e.ally || e.summon || e.summoned || e.summonedBy) && mine(e) && dist(e, p) < range);
}
/** The weapon in hand's base damage times the wanderer's power (what a phantom or a toll is worth). */
function weaponHit(p){
  const w = p.equipment?.weapon, id = w && w.durability > 0 ? w.itemId : 'fist';
  return (EQUIPMENT[id]?.damage || magicItems[id]?.damage || weaponStyle(id)?.damage || weaponStyle('fist')?.damage || 9)*powerOf(p);
}
function stun(e, seconds){e.stunned = Math.max(e.stunned || 0, seconds); e.windup = 0; e.act = 0;}
function heal(world, p, amount, kind){
  if(!(amount > 0) || !(p.hp > 0) || p.hp >= maxHealth(p)) return;
  p.hp = Math.min(maxHealth(p), p.hp + amount);
  world.event('strike', p.x, p.z, `+${Math.round(amount)}`, {player: p.id, kind});
}
function ignite(world, p, e, dps, seconds){
  if(!(e.hp > 0)) return;
  e.burn = {dps: Math.max(e.burn?.dps || 0, dps), remaining: Math.max(e.burn?.remaining || 0, seconds), ownerId: p.id};
  e.tinder = p.id;
}

function frostTrail(world, p, dx, dz){
  const {puffs, radius, life} = TRINKET.frost, reach = DASH.distance, k = potency(p, 'frostanklet');
  for(let i = 0; i < puffs; i++){
    const t = (i + .5)/puffs, x = p.x + dx*reach*t, z = p.z + dz*reach*t;
    if(world.walkable && !world.walkable(x, z)) continue;
    // A frost cloud that only slows (arsenal.mjs steps and the renderers draw 'frost' zones).
    (world.zones ||= []).push({id: world.nextId('zn'), kind: 'frost', owner: p.id, x, z, age: 0, life: life*k, radius: radius*Math.sqrt(k), dps: 0, freezeAfter: 99, freeze: 0, exposed: {}, frozen: [], trail: true});
  }
}

/** mournersveil: the phantom bursts where the wearer dodged. */
function burstVeil(world, p){
  const v = p.veil; p.veil = null;
  if(!v) return;
  const k = potency(p, 'mournersveil'), spec = TRINKET.veil, frost = resonates(p, 'gravefrost');
  const amount = weaponHit(p)*spec.hit*k;
  for(const e of foesOf(world)){
    if(dist(e, v) > spec.radius) continue;
    world.strike(p, e, amount, 0);
    stun(e, frost ? Math.max(2, spec.stun) : spec.stun*k);
    if(frost) e.slowed = Math.max(e.slowed || 0, 3);
  }
  world.event('burst', v.x, v.z, '', {radius: spec.radius, rank: 3, itemId: 'mournersveil', player: p.id});
  world.event('strike', v.x, v.z, frost ? 'Grave frost!' : 'Wail!', {player: p.id, kind: 'veil'});
}

/** hellspur: a kill adds `n` Frenzy (Stampede: at full Frenzy it gives back a dodge). */
function addFrenzy(world, p, n){
  const spec = TRINKET.frenzy, before = p.frenzy || 0;
  p.frenzy = Math.min(spec.max, before + n);
  p.frenzyUntil = world.time + spec.hold*potency(p, 'hellspur');
  if(before >= spec.max && resonates(p, 'stampede') && p.dashCharges < DASH.charges){
    world.readyDash(p);
    if(p.dashRecharge.length){p.dashRecharge.shift(); p.dashCharges = Math.min(DASH.charges, p.dashCharges + 1); world.syncDash(p);}
  }
  if(p.frenzy >= spec.max && before < spec.max) world.event('strike', p.x, p.z, 'Frenzy!', {player: p.id, kind: 'frenzy'});
}

// ------------------------------------------------------------------ world hooks
/**
 * World hooks. type: 'tick' {dt, phase} · 'hurt' {amount, source} (return a number to change the damage taken)
 * · 'dodge' {dx, dz} · 'perfect' {source} · 'kill' {enemy, phase}.
 */
export function trinketEvent(world, p, type, data){
  if(!p || world.arena) return undefined;
  const ids = wornTrinkets(p);
  if(type === 'tick'){
    // p.might is every damage multiplier worn, multiplied; a wanderer wearing none is reset.
    const top = maxHealth(p), share = p.hp/Math.max(1, top);
    let might = 1;
    if(wears(p, 'moonlocket') && p.hp > TRINKET.mightAbove*top) might *= 1 + (TRINKET.might - 1)*potency(p, 'moonlocket');
    if(wears(p, 'gutteringcandle')){
      const {most, full} = TRINKET.candle, low = Math.max(0, Math.min(1, (1 - share)/(1 - full)));
      might *= 1 + most*low*potency(p, 'gutteringcandle');
    }
    might = Math.round(might*1000)/1000;
    if(p.might !== might && (might !== 1 || p.might !== undefined)) p.might = might;
    if(p.frenzy > 0 && !(p.frenzyUntil > world.time)){p.frenzy = 0; p.frenzyUntil = 0;}
    if(p.frenzy > 0 && !wears(p, 'hellspur')){p.frenzy = 0; p.frenzyUntil = 0;}
    if(p.veil && world.time >= p.veil.at) burstVeil(world, p);
    if(!ids.length) return undefined;
    const dt = data?.dt || 0;
    if(wears(p, 'wispfeather') && p.dashCooldown > 0) world.tickDash(p, dt*TRINKET.dodgeRecharge*potency(p, 'wispfeather'));
    // The engine has already drained courage this tick; give back the share emberheart spares.
    // At zero courage nothing is refunded, so the dark still bites once courage runs out.
    if(wears(p, 'emberheart') && data?.phase === 'night' && p.courage > 0 && p.courage < 100 && !world.lit(p)){
      const spared = Math.min(1, (1 - TRINKET.darkDrain)*potency(p, 'emberheart'));
      p.courage = Math.min(100, p.courage + dt*TRINKET.darkRate*spared);
    }
    return undefined;
  }
  if(type === 'hurt'){
    let amount = data?.amount || 0;
    const source = data?.source;
    // Red thread works for whoever is hurt near a wearer too: guard them, and Brambleguard thorns for them.
    for(const q of world.players){
      if(q === p || !alive(q) || !wears(q, 'redthread') || dist(q, p) >= TRINKET.thread.range) continue;
      amount *= 1 - TRINKET.thread.guard*potency(q, 'redthread');
      if(resonates(q, 'brambleguard') && source && source.hp > 0 && Number.isFinite(source.x) && amount > 0){
        const back = Math.max(1, Math.round(amount*TRINKET.thorns*potency(q, 'thornknot')));
        source.hp -= back; source.lastHitBy = q.id;
        world.event('strike', source.x, source.z, `−${back}`, {player: q.id, kind: 'thorn'});
      }
    }
    if(wears(p, 'redthread') && companionNear(world, p, TRINKET.thread.range)) amount *= 1 - TRINKET.thread.guard*potency(p, 'redthread');
    if(wears(p, 'boneward') && amount >= TRINKET.wardMin && !(p.wardReady > world.time)){
      p.wardReady = world.time + TRINKET.wardCooldown/potency(p, 'boneward');
      world.event('strike', p.x, p.z, 'Warded!', {player: p.id, kind: 'ward'});
      return 0;
    }
    // Blows with a source are the creature's own swing, bite, slam or charge; shots arrive without one.
    if(wears(p, 'thornknot') && amount > 0 && source && source.hp > 0 && Number.isFinite(source.x)){
      const back = Math.max(1, Math.round(amount*TRINKET.thorns*potency(p, 'thornknot')));
      source.hp -= back; source.lastHitBy = p.id;
      world.event('strike', source.x, source.z, `−${back}`, {player: p.id, kind: 'thorn'});
    }
    return amount !== (data?.amount || 0) ? amount : undefined;
  }
  if(!ids.length) return undefined;
  if(type === 'dodge'){
    if(wears(p, 'frostanklet')) frostTrail(world, p, data?.dx || 0, data?.dz || 0);
    return undefined;
  }
  if(type === 'perfect'){
    const source = data?.source;
    if(wears(p, 'frostanklet') && source && source.hp > 0) source.slowed = Math.max(source.slowed || 0, TRINKET.frost.chill*potency(p, 'frostanklet'));
    if(wears(p, 'mournersveil') && !p.veil){
      p.veil = {x: p.x, z: p.z, at: world.time + TRINKET.veil.delay};
      world.event('summon', p.x, p.z, '', {kind: 'phantom', radius: TRINKET.veil.radius, player: p.id});
    }
    return undefined;
  }
  if(type === 'kill'){
    const enemy = data?.enemy;
    // nightfang (Bloodletting: day and night, and 4 below half health).
    if(wears(p, 'nightfang')){
      const blood = resonates(p, 'bloodletting');
      if(data?.phase === 'night' || blood || world.dungeon){
        const amount = (blood && p.hp < maxHealth(p)/2 ? 4 : TRINKET.nightHeal)*potency(p, 'nightfang');
        if(p.hp > 0 && p.hp < maxHealth(p)){p.hp = Math.min(maxHealth(p), p.hp + amount); world.event('strike', p.x, p.z, `+${Math.round(amount*10)/10}`, {player: p.id, kind: 'fang'});}
      }
    }
    // gravedust: a second roll of the creature's loot table for the wearer's kills.
    if(wears(p, 'gravedust') && enemy && !world.showcase && world.lootRng && world.lootRng() < Math.min(1, TRINKET.lootChance*potency(p, 'gravedust'))){
      const luck = (enemy.elite ? ELITE.luck : 0) + (enemy.guardOf ? .5 : 0);
      const rolls = rollLoot(enemy.type, world.lootRng, luck);
      if(rolls.length) world.spillLoot(rolls, enemy.x, enemy.z, p.name);
    }
    if(wears(p, 'soulstitch') && p.skillCd > 0){
      const cut = (enemy?.elite || enemy?.warden || enemy?.type === 'king' ? TRINKET.stitchElite : TRINKET.stitch)*potency(p, 'soulstitch');
      p.skillCd = Math.max(0, p.skillCd - cut);
    }
    if(wears(p, 'hellspur')) addFrenzy(world, p, 1 + (resonates(p, 'deathmark') && enemy?.oneBlow === p.id ? 2 : 0));
    // Wildfire: the fire leaps from a burning corpse to its neighbours.
    if(resonates(p, 'wildfire') && enemy?.burn?.remaining > 0){
      for(const e of foesOf(world)) if(e !== enemy && dist(e, enemy) < 3) ignite(world, p, e, enemy.burn.dps, TRINKET.tinder.seconds);
      world.event('burst', enemy.x, enemy.z, '', {radius: 3, rank: 2, itemId: 'tinderpouch', player: p.id});
    }
    return undefined;
  }
  return undefined;
}

/**
 * A blow a wanderer lands (refine.mjs refineHit, after refinement): grave chalk, the bell and the
 * tinder pouch. Returns the new {amount, crit}.
 */
export function trinketHit(world, p, enemy, amount, crit){
  if(!p || world?.arena || !enemy || !(amount > 0)) return {amount, crit};
  if(!wears(p, 'gravechalk') && !wears(p, 'thirteenthbell') && !wears(p, 'tinderpouch')) return {amount, crit};
  let out = amount;
  if(wears(p, 'gravechalk')){
    const marked = Array.isArray(enemy.chalk) ? enemy.chalk : (enemy.chalk = []);
    if(!marked.includes(p.id)){
      marked.push(p.id);
      if(!crit){crit = true; out *= 1.5*potency(p, 'gravechalk');}
      else out *= 1 + .25*potency(p, 'gravechalk');
      // Deathmark reads this: the first blow was the last one.
      if(out >= enemy.hp) enemy.oneBlow = p.id;
    }
  }
  if(wears(p, 'thirteenthbell')){
    const spec = TRINKET.bell, every = Math.max(4, Math.round(spec.every/potency(p, 'thirteenthbell')));
    p.tolls = ((p.tolls || 0) + 1) % every;
    if(p.tolls === 0){
      out *= spec.hit;
      for(const e of foesOf(world)) if(e !== enemy && dist(e, enemy) < spec.radius) stun(e, spec.stun);
      stun(enemy, spec.stun);
      world.event('quake', enemy.x, enemy.z, '', {radius: spec.radius, arc: 360, angle: 0, player: p.id});
      world.event('strike', enemy.x, enemy.z, 'TOLL', {player: p.id, kind: 'toll'});
      if(resonates(p, 'choir') && p.skillCd > 0){p.skillCd = 0; world.event('strike', p.x, p.z, 'Choir', {player: p.id, kind: 'choir'});}
    }
  }
  if(wears(p, 'tinderpouch') && world.rng() < Math.min(.9, TRINKET.tinder.chance*potency(p, 'tinderpouch'))){
    ignite(world, p, enemy, TRINKET.tinder.dps*powerOf(p), TRINKET.tinder.seconds);
  }
  return {amount: out, crit};
}

/** Attack speed from trinkets: the swing's cooldown divides by this (hellspur's Frenzy). */
export function trinketHaste(world, p){
  if(world?.arena || !(p?.frenzy > 0)) return 1;
  return 1 + TRINKET.frenzy.haste*p.frenzy*potency(p, 'hellspur');
}
/** Walk speed multiplier from the worn trinkets (wispfeather, hellspur's Frenzy). */
export function trinketSpeed(world, p){
  if(world?.arena) return 1;
  let speed = 1;
  if(wears(p, 'wispfeather')) speed *= 1 + (TRINKET.speed - 1)*potency(p, 'wispfeather');
  if(p?.frenzy > 0) speed *= 1 + TRINKET.frenzy.speed*p.frenzy*potency(p, 'hellspur');
  return speed;
}
/** How fast this wanderer opens a cache (crookedkey). */
export function cacheRate(world, p){return !world?.arena && wears(p, 'crookedkey') ? 1 + (TRINKET.keyRate - 1)*potency(p, 'crookedkey') : 1;}
/** A cache this wanderer helped open has just burst (crookedkey mends). */
export function cacheOpened(world, p){if(wears(p, 'crookedkey') && !world?.arena) heal(world, p, TRINKET.keyHeal*potency(p, 'crookedkey'), 'key');}
/** How fast this helper raises a fallen friend (redthread). */
export function reviveRate(world, p){return !world?.arena && wears(p, 'redthread') ? 1 + (TRINKET.thread.revive - 1)*potency(p, 'redthread') : 1;}
/** A burning creature died: who lit it (for Wildfire when the killing blow was someone else's). */
export function burnOwner(enemy){return enemy?.burn?.remaining > 0 ? enemy.tinder || null : null;}
