// Classes mode: the test ground for class-based progression (src/classes/registry.mjs). The arena's walled
// clearing and its endless waves, but no weapon cards: you choose a class, its weapon is yours for good,
// and every level is a talent point to spend in the class's tree. A few switches (levels, foes, waves,
// invulnerability, free skills, respec) make it quick to try any build. Solo or hosted; never saved.
// The World owns the fight; this module owns the mode's phases and its commands.
import {itemDefinition} from '../inventory.mjs?v=harvest-18';
import {aliveCap, arenaRoster, spawnPack, waveBudget, waveChampions} from '../arena.mjs?v=harvest-18';
import {isMagicAlly} from '../magic/registry.mjs?v=harvest-18';
import {MAX_LEVEL, maxHealth, pickWeighted, xpToNext} from '../progression.mjs?v=harvest-18';
import {CLASSES, castSkill, classOf, coolSkills, learn, respec, slotSkill} from './registry.mjs?v=harvest-18';
import './ronin.mjs?v=harvest-18';

export const CLASS_MODE = Object.freeze({
  countdown: 3,       // seconds between choosing (or a cleared wave) and the next wave
  cleared: 4,         // pause after a wave, to spend points
  heal: .35,          // share of max health restored after each wave
  spawnCounts: [5, 10, 20],
  toggles: ['god', 'hold', 'freeSkills'],
});

export function setupClasses(world){
  Object.assign(world.arena, {classes: true, phase: 'class', god: false, hold: false, freeSkills: false});
}
export const classesMode = world => !!world?.arena?.classes;
const hostiles = world => world.enemies.filter(e => e.hp > 0 && !isMagicAlly(e));

// ------------------------------------------------------------------ the class weapon
function dropWeapon(p, uid){
  if(p.equipment.weapon?.uid === uid){p.equipment.weapon = null; p.equipmentRevision++;}
  else{const i = p.inventory.slots.findIndex(s => s?.uid === uid); if(i >= 0){p.inventory.slots[i] = null; p.inventory.revision++;}}
}
/** The class's weapon, alone on the hotbar and in hand. */
function armClass(world, p, itemId){
  if(p.equipment?.weapon?.itemId === itemId) return true;
  world.syncHotbar(p);
  for(const uid of p.hotbar) if(uid) dropWeapon(p, uid);
  if(p.equipment.weapon) dropWeapon(p, p.equipment.weapon.uid);
  p.hotbar = p.hotbar.map(() => null);
  const def = itemDefinition(itemId), stack = def && world.mintStack(itemId, 1, def.maxDurability);
  const free = p.inventory.slots.indexOf(null);
  if(!stack || free < 0) return false;
  p.inventory.slots[free] = stack; p.inventory.revision++;
  p.hotbar[0] = stack.uid;
  world.selectHotbar(p, 0); world.syncHotbar(p); world.assertItems();
  return true;
}

export function chooseClass(world, p, classId){
  const def = CLASSES[classId];
  if(!def || !classesMode(world)) return {ok: false, code: 'rejected'};
  if(p.classId !== classId){
    Object.assign(p, {classId, talents: {}, classBar: [], classCd: {}, classGcd: 0, ki: 0, ronin: {}, kataMods: null});
  }
  if(!armClass(world, p, def.weapon)) return {ok: false, code: 'rejected'};
  def.sync?.(world, p);
  world.event('rankup', p.x, p.z, def.name, {player: p.id, itemId: def.weapon});
  return {ok: true, code: 'ok'};
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
  for(const p of people){
    p.hunger = 100; p.courage = 100;
    const held = p.equipment?.weapon;
    if(held) held.durability = itemDefinition(held.itemId)?.maxDurability ?? held.durability;
    const def = classOf(p);
    if(!def) continue;
    if(p.equipment?.weapon?.itemId !== def.weapon) armClass(world, p, def.weapon);
    if(!p.down && !p.ghost) def.step?.(world, p, dt);
    coolSkills(p, dt);
  }
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

/** Every command of the mode, from World.action. */
export function classAction(world, p, cmd){
  if(!classesMode(world) || !p) return {ok: false, code: 'unavailable'};
  if(cmd.type === 'classPick') return chooseClass(world, p, cmd.classId);
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
  if(cmd.type === 'classTest') return test(world, p, cmd);
  return {ok: false, code: 'unsupported'};
}
