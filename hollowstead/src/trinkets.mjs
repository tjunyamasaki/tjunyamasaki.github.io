// Trinkets: one worn in the trinket socket; each bends a rule a little. They never wear out.
// Pure simulation: import only content/progression/contracts/inventory. Never engine.mjs or the DOM.
//
// Only the worn trinket counts, and only for its wearer. State a trinket keeps lives on the wanderer
// so guests see it in snapshots: p.wardReady (boneward: world time it can block again) and p.might
// (moonlocket: damage multiplier that progression.powerOf applies).

import {TRINKET_IDS} from './contracts.mjs?v=harvest-18';
import {DASH, ELITE, isCache, maxHealth, rollLoot} from './progression.mjs?v=harvest-18';
export {TRINKET_IDS};

/** What each trinket does, as the inventory tells it. */
export const TRINKET_TEXT = Object.freeze({
  frostanklet: 'Dodges leave a frost trail that slows foes',
  nightfang: 'Kills at night heal 1',
  emberheart: 'Courage drains half as fast in the dark',
  crowseye: 'Caches near you show on your map',
  harvestcharm: 'Wider clean-strike window; clean strikes yield +1',
  boneward: 'Blocks one blow every 20 seconds',
  wispfeather: '+10% walk speed; dodge recharges 25% faster',
  gravedust: 'Foes you slay drop loot more often',
  moonlocket: '+15% damage above 80% health',
  thornknot: 'Melee blows against you hurt the attacker',
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
});

/** The worn trinket's id, or null. */
export function trinketOf(p){return p?.equipment?.trinket?.itemId||null;}

/** True for the ten trinket item ids. */
export function isTrinket(itemId){return TRINKET_IDS.includes(itemId);}

/** Seconds until boneward can block again (0 = ready), for the HUD. */
export function wardCooldown(world, p){return Math.max(0, (p?.wardReady || 0) - (world?.time || 0));}

/** crowseye: this cache shows on the wearer's map although it was never explored. */
export function revealsCache(p, node){
  if(trinketOf(p) !== 'crowseye' || !node || !isCache(node.type)) return false;
  const dx = node.x - p.x, dz = node.z - p.z;
  return dx*dx + dz*dz < TRINKET.cacheSight*TRINKET.cacheSight;
}

function frostTrail(world, p, dx, dz){
  const {puffs, radius, life} = TRINKET.frost, reach = DASH.distance;
  for(let i = 0; i < puffs; i++){
    const t = (i + .5)/puffs, x = p.x + dx*reach*t, z = p.z + dz*reach*t;
    if(world.walkable && !world.walkable(x, z)) continue;
    // A frost cloud that only slows (arsenal.mjs steps and the renderers draw 'frost' zones).
    (world.zones ||= []).push({id: world.nextId('zn'), kind: 'frost', owner: p.id, x, z, age: 0, life, radius, dps: 0, freezeAfter: 99, freeze: 0, exposed: {}, frozen: [], trail: true});
  }
}

/**
 * World hooks. type: 'tick' {dt, phase} · 'hurt' {amount, source} (return a number to change the damage taken)
 * · 'dodge' {dx, dz} · 'perfect' {source} · 'kill' {enemy, phase}.
 */
export function trinketEvent(world, p, type, data){
  if(!p || world.arena) return undefined;
  const id = trinketOf(p);
  if(type === 'tick'){
    // moonlocket owns p.might; anyone else carrying a stale multiplier is reset.
    const might = id === 'moonlocket' && p.hp > TRINKET.mightAbove*maxHealth(p) ? TRINKET.might : 1;
    if(p.might !== might && (might !== 1 || p.might !== undefined)) p.might = might;
    if(!id) return undefined;
    const dt = data?.dt || 0;
    if(id === 'wispfeather' && p.dashCooldown > 0) world.tickDash(p, dt*TRINKET.dodgeRecharge);
    // The engine has already drained courage this tick; give back the share emberheart spares.
    // At zero courage nothing is refunded, so the dark still bites once courage runs out.
    if(id === 'emberheart' && data?.phase === 'night' && p.courage > 0 && p.courage < 100 && !world.lit(p)) p.courage = Math.min(100, p.courage + dt*TRINKET.darkRate*(1 - TRINKET.darkDrain));
    return undefined;
  }
  if(!id) return undefined;
  if(type === 'hurt'){
    const amount = data?.amount || 0, source = data?.source;
    if(id === 'boneward' && amount >= TRINKET.wardMin && !(p.wardReady > world.time)){
      p.wardReady = world.time + TRINKET.wardCooldown;
      world.event('strike', p.x, p.z, 'Warded!', {player: p.id, kind: 'ward'});
      return 0;
    }
    // Blows with a source are the creature's own swing, bite, slam or charge; shots arrive without one.
    if(id === 'thornknot' && amount > 0 && source && source.hp > 0 && Number.isFinite(source.x)){
      const back = Math.max(1, Math.round(amount*TRINKET.thorns));
      source.hp -= back; source.lastHitBy = p.id;
      world.event('strike', source.x, source.z, `−${back}`, {player: p.id, kind: 'thorn'});
    }
    return undefined;
  }
  if(type === 'dodge'){
    if(id === 'frostanklet') frostTrail(world, p, data?.dx || 0, data?.dz || 0);
    return undefined;
  }
  if(type === 'perfect'){
    const source = data?.source;
    if(id === 'frostanklet' && source && source.hp > 0) source.slowed = Math.max(source.slowed || 0, TRINKET.frost.chill);
    return undefined;
  }
  if(type === 'kill'){
    const enemy = data?.enemy;
    if(id === 'nightfang' && data?.phase === 'night' && p.hp > 0 && p.hp < maxHealth(p)){
      p.hp = Math.min(maxHealth(p), p.hp + TRINKET.nightHeal);
      world.event('strike', p.x, p.z, `+${TRINKET.nightHeal}`, {player: p.id, kind: 'fang'});
    }
    // gravedust: a second roll of the creature's loot table for the wearer's kills.
    if(id === 'gravedust' && enemy && !world.showcase && world.lootRng && world.lootRng() < TRINKET.lootChance){
      const luck = (enemy.elite ? ELITE.luck : 0) + (enemy.guardOf ? .5 : 0);
      const rolls = rollLoot(enemy.type, world.lootRng, luck);
      if(rolls.length) world.spillLoot(rolls, enemy.x, enemy.z, p.name);
    }
    return undefined;
  }
  return undefined;
}

/** Walk speed multiplier from the worn trinket. */
export function trinketSpeed(world, p){return !world?.arena && trinketOf(p) === 'wispfeather' ? TRINKET.speed : 1;}
