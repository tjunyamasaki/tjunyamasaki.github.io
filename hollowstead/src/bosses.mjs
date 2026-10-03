// The two great bosses, and what they leave behind.
//
//   Mother Briar     (briarmother) sleeps on the Briar Throne, her walled lair on the wild edge (areas.mjs).
//                    The briarlings are her children. Roots tear toward you in lines, thorns fly in rings,
//                    the ground snares where you stand; at half health she calls her brood, and at the end
//                    she blooms: a ring of thorns that spares only those who stand close.
//   The Unblinking   (unblinking) waits on the last floor of a delve (delve.mjs). A beam that follows its
//                    gaze, a gaze that sweeps the chamber, tendrils from below, wraiths; at the end it
//                    collapses the dark around itself in rings you must dodge through.
//
// mobs.mjs moves them like any creature (MOVES below) and calls bossRelease() for their attacks and
// bossTick() every tick. Every attack is telegraphed: the wind-up on the boss (ATTACKS shape) and then
// blasts on the ground (blasts.mjs) that go off a beat later. A timed dodge passes through all of it.
// Pure simulation: import only content/progression/blasts. Never engine.mjs, a renderer or the DOM.

import {ENEMIES} from './content.mjs?v=harvest-18';
import {addBlast} from './blasts.mjs?v=harvest-18';

const TAU = Math.PI*2, SS = 1.15;

/** Their telegraphed wind-ups (merged into mobs.mjs ATTACKS). Damage multipliers apply to ENEMIES[type].damage. */
export const BOSS_ATTACKS = Object.freeze({
  // Mother Briar
  briarSweep:  {shape: 'cone', windup: .9, trigger: 4.2, radius: 4.8, arc: 150, push: 1.6, dmg: 1},
  briarRoots:  {shape: 'ring', windup: .7, trigger: 16, radius: 2.2, dmg: .7},
  briarThorns: {shape: 'ring', windup: .8, trigger: 14, radius: 2.6, shots: 18, speed: 5.2*SS, life: 3.6, dmg: .32},
  briarSnare:  {shape: 'ring', windup: .55, trigger: 15, radius: 1.8, dmg: .6},
  briarBrood:  {shape: 'ring', windup: 1, trigger: 18, radius: 3, summon: 5, dmg: 0},
  briarBloom:  {shape: 'ring', windup: 1.1, trigger: 14, radius: 3, dmg: .9},
  // The Unblinking
  eyeBeam:     {shape: 'line', windup: 1.05, trigger: 15, length: 17, width: 1.7, dmg: 1.1},
  eyeSweep:    {shape: 'ring', windup: .85, trigger: 14, radius: 2.4, dmg: .75},
  eyeNova:     {shape: 'ring', windup: .8, trigger: 14, radius: 2, shots: 20, speed: 4.4*SS, life: 4.4, dmg: .34},
  eyeGrasp:    {shape: 'ring', windup: .6, trigger: 16, radius: 1.8, dmg: .6},
  eyeSpawn:    {shape: 'ring', windup: 1, trigger: 18, radius: 3, summon: 3, dmg: 0},
  eyeCollapse: {shape: 'ring', windup: 1.2, trigger: 14, radius: 3, dmg: .8},
});

/**
 * Movement and rotation. `phases[n]` is the attack cycle once the boss drops below `at[n]` of its health
 * (phase 1 is full health). `keep` holds a distance (the eye hangs back and stares).
 */
export const BOSS_MOVES = Object.freeze({
  briarmother: {body: 1.8, accel: 3, rotate: true, attacks: ['briarSweep', 'briarRoots', 'briarThorns', 'briarSnare'],
    at: [1, .6, .3],
    phases: [['briarSweep', 'briarRoots', 'briarThorns', 'briarSnare'],
      ['briarRoots', 'briarSweep', 'briarThorns', 'briarSnare', 'briarRoots', 'briarBrood'],
      ['briarBloom', 'briarRoots', 'briarSweep', 'briarThorns', 'briarSnare', 'briarBloom', 'briarBrood']]},
  unblinking: {body: 1.9, accel: 2.2, rotate: true, keep: 6.5, orbit: .25, attacks: ['eyeBeam', 'eyeGrasp', 'eyeNova', 'eyeSweep'],
    at: [1, .55, .25],
    phases: [['eyeBeam', 'eyeGrasp', 'eyeNova', 'eyeSweep'],
      ['eyeSweep', 'eyeBeam', 'eyeGrasp', 'eyeSpawn', 'eyeNova', 'eyeBeam'],
      ['eyeCollapse', 'eyeBeam', 'eyeSweep', 'eyeGrasp', 'eyeCollapse', 'eyeNova', 'eyeSpawn']]},
});

const people = world => world.players.filter(p => p && p.online && !p.down && !p.ghost && p.hp > 0);
function fire(world, e, kind, angle, speed, radius, damage, life){
  const list = world.hostile ||= [];
  if(list.length > 240) return;
  list.push({id: world.nextId('h'), kind, x: e.x+Math.cos(angle)*1.2, z: e.z+Math.sin(angle)*1.2, vx: Math.cos(angle)*speed, vz: Math.sin(angle)*speed, r: radius, dmg: damage, life, age: 0, owner: e.id});
}
function summon(world, e, type, count, radius){
  const minions = world.enemies.filter(m => m.minion && m.hp > 0).length;
  for(let i = 0; i < Math.min(count, 12-minions); i++){
    const a = i/count*TAU+e.ang;
    const m = world.spawnEnemy(type, e.x+Math.cos(a)*radius, e.z+Math.sin(a)*radius, {elite: false, minion: true});
    if(m){m.cooldown = .8+(world.mobRng || Math.random)()*.6; if(e.home){m.home = {x: e.home.x, z: e.home.z}; m.leash = (e.leash || 12)+4; m.aggro = true;}}
  }
  world.event('summon', e.x, e.z, '', {kind: type, radius});
}
/** The boss's current phase from its health (1, 2, 3). */
export function phaseOf(e){
  const at = BOSS_MOVES[e.type]?.at || [1];
  const left = e.hp/Math.max(1, e.maxHp);
  let phase = 1;
  for(let i = 1; i < at.length; i++) if(left < at[i]) phase = i+1;
  return phase;
}

/** Every tick, before it moves: phase changes. */
export function bossTick(world, e, dt){
  if(!BOSS_MOVES[e.type]) return;
  const phase = phaseOf(e);
  if(!(e.phase >= 1)){e.phase = phase; return;}
  if(phase > e.phase){
    e.phase = phase;
    e.cooldown = Math.min(e.cooldown, .4); e.pat = 0;
    world.event('bossphase', e.x, e.z, '', {boss: e.type, phase});
    if(e.type === 'briarmother'){
      world.event('announce', e.x, e.z, phase === 2 ? 'Mother Briar shrieks for her children!' : 'Mother Briar blooms. Stand close, or be torn.');
      summon(world, e, 'crawler', phase === 2 ? 6 : 4, 3);
    }else if(e.type === 'unblinking'){
      world.event('announce', e.x, e.z, phase === 2 ? 'The Unblinking looks at all of you at once.' : 'The dark folds in around the eye.');
      summon(world, e, 'wraith', 3, 3.5);
    }
  }
}

/**
 * Called by mobs.release for a boss attack. `amount` is the boss's damage for this attack (power and
 * the attack's multiplier included). Returns true when handled.
 */
export function bossRelease(world, e, id, target, amount){
  const spec = BOSS_ATTACKS[id]; if(!spec) return false;
  const phase = e.phase || 1, foes = people(world), rng = world.mobRng || Math.random;
  const near = foes.filter(p => Math.hypot(p.x-e.x, p.z-e.z) < 24);
  switch(id){
    case 'briarSweep': {
      // The telegraphed cone lands at once (mobs.strikeArea did the hit); a ridge of thorns follows it out.
      for(let k = -1; k <= 1; k++) addBlast(world, {style: 'thorn', shape: 'line', x: e.x, z: e.z, angle: e.ang+k*.45, length: 7.5, width: 1.1, fuse: .5, delay: .15, damage: Math.round(amount*.45), owner: e.id});
      return 'strike';
    }
    case 'briarRoots': {
      const fan = phase >= 3 ? [-.32, 0, .32] : phase === 2 ? [-.2, .2] : [0];
      for(const p of near.length ? near : [target]){
        const base = Math.atan2(p.z-e.z, p.x-e.x), len = Math.min(20, Math.hypot(p.x-e.x, p.z-e.z)+5);
        for(const off of fan) addBlast(world, {style: 'root', shape: 'line', x: e.x, z: e.z, angle: base+off, length: len, width: 1.35, fuse: .85, damage: Math.round(amount), owner: e.id, push: .8});
      }
      world.event('bossroar', e.x, e.z, '', {boss: e.type, kind: 'roots'});
      return true;
    }
    case 'briarThorns': {
      const rings = phase >= 2 ? 2 : 1;
      for(let ring = 0; ring < rings; ring++) for(let i = 0; i < spec.shots; i++) fire(world, e, 'thorn', (i+ring*.5)/spec.shots*TAU+e.ang*.3, spec.speed*(ring ? .75 : 1), .34, Math.round(amount), spec.life);
      return true;
    }
    case 'briarSnare': {
      for(const p of near.length ? near : [target]){
        addBlast(world, {style: 'snare', shape: 'circle', x: p.x, z: p.z, radius: 1.9, fuse: 1, damage: Math.round(amount), owner: e.id});
        if(phase >= 2) addBlast(world, {style: 'snare', shape: 'circle', x: p.x+(p.vx || 0)*1.2, z: p.z+(p.vz || 0)*1.2, radius: 1.6, fuse: .9, delay: .8, damage: Math.round(amount), owner: e.id});
      }
      return true;
    }
    case 'briarBrood': summon(world, e, 'crawler', spec.summon+(phase >= 3 ? 1 : 0), 3); return true;
    case 'briarBloom': {
      // Torn ground everywhere but close to her, then her own patch a beat later: in, then out.
      addBlast(world, {style: 'thorn', shape: 'ring', x: e.x, z: e.z, radius: 10, inner: 3.3, fuse: 1.15, damage: Math.round(amount), owner: e.id, heavy: true});
      addBlast(world, {style: 'thorn', shape: 'circle', x: e.x, z: e.z, radius: 3.6, fuse: .85, delay: 1.25, damage: Math.round(amount*.9), owner: e.id, push: 1.4});
      world.event('bossroar', e.x, e.z, '', {boss: e.type, kind: 'bloom'});
      return true;
    }
    case 'eyeBeam': {
      // The wind-up drew the line; the beam burns along it now, and in phase 2+ two side beams a beat later.
      const len = spec.length, w = spec.width;
      addBlast(world, {style: 'gaze', shape: 'line', x: e.x, z: e.z, angle: e.ang, length: len, width: w, fuse: .08, damage: Math.round(amount), owner: e.id});
      if(phase >= 2) for(const off of [-.5, .5]) addBlast(world, {style: 'gaze', shape: 'line', x: e.x, z: e.z, angle: e.ang+off, length: len, width: w*.85, fuse: .7, delay: .1, damage: Math.round(amount*.8), owner: e.id});
      return true;
    }
    case 'eyeSweep': {
      const full = phase >= 2, steps = full ? 16 : 8, span = full ? TAU : 2.2, dir = rng() < .5 ? -1 : 1;
      const start = e.ang-dir*span/2;
      for(let i = 0; i < steps; i++) addBlast(world, {style: 'gaze', shape: 'line', x: e.x, z: e.z, angle: start+dir*span*i/steps, length: 15, width: 1.25, fuse: .55, delay: i*.16, damage: Math.round(amount), owner: e.id});
      world.event('bossroar', e.x, e.z, '', {boss: e.type, kind: 'sweep'});
      return true;
    }
    case 'eyeNova': {
      const rings = phase >= 3 ? 3 : 2;
      for(let ring = 0; ring < rings; ring++) for(let i = 0; i < spec.shots; i++) fire(world, e, 'void', (i+ring*.5)/spec.shots*TAU, spec.speed*(1-ring*.18), .38, Math.round(amount), spec.life);
      return true;
    }
    case 'eyeGrasp': {
      for(const p of near.length ? near : [target]){
        addBlast(world, {style: 'tendril', shape: 'circle', x: p.x, z: p.z, radius: 1.7, fuse: .95, damage: Math.round(amount), owner: e.id});
        for(let k = 0; k < (phase >= 2 ? 3 : 2); k++){const a = rng()*TAU, r = 2+rng()*3; addBlast(world, {style: 'tendril', shape: 'circle', x: p.x+Math.cos(a)*r, z: p.z+Math.sin(a)*r, radius: 1.5, fuse: .95, delay: .2+k*.18, damage: Math.round(amount), owner: e.id});}
      }
      return true;
    }
    case 'eyeSpawn': summon(world, e, 'wraith', spec.summon, 3.5); return true;
    case 'eyeCollapse': {
      // Rings close in from far out: dodge through each as it lands, or stand where the gaps fall.
      for(let i = 0; i < 4; i++){const r = 13-i*3; addBlast(world, {style: 'void', shape: 'ring', x: e.x, z: e.z, radius: r, inner: r-1.6, fuse: .9, delay: i*.42, damage: Math.round(amount), owner: e.id});}
      world.event('bossroar', e.x, e.z, '', {boss: e.type, kind: 'collapse'});
      return true;
    }
  }
  return false;
}

/**
 * What a boss leaves. The first time each falls it always drops its own weapon (Thornmother's Heart,
 * the Eye of the Deep); after that a third of the time. Always a legendary and an epic roll, heartstones,
 * a hoard of Dread ichor, its area's finds and three Dread sigils (they ascend weapons, mastery.mjs).
 */
export const BOSS_LOOT = Object.freeze({
  briarmother: {weapon: 'thornheart', again: .33, extra: [['emberglass', 6], ['rime', 6], ['ember', 10], ['sigil', 3]]},
  unblinking: {weapon: 'deepeye', again: .33, extra: [['shard', 8], ['ember', 12], ['sigil', 3]]},
});
export function bossLoot(world, e, times){
  const spec = BOSS_LOOT[e.type]; if(!spec) return;
  const rng = world.lootRng, rolls = [];
  if(times <= 1 || rng() < spec.again) rolls.push({itemId: spec.weapon, count: 1});
  for(const r of world.roll('king', 1.2)) rolls.push(r);
  rolls.push({itemId: 'heartstone', count: 1});
  for(const [itemId, count] of spec.extra) rolls.push({itemId, count});
  world.spillLoot(rolls, e.x, e.z, world.player(e.lastHitBy)?.name);
  world.event('announce', e.x, e.z, e.type === 'briarmother' ? 'Mother Briar withers. Her heart rolls free of the thorns.' : 'The eye closes. The deep is quiet.');
}

export const isBoss = e => !!ENEMIES[e?.type]?.boss;
