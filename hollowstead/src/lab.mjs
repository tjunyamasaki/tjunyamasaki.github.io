// Weapon lab: the battle arena without rounds, for trying and balancing weapons. Pick any weapon at
// any rank (and your level), spawn foes whenever you like, and read the damage meter. Solo only and
// never saved. The World owns the fight; this module owns the lab's switches and its meter.
import {itemDefinition} from './inventory.mjs?v=harvest-18';
import {ENEMIES, label} from './content.mjs?v=harvest-18';
import {ARENA_GROWTH, MAX_LEVEL, maxHealth, pickWeighted} from './progression.mjs?v=harvest-18';
import {arenaRoster, arenaWeapons, spawnPack} from './arena.mjs?v=harvest-18';
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';

export const LAB = Object.freeze({
  counts: [1, 5, 10, 20, 40],
  formations: ['ahead', 'around', 'wall'],
  foes: ['mix', 'crawler', 'bonewalker', 'wraith', 'bogling', 'brute', 'golem', 'king'],
  maxStrength: 30,
  window: 5,          // seconds the DPS meter averages over
  maxAlive: 120,
});

export function setupLab(world){
  const a = world.arena;
  Object.assign(a, {lab: true, phase: 'lab', wave: 5, god: true, dummies: false, freeSkills: false,
    stats: {dealt: 0, kills: 0, peak: 0, window: [], started: null}, seen: {}});
}
/** Every weapon the lab offers, fists first. */
export function labWeapons(){return ['fist', ...arenaWeapons()];}

export function stepLab(world, dt){
  const a = world.arena; if(!a?.lab) return;
  for(const p of world.players){
    if(!p.online) continue;
    p.hunger = 100; p.courage = 100;
    if(p.equipment?.weapon) p.equipment.weapon.durability = itemDefinition(p.equipment.weapon.itemId)?.maxDurability ?? p.equipment.weapon.durability;
    if(p.down || p.ghost){world.revivePlayer(p); p.hp = maxHealth(p); world.event('announce', p.x, p.z, 'Back on your feet');}
    if(a.god) p.hp = maxHealth(p);
  }
  // Damage meter: every point of health any foe loses, whatever took it (hits, burns, summons).
  const seen = a.seen ||= {}, alive = new Set();
  let dealt = 0;
  for(const e of world.enemies){
    if(isMagicAlly(e)) continue;
    alive.add(e.id);
    const hp = Math.max(0, e.hp), before = seen[e.id];
    if(before != null && hp < before) dealt += before-hp;
    seen[e.id] = hp;
  }
  for(const id of Object.keys(seen)) if(!alive.has(id)){dealt += seen[id]; delete seen[id];}
  const s = a.stats, now = world.time;
  if(dealt > 0){
    s.dealt += dealt; s.window.push([Math.round(now*100)/100, Math.round(dealt*10)/10]);
    if(s.started == null) s.started = now;
  }
  while(s.window.length && now-s.window[0][0] > LAB.window) s.window.shift();
  s.peak = Math.max(s.peak || 0, labDps(world));
}
export function labDps(world){
  const s = world?.arena?.stats; if(!s?.window?.length) return 0;
  const sum = s.window.reduce((total, [, amount]) => total+amount, 0);
  const span = Math.min(LAB.window, Math.max(1, world.time-s.window[0][0]));
  return sum/span;
}
/** Unit facing, straight down the screen when there is none. */
const facingOf = p => {const l = Math.hypot(p.dx || 0, p.dz || 0); return l > 1e-6 ? [p.dx/l, p.dz/l] : [0, 1];};
export function labKill(world){const s = world.arena?.stats; if(s) s.kills++;}

// ------------------------------------------------------------------ commands (solo, called directly)
function dropWeapon(p, uid){
  if(p.equipment.weapon?.uid === uid){p.equipment.weapon = null; p.equipmentRevision++;}
  else{const i = p.inventory.slots.findIndex(s => s?.uid === uid); if(i >= 0){p.inventory.slots[i] = null; p.inventory.revision++;}}
}
function carriedStack(p, itemId){
  return [p.equipment?.weapon, ...(p.inventory?.slots || [])].find(s => s?.itemId === itemId) || null;
}
/** Put a weapon in the active hotbar slot (or select it if carried) at a rank. 'fist' empties the slot. */
export function labEquip(world, p, itemId, rank){
  if(!world?.arena?.lab || !p) return {ok: false, code: 'unavailable'};
  world.syncHotbar(p);
  const slot = Number.isInteger(p.hotbarIndex) ? p.hotbarIndex : 0;
  (p.ranks ||= {});
  const have = itemId === 'fist' ? null : carriedStack(p, itemId);
  if(have){
    const at = p.hotbar.indexOf(have.uid);
    if(at >= 0 && p.equipment.weapon?.uid !== have.uid) world.selectHotbar(p, at);
  }else{
    const old = p.hotbar[slot];
    if(old){dropWeapon(p, old); p.hotbar[slot] = null;}
    if(itemId !== 'fist'){
      const def = itemDefinition(itemId); if(!def) return {ok: false, code: 'rejected'};
      const stack = world.mintStack(itemId, 1, def.maxDurability); if(!stack) return {ok: false, code: 'rejected'};
      const free = p.inventory.slots.indexOf(null); if(free < 0) return {ok: false, code: 'inventoryFull'};
      p.inventory.slots[free] = stack; p.inventory.revision++;
      p.hotbar[slot] = stack.uid;
      world.selectHotbar(p, slot);
    }
  }
  if(itemId !== 'fist') p.ranks[itemId] = clampRank(rank ?? p.ranks[itemId] ?? 1);
  p.skillCd = 0;
  world.syncHotbar(p); world.assertItems();
  world.event('rankup', p.x, p.z, itemId === 'fist' ? 'Bare hands' : `${label(itemId)} ${'★'.repeat(p.ranks[itemId])}`, {player: p.id, itemId});
  return {ok: true, code: 'ok'};
}
const clampRank = rank => Math.max(1, Math.min(ARENA_GROWTH.maxRank, Math.round(Number(rank)) || 1));
export function labRank(world, p, rank){
  const itemId = p?.equipment?.weapon?.itemId;
  if(!world?.arena?.lab || !itemId) return {ok: false, code: 'rejected'};
  (p.ranks ||= {})[itemId] = clampRank(rank);
  return {ok: true, code: 'ok'};
}
export function labLevel(world, p, level){
  if(!world?.arena?.lab || !p) return {ok: false, code: 'rejected'};
  p.level = Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(level)) || 1)); p.xp = 0;
  p.maxHp = maxHealth(p); p.hp = p.maxHp;
  return {ok: true, code: 'ok'};
}
export function labStrength(world, strength){
  if(!world?.arena?.lab) return;
  world.arena.wave = Math.max(1, Math.min(LAB.maxStrength, Math.round(Number(strength)) || 1));
}
export function labToggle(world, key){
  const a = world?.arena;
  if(!a?.lab || !['god', 'dummies', 'freeSkills'].includes(key)) return false;
  a[key] = !a[key];
  if(key === 'freeSkills' && a[key]) for(const p of world.players) p.skillCd = 0;
  return a[key];
}
export function labResetStats(world){
  const a = world?.arena; if(!a?.lab) return;
  a.stats = {dealt: 0, kills: 0, peak: 0, window: [], started: null};
}
/** A clean slate: every foe, every summon and every lingering effect. The meter does not count them as damage. */
export function labClear(world){
  const a = world?.arena; if(!a?.lab) return;
  world.enemies = []; world.allies = []; world.magicSummons = [];
  world.hostile = []; world.beats = []; world.zones = []; world.projectiles = [];
  for(const key of ['magicBolts', 'magicPuffs', 'magicCasts', 'magicSweeps', 'magicDarts', 'magicPins', 'magicRoots', 'magicWaves']) if(Array.isArray(world[key])) world[key] = [];
  a.seen = {};
}
/** Spawn foes now: `type` 'mix' draws from the arena roster at the lab's strength. */
export function labSpawn(world, p, {type = 'mix', count = 10, formation = 'ahead'} = {}){
  const a = world?.arena; if(!a?.lab || !p) return 0;
  const room = LAB.maxAlive-world.enemies.filter(e => !isMagicAlly(e)).length;
  const n = Math.max(0, Math.min(count, room));
  const roster = arenaRoster(Math.max(8, a.wave));
  const types = [];
  for(let i = 0; i < n; i++) types.push(type === 'mix' || !ENEMIES[type] ? pickWeighted(world.spawnRng, roster.filter(([id]) => id !== 'king')) : type);
  if(!types.length) return 0;
  let made = 0;
  if(formation === 'wall'){
    while(types.length) made += spawnPack(world, types.splice(0, Math.min(types.length, 3+Math.ceil(a.wave*.4))));
    return made;
  }
  const R = world.radius-2.5, face = facingOf(p), fx = face[0], fz = face[1], fl = 1;
  const inside = (x, z) => {const r = Math.hypot(x, z); return r > R ? [x*R/r, z*R/r] : [x, z];};
  if(formation === 'around'){
    types.forEach((t, i) => {
      const ring = Math.floor(i/12), a0 = (i%12)/Math.min(12, types.length-ring*12)*Math.PI*2+ring*.26;
      const [x, z] = inside(p.x+Math.cos(a0)*(6+ring*1.6), p.z+Math.sin(a0)*(6+ring*1.6));
      if(world.spawnEnemy(t, x, z, {elite: false})) made++;
    });
  }else{
    const [cx, cz] = inside(p.x+fx/fl*7.5, p.z+fz/fl*7.5);
    types.forEach((t, i) => {
      const ring = Math.floor(Math.sqrt(i)), a0 = i*2.399, r = i ? .9+ring*.85 : 0;
      const [x, z] = inside(cx+Math.cos(a0)*r, cz+Math.sin(a0)*r);
      if(world.spawnEnemy(t, x, z, {elite: false})) made++;
    });
    world.event('portal', cx, cz, '', {radius: 2});
  }
  return made;
}
