// The yokai of the Shrine of Yomi (a Vigil land, worldgen.mjs LANDS.yomi), beyond its lantern ghosts and
// hopping corpses. Each one has a pattern no other creature has, telegraphed the house way: a wind-up on the
// creature (ATTACKS shape), then blasts on the ground (blasts.mjs) that a timed dodge passes through.
//
//   kasa        Kasa-obake, the one-legged umbrella. A harrier: it skips at you in a zigzag of three splashing
//               landings, one a beat after the other, and comes down past you. Elite: four landings and a
//               wider last splash.
//   rokurokubi  The long-necked woman. A lane-denier who hangs back behind the pack: her neck shoots straight
//               across the ground, then whips back aslant a beat later. Elite: it whips back both ways.
//   yukionna    The snow woman. A controller: she breathes a cross of frost over you, then its diagonals.
//               Frost chills: a wanderer it catches walks slower for a while (CHILL). Elite: a ring of frost
//               closes the dance.
//   daoshi      A fallen Taoist priest. A commander: he pins three talismans round you, they burn a triangle
//               between them, and then the seal inside goes off (stand in, then step out). His bell rouses the
//               jiangshi near him (faster, ready to leap) and raises a corpse when too few are near.
//
// mobs.mjs merges YOKAI_ATTACKS and YOKAI_MOVES into its own tables, calls yokaiRelease() when a wind-up
// ends and yokaiTick() every tick before a creature moves. Host-only fields: e.hop (a kasa mid-skip),
// e.rouse (world time a roused jiangshi stays quick), e.raiser (the daoshi who raised a corpse).
// p.chill is the world time a chilled wanderer warms again (saved and sent with the wanderer).
// Pure simulation: import only content/blasts. Never engine.mjs, a renderer or the DOM.

import {ENEMIES} from './content.mjs?v=harvest-18';
import {addBlast} from './blasts.mjs?v=harvest-18';

const TAU = Math.PI*2;

/** Wind-ups (merged into mobs.mjs ATTACKS). Damage multipliers apply to ENEMIES[type].damage. */
export const YOKAI_ATTACKS = Object.freeze({
  skip:  {shape: 'line', windup: .5, trigger: 6.2, min: 1.4, length: 6.6, width: 1.2, hops: 3, step: 2.2, swing: 1, splash: 1.15, beat: .34, fuse: .42, dmg: 1},
  neck:  {shape: 'line', windup: .78, trigger: 11.5, length: 11, width: 1.05, whip: .44, dmg: 1},
  frost: {shape: 'ring', windup: .85, trigger: 10.5, radius: 1.3, arm: 3.8, width: 1.05, dmg: .85},
  seal:  {shape: 'ring', windup: .9, trigger: 10, radius: 1.2, spread: 2.6, dmg: 1},
  bell:  {shape: 'ring', windup: 1.05, trigger: 12, radius: 3, rouse: 10, dmg: 0},
});

/** Movement (merged into mobs.mjs MOVES). `keep` holds a distance, `rotate` cycles the attack list. */
export const YOKAI_MOVES = Object.freeze({
  kasa:       {body: .45, accel: 18, flank: 80, retreat: .6, attacks: ['skip', 'bite']},
  rokurokubi: {body: .5, accel: 7, keep: 7.5, orbit: .3, attacks: ['neck', 'swipe']},
  yukionna:   {body: .48, accel: 6, keep: 6.5, orbit: .6, attacks: ['frost']},
  daoshi:     {body: .52, accel: 7, keep: 7, orbit: .35, rotate: true, attacks: ['seal', 'bell', 'seal']},
});

/** Frost's bite: a chilled wanderer walks at `speed` of their pace for `secs` (World.speedFactor). */
export const CHILL = Object.freeze({speed: .62, secs: 2.4});
/** The daoshi's bell: roused jiangshi run `speed` times as fast for `secs`; he raises one when fewer than `want` are near, `most` at a time. */
export const ROUSE = Object.freeze({speed: 1.35, secs: 6, want: 2, most: 2});

/** Walk-speed factor from frost (World.speedFactor). */
export const chillSpeed = (world, p) => p?.chill > (world?.time ?? 0) ? CHILL.speed : 1;
/** Run-speed factor of a roused jiangshi (mobs.mjs). */
export const rouseSpeed = (world, e) => e?.rouse > (world?.time ?? 0) ? ROUSE.speed : 1;

const people = world => world.players.filter(p => p && p.online && !p.down && !p.ghost && p.hp > 0);
const ground = (world, x, z) => typeof world.walkable !== 'function' || world.walkable(x, z);

/**
 * Every tick, before the creature moves. Returns true when it already moved this tick (a kasa mid-skip):
 * mobs.mjs then leaves it alone.
 */
export function yokaiTick(world, e, dt){
  const hop = e.hop;
  if(!hop) return false;
  hop.t += dt;
  // First landing after `lead`, each next one a `beat` later: glide from landing to landing.
  const {pts, lead, beat} = hop;
  let i = hop.t < lead ? 0 : Math.min(pts.length-1, 1+Math.floor((hop.t-lead)/beat));
  const from = i === 0 ? hop.from : pts[i-1], to = pts[i];
  const span = i === 0 ? lead : beat, start = i === 0 ? 0 : lead+(i-1)*beat;
  const k = Math.max(0, Math.min(1, (hop.t-start)/span));
  const x = from[0]+(to[0]-from[0])*k, z = from[1]+(to[1]-from[1])*k;
  e.vx = (x-e.x)/Math.max(dt, 1e-3); e.vz = (z-e.z)/Math.max(dt, 1e-3);
  e.x = x; e.z = z; e.face = to[0] < from[0] ? -1 : 1;
  if(hop.t >= lead+(pts.length-1)*beat){e.hop = null; e.vx = e.vz = 0;}
  return true;
}

/**
 * Called by mobs.release when a yokai's wind-up ends. `amount` is this attack's damage (power and the
 * attack's multiplier included). Returns true when handled.
 */
export function yokaiRelease(world, e, id, target, amount){
  const spec = YOKAI_ATTACKS[id]; if(!spec) return false;
  const rng = world.mobRng || Math.random, elite = !!e.elite, dmg = Math.round(amount);
  switch(id){
    case 'skip': {
      // A zigzag of landings toward (and past) the prey, each splash a beat after the last.
      const hops = spec.hops+(elite ? 1 : 0), ca = Math.cos(e.ang), sa = Math.sin(e.ang), side = (e.flank || 1) > 0 ? 1 : -1;
      const pts = [];
      let lx = e.x, lz = e.z;
      for(let i = 1; i <= hops; i++){
        const off = (i%2 ? 1 : -1)*side*spec.swing*(i === hops ? .4 : 1);
        const x = e.x+ca*spec.step*i-sa*off, z = e.z+sa*spec.step*i+ca*off;
        if(!ground(world, x, z)) break;
        pts.push([x, z]); lx = x; lz = z;
      }
      if(!pts.length) return true;
      pts.forEach(([x, z], i) => {
        const last = i === pts.length-1, r = spec.splash*(last && elite ? 1.6 : 1);
        addBlast(world, {style: 'rain', shape: 'circle', x, z, radius: r, fuse: spec.fuse, delay: i*spec.beat, damage: dmg, owner: e.id, push: last ? .7 : 0});
      });
      e.hop = {from: [e.x, e.z], pts, t: 0, lead: spec.fuse, beat: spec.beat};
      world.event('skip', lx, lz, '', {mob: e.type});
      return true;
    }
    case 'neck': {
      // Straight out along the line the wind-up drew, then a whip back aslant: dodge across, then stay out.
      const side = rng() < .5 ? -1 : 1;
      addBlast(world, {style: 'neck', shape: 'line', x: e.x, z: e.z, angle: e.ang, length: spec.length, width: spec.width, fuse: .22, damage: dmg, owner: e.id});
      for(const s of elite ? [-1, 1] : [side]) addBlast(world, {style: 'neck', shape: 'line', x: e.x, z: e.z, angle: e.ang+s*spec.whip, length: spec.length*.85, width: spec.width, fuse: .62, delay: .3, damage: Math.round(amount*.8), owner: e.id, push: .6});
      world.event('neck', e.x, e.z, '', {angle: e.ang, length: spec.length});
      return true;
    }
    case 'frost': {
      // A cross of frost over the prey, then the other cross: the safe ground moves between beats.
      const cx = target.x+(target.vx || 0)*.25, cz = target.z+(target.vz || 0)*.25, base = e.ang, arm = spec.arm*(elite ? 1.2 : 1);
      const bar = (a, delay, fuse) => addBlast(world, {style: 'frost', shape: 'line', x: cx-Math.cos(a)*arm, z: cz-Math.sin(a)*arm, angle: a, length: arm*2, width: spec.width, fuse, delay, damage: dmg, owner: e.id, chill: CHILL.secs});
      bar(base, 0, .75); bar(base+Math.PI/2, 0, .75);
      bar(base+Math.PI/4, .7, .6); bar(base-Math.PI/4, .7, .6);
      if(elite) addBlast(world, {style: 'frost', shape: 'ring', x: cx, z: cz, radius: arm+.6, inner: arm-1.2, fuse: .7, delay: 1.35, damage: dmg, owner: e.id, chill: CHILL.secs});
      return true;
    }
    case 'seal': {
      // Three talismans round the prey, the triangle between them burns, then the seal inside it: in, then out.
      const cx = target.x, cz = target.z, R = spec.spread*(elite ? 1.2 : 1), a0 = rng()*TAU;
      const pts = [0, 1, 2].map(k => [cx+Math.cos(a0+k*TAU/3)*R, cz+Math.sin(a0+k*TAU/3)*R]);
      for(const [x, z] of pts) addBlast(world, {style: 'ofuda', shape: 'circle', x, z, radius: .8, fuse: .5, damage: dmg, owner: e.id});
      for(let k = 0; k < 3; k++){
        const [ax, az] = pts[k], [bx, bz] = pts[(k+1)%3];
        addBlast(world, {style: 'ofuda', shape: 'line', x: ax, z: az, angle: Math.atan2(bz-az, bx-ax), length: Math.hypot(bx-ax, bz-az), width: .85, fuse: .5, delay: .45, damage: dmg, owner: e.id});
      }
      addBlast(world, {style: 'ofuda', shape: 'circle', x: cx, z: cz, radius: R*.62, fuse: .55, delay: 1.1, damage: Math.round(amount*1.2), owner: e.id, push: 1, heavy: true});
      world.event('seal', cx, cz, '', {radius: R});
      return true;
    }
    case 'bell': {
      // Rouse the dead near him; raise one more when too few walk with him.
      const near = world.enemies.filter(m => m.type === 'jiangshi' && m.hp > 0 && Math.hypot(m.x-e.x, m.z-e.z) < spec.rouse);
      for(const m of near){m.rouse = world.time+ROUSE.secs; m.cooldown = Math.min(m.cooldown || 0, .15); m.slowed = 0;}
      const raised = world.enemies.filter(m => m.raiser === e.id && m.hp > 0).length;
      const want = Math.min(ROUSE.want-near.length+(elite ? 1 : 0), ROUSE.most+(elite ? 1 : 0)-raised);
      for(let i = 0; i < want; i++){
        const a = e.ang+Math.PI+(i-.5)*.9, x = e.x+Math.cos(a)*2.2, z = e.z+Math.sin(a)*2.2;
        const m = world.spawnEnemy('jiangshi', x, z, {elite: false, minion: true});
        if(m){m.raiser = e.id; m.rouse = world.time+ROUSE.secs; m.cooldown = .6; if(e.raid) m.raid = true; if(e.home){m.home = {x: e.home.x, z: e.home.z}; m.leash = (e.leash || 12)+4; m.aggro = true;}}
      }
      world.event('bell', e.x, e.z, '', {radius: spec.rouse, roused: near.length});
      return true;
    }
  }
  return false;
}

/** Yokai ids (for lists that should know them: the lab, tests). */
export const YOKAI = Object.freeze(Object.keys(YOKAI_MOVES).filter(id => ENEMIES[id]));
