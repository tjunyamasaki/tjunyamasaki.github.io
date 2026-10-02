// The two rare moons (night.mjs picks them; their rules live here).
//   gilded     The Gilded Moon. No raid. Gilded creatures, heavy with treasure, appear out in the dark and
//              run from you: catch them before dawn. Every kill tonight finds better things.
//   starrain   Star Rain. The usual waves come, fewer of them, but stars fall all night long: each impact
//              is telegraphed, hurts anything under it, and often leaves a piece of star behind.
// Pure simulation: import only content/progression/blasts. Never engine.mjs, a renderer or the DOM.

import {phaseOf} from './content.mjs?v=harvest-18';
import {rollLoot} from './progression.mjs?v=harvest-18';
import {addBlast} from './blasts.mjs?v=harvest-18';

/**
 * Gilded Moon: one comes every `every` seconds (on average) while fewer than `cap` + `perHuman` per
 * wanderer roam; they appear `near`-`far` from a wanderer, out of the fire's light, with `hp` times the
 * health and a fixed `speed` a little under a wanderer's. They notice you inside `flee` and run.
 * `luck` is added to every kill's loot luck tonight.
 */
export const GILDED = Object.freeze({every: 16, cap: 3, perHuman: 1, near: 16, far: 26, hp: 2.4, speed: 4.4, flee: 11, luck: .5,
  kinds: Object.freeze(['crawler', 'bonewalker', 'wraith', 'bogling', 'crawler'])});
/** Star Rain: a star falls near each wanderer every `every[0]`-`every[1]` seconds; `waves` scales the night's raid. */
export const STARRAIN = Object.freeze({every: [3.2, 5.6], fuse: 1.7, radius: 2.3, damage: 20, near: 5, waves: .6, camp: .35, shard: .55});

/** Host, every tick of a night under one of these moons. `scale`: the night's creature damage scale. */
export function stepMoon(world, dt, night){
  if(world.showcase || !world.ambient) return;
  if(night.moon === 'gilded') stepGilded(world, dt, night);
  else if(night.moon === 'starrain') stepStars(world, dt, night);
}

function stepGilded(world, dt, night){
  night.gild = (night.gild ?? GILDED.every*.4)-dt;
  if(night.gild > 0) return;
  night.gild = GILDED.every*(.6+world.spawnRng()*.8);
  const humans = world.players.filter(p => p.online && !p.down && !p.ghost);
  if(!humans.length) return;
  if(world.enemies.filter(e => e.gilded && e.hp > 0).length >= GILDED.cap+GILDED.perHuman*humans.length) return;
  const p = humans[Math.floor(world.spawnRng()*humans.length)], rng = world.spawnRng;
  for(let t = 0; t < 16; t++){
    const a = rng()*Math.PI*2, r = GILDED.near+rng()*(GILDED.far-GILDED.near), x = p.x+Math.cos(a)*r, z = p.z+Math.sin(a)*r;
    if(!world.walkable(x, z) || (typeof world.lit === 'function' && world.lit({x, z}))) continue;
    const type = GILDED.kinds[Math.floor(rng()*GILDED.kinds.length)];
    const e = world.spawnEnemy(type, x, z, {elite: false, tier: 1});
    if(!e) return;
    e.gilded = true; e.hp = e.maxHp = Math.round(e.maxHp*GILDED.hp);
    world.event('gilded', x, z, '', {});
    return;
  }
}

function stepStars(world, dt, night){
  const rng = world.spawnRng;
  for(const p of world.players){
    if(!p.online || p.down || p.ghost) continue;
    night.stars ||= {};
    let t = night.stars[p.id];
    if(!Number.isFinite(t)) t = STARRAIN.every[0]+rng()*(STARRAIN.every[1]-STARRAIN.every[0]);
    t -= dt;
    if(t <= 0){
      t = STARRAIN.every[0]+rng()*(STARRAIN.every[1]-STARRAIN.every[0]);
      const a = rng()*Math.PI*2, r = rng()*STARRAIN.near;
      let x = p.x+(p.vx || 0)*.8+Math.cos(a)*r, z = p.z+(p.vz || 0)*.8+Math.sin(a)*r;
      if(!world.walkable(x, z)){x = p.x; z = p.z;}
      const {scale} = world.mobScale(1);
      addBlast(world, {style: 'star', shape: 'circle', x, z, radius: STARRAIN.radius, fuse: STARRAIN.fuse, damage: Math.round(STARRAIN.damage*scale.damage), all: true, heavy: true, loot: 'star'});
    }
    night.stars[p.id] = t;
  }
}

/** A falling star landed (mobs.mjs detonate): often it leaves a piece of itself behind. */
export function starLoot(world, x, z){
  const rng = world.lootRng;
  if(rng() > STARRAIN.shard) return;
  const roll = rng();
  if(roll < .62) world.dropNew('shard', 1+Math.floor(rng()*2), x, z);
  else if(roll < .84) world.dropNew('ember', 1+Math.floor(rng()*2), x, z);
  else if(roll < .95) world.dropNew('ichor', 1, x, z);
  else world.spillLoot(rollLoot('fallenstar', rng, 0).filter(r => !['shard', 'ember', 'ore'].includes(r.itemId)).slice(0, 1), x, z, null);
}

/** Loot luck a kill gets from tonight's moon. */
export function moonLuck(world){return world?.night?.moon === 'gilded' && phaseOf(world) === 'night' ? GILDED.luck : 0;}

/** A gilded creature fell: its treasure. */
export function gildedLoot(world, e){
  const rolls = rollLoot('moonchest', world.lootRng, 1);
  rolls.push({itemId: 'ichor', count: 2+Math.floor(world.lootRng()*2)});
  if(world.lootRng() < .2) rolls.push({itemId: 'heartstone', count: 1});
  world.spillLoot(rolls, e.x, e.z, world.player(e.lastHitBy)?.name);
  world.event('gildfall', e.x, e.z, '', {});
}
