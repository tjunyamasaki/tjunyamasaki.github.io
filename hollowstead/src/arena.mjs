// Battle arena: a small round clearing with nothing in it but the swarm. Waves grow in number and
// strength. Before each wave every wanderer picks one of three weapons (a weapon already carried
// ranks up instead). Health and level are the only other growth. No hunger, courage, stamina,
// durability or loot. The World owns the simulation; this module owns the wave rules and the picks.
import {itemDefinition} from './inventory.mjs?v=harvest-18';
import {label} from './content.mjs?v=harvest-18';
import {HOTBAR_SLOTS} from './contracts.mjs?v=harvest-18';
import {ARENA_GROWTH, ELITE, WEAPON_STYLES, enemyXp, pickWeighted, rarityOf} from './progression.mjs?v=harvest-18';
import {magicItems, isMagicAlly} from './magic/registry.mjs?v=harvest-18';

export const ARENA = Object.freeze({
  radius: 22,          // world radius: the walkable disc is radius-1
  countdown: 3,        // seconds between the pick and the first creature
  cleared: 1.8,        // pause after the last kill before the pick
  heal: .35,           // share of max health restored after each wave
  maxAlive: 64,        // creatures on the field at once (phones)
  spawnEdge: 2.4,      // how far inside the wall creatures appear
  spawnClear: 8,       // never closer than this to a wanderer
  xp: 1.6,             // levels are the arena's main growth, so kills teach faster
});
/** The prototype's first card is always the Gloomgrasp Scepter, alongside close and ranged choices. */
export const STARTERS = Object.freeze([['gloomgrasp'], ['spear', 'sword', 'broadsword'], ['recurve', 'bonebow', 'crookstaff']]);

/** Creature strength by wave: numbers grow faster than toughness. */
export function arenaScale(wave){
  const w = Math.max(1, wave|0);
  return {hp: 1+.12*(w-1), damage: 1+.06*(w-1)};
}
export function arenaEliteChance(wave){return Math.min(.15, Math.max(0, .015*((wave|0)-2)));}
/** Creatures in a wave, not counting its champions. */
export function waveBudget(wave){const w = Math.max(1, wave|0); return Math.min(200, Math.round(12+w*5+w*w*.3));}
/** How many may be on the field at once this wave. */
export function aliveCap(wave){return Math.min(ARENA.maxAlive, 20+Math.max(1, wave|0)*4);}
export function arenaRoster(wave){
  const roster = [['crawler', 10]];
  if(wave >= 2) roster.push(['bonewalker', 3]);
  if(wave >= 3) roster.push(['wraith', 2.5]);
  if(wave >= 4) roster.push(['bogling', 2]);
  if(wave >= 6) roster.push(['brute', .8+wave*.05]);
  if(wave >= 8) roster.push(['golem', .6+wave*.04]);
  return roster;
}
/** Champions: a heavy squad every fifth wave, the Hollow King every tenth. */
export function waveChampions(wave){
  if(wave > 0 && wave%10 === 0) return ['king'];
  if(wave > 0 && wave%5 === 0) return wave >= 15 ? ['golem', 'brute', 'brute'] : ['brute', 'brute'];
  return [];
}
/** Chance of each rarity in an offer, by wave. Legendaries appear from about wave six. */
export function rarityWeights(wave){
  const w = Math.max(1, wave|0);
  return {common: Math.max(0, 40-8*w), uncommon: Math.max(8, 36-4*w), rare: 26+w*1.5, epic: Math.max(0, w*3.2-4), legendary: Math.max(0, w*1.6-8)};
}
export function arenaWeapons(){return [...Object.keys(WEAPON_STYLES).filter(id => id !== 'fist'), ...Object.keys(magicItems)];}

export function setupArena(world){
  world.radius = ARENA.radius; world.ambient = false; world.nodes = []; world.buildings = [];
  world.arena = {wave: 0, phase: 'pick', timer: 0, budget: 0, total: 0, spawnAt: 0, offers: {}, kills: 0, best: 0};
}

/** Weapons this wanderer carries (hotbar weapons), by item id. */
function carried(p){
  const out = new Map();
  for(const stack of [p.equipment?.weapon, ...(p.inventory?.slots || [])]) if(stack && itemDefinition(stack.itemId)?.equipmentSlot === 'weapon') out.set(stack.itemId, stack.uid);
  return out;
}

export function rollOffers(world, p){
  const a = world.arena, rng = world.lootRng, have = carried(p), ranks = p.ranks || {};
  const maxed = id => (ranks[id] || 1) >= ARENA_GROWTH.maxRank;
  const picks = [];
  const take = list => {const open = list.filter(id => !picks.includes(id)); if(!open.length) return false; picks.push(open[Math.floor(rng()*open.length)]); return true;};
  if(a.wave === 0){for(const group of STARTERS) take(group);}
  else{
    const pool = arenaWeapons().filter(id => !(have.has(id) && maxed(id)));
    // One card often ranks up something you already carry, so a build can deepen.
    const upgrades = [...have.keys()].filter(id => !maxed(id));
    if(upgrades.length && rng() < .45) take(upgrades);
    const weights = rarityWeights(a.wave+1);
    let guard = 0;
    while(picks.length < 3 && guard++ < 40){
      const rarity = pickWeighted(rng, Object.entries(weights).filter(([, w]) => w > 0));
      if(!take(pool.filter(id => rarityOf(id) === rarity))) take(pool);
    }
  }
  a.offers[p.id] = picks.map(itemId => ({itemId, owned: have.has(itemId), rank: have.has(itemId) ? Math.min(ARENA_GROWTH.maxRank, (ranks[itemId] || 1)+1) : 1}));
}

function dropWeapon(world, p, uid){
  if(p.equipment.weapon?.uid === uid){p.equipment.weapon = null; p.equipmentRevision++;}
  else{const i = p.inventory.slots.findIndex(s => s?.uid === uid); if(i >= 0){p.inventory.slots[i] = null; p.inventory.revision++;}}
}

/** Put a new weapon on the hotbar (in `replace` when it is full), and wear it if nothing is worn. */
function grantWeapon(world, p, itemId, replace){
  world.syncHotbar(p);
  let slot = p.hotbar.indexOf(null);
  if(slot < 0){
    if(!(Number.isInteger(replace) && replace >= 0 && replace < HOTBAR_SLOTS)) return {ok: false, code: 'chooseSlot'};
    slot = replace;
    const old = p.hotbar[slot], oldStack = [p.equipment.weapon, ...p.inventory.slots].find(s => s?.uid === old);
    if(oldStack && p.ranks) delete p.ranks[oldStack.itemId];
    dropWeapon(world, p, old); p.hotbar[slot] = null;
  }
  const def = itemDefinition(itemId); if(!def) return {ok: false, code: 'rejected'};
  const stack = world.mintStack(itemId, 1, def.maxDurability); if(!stack) return {ok: false, code: 'rejected'};
  const free = p.inventory.slots.indexOf(null); if(free < 0) return {ok: false, code: 'inventoryFull'};
  p.inventory.slots[free] = stack; p.inventory.revision++;
  p.hotbar[slot] = stack.uid; (p.ranks ||= {})[itemId] = 1;
  if(!p.equipment.weapon || p.hotbarIndex === slot) world.selectHotbar(p, slot);
  world.syncHotbar(p);
  return {ok: true, code: 'ok'};
}

/** A wanderer takes offer `choice` (0-2), or -1 to pass. `replace` names the hotbar slot to give up when full. */
export function arenaPick(world, p, choice, replace = null){
  const a = world.arena;
  if(!a || a.phase !== 'pick') return {ok: false, code: 'unavailable'};
  const offers = a.offers[p.id]; if(!offers) return {ok: false, code: 'rejected'};
  if(choice === -1){delete a.offers[p.id]; return {ok: true, code: 'ok'};}
  const offer = offers[choice]; if(!offer) return {ok: false, code: 'rejected'};
  const have = carried(p);
  if(have.has(offer.itemId)){
    p.ranks ||= {};
    p.ranks[offer.itemId] = Math.min(ARENA_GROWTH.maxRank, (p.ranks[offer.itemId] || 1)+1);
    world.event('rankup', p.x, p.z, `${label(offer.itemId)} ★${p.ranks[offer.itemId]}`, {player: p.id, itemId: offer.itemId});
  }else{
    const done = grantWeapon(world, p, offer.itemId, replace);
    if(!done.ok) return done;
    world.event('rankup', p.x, p.z, label(offer.itemId), {player: p.id, itemId: offer.itemId});
  }
  delete a.offers[p.id];
  world.assertItems();
  return {ok: true, code: 'ok'};
}

function edgeSpot(world){
  const R = world.radius-ARENA.spawnEdge, rng = world.spawnRng;
  const people = world.players.filter(p => p.online && !p.ghost);
  let best = null, bestGap = -1;
  for(let tries = 0; tries < 10; tries++){
    const a = rng()*Math.PI*2, x = Math.cos(a)*R, z = Math.sin(a)*R;
    const gap = Math.min(99, ...people.map(p => Math.hypot(p.x-x, p.z-z)));
    if(gap >= ARENA.spawnClear) return {x, z, a};
    if(gap > bestGap){bestGap = gap; best = {x, z, a};}
  }
  return best;
}

function spawnPack(world, types){
  const spot = edgeSpot(world); if(!spot) return 0;
  world.event('portal', spot.x, spot.z, '', {radius: 1.4+types.length*.12});
  let made = 0;
  types.forEach((type, i) => {
    const r = i ? .7+world.spawnRng()*1.6 : 0, b = world.spawnRng()*Math.PI*2;
    // Packs fan out along the wall, never outside it.
    const x = spot.x+Math.cos(b)*r-Math.cos(spot.a)*r*.4, z = spot.z+Math.sin(b)*r-Math.sin(spot.a)*r*.4;
    if(world.spawnEnemy(type, x, z)) made++;
  });
  return made;
}

const hostiles = world => world.enemies.filter(e => e.hp > 0 && !isMagicAlly(e));

export function stepArena(world, dt){
  const a = world.arena; if(!a) return;
  const people = world.players.filter(p => p.online);
  for(const p of people){p.hunger = 100; p.courage = 100; if(p.equipment?.weapon) p.equipment.weapon.durability = itemDefinition(p.equipment.weapon.itemId)?.maxDurability ?? p.equipment.weapon.durability;}
  if(a.phase === 'pick'){
    // Each wanderer gets one offer per break; `done` remembers who has had theirs.
    a.done ||= [];
    for(const p of people) if(!a.offers[p.id] && !a.done.includes(p.id)){rollOffers(world, p); a.done.push(p.id);}
    if(people.length && people.every(p => !a.offers[p.id])){
      a.wave++; a.phase = 'countdown'; a.timer = ARENA.countdown; a.done = [];
      world.event('announce', 0, 0, waveChampions(a.wave).includes('king') ? `Wave ${a.wave} · The Hollow King` : waveChampions(a.wave).length ? `Wave ${a.wave} · Champions` : `Wave ${a.wave}`);
    }
    return;
  }
  if(a.phase === 'countdown'){
    a.timer -= dt;
    if(a.timer <= 0){
      a.phase = 'fight'; a.budget = waveBudget(a.wave);
      const champions = waveChampions(a.wave);
      a.total = a.budget+champions.length; a.spawnAt = world.time+.2;
      if(champions.length) spawnPack(world, champions);
    }
    return;
  }
  if(a.phase === 'fight'){
    const alive = hostiles(world).length;
    if(a.budget > 0 && world.time >= a.spawnAt && alive < aliveCap(a.wave)){
      const size = Math.min(a.budget, 2+Math.ceil(a.wave*.6), aliveCap(a.wave)-alive);
      const roster = arenaRoster(a.wave), types = [];
      for(let i = 0; i < size; i++) types.push(pickWeighted(world.spawnRng, roster));
      a.budget -= spawnPack(world, types) || size;
      a.spawnAt = world.time+Math.max(.55, 1.7-a.wave*.06)*(.8+world.spawnRng()*.4);
    }
    if(a.budget <= 0 && hostiles(world).length === 0){
      a.phase = 'cleared'; a.timer = ARENA.cleared; a.best = Math.max(a.best, a.wave); world.hostile = [];
      for(const p of people){
        if(p.down || p.ghost) world.revivePlayer(p);
        const top = p.maxHp || 100; p.hp = Math.min(top, p.hp+top*ARENA.heal);
      }
      world.event('announce', 0, 0, `Wave ${a.wave} cleared`);
    }
    return;
  }
  if(a.phase === 'cleared'){
    a.timer -= dt;
    if(a.timer <= 0){a.phase = 'pick'; a.done = [];}
  }
}

/** Every kill in the arena feeds every standing wanderer. */
export function arenaKill(world, e){
  const a = world.arena; if(a) a.kills = (a.kills || 0)+1;
  const xp = ARENA.xp*enemyXp(e.type)*(e.elite ? ELITE.xp : 1)*(1+.08*((e.level || 1)-1))*(e.minion ? .4 : 1);
  for(const p of world.players) if(p.online && !p.ghost) world.awardXp(p, xp);
}

/** Enemies left in the current wave (alive plus yet to come), for the HUD. */
export function waveLeft(world){
  const a = world?.arena; if(!a) return 0;
  return hostiles(world).length+(a.phase === 'fight' ? Math.max(0, a.budget) : 0);
}
