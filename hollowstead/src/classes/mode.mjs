// Classed worlds: wherever wanderers grow by class instead of by weapon (src/classes/registry.mjs). Two of
// them so far, both flagged `world.classed`:
//   - the Classes test ground (`world.arena.classes`): the arena's walled clearing and endless waves, no
//     weapon cards, and a few switches (levels, foes, waves, invulnerability, free skills) to try any build;
//     solo, never saved;
//   - the Class Vigil (a Vigil with `classed`, vigil.mjs): the long save, played by class.
// In both, a wanderer chooses a class; its weapon is bound to them (`p.classWeapon`, the stack's uid: always
// in hand, never worn out, never swapped for another weapon) and every level is a talent point.
// The World owns the fight; this module owns the class rules every tick, the test ground's waves, and the
// class commands.
import {itemDefinition, planEquip} from '../inventory.mjs?v=harvest-18';
import {aliveCap, arenaRoster, spawnPack, waveBudget, waveChampions} from '../arena.mjs?v=harvest-18';
import {isMagicAlly} from '../magic/registry.mjs?v=harvest-18';
import {MAX_LEVEL, maxHealth, pickWeighted, xpToNext} from '../progression.mjs?v=harvest-18';
import {CLASSES, castSkill, classOf, coolSkills, learn, respec, slotSkill} from './registry.mjs?v=harvest-18';
import './ronin.mjs?v=harvest-18';
import './general.mjs?v=harvest-18';
import './daoshi.mjs?v=harvest-18';

export const CLASS_MODE = Object.freeze({
  countdown: 3,       // seconds between choosing (or a cleared wave) and the next wave
  cleared: 4,         // pause after a wave, to spend points
  heal: .35,          // share of max health restored after each wave
  spawnCounts: [5, 10, 20],
  toggles: ['god', 'hold', 'freeSkills'],
});

/** The Classes test ground: an arena world, classed. */
export function setupClasses(world){
  world.classed = true;
  Object.assign(world.arena, {classes: true, phase: 'class', god: false, hold: false, freeSkills: false});
}
export const classedWorld = world => !!world?.classed;
export const testGround = world => !!world?.arena?.classes;
const hostiles = world => world.enemies.filter(e => e.hp > 0 && !isMagicAlly(e));

// ------------------------------------------------------------------ the bound weapon
function locateStack(p, uid){
  if(!uid) return null;
  if(p.equipment?.weapon?.uid === uid) return {where: 'worn', stack: p.equipment.weapon};
  const i = (p.inventory?.slots || []).findIndex(s => s?.uid === uid);
  return i >= 0 ? {where: 'pack', index: i, stack: p.inventory.slots[i]} : null;
}
/** Take the bound weapon away for good (the class is given up). */
function unbind(world, p){
  const at = locateStack(p, p.classWeapon);
  if(at?.where === 'worn'){p.equipment.weapon = null; p.equipmentRevision++;}
  else if(at){p.inventory.slots[at.index] = null; p.inventory.revision++;}
  p.classWeapon = null;
  world.syncHotbar(p);
}
/**
 * The class's weapon in hand, every tick: re-equipped if something else was taken up, minted again if it
 * was lost, mended so it never breaks. Other weapons stay in the pack (to store, trade or salvage).
 */
export function bindWeapon(world, p, itemId){
  const def = itemDefinition(itemId);
  if(!def) return false;
  let at = locateStack(p, p.classWeapon);
  if(at && at.stack.itemId !== itemId){unbind(world, p); at = null;}
  if(!at){
    const stack = world.mintStack(itemId, 1, def.maxDurability);
    if(!stack) return false;
    const worn = p.equipment.weapon, free = p.inventory.slots.indexOf(null);
    if(worn){
      // Whatever was in hand goes to the pack, or to the ground when the pack is full.
      if(free >= 0){p.inventory.slots[free] = worn; p.inventory.revision++;}
      else world.placeDrop(worn, p.x, p.z);
    }
    p.equipment.weapon = stack; p.equipmentRevision++;
    p.classWeapon = stack.uid;
    world.syncHotbar(p); world.assertItems();
    return true;
  }
  if(at.where === 'pack'){
    const plan = planEquip({inventory: p.inventory, equipment: p.equipment, currentEquipmentRevision: p.equipmentRevision, uid: at.stack.uid, socket: 'weapon'});
    if(!plan.ok) return false;
    p.inventory.slots = plan.slots; p.inventory.revision = plan.inventoryRevision;
    p.equipment = plan.equipment; p.equipmentRevision = plan.equipmentRevision;
    world.syncHotbar(p); world.assertItems();
  }
  const held = p.equipment.weapon;
  if(held) held.durability = def.maxDurability ?? held.durability;
  return true;
}

/** Take up a class: a fresh tree, its weapon bound. Choosing the class you have keeps everything. */
export function chooseClass(world, p, classId){
  const def = Object.hasOwn(CLASSES, classId) ? CLASSES[classId] : null;
  if(!def || !classedWorld(world)) return {ok: false, code: 'rejected'};
  const old = classOf(p);
  if(old && old.id !== classId){
    old.clear?.(world, p); unbind(world, p);
    world.event('announce', p.x, p.z, `${p.name} walks a new path: ${def.name}`);
  }
  if(p.classId !== classId) Object.assign(p, {classId, talents: {}, classBar: [], classCd: {}, classGcd: 0, ki: 0});
  if(!bindWeapon(world, p, def.weapon)) return {ok: false, code: 'rejected'};
  def.sync?.(world, p);
  world.event('rankup', p.x, p.z, def.name, {player: p.id, itemId: def.weapon});
  return {ok: true, code: 'ok'};
}

/** Every tick in a classed world: each wanderer's bound weapon, class rules and recharges. */
export function stepClassPlayers(world, dt){
  if(!classedWorld(world)) return;
  for(const p of world.players){
    if(!p.online) continue;
    const def = classOf(p);
    if(!def) continue;
    bindWeapon(world, p, def.weapon);
    if(!p.down && !p.ghost) def.step?.(world, p, dt);
    coolSkills(p, dt);
  }
}

// ------------------------------------------------------------------ the waves
function announceWave(world){
  const a = world.arena, champs = waveChampions(a.wave);
  world.event('announce', 0, 0, champs.includes('king') ? `Wave ${a.wave} · The Hollow King` : champs.length ? `Wave ${a.wave} · Champions` : `Wave ${a.wave}`);
}
function nextWave(world, delay = CLASS_MODE.countdown){
  const a = world.arena;
  a.wave++; a.phase = 'countdown'; a.timer = delay; a.budget = 0;
  announceWave(world);
}
export function stepClasses(world, dt){
  const a = world.arena; if(!a?.classes) return;
  const people = world.players.filter(p => p.online);
  for(const p of people){p.hunger = 100; p.courage = 100;}
  if(a.phase === 'class'){
    if(people.length && people.every(p => classOf(p))) nextWave(world);
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
    if(a.budget <= 0 && alive === 0){
      a.phase = 'cleared'; a.timer = CLASS_MODE.cleared; a.best = Math.max(a.best || 0, a.wave); world.hostile = [];
      for(const p of people){
        if(p.down || p.ghost) world.revivePlayer(p);
        const top = p.maxHp || 100; p.hp = Math.min(top, p.hp+top*CLASS_MODE.heal);
      }
      world.event('announce', 0, 0, `Wave ${a.wave} cleared`);
    }
    return;
  }
  if(a.phase === 'cleared'){
    a.timer -= dt;
    // Holding the waves: the clearing stays quiet until you let the next one in (or spawn your own).
    if(a.timer <= 0 && !a.hold) nextWave(world);
  }
}

// ------------------------------------------------------------------ commands
function spawnFoes(world, p, count){
  const a = world.arena, roster = arenaRoster(Math.max(3, a.wave || 1)).filter(([id]) => id !== 'king'), types = [];
  const room = Math.max(0, 90-hostiles(world).length);
  for(let i = 0; i < Math.min(count, room); i++) types.push(pickWeighted(world.spawnRng, roster));
  let made = 0;
  while(types.length) made += spawnPack(world, types.splice(0, 4));
  return made;
}
function test(world, p, cmd){
  const a = world.arena, op = cmd.op;
  if(op === 'level'){
    const n = Math.max(-MAX_LEVEL, Math.min(MAX_LEVEL, Math.round(Number(cmd.n)) || 1));
    if(n > 0){for(let i = 0; i < n && (p.level || 1) < MAX_LEVEL; i++) world.awardXp(p, xpToNext(p.level || 1)-(p.xp || 0));}
    else{
      p.level = Math.max(1, (p.level || 1)+n); p.xp = 0; p.maxHp = maxHealth(p); p.hp = Math.min(p.hp, p.maxHp); respec(p);
      world.tell(p, `Level ${p.level} · points refunded`);
    }
    return {ok: true, code: 'ok'};
  }
  if(op === 'spawn') return spawnFoes(world, p, CLASS_MODE.spawnCounts.includes(cmd.n) ? cmd.n : 10) ? {ok: true, code: 'ok'} : {ok: false, code: 'rejected'};
  if(op === 'clear'){
    world.enemies = world.enemies.filter(e => isMagicAlly(e)); world.hostile = [];
    if(a.phase === 'fight') a.budget = 0;
    return {ok: true, code: 'ok'};
  }
  if(op === 'wave'){
    if(a.phase === 'class') return {ok: false, code: 'unavailable'};
    if(a.phase === 'fight'){world.enemies = world.enemies.filter(e => isMagicAlly(e)); a.budget = 0;}
    nextWave(world, 1.2);
    return {ok: true, code: 'ok'};
  }
  if(op === 'toggle' && CLASS_MODE.toggles.includes(cmd.key)){
    a[cmd.key] = !a[cmd.key];
    if(cmd.key === 'freeSkills' && a.freeSkills) for(const q of world.players) q.classCd = {};
    return {ok: true, code: 'ok'};
  }
  if(op === 'ki'){const def = classOf(p); if(!def) return {ok: false, code: 'rejected'}; p.ki = def.resource.max; return {ok: true, code: 'ok'};}
  return {ok: false, code: 'unsupported'};
}

/** How near a Heartfire a wanderer must stand to change class there. */
export const PATH_REACH = 4;
/** The Heartfire `hearthId` when it stands lit within reach of the wanderer, else null. */
export const pathHearth = (world, p, hearthId) => (typeof hearthId === 'string' && (world.buildings || []).find(b => b.id === hearthId && b.type === 'hearth' && b.hp > 0 && Math.hypot(b.x-p.x, b.z-p.z) < PATH_REACH)) || null;
/**
 * Why a wanderer cannot take up class `classId` now ('' when they can). On the test ground any class at
 * any time; elsewhere the first class is free, and a new one is taken up at a Heartfire (`hearthId`).
 */
export function classPickReason(world, p, classId, hearthId = null){
  if(!Object.hasOwn(CLASSES, classId || '')) return 'No such class';
  if(testGround(world) || !classOf(p) || p.classId === classId) return '';
  return pathHearth(world, p, hearthId) ? '' : 'Change your path at a Heartfire';
}

/** Every class command, from World.action. */
export function classAction(world, p, cmd){
  if(!classedWorld(world) || !p) return {ok: false, code: 'unavailable'};
  // On the test ground any class at any time; elsewhere a wanderer chooses once (classPickReason says when else).
  if(cmd.type === 'classPick'){
    const why = classPickReason(world, p, cmd.classId, cmd.hearth);
    if(why){world.tell(p, why); return {ok: false, code: 'rejected'};}
    return chooseClass(world, p, cmd.classId);
  }
  if(!classOf(p)) return {ok: false, code: 'unavailable'};
  if(cmd.type === 'classSkill') return castSkill(world, p, cmd.skill);
  if(cmd.type === 'classTalent'){
    if(cmd.op === 'learn'){
      const done = learn(p, cmd.node);
      if(done.ok){const node = classOf(p).nodes[cmd.node]; world.event('talent', p.x, p.z, `${node.name} ${p.talents[cmd.node]}/${node.max}`, {player: p.id, itemId: classOf(p).weapon, node: cmd.node});}
      return done;
    }
    if(cmd.op === 'respec') return respec(p);
    if(cmd.op === 'slot') return slotSkill(p, cmd.skill, cmd.slot);
    return {ok: false, code: 'unsupported'};
  }
  if(cmd.type === 'classTest') return testGround(world) ? test(world, p, cmd) : {ok: false, code: 'unavailable'};
  return {ok: false, code: 'unsupported'};
}
